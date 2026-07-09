"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { cn } from "@/lib/utils"

const COLS = 20
const ROWS = 10
/** 20×10 tank — each pip = target / 200 calories. */
export const THREE_PIP_COUNT = 200

const CELL = 1
const GAP = 0.42
const STEP = CELL + GAP
const CUBE = 0.78

type Props = {
  consumed: number
  target: number
  accent: string
  className?: string
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function hexToColor(hex: string): THREE.Color {
  try {
    return new THREE.Color(hex)
  } catch {
    return new THREE.Color("#38bdf8")
  }
}

/**
 * WebGL isometric calorie tank — 20×10 instanced cubes.
 * Fill maths: each cube = target / 200 calories; fills bottom → top.
 */
export function CaloriePipScene({ consumed, target, accent, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({
    consumed,
    target,
    accent,
    reduced: false,
  })
  stateRef.current = {
    consumed,
    target,
    accent,
    reduced: prefersReducedMotion(),
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x05070c, 0.035)

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80)
    camera.position.set(14, 12, 14)
    camera.lookAt(0, 0.2, 0)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(8, 14, 6)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35)
    fill.position.set(-6, 4, -4)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.25)
    rim.position.set(-2, 6, 10)
    scene.add(rim)

    // Floor plate
    const floorGeo = new THREE.PlaneGeometry(
      COLS * STEP + GAP * 2,
      ROWS * STEP + GAP * 2,
    )
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x12161f,
      metalness: 0.35,
      roughness: 0.85,
      transparent: true,
      opacity: 0.55,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -CUBE * 0.52
    scene.add(floor)

    // Soft grid helper on floor
    const grid = new THREE.GridHelper(
      Math.max(COLS, ROWS) * STEP,
      Math.max(COLS, ROWS),
      0x3a4558,
      0x222833,
    )
    grid.position.y = -CUBE * 0.5 + 0.01
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material]
    for (const m of gridMats) {
      m.transparent = true
      m.opacity = 0.35
    }
    scene.add(grid)

    const geometry = new THREE.BoxGeometry(CUBE, CUBE, CUBE)
    const material = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.28,
      roughness: 0.38,
      emissive: 0x000000,
      emissiveIntensity: 0,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, THREE_PIP_COUNT)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Per-instance colors
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(THREE_PIP_COUNT * 3),
      3,
    )
    scene.add(mesh)

    const dummy = new THREE.Object3D()
    const litColor = new THREE.Color()
    const emptyColor = new THREE.Color("#2a3140")
    const availableColor = new THREE.Color("#3d4a5c")
    const rise = new Float32Array(THREE_PIP_COUNT)
    const targetRise = new Float32Array(THREE_PIP_COUNT)
    const originY = new Float32Array(THREE_PIP_COUNT)

    const gridW = (COLS - 1) * STEP
    const gridD = (ROWS - 1) * STEP

    for (let i = 0; i < THREE_PIP_COUNT; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS) // 0 = bottom
      const x = col * STEP - gridW / 2
      const z = -(row * STEP - gridD / 2)
      originY[i] = 0
      rise[i] = 0
      targetRise[i] = 0
      dummy.position.set(x, -0.35, z)
      dummy.scale.setScalar(0.01)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      emptyColor.toArray(mesh.instanceColor!.array as Float32Array, i * 3)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true

    const group = new THREE.Group()
    // Re-parent mesh+floor into group for subtle idle sway
    scene.remove(mesh, floor, grid)
    group.add(floor, grid, mesh)
    scene.add(group)

    function fitCamera() {
      const el = hostRef.current
      if (!el) return
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      renderer.setSize(w, h, false)
      const aspect = w / h
      const frustum = 11.2
      if (aspect >= 1) {
        camera.left = -frustum * aspect
        camera.right = frustum * aspect
        camera.top = frustum
        camera.bottom = -frustum
      } else {
        camera.left = -frustum
        camera.right = frustum
        camera.top = frustum / aspect
        camera.bottom = -frustum / aspect
      }
      camera.updateProjectionMatrix()
    }
    fitCamera()

    const ro = new ResizeObserver(() => fitCamera())
    ro.observe(host)

    let raf = 0
    let last = performance.now()
    let disposed = false
    let lastKey = ""
    let waveStart = performance.now()

    function syncTargets(force = false) {
      const { consumed: c, target: t, accent: a } = stateRef.current
      const key = `${c}|${t}|${a}`
      if (!force && key === lastKey) return
      const prev = lastKey
      lastKey = key
      if (prev !== "") waveStart = performance.now()

      litColor.copy(hexToColor(a))
      const filled =
        t > 0 ? Math.min(THREE_PIP_COUNT, (c / t) * THREE_PIP_COUNT) : 0
      const full = Math.floor(filled + 1e-9)
      const partial = filled - full
      const ratio = t > 0 ? c / t : 0

      for (let i = 0; i < THREE_PIP_COUNT; i++) {
        const isLit = i < full || (i === full && partial > 0.12)
        targetRise[i] = isLit ? 1 : 0
        if (isLit) {
          litColor.toArray(mesh.instanceColor!.array as Float32Array, i * 3)
        } else if (ratio < 1 && t > 0) {
          availableColor.toArray(mesh.instanceColor!.array as Float32Array, i * 3)
        } else {
          emptyColor.toArray(mesh.instanceColor!.array as Float32Array, i * 3)
        }
      }
      mesh.instanceColor!.needsUpdate = true
      material.emissive.copy(litColor)
      material.emissiveIntensity = 0.22
    }
    syncTargets(true)

    // Stagger: light bottom-left first
    const stagger = new Float32Array(THREE_PIP_COUNT)
    for (let i = 0; i < THREE_PIP_COUNT; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      stagger[i] = (row * COLS + col) * 0.014
    }

    function tick(now: number) {
      if (disposed) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const reduced = stateRef.current.reduced
      const waveElapsed = (now - waveStart) / 1000
      const idleT = now / 1000

      syncTargets()

      for (let i = 0; i < THREE_PIP_COUNT; i++) {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const x = col * STEP - gridW / 2
        const z = -(row * STEP - gridD / 2)

        const delay = stagger[i]!
        const want = targetRise[i]!
        const gate = reduced
          ? 1
          : Math.min(1, Math.max(0, (waveElapsed - delay) * 2.8))
        const goal = want > 0.5 ? Math.max(gate, rise[i]! > 0.95 ? 1 : gate) : 0
        const speed = reduced ? 14 : 6.5
        rise[i] = rise[i]! + (goal - rise[i]!) * Math.min(1, dt * speed)

        const r = rise[i]!
        // Lit cubes sit on the floor; empty cubes are slightly smaller dim blocks
        const litY = 0
        const emptyY = 0
        const litS = 1
        const emptyS = 0.68
        const y = THREE.MathUtils.lerp(emptyY - 0.35 * (1 - r), litY, r)
        const s = THREE.MathUtils.lerp(emptyS, litS, r)

        dummy.position.set(x, y, z)
        dummy.scale.setScalar(Math.max(0.05, s))
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true

      group.rotation.y = reduced ? 0 : Math.sin(idleT * 0.32) * 0.045

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      geometry.dispose()
      material.dispose()
      floorGeo.dispose()
      floorMat.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement)
      }
    }
  }, [])

  // Accent / values update via stateRef each frame — no scene rebuild needed.

  return (
    <div
      ref={hostRef}
      className={cn("relative h-full w-full min-h-[12rem] overflow-hidden", className)}
    />
  )
}
