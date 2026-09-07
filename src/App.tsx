import { useState } from 'react'
import { createBattle } from './core/battle/battle'
import type { BattleState } from './core/battle/types'
import { makeCombatant, type Loadout } from './data/generals'
import { BattleScreen } from './ui/BattleScreen'

type Level = 1 | 2 | 3

interface Setup {
  heroes: string[]
  level: Level
}

const ARMS: Record<string, '槍' | '馬'> = { 劉備: '槍', 關羽: '馬', 張飛: '槍' }

function start(setup: Setup): BattleState {
  const players = setup.heroes.map((name) => {
    const lo: Loadout = { arm: ARMS[name], troopTier: 'full', level: setup.level }
    return makeCombatant(name, lo)
  })
  const boss = makeCombatant('呂布', { arm: '馬', troopTier: 'full' })
  return createBattle(players, [boss], Math.floor(Math.random() * 1e9))
}

const ALL_HEROES = ['劉備', '關羽', '張飛']

export function App() {
  const [setup, setSetup] = useState<Setup>({ heroes: ALL_HEROES, level: 1 })
  const [state, setState] = useState<BattleState | null>(null)

  if (!state) {
    return (
      <div className="setup">
        <h1>三英戰呂布</h1>
        <p className="setup__sub">
          援護規則：一起上陣的武將會進同一場卡牌戰。呂布絕不撤退。
        </p>

        <div className="setup__group">
          <label>出戰武將</label>
          <div className="setup__row">
            {ALL_HEROES.map((name) => {
              const on = setup.heroes.includes(name)
              return (
                <button
                  key={name}
                  className={`pill ${on ? 'pill--on' : ''}`}
                  onClick={() =>
                    setSetup((s) => ({
                      ...s,
                      heroes: on
                        ? s.heroes.filter((h) => h !== name)
                        : ALL_HEROES.filter((h) => h === name || s.heroes.includes(h)),
                    }))
                  }
                >
                  {name}
                  <small>{ARMS[name]}兵</small>
                </button>
              )
            })}
          </div>
        </div>

        <div className="setup__group">
          <label>牌樹等級（內政「訓練」解鎖）</label>
          <div className="setup__row">
            {([1, 2, 3] as Level[]).map((lv) => (
              <button
                key={lv}
                className={`pill ${setup.level === lv ? 'pill--on' : ''}`}
                onClick={() => setSetup((s) => ({ ...s, level: lv }))}
              >
                Lv{lv}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn--primary btn--big"
          disabled={setup.heroes.length === 0}
          onClick={() => setState(start(setup))}
        >
          開戰
        </button>

        <div className="setup__note">
          模擬勝率（400 場）：1v1 0% · 2v1 Lv3 約 1% · 3v1 Lv1 11% / Lv2 55% / Lv3 71%
        </div>
      </div>
    )
  }

  return (
    <BattleScreen state={state} onChange={setState} onRestart={() => setState(null)} />
  )
}
