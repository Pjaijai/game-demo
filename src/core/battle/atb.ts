/**
 * 離散刻行動條。
 *
 * 沒有真實時間：每「刻」每個存活者的行動條 += 速度，先滿 100 的人行動。
 * 行動後扣掉 100（餘數保留，所以快的人不會因為進位而被吃掉優勢）。
 *
 * 因為完全決定性，previewOrder() 可以在不改動狀態的前提下算出未來的行動順序 —
 * 這就是玩家看到的「接下來 6 個行動」。
 */
import { GAUGE_FULL, type BattleState, type Combatant } from './types'

export function isAlive(c: Combatant): boolean {
  return c.hp > 0
}

/** 帶馬的部隊有「先手判定 +5」，作為同分時的優先權 */
function initiative(c: Combatant): number {
  return c.speed + (c.arm === '馬' ? 5 : 0)
}

interface Runner {
  id: string
  gauge: number
  speed: number
  init: number
}

function runners(state: BattleState): Runner[] {
  return state.combatants
    .filter(isAlive)
    .map((c) => ({ id: c.id, gauge: c.gauge, speed: c.speed, init: initiative(c) }))
}

/** 從目前狀態往前推，回傳下一個行動者與經過的刻數（不改動狀態） */
function step(rs: Runner[]): { id: string; ticks: number } | null {
  if (rs.length === 0) return null
  let ticks = 0
  // 安全上限：速度最低 1 的情況下 100 刻內一定有人滿
  while (ticks < 10_000) {
    const ready = rs.filter((r) => r.gauge >= GAUGE_FULL)
    if (ready.length > 0) {
      ready.sort((a, b) => b.gauge - a.gauge || b.init - a.init || a.id.localeCompare(b.id))
      const winner = ready[0]
      winner.gauge -= GAUGE_FULL
      return { id: winner.id, ticks }
    }
    for (const r of rs) r.gauge += r.speed
    ticks++
  }
  return null
}

/**
 * 推進到下一個行動者。回傳新的 state（不改動輸入）。
 * activeId 會被設定，行動者的 gauge 已扣除。
 */
export function advanceToNextActor(state: BattleState): BattleState {
  const rs = runners(state)
  const result = step(rs)
  if (!result) return { ...state, activeId: null }

  const byId = new Map(rs.map((r) => [r.id, r.gauge]))
  return {
    ...state,
    tick: state.tick + result.ticks,
    activeId: result.id,
    combatants: state.combatants.map((c) =>
      byId.has(c.id) ? { ...c, gauge: byId.get(c.id)! } : c,
    ),
  }
}

/**
 * 預覽接下來 n 個行動者（含當前行動者）。純讀取，不改動狀態。
 * 這是玩家介面上「①呂 ②張 ③呂 ④關」那一條。
 */
export function previewOrder(state: BattleState, n: number): string[] {
  const out: string[] = []
  if (state.activeId) out.push(state.activeId)
  const rs = runners(state)
  while (out.length < n) {
    const result = step(rs)
    if (!result) break
    out.push(result.id)
  }
  return out
}
