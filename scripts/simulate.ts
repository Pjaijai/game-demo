/**
 * 批次模擬 —— 第 1–3 週的驗收工具。
 *
 * 平衡目標（DESIGN.md 第二節）：
 *   1v1 張飛 vs 呂布      勝率 0%
 *   2v1 關張 vs 呂布      勝率 30–40%（牌樹 Lv2+）
 *   3v1 劉關張 vs 呂布    勝率 70–80%
 *
 * 用法：npm run sim
 */
import { createBattle, endTurn, playCard } from '../src/core/battle/battle'
import type { BattleState } from '../src/core/battle/types'
import { GreedyAI } from '../src/core/ai/greedy'
import { makeCombatant, type Loadout } from '../src/data/generals'

const ai = new GreedyAI()

function runOne(playerSpecs: [string, Loadout][], seed: number): BattleState['phase'] {
  const players = playerSpecs.map(([name, lo]) => makeCombatant(name, lo))
  const boss = makeCombatant('呂布', { arm: '馬', troopTier: 'full' })

  let state = createBattle(players, [boss], seed)

  // 安全上限：一場仗不該超過 400 個行動
  for (let i = 0; i < 400; i++) {
    if (state.phase !== 'awaiting-input') break
    const actions = ai.chooseTurn(state)
    for (const a of actions) {
      if (a.type === 'play') state = playCard(state, a.cardId)
      else if (a.type === 'end') state = endTurn(state)
      if (state.phase !== 'awaiting-input') break
    }
  }
  return state.phase
}

function scenario(label: string, specs: [string, Loadout][], runs = 400): void {
  let wins = 0
  let totalTicks = 0
  for (let seed = 1; seed <= runs; seed++) {
    const phase = runOne(specs, seed * 7919)
    if (phase === 'won') wins++
    totalTicks++
  }
  const rate = ((wins / totalTicks) * 100).toFixed(1)
  console.log(`${label.padEnd(28)} 勝率 ${rate.padStart(5)}%   (${wins}/${runs})`)
}

const full = (arm: '槍' | '弓' | '馬' | '斧', level: 1 | 2 | 3): Loadout => ({
  arm,
  troopTier: 'full',
  level,
})

console.log('\n=== 三英戰呂布 平衡驗收 ===\n')

console.log('-- Lv1 牌樹（開局狀態）--')
scenario('1v1  張飛(槍) vs 呂布', [['張飛', full('槍', 1)]])
scenario('2v1  關張 vs 呂布', [
  ['關羽', full('馬', 1)],
  ['張飛', full('槍', 1)],
])
scenario('3v1  劉關張 vs 呂布', [
  ['劉備', full('槍', 1)],
  ['關羽', full('馬', 1)],
  ['張飛', full('槍', 1)],
])

console.log('\n-- Lv2 牌樹（練過一輪）--')
scenario('1v1  張飛(槍) vs 呂布', [['張飛', full('槍', 2)]])
scenario('2v1  關張 vs 呂布', [
  ['關羽', full('馬', 2)],
  ['張飛', full('槍', 2)],
])
scenario('3v1  劉關張 vs 呂布', [
  ['劉備', full('槍', 2)],
  ['關羽', full('馬', 2)],
  ['張飛', full('槍', 2)],
])

console.log('\n-- Lv3 牌樹（練滿）--')
scenario('2v1  關張 vs 呂布', [
  ['關羽', full('馬', 3)],
  ['張飛', full('槍', 3)],
])
scenario('3v1  劉關張 vs 呂布', [
  ['劉備', full('槍', 3)],
  ['關羽', full('馬', 3)],
  ['張飛', full('槍', 3)],
])

console.log('\n-- 無兵（拆分武將，沒有護甲與兵種牌）--')
scenario('3v1  劉關張 裸身 vs 呂布', [
  ['劉備', { level: 1 }],
  ['關羽', { level: 1 }],
  ['張飛', { level: 1 }],
])

console.log('')
