import type { Business, LocationPayload, Review } from "@/lib/types"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000"

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

export async function fetchBusinesses(zip: string): Promise<Business[]> {
  return request<Business[]>(`/api/businesses?zip=${zip}`)
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
