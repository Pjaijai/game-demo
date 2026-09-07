/**
 * 玩家方的自動策略 —— 只用在批次模擬（scripts/simulate.ts），
 * 用來驗收「1v1 必敗 / 2v1 勉強 / 3v1 才穩」這條平衡目標。
 *
 * 它不聰明，也不該聰明：它代表一個「會出牌但不會神操作」的普通玩家。
 * 如果連它都能 1v1 打贏呂布，那數值一定錯了。
 */
import { findCombatant, livingOf } from '../battle/effects'
import { enemyIntent } from '../battle/battle'
import { previewOrder } from '../battle/atb'
import type { BattleState, Card } from '../battle/types'
import type { BattleAI, BattleAction } from './index'

function damageOf(card: Card): number {
  return card.effects.reduce(
    (sum, e) => sum + (e.kind === 'damage' || e.kind === 'pierce' ? e.amount : 0),
    0,
  )
}

function isDefensive(card: Card): boolean {
  return card.effects.some((e) => e.kind === 'armor' || e.kind === 'heal')
}

/** 呂布下一次行動前，我方會挨多少 */
function incomingDamage(state: BattleState): number {
  const order = previewOrder(state, 4)
  const foes = new Set(livingOf(state, 'enemy').map((c) => c.id))
  const nextFoe = order.slice(1).find((id) => foes.has(id))
  return nextFoe ? enemyIntent(state, nextFoe).totalDamage : 0
}

export class GreedyAI implements BattleAI {
  readonly name = 'greedy'

  chooseTurn(state: BattleState): BattleAction[] {
    const actions: BattleAction[] = []
    if (!state.activeId) return [{ type: 'end' }]

    const actor = findCombatant(state, state.activeId)
    let energy = state.energy
    const hand = actor.hand.slice()
    const threat = incomingDamage(state)
    // 快死了就先擋，否則全力輸出
    const needDefense = actor.hp <= threat + 4

    const sorted = hand.sort((a, b) => {
      const aScore = (isDefensive(a) === needDefense ? 100 : 0) + damageOf(a)
      const bScore = (isDefensive(b) === needDefense ? 100 : 0) + damageOf(b)
      return bScore - aScore || a.cost - b.cost
    })

    for (const card of sorted) {
      if (card.cost <= energy) {
        actions.push({ type: 'play', cardId: card.id })
        energy -= card.cost
      }
    }

    actions.push({ type: 'end' })
    return actions
  }
}
