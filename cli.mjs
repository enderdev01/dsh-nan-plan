#!/usr/bin/env node
/**
 * Consulta rápida del plan NaN sin pasar por la interfaz.
 *
 *   node cli.mjs [--quota 3000000000] [--month 2026-11]
 *
 * Toma la clave de NAN_API_KEY si está en el entorno; si no, la lee del
 * almacén de credenciales del harness (~/.dsh/.credentials.yaml).
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const quota = Number(flag('quota', '3000000000'))
const month = flag('month', new Date().toISOString().slice(0, 7))

function readStoredKey() {
  try {
    const text = readFileSync(join(homedir(), '.dsh/.credentials.yaml'), 'utf8')
    const line = text.split('\n').find((row) => row.includes('NAN_API_KEY:'))
    return line ? line.replace(/^\s*NAN_API_KEY:\s*/, '').trim() : undefined
  } catch {
    return undefined
  }
}

const key = process.env.NAN_API_KEY || readStoredKey()
if (!key) {
  console.error('No hay NAN_API_KEY en el entorno ni en ~/.dsh/.credentials.yaml')
  process.exit(1)
}

const [year, monthNumber] = month.split('-').map(Number)
const lastDay = new Date(year, monthNumber, 0).getDate()
const start = `${month}-01`
const end = `${month}-${String(lastDay).padStart(2, '0')}`

const response = await fetch(
  `https://api.nan.builders/v1/usage?start_date=${start}&end_date=${end}`,
  { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
)
if (!response.ok) {
  console.error(`La API respondió ${response.status}`)
  process.exit(1)
}

const report = await response.json()
const used = Number(report?.totals?.total_tokens ?? 0)
const remaining = Math.max(quota - used, 0)
const pct = quota > 0 ? (remaining / quota) * 100 : 0

const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 0 })
console.log(`periodo   ${report.start_date} → ${report.end_date}`)
console.log(`usado     ${nf.format(used)} tokens (${nf.format(report.totals.api_requests)} peticiones)`)
console.log(`cuota     ${nf.format(quota)}`)
console.log(`restante  ${nf.format(remaining)}  (${pct.toFixed(2)} %)`)
