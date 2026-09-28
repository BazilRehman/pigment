import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSpring } from './hooks'
import { SPRINGS } from './physics'

type Option<T> = { value: T; label: string }

export function Segmented<T extends string>(props: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
}) {
  const { label, options, value, onChange } = props
  const wrap = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState([0, 0])

  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (el) setBox([el.offsetLeft, el.offsetWidth])
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [value])

  useSpring(
    box,
    ([x, w]) => {
      const s = pill.current!.style
      s.transform = `translateX(${x}px)`
      s.width = `${Math.max(0, w)}px`
    },
    SPRINGS.bouncy,
  )

  return (
    <div className="seg" role="group" aria-label={label} ref={wrap}>
      <span className="seg-pill" ref={pill} aria-hidden />
      {options.map((o) => (
        <button key={o.value} className="seg-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toast({ msg }: { msg: { text: string; n: number } | null }) {
  const el = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!msg) return
    setShown(true)
    const t = setTimeout(() => setShown(false), 1600)
    return () => clearTimeout(t)
  }, [msg])

  useSpring(
    [shown ? 1 : 0],
    ([p]) => {
      const s = el.current!.style
      s.opacity = String(Math.min(1, Math.max(0, p)))
      s.transform = `translate(-50%, ${(p - 1) * 20}px) scale(${0.9 + 0.1 * p})`
    },
    SPRINGS.bouncy,
  )

  return (
    <div ref={el} className="toast" role="status" aria-live="polite">
      {msg?.text}
    </div>
  )
}
