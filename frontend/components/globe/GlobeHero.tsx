"use client"

import { useEffect, useRef } from "react"
import type { LocationPayload } from "@/lib/types"

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const lerp = (start: number, end: number, t: number) => start + (end - start) * t

const createCubicBezier = (p1x: number, p1y: number, p2x: number, p2y: number) => {
  const cx = 3 * p1x
  const bx = 3 * (p2x - p1x) - cx
  const ax = 1 - cx - bx
  const cy = 3 * p1y
  const by = 3 * (p2y - p1y) - cy
  const ay = 1 - cy - by

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t
  const sampleCurveDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

  const solveCurveX = (x: number) => {
    let t2 = x
    for (let i = 0; i < 4; i += 1) {
      const x2 = sampleCurveX(t2) - x
      const d2 = sampleCurveDerivativeX(t2)
      if (Math.abs(d2) < 1e-6) return t2
      t2 -= x2 / d2
    }
    return t2
  }

  return (x: number) => {
    const clamped = clamp(x, 0, 1)
    return sampleCurveY(solveCurveX(clamped))
  }
}

// Accelerating ease for the zoom-in — slow lift-off, hard rush at the end so it
// blends straight into the map's fly-in.
const zoomEase = createCubicBezier(0.5, 0, 0.75, 0.2)

type GlobeHeroProps = {
  focus?: LocationPayload | null
  spinMultiplier?: number
  scrollSpinProgress?: number
  unzoomKey?: number
  active?: boolean
  wideZ?: number
  onDiveComplete?: () => void
  rollMsPerRad?: number
}

export function GlobeHero({
  focus,
  spinMultiplier = 1,
  scrollSpinProgress = 0,
  unzoomKey = 0,
  active = true,
  wideZ = 6.6,
  onDiveComplete,
  rollMsPerRad = 500,
}: GlobeHeroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const focusRef = useRef<((lat: number, lon: number) => void) | null>(null)
  const unzoomRef = useRef<(() => void) | null>(null)
  const onDiveCompleteRef = useRef(onDiveComplete)
  const rollMsPerRadRef = useRef(rollMsPerRad)

  useEffect(() => {
    onDiveCompleteRef.current = onDiveComplete
  }, [onDiveComplete])

  useEffect(() => {
    rollMsPerRadRef.current = rollMsPerRad
  }, [rollMsPerRad])
  const spinMultiplierRef = useRef(spinMultiplier)
  const scrollSpinProgressRef = useRef(scrollSpinProgress)
  const activeRef = useRef(active)
  const wideZRef = useRef(wideZ)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    wideZRef.current = wideZ
  }, [wideZ])

  useEffect(() => {
    spinMultiplierRef.current = spinMultiplier
  }, [spinMultiplier])

  useEffect(() => {
    scrollSpinProgressRef.current = scrollSpinProgress
  }, [scrollSpinProgress])

  useEffect(() => {
    focusRef.current = null

    let renderer: any
    let scene: any
    let camera: any
    let earthGroup: any
    let starField: any
    let frameId = 0

    const initialLongitude = 140
    let targetRotationX = -0.35
    let targetRotationY = (-initialLongitude * Math.PI) / 180 + 0.1
    let targetScale = 1
    // Two-phase focus: rotate to the location, then dolly the camera in.
    // Rotate duration scales with the angle so the spin keeps a steady speed.
    let rotateDurationMs = 1100
    const zoomDurationMs = 950
    const unzoomDurationMs = 1000
    let focusStage: "rotate" | "zoom" = "rotate"
    let focusStartTime = 0
    let zoomStartTime = 0
    let diveHandedOff = false
    let focusFromRotationX = targetRotationX
    let focusFromRotationY = targetRotationY
    let focusFromScale = targetScale
    let focusFromCamera: any = null
    let focusToRotationX = targetRotationX
    let focusToRotationY = targetRotationY
    let focusToScale = 1
    let focusToCamera: any = null
    let unzoomStartTime = 0
    let mode: "idle" | "focusing" | "focused" | "unzoom" = "idle"

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let disposed = false

    const init = async () => {
      const THREE = await import("three")
      if (disposed) return

      scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(0x02060b, 0.03)

      camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120)
      // The idle / scroll hero is viewed from a slightly raised vantage (y) for a
      // more dramatic look. The zoom anchors below stay level (y = 0) so the
      // dive / zoom-out keep a constant straight-on angle (no top-down tilt).
      camera.position.set(0, 1.1, 6.6)

      // Camera anchor points for the dive / inverse zoom-out (level axis, same
      // direction, different distance). SURFACE is a deep close-up.
      const WIDE_CAM = new THREE.Vector3(0, 0, 6.6)
      const SURFACE_CAM = new THREE.Vector3(0, 0, 2.32)

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 0.95
      renderer.physicallyCorrectLights = true
      renderer.setClearColor(0x000000, 0)

      scene.add(new THREE.AmbientLight(0x5f6f8a, 0.32))

      const hemi = new THREE.HemisphereLight(0x9ec7ff, 0x08111f, 0.55)
      scene.add(hemi)

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.3)
      keyLight.position.set(7, 4, 10)
      scene.add(keyLight)

      const rimLight = new THREE.DirectionalLight(0x2da8ff, 0.5)
      rimLight.position.set(-9, 3, -7)
      scene.add(rimLight)

      const fill = new THREE.PointLight(0x66ddff, 8, 26)
      fill.position.set(-3, 1.5, 5)
      scene.add(fill)

      const starsGeometry = new THREE.BufferGeometry()
      const starCount = 1600
      const positions = new Float32Array(starCount * 3)

      for (let i = 0; i < starCount; i += 1) {
        const radius = 30 + Math.random() * 35
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
        positions[i * 3 + 1] = radius * Math.cos(phi)
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
      }

      starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      const starsMaterial = new THREE.PointsMaterial({
        color: 0x9ac6ff,
        size: 0.04,
        transparent: true,
        opacity: 0.5,
      })
      starField = new THREE.Points(starsGeometry, starsMaterial)
      scene.add(starField)

      earthGroup = new THREE.Group()
      earthGroup.rotation.x = targetRotationX
      earthGroup.rotation.y = targetRotationY
      scene.add(earthGroup)

      const loader = new THREE.TextureLoader()
      const textureBase = "/textures/earth"
      const earthMap = loader.load(`${textureBase}/earth_atmos_2048.jpg`)
      const normalMap = loader.load(`${textureBase}/earth_normal_2048.jpg`)
      const nightMap = loader.load(`${textureBase}/earth_lights_2048.png`)

      earthMap.colorSpace = THREE.SRGBColorSpace
      nightMap.colorSpace = THREE.SRGBColorSpace

      earthMap.anisotropy = renderer.capabilities.getMaxAnisotropy()
      normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy()

      const earthMaterial = new THREE.MeshStandardMaterial({
        map: earthMap,
        normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.85,
        metalness: 0.0,
        emissive: new THREE.Color(0x141f30),
        emissiveMap: nightMap,
        emissiveIntensity: 0.2,
      })

      const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(2.15, 128, 128), earthMaterial)
      earthGroup.add(earthMesh)

      focusRef.current = (lat: number, lon: number) => {
        focusFromRotationX = earthGroup.rotation.x
        focusFromRotationY = earthGroup.rotation.y
        focusFromScale = earthGroup.scale.x
        focusFromCamera = camera.position.clone()

        // Bring this exact lat/lon to face the camera, dead centre.
        focusToRotationX = (lat * Math.PI) / 180
        const twoPi = Math.PI * 2
        let toY = (-lon * Math.PI) / 180 - Math.PI / 2
        // Approach from the same direction as the idle/scroll spin (decreasing Y)
        // so the globe rolls "backwards" round to the US, never snapping forward.
        toY += Math.floor((focusFromRotationY - toY) / twoPi) * twoPi
        // Guarantee a clear roll rather than a tiny nudge when it's already close.
        if (focusFromRotationY - toY < 0.6) toY -= twoPi
        focusToRotationY = toY

        // Constant angular speed: duration is strictly proportional to the angle,
        // at `rollMsPerRad` ms per radian (the page passes a slower value for a
        // re-search). The floor scales WITH the speed so a slower setting always
        // takes effect — a fixed floor would clamp small + slow rolls to the same
        // duration as fast ones, silently ignoring the slow-down.
        const mpr = rollMsPerRadRef.current
        const rollDelta = Math.abs(focusFromRotationY - toY)
        rotateDurationMs = clamp(rollDelta * mpr, mpr * 2.0, 7000)
        focusToScale = 1
        focusToCamera = SURFACE_CAM.clone()
        // The "wide" framing distance is set by the page from the viewport so the
        // whole sphere fits the screen at CSS scale 1 (no clipping box).
        WIDE_CAM.set(0, 0, wideZRef.current)

        focusStage = "rotate"
        focusStartTime = performance.now()
        diveHandedOff = false
        mode = "focusing"
      }

      // Inverse of the dive: pull the camera back out from the surface to the
      // wide view (exact time-mirror of the zoom-in), then resume idle spin.
      // Used when swinging back to the globe to fly to a different zip.
      unzoomRef.current = () => {
        WIDE_CAM.set(0, 0, wideZRef.current)
        unzoomStartTime = performance.now()
        mode = "unzoom"
      }

      const dragState = {
        isDragging: false,
        lastX: 0,
        lastY: 0,
        velocityX: 0,
        velocityY: 0,
        pointerId: 0,
      }

      let lastWidth = 0
      let lastHeight = 0

      const handleResize = () => {
        if (!renderer || !camera) return
        const bounds = container.getBoundingClientRect()
        const nextWidth = Math.round(bounds.width)
        const nextHeight = Math.round(bounds.height)
        if (!nextWidth || !nextHeight) return
        if (nextWidth === lastWidth && nextHeight === lastHeight) return
        lastWidth = nextWidth
        lastHeight = nextHeight
        camera.aspect = nextWidth / nextHeight
        camera.updateProjectionMatrix()
        // Cap the drawing-buffer resolution. The canvas still DISPLAYS at full
        // size (CSS), but we never render more than ~1100px on the long side, so
        // an oversized hero canvas doesn't cost millions of extra pixels/frame.
        const bufferCap = 1100
        const cappedRatio = Math.min(
          window.devicePixelRatio,
          1.5,
          bufferCap / Math.max(nextWidth, nextHeight),
        )
        renderer.setPixelRatio(cappedRatio)
        renderer.setSize(nextWidth, nextHeight, false)
      }

      const resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)
      handleResize()

      const handlePointerDown = (event: PointerEvent) => {
        dragState.isDragging = true
        dragState.pointerId = event.pointerId
        dragState.lastX = event.clientX
        dragState.lastY = event.clientY
        canvas.setPointerCapture(event.pointerId)
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!dragState.isDragging) return
        const deltaX = event.clientX - dragState.lastX
        const deltaY = event.clientY - dragState.lastY
        dragState.lastX = event.clientX
        dragState.lastY = event.clientY

        const rotationScale = 0.004
        targetRotationY += deltaX * rotationScale
        targetRotationX = clamp(targetRotationX + deltaY * rotationScale * 0.6, -1.15, 1.15)
        dragState.velocityX = deltaX * 0.0018
        dragState.velocityY = deltaY * 0.0016
        mode = "idle"
      }

      const handlePointerUp = (event: PointerEvent) => {
        if (!dragState.isDragging) return
        dragState.isDragging = false
        canvas.releasePointerCapture(event.pointerId)
      }

      canvas.addEventListener("pointerdown", handlePointerDown)
      canvas.addEventListener("pointermove", handlePointerMove)
      canvas.addEventListener("pointerup", handlePointerUp)
      canvas.addEventListener("pointerleave", handlePointerUp)

      const animate = () => {
        frameId = window.requestAnimationFrame(animate)
        if (!earthGroup) return
        // While the globe is hidden behind the map, keep the loop alive but skip
        // the expensive update + render so it doesn't tax the GPU.
        if (!activeRef.current) return

        const now = performance.now()
        const isFocusing = mode === "focusing"
        const isUnzooming = mode === "unzoom"
        const isFocused = mode !== "idle"
        const scrollSpinProgressValue = Math.min(
          1,
          Math.max(0, scrollSpinProgressRef.current),
        )
        const scrollSpinRotation = scrollSpinProgressValue * Math.PI * 2
        const baseSpinAmount = (isFocused ? 0 : 0.0018) * spinMultiplierRef.current
        const spinAmount = baseSpinAmount * (scrollSpinProgressValue > 0 ? 0.25 : 1)
        if (!isFocusing && !isUnzooming) {
          targetRotationY -= spinAmount
          if (!dragState.isDragging) {
            dragState.velocityX *= 0.94
            dragState.velocityY *= 0.94
            targetRotationY += dragState.velocityX
            targetRotationX = clamp(targetRotationX + dragState.velocityY, -1.15, 1.15)
          }
        }

        if (isFocusing && focusFromCamera && focusToCamera) {
          if (focusStage === "rotate") {
            // Phase 1 — spin the globe so the location tracks to dead centre.
            // Rotation is LINEAR (constant angular speed); the camera eases back
            // to the wide framing meanwhile.
            const progress = Math.min(1, (now - focusStartTime) / rotateDurationMs)
            targetRotationX = lerp(focusFromRotationX, focusToRotationX, progress)
            targetRotationY = lerp(focusFromRotationY, focusToRotationY, progress)
            targetScale = 1
            // Hold at the wide framing while rolling (matches the scrolled globe
            // size, so the hand-off is seamless and nothing is ever clipped).
            camera.position.copy(WIDE_CAM)
            if (progress >= 1) {
              focusStage = "zoom"
              zoomStartTime = now
            }
          } else {
            // Phase 2 — dive in from the wide framing toward the centred location.
            const progress = Math.min(1, (now - zoomStartTime) / zoomDurationMs)
            const eased = zoomEase(progress)
            targetRotationX = focusToRotationX
            targetRotationY = focusToRotationY
            targetScale = 1
            camera.position.lerpVectors(WIDE_CAM, SURFACE_CAM, eased)
            // Hand off to the map slightly before the dive bottoms out, so it
            // doesn't zoom all the way in and linger before the switch.
            if (progress >= 0.85 && !diveHandedOff) {
              diveHandedOff = true
              onDiveCompleteRef.current?.()
            }
            if (progress >= 1) mode = "focused"
          }
        }

        if (isUnzooming) {
          // Time-mirror of the dive: lerp(WIDE, SURFACE, ease(1 - p)) starts at
          // the surface and retraces the zoom-in exactly, back out to wide.
          const progress = Math.min(1, (now - unzoomStartTime) / unzoomDurationMs)
          camera.position.lerpVectors(WIDE_CAM, SURFACE_CAM, zoomEase(1 - progress))
          targetScale = 1
          if (progress >= 1) mode = "idle"
        }

        const combinedTargetY = targetRotationY - scrollSpinRotation
        const rotationLerp = scrollSpinProgressValue > 0 ? 0.12 : 0.02
        if (isFocusing || isUnzooming) {
          // Hold the rotation steady; only the camera moves during these phases.
          earthGroup.rotation.x = targetRotationX
          earthGroup.rotation.y = targetRotationY
          earthGroup.scale.setScalar(targetScale)
        } else {
          earthGroup.rotation.x += (targetRotationX - earthGroup.rotation.x) * 0.03
          earthGroup.rotation.y += (combinedTargetY - earthGroup.rotation.y) * rotationLerp
          earthGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05)
        }

        if (starField) {
          starField.rotation.y += 0.0004
        }

        camera.lookAt(0, 0, 0)
        renderer.render(scene, camera)
      }

      animate()

      return () => {
        canvas.removeEventListener("pointerdown", handlePointerDown)
        canvas.removeEventListener("pointermove", handlePointerMove)
        canvas.removeEventListener("pointerup", handlePointerUp)
        canvas.removeEventListener("pointerleave", handlePointerUp)
        resizeObserver.disconnect()
      }
    }

    let cleanup: (() => void) | null = null
    init().then((dispose) => {
      cleanup = dispose || null
    })

    return () => {
      disposed = true
      if (frameId) window.cancelAnimationFrame(frameId)
      if (cleanup) cleanup()
      if (renderer) renderer.dispose()
    }
  }, [])

  useEffect(() => {
    if (!focus || !focusRef.current) return
    focusRef.current(focus.lat, focus.lon)
  }, [focus])

  useEffect(() => {
    if (unzoomKey && unzoomRef.current) unzoomRef.current()
  }, [unzoomKey])

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full touch-none block" />
    </div>
  )
}
