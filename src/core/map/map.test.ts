import { describe, expect, it } from 'vitest'
import { createScenario } from '../../data/scenario'
import { resolveTroopCombat, skillNames, unitMove, unitRange } from './combat'
import { attack, attackTargets, endDay, movementRange, splitUnit } from './game'
import { key, reachable, tileAt } from './grid'
import type { MapState, MapUnit } from './types'
import { counterModifier } from './types'

const find = (s: MapState, name: string): MapUnit => {
  const u = s.units.find((x) => x.general === name)
  if (!u) throw new Error(`no unit for ${name}`)
  return u
}

/** 把單位直接搬到指定格，繞過移動限制，方便組測試場面 */
function place(s: MapState, id: string, x: number, y: number): MapState {
  return { ...s, units: s.units.map((u) => (u.id === id ? { ...u, pos: { x, y } } : u)) }
}

describe('兵種數值', () => {
  it('移動力與射程照兵種走，重傷 −1 移動', () => {
    const s = createScenario()
    expect(unitMove(find(s, '關羽'))).toBe(5) // 馬
    expect(unitMove(find(s, '張飛'))).toBe(3) // 槍
    expect(unitRange(find(s, '關羽'))).toBe(1)

    const wounded = { ...find(s, '關羽'), wound: 'wounded' as const }
    expect(unitMove(wounded)).toBe(4)
  })

  it('單獨武將比帶兵的槍兵快', () => {
    const s = createScenario()
    const solo = { ...find(s, '張飛'), arm: null, troops: 0 }
    expect(unitMove(solo)).toBe(4)
    expect(unitMove(find(s, '張飛'))).toBe(3)
  })

  it('弓兵射程 3', () => {
    const s = createScenario()
    const archer = s.units.find((u) => !u.general && u.arm === '弓')!
    expect(unitRange(archer)).toBe(3)
  })

  it('相剋：槍 → 馬 → 弓 → 槍，斧不參與', () => {
    expect(counterModifier('槍', '馬')).toBe(1.5)
    expect(counterModifier('馬', '槍')).toBe(0.7)
    expect(counterModifier('馬', '弓')).toBe(1.5)
    expect(counterModifier('弓', '槍')).toBe(1.5)
    expect(counterModifier('斧', '槍')).toBe(1)
    expect(counterModifier('槍', '斧')).toBe(1)
  })
})

describe('特技的適性門檻', () => {
  it('無將守軍只有基礎特技', () => {
    const s = createScenario()
    const archer = s.units.find((u) => !u.general && u.arm === '弓')!
    expect(skillNames(archer)).toEqual(['齊射'])
  })

  it('適性 A 以上才開高階特技', () => {
    const s = createScenario()
    // 關羽 馬 A → 連環
    expect(skillNames(find(s, '關羽'))).toEqual(['突擊', '連環'])
    // 張飛 槍 S → 亂突
    expect(skillNames(find(s, '張飛'))).toEqual(['槍衾', '亂突'])
    // 劉備 槍 B → 只有基礎
    expect(skillNames(find(s, '劉備'))).toEqual(['槍衾'])
  })
})

describe('移動', () => {
  it('水域不可通行，樹林消耗 2', () => {
    const s = createScenario()
    const guan = find(s, '關羽')
    const range = reachable(s, guan, unitMove(guan))

    for (const k of range.keys()) {
      const [x, y] = k.split(',').map(Number)
      expect(tileAt(s, { x, y }).terrain).not.toBe('water')
    }
    // 起點自己一定在範圍內
    expect(range.get(key(guan.pos))).toBe(0)
  })

  it('已移動過的單位沒有可達格', () => {
    const s = createScenario()
    const moved = { ...find(s, '關羽'), moved: true }
    expect(movementRange(s, moved).size).toBe(0)
  })
})

describe('數值結算', () => {
  it('槍兵被近戰攻擊會槍衾反擊，攻擊方也掉兵', () => {
    let s = createScenario()
    const fei = find(s, '張飛') // 槍
    const horse = s.units.find((u) => !u.general && u.arm === '馬')!
    s = place(s, horse.id, fei.pos.x + 1, fei.pos.y)

    const before = s.units.find((u) => u.id === horse.id)!.troops
    const res = resolveTroopCombat(s, horse.id, fei.id, false)

    const feiAfter = res.state.units.find((u) => u.id === fei.id)!
    const horseAfter = res.state.units.find((u) => u.id === horse.id)!
    expect(feiAfter.troops).toBeLessThan(3000)
    expect(horseAfter.troops).toBeLessThan(before) // 吃了反擊
    expect(res.lines.some((l) => l.includes('槍衾'))).toBe(true)
  })

  it('弓兵遠距離攻擊不遭反擊', () => {
    let s = createScenario()
    const fei = find(s, '張飛')
    const archer = s.units.find((u) => !u.general && u.arm === '弓')!
    s = place(s, archer.id, fei.pos.x + 3, fei.pos.y)

    const res = resolveTroopCombat(s, archer.id, fei.id, false)
    const archerAfter = res.state.units.find((u) => u.id === archer.id)!
    expect(archerAfter.troops).toBe(archer.troops)
    expect(res.lines.some((l) => l.includes('反擊'))).toBe(false)
  })

  it('兵力歸零時武將重傷並脫離部隊，而不是直接死', () => {
    let s = createScenario()
    const fei = find(s, '張飛')
    const axe = s.units.find((u) => !u.general && u.arm === '斧')!
    s = place(s, axe.id, fei.pos.x + 1, fei.pos.y)
    s = { ...s, units: s.units.map((u) => (u.id === fei.id ? { ...u, troops: 1 } : u)) }

    const res = resolveTroopCombat(s, axe.id, fei.id, false)
    const feiAfter = res.state.units.find((u) => u.id === fei.id)!
    expect(feiAfter.wound).toBe('wounded')
    expect(feiAfter.arm).toBeNull()
    expect(feiAfter.troops).toBe(0)
  })
})

describe('開戰判定', () => {
  it('雙方都有武將 → 進卡牌戰，不在地圖上結算', () => {
    let s = createScenario()
    const guan = find(s, '關羽')
    const lu = find(s, '呂布')
    s = place(s, guan.id, lu.pos.x - 1, lu.pos.y)

    const next = attack(s, guan.id, lu.id)
    expect(next.phase).toBe('battle')
    expect(next.pendingBattle?.playerIds).toContain(guan.id)
    expect(next.pendingBattle?.enemyIds).toContain(lu.id)
  })

  it('援護：相鄰的友軍武將會被拉進同一場卡牌戰', () => {
    let s = createScenario()
    const guan = find(s, '關羽')
    const fei = find(s, '張飛')
    const bei = find(s, '劉備')
    const lu = find(s, '呂布')

    // 三兄弟擠在呂布旁邊
    s = place(s, guan.id, lu.pos.x - 1, lu.pos.y)
    s = place(s, fei.id, lu.pos.x - 1, lu.pos.y - 1)
    s = place(s, bei.id, lu.pos.x - 1, lu.pos.y + 1)

    const next = attack(s, guan.id, lu.id)
    expect(next.pendingBattle?.playerIds).toHaveLength(3)
  })

  it('任一方無將 → 地圖數值結算，不進卡牌戰', () => {
    let s = createScenario()
    const guan = find(s, '關羽')
    const archer = s.units.find((u) => !u.general && u.arm === '弓')!
    s = place(s, archer.id, guan.pos.x + 1, guan.pos.y)

    const next = attack(s, guan.id, archer.id)
    expect(next.phase).not.toBe('battle')
    expect(next.pendingBattle).toBeNull()
  })
})

describe('拆分', () => {
  it('武將離開部隊後變快、失去兵種特技', () => {
    const s = createScenario()
    const guan = find(s, '關羽')
    const next = splitUnit(s, guan.id)

    const general = next.units.find((u) => u.general === '關羽')!
    const troop = next.units.find((u) => !u.general && u.arm === '馬' && u.side === 'player')!

    expect(general.arm).toBeNull()
    expect(unitMove(general)).toBe(4) // 單身武將
    expect(skillNames(general)).toEqual([])
    expect(troop.troops).toBe(3000)
    expect(skillNames(troop)).toEqual(['突擊']) // 沒有武將 → 沒有連環
  })
})

describe('日數', () => {
  it('結束今日會推進日期並重置行動旗標', () => {
    const s = createScenario()
    const next = endDay(s)
    expect(next.day).toBe(2)
    expect(next.units.every((u) => !u.moved && !u.acted)).toBe(true)
  })

  it('超過期限就判敗', () => {
    const s = { ...createScenario(), day: 30 }
    const next = endDay(s)
    expect(next.phase).toBe('lost')
  })
})

describe('射程', () => {
  it('弓兵在 3 格外仍能攻擊，槍兵不行', () => {
    let s = createScenario()
    const guan = find(s, '關羽')
    const archer = s.units.find((u) => !u.general && u.arm === '弓')!
    const spear = s.units.find((u) => !u.general && u.arm === '槍')!

    s = place(s, archer.id, guan.pos.x + 3, guan.pos.y)
    s = place(s, spear.id, guan.pos.x + 3, guan.pos.y + 1)

    expect(attackTargets(s, s.units.find((u) => u.id === archer.id)!)).toHaveLength(1)
    expect(attackTargets(s, s.units.find((u) => u.id === spear.id)!)).toHaveLength(0)
  })
})
