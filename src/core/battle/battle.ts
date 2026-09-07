/**
 * 戰鬥狀態機。全部是 (state, action) => state 的純函數。
 *
 * 一個回合的流程：
 *   advanceToNextActor → beginTurn（能量回滿、補牌到 5）
 *   → 玩家：可打任意張牌直到能量用完，或按結束回合
 *   → 敵人：依招式輪替表打到能量用完，並預告下一輪要幹嘛
 */
import { advanceToNextActor, isAlive } from './atb'
import { beginTurn, findCombatant, livingOf, resolveEffects, rollFlee } from './effects'
import { shuffle } from './rng'
import type { BattleState, Combatant, EnemyMove } from './types'

export function createBattle(
  players: Combatant[],
  enemies: Combatant[],
  seed = 1,
): BattleState {
  let s = seed
  const withShuffledDecks = [...players, ...enemies].map((c) => {
    if (c.moves) return { ...c, hand: [], discard: [] }
    const [deck, ns] = shuffle(c.deck, s)
    s = ns
    return { ...c, deck, hand: [], discard: [] }
  })

  const initial: BattleState = {
    tick: 0,
    combatants: withShuffledDecks,
    activeId: null,
    energy: 0,
    empower: 0,
    phase: 'awaiting-input',
    log: [{ tick: 0, text: '戰鬥開始' }],
    rngSeed: s,
    targetId: enemies.length > 0 ? enemies[0].id : null,
  }

  return openNextTurn(initial)
}

/** 推進到下一個行動者並開啟他的回合；若是敵人就直接把整輪打完。 */
function openNextTurn(state: BattleState): BattleState {
  const outcome = checkOutcome(state)
  if (outcome) return outcome

  let s = advanceToNextActor(state)
  const actorId = s.activeId
  if (!actorId) return { ...s, phase: 'lost' }

  s = beginTurn(s, actorId)
  const actor = findCombatant(s, actorId)

  if (actor.side === 'enemy') {
    s = runEnemyTurn(s)
    return openNextTurn(s)
  }

  // 確保玩家的攻擊目標仍然有效
  const target = s.targetId ? s.combatants.find((c) => c.id === s.targetId) : null
  if (!target || !isAlive(target)) {
    const foes = livingOf(s, 'enemy')
    s = { ...s, targetId: foes.length > 0 ? foes[0].id : null }
  }

  return { ...s, phase: 'awaiting-input' }
}

/** 這一輪敵將預定要出的招（純函數 → 直接拿去畫「意圖預告」） */
export function plannedMoves(c: Combatant): EnemyMove[] {
  const table = c.enrageMoves && c.hp * 2 < c.maxHp ? c.enrageMoves : c.moves
  if (!table || table.length === 0) return []
  const out: EnemyMove[] = []
  let energy = c.maxEnergy
  let i = c.moveIndex
  // 最多看一整輪，避免全是 0 費時無限迴圈
  for (let guard = 0; guard < table.length * 2; guard++) {
    const move = table[i % table.length]
    if (move.cost > energy) break
    out.push(move)
    energy -= move.cost
    i++
    if (energy <= 0) break
  }
  return out
}

/** 預告：下一個行動的敵將，以及他準備出的招 */
export function enemyIntent(
  state: BattleState,
  enemyId: string,
): { moves: EnemyMove[]; totalDamage: number } {
  const c = findCombatant(state, enemyId)
  const moves = plannedMoves(c)
  const totalDamage = moves.reduce(
    (sum, m) =>
      sum +
      m.effects.reduce(
        (acc, e) =>
          acc + (e.kind === 'damage' || e.kind === 'pierce' ? e.amount : 0),
        0,
      ),
    0,
  )
  return { moves, totalDamage }
}

function runEnemyTurn(state: BattleState): BattleState {
  const id = state.activeId
  if (!id) return state
  let s = state
  const actor = findCombatant(s, id)
  const moves = plannedMoves(actor)

  // 敵人挑血最少的活著的玩家武將下手
  const pickTarget = (): string | null => {
    const alive = livingOf(s, 'player')
    if (alive.length === 0) return null
    return alive.reduce((a, b) => (a.hp + a.armor <= b.hp + b.armor ? a : b)).id
  }

  for (const move of moves) {
    if (livingOf(s, 'player').length === 0) break
    s = {
      ...s,
      log: [...s.log, { tick: s.tick, text: `${actor.name} 使出「${move.name}」` }],
    }
    s = resolveEffects(s, id, move.effects, pickTarget(), move.range)
    s = { ...s, empower: 0 }
  }

  return {
    ...s,
    combatants: s.combatants.map((c) =>
      c.id === id ? { ...c, moveIndex: c.moveIndex + moves.length } : c,
    ),
  }
}

/** 玩家打出一張手牌 */
export function playCard(state: BattleState, cardId: string): BattleState {
  if (state.phase !== 'awaiting-input' || !state.activeId) return state
  const actor = findCombatant(state, state.activeId)
  const card = actor.hand.find((c) => c.id === cardId)
  if (!card || card.cost > state.energy) return state

  let s: BattleState = {
    ...state,
    energy: state.energy - card.cost,
    combatants: state.combatants.map((c) =>
      c.id === actor.id
        ? {
            ...c,
            hand: c.hand.filter((x) => x.id !== cardId),
            discard: [...c.discard, card],
          }
        : c,
    ),
    log: [...state.log, { tick: state.tick, text: `${actor.name} 打出「${card.name}」` }],
  }

  s = resolveEffects(s, actor.id, card.effects, s.targetId, card.range)

  const outcome = checkOutcome(s)
  return outcome ?? s
}

export function selectTarget(state: BattleState, id: string): BattleState {
  const t = state.combatants.find((c) => c.id === id)
  if (!t || t.side !== 'enemy' || !isAlive(t)) return state
  return { ...state, targetId: id }
}

export function endTurn(state: BattleState): BattleState {
  if (state.phase !== 'awaiting-input') return state
  return openNextTurn({ ...state, empower: 0 })
}

/** 撤退：機動判定，失敗就白損一個回合並挨一次追擊 */
export function attemptFlee(state: BattleState): BattleState {
  if (state.phase !== 'awaiting-input' || !state.activeId) return state
  const { success, chance, seed } = rollFlee(state, state.activeId)
  const actor = findCombatant(state, state.activeId)
  let s: BattleState = {
    ...state,
    rngSeed: seed,
    log: [
      ...state.log,
      { tick: state.tick, text: `${actor.name} 嘗試撤退（成功率 ${chance}%）` },
    ],
  }

  if (success) {
    return {
      ...s,
      phase: 'fled',
      log: [...s.log, { tick: s.tick, text: `${actor.name} 撤退成功` }],
    }
  }

  s = { ...s, log: [...s.log, { tick: s.tick, text: `${actor.name} 撤退失敗，門戶大開` }] }
  return openNextTurn(s)
}

/** 贏呂布一場就結束；三英全倒就輸 */
export function checkOutcome(state: BattleState): BattleState | null {
  if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled') {
    return state
  }
  if (livingOf(state, 'enemy').length === 0) {
    return { ...state, phase: 'won', activeId: null }
  }
  if (livingOf(state, 'player').length === 0) {
    return { ...state, phase: 'lost', activeId: null }
  }
  return null
}
