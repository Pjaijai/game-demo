/**
 * 武將資料與 Combatant 工廠。
 *
 * 配點原則：一般武將「速度 ↔ 能量」互相排擠（武藝總分 ≈ 速度 + 能量×4），
 * 呂布是明確的破格例外 —— 這就是三英必須集結的理由。
 */
import type {
  ArmType,
  Aptitude,
  Combatant,
  EnemyMove,
  Side,
  TroopTier,
  WoundState,
} from '../core/battle/types'
import { TROOP_ARMOR, TROOP_CARD_COUNT } from '../core/battle/types'
import { ARM_CARDS, buildDeck } from './cards'

export interface GeneralDef {
  name: string
  side: Side
  color: string
  maxHp: number
  speed: number
  maxEnergy: number
  /** 地圖層戰力，用於陣亡判定（戰力差 ≥25） */
  power: number
  aptitude: Record<ArmType, Aptitude>
  moves?: EnemyMove[]
  enrageMoves?: EnemyMove[]
}

const APT = (槍: Aptitude, 弓: Aptitude, 馬: Aptitude, 斧: Aptitude) => ({ 槍, 弓, 馬, 斧 })

export const GENERALS: Record<string, GeneralDef> = {
  劉備: {
    name: '劉備',
    side: 'player',
    color: '#c8a45c',
    maxHp: 28,
    speed: 12,
    maxEnergy: 2,
    power: 72,
    aptitude: APT('B', 'C', 'C', 'C'),
  },
  關羽: {
    name: '關羽',
    side: 'player',
    color: '#4f8f5a',
    maxHp: 34,
    speed: 18,
    maxEnergy: 3,
    power: 81,
    aptitude: APT('B', 'C', 'A', 'A'),
  },
  張飛: {
    name: '張飛',
    side: 'player',
    color: '#3f6f9c',
    maxHp: 36,
    speed: 14,
    maxEnergy: 4,
    power: 79,
    aptitude: APT('S', 'C', 'B', 'A'),
  },

  呂布: {
    name: '呂布',
    side: 'enemy',
    color: '#a83c3c',
    maxHp: 150,
    speed: 22,
    maxEnergy: 5,
    power: 108,
    aptitude: APT('A', 'B', 'S', 'S'),
    // 呂布絕不撤退。他站在那裡等你，問題只是你夠不夠。
    moves: [
      // 單體爆發決定 1v1 有多絕望；群體傷害決定「多帶一個人」有多划算。
      // 兩者的比例就是 1v1 / 2v1 / 3v1 三條勝率曲線的斜率。
      {
        name: '方天畫戟',
        cost: 3,
        range: 'melee',
        text: '造成 6 傷害',
        effects: [{ kind: 'damage', amount: 6, target: 'enemy' }],
      },
      {
        name: '踐踏',
        cost: 2,
        range: 'melee',
        text: '對所有敵人造成 13 傷害',
        effects: [{ kind: 'damage', amount: 13, target: 'allEnemies' }],
      },
      {
        name: '連斬',
        cost: 2,
        range: 'melee',
        text: '造成 4 傷害兩次',
        effects: [
          { kind: 'damage', amount: 4, target: 'enemy' },
          { kind: 'damage', amount: 4, target: 'enemy' },
        ],
      },
      {
        name: '赤兔奔襲',
        cost: 3,
        range: 'melee',
        text: '造成 5 傷害，自身行動條前進 20',
        effects: [
          { kind: 'damage', amount: 5, target: 'enemy' },
          { kind: 'gauge', amount: -20, target: 'self' },
        ],
      },
    ],
    enrageMoves: [
      {
        name: '無雙亂舞',
        cost: 5,
        range: 'melee',
        text: '對所有敵人造成 11 傷害',
        effects: [{ kind: 'damage', amount: 11, target: 'allEnemies' }],
      },
      {
        name: '魔王之威',
        cost: 3,
        range: 'melee',
        text: '造成 12 傷害',
        effects: [{ kind: 'damage', amount: 12, target: 'enemy' }],
      },
      {
        name: '踐踏',
        cost: 2,
        range: 'melee',
        text: '對所有敵人造成 15 傷害',
        effects: [{ kind: 'damage', amount: 15, target: 'allEnemies' }],
      },
    ],
  },
}

export interface Loadout {
  arm?: ArmType | null
  troopTier?: TroopTier
  /** 牌樹層級，靠內政訓練解鎖 */
  level?: 1 | 2 | 3
  wound?: WoundState
}

export function makeCombatant(name: string, loadout: Loadout = {}): Combatant {
  const def = GENERALS[name]
  if (!def) throw new Error(`unknown general: ${name}`)

  const arm = loadout.arm ?? null
  const troopTier: TroopTier = arm ? (loadout.troopTier ?? 'full') : 'none'
  const level = loadout.level ?? 1
  const wound = loadout.wound ?? 'healthy'
  const isWounded = wound === 'wounded'

  // 重傷：HP 上限 −40%、戰力 −20、兵種牌減半
  const maxHp = isWounded ? Math.floor(def.maxHp * 0.6) : def.maxHp
  const power = isWounded ? def.power - 20 : def.power

  let armCardCount = arm ? TROOP_CARD_COUNT[troopTier] : 0
  if (isWounded) armCardCount = Math.floor(armCardCount / 2)

  const deck = def.moves ? [] : buildDeck(name, level)

  if (arm && armCardCount > 0) {
    const set = ARM_CARDS[arm]
    for (let i = 0; i < armCardCount; i++) {
      deck.push({ ...set.base, id: `${name}-${set.base.name}-${i}` })
    }
    // 適性 A 以上 → 高階特技，並額外送一張高階兵種牌
    const apt = def.aptitude[arm]
    if (apt === 'A' || apt === 'S') {
      deck.push({ ...set.high, id: `${name}-${set.high.name}-0` })
    }
  }

  return {
    id: name,
    name,
    side: def.side,
    color: def.color,
    maxHp,
    hp: maxHp,
    armor: arm ? TROOP_ARMOR[troopTier] : 0,
    speed: isWounded ? def.speed : def.speed,
    maxEnergy: def.maxEnergy,
    gauge: arm === '馬' ? 5 : 0, // 馬：先手判定 +5
    arm,
    troopTier,
    aptitude: def.aptitude,
    power,
    wound,
    deck,
    hand: [],
    discard: [],
    moves: def.moves ?? null,
    enrageMoves: def.enrageMoves ?? null,
    moveIndex: 0,
  }
}

/** 高階特技是否開啟（適性 A 以上）—— 地圖層與 UI 都要用 */
export function hasHighSkill(c: Combatant): boolean {
  if (!c.arm) return false
  const apt = c.aptitude[c.arm]
  return apt === 'A' || apt === 'S'
}
