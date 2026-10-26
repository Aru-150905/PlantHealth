import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import type { PlantLook } from "../../lib/plantLook"
import { moodStyle, type MoodStyle } from "./moodStyle"

/**
 * The 3D tomato plant. Built procedurally from three.js primitives (lathe pot, tube stem,
 * ellipsoid leaflets, sphere fruit) rather than a loaded model file: nothing extra to
 * download on a slow phone connection, and every symptom (droop, curl, scorched tips, salt
 * crust, cracked soil) is a parameter we can blend by confidence — see moodStyle.ts.
 * Lazy-loaded by PlantStage so screens without a plant never pay for three.js.
 */

const STEM_HEIGHT = 1.55
// [height along stem 0..1, angle around stem (rad), length]
const BRANCHES: [number, number, number][] = [
  [0.22, 0.2, 0.62], [0.34, 2.4, 0.66], [0.46, 4.3, 0.6], [0.58, 1.3, 0.56],
  [0.68, 3.4, 0.52], [0.78, 5.4, 0.46], [0.88, 0.6, 0.38], [0.96, 2.9, 0.3],
]
// [height 0..1, angle] — fruit hangs between the lower branches
const FRUITS: [number, number][] = [[0.4, 0.9], [0.52, 3.1], [0.3, 5.0]]

function stemCurve(lean: number) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.02, STEM_HEIGHT * 0.35, 0),
    new THREE.Vector3(-0.02 + lean * 0.15, STEM_HEIGHT * 0.7, 0),
    new THREE.Vector3(lean * 0.5, STEM_HEIGHT * (1 - lean * 0.18), 0),
  ])
}

function Leaflet({ style, position, scale }: { style: MoodStyle; position: [number, number, number]; scale: number }) {
  const width = 0.15 * (1 - style.curl * 0.55) * scale
  return (
    <group position={position} rotation={[0.25, 0, 0]}>
      <mesh scale={[0.2 * scale, 0.04 * scale, width]}>
        <sphereGeometry args={[1, 20, 12]} />
        <meshStandardMaterial color={style.leaf} roughness={0.55} emissive={style.leaf} emissiveIntensity={0.12} />
      </mesh>
      {style.scorch > 0.05 && (
        <mesh position={[0.15 * scale, 0, 0]} scale={[0.07 * scale * style.scorch, 0.028 * scale, width * 0.7]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color="#7a3b12" roughness={0.9} />
        </mesh>
      )}
    </group>
  )
}

function Branch({ style, curve, at, angle, length }: {
  style: MoodStyle; curve: THREE.CatmullRomCurve3; at: number; angle: number; length: number
}) {
  const base = curve.getPoint(at)
  // leaves start angled slightly up; droop tilts them down
  const tilt = -0.35 + style.droop
  return (
    <group position={base} rotation={[0, angle, 0]}>
      <group rotation={[0, 0, -tilt]}>
        <mesh position={[length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.018, length, 6]} />
          <meshStandardMaterial color="#4f7d2a" roughness={0.7} />
        </mesh>
        <Leaflet style={style} position={[length * 0.3, 0.01, 0.11]} scale={0.65} />
        <Leaflet style={style} position={[length * 0.3, 0.01, -0.11]} scale={0.65} />
        <Leaflet style={style} position={[length * 0.62, 0.01, 0.12]} scale={0.8} />
        <Leaflet style={style} position={[length * 0.62, 0.01, -0.12]} scale={0.8} />
        <Leaflet style={style} position={[length * 0.98, 0, 0]} scale={1} />
      </group>
    </group>
  )
}

function Pot({ style }: { style: MoodStyle }) {
  const potGeo = useMemo(() => {
    const pts = [
      [0.0, 0.0], [0.42, 0.0], [0.46, 0.04], [0.56, 0.62], [0.62, 0.64], [0.62, 0.74], [0.55, 0.74],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    return new THREE.LatheGeometry(pts, 40)
  }, [])
  const cracks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ angle: (i / 6) * Math.PI * 2 + 0.3, len: 0.18 + (i % 3) * 0.06 })),
    [],
  )
  return (
    <group position={[0, -0.74, 0]}>
      <mesh geometry={potGeo} >
        <meshStandardMaterial color="#c0603a" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.69, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 40]} />
        <meshStandardMaterial color={style.soil} roughness={1} />
      </mesh>
      {style.crust > 0.05 && (
        <mesh position={[0, 0.695, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.54, 40]} />
          <meshStandardMaterial color="#f1efe6" roughness={1} transparent opacity={0.25 + style.crust * 0.65} />
        </mesh>
      )}
      {style.cracks > 0.05 && cracks.map((c, i) => (
        <mesh key={i} position={[Math.cos(c.angle) * 0.3, 0.697, Math.sin(c.angle) * 0.3]} rotation={[-Math.PI / 2, 0, -c.angle + 0.4]}>
          <planeGeometry args={[c.len * style.cracks, 0.012]} />
          <meshBasicMaterial color="#3b2615" />
        </mesh>
      ))}
    </group>
  )
}

function Plant({ look, spin, reducedMotion }: {
  look: PlantLook; spin: React.RefObject<{ angle: number; velocity: number; dragging: boolean }>; reducedMotion: boolean
}) {
  const style = moodStyle(look)
  const root = useRef<THREE.Group>(null)
  const foliage = useRef<THREE.Group>(null)
  const curve = useMemo(() => stemCurve(style.stemLean), [style.stemLean])
  const stemGeo = useMemo(() => new THREE.TubeGeometry(curve, 24, 0.035, 8, false), [curve])

  useFrame((state, delta) => {
    const s = spin.current
    if (!s.dragging) {
      // gentle idle turn so the plant reads as 3D, plus inertia after a drag
      const idle = reducedMotion ? 0 : 0.18
      s.velocity += (idle - s.velocity) * Math.min(1, delta * 1.5)
      s.angle += s.velocity * delta
    }
    if (root.current) root.current.rotation.y = s.angle
    if (foliage.current && !reducedMotion) {
      const t = state.clock.elapsedTime
      foliage.current.rotation.z = Math.sin(t * 1.1) * 0.025
      foliage.current.rotation.x = Math.sin(t * 0.8 + 1) * 0.015
    }
  })

  return (
    <group ref={root}>
      <Pot style={style} />
      <group ref={foliage}>
        <mesh geometry={stemGeo}>
          <meshStandardMaterial color="#4f7d2a" roughness={0.6} />
        </mesh>
        {BRANCHES.map(([at, angle, length], i) => (
          <Branch key={i} style={style} curve={curve} at={at} angle={angle} length={length} />
        ))}
        {FRUITS.map(([at, angle], i) => {
          const p = curve.getPoint(at)
          return (
            <group key={i} position={p} rotation={[0, angle, 0]}>
              <mesh position={[0.17, -0.12, 0]}>
                <sphereGeometry args={[0.085, 20, 16]} />
                <meshStandardMaterial color={style.fruit} roughness={0.35} />
              </mesh>
              <mesh position={[0.17, -0.03, 0]}>
                <cylinderGeometry args={[0.006, 0.006, 0.1, 5]} />
                <meshStandardMaterial color="#4f7d2a" />
              </mesh>
            </group>
          )
        })}
      </group>
    </group>
  )
}

/** Soft radial shadow under the pot (doesn't rotate with the plant). */
function ContactShadow() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas")
    c.width = c.height = 128
    const ctx = c.getContext("2d")!
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    g.addColorStop(0, "rgba(30,20,10,0.38)")
    g.addColorStop(1, "rgba(30,20,10,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <mesh position={[0, -0.739, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.9, 1.9]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

/** Drag-to-spin without pulling in OrbitControls: horizontal drag sets the angle directly,
 * release keeps some momentum. */
function DragSpin({ spin }: { spin: React.RefObject<{ angle: number; velocity: number; dragging: boolean }> }) {
  const { gl } = useThree()
  useEffect(() => {
    const el = gl.domElement
    let lastX = 0
    let lastT = 0
    const down = (e: PointerEvent) => {
      spin.current.dragging = true
      lastX = e.clientX
      lastT = performance.now()
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!spin.current.dragging) return
      const now = performance.now()
      const dx = e.clientX - lastX
      spin.current.angle += dx * 0.012
      spin.current.velocity = (dx * 0.012) / Math.max(0.016, (now - lastT) / 1000)
      lastX = e.clientX
      lastT = now
    }
    const up = (e: PointerEvent) => {
      spin.current.dragging = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    el.addEventListener("pointerdown", down)
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
    return () => {
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      el.removeEventListener("pointercancel", up)
    }
  }, [gl, spin])
  return null
}

export default function Plant3D({
  look, interactive = true, active = true, reducedMotion = false,
}: { look: PlantLook; interactive?: boolean; active?: boolean; reducedMotion?: boolean }) {
  const spin = useRef({ angle: 0.6, velocity: 0, dragging: false })
  const warm = look.mood === "heat" ? look.intensity : 0
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.95, 4.5], fov: 34 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.42, 0)}
      style={{ touchAction: interactive ? "pan-y" : "auto", cursor: interactive ? "grab" : "default" }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.45} />
      <hemisphereLight args={[warm > 0 ? "#ffe2b8" : "#f4fbff", "#7a6040", 1.0 + warm * 0.4]} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.6} color={warm > 0 ? "#ffd59a" : "#ffffff"} />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.35} color="#bcd7ff" />
      <Plant look={look} spin={spin} reducedMotion={reducedMotion} />
      <ContactShadow />
      {interactive && <DragSpin spin={spin} />}
    </Canvas>
  )
}
