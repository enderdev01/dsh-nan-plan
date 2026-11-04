/**
 * Host half of the NaN plan bundle.
 *
 * Reads the remaining token allowance of the configured NaN inference plan and
 * serves it to the Web UI on a same-origin route. The API key is resolved from
 * the harness credential store on every refresh, so rotating NAN_API_KEY takes
 * effect without a restart and the value never reaches the browser.
 */

const DEFAULT_BASE_URL = 'https://api.nan.builders'
const DEFAULT_REFRESH_MS = 60_000
const ROUTE_PATH = '/nan-plan/usage'

/**
 * Plan presets: euros per month, and the token allowance each one grants.
 * NaN does not publish these through the API, so they are values the user can
 * correct here or override with `quotaTokens`.
 */
const PLAN_PRESETS = {
  20: { label: 'NaN 20 €', quotaTokens: 1_000_000_000 },
  75: { label: 'NaN 75 €', quotaTokens: 3_000_000_000 },
  200: { label: 'NaN 200 €', quotaTokens: 3_000_000_000 },
}
const DEFAULT_PLAN = '20'

/** Host services this plugin cannot work without. */
export const inject = ['credentials', 'webServer']

/**
 * Two-digit month or day.
 * @param {number} value
 * @returns {string}
 */
function pad(value) {
  return String(value).padStart(2, '0')
}

/**
 * The window the plan counter covers: the calendar month so far.
 *
 * NaN's API exposes consumption only — no quota and no billing date — so the
 * window is the month to date and the UI never claims a cutoff it cannot know.
 *
 * @returns {{ start: string, end: string }}
 */
function currentMonthRange() {
  const today = new Date()
  const year = today.getFullYear()
  const month = pad(today.getMonth() + 1)
  return { start: `${year}-${month}-01`, end: `${year}-${month}-${pad(today.getDate())}` }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config]
 */
export function apply(ctx, config = {}) {
  const planId = String(config.plan ?? DEFAULT_PLAN)
  const preset = PLAN_PRESETS[planId]
  const quotaTokens =
    Number(config.quotaTokens) > 0
      ? Number(config.quotaTokens)
      : (preset?.quotaTokens ?? PLAN_PRESETS[DEFAULT_PLAN].quotaTokens)
  const planLabel = String(config.planName || preset?.label || 'NaN')
  const apiKeyRef =
    typeof config.apiKeyRef === 'string' && config.apiKeyRef ? config.apiKeyRef : 'NAN_API_KEY'
  const baseUrl = String(config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const refreshMs = Number(config.refreshMs) >= 0 ? Number(config.refreshMs) : DEFAULT_REFRESH_MS

  /** @type {{ at: number, value: object } | undefined} */
  let cache
  /** @type {Promise<object> | undefined} */
  let pending

  async function readPlan() {
    const key = await ctx.credentials.resolve(apiKeyRef)
    if (!key || !key.value) {
      throw new Error(`No hay credencial ${apiKeyRef} configurada.`)
    }

    const period = currentMonthRange()
    const url = `${baseUrl}/v1/usage?start_date=${period.start}&end_date=${period.end}`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key.value}`, Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`La API de NaN respondió ${response.status}.`)
    }

    const report = await response.json()
    const totals = report?.totals ?? {}
    const used = Number(totals.total_tokens ?? 0)
    const remaining = Math.max(quotaTokens - used, 0)

    return {
      ok: true,
      plan: planLabel,
      planId,
      period,
      quotaTokens,
      usedTokens: used,
      remainingTokens: remaining,
      remainingRatio: quotaTokens > 0 ? remaining / quotaTokens : 0,
      requests: Number(totals.api_requests ?? 0),
      byModel: Array.isArray(totals.by_model)
        ? totals.by_model.map((row) => ({
            model: String(row.model ?? ''),
            tokens: Number(row.total_tokens ?? 0),
          }))
        : [],
      fetchedAt: new Date().toISOString(),
    }
  }

  async function planSnapshot() {
    if (cache && Date.now() - cache.at < refreshMs) return cache.value
    if (pending) return pending
    pending = readPlan()
    try {
      const value = await pending
      cache = { at: Date.now(), value }
      return value
    } finally {
      pending = undefined
    }
  }

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      async handler(req, res) {
        const send = (status, body) => {
          res.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify(body))
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          send(405, { ok: false, error: 'Método no permitido.' })
          return
        }

        const origin = req.headers.origin
        if (origin) {
          let expected
          try {
            expected = ctx.webServer.getOrigin()
          } catch {
            expected = undefined
          }
          if (expected && origin !== expected) {
            send(403, { ok: false, error: 'Origen no permitido.' })
            return
          }
        }

        try {
          send(200, await planSnapshot())
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          ctx.logger?.warn?.(`[nan-plan] ${message}`)
          send(502, { ok: false, error: message })
        }
      },
    }),
  )
}
