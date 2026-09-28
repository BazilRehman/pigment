import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrast, fit, harmony, mix, toHex } from './color.ts'
import { SPRINGS, stepSpring, stepWorld, type Body } from './physics.ts'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

test('oklch → hex round trips known colors', () => {
  assert.equal(toHex({ l: 1, c: 0, h: 0 }), '#ffffff')
  assert.equal(toHex({ l: 0, c: 0, h: 0 }), '#000000')
  const [r, g, b] = rgb(toHex(fit({ l: 0.628, c: 0.2577, h: 29.23 })))
  assert.ok(r >= 0xf0 && g <= 0x20 && b <= 0x20, `expected red, got ${r},${g},${b}`)
})

test('fit pulls impossible chroma into sRGB without touching hue/lightness', () => {
  const f = fit({ l: 0.7, c: 0.5, h: 140 })
  assert.ok(f.c > 0.1 && f.c < 0.5)
  assert.equal(f.l, 0.7)
  assert.equal(f.h, 140)
})

test('contrast and mixing', () => {
  const white = { l: 1, c: 0, h: 0 }
  const black = { l: 0, c: 0, h: 0 }
  assert.ok(Math.abs(contrast(white, black) - 21) < 0.01)
  assert.equal(mix(black, white, 0.5).l, 0.5)
  const grey = mix({ l: 0.6, c: 0.15, h: 30 }, { l: 0.6, c: 0.15, h: 210 }, 0.5)
  assert.ok(grey.c < 0.01, 'complements should cancel to grey')
  assert.equal(harmony('triad', 200, 7).length, 7)
})

test('springs settle on target', () => {
  let [x, v] = [0, 0]
  for (let i = 0; i < 240; i++) [x, v] = stepSpring(x, v, 100, SPRINGS.snappy, 1 / 120)
  assert.ok(Math.abs(x - 100) < 0.5 && Math.abs(v) < 5, `x=${x} v=${v}`)
})

test('overlapping orbs push apart and stay in bounds', () => {
  const body = (id: number, x: number): Body => ({ id, x, y: 300, vx: 0, vy: 0, r: 40, s: 1, vs: 0, st: 1, tx: 0, ty: 0, mode: 'free' })
  const bodies = [body(1, 300), body(2, 310)]
  const bounds = { left: 0, top: 0, right: 800, bottom: 600 }
  for (let i = 0; i < 240; i++) stepWorld(bodies, bounds, null, 1 / 120)
  const [a, b] = bodies
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 79.5, 'bodies still overlap')
  for (const o of bodies) assert.ok(o.x - o.r > -5 && o.x + o.r < 805)
})
