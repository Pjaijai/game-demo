/**
 * Three.js 地圖。目前全部用程式生成的方塊與圓錐 ——
 * 第 9 週換成 Blender 的 glTF 時，只有這個檔案會動，邏輯一行都不用改。
 *
 * 武將名字是投影到畫面上的 DOM 標籤（不是 3D 文字），
 * 這樣中文永遠清晰、不用處理字型圖集。
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { key, tileAt } from '../core/map/grid'
import type { Coord, MapState, MapUnit, Terrain } from '../core/map/types'

const TERRAIN_COLOR: Record<Terrain, string> = {
  plain: '#4a5d3a',
  forest: '#294a24',
  hill: '#6b5a3d',
  water: '#22415c',
  city: '#8a7448',
}

const SIDE_COLOR = { player: '#4f8f5a', enemy: '#a83c3c' } as const

/** 兵種用形狀區分，陣營用顏色區分 */
function ArmMesh({ arm, color }: { arm: MapUnit['arm']; color: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.6} />
  switch (arm) {
    case '槍':
      return (
        <mesh position={[0, 0.3, 0]} castShadow>
          <coneGeometry args={[0.26, 0.6, 4]} />
          {mat}
        </mesh>
      )
    case '弓':
      return (
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.26, 0.44, 10]} />
          {mat}
        </mesh>
      )
    case '馬':
      return (
        <mesh position={[0, 0.24, 0]} castShadow>
          <boxGeometry args={[0.56, 0.34, 0.3]} />
          {mat}
        </mesh>
      )
    case '斧':
      return (
        <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <octahedronGeometry args={[0.34]} />
          {mat}
        </mesh>
      )
    default:
      return null
  }
}

function UnitMesh({
  unit,
  selected,
  targetable,
  onClick,
}: {
  unit: MapUnit
  selected: boolean
  targetable: boolean
  onClick: () => void
}) {
  const color = SIDE_COLOR[unit.side]
  return (
    <group
      position={[unit.pos.x, 0.06, unit.pos.y]}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <ArmMesh arm={unit.arm} color={color} />

      {/* 武將：懸在部隊上方的金色標記。單獨行動時就只有這個 —— 很顯眼，也很脆 */}
      {unit.general && (
        <mesh position={[0, unit.arm ? 0.82 : 0.34, 0]} castShadow>
          <octahedronGeometry args={[0.17]} />
          <meshStandardMaterial
            color={unit.wound === 'wounded' ? '#8c4a4a' : '#e0c070'}
            emissive={unit.wound === 'wounded' ? '#3a1414' : '#4a3a10'}
            roughness={0.35}
          />
        </mesh>
      )}

      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.38, 0.46, 24]} />
          <meshBasicMaterial color="#e0c070" />
        </mesh>
      )}
      {targetable && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.5, 4]} />
          <meshBasicMaterial color="#ff5a4a" />
        </mesh>
      )}
    </group>
  )
}

/**
 * R3F 不會幫你套用 lookAt（它只在 resize 時更新 aspect），
 * 所以相機朝向要在 Canvas 內部自己設。
 */
function CameraRig({ height }: { height: number }) {
  const { camera, gl, scene } = useThree()
  useEffect(() => {
    // 俯角約 40 度，距離抓到讓 9 格深的棋盤填滿畫面高度的八成
    camera.position.set(0, height * 1.09, height * 1.28)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, height])

  // 開發用逃生口：視窗在背景時 requestAnimationFrame 與 ResizeObserver
  // 都不會觸發，畫面會是全黑。自動化檢查時可以派發一次 resize 讓 R3F
  // 掛載，再呼叫 renderOnce() 手動畫一幀。
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __r3f?: unknown }
    w.__r3f = { gl, scene, camera, renderOnce: () => gl.render(scene, camera) }
    return () => {
      delete w.__r3f
    }
  }, [gl, scene, camera])

  return null
}

/**
 * 把 3D 座標投影成畫面座標，直接改 DOM 標籤的位置。
 * 每幀跑，但不碰 React state，所以不會重繪。
 */
function LabelProjector({
  units,
  labels,
  offset,
}: {
  units: MapUnit[]
  labels: React.RefObject<Map<string, HTMLDivElement>>
  offset: [number, number]
}) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    for (const u of units) {
      const el = labels.current?.get(u.id)
      if (!el) continue
      v.set(u.pos.x + offset[0], u.arm ? 1.15 : 0.7, u.pos.y + offset[1]).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
    }
  })
  return null
}

interface Props {
  state: MapState
  moveCells: Set<string>
  targetIds: Set<string>
  onTileClick: (c: Coord) => void
  onUnitClick: (u: MapUnit) => void
}

export function MapView({ state, moveCells, targetIds, onTileClick, onUnitClick }: Props) {
  const labels = useRef<Map<string, HTMLDivElement>>(new Map())

  const tiles = useMemo(() => {
    const out: { c: Coord; terrain: Terrain; city?: string }[] = []
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const t = tileAt(state, { x, y })
        out.push({ c: { x, y }, terrain: t.terrain, ...(t.city ? { city: t.city } : {}) })
      }
    }
    return out
  }, [state])

  // 把地圖中心移到世界原點，相機就只要看著原點
  const ox = -(state.width - 1) / 2
  const oz = -(state.height - 1) / 2

  return (
    <div className="mapview">
      <Canvas shadows camera={{ fov: 40, near: 0.1, far: 200 }}>
        <color attach="background" args={['#12100e']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[6, 14, 4]} intensity={1.6} castShadow />
        <CameraRig height={state.height} />

        <group position={[ox, 0, oz]}>
        {tiles.map(({ c, terrain, city }) => {
          const inMove = moveCells.has(key(c))
          return (
            <group key={key(c)}>
              <mesh
                position={[c.x, 0, c.y]}
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation()
                  onTileClick(c)
                }}
              >
                <boxGeometry args={[0.94, city ? 0.34 : 0.12, 0.94]} />
                <meshStandardMaterial color={TERRAIN_COLOR[terrain]} roughness={0.9} />
              </mesh>
              {inMove && (
                <mesh position={[c.x, city ? 0.18 : 0.07, c.y]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.9, 0.9]} />
                  <meshBasicMaterial color="#e0c070" transparent opacity={0.28} />
                </mesh>
              )}
            </group>
          )
        })}

        {state.units.map((u) => (
          <UnitMesh
            key={u.id}
            unit={u}
            selected={state.selectedId === u.id}
            targetable={targetIds.has(u.id)}
            onClick={() => onUnitClick(u)}
          />
        ))}
        </group>

        <LabelProjector units={state.units} labels={labels} offset={[ox, oz]} />
      </Canvas>

      <div className="mapview__labels">
        {state.units.map((u) => (
          <div
            key={u.id}
            className={`maplabel maplabel--${u.side}`}
            ref={(el) => {
              if (el) labels.current.set(u.id, el)
              else labels.current.delete(u.id)
            }}
          >
            <b>{u.general ?? `${u.arm}兵`}</b>
            {u.arm && <span>{u.troops}</span>}
            {u.wound === 'wounded' && <i>傷</i>}
          </div>
        ))}
        {state.tiles.map((t, i) =>
          t.city ? (
            <div
              key={t.city}
              className="maplabel maplabel--city"
              style={{ display: 'none' }}
              data-index={i}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}
