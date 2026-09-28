import { useEffect, useRef, useState } from 'react'
import { contrast, INK, toCss, toHex, WHITE, type Oklch } from './color'
import { useSpring } from './hooks'
import { Segmented } from './ui'

type Fmt = 'css' | 'tailwind' | 'json'

const FORMATS: { value: Fmt; label: string }[] = [
  { value: 'css', label: 'CSS' },
  { value: 'tailwind', label: 'Tailwind' },
  { value: 'json', label: 'JSON' },
]

function render(fmt: Fmt, colors: Oklch[]) {
  if (fmt === 'json') return JSON.stringify(colors.map((c) => ({ hex: toHex(c), oklch: toCss(c) })), null, 2)
  const lines = colors.map((c, i) =>
    fmt === 'css' ? `  --pigment-${i + 1}: ${toHex(c)}; /* ${toCss(c)} */` : `  --color-pigment-${i + 1}: ${toCss(c)};`,
  )
  return `${fmt === 'css' ? ':root' : '@theme'} {\n${lines.join('\n')}\n}`
}

const grade = (r: number) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large' : 'fail')

export function ExportSheet(props: {
  open: boolean
  colors: (Oklch | null)[]
  onClose: () => void
  onCopy: (text: string, label: string) => void
}) {
  const { open, colors, onClose, onCopy } = props
  const [fmt, setFmt] = useState<Fmt>('css')
  const sheet = useRef<HTMLElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const kept = colors.filter((c): c is Oklch => c !== null)
  const code = render(fmt, kept)

  useSpring([open ? 0 : 1], ([p]) => {
    const s = sheet.current!.style
    s.transform = `translate(-50%, ${p * 105}%)`
    s.visibility = p > 0.999 ? 'hidden' : 'visible'
    scrim.current!.style.opacity = String(1 - Math.min(1, Math.max(0, p)))
  })

  useEffect(() => {
    if (open) sheet.current?.querySelector<HTMLElement>('.btn.primary, .btn')?.focus()
  }, [open])

  return (
    <>
      <div ref={scrim} className="scrim" data-open={open || undefined} onClick={onClose} />
      <section ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="export-title" inert={!open}>
        <header>
          <h2 id="export-title">Export palette</h2>
          <Segmented label="Format" options={FORMATS} value={fmt} onChange={setFmt} />
          <button className="btn icon" onClick={onClose} aria-label="Close export">
            ×
          </button>
        </header>

        {kept.length === 0 ? (
          <p className="muted">Your tray is empty. Drop some pigment into it first.</p>
        ) : (
          <>
            <div className="strip">
              {kept.map((c, i) => (
                <span key={i} style={{ background: toHex(c) }} />
              ))}
            </div>
            <div className="code">
              <pre>
                <code>{code}</code>
              </pre>
              <button className="btn primary" onClick={() => onCopy(code, `Copied ${fmt.toUpperCase()}`)}>
                Copy
              </button>
            </div>

            <h3>Contrast · each column's text on each row's color</h3>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${kept.length + 2}, 1fr)` }}>
              {kept.flatMap((bg, i) =>
                [...kept, WHITE, INK].map((fg, j) => {
                  const r = contrast(bg, fg)
                  return (
                    <div
                      key={`${i}-${j}`}
                      className="cell"
                      data-grade={i === j ? 'self' : grade(r)}
                      style={{ background: toHex(bg), color: toHex(fg) }}
                      title={i === j ? undefined : `${toHex(fg)} on ${toHex(bg)}: ${r.toFixed(2)}:1 · ${grade(r)}`}
                    >
                      {i !== j && (
                        <>
                          <b>Aa</b>
                          <small>{r.toFixed(1)}</small>
                        </>
                      )}
                    </div>
                  )
                }),
              )}
            </div>
          </>
        )}
      </section>
    </>
  )
}
