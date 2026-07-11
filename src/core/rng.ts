/* 可复现的种子随机数（mulberry32），用于世界初始化 */

export function makeRng(seed: number) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = ReturnType<typeof makeRng>

export const pick = <T>(rng: Rng, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length)]

export const rint = (rng: Rng, min: number, max: number): number =>
  Math.floor(rng() * (max - min + 1)) + min

export const rfloat = (rng: Rng, min: number, max: number): number =>
  rng() * (max - min) + min

export const clamp = (v: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, v))
