/**
 * 地圖畫面的 HUD。3D 由 MapView 負責，這裡只管日數、選取、指令與戰報。
 */
import { useMemo } from 'react'
import { skillNames, unitMove, unitRange } from '../core/map/combat'
import {
  attack,
  attackTargets,
  endDay,
  mergeUnits,
  moveUnit,
  movementRange,
  selectUnit,
  splitUnit,
  unitById,
} from '../core/map/game'
import { key, neighbors, unitAt } from '../core/map/grid'
import { manhattan, type Coord, type MapState, type MapUnit } from '../core/map/types'
import { MapView } from '../render3d/MapView'

interface Props {
  state: MapState
  onChange: (next: MapState) => void
  onRestart: () => void
}

function tierLabel(u: MapUnit): string {
  if (!u.arm) return '單身'
  const r = u.troops / u.maxTroops
  if (r >= 0.75) return '滿編'
  if (r >= 0.35) return '半殘'
  return '殘兵'
}

export function MapScreen({ state, onChange, onRestart }: Props) {
  const selected = unitById(state, state.selectedId)
  const mine = selected?.side === 'player' ? selected : undefined

  const moveCells = useMemo(() => {
    if (!mine || state.phase !== 'player') return new Set<string>()
    return new Set(movementRange(state, mine).keys())
  }, [state, mine])

  const targets = useMemo(() => {
    if (!mine || state.phase !== 'player') return []
    return attackTargets(state, mine)
  }, [state, mine])

  const targetIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets])

  /** 相鄰、可以合流的無將部隊 */
  const mergeable = useMemo(() => {
    if (!mine || mine.arm || state.phase !== 'player') return null
    for (const n of neighbors(state, mine.pos)) {
      const other = unitAt(state, n)
      if (other && other.side === 'player' && !other.general && other.arm) return other
    }
    return null
  }, [state, mine])

  const handleTile = (c: Coord) => {
    if (state.phase !== 'player') return
    const occupant = unitAt(state, c)
    if (occupant) {
      handleUnit(occupant)
      return
    }
    if (mine && moveCells.has(key(c))) {
      onChange(moveUnit(state, mine.id, c))
      return
    }
    onChange(selectUnit(state, null))
  }

  const handleUnit = (u: MapUnit) => {
    if (state.phase !== 'player') return
    if (mine && targetIds.has(u.id)) {
      onChange(attack(state, mine.id, u.id))
      return
    }
    onChange(selectUnit(state, u.id))
  }

  const over = state.phase === 'won' || state.phase === 'lost'
  const daysLeft = state.dayLimit - state.day + 1

  return (
    <div className="map">
      <header className="maptop">
        <div className={`day ${daysLeft <= 7 ? 'day--urgent' : ''}`}>
          第 <b>{state.day}</b> 日 / {state.dayLimit}
          <span>剩 {daysLeft} 日</span>
        </div>
        <div className="maptop__goal">目標：在對呂布的卡牌戰中獲勝一次</div>
        <button className="btn" onClick={() => onChange(endDay(state))} disabled={over}>
          結束今日
        </button>
      </header>

      <MapView
        state={state}
        moveCells={moveCells}
        targetIds={targetIds}
        onTileClick={handleTile}
        onUnitClick={handleUnit}
      />

      <aside className="mapside">
        {selected ? (
          <div className="inspect">
            <div className="inspect__head">
              <b>{selected.general ?? `${selected.arm}兵`}</b>
              {selected.arm && <span className="tag">{selected.arm}兵 · {tierLabel(selected)}</span>}
              {selected.wound === 'wounded' && <span className="tag tag--wound">重傷</span>}
            </div>
            {selected.arm && (
              <div className="inspect__row">
                兵力 {selected.troops} / {selected.maxTroops}
              </div>
            )}
            <div className="inspect__row">
              移動 {unitMove(selected)} · 射程 {unitRange(selected)}
            </div>
            {skillNames(selected).length > 0 && (
              <div className="inspect__row inspect__skills">
                {skillNames(selected).map((s) => (
                  <span key={s} className="skill">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {selected.side === 'player' && (
              <div className="inspect__row inspect__state">
                {selected.moved ? '已移動' : '可移動'} · {selected.acted ? '已行動' : '可行動'}
              </div>
            )}

            {mine && !over && (
              <div className="inspect__actions">
                {mine.general && mine.arm && (
                  <button
                    className="btn btn--sm"
                    onClick={() => onChange(splitUnit(state, mine.id))}
                    disabled={mine.moved}
                  >
                    拆分武將
                  </button>
                )}
                {mergeable && (
                  <button
                    className="btn btn--sm"
                    onClick={() => onChange(mergeUnits(state, mine.id, mergeable.id))}
                    disabled={mine.moved}
                  >
                    接管 {mergeable.arm}兵
                  </button>
                )}
              </div>
            )}

            {targets.length > 0 && (
              <div className="inspect__hint">
                可攻擊 {targets.length} 個目標 —— 點紅框單位開戰
              </div>
            )}
          </div>
        ) : (
          <div className="inspect inspect--empty">
            點選部隊查看。黃色格子是可移動範圍，紅框是可攻擊目標。
            <div className="legend">
              <span>▲ 槍</span>
              <span>● 弓</span>
              <span>▬ 馬</span>
              <span>◆ 斧</span>
              <span className="legend__gold">◆ 武將</span>
            </div>
          </div>
        )}

        <div className="maplog">
          {state.log
            .slice(-30)
            .reverse()
            .map((l, i) => (
              <div key={i} className="log__line">
                <span className="log__tick">D{l.day}</span>
                {l.text}
              </div>
            ))}
        </div>
      </aside>

      {over && (
        <div className="overlay">
          <div className="overlay__box">
            <h2 className={state.phase === 'won' ? 'win' : 'lose'}>
              {state.phase === 'won' ? '勝 — 呂布敗退' : '敗'}
            </h2>
            <p>
              第 {state.day} 日 / {state.dayLimit}
            </p>
            <button className="btn btn--primary" onClick={onRestart}>
              重新開始
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 給 App 判斷援護人數用 */
export function adjacentAllies(state: MapState, u: MapUnit): MapUnit[] {
  return state.units.filter(
    (o) => o.id !== u.id && o.side === u.side && o.general && manhattan(o.pos, u.pos) === 1,
  )
}
