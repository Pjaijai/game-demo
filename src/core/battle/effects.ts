/**
 * 效果結算：傷害、護甲、治療、抽牌、行動條推拉。
 *
 * 傷害順序：empower 加成 → 斧的破甲（無視 5 甲）→ 護甲吸收 → 扣血 → 槍的反傷。
 * 護甲被「無視」的部分不會被消耗，只是繞過去 —— 所以斧兵打厚甲很痛，
 * 但打完對方護甲還在。
 */
import { isAlive } from './atb'
import { nextRandom, shuffle } from './rng'
import { HAND_SIZE, type BattleState, type Combatant, type Effect, type Side } from './types'

export function findCombatant(state: BattleState, id: string): Combatant {
  const c = state.combatants.find((x) => x.id === id)
  if (!c) throw new Error(`unknown combatant: ${id}`)
  return c
}

function opposing(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player'
}

export function livingOf(state: BattleState, side: Side): Combatant[] {
  return state.combatants.filter((c) => c.side === side && isAlive(c))
}

function patch(
  state: BattleState,
  id: string,
  fn: (c: Combatant) => Combatant,
): BattleState {
  return {
    ...state,
    combatants: state.combatants.map((c) => (c.id === id ? fn(c) : c)),
  }
}

function log(state: BattleState, text: string): BattleState {
  return { ...state, log: [...state.log, { tick: state.tick, text }] }
}

/** 抽牌到手牌，牌堆空了就洗棄牌堆 */
export function drawCards(state: BattleState, id: string, count: number): BattleState {
  let s = state
  let seed = s.rngSeed
  const c = findCombatant(s, id)
  let deck = c.deck.slice()
  let hand = c.hand.slice()
  let discard = c.discard.slice()

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discard.length === 0) break
      const [reshuffled, ns] = shuffle(discard, seed)
      seed = ns
      deck = reshuffled
      discard = []
    }
    const card = deck.shift()
    if (card) hand.push(card)
  }

  s = patch(s, id, (x) => ({ ...x, deck, hand, discard }))
  return { ...s, rngSeed: seed }
}

/** 回合開始：能量回滿、手牌補到 HAND_SIZE、清除 empower */
export function beginTurn(state: BattleState, id: string): BattleState {
  const c = findCombatant(state, id)
  let s: BattleState = { ...state, energy: c.maxEnergy, empower: 0 }
  if (c.moves === null) {
    const need = Math.max(0, HAND_SIZE - c.hand.length)
    if (need > 0) s = drawCards(s, id, need)
  }
  return s
}

interface DamageOptions {
  pierce?: number
  range?: 'melee' | 'ranged' | 'none'
}

export function applyDamage(
  state: BattleState,
  sourceId: string,
  targetId: string,
  rawAmount: number,
  opts: DamageOptions = {},
): BattleState {
  const source = findCombatant(state, sourceId)
  const target = findCombatant(state, targetId)
  if (!isAlive(target)) return state

  const amount = rawAmount + state.empower
  // 斧的被動：攻擊無視對方 5 點護甲
  const pierce = (opts.pierce ?? 0) + (source.arm === '斧' ? 5 : 0)

  const bypassed = Math.min(target.armor, pierce)
  const usableArmor = target.armor - bypassed
  const absorbed = Math.min(amount, usableArmor)
  const hpLoss = amount - absorbed

  let s = patch(state, targetId, (c) => ({
    ...c,
    armor: c.armor - absorbed,
    hp: Math.max(0, c.hp - hpLoss),
  }))

  s = log(
    s,
    `${source.name} 對 ${target.name} 造成 ${amount} 傷害` +
      (absorbed > 0 ? `（護甲擋下 ${absorbed}）` : '') +
      (bypassed > 0 ? `（破甲 ${bypassed}）` : ''),
  )

  const after = findCombatant(s, targetId)
  if (after.hp === 0) s = log(s, `${target.name} 倒下`)

  // 槍的被動：被近戰打時反傷 2。遠程牌不遭反擊（弓的被動由 range 涵蓋）
  if (opts.range === 'melee' && target.arm === '槍' && isAlive(after)) {
    s = patch(s, sourceId, (c) => ({ ...c, hp: Math.max(0, c.hp - 2) }))
    s = log(s, `${target.name} 槍衾反傷 ${source.name} 2 點`)
  }

  return s
}

/** 解析一張牌 / 一招的效果。explicitTargetId 為主目標。 */
export function resolveEffects(
  state: BattleState,
  sourceId: string,
  effects: Effect[],
  explicitTargetId: string | null,
  range: 'melee' | 'ranged' | 'none',
): BattleState {
  let s = state
  const source = findCombatant(s, sourceId)
  const foes = () => livingOf(s, opposing(source.side))
  const allies = () => livingOf(s, source.side)

  const mainTarget = (): string | null => {
    if (explicitTargetId) {
      const t = s.combatants.find((c) => c.id === explicitTargetId)
      if (t && isAlive(t) && t.side !== source.side) return t.id
    }
    const f = foes()
    return f.length > 0 ? f[0].id : null
  }

  for (const e of effects) {
    switch (e.kind) {
      case 'damage': {
        if (e.target === 'allEnemies') {
          for (const f of foes()) s = applyDamage(s, sourceId, f.id, e.amount, { range })
        } else {
          const t = mainTarget()
          if (t) s = applyDamage(s, sourceId, t, e.amount, { range })
        }
        break
      }
      case 'pierce': {
        const t = mainTarget()
        if (t) s = applyDamage(s, sourceId, t, e.amount, { range, pierce: e.pierce })
        break
      }
      case 'armor': {
        const ids = e.target === 'self' ? [sourceId] : allies().map((c) => c.id)
        for (const id of ids) s = patch(s, id, (c) => ({ ...c, armor: c.armor + e.amount }))
        s = log(s, `${source.name} 獲得護甲 ${e.amount}`)
        break
      }
      case 'heal': {
        const ids = e.target === 'self' ? [sourceId] : allies().map((c) => c.id)
        for (const id of ids) {
          s = patch(s, id, (c) => ({ ...c, hp: Math.min(c.maxHp, c.hp + e.amount) }))
        }
        s = log(s, `${source.name} 回復 ${e.amount} 生命`)
        break
      }
      case 'draw': {
        s = drawCards(s, sourceId, e.amount)
        break
      }
      case 'gauge': {
        const ids =
          e.target === 'self'
            ? [sourceId]
            : e.target === 'allAllies'
              ? allies().map((c) => c.id)
              : e.target === 'allEnemies'
                ? foes().map((c) => c.id)
                : ([mainTarget()].filter(Boolean) as string[])
        for (const id of ids) {
          s = patch(s, id, (c) => ({ ...c, gauge: Math.max(0, c.gauge - e.amount) }))
        }
        break
      }
      case 'empower': {
        s = { ...s, empower: s.empower + e.amount }
        break
      }
    }
  }
  return s
}

/** 撤退的機動判定。回傳是否成功與新種子。 */
export function rollFlee(
  state: BattleState,
  actorId: string,
): { success: boolean; chance: number; seed: number } {
  const actor = findCombatant(state, actorId)
  const armBonus =
    actor.arm === '馬' ? 40 : actor.arm === '弓' ? 20 : actor.arm === null ? 50 : 0
  const foes = livingOf(state, opposing(actor.side))
  const pursuit = foes.reduce((m, f) => Math.max(m, f.arm === '馬' ? 40 : 0), 0)
  const chance = Math.max(5, Math.min(95, 50 + armBonus - pursuit))
  const [v, seed] = nextRandom(state.rngSeed)
  return { success: v * 100 < chance, chance, seed }
}
