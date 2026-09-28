import { useEffect, useLayoutEffect, useRef } from 'react'
import { SPRINGS, stepSpring, type Spring } from './physics'

export const calm = matchMedia('(prefers-reduced-motion: reduce)').matches

// Animates a vector toward `target` and hands each frame to `apply` — no re-renders per frame.
// Retargeting mid-flight keeps velocity, so interrupted motion stays continuous.
export function useSpring(target: number[], apply: (v: number[]) => void, spring: Spring = SPRINGS.snappy) {
  const fn = useRef(apply)
  const state = useRef<{ x: number[]; v: number[] } | null>(null)
  const key = target.join()

  useLayoutEffect(() => {
    fn.current = apply
  })

  useLayoutEffect(() => {
    const t = key.split(',').map(Number)
    const s = state.current
    if (!s || calm) {
      state.current = { x: t, v: t.map(() => 0) }
      fn.current(t)
      return
    }
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      const n = Math.max(1, Math.ceil(dt * 120))
      let busy = false
      t.forEach((goal, i) => {
        for (let k = 0; k < n; k++) [s.x[i], s.v[i]] = stepSpring(s.x[i], s.v[i], goal, spring, dt / n)
        if (Math.abs(s.x[i] - goal) > 1e-3 || Math.abs(s.v[i]) > 1e-3) busy = true
        else [s.x[i], s.v[i]] = [goal, 0]
      })
      fn.current(s.x)
      if (busy) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key, spring])
}

export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(map)
  useLayoutEffect(() => {
    ref.current = map
  })
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
      ref.current[e.key.length === 1 ? e.key.toLowerCase() : e.key]?.(e)
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [])
}
