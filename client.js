window.__ModuleLoader__.load({
  id: '@local/nan-plan',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const POLL_MS = 120_000

    const compact = new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 2,
    })
    const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
    const plain = new Intl.NumberFormat(undefined)

    const token = (name) => `color-mix(in srgb, currentColor ${name}, transparent)`

    function formatTokens(value) {
      return compact.format(Number(value) || 0)
    }

    function Row({ label, value }) {
      return h(
        'div',
        {
          style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '2px 0' },
        },
        h('span', { style: { opacity: 0.6 } }, label),
        h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, value),
      )
    }

    function Bar({ ratio }) {
      return h(
        'div',
        {
          style: {
            height: '6px',
            borderRadius: '999px',
            background: token('18%'),
            overflow: 'hidden',
            margin: '8px 0',
          },
        },
        h('div', {
          style: {
            width: `${Math.round(ratio * 100)}%`,
            height: '100%',
            background: 'currentColor',
            opacity: 0.85,
            borderRadius: '999px',
            transition: 'width 240ms ease',
          },
        }),
      )
    }

    function Panel({ state }) {
      const data = state.status === 'ready' ? state.data : undefined
      const style = {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: '0',
        width: '264px',
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: '10px',
        background: token('8%'),
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${token('18%')}`,
        boxShadow: '0 8px 24px rgb(0 0 0 / 0.22)',
        fontSize: '12px',
        lineHeight: '18px',
        textAlign: 'left',
        zIndex: 30,
      }

      if (!data) {
        return h(
          'div',
          { style, role: 'dialog' },
          h('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'Plan NaN'),
          h('div', { style: { opacity: 0.7 } }, state.status === 'error' ? state.message : 'Cargando…'),
        )
      }

      const ratio = Math.max(0, Math.min(1, data.remainingRatio))

      return h(
        'div',
        { style, role: 'dialog', 'aria-label': 'Uso del plan NaN' },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', fontWeight: 600 } },
          h('span', null, `Plan ${data.plan}`),
          h('span', { style: { opacity: 0.7 } }, `${percent.format(ratio * 100)} % libre`),
        ),
        h(Bar, { ratio }),
        h(Row, { label: 'Quedan', value: `${formatTokens(data.remainingTokens)} tok` }),
        h(Row, { label: 'Usado', value: `${formatTokens(data.usedTokens)} tok` }),
        h(Row, { label: 'Cuota', value: `${formatTokens(data.quotaTokens)} tok` }),
        h(Row, { label: 'Peticiones', value: plain.format(data.requests) }),
        data.period
          ? h(Row, { label: 'Desde', value: data.period.start })
          : null,
        data.byModel && data.byModel.length > 1
          ? h(
              'div',
              { style: { marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${token('14%')}` } },
              ...data.byModel.map((row) =>
                h(Row, { key: row.model, label: row.model, value: formatTokens(row.tokens) }),
              ),
            )
          : null,
        h(
          'a',
          {
            href: 'https://cloud.nan.builders/',
            target: '_blank',
            rel: 'noreferrer',
            style: { display: 'inline-block', marginTop: '8px', color: 'inherit', opacity: 0.7 },
          },
          'Abrir NaN ↗',
        ),
      )
    }

    function PlanChip() {
      const [state, setState] = React.useState({ status: 'loading' })
      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)

      React.useEffect(() => {
        let cancelled = false
        let timer

        async function load() {
          try {
            const response = await fetch('/nan-plan/usage', {
              headers: { accept: 'application/json' },
            })
            const body = await response.json()
            if (cancelled) return
            if (response.ok && body && body.ok) {
              setState({ status: 'ready', data: body })
            } else {
              setState({ status: 'error', message: (body && body.error) || `HTTP ${response.status}` })
            }
          } catch (error) {
            if (!cancelled) {
              setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
            }
          }
        }

        load()
        timer = setInterval(load, POLL_MS)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [])

      React.useEffect(() => {
        if (!open) return
        const onPointer = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('pointerdown', onPointer, true)
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('pointerdown', onPointer, true)
          window.removeEventListener('keydown', onKey)
        }
      }, [open])

      const data = state.status === 'ready' ? state.data : undefined
      const ratio = data ? Math.max(0, Math.min(1, data.remainingRatio)) : 0
      const label =
        state.status === 'ready'
          ? `${percent.format(ratio * 100)} % libre`
          : state.status === 'error'
            ? 'sin datos'
            : '…'

      return h(
        'div',
        {
          ref: rootRef,
          style: {
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            flex: '0 0 auto',
          },
        },
        open ? h(Panel, { state }) : null,
        h(
          'button',
          {
            type: 'button',
            onClick: () => setOpen((value) => !value),
            'aria-expanded': open,
            'aria-label': `Plan NaN: ${label}. Pulsa para ver el detalle.`,
            title: 'Ver el detalle del plan NaN',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '1px 6px 2px',
              border: 0,
              borderRadius: '6px',
              background: 'transparent',
              font: 'inherit',
              fontSize: '11px',
              lineHeight: '16px',
              color: 'inherit',
              opacity: open ? 0.95 : 0.72,
              cursor: 'pointer',
              userSelect: 'none',
            },
            onMouseEnter: (event) => {
              event.currentTarget.style.opacity = 0.95
            },
            onMouseLeave: (event) => {
              event.currentTarget.style.opacity = open ? 0.95 : 0.72
            },
          },
          h('span', { style: { whiteSpace: 'nowrap', fontWeight: 500 } }, 'NaN'),
          h(
            'span',
            {
              style: {
                width: '48px',
                height: '4px',
                borderRadius: '999px',
                background: token('25%'),
                overflow: 'hidden',
                position: 'relative',
                display: 'inline-block',
              },
            },
            h('span', {
              style: {
                position: 'absolute',
                inset: '0 auto 0 0',
                width: `${Math.round(ratio * 100)}%`,
                background: 'currentColor',
                opacity: 0.9,
                borderRadius: '999px',
              },
            }),
          ),
          h('span', { style: { whiteSpace: 'nowrap' } }, label),
          data
            ? h('span', { style: { whiteSpace: 'nowrap', opacity: 0.8 } }, formatTokens(data.remainingTokens))
            : null,
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'nan-plan',
              order: 5,
            },
            PlanChip,
          ),
        )
      },
    }
  },
})
