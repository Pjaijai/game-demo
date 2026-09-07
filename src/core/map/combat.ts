/**
 * 地圖上的數值結算（無將的一方參戰時走這裡；雙方都有將 → 卡牌戰）。
 *
 * 特技分兩層：
 *   基礎  所有部隊都有，包含無將守軍 —— 所以雜兵也有牙齒
 *   高階  帶隊武將對該兵種適性 A 以上才發動
 */
import { GENERALS } from '../../data/generals'
import type { ArmType } from '../battle/types'
import { neighbors, unitAt } from './grid'
import {
  ARM_ATTACK,
  ARM_DEFENSE,
  ARM_MOVE,
  ARM_RANGE,
  GENERAL_MOVE,
  GENERAL_RANGE,
  counterModifier,
  manhattan,
  type MapState,
  type MapUnit,
} from './types'

export function unitMove(u: MapUnit): number {
  const base = u.arm ? ARM_MOVE[u.arm] : GENERAL_MOVE
  return Math.max(1, base - (u.wound === 'wounded' ? 1 : 0))
}

export function unitRange(u: MapUnit): number {
  return u.arm ? ARM_RANGE[u.arm] : GENERAL_RANGE
}

/** 高階特技是否開啟：要有帶隊武將，且對該兵種適性 A 以上 */
export function hasHighSkill(u: MapUnit): boolean {
  if (!u.general || !u.arm) return false
  const def = GENERALS[u.general]
  if (!def) return false
  const apt = def.aptitude[u.arm]
  return apt === 'A' || apt === 'S'
}

export function skillNames(u: MapUnit): string[] {
  if (!u.arm) return []
  const base: Record<ArmType, string> = {
    槍: '槍衾',
    弓: '齊射',
    馬: '突擊',
    斧: '破甲',
  }
  const high: Record<ArmType, string> = {
    槍: '亂突',
    弓: '連射',
    馬: '連環',
    斧: '亂戰',
  }
  return hasHighSkill(u) ? [base[u.arm], high[u.arm]] : [base[u.arm]]
}

function generalBonus(u: MapUnit): number {
  if (!u.general) return 0
  const def = GENERALS[u.general]
  if (!def) return 0
  const power = def.power - (u.wound === 'wounded' ? 20 : 0)
  return power / 8
}

export function unitAttack(u: MapUnit): number {
  const base = u.arm ? ARM_ATTACK[u.arm] : 10
  return base + generalBonus(u)
}

export function unitDefense(u: MapUnit): number {
  const base = u.arm ? ARM_DEFENSE[u.arm] : 4
  return base + generalBonus(u)
}

/** 一次攻擊造成多少兵力損失 */
function damageOf(
  attacker: MapUnit,
  defender: MapUnit,
  opts: { charged: boolean },
): number {
  let atk = unitAttack(attacker) * counterModifier(attacker.arm, defender.arm)

  // 突擊（馬・基礎）：移動後攻擊 +30%
  if (attacker.arm === '馬' && opts.charged) atk *= 1.3

  let def = unitDefense(defender)
  // 破甲（斧・基礎）：無視防禦一半
  if (attacker.arm === '斧') def *= 0.5

  return Math.max(1, Math.round((atk - def) * 20))
}

interface Outcome {
  state: MapState
  lines: string[]
}

function patchUnit(state: MapState, id: string, fn: (u: MapUnit) => MapUnit): MapState {
  return { ...state, units: state.units.map((u) => (u.id === id ? fn(u) : u)) }
}

/**
 * 對一個單位造成兵力損失。
 * 兵力歸零時：有將 → 武將重傷並脫離部隊；無將 → 部隊消滅。
 */
function applyLoss(state: MapState, id: string, loss: number): Outcome {
  const target = state.units.find((u) => u.id === id)
  if (!target) return { state, lines: [] }
  const lines: string[] = []

  // 單獨武將沒有兵力可扣，直接推進傷勢
  if (!target.arm) {
    const next = target.wound === 'healthy' ? 'wounded' : 'dead'
    lines.push(
      next === 'dead'
        ? `${target.general} 陣亡`
        : `${target.general} 被部隊衝散，重傷`,
    )
    if (next === 'dead') {
      return { state: { ...state, units: state.units.filter((u) => u.id !== id) }, lines }
    }
    return { state: patchUnit(state, id, (u) => ({ ...u, wound: next })), lines }
  }

  const remaining = target.troops - loss
  if (remaining > 0) {
    return {
      state: patchUnit(state, id, (u) => ({ ...u, troops: remaining })),
      lines,
    }
  }

  if (target.general) {
    const next = target.wound === 'healthy' ? 'wounded' : 'dead'
    lines.push(`${target.general} 的部隊全滅`)
    if (next === 'dead') {
      lines.push(`${target.general} 陣亡`)
      return { state: { ...state, units: state.units.filter((u) => u.id !== id) }, lines }
    }
    lines.push(`${target.general} 重傷`)
    return {
      state: patchUnit(state, id, (u) => ({
        ...u,
        arm: null,
        troops: 0,
        maxTroops: 0,
        wound: 'wounded',
      })),
      lines,
    }
  }

  lines.push('部隊被殲滅')
  return { state: { ...state, units: state.units.filter((u) => u.id !== id) }, lines }
}

/**
 * 數值結算。回傳新狀態與戰報。
 * charged = 攻擊方本回合有移動過（馬的突擊要用）。
 */
export function resolveTroopCombat(
  state: MapState,
  attackerId: string,
  defenderId: string,
  charged: boolean,
): Outcome {
  let s = state
  const lines: string[] = []

  const attacker = s.units.find((u) => u.id === attackerId)
  const defender = s.units.find((u) => u.id === defenderId)
  if (!attacker || !defender) return { state: s, lines }

  const label = (u: MapUnit) =>
    u.general ? `${u.general}${u.arm ? `（${u.arm}兵）` : ''}` : `${u.arm}兵`

  const adjacent = manhattan(attacker.pos, defender.pos) === 1
  // 連射（弓・高階）：攻擊兩次
  const swings = attacker.arm === '弓' && hasHighSkill(attacker) ? 2 : 1

  for (let i = 0; i < swings; i++) {
    const a = s.units.find((u) => u.id === attackerId)
    const d = s.units.find((u) => u.id === defenderId)
    if (!a || !d) break

    const dmg = damageOf(a, d, { charged })
    lines.push(
      `${label(a)} 攻擊 ${label(d)}，損失 ${dmg} 兵` +
        (swings > 1 ? `（連射 ${i + 1}/2）` : ''),
    )
    const res = applyLoss(s, defenderId, dmg)
    s = res.state
    lines.push(...res.lines)
  }

  // 亂戰（斧・高階）：波及相鄰所有敵人
  if (attacker.arm === '斧' && hasHighSkill(attacker)) {
    for (const n of neighbors(s, attacker.pos)) {
      const other = unitAt(s, n)
      if (!other || other.side === attacker.side || other.id === defenderId) continue
      const splash = Math.round(damageOf(attacker, other, { charged: false }) * 0.5)
      lines.push(`亂戰波及 ${label(other)}，損失 ${splash} 兵`)
      const res = applyLoss(s, other.id, splash)
      s = res.state
      lines.push(...res.lines)
    }
  }

  // 反擊：只在近戰、防守方還活著、且攻擊方不是遠程齊射時發生
  const survivor = s.units.find((u) => u.id === defenderId)
  const attackerStill = s.units.find((u) => u.id === attackerId)
  const rangedAttack = attacker.arm === '弓' && !adjacent
  const ranged = attacker.arm === '弓' // 齊射（弓・基礎）：不遭反擊

  if (survivor && attackerStill && adjacent && !ranged && !rangedAttack) {
    // 槍衾（槍・基礎）：反擊 50%
    const rate = survivor.arm === '槍' ? 0.5 : 0.35
    const back = Math.round(damageOf(survivor, attackerStill, { charged: false }) * rate)
    lines.push(
      `${label(survivor)} ${survivor.arm === '槍' ? '槍衾' : ''}反擊，${label(
        attackerStill,
      )} 損失 ${back} 兵`,
    )
    const res = applyLoss(s, attackerId, back)
    s = res.state
    lines.push(...res.lines)

    // 亂突（槍・高階）：反擊後使對方停止行動
    if (survivor.arm === '槍' && hasHighSkill(survivor) && s.units.some((u) => u.id === attackerId)) {
      lines.push(`亂突！${label(attackerStill)} 陣型被打散，本日無法再行動`)
      s = patchUnit(s, attackerId, (u) => ({ ...u, moved: true, acted: true }))
    }
  }

  // 連環（馬・高階）：擊破敵人後可再移動攻擊
  const defenderGone = !s.units.some((u) => u.id === defenderId)
  if (
    defenderGone &&
    attacker.arm === '馬' &&
    hasHighSkill(attacker) &&
    s.units.some((u) => u.id === attackerId)
  ) {
    lines.push(`連環突擊！${label(attacker)} 可以再動一次`)
    s = patchUnit(s, attackerId, (u) => ({ ...u, moved: false, acted: false }))
  }

  return { state: s, lines }
}
