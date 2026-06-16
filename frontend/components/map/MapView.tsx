"use client"

import { useEffect, useRef, useState } from "react"
import type { Business, LocationPayload } from "@/lib/types"

type MapViewProps = {
  focus?: LocationPayload | null
  businesses?: Business[]
  selectedId?: string | null
  panelOpen?: boolean
  onSelectBusiness?: (business: Business) => void
}

// ── Offline map ────────────────────────────────────────────────────────────
// Leaflet is bundled locally (npm) and its CSS is served from /public, and the
// basemap is drawn procedurally on a canvas - so the whole map works with no
// network. Tiles are a believable dark city grid (parks, water, roads), not real
// geography (the brief said locations only need to look believable).

// Deterministic hash → [0, 1) for a tile block.
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Draw one 256px basemap tile at tile coords (tx, ty).
function drawTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, S: number) {
  ctx.fillStyle = "#0a121c"
  ctx.fillRect(0, 0, S, S)

  const wx = tx * S
  const wy = ty * S
  const minor = 40
  const startX = Math.floor(wx / minor)
  const startY = Math.floor(wy / minor)
  const cols = Math.ceil(S / minor) + 1
  const rows = Math.ceil(S / minor) + 1

  // City blocks - mostly buildings, with occasional parks and water.
  for (let i = 0; i <= cols; i += 1) {
    for (let j = 0; j <= rows; j += 1) {
      const bx = startX + i
      const by = startY + j
      const px = bx * minor - wx
      const py = by * minor - wy
      const h = hash2(bx, by)
      let fill = "#0e1825"
      if (h < 0.05) fill = "#10301f" // park
      else if (h < 0.085) fill = "#0b2433" // water
      ctx.fillStyle = fill
      ctx.fillRect(px + 2, py + 2, minor - 4, minor - 4)
      if (h >= 0.085 && h < 0.62) {
        // a building footprint inside the block
        ctx.fillStyle = "#12202f"
        const bw = minor * (0.28 + ((h * 7) % 1) * 0.34)
        ctx.fillRect(px + 5, py + 5, bw, minor - 10)
      }
    }
  }

  // Minor street grid.
  ctx.strokeStyle = "#1a2737"
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= cols; i += 1) {
    const px = (startX + i) * minor - wx
    ctx.moveTo(px + 0.5, 0)
    ctx.lineTo(px + 0.5, S)
  }
  for (let j = 0; j <= rows; j += 1) {
    const py = (startY + j) * minor - wy
    ctx.moveTo(0, py + 0.5)
    ctx.lineTo(S, py + 0.5)
  }
  ctx.stroke()

  // Major roads every 4 blocks - thicker and lighter.
  const major = minor * 4
  const sX = Math.floor(wx / major)
  const sY = Math.floor(wy / major)
  ctx.strokeStyle = "#273a4f"
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let i = 0; i <= Math.ceil(S / major) + 1; i += 1) {
    const px = (sX + i) * major - wx
    ctx.moveTo(px + 0.5, 0)
    ctx.lineTo(px + 0.5, S)
  }
  for (let j = 0; j <= Math.ceil(S / major) + 1; j += 1) {
    const py = (sY + j) * major - wy
    ctx.moveTo(0, py + 0.5)
    ctx.lineTo(S, py + 0.5)
  }
  ctx.stroke()
}

function createBasemapLayer(L: any): any {
  const Layer = L.GridLayer.extend({
    createTile(coords: any) {
      const tile = document.createElement("canvas")
      const size = this.getTileSize()
      tile.width = size.x
      tile.height = size.y
      const ctx = tile.getContext("2d")
      if (ctx) drawTile(ctx, coords.x, coords.y, size.x)
      return tile
    },
  })
  return new Layer({ tileSize: 256, minZoom: 0, maxZoom: 19, noWrap: false })
}

// Load Leaflet from the local bundle (no network), plus our styles.
async function loadLeaflet(): Promise<any> {
  if (typeof document !== "undefined") {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link")
      link.id = "leaflet-css"
      link.rel = "stylesheet"
      link.href = "/leaflet.css" // served locally → works offline
      document.head.appendChild(link)
    }
    if (!document.getElementById("lz-map-style")) {
      const style = document.createElement("style")
      style.id = "lz-map-style"
      style.textContent = `
        .lz-pin-wrap { background: transparent; border: 0; }
        .lz-pin { filter: drop-shadow(0 4px 6px rgba(0,0,0,0.45)); transition: transform 160ms ease; transform-origin: bottom center; }
        .lz-pin:hover { transform: scale(1.12); }
        .lz-pin--sel { transform: scale(1.18); }
        .leaflet-container { background: #0a121c; font-family: inherit; }
        .leaflet-control-zoom a {
          background: rgba(2,6,11,0.85); color: #cfe9df; border-color: rgba(255,255,255,0.12);
        }
        .leaflet-control-zoom a:hover { background: rgba(16,185,129,0.25); color: #ffffff; }
        .leaflet-tooltip.lz-tip {
          background: rgba(2,6,11,0.92); color: #e6edf6; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px; font-size: 12px; font-weight: 600; padding: 4px 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.4);
        }
        .leaflet-tooltip.lz-tip::before { display: none; }
      `
      document.head.appendChild(style)
    }
  }
  const mod = await import("leaflet")
  return (mod as any).default ?? mod
}

// Deterministic pseudo-random offset (in degrees) for a business id, so pins
// stay put across re-renders. Believable scatter, not real geocoding.
function offsetFor(id: string): { dLat: number; dLon: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = ((h >>> 0) % 3600) / 3600
  const b = ((h >>> 8) % 1000) / 1000
  const angle = a * Math.PI * 2
  const radius = 0.004 + b * 0.018 // ~0.4–2.4 km spread
  return { dLat: Math.sin(angle) * radius, dLon: (Math.cos(angle) * radius) / 0.78 }
}

function pinHtml(selected: boolean): string {
  const size = selected ? 36 : 30
  const fill = selected ? "#34d399" : "#10b981"
  return `<div class="lz-pin ${selected ? "lz-pin--sel" : ""}">
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C7.6 2 4 5.6 4 10c0 5.6 6.4 11 7.4 11.8.35.27.85.27 1.2 0C13.6 21 20 15.6 20 10c0-4.4-3.6-8-8-8z" fill="${fill}" stroke="#ffffff" stroke-width="1.4"/>
      <circle cx="12" cy="10" r="3" fill="#ffffff"/>
    </svg>
  </div>`
}

export function MapView({
  focus,
  businesses = [],
  selectedId = null,
  panelOpen = false,
  onSelectBusiness,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const onSelectRef = useRef(onSelectBusiness)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelectBusiness
  }, [onSelectBusiness])

  // ── Initialise the map once ──
  useEffect(() => {
    let disposed = false

    loadLeaflet()
      .then((L) => {
        if (disposed || !containerRef.current || mapRef.current) return
        leafletRef.current = L

        const map = L.map(containerRef.current, {
          center: [39.5, -98.35], // continental US, zoomed out
          zoom: 4,
          zoomControl: false,
          scrollWheelZoom: false, // scrolling never affects the map
          dragging: true, // pan by click-drag
          attributionControl: false,
          worldCopyJump: true,
        })
        L.control.zoom({ position: "bottomright" }).addTo(map)

        // Procedural offline basemap underneath (dark city grid, globe palette) -
        // this is what shows when there's no network.
        createBasemapLayer(L).addTo(map)

        // Real CARTO dark tiles on top. When online they cover the procedural base;
        // when offline they simply fail to load and the procedural map shows through.
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd",
          maxZoom: 19,
          // keep failed (offline) tiles invisible so the base shows through
          errorTileUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          attribution: "&copy; OpenStreetMap &copy; CARTO",
        }).addTo(map)

        markersLayerRef.current = L.layerGroup().addTo(map)
        mapRef.current = map
        setTimeout(() => map.invalidateSize(), 0)
        setReady(true)
      })
      .catch(() => {
        /* leaflet unavailable - container stays as a dark panel */
      })

    const handleResize = () => mapRef.current?.invalidateSize()
    window.addEventListener("resize", handleResize)

    return () => {
      disposed = true
      window.removeEventListener("resize", handleResize)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // ── Fly to the focused location (the seamless zoom-in). Runs once per focus
  // change - deliberately NOT tied to panelOpen so the panel sliding in can't
  // restart the zoom mid-flight. ──
  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!ready || !map || !L || !focus) return

    const targetZoom = 13
    const plainCenter = L.latLng(focus.lat, focus.lon)
    let center = plainCenter

    // On desktop the results panel covers the left ~44vw after a search, so shift
    // the map centre to keep the focused area in the visible (right) region.
    if (window.innerWidth >= 768) {
      const offsetX = (window.innerWidth * 0.44) / 2
      const pt = map.project(plainCenter, targetZoom)
      pt.x -= offsetX
      center = map.unproject(pt, targetZoom)
    }

    // Snap to the location while zoomed-out and hidden, then zoom in so the hand-off
    // from the globe reads as one continuous motion.
    map.setView(plainCenter, 6, { animate: false })
    map.flyTo(center, targetZoom, { duration: 3.2, easeLinearity: 0.2 })
  }, [ready, focus])

  // ── Zoom the map out when swinging back to the globe on a re-search ──
  // (kept for API parity; the globe now drives the visible zoom-out).

  // ── (Re)draw business markers ──
  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    const layer = markersLayerRef.current
    if (!ready || !map || !L || !layer || !focus) return

    layer.clearLayers()

    businesses.forEach((business) => {
      const { dLat, dLon } = offsetFor(business.id)
      const lat = focus.lat + dLat
      const lon = focus.lon + dLon
      const selected = business.id === selectedId

      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          html: pinHtml(selected),
          className: "lz-pin-wrap",
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          tooltipAnchor: [0, -28],
        }),
        zIndexOffset: selected ? 1000 : 0,
        riseOnHover: true,
      })

      marker.bindTooltip(business.name, {
        direction: "top",
        className: "lz-tip",
        offset: [0, -6],
      })
      marker.on("click", () => onSelectRef.current?.(business))
      marker.addTo(layer)
    })
  }, [ready, businesses, focus, selectedId])

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {/* ODbL requires the data credit be shown wherever the map is displayed.
          The Leaflet attribution control is disabled for styling, so we render a
          small static credit instead. */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer noopener"
        className="absolute bottom-1 left-2 z-[500] rounded bg-slate-950/70 px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
      >
        © OpenStreetMap contributors
      </a>
    </div>
  )
}
