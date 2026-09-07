/**
 * 卡牌戰的資料模型。
 *
 * 這個模組是純資料 + 純函數：不碰 React、不碰 Three.js、不碰 DOM。
 * 因為行動條是「離散刻」而不是真實時間，整場戰鬥是可重播、可測試、
 * 可讓 AI 前瞻搜尋的。全部狀態都能 JSON.stringify。
 */

/** 兵種 */
export type ArmType = '槍' | '弓' | '馬' | '斧'

/** 武將對兵種的適性。A 以上開啟高階特技並多送一張兵種牌。 */
export type Aptitude = 'S' | 'A' | 'B' | 'C'

export type Side = 'player' | 'enemy'

/** 兵力檔位 — 只有檔位進卡牌戰，兵力的數字不進。 */
export type TroopTier = 'full' | 'half' | 'broken' | 'none'

export const TROOP_ARMOR: Record<TroopTier, number> = {
  full: 15,
  half: 8,
  broken: 3,
  none: 0,
}

export const TROOP_CARD_COUNT: Record<TroopTier, number> = {
  full: 4,
  half: 2,
  broken: 1,
  none: 0,
}

/** 近戰牌會吃槍衾反傷；遠程牌不會（弓的被動）。 */
export type CardRange = 'melee' | 'ranged' | 'none'

export type TargetSpec =
  | 'enemy' // 單一敵人（預設打當前主目標）
  | 'allEnemies'
  | 'self'
  | 'allAllies'

export type Effect =
  | { kind: 'damage'; amount: number; target: 'enemy' | 'allEnemies' }
  /** 無視對方 N 點護甲（斧的被動來源） */
  | { kind: 'pierce'; amount: number; pierce: number; target: 'enemy' }
  | { kind: 'armor'; amount: number; target: 'self' | 'allAllies' }
  | { kind: 'heal'; amount: number; target: 'self' | 'allAllies' }
  | { kind: 'draw'; amount: number }
  /** 把目標的行動條往回推 N（正數 = 延後對方；負數 = 自己搶先） */
  | { kind: 'gauge'; amount: number; target: TargetSpec }
  /** 本回合接下來的牌傷害 +N */
  | { kind: 'empower'; amount: number }

export interface Card {
  id: string
  name: string
  cost: number
  range: CardRange
  text: string
  effects: Effect[]
  /** 兵種牌來自部隊，不屬於武將本命牌組 */
  fromArm?: ArmType
}

/** 傷亡狀態鏈：健康 →(戰敗/撤退失敗)→ 重傷 →(再一次)→ 陣亡 */
export type WoundState = 'healthy' | 'wounded' | 'dead'

export interface Combatant {
  id: string
  name: string
  side: Side
  /** 立繪佔位色 */
  color: string

  maxHp: number
  hp: number
  armor: number

  /** 行動條每刻累積的量 */
  speed: number
  /** 每回合能量上限 */
  maxEnergy: number

  /** 目前行動條進度，滿 GAUGE_FULL 就行動 */
  gauge: number

  /** 帶隊部隊 */
  arm: ArmType | null
  troopTier: TroopTier
  aptitude: Record<ArmType, Aptitude>

  /** 地圖層戰力，用於陣亡判定（戰力差 ≥25） */
  power: number

  wound: WoundState

  /** 玩家武將用牌組；敵將用 moveset（見 scripted AI） */
  deck: Card[]
  hand: Card[]
  discard: Card[]

  /** 敵將的招式輪替表，玩家武將為 null */
  moves: EnemyMove[] | null
  /** 血量低於一半時改用的暴走輪替表 */
  enrageMoves: EnemyMove[] | null
  moveIndex: number
}

/**
 * 敵將的一招 — 事先決定、公開預告（Slay the Spire 的 intent）。
 *
 * 實作選擇：敵將不抽牌，改用決定性的招式輪替表。這樣「預告下一招」是
 * 純函數算得出來的，而不需要偷看手牌；也讓平衡完全可控。
 * 對玩家而言，行為跟一副固定牌組沒有差別。
 */
export interface EnemyMove {
  name: string
  cost: number
  range: CardRange
  text: string
  effects: Effect[]
}

export type BattlePhase = 'awaiting-input' | 'enemy-turn' | 'won' | 'lost' | 'fled'

export interface LogEntry {
  tick: number
  text: string
}

export interface BattleState {
  tick: number
  combatants: Combatant[]
  /** 現在輪到誰 */
  activeId: string | null
  /** 當前行動者剩餘能量 */
  energy: number
  /** 本回合已累積的 empower 加成 */
  empower: number
  phase: BattlePhase
  log: LogEntry[]
  rngSeed: number
  /** 玩家目前選定的攻擊目標 */
  targetId: string | null
}

/** 行動條滿值 */
export const GAUGE_FULL = 100

/** 每回合抽到幾張 */
export const HAND_SIZE = 5
