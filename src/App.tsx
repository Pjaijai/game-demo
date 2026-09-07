/**
 * 把地圖層與卡牌層接起來。
 *
 *   地圖：將 vs 將 → 建立 Combatant → 卡牌戰
 *   卡牌戰結束 → 換算成傷勢與兵力損失 → 寫回地圖
 *
 * 兩層之間唯一的資料流就是這裡：帶的兵種與兵力檔位決定護甲與兵種牌，
 * 牌樹等級決定手牌，戰果決定傷勢鏈。
 */
import { useCallback, useEffect, useState } from 'react'
import { createBattle } from './core/battle/battle'
import type { BattleState, TroopTier } from './core/battle/types'
import {
  applyBattleOutcome,
  unitById,
  type BattleOutcome,
} from './core/map/game'
import type { MapState, MapUnit } from './core/map/types'
import { GENERALS, makeCombatant } from './data/generals'
import { createScenario } from './data/scenario'
import { BattleScreen } from './ui/BattleScreen'
import { MapScreen } from './ui/MapScreen'

function tierOf(u: MapUnit): TroopTier {
  if (!u.arm || u.maxTroops === 0) return 'none'
  const r = u.troops / u.maxTroops
  if (r >= 0.75) return 'full'
  if (r >= 0.35) return 'half'
  return 'broken'
}

function powerOf(u: MapUnit): number {
  if (!u.general) return 0
  const def = GENERALS[u.general]
  if (!def) return 0
  return def.power - (u.wound === 'wounded' ? 20 : 0)
}

/** 從地圖上的參戰單位建立一場卡牌戰 */
function buildBattle(map: MapState): {
  battle: BattleState
  unitByGeneral: Map<string, string>
} | null {
  const pending = map.pendingBattle
  if (!pending) return null

  const unitByGeneral = new Map<string, string>()
  const toCombatant = (id: string) => {
    const u = unitById(map, id)
    if (!u || !u.general) return null
    unitByGeneral.set(u.general, u.id)
    return makeCombatant(u.general, {
      arm: u.arm,
      troopTier: tierOf(u),
      level: u.level,
      wound: u.wound,
    })
  }

  const players = pending.playerIds.map(toCombatant).filter((c) => c !== null)
  const enemies = pending.enemyIds.map(toCombatant).filter((c) => c !== null)
  if (players.length === 0 || enemies.length === 0) return null

  return {
    battle: createBattle(players, enemies, Math.floor(Math.random() * 1e9)),
    unitByGeneral,
  }
}

export function App() {
  const [map, setMap] = useState<MapState>(() => createScenario())
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [unitByGeneral, setUnitByGeneral] = useState<Map<string, string>>(new Map())

  // 地圖進入 battle 階段就開場
  useEffect(() => {
    if (!map.pendingBattle || battle) return
    const built = buildBattle(map)
    if (built) {
      setBattle(built.battle)
      setUnitByGeneral(built.unitByGeneral)
    }
  }, [map, battle])

  const finishBattle = useCallback(
    (final: BattleState) => {
      const playerSide = final.combatants.filter((c) => c.side === 'player')
      const enemySide = final.combatants.filter((c) => c.side === 'enemy')

      const result: BattleOutcome['result'] =
        final.phase === 'won' ? 'won' : final.phase === 'fled' ? 'fled' : 'lost'

      // 碾壓判定：戰力差 ≥25 且勝方殘血 ≥70%
      const winners = result === 'won' ? playerSide : enemySide
      const losers = result === 'won' ? enemySide : playerSide
      const sumPower = (side: typeof playerSide) =>
        side.reduce((n, c) => {
          const uid = unitByGeneral.get(c.name)
          const u = uid ? unitById(map, uid) : undefined
          return n + (u ? powerOf(u) : 0)
        }, 0)
      const winnerHp =
        winners.reduce((n, c) => n + c.hp, 0) /
        Math.max(1, winners.reduce((n, c) => n + c.maxHp, 0))
      const crush =
        result === 'lost' && sumPower(winners) - sumPower(losers) >= 25 && winnerHp >= 0.7

      const outcome: BattleOutcome = {
        result,
        crush,
        bossInvolved: enemySide.some((c) => c.name === '呂布'),
        survivors: playerSide
          .map((c) => {
            const unitId = unitByGeneral.get(c.name)
            return unitId
              ? { unitId, hpRatio: c.hp / c.maxHp, alive: c.hp > 0 }
              : null
          })
          .filter((s) => s !== null),
      }

      setBattle(null)
      setMap((m) => applyBattleOutcome(m, outcome))
    },
    [map, unitByGeneral],
  )

  if (battle) {
    const done =
      battle.phase === 'won' || battle.phase === 'lost' || battle.phase === 'fled'
    return (
      <BattleScreen
        state={battle}
        onChange={setBattle}
        onRestart={() => finishBattle(battle)}
        {...(done ? { finishLabel: '回到地圖' } : {})}
      />
    )
  }

  return (
    <MapScreen state={map} onChange={setMap} onRestart={() => setMap(createScenario())} />
  )
}
