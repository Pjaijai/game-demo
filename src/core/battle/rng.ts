/**
 * 種子亂數。洗牌與撤退判定都走這裡，戰鬥才能重播與批次模擬。
 * mulberry32 — 小、快、夠均勻。
 */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  let t = (seed + 0x6d2b79f5) | 0
  let r = Math.imul(t ^ (t >>> 15), 1 | t)
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296
  t = t | 0
  return [value, t]
}

/** Fisher–Yates，回傳新陣列與新種子（不改動輸入） */
export function shuffle<T>(items: readonly T[], seed: number): [T[], number] {
  const out = items.slice()
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    const [v, ns] = nextRandom(s)
    s = ns
    const j = Math.floor(v * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return [out, s]
}
