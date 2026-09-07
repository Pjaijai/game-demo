/**
 * 卡牌資料。全部是純資料 —— 調平衡就是改這個檔案的數字，不用碰邏輯。
 *
 * 牌樹分三層：Lv1 開局就有，Lv2 / Lv3 靠內政「訓練」解鎖。
 */
import type { ArmType, Card } from '../core/battle/types'

export type CardTemplate = Omit<Card, 'id'>

export interface DeckEntry {
  /** 需要牌樹到第幾層才會進牌組 */
  level: 1 | 2 | 3
  copies: number
  card: CardTemplate
  /**
   * 進牌組時要移除的舊牌名。
   *
   * 純粹「加牌」會稀釋牌組 —— 好牌被抽到的機率下降，練功反而變弱
   * （第一版模擬實測 42.5% → 22.3%）。所以升級是取代，不是疊加。
   */
  replaces?: string
}

// ─────────────────────────────── 兵種牌 ───────────────────────────────
// 部隊帶進卡牌戰的牌。張數看兵力檔位（滿編 ×4 / 半殘 ×2 / 殘兵 ×1）。
// 帶隊武將適性 A 以上，額外加一張「高階」牌。

export const ARM_CARDS: Record<ArmType, { base: CardTemplate; high: CardTemplate }> = {
  槍: {
    base: {
      name: '槍衾突刺',
      cost: 1,
      range: 'melee',
      text: '造成 4 傷害，獲得 3 護甲',
      effects: [
        { kind: 'damage', amount: 4, target: 'enemy' },
        { kind: 'armor', amount: 3, target: 'self' },
      ],
      fromArm: '槍',
    },
    high: {
      name: '亂突',
      cost: 2,
      range: 'melee',
      text: '造成 6 傷害，並使目標行動條後退 25',
      effects: [
        { kind: 'damage', amount: 6, target: 'enemy' },
        { kind: 'gauge', amount: 25, target: 'enemy' },
      ],
      fromArm: '槍',
    },
  },
  弓: {
    base: {
      name: '齊射',
      cost: 1,
      range: 'ranged',
      text: '造成 4 傷害，不遭反擊',
      effects: [{ kind: 'damage', amount: 4, target: 'enemy' }],
      fromArm: '弓',
    },
    high: {
      name: '連射',
      cost: 2,
      range: 'ranged',
      text: '造成 4 傷害兩次，不遭反擊',
      effects: [
        { kind: 'damage', amount: 4, target: 'enemy' },
        { kind: 'damage', amount: 4, target: 'enemy' },
      ],
      fromArm: '弓',
    },
  },
  馬: {
    base: {
      name: '突擊',
      cost: 1,
      range: 'melee',
      text: '造成 6 傷害，自身行動條前進 15',
      effects: [
        { kind: 'damage', amount: 6, target: 'enemy' },
        { kind: 'gauge', amount: -15, target: 'self' },
      ],
      fromArm: '馬',
    },
    high: {
      name: '連環突擊',
      cost: 2,
      range: 'melee',
      text: '造成 7 傷害，自身行動條前進 25',
      effects: [
        { kind: 'damage', amount: 7, target: 'enemy' },
        { kind: 'gauge', amount: -25, target: 'self' },
      ],
      fromArm: '馬',
    },
  },
  斧: {
    base: {
      name: '破甲斬',
      cost: 1,
      range: 'melee',
      text: '造成 5 傷害，額外無視 8 點護甲',
      effects: [{ kind: 'pierce', amount: 5, pierce: 8, target: 'enemy' }],
      fromArm: '斧',
    },
    high: {
      name: '亂戰',
      cost: 2,
      range: 'melee',
      text: '對所有敵人造成 6 傷害',
      effects: [{ kind: 'damage', amount: 6, target: 'allEnemies' }],
      fromArm: '斧',
    },
  },
}

// ─────────────────────────────── 武將本命牌 ───────────────────────────────

export const GENERAL_DECKS: Record<string, DeckEntry[]> = {
  劉備: [
    {
      level: 1,
      copies: 3,
      card: {
        name: '雙股劍',
        cost: 1,
        range: 'melee',
        text: '造成 5 傷害',
        effects: [{ kind: 'damage', amount: 5, target: 'enemy' }],
      },
    },
    {
      // 全體治療在 3v1 會乘以三，是整個平衡最敏感的一張牌
      level: 1,
      copies: 2,
      card: {
        name: '仁德',
        cost: 1,
        range: 'none',
        text: '我方全體回復 3 生命',
        effects: [{ kind: 'heal', amount: 3, target: 'allAllies' }],
      },
    },
    {
      level: 1,
      copies: 2,
      card: {
        name: '弘毅',
        cost: 0,
        range: 'none',
        text: '抽 2 張牌',
        effects: [{ kind: 'draw', amount: 2 }],
      },
    },
    {
      // 呂布是群傷型的，所以「拖長戰鬥」的防禦牌在這裡是陷阱：
      // Lv2 一律走輸出升級，防禦類全部留到 Lv3。
      level: 2,
      copies: 2,
      replaces: '仁德',
      card: {
        name: '仁德・厚',
        cost: 1,
        range: 'none',
        text: '我方全體回復 5 生命',
        effects: [{ kind: 'heal', amount: 5, target: 'allAllies' }],
      },
    },
    {
      level: 3,
      copies: 2,
      replaces: '仁德・厚',
      card: {
        name: '蜀漢之志',
        cost: 2,
        range: 'none',
        text: '我方全體獲得 9 護甲並回復 4 生命',
        effects: [
          { kind: 'armor', amount: 9, target: 'allAllies' },
          { kind: 'heal', amount: 4, target: 'allAllies' },
        ],
      },
    },
  ],

  關羽: [
    {
      level: 1,
      copies: 3,
      card: {
        name: '青龍偃月',
        cost: 2,
        range: 'melee',
        text: '造成 9 傷害',
        effects: [{ kind: 'damage', amount: 9, target: 'enemy' }],
      },
    },
    {
      level: 1,
      copies: 3,
      card: {
        name: '刀壁',
        cost: 1,
        range: 'none',
        text: '獲得 6 護甲',
        effects: [{ kind: 'armor', amount: 6, target: 'self' }],
      },
    },
    {
      level: 1,
      copies: 2,
      card: {
        name: '衝陣',
        cost: 1,
        range: 'melee',
        text: '造成 5 傷害，並使目標行動條後退 15',
        effects: [
          { kind: 'damage', amount: 5, target: 'enemy' },
          { kind: 'gauge', amount: 15, target: 'enemy' },
        ],
      },
    },
    {
      // Lv2 的主升級：本命攻擊牌整批換代，而不是加牌
      level: 2,
      copies: 3,
      replaces: '青龍偃月',
      card: {
        name: '青龍偃月・改',
        cost: 2,
        range: 'melee',
        text: '造成 11 傷害',
        effects: [{ kind: 'damage', amount: 11, target: 'enemy' }],
      },
    },
    {
      level: 3,
      copies: 2,
      replaces: '衝陣',
      card: {
        name: '武聖',
        cost: 1,
        range: 'none',
        text: '本回合接下來的牌傷害 +5，抽 1 張',
        effects: [
          { kind: 'empower', amount: 5 },
          { kind: 'draw', amount: 1 },
        ],
      },
    },
    {
      level: 3,
      copies: 3,
      replaces: '青龍偃月・改',
      card: {
        name: '拖刀計',
        cost: 2,
        range: 'melee',
        text: '造成 16 傷害',
        effects: [{ kind: 'damage', amount: 16, target: 'enemy' }],
      },
    },
  ],

  張飛: [
    {
      level: 1,
      copies: 3,
      card: {
        name: '丈八蛇矛',
        cost: 1,
        range: 'melee',
        text: '造成 5 傷害，額外無視 4 點護甲',
        effects: [{ kind: 'pierce', amount: 5, pierce: 4, target: 'enemy' }],
      },
    },
    {
      level: 1,
      copies: 2,
      card: {
        name: '咆哮',
        cost: 0,
        range: 'none',
        text: '本回合接下來的牌傷害 +3',
        effects: [{ kind: 'empower', amount: 3 }],
      },
    },
    {
      level: 1,
      copies: 3,
      card: {
        name: '猛擊',
        cost: 2,
        range: 'melee',
        text: '造成 12 傷害',
        effects: [{ kind: 'damage', amount: 12, target: 'enemy' }],
      },
    },
    {
      level: 2,
      copies: 3,
      replaces: '猛擊',
      card: {
        name: '猛擊・改',
        cost: 2,
        range: 'melee',
        text: '造成 14 傷害',
        effects: [{ kind: 'damage', amount: 14, target: 'enemy' }],
      },
    },
    {
      // Lv2 必須在「單一強敵」的場合有用 —— AoE 放在這裡會讓牌樹負成長
      level: 3,
      copies: 2,
      replaces: '咆哮',
      card: {
        name: '據水斷橋',
        cost: 2,
        range: 'none',
        text: '獲得 10 護甲，並使所有敵人行動條後退 25',
        effects: [
          { kind: 'armor', amount: 10, target: 'self' },
          { kind: 'gauge', amount: 25, target: 'allEnemies' },
        ],
      },
    },
    {
      level: 3,
      copies: 3,
      replaces: '猛擊・改',
      card: {
        name: '萬夫不當',
        cost: 2,
        range: 'melee',
        text: '造成 18 傷害',
        effects: [{ kind: 'damage', amount: 18, target: 'enemy' }],
      },
    },
  ],
}

/** 依牌樹等級組出一副牌（尚未洗牌，id 在這裡才產生） */
export function buildDeck(generalName: string, level: 1 | 2 | 3): Card[] {
  const entries = GENERAL_DECKS[generalName] ?? []
  const active = entries.filter((e) => e.level <= level)
  const removed = new Set(
    active.map((e) => e.replaces).filter((n): n is string => Boolean(n)),
  )

  const out: Card[] = []
  for (const entry of active) {
    if (removed.has(entry.card.name)) continue
    for (let i = 0; i < entry.copies; i++) {
      out.push({ ...entry.card, id: `${generalName}-${entry.card.name}-${i}` })
    }
  }
  return out
}
