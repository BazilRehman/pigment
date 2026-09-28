import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { harmony, ink, toHex, toShort, type Harmony, type Oklch } from './color'
import { ExportSheet } from './ExportSheet'
import { useHotkeys } from './hooks'
import { Segmented, Toast } from './ui'
import { useOrbWorld } from './useOrbWorld'

const SLOTS = 5
const STORE = 'pigment.tray'
const FALLBACK = ['#7c6cff', '#ff6fa3', '#ffb35c', '#35d0bd', '#7fb2ff']
const HARMONIES: { value: Harmony; label: string }[] = [
  { value: 'analogous', label: 'Analogous' },
  { value: 'triad', label: 'Triad' },
  { value: 'complement', label: 'Complement' },
  { value: 'split', label: 'Split' },
]

function loadTray(): (Oklch | null)[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORE) ?? 'null')
    if (Array.isArray(v) && v.length === SLOTS)
      return v.map((c) =>
        c && typeof c.l === 'number' && typeof c.c === 'number' && typeof c.h === 'number' ? { l: c.l, c: c.c, h: c.h } : null,
      )
  } catch {
    // storage blocked or corrupt: start with an empty tray
  }
  return Array(SLOTS).fill(null)
}

export default function App() {
  const [tray, setTray] = useState(loadTray)
  const [mode, setMode] = useState<Harmony>('analogous')
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const dockRef = useRef<HTMLElement>(null)
  const slotRefs = useRef<(HTMLElement | null)[]>([])

  const say = (text: string) => setToast((t) => ({ text, n: (t?.n ?? 0) + 1 }))
  const copy = (text: string, label: string) =>
    navigator.clipboard.writeText(text).then(
      () => say(label),
      () => say('Clipboard is blocked here'),
    )

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(tray))
    } catch {
      // storage unavailable: tray just won't persist
    }
  }, [tray])

  const world = useOrbWorld({
    headerRef,
    dockRef,
    slotRefs,
    onDock: (color, i) => {
      const prev = tray[i]
      setTray((t) => t.with(i, color))
      if (prev) world.eject(prev, i)
      say(`Kept ${toHex(color)}`)
    },
  })

  // Kept colors anchor the next pour, so the palette grows as a family.
  const pour = (m: Harmony = mode) => {
    const anchor = tray.find((c) => c && c.c > 0.03)
    world.pour(harmony(m, anchor ? anchor.h + (Math.random() - 0.5) * 40 : Math.random() * 360))
  }
  const pick = (m: Harmony) => {
    setMode(m)
    pour(m)
  }
  const keep = (id: number) => {
    const i = tray.indexOf(null)
    world.dock(id, i < 0 ? SLOTS - 1 : i)
  }
  const release = (i: number) => {
    const c = tray[i]
    if (!c) return
    setTray((t) => t.with(i, null))
    world.eject(c, i)
  }
  const liftFrom = (i: number, e: ReactPointerEvent) => {
    const c = tray[i]
    if (e.button !== 0 || !c) return
    const { clientX: x0, clientY: y0, pointerId } = e
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return
      done()
      if (world.lift(c, ev.clientX, ev.clientY, pointerId)) setTray((t) => t.with(i, null))
    }
    const done = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', done)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', done)
  }

  useEffect(() => {
    pour()
  }, [])

  useHotkeys({
    ' ': (e) => {
      if ((e.target as HTMLElement).closest?.('button')) return
      e.preventDefault()
      pour()
    },
    e: () => setExporting((x) => !x),
    Escape: () => setExporting(false),
    ...Object.fromEntries(HARMONIES.map((h, i) => [String(i + 1), () => pick(h.value)])),
  })

  const vars = Object.fromEntries(
    FALLBACK.map((f, i) => {
      const c = tray[i]
      return [`--t${i}`, c ? toHex(c) : f]
    }),
  ) as CSSProperties

  return (
    <div className="app" style={vars}>
      <header className="top" ref={headerRef}>
        <div className="brand">
          <span className="mark" aria-hidden />
          <div>
            <h1>Pigment</h1>
            <p>a physical color lab</p>
          </div>
        </div>
        <nav className="tools" aria-label="Controls">
          <Segmented label="Harmony" options={HARMONIES} value={mode} onChange={pick} />
          <button className="btn" onClick={() => pour()}>
            Pour <kbd>Space</kbd>
          </button>
          <button className="btn primary" onClick={() => setExporting(true)}>
            Export <kbd>E</kbd>
          </button>
        </nav>
      </header>

      <main aria-label="Pigment canvas">
        {world.orbs.map((o) => (
          <button
            key={o.id}
            ref={world.register(o.id)}
            className="orb"
            style={{ width: o.r * 2, height: o.r * 2, '--c': o.hex, '--ink': o.ink } as CSSProperties}
            aria-label={`Pigment ${o.hex}. Enter keeps it, S splits it, Delete dissolves it.`}
            onPointerDown={(e) => world.grab(o.id, e)}
            onDoubleClick={() => world.split(o.id)}
            onClick={(e) => e.detail === 0 && keep(o.id)}
            onKeyDown={(e) => {
              if (e.key === 's') world.split(o.id)
              if (e.key === 'Delete' || e.key === 'Backspace') world.pop(o.id)
            }}
          >
            <span className="orb-label">{o.hex}</span>
          </button>
        ))}
        {world.orbs.length === 0 && (
          <p className="empty">
            The canvas is dry. Press <kbd>Space</kbd> to pour.
          </p>
        )}
      </main>

      <footer className="dock" ref={dockRef}>
        <p className="hint">
          drag &amp; fling · drop onto another to <b>mix</b> · double-click to <b>split</b> · drop below to <b>keep</b>
        </p>
        <div className="tray">
          {tray.map((c, i) => {
            const hex = c && toHex(c)
            return (
              <div
                key={i}
                className="slot"
                data-filled={c ? '' : undefined}
                ref={(el) => {
                  slotRefs.current[i] = el
                }}
              >
                {c && hex ? (
                  <>
                    <button
                      key={hex}
                      className="swatch"
                      style={{ '--c': hex, '--ink': ink(c) } as CSSProperties}
                      aria-label={`Slot ${i + 1}: ${hex}. Click to copy, drag out to release.`}
                      onPointerDown={(e) => liftFrom(i, e)}
                      onClick={() => copy(hex, `Copied ${hex}`)}
                    >
                      <span className="hex">{hex}</span>
                      <span className="lch">{toShort(c)}</span>
                    </button>
                    <button className="eject" aria-label={`Release ${hex}`} onClick={() => release(i)}>
                      ×
                    </button>
                  </>
                ) : (
                  <span className="slot-n" aria-hidden>
                    {i + 1}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </footer>

      <ExportSheet open={exporting} colors={tray} onClose={() => setExporting(false)} onCopy={copy} />
      <Toast msg={toast} />
    </div>
  )
}
