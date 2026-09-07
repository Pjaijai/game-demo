/**
 * 地圖層的資料模型。
 *
 * 跟 battle/ 一樣是純資料 + 純函數：不碰 React、不碰 Three.js。
 * Three.js 只是把 MapState 畫出來，換成 Blender 模型時這裡一行都不用改。
 */
import type { ArmType, Side, WoundState } from '../battle/types'

export interface Coord {
  x: number
  y: number
}

export type Terrain = 'plain' | 'forest' | 'hill' | 'water' | 'city'

export interface Tile {
  terrain: Terrain
  /** 城池名稱，只有 terrain === 'city' 時有值 */
  city?: string
  cityOwner?: Side
}

/**
 * 一格上的單位。三種型態由 general / arm 的組合決定：
 *   general + arm  → 將帶兵
 *   general only   → 單獨武將（快、脆）
 *   arm only       → 無將部隊（只有基礎兵種特技）
 */
export interface MapUnit {
  id: string
  side: Side
  pos: Coord

  /** 武將名（GENERALS 的 key），無將部隊為 null */
  general: string | null
  /** 兵種，單獨武將為 null */
  arm: ArmType | null

  troops: number
  maxTroops: number

  /** 牌樹層級，內政訓練解鎖 */
  level: 1 | 2 | 3
  wound: WoundState

  /** 本日已移動 / 已行動 */
  moved: boolean
  acted: boolean
}

export type MapPhase =
  /** 玩家的軍事階段 */
  | 'player'
  /** 敵方行動中 */
  | 'enemy'
  /** 卡牌戰進行中，地圖暫停 */
  | 'battle'
  | 'won'
  | 'lost'

export interface MapLog {
  day: number
  text: string
}

export interface MapState {
  width: number
  height: number
  tiles: Tile[]
  units: MapUnit[]

  day: number
  dayLimit: number
  phase: MapPhase

  selectedId: string | null
  log: MapLog[]

  /** 觸發卡牌戰的雙方（單位 id），卡牌戰結束後用來回寫結果 */
  pendingBattle: {
    attackerId: string
    defenderId: string
    playerIds: string[]
    enemyIds: string[]
  } | null
}

// ── 兵種數值 ────────────────────────────────────────────

/** 移動力。單獨武將用 GENERAL_MOVE。 */
export const ARM_MOVE: Record<ArmType, number> = { 槍: 3, 弓: 4, 馬: 5, 斧: 3 }
export const GENERAL_MOVE = 4

/** 射程 */
export const ARM_RANGE: Record<ArmType, number> = { 槍: 1, 弓: 3, 馬: 1, 斧: 1 }
export const GENERAL_RANGE = 1

export const ARM_ATTACK: Record<ArmType, number> = { 槍: 20, 弓: 18, 馬: 22, 斧: 26 }
export const ARM_DEFENSE: Record<ArmType, number> = { 槍: 18, 弓: 12, 馬: 14, 斧: 8 }

/** 相剋：槍 → 馬 → 弓 → 槍。斧不參與，靠高傷與破甲。 */
const BEATS: Partial<Record<ArmType, ArmType>> = { 槍: '馬', 馬: '弓', 弓: '槍' }

export function counterModifier(attacker: ArmType | null, defender: ArmType | null): number {
  if (!attacker || !defender) return 1
  if (BEATS[attacker] === defender) return 1.5
  if (BEATS[defender] === attacker) return 0.7
  return 1
}

export function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y
}

/** 地形對移動的消耗 */
export const TERRAIN_COST: Record<Terrain, number> = {
  plain: 1,
  city: 1,
  forest: 2,
  hill: 2,
  water: Infinity,
}
