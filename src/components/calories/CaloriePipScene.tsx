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

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(pointer: coarse)").matches
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
 * Mobile-tuned: low DPR, MeshLambert, pause when offscreen/hidden, stop RAF when settled.
 */
export function CaloriePipScene({ consumed, target, accent, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const wakeRef = useRef<(() => void) | null>(null)
  const stateRef = useRef({ consumed, target, accent })
  stateRef.current = { consumed, target, accent }

  // Mount WebGL once
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const mobile = isCoarsePointer()
    const reducedInit = prefersReducedMotion()

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80)
    camera.position.set(14, 12, 14)
    camera.lookAt(0, 0.2, 0)

    const renderer = new THREE.WebGLRenderer({
      antialias: !mobile,
      alpha: true,
      powerPreference: mobile ? "low-power" : "high-performance",
      stencil: false,
      depth: true,
    })
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75),
    )
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.display = "block"
    renderer.domElement.style.touchAction = "none"
    host.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0xffffff, mobile ? 0.85 : 0.6)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xffffff, mobile ? 0.9 : 1.1)
    key.position.set(8, 14, 6)
    scene.add(key)
    if (!mobile) {
      const fill = new THREE.DirectionalLight(0x88aaff, 0.3)
      fill.position.set(-6, 4, -4)
      scene.add(fill)
    }

    const floorGeo = new THREE.PlaneGeometry(
      COLS * STEP + GAP * 2,
      ROWS * STEP + GAP * 2,
    )
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x12161f,
      transparent: true,
      opacity: 0.5,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -CUBE * 0.52

    const geometry = new THREE.BoxGeometry(CUBE, CUBE, CUBE)
    const material = new THREE.MeshLambertMaterial({
      color: 0x38bdf8,
      emissive: 0x000000,
      emissiveIntensity: 0,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, THREE_PIP_COUNT)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(THREE_PIP_COUNT * 3),
      3,
    )
    mesh.frustumCulled = false

    const dummy = new THREE.Object3D()
    const litColor = new THREE.Color()
    const emptyColor = new THREE.Color("#2a3140")
    const availableColor = new THREE.Color("#3d4a5c")
    const rise = new Float32Array(THREE_PIP_COUNT)
    const targetRise = new Float32Array(THREE_PIP_COUNT)
    const posX = new Float32Array(THREE_PIP_COUNT)
    const posZ = new Float32Array(THREE_PIP_COUNT)
    const stagger = new Float32Array(THREE_PIP_COUNT)

    const gridW = (COLS - 1) * STEP
    const gridD = (ROWS - 1) * STEP

    for (let i = 0; i < THREE_PIP_COUNT; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      posX[i] = col * STEP - gridW / 2
      posZ[i] = -(row * STEP - gridD / 2)
      stagger[i] = (row * COLS + col) * (mobile ? 0.008 : 0.014)
      rise[i] = 0
      targetRise[i] = 0
      dummy.position.set(posX[i]!, -0.35, posZ[i]!)
      dummy.scale.setScalar(0.01)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      emptyColor.toArray(mesh.instanceColor!.array as Float32Array, i * 3)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true

    const group = new THREE.Group()
    group.add(floor, mesh)
    scene.add(group)

    let raf = 0
    let last = performance.now()
    let disposed = false
    let lastKey = ""
    let waveStart = performance.now()
    let dirty = true
    let visible = true
    let running = false

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
      dirty = true
      kick()
    }

    function syncTargets(force = false) {
      const { consumed: c, target: t, accent: a } = stateRef.current
      const key = `${c}|${t}|${a}`
      if (!force && key === lastKey) return false
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
      material.emissiveIntensity = mobile ? 0.12 : 0.2
      dirty = true
      return true
    }
    syncTargets(true)

    function kick() {
      if (disposed || !visible || running) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    wakeRef.current = () => {
      dirty = true
      syncTargets(true)
      kick()
    }

    function tick(now: number) {
      if (disposed || !visible) {
        running = false
        return
      }

      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const reducedMotion = prefersReducedMotion()
      const waveElapsed = (now - waveStart) / 1000

      syncTargets()

      let maxDelta = 0
      for (let i = 0; i < THREE_PIP_COUNT; i++) {
        const want = targetRise[i]!
        const delay = stagger[i]!
        const gate = reducedMotion
          ? 1
          : Math.min(1, Math.max(0, (waveElapsed - delay) * (mobile ? 3.4 : 2.8)))
        const goal = want > 0.5 ? gate : 0
        const speed = reducedMotion ? 16 : mobile ? 9 : 6.5
        const next = rise[i]! + (goal - rise[i]!) * Math.min(1, dt * speed)
        maxDelta = Math.max(maxDelta, Math.abs(next - rise[i]!))
        rise[i] = next

        const r = rise[i]!
        dummy.position.set(posX[i]!, -0.35 * (1 - r), posZ[i]!)
        dummy.scale.setScalar(Math.max(0.05, 0.68 + 0.32 * r))
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true

      if (!mobile && !reducedMotion && maxDelta > 0.002) {
        group.rotation.y = Math.sin((now / 1000) * 0.32) * 0.03
        dirty = true
      } else if (group.rotation.y !== 0 && (mobile || reducedMotion || reducedInit)) {
        group.rotation.y = 0
      }

      if (dirty || maxDelta > 0.0015) {
        renderer.render(scene, camera)
        dirty = false
      }

      // Sleep the loop once settled — critical for mobile scroll/battery
      if (maxDelta > 0.0015) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
        renderer.render(scene, camera)
      }
    }

    fitCamera()

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(fitCamera, mobile ? 100 : 40)
    })
    ro.observe(host)

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false
        if (visible) {
          dirty = true
          kick()
        } else if (raf) {
          cancelAnimationFrame(raf)
          running = false
        }
      },
      { threshold: 0.05 },
    )
    io.observe(host)

    const onVis = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        running = false
      } else if (visible) {
        dirty = true
        kick()
      }
    }
    document.addEventListener("visibilitychange", onVis)

    kick()

    return () => {
      disposed = true
      running = false
      wakeRef.current = null
      cancelAnimationFrame(raf)
      if (resizeTimer) clearTimeout(resizeTimer)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener("visibilitychange", onVis)
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

  // Wake sleeping loop when calorie values change
  useEffect(() => {
    wakeRef.current?.()
  }, [consumed, target, accent])

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative h-full w-full min-h-[12rem] overflow-hidden [contain:strict]",
        className,
      )}
    />
  )
}
