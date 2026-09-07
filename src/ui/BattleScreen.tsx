/**
 * 卡牌戰畫面 —— 純 HTML / CSS，沒有任何 3D。
 * 它只負責把 BattleState 畫出來，所有規則都在 core/ 裡。
 */
import { useMemo } from 'react'
import { previewOrder } from '../core/battle/atb'
import { attemptFlee, endTurn, enemyIntent, playCard, selectTarget } from '../core/battle/battle'
import { rollFlee } from '../core/battle/effects'
import { GAUGE_FULL, type BattleState, type Combatant } from '../core/battle/types'

interface Props {
  state: BattleState
  onChange: (next: BattleState) => void
  onRestart: () => void
}

function Portrait({ c, small }: { c: Combatant; small?: boolean }) {
  return (
    <div
      className={small ? 'portrait portrait--small' : 'portrait'}
      style={{ background: c.color }}
    >
      {c.name[0]}
    </div>
  )
}

function Bars({ c }: { c: Combatant }) {
  return (
    <div className="bars">
      {c.armor > 0 && (
        <div className="bar bar--armor">
          <span style={{ width: `${Math.min(100, (c.armor / c.maxHp) * 100)}%` }} />
          <em>甲 {c.armor}</em>
        </div>
      )}
      <div className="bar bar--hp">
        <span style={{ width: `${(c.hp / c.maxHp) * 100}%` }} />
        <em>
          {c.hp} / {c.maxHp}
        </em>
      </div>
    </div>
  )
}

export function BattleScreen({ state, onChange, onRestart }: Props) {
  const order = useMemo(() => previewOrder(state, 6), [state])
  const byId = useMemo(
    () => new Map(state.combatants.map((c) => [c.id, c])),
    [state.combatants],
  )

  const players = state.combatants.filter((c) => c.side === 'player')
  const enemies = state.combatants.filter((c) => c.side === 'enemy')
  const active = state.activeId ? byId.get(state.activeId) : null

  // 下一個要動的敵人，用來畫意圖預告
  const nextEnemyId = order.slice(1).find((id) => byId.get(id)?.side === 'enemy')
  const intent = nextEnemyId ? enemyIntent(state, nextEnemyId) : null
  const fleeChance = state.activeId ? rollFlee(state, state.activeId).chance : 0

  const over = state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled'

  return (
    <div className="battle">
      <header className="topbar">
        <div className="tick">第 {state.tick} 刻</div>
        <div className="order">
          {order.map((id, i) => {
            const c = byId.get(id)
            if (!c) return null
            return (
              <span
                key={`${id}-${i}`}
                className={`chip ${i === 0 ? 'chip--now' : ''} chip--${c.side}`}
                style={{ borderColor: c.color }}
              >
                {i + 1}
                {c.name}
              </span>
            )
          })}
        </div>
      </header>

      <section className="side side--enemy">
        {enemies.map((c) => (
          <button
            key={c.id}
            className={`unit ${state.targetId === c.id ? 'unit--targeted' : ''} ${
              c.hp === 0 ? 'unit--down' : ''
            }`}
            onClick={() => onChange(selectTarget(state, c.id))}
            disabled={over || c.hp === 0}
          >
            <Portrait c={c} />
            <div className="unit__body">
              <div className="unit__name">
                {c.name}
                {c.arm && <span className="tag">{c.arm}兵</span>}
                <span className="tag tag--stat">速 {c.speed}</span>
                <span className="tag tag--stat">能 {c.maxEnergy}</span>
              </div>
              <Bars c={c} />
              <div className="gauge">
                <span style={{ width: `${Math.min(100, (c.gauge / GAUGE_FULL) * 100)}%` }} />
              </div>
            </div>
          </button>
        ))}

        {intent && intent.moves.length > 0 && (
          <div className="intent">
            <div className="intent__title">
              下一輪 · {byId.get(nextEnemyId!)?.name} 預計造成{' '}
              <b>{intent.totalDamage}</b>
            </div>
            {intent.moves.map((m, i) => (
              <div key={i} className="intent__move">
                <b>{m.name}</b> <span>{m.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="side side--player">
        {players.map((c) => (
          <div
            key={c.id}
            className={`unit ${active?.id === c.id ? 'unit--active' : ''} ${
              c.hp === 0 ? 'unit--down' : ''
            }`}
          >
            <Portrait c={c} small />
            <div className="unit__body">
              <div className="unit__name">
                {c.name}
                {c.arm && <span className="tag">{c.arm}兵</span>}
                {c.wound === 'wounded' && <span className="tag tag--wound">重傷</span>}
              </div>
              <Bars c={c} />
              <div className="gauge">
                <span style={{ width: `${Math.min(100, (c.gauge / GAUGE_FULL) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </section>

      {active && !over && (
        <section className="turn">
          <div className="turn__head">
            <span className="turn__who" style={{ color: active.color }}>
              {active.name} 的回合
            </span>
            <span className="energy">
              {Array.from({ length: active.maxEnergy }, (_, i) => (
                <i key={i} className={i < state.energy ? 'on' : ''} />
              ))}
              <em>
                {state.energy} / {active.maxEnergy}
              </em>
            </span>
            {state.empower > 0 && <span className="empower">傷害 +{state.empower}</span>}
            <span className="piles">
              牌堆 {active.deck.length} · 棄 {active.discard.length}
            </span>
          </div>

          <div className="hand">
            {active.hand.map((card) => {
              const affordable = card.cost <= state.energy
              return (
                <button
                  key={card.id}
                  className={`card ${affordable ? '' : 'card--dim'} ${
                    card.fromArm ? 'card--arm' : ''
                  }`}
                  disabled={!affordable}
                  onClick={() => onChange(playCard(state, card.id))}
                >
                  <div className="card__cost">{card.cost}</div>
                  <div className="card__name">{card.name}</div>
                  <div className="card__text">{card.text}</div>
                  {card.fromArm && <div className="card__arm">{card.fromArm}兵</div>}
                </button>
              )
            })}
            {active.hand.length === 0 && <div className="hand__empty">手牌已空</div>}
          </div>

          <div className="actions">
            <button className="btn btn--primary" onClick={() => onChange(endTurn(state))}>
              結束回合
            </button>
            <button className="btn" onClick={() => onChange(attemptFlee(state))}>
              撤退（成功率 {fleeChance}%）
            </button>
          </div>
        </section>
      )}

      {over && (
        <section className="result">
          <h2 className={state.phase === 'won' ? 'win' : 'lose'}>
            {state.phase === 'won' ? '勝 — 你贏了呂布一場' : null}
            {state.phase === 'lost' ? '敗 — 三英全數倒下' : null}
            {state.phase === 'fled' ? '撤退 — 這一戰不算數' : null}
          </h2>
          <button className="btn btn--primary" onClick={onRestart}>
            再打一次
          </button>
        </section>
      )}

      <section className="log">
        {state.log
          .slice(-14)
          .reverse()
          .map((entry, i) => (
            <div key={i} className="log__line">
              <span className="log__tick">{entry.tick}</span>
              {entry.text}
            </div>
          ))}
      </section>
    </div>
  )
}
