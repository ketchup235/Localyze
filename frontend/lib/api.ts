import type { Business, LocationPayload, Review } from "@/lib/types"

// Default to same-origin so Next rewrites can proxy in dev.
const rawBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "")
const API_BASE =
  typeof window !== "undefined" &&
  rawBase.includes("localhost") &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? ""
    : rawBase

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
  }

  return (await res.json()) as T
}

export async function fetchLocation(zip: string): Promise<LocationPayload> {
  const data = await request<{ success: boolean; location: LocationPayload }>(`/api/location?zip=${zip}`)
  return data.location
}

// Where the business list came from: a previous cache, a live OpenStreetMap
// lookup, the bundled offline seed dataset, or nothing for an unknown zip.
export type BusinessSource = "cache" | "live" | "seed" | "none"

export type BusinessResult = {
  businesses: Business[]
  source: BusinessSource
}

export async function fetchBusinesses(zip: string): Promise<BusinessResult> {
  const data = await request<{ businesses: Business[]; source: BusinessSource }>(
    `/api/businesses?zip=${zip}`,
  )
  return { businesses: data.businesses ?? [], source: data.source ?? "none" }
}

export async function fetchReviews(id: string): Promise<Review[]> {
  return request<Review[]>(`/api/reviews/${id}`)
}

export async function submitReview(payload: {
  businessId: string
  user: string
  rating: number
  text: string
}): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/review", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function submitCoupon(payload: {
  businessId: string
  code: string
  discount: string
}): Promise<{ success: boolean } | { success: false; error: string }> {
  return request<{ success: boolean }>("/api/coupon", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function fetchCaptcha(): Promise<{ question: string }> {
  return request<{ question: string }>("/api/captcha")
}

export async function verifyCaptcha(answer: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/verify-captcha", {
    method: "POST",
    body: JSON.stringify({ answer }),
  })
}

export async function fetchHelp(message: string): Promise<{ reply: string }> {
  return request<{ reply: string }>("/api/help", {
    method: "POST",
    body: JSON.stringify({ message }),
  })
}
