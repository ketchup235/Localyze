import type { LocationPayload } from "@/lib/types"

// Hard-coded, verified zip-code centroids. The globe/map fly to exactly these
// coordinates so the supported zips always land on the right spot.
export const ZIP_LOCATIONS: Record<string, LocationPayload> = {
  "10001": { zip: "10001", lat: 40.7506, lon: -73.9971, label: "New York City" },
  "19335": { zip: "19335", lat: 40.0062, lon: -75.7033, label: "Downingtown, PA" },
  "60601": { zip: "60601", lat: 41.8856, lon: -87.6215, label: "Chicago" },
  "90210": { zip: "90210", lat: 34.103, lon: -118.4105, label: "Beverly Hills" },
}

// Coarse regional centroids so an unknown-but-valid zip still flies to a
// plausible spot instead of failing the hand-off.
const REGIONS = [
  { min: 0, max: 19999, lat: 40.7, lon: -74.0, label: "Northeast" },
  { min: 20000, max: 39999, lat: 35.4, lon: -82.2, label: "Southeast" },
  { min: 40000, max: 59999, lat: 41.6, lon: -87.6, label: "Midwest" },
  { min: 60000, max: 79999, lat: 38.7, lon: -97.0, label: "South Central" },
  { min: 80000, max: 89999, lat: 39.6, lon: -111.9, label: "Mountain West" },
  { min: 90000, max: 96999, lat: 34.1, lon: -118.2, label: "California" },
  { min: 97000, max: 99999, lat: 47.2, lon: -122.3, label: "Pacific Northwest" },
]

export function getFallbackLocation(zip: string): LocationPayload | null {
  const exact = ZIP_LOCATIONS[zip]
  if (exact) return { ...exact, zip }

  const zipNumber = Number.parseInt(zip, 10)
  if (!Number.isFinite(zipNumber)) return null

  const region = REGIONS.find((entry) => zipNumber >= entry.min && zipNumber <= entry.max)
  if (!region) return null

  return { zip, lat: region.lat, lon: region.lon, label: region.label }
}
