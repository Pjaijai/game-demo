/**
 * AI 介面。v1 只有 scripted / greedy 實作，之後要換 ISMCTS 只要換一個實作，
 * 戰鬥核心一行都不用改。
 */
import type { BattleState } from '../battle/types'

export type BattleAction =
  | { type: 'play'; cardId: string }
  | { type: 'target'; id: string }
  | { type: 'end' }
  | { type: 'flee' }

export interface BattleAI {
  readonly name: string
  /** 回傳這個回合要依序執行的動作（最後一個通常是 end） */
  chooseTurn(state: BattleState): BattleAction[]
}
