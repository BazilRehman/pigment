export type Spring = { k: number; c: number }

export const SPRINGS = {
  snappy: { k: 380, c: 32 },
  bouncy: { k: 300, c: 13 },
  dock: { k: 520, c: 34 },
} satisfies Record<string, Spring>

export type Mode = 'free' | 'held' | 'dock' | 'pop'

export type Body = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  s: number // visual scale
  vs: number
  st: number // scale target
  tx: number // dock target
  ty: number
  mode: Mode
}

export type Bounds = { left: number; top: number; right: number; bottom: number }
export type Wind = { x: number; y: number; vx: number; vy: number } | null

const WALL = 3000
const FRICTION = 1.6
const WIND = 4
const BOUNCE = 0.6
const MAX_SPEED = 3500

// Semi-implicit Euler: stable for k·dt² well below 1 at our 120Hz substep.
export function stepSpring(x: number, v: number, target: number, s: Spring, dt: number): [number, number] {
  v += (-s.k * (x - target) - s.c * v) * dt
  return [x + v * dt, v]
}

export function stepWorld(bodies: Body[], b: Bounds, wind: Wind, dt: number) {
  const damp = Math.exp(-FRICTION * dt)
  for (const o of bodies) {
    ;[o.s, o.vs] = stepSpring(o.s, o.vs, o.st, SPRINGS.bouncy, dt)
    if (o.mode === 'held' || o.mode === 'pop') continue
    if (o.mode === 'dock') {
      ;[o.x, o.vx] = stepSpring(o.x, o.vx, o.tx, SPRINGS.dock, dt)
      ;[o.y, o.vy] = stepSpring(o.y, o.vy, o.ty, SPRINGS.dock, dt)
      continue
    }
    // Soft walls: penetration depth becomes a spring force, so throws bounce instead of teleporting.
    let ax = (Math.max(0, b.left - o.x + o.r) - Math.max(0, o.x + o.r - b.right)) * WALL
    let ay = (Math.max(0, b.top - o.y + o.r) - Math.max(0, o.y + o.r - b.bottom)) * WALL
    if (wind) {
      const R = o.r + 110
      const d = Math.hypot(o.x - wind.x, o.y - wind.y)
      if (d < R) {
        const f = (1 - d / R) * WIND
        ax += wind.vx * f
        ay += wind.vy * f
      }
    }
    o.vx = (o.vx + ax * dt) * damp
    o.vy = (o.vy + ay * dt) * damp
    const speed = Math.hypot(o.vx, o.vy)
    if (speed > MAX_SPEED) {
      o.vx *= MAX_SPEED / speed
      o.vy *= MAX_SPEED / speed
    }
    o.x += o.vx * dt
    o.y += o.vy * dt
  }
  collide(bodies)
}

// ponytail: O(n²) pair scan, fine for the ~28-orb cap; spatial hash if counts grow.
function collide(bodies: Body[]) {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (a.mode !== 'free') continue
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (b.mode !== 'free') continue
      let dx = b.x - a.x
      const dy = b.y - a.y
      const min = a.r + b.r
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min) continue
      if (d2 === 0) dx = 0.01
      const d = Math.sqrt(d2) || 0.01
      const nx = dx / d
      const ny = dy / d
      const ma = a.r * a.r
      const mb = b.r * b.r
      const push = (min - d) / (ma + mb)
      a.x -= nx * push * mb
      a.y -= ny * push * mb
      b.x += nx * push * ma
      b.y += ny * push * ma
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (rv < 0) {
        const imp = (-(1 + BOUNCE) * rv) / (1 / ma + 1 / mb)
        a.vx -= (imp * nx) / ma
        a.vy -= (imp * ny) / ma
        b.vx += (imp * nx) / mb
        b.vy += (imp * ny) / mb
      }
    }
  }
}
