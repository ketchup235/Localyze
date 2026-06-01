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

const cinematicEase = createCubicBezier(0.65, 0, 0.35, 1)

type GlobeHeroProps = {
  focus?: LocationPayload | null
  spinMultiplier?: number
  scrollSpinProgress?: number
}

export function GlobeHero({
  focus,
  spinMultiplier = 1,
  scrollSpinProgress = 0,
}: GlobeHeroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const focusRef = useRef<((lat: number, lon: number) => void) | null>(null)
  const spinMultiplierRef = useRef(spinMultiplier)
  const scrollSpinProgressRef = useRef(scrollSpinProgress)

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
    const focusDurationMs = 600
    let focusStartTime = 0
    let focusFromRotationX = targetRotationX
    let focusFromRotationY = targetRotationY
    let focusFromScale = targetScale
    let focusFromCamera: any = null
    let focusToRotationX = targetRotationX
    let focusToRotationY = targetRotationY
    let focusToScale = 1.06
    let focusToCamera: any = null
    let mode: "idle" | "focusing" | "focused" = "idle"

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
      camera.position.set(0, 1.1, 6.6)

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5))
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

        focusToRotationY = (-lon * Math.PI) / 180 + 0.1
        focusToRotationX = -0.35 + ((lat * Math.PI) / 180) * 0.14
        focusToScale = 1.06
        focusToCamera = new THREE.Vector3(0, 1.0, 5.2)

        focusStartTime = performance.now()
        mode = "focusing"
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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5))
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

        const now = performance.now()
        const isFocusing = mode === "focusing"
        const isFocused = mode !== "idle"
        const scrollSpinProgressValue = Math.min(
          1,
          Math.max(0, scrollSpinProgressRef.current),
        )
        const scrollSpinRotation = scrollSpinProgressValue * Math.PI * 2
        const baseSpinAmount = (isFocused ? 0.0003 : 0.0018) * spinMultiplierRef.current
        const spinAmount = baseSpinAmount * (scrollSpinProgressValue > 0 ? 0.25 : 1)
        if (!isFocusing) {
          targetRotationY -= spinAmount
          if (!dragState.isDragging) {
            dragState.velocityX *= 0.94
            dragState.velocityY *= 0.94
            targetRotationY += dragState.velocityX
            targetRotationX = clamp(targetRotationX + dragState.velocityY, -1.15, 1.15)
          }
        }

        if (isFocusing && focusFromCamera && focusToCamera) {
          const progress = Math.min(1, (now - focusStartTime) / focusDurationMs)
          const eased = cinematicEase(progress)
          targetRotationX = lerp(focusFromRotationX, focusToRotationX, eased)
          targetRotationY = lerp(focusFromRotationY, focusToRotationY, eased)
          targetScale = lerp(focusFromScale, focusToScale, eased)
          camera.position.lerpVectors(focusFromCamera, focusToCamera, eased)
          if (progress >= 1) mode = "focused"
        }

        const combinedTargetY = isFocusing ? targetRotationY : targetRotationY - scrollSpinRotation
        const rotationLerp = scrollSpinProgressValue > 0 ? 0.12 : 0.02
        if (isFocusing) {
          earthGroup.rotation.x = targetRotationX
          earthGroup.rotation.y = combinedTargetY
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

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full touch-none block" />
    </div>
  )
}
