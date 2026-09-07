/**
 * 虎牢關戰役 —— v1 唯一的劇本。
 *
 * 勝：在對呂布的卡牌戰中贏一次
 * 敗：第 30 日結束仍未贏過他／劉關張全數陣亡
 */
import type { MapState, MapUnit, Terrain, Tile } from '../core/map/types'

const W = 12
const H = 9

/**
 * 地形圖。中央的樹林與丘陵讓「走大路快但暴露在弓兵射程下」
 * 變成真正的取捨。
 *   . 平原   f 樹林   h 丘陵   ~ 水
 */
const TERRAIN_MAP = [
  '..f....hh...',
  '..f..ff.h...',
  '.....ff.....',
  '~~...f......',
  '............',
  '~~...f......',
  '.....ff.....',
  '..f..ff.h...',
  '..f....hh...',
]

const TERRAIN_CHARS: Record<string, Terrain> = {
  '.': 'plain',
  f: 'forest',
  h: 'hill',
  '~': 'water',
}

function buildTiles(): Tile[] {
  const tiles: Tile[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = TERRAIN_MAP[y][x] ?? '.'
      tiles.push({ terrain: TERRAIN_CHARS[ch] ?? 'plain' })
    }
  }
  const put = (x: number, y: number, city: string, owner: 'player' | 'enemy') => {
    tiles[y * W + x] = { terrain: 'city', city, cityOwner: owner }
  }
  put(0, 4, '洛陽', 'player')
  put(11, 4, '虎牢關', 'enemy')
  return tiles
}

let seq = 0
const uid = (p: string) => `${p}-${++seq}`

function hero(
  general: string,
  arm: '槍' | '弓' | '馬' | '斧',
  x: number,
  y: number,
  troops = 3000,
): MapUnit {
  return {
    id: uid(general),
    side: 'player',
    pos: { x, y },
    general,
    arm,
    troops,
    maxTroops: troops,
    level: 1,
    wound: 'healthy',
    moved: false,
    acted: false,
  }
}

function garrison(arm: '槍' | '弓' | '馬' | '斧', x: number, y: number, troops = 2200): MapUnit {
  return {
    id: uid(`西涼${arm}`),
    side: 'enemy',
    pos: { x, y },
    general: null,
    arm,
    troops,
    maxTroops: troops,
    level: 1,
    wound: 'healthy',
    moved: false,
    acted: false,
  }
}

export function createScenario(): MapState {
  const units: MapUnit[] = [
    // 三兄弟。關羽馬 A、張飛槍 S → 高階特技；劉備適性全低，靠牌
    hero('劉備', '槍', 1, 3),
    hero('關羽', '馬', 1, 4),
    hero('張飛', '槍', 1, 5),

    // 呂布：滿編馬兵，馬 S → 連環突擊
    {
      id: uid('呂布'),
      side: 'enemy',
      pos: { x: 9, y: 4 },
      general: '呂布',
      arm: '馬',
      troops: 4000,
      maxTroops: 4000,
      level: 1,
      wound: 'healthy',
      moved: false,
      acted: false,
    },

    // 虎牢關前的西涼軍陣。無將，只有基礎特技，但弓兵射程 3 很煩
    garrison('弓', 8, 2),
    garrison('槍', 8, 3),
    garrison('馬', 8, 5),
    garrison('弓', 8, 6),
    garrison('斧', 10, 4),
  ]

  return {
    width: W,
    height: H,
    tiles: buildTiles(),
    units,
    day: 1,
    dayLimit: 30,
    phase: 'player',
    selectedId: null,
    log: [{ day: 1, text: '虎牢關前，呂布單騎立於陣中。三十日內必須擊敗他。' }],
    pendingBattle: null,
  }
}
