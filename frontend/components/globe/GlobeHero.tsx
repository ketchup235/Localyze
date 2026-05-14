"use client"

import { useEffect, useRef } from "react"
import type { LocationPayload } from "@/lib/types"

type GlobeHeroProps = {
  focus?: LocationPayload | null
}

export function GlobeHero({ focus }: GlobeHeroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const focusRef = useRef<((lat: number, lon: number) => void) | null>(null)

  useEffect(() => {
    focusRef.current = null

    let renderer: any
    let scene: any
    let camera: any
    let earthGroup: any
    let cloudMesh: any
    let atmosphereMesh: any
    let starField: any
    let frameId = 0

    let targetRotationX = -0.35
    let targetRotationY = -0.7
    let targetScale = 1
    let focusTimer = 0
    const focusDuration = 1.6
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      renderer.outputEncoding = THREE.sRGBEncoding
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.physicallyCorrectLights = true
      renderer.setClearColor(0x000000, 0)

      scene.add(new THREE.AmbientLight(0x5f6f8a, 0.25))

      const hemi = new THREE.HemisphereLight(0x9ec7ff, 0x08111f, 0.45)
      scene.add(hemi)

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.1)
      keyLight.position.set(7, 4, 10)
      scene.add(keyLight)

      const rimLight = new THREE.DirectionalLight(0x2da8ff, 0.8)
      rimLight.position.set(-9, 3, -7)
      scene.add(rimLight)

      const fill = new THREE.PointLight(0x66ddff, 14, 26)
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
      loader.crossOrigin = "anonymous"
      const earthMap = loader.load("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/textures/planets/earth_atmos_2048.jpg")
      const normalMap = loader.load("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/textures/planets/earth_normal_2048.jpg")
      const specularMap = loader.load("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/textures/planets/earth_specular_2048.jpg")
      const nightMap = loader.load("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/textures/planets/earth_lights_2048.png")
      const cloudsMap = loader.load("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/textures/planets/earth_clouds_1024.png")

      earthMap.encoding = THREE.sRGBEncoding
      nightMap.encoding = THREE.sRGBEncoding
      cloudsMap.encoding = THREE.sRGBEncoding

      earthMap.anisotropy = renderer.capabilities.getMaxAnisotropy()
      normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy()
      specularMap.anisotropy = renderer.capabilities.getMaxAnisotropy()

      const earthMaterial = new THREE.MeshPhongMaterial({
        map: earthMap,
        normalMap,
        normalScale: new THREE.Vector2(0.42, 0.42),
        specularMap,
        specular: new THREE.Color(0x1b2b3f),
        shininess: 22,
        emissive: new THREE.Color(0x24405a),
        emissiveMap: nightMap,
        emissiveIntensity: 0.45,
      })

      const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(2.15, 96, 96), earthMaterial)
      earthGroup.add(earthMesh)

      cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 96, 96),
        new THREE.MeshPhongMaterial({
          map: cloudsMap,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      )
      earthGroup.add(cloudMesh)

      atmosphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.32, 64, 64),
        new THREE.ShaderMaterial({
          uniforms: {
            glowColor: { value: new THREE.Color(0x2da8ff) },
            viewVector: { value: camera.position.clone() },
          },
          vertexShader: `
            uniform vec3 viewVector;
            varying float intensity;
            void main() {
              vec3 vNormal = normalize(normalMatrix * normal);
              vec3 vNormel = normalize(normalMatrix * viewVector);
              intensity = pow(0.72 - dot(vNormal, vNormel), 4.2);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 glowColor;
            varying float intensity;
            void main() {
              gl_FragColor = vec4(glowColor, intensity * 0.75);
            }
          `,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      )
      earthGroup.add(atmosphereMesh)

      focusRef.current = (lat: number, lon: number) => {
        targetRotationY = (-lon * Math.PI) / 180 + 0.1
        targetRotationX = -0.35 + ((lat * Math.PI) / 180) * 0.14
        targetScale = 1.16
        focusTimer = 0
        mode = "focusing"
      }

      const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
      const dragState = {
        isDragging: false,
        lastX: 0,
        lastY: 0,
        velocityX: 0,
        velocityY: 0,
        pointerId: 0,
      }

      const handleResize = () => {
        if (!renderer || !camera) return
        const bounds = container.getBoundingClientRect()
        if (!bounds.width || !bounds.height) return
        camera.aspect = bounds.width / bounds.height
        camera.updateProjectionMatrix()
        renderer.setSize(bounds.width, bounds.height, false)
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

      const handleWheel = (event: WheelEvent) => {
        const delta = event.deltaY > 0 ? -0.05 : 0.05
        targetScale = clamp(targetScale + delta, 0.95, 1.4)
        mode = "idle"
      }

      canvas.addEventListener("pointerdown", handlePointerDown)
      canvas.addEventListener("pointermove", handlePointerMove)
      canvas.addEventListener("pointerup", handlePointerUp)
      canvas.addEventListener("pointerleave", handlePointerUp)
      canvas.addEventListener("wheel", handleWheel, { passive: true })

      const animate = () => {
        frameId = window.requestAnimationFrame(animate)
        if (!earthGroup) return

        const isFocused = mode !== "idle"
        const spinAmount = isFocused ? 0.0011 : 0.004
        earthGroup.rotation.y -= spinAmount
        if (!dragState.isDragging) {
          dragState.velocityX *= 0.94
          dragState.velocityY *= 0.94
          targetRotationY += dragState.velocityX
          targetRotationX = clamp(targetRotationX + dragState.velocityY, -1.15, 1.15)
        }
        earthGroup.rotation.x += (targetRotationX - earthGroup.rotation.x) * 0.03
        earthGroup.rotation.y += (targetRotationY - earthGroup.rotation.y) * 0.02
        earthGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05)

        if (cloudMesh) {
          cloudMesh.rotation.y -= isFocused ? 0.001 : 0.0032
        }
        if (atmosphereMesh?.material?.uniforms) {
          atmosphereMesh.material.uniforms.viewVector.value.copy(camera.position)
        }
        if (starField) {
          starField.rotation.y += 0.0004
        }

        if (mode === "focusing") {
          focusTimer += 0.016
          const progress = Math.min(1, focusTimer / focusDuration)
          const ease = progress * progress * (3 - 2 * progress)
          camera.position.lerpVectors(new THREE.Vector3(0, 1.15, 6.8), new THREE.Vector3(0, 0.95, 4.25), ease)
          if (progress >= 1) mode = "focused"
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
        canvas.removeEventListener("wheel", handleWheel)
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
      <div id="glow" className="absolute inset-0" />
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
    </div>
  )
}
