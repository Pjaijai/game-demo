/**
 * 地圖層的狀態機：選取、移動、開戰、拆分合流、結束一日、敵方行動。
 *
 * 一日 = 內政階段（第 7–8 週）＋ 軍事階段。目前只有軍事，但日數與
 * 30 日期限已經在跑 —— 那是整場戰役的引信。
 */
import { resolveTroopCombat, unitMove, unitRange } from './combat'
import { key, neighbors, pathTo, reachable, tileAt, tilesInRange, unitAt } from './grid'
import { manhattan, sameCoord, type Coord, type MapState, type MapUnit } from './types'

function log(state: MapState, ...texts: string[]): MapState {
  if (texts.length === 0) return state
  return { ...state, log: [...state.log, ...texts.map((text) => ({ day: state.day, text }))] }
}

function patch(state: MapState, id: string, fn: (u: MapUnit) => MapUnit): MapState {
  return { ...state, units: state.units.map((u) => (u.id === id ? fn(u) : u)) }
}

export function unitById(state: MapState, id: string | null): MapUnit | undefined {
  if (!id) return undefined
  return state.units.find((u) => u.id === id)
}

/** 可移動到的格子 */
export function movementRange(state: MapState, unit: MapUnit): Map<string, number> {
  if (unit.moved) return new Map()
  return reachable(state, unit, unitMove(unit))
}

/** 從目前位置可攻擊的敵人 */
export function attackTargets(state: MapState, unit: MapUnit): MapUnit[] {
  if (unit.acted) return []
  const cells = tilesInRange(state, unit.pos, unitRange(unit))
  const out: MapUnit[] = []
  for (const c of cells) {
    const other = unitAt(state, c)
    if (other && other.side !== unit.side) out.push(other)
  }
  return out
}

export function selectUnit(state: MapState, id: string | null): MapState {
  return { ...state, selectedId: id }
}

export function moveUnit(state: MapState, unitId: string, dest: Coord): MapState {
  const unit = unitById(state, unitId)
  if (!unit || unit.moved || state.phase === 'battle') return state
  const range = movementRange(state, unit)
  if (!range.has(key(dest))) return state
  if (sameCoord(unit.pos, dest)) return state

  const path = pathTo(state, unit, dest, unitMove(unit))
  if (path.length === 0) return state

  return patch(state, unitId, (u) => ({ ...u, pos: dest, moved: true }))
}

/** 卡牌戰的參戰名單：主將 + 相鄰的同陣營武將（援護） */
function gatherSupport(state: MapState, anchor: MapUnit): string[] {
  const ids = [anchor.id]
  for (const n of neighbors(state, anchor.pos)) {
    const other = unitAt(state, n)
    if (other && other.side === anchor.side && other.general && other.wound !== 'dead') {
      ids.push(other.id)
    }
  }
  return ids
}

/**
 * 攻擊。雙方都有武將 → 進卡牌戰（含援護）；否則地圖上數值結算。
 */
export function attack(state: MapState, attackerId: string, defenderId: string): MapState {
  const attacker = unitById(state, attackerId)
  const defender = unitById(state, defenderId)
  if (!attacker || !defender || attacker.acted) return state
  if (manhattan(attacker.pos, defender.pos) > unitRange(attacker)) return state

  if (attacker.general && defender.general) {
    const playerAnchor = attacker.side === 'player' ? attacker : defender
    const enemyAnchor = attacker.side === 'player' ? defender : attacker
    return {
      ...state,
      phase: 'battle',
      pendingBattle: {
        attackerId,
        defenderId,
        playerIds: gatherSupport(state, playerAnchor),
        enemyIds: gatherSupport(state, enemyAnchor),
      },
    }
  }

  const res = resolveTroopCombat(state, attackerId, defenderId, attacker.moved)
  let s = log(res.state, ...res.lines)
  if (s.units.some((u) => u.id === attackerId)) {
    s = patch(s, attackerId, (u) => (u.acted ? u : { ...u, acted: true, moved: true }))
  }
  return checkEnd(s)
}

/** 拆分：武將離開部隊，站到相鄰空格。武將變快但變脆。 */
export function splitUnit(state: MapState, unitId: string): MapState {
  const unit = unitById(state, unitId)
  if (!unit || !unit.general || !unit.arm) return state
  const spot = neighbors(state, unit.pos).find(
    (n) => !unitAt(state, n) && Number.isFinite(tileAt(state, n).terrain === 'water' ? Infinity : 1),
  )
  if (!spot) return state

  const troop: MapUnit = {
    id: `${unit.id}-troop-${state.day}`,
    side: unit.side,
    pos: unit.pos,
    general: null,
    arm: unit.arm,
    troops: unit.troops,
    maxTroops: unit.maxTroops,
    level: 1,
    wound: 'healthy',
    moved: true,
    acted: true,
  }

  const general: MapUnit = {
    ...unit,
    pos: spot,
    arm: null,
    troops: 0,
    maxTroops: 0,
    moved: true,
    acted: true,
  }

  return log(
    { ...state, units: [...state.units.filter((u) => u.id !== unitId), troop, general] },
    `${unit.general} 與部隊分離`,
  )
}

/** 合流：相鄰的單獨武將與無將部隊合併 */
export function mergeUnits(state: MapState, generalId: string, troopId: string): MapState {
  const g = unitById(state, generalId)
  const t = unitById(state, troopId)
  if (!g || !t || g.arm || !t.arm || t.general) return state
  if (manhattan(g.pos, t.pos) !== 1) return state

  const merged: MapUnit = {
    ...g,
    pos: t.pos,
    arm: t.arm,
    troops: t.troops,
    maxTroops: t.maxTroops,
    moved: true,
    acted: true,
  }
  return log(
    {
      ...state,
      selectedId: merged.id,
      units: [...state.units.filter((u) => u.id !== generalId && u.id !== troopId), merged],
    },
    `${g.general} 接管了 ${t.arm}兵`,
  )
}

// ── 敵方行動 ────────────────────────────────────────────

function enemyTurn(state: MapState): MapState {
  let s = state
  const enemies = s.units.filter((u) => u.side === 'enemy').map((u) => u.id)

  for (const id of enemies) {
    let unit = unitById(s, id)
    if (!unit) continue

    // 先看能不能直接打
    let targets = attackTargets(s, unit)
    if (targets.length === 0 && unit.general) {
      // 呂布會主動追擊落單的玩家武將
      const prey = s.units
        .filter((u) => u.side === 'player')
        .sort(
          (a, b) =>
            manhattan(unit!.pos, a.pos) - manhattan(unit!.pos, b.pos) ||
            (a.general ? 0 : 1) - (b.general ? 0 : 1),
        )[0]
      if (prey) {
        const range = movementRange(s, unit)
        let best: Coord | null = null
        let bestDist = manhattan(unit.pos, prey.pos)
        for (const k of range.keys()) {
          const [x, y] = k.split(',').map(Number)
          const d = manhattan({ x, y }, prey.pos)
          if (d < bestDist) {
            bestDist = d
            best = { x, y }
          }
        }
        if (best) s = moveUnit(s, id, best)
      }
      unit = unitById(s, id)
      if (!unit) continue
      targets = attackTargets(s, unit)
    }

    if (targets.length > 0) {
      // 挑最弱的下手
      const target = targets.slice().sort((a, b) => a.troops - b.troops)[0]
      s = attack(s, id, target.id)
      // 進了卡牌戰就停下，等玩家打完
      if (s.phase === 'battle') return s
    }
  }
  return s
}

/** 結束今日：敵方行動 → 日數 +1 → 重置行動旗標 */
export function endDay(state: MapState): MapState {
  if (state.phase !== 'player') return state

  let s = enemyTurn({ ...state, phase: 'enemy' })
  if (s.phase === 'battle') return s

  s = {
    ...s,
    day: s.day + 1,
    phase: 'player',
    selectedId: null,
    units: s.units.map((u) => ({ ...u, moved: false, acted: false })),
  }
  return checkEnd(s)
}

export function checkEnd(state: MapState): MapState {
  if (state.phase === 'won' || state.phase === 'lost') return state

  const heroes = state.units.filter((u) => u.side === 'player' && u.general)
  if (heroes.length === 0) {
    return log({ ...state, phase: 'lost' }, '劉關張全數倒下 —— 敗')
  }
  if (state.day > state.dayLimit) {
    return log({ ...state, phase: 'lost' }, `第 ${state.dayLimit} 日已盡，未能擊敗呂布 —— 敗`)
  }
  return state
}

// ── 卡牌戰結果回寫 ────────────────────────────────────────

export interface BattleOutcome {
  result: 'won' | 'lost' | 'fled'
  /** 我方每位參戰武將的殘存狀況 */
  survivors: { unitId: string; hpRatio: number; alive: boolean }[]
  /** 敵方主將是否為呂布 */
  bossInvolved: boolean
  /**
   * 碾壓：戰力差 ≥25 且勝方殘血 ≥70%。
   * 成立時敗方武將直接陣亡，跳過重傷這一階。
   */
  crush: boolean
}

/**
 * 卡牌戰結束後把結果寫回地圖。
 * 贏呂布一場就直接結束整場戰役 —— 這是唯一的勝利條件。
 */
export function applyBattleOutcome(state: MapState, outcome: BattleOutcome): MapState {
  const pending = state.pendingBattle
  let s: MapState = { ...state, pendingBattle: null, phase: 'player' }
  if (!pending) return s

  if (outcome.result === 'won') {
    if (outcome.bossInvolved) {
      return log({ ...s, phase: 'won' }, '呂布敗退 —— 勝！')
    }
    s = log(s, '擊退了敵將')
    for (const id of pending.enemyIds) {
      s = { ...s, units: s.units.filter((u) => u.id !== id) }
    }
  } else if (outcome.result === 'lost') {
    for (const sv of outcome.survivors) {
      const u = unitById(s, sv.unitId)
      if (!u) continue
      const next = outcome.crush || u.wound === 'wounded' ? 'dead' : 'wounded'
      if (next === 'dead') {
        if (outcome.crush && u.wound === 'healthy') {
          s = log(s, `${u.general} 被完全碾壓`)
        }
        s = log({ ...s, units: s.units.filter((x) => x.id !== u.id) }, `${u.general} 陣亡`)
      } else {
        s = log(
          patch(s, u.id, (x) => ({
            ...x,
            wound: 'wounded',
            troops: Math.floor(x.troops * 0.3),
          })),
          `${u.general} 重傷，部隊折損七成`,
        )
      }
    }
  } else {
    // 撤退：兵力大損，但人保住了
    for (const sv of outcome.survivors) {
      s = patch(s, sv.unitId, (x) => ({ ...x, troops: Math.floor(x.troops * 0.7) }))
    }
    s = log(s, '我方撤出戰場')
  }

  s = { ...s, units: s.units.map((u) => (u.id === pending.attackerId ? { ...u, acted: true, moved: true } : u)) }
  return checkEnd(s)
}
