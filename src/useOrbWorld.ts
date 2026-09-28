import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { fit, ink, mix, splitTone, toHex, type Oklch } from './color'
import { calm } from './hooks'
import { stepWorld, type Body, type Bounds, type Mode } from './physics'

type Orb = Body & { color: Oklch; hex: string; ink: string; slot: number; dead?: boolean }
export type OrbView = { id: number; r: number; hex: string; ink: string }

type Opts = {
  headerRef: RefObject<HTMLElement | null>
  dockRef: RefObject<HTMLElement | null>
  slotRefs: RefObject<(HTMLElement | null)[]>
  onDock: (color: Oklch, slot: number) => void
}

const H = 1 / 120
const MAX_ORBS = 28
let nextId = 1

const unit = () => Math.min(1.1, Math.max(0.6, Math.min(innerWidth, innerHeight) / 900))

function makeOrb(color: Oklch, x: number, y: number, r: number, vx = 0, vy = 0, s = 0): Orb {
  const c = fit(color)
  return {
    id: nextId++, x, y, r, s, vs: 0, st: 1, tx: x, ty: y, mode: 'free', slot: -1,
    vx: calm ? 0 : vx, vy: calm ? 0 : vy, color: c, hex: toHex(c), ink: ink(c),
  }
}

function ripple(x: number, y: number, hex: string, r: number) {
  if (calm) return
  const el = document.createElement('div')
  el.className = 'ripple'
  el.style.cssText = `left:${x}px;top:${y}px;--c:${hex};--d:${r * 2}px`
  document.body.append(el)
  setTimeout(() => el.remove(), 800)
}

// The simulation lives in refs and paints transforms directly; React only hears about orbs being born or dying.
export function useOrbWorld({ headerRef, dockRef, slotRefs, onDock }: Opts) {
  const bodies = useRef<Orb[]>([])
  const els = useRef(new Map<number, HTMLElement>())
  const drag = useRef<{ id: number; pid: number; ox: number; oy: number } | null>(null)
  const ptr = useRef<{ x: number; y: number; vx: number; vy: number; t: number } | null>(null)
  const hot = useRef<HTMLElement | null>(null)
  const dockCb = useRef(onDock)
  const [orbs, setOrbs] = useState<OrbView[]>([])

  useLayoutEffect(() => {
    dockCb.current = onDock
  })

  const sync = () => setOrbs(bodies.current.map(({ id, r, hex, ink }) => ({ id, r, hex, ink })))
  const find = (id: number) => bodies.current.find((o) => o.id === id)
  const add = (...os: Orb[]) => {
    bodies.current.push(...os)
    sync()
  }
  const remove = (...os: Orb[]) => {
    bodies.current = bodies.current.filter((o) => !os.includes(o))
  }
  const setMode = (o: Orb, m: Mode) => {
    o.mode = m
    const el = els.current.get(o.id)
    if (el) el.dataset.mode = m
  }

  const bounds = (): Bounds => ({
    left: 0,
    right: innerWidth,
    top: (headerRef.current?.getBoundingClientRect().bottom ?? 72) + 4,
    bottom: (dockRef.current?.getBoundingClientRect().top ?? innerHeight) - 4,
  })

  const paint = (o: Orb) => {
    const el = els.current.get(o.id)
    if (!el) return
    const stretch = calm ? 0 : Math.min(Math.max(0, Math.hypot(o.vx, o.vy) - 120) / 5000, 0.2)
    const a = Math.atan2(o.vy, o.vx)
    el.style.transform =
      `translate3d(${o.x - o.r}px,${o.y - o.r}px,0) rotate(${a}rad) ` +
      `scale(${o.s * (1 + stretch)},${o.s * (1 - stretch)}) rotate(${-a}rad)`
  }

  const slotAt = (x: number, y: number) => {
    const top = dockRef.current?.getBoundingClientRect().top ?? Infinity
    if (y < top) return -1
    let best = -1
    let bestD = Infinity
    slotRefs.current.forEach((s, i) => {
      if (!s) return
      const r = s.getBoundingClientRect()
      const d = Math.abs(r.left + r.width / 2 - x)
      if (d < bestD) [best, bestD] = [i, d]
    })
    return best
  }

  const mixTarget = (o: Orb) => {
    let best: Orb | null = null
    let bestD = Infinity
    for (const b of bodies.current) {
      if (b === o || b.mode !== 'free') continue
      const d = Math.hypot(b.x - o.x, b.y - o.y)
      if (d < Math.max(b.r, o.r) * 0.8 && d < bestD) [best, bestD] = [b, d]
    }
    return best
  }

  const highlight = (target: Orb | null, slot: number) => {
    const el = target ? (els.current.get(target.id) ?? null) : null
    if (hot.current !== el) {
      hot.current?.removeAttribute('data-hot')
      el?.setAttribute('data-hot', '')
      hot.current = el
    }
    slotRefs.current.forEach((s, i) => s?.toggleAttribute('data-hot', i === slot))
  }

  const dockTo = (o: Orb, slot: number) => {
    const el = slotRefs.current[slot]
    if (!el) return setMode(o, 'free')
    const r = el.getBoundingClientRect()
    o.tx = r.left + r.width / 2
    o.ty = r.top + r.height / 2
    o.slot = slot
    o.st = Math.min(r.width, r.height) / (2 * o.r)
    setMode(o, 'dock')
  }

  const merge = (a: Orb, b: Orb) => {
    const wa = a.r ** 2
    const wb = b.r ** 2
    const r = Math.min(Math.hypot(a.r, b.r), 90 * unit())
    const m = makeOrb(mix(b.color, a.color, wa / (wa + wb)), b.x, b.y, r, b.vx * 0.5, b.vy * 0.5, b.r / r)
    m.vs = 4
    remove(a, b)
    add(m)
    ripple(b.x, b.y, m.hex, r)
  }

  const startDrag = (o: Orb, x: number, y: number, pid: number) => {
    drag.current = { id: o.id, pid, ox: x - o.x, oy: y - o.y }
    ptr.current = { x, y, vx: 0, vy: 0, t: performance.now() }
    o.vx = o.vy = 0
    o.st = 1.12
    setMode(o, 'held')
  }

  // Simulation loop: fixed 120Hz substeps, variable paint.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    const frame = (now: number) => {
      acc += Math.min((now - last) / 1000, 0.05)
      last = now
      const b = bounds()
      const wind = drag.current || calm ? null : ptr.current
      const decay = Math.exp(-12 * H)
      for (; acc >= H; acc -= H) {
        stepWorld(bodies.current, b, wind, H)
        if (ptr.current) {
          ptr.current.vx *= decay
          ptr.current.vy *= decay
        }
      }
      const docked: Orb[] = []
      for (const o of bodies.current) {
        if (o.mode === 'pop' && o.s < 0.04) o.dead = true
        if (o.mode === 'dock' && Math.hypot(o.x - o.tx, o.y - o.ty) < 3 && Math.hypot(o.vx, o.vy) < 80) {
          o.dead = true
          docked.push(o)
        }
      }
      if (bodies.current.some((o) => o.dead)) {
        bodies.current = bodies.current.filter((o) => !o.dead)
        sync()
        for (const o of docked) dockCb.current(o.color, o.slot)
      }
      for (const o of bodies.current) paint(o)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Orbs scale with the viewport so a rotated phone or resized window doesn't overcrowd the canvas.
  useEffect(() => {
    let u = unit()
    const onResize = () => {
      const k = unit() / u
      u *= k
      const b = bounds()
      for (const o of bodies.current) {
        o.r *= k
        if (o.mode !== 'free') continue
        // Pull stragglers inside, otherwise the soft walls fling them back with huge energy.
        o.x = Math.min(Math.max(o.x, b.left + o.r), b.right - o.r)
        o.y = Math.min(Math.max(o.y, b.top + o.r), b.bottom - o.r)
      }
      if (k !== 1) sync()
    }
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  // Window-level pointer tracking: drives drag, throw velocity and cursor wind.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const now = performance.now()
      const p = ptr.current
      if (p) {
        const dt = Math.max(now - p.t, 4) / 1000
        p.vx += ((e.clientX - p.x) / dt - p.vx) * 0.5
        p.vy += ((e.clientY - p.y) / dt - p.vy) * 0.5
        Object.assign(p, { x: e.clientX, y: e.clientY, t: now })
      } else ptr.current = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: now }

      const d = drag.current
      if (!d || d.pid !== e.pointerId) return
      const o = find(d.id)
      if (!o) return
      o.x = e.clientX - d.ox
      o.y = e.clientY - d.oy
      o.vx = ptr.current!.vx
      o.vy = ptr.current!.vy
      const slot = slotAt(e.clientX, e.clientY)
      highlight(slot < 0 ? mixTarget(o) : null, slot)
    }

    const up = (e: PointerEvent) => {
      const d = drag.current
      if (!d || d.pid !== e.pointerId) return
      drag.current = null
      highlight(null, -1)
      const o = find(d.id)
      if (!o) return
      o.st = 1
      if (performance.now() - (ptr.current?.t ?? 0) > 80) o.vx = o.vy = 0
      if (e.type === 'pointerup') {
        const slot = slotAt(e.clientX, e.clientY)
        if (slot >= 0) return dockTo(o, slot)
        const target = mixTarget(o)
        if (target) return merge(o, target)
      }
      setMode(o, 'free')
    }

    const leave = () => {
      if (!drag.current) ptr.current = null
    }

    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', up)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', up)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [])

  return {
    orbs,

    register: (id: number) => (el: HTMLElement | null) => {
      if (!el) {
        els.current.delete(id)
        return
      }
      els.current.set(id, el)
      const o = find(id)
      if (o) {
        el.dataset.mode = o.mode
        paint(o)
      }
    },

    grab(id: number, e: ReactPointerEvent) {
      const o = find(id)
      if (e.button !== 0 || !o || o.mode !== 'free' || drag.current) return
      e.preventDefault()
      startDrag(o, e.clientX, e.clientY, e.pointerId)
    },

    pour(colors: Oklch[]) {
      for (const o of bodies.current) {
        if (o.mode !== 'free') continue
        setMode(o, 'pop')
        o.st = 0
        o.vs = 5
      }
      const b = bounds()
      const cx = (b.left + b.right) / 2
      const cy = (b.top + b.bottom) / 2
      const u = unit()
      add(
        ...colors.map((c, i) => {
          const a = (i / colors.length) * Math.PI * 2 + Math.random() * 0.4
          const speed = 500 + Math.random() * 500
          const r = (30 + Math.random() * 30) * u
          return makeOrb(c, cx + Math.cos(a) * 80 * u, cy + Math.sin(a) * 80 * u, r, Math.cos(a) * speed, Math.sin(a) * speed)
        }),
      )
    },

    split(id: number) {
      const o = find(id)
      if (!o || o.mode !== 'free') return
      if (o.r < 26 * unit() || bodies.current.length >= MAX_ORBS) {
        o.vs = 10 // refuse with a wobble
        return
      }
      const [light, dark] = splitTone(o.color)
      const r = o.r / Math.SQRT2
      const a = Math.random() * Math.PI * 2
      const [cx, sy] = [Math.cos(a), Math.sin(a)]
      remove(o)
      add(
        makeOrb(light, o.x + cx * r, o.y + sy * r, r, cx * 520 + o.vx, sy * 520 + o.vy, 0.7),
        makeOrb(dark, o.x - cx * r, o.y - sy * r, r, -cx * 520 + o.vx, -sy * 520 + o.vy, 0.7),
      )
      ripple(o.x, o.y, o.hex, o.r)
    },

    pop(id: number) {
      const o = find(id)
      if (!o || o.mode !== 'free') return
      setMode(o, 'pop')
      o.st = 0
      o.vs = 5
    },

    dock(id: number, slot: number) {
      const o = find(id)
      if (o && o.mode === 'free') dockTo(o, slot)
    },

    eject(color: Oklch, slot: number) {
      const r = slotRefs.current[slot]?.getBoundingClientRect()
      const x = r ? r.left + r.width / 2 : innerWidth / 2
      const y = r ? r.top : innerHeight - 120
      add(makeOrb(color, x, y, 40 * unit(), (Math.random() - 0.5) * 500, -1100, 0.5))
    },

    lift(color: Oklch, x: number, y: number, pid: number) {
      if (drag.current) return false
      const o = makeOrb(color, x, y, 42 * unit(), 0, 0, 0.6)
      add(o)
      startDrag(o, x, y, pid)
      return true
    },
  }
}
