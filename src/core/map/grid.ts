/**
 * 格子運算：鄰居、可達範圍、路徑、射程。
 * 四方向、曼哈頓距離 —— 沒有對角線，所以「射程 3」就是一個菱形。
 */
import {
  TERRAIN_COST,
  manhattan,
  type Coord,
  type MapState,
  type MapUnit,
} from './types'

export function key(c: Coord): string {
  return `${c.x},${c.y}`
}

export function parseKey(k: string): Coord {
  const [x, y] = k.split(',').map(Number)
  return { x, y }
}

export function inBounds(state: MapState, c: Coord): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < state.width && c.y < state.height
}

export function tileAt(state: MapState, c: Coord) {
  return state.tiles[c.y * state.width + c.x]
}

export function unitAt(state: MapState, c: Coord): MapUnit | undefined {
  return state.units.find((u) => u.pos.x === c.x && u.pos.y === c.y)
}

/** 四方向鄰居 */
export function neighbors(state: MapState, c: Coord): Coord[] {
  const out: Coord[] = [
    { x: c.x + 1, y: c.y },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
  ]
  return out.filter((n) => inBounds(state, n))
}

/**
 * Dijkstra 走地形消耗，回傳可達格 → 花費。
 * 敵方單位擋路；友軍可以穿過但不能停留（一格一單位）。
 */
export function reachable(state: MapState, unit: MapUnit, move: number): Map<string, number> {
  const cost = new Map<string, number>([[key(unit.pos), 0]])
  const frontier: Coord[] = [unit.pos]

  while (frontier.length > 0) {
    // 小地圖，線性取最小就夠了
    let bi = 0
    for (let i = 1; i < frontier.length; i++) {
      if (cost.get(key(frontier[i]))! < cost.get(key(frontier[bi]))!) bi = i
    }
    const cur = frontier.splice(bi, 1)[0]
    const curCost = cost.get(key(cur))!

    for (const n of neighbors(state, cur)) {
      const occupant = unitAt(state, n)
      if (occupant && occupant.side !== unit.side) continue // 敵人擋路

      const step = TERRAIN_COST[tileAt(state, n).terrain]
      if (!Number.isFinite(step)) continue

      const next = curCost + step
      if (next > move) continue
      if (cost.has(key(n)) && cost.get(key(n))! <= next) continue

      cost.set(key(n), next)
      frontier.push(n)
    }
  }

  // 有人佔著的格子不能當終點（含友軍）
  const out = new Map<string, number>()
  for (const [k, v] of cost) {
    const c = parseKey(k)
    const occupant = unitAt(state, c)
    if (occupant && occupant.id !== unit.id) continue
    out.set(k, v)
  }
  return out
}

/** 從 unit 到 dest 的一條路徑（含起點），用來播移動動畫 */
export function pathTo(state: MapState, unit: MapUnit, dest: Coord, move: number): Coord[] {
  const cost = new Map<string, number>([[key(unit.pos), 0]])
  const prev = new Map<string, string>()
  const frontier: Coord[] = [unit.pos]

  while (frontier.length > 0) {
    let bi = 0
    for (let i = 1; i < frontier.length; i++) {
      if (cost.get(key(frontier[i]))! < cost.get(key(frontier[bi]))!) bi = i
    }
    const cur = frontier.splice(bi, 1)[0]

    for (const n of neighbors(state, cur)) {
      const occupant = unitAt(state, n)
      if (occupant && occupant.side !== unit.side) continue
      const step = TERRAIN_COST[tileAt(state, n).terrain]
      if (!Number.isFinite(step)) continue
      const next = cost.get(key(cur))! + step
      if (next > move) continue
      if (cost.has(key(n)) && cost.get(key(n))! <= next) continue
      cost.set(key(n), next)
      prev.set(key(n), key(cur))
      frontier.push(n)
    }
  }

  if (!cost.has(key(dest))) return []
  const path: Coord[] = []
  let cursor = key(dest)
  while (cursor !== key(unit.pos)) {
    path.unshift(parseKey(cursor))
    const p = prev.get(cursor)
    if (!p) return []
    cursor = p
  }
  path.unshift(unit.pos)
  return path
}

/** 射程內的格子（菱形，不看地形也不看阻擋 —— 弓是拋射） */
export function tilesInRange(state: MapState, origin: Coord, range: number): Coord[] {
  const out: Coord[] = []
  for (let dx = -range; dx <= range; dx++) {
    const rest = range - Math.abs(dx)
    for (let dy = -rest; dy <= rest; dy++) {
      const c = { x: origin.x + dx, y: origin.y + dy }
      if (!inBounds(state, c)) continue
      if (manhattan(origin, c) === 0) continue
      out.push(c)
    }
  }
  return out
}
