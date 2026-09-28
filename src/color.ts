export type Oklch = { l: number; c: number; h: number }
export type Harmony = 'analogous' | 'triad' | 'complement' | 'split'

type Vec3 = [number, number, number]
const RAD = Math.PI / 180

// OKLCH → linear sRGB (Björn Ottosson's OKLab matrices).
function toLinear({ l, c, h }: Oklch): Vec3 {
  const a = c * Math.cos(h * RAD)
  const b = c * Math.sin(h * RAD)
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
}

const inGamut = (v: Vec3) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// Keep lightness and hue, shrink chroma until the color exists in sRGB.
export function fit({ l, c, h }: Oklch): Oklch {
  l = clamp01(l)
  h = ((h % 360) + 360) % 360
  c = Math.max(0, c)
  if (inGamut(toLinear({ l, c, h }))) return { l, c, h }
  let lo = 0
  let hi = c
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(toLinear({ l, c: mid, h }))) lo = mid
    else hi = mid
  }
  return { l, c: lo, h }
}

const encode = (x: number) => {
  x = clamp01(x)
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

export const toHex = (c: Oklch) =>
  '#' + toLinear(c).map((x) => Math.round(encode(x) * 255).toString(16).padStart(2, '0')).join('')

export const toCss = ({ l, c, h }: Oklch) => `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`

export const toShort = ({ l, c, h }: Oklch) => `L${Math.round(l * 100)} C${c.toFixed(2).slice(1)} H${Math.round(h)}`

const luminance = (c: Oklch) => {
  const [r, g, b] = toLinear(c).map(clamp01)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: Oklch, b: Oklch) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const WHITE: Oklch = { l: 1, c: 0, h: 0 }
export const INK: Oklch = { l: 0.17, c: 0.01, h: 280 }
export const ink = (c: Oklch) => (contrast(c, WHITE) >= contrast(c, INK) ? '#ffffff' : toHex(INK))

// Mixing happens in OKLab (cartesian), so complementary hues meet in a believable grey.
export function mix(x: Oklch, y: Oklch, t: number): Oklch {
  const ax = x.c * Math.cos(x.h * RAD)
  const bx = x.c * Math.sin(x.h * RAD)
  const a = ax + (y.c * Math.cos(y.h * RAD) - ax) * t
  const b = bx + (y.c * Math.sin(y.h * RAD) - bx) * t
  return fit({ l: x.l + (y.l - x.l) * t, c: Math.hypot(a, b), h: Math.atan2(b, a) / RAD })
}

export const splitTone = (c: Oklch): [Oklch, Oklch] => [
  fit({ l: c.l + 0.13, c: c.c * 0.85, h: c.h }),
  fit({ l: c.l - 0.13, c: c.c * 1.1, h: c.h }),
]

const OFFSETS: Record<Harmony, number[]> = {
  analogous: [-45, -20, 0, 20, 45],
  triad: [0, 120, 240],
  complement: [0, 180],
  split: [0, 150, 210],
}

export function harmony(kind: Harmony, base: number, n = 7, rand = Math.random): Oklch[] {
  const offs = OFFSETS[kind]
  return Array.from({ length: n }, (_, i) =>
    fit({
      l: 0.4 + ((i * 0.37 + rand() * 0.3) % 1) * 0.5,
      c: 0.08 + rand() * 0.14,
      h: base + offs[i % offs.length] + (rand() - 0.5) * 14,
    }),
  )
}
