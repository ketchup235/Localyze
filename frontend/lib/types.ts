export type Business = {
  id: string
  name: string
  category: string
  address: string
  rating?: number
  base_rating?: number
  review_count?: number
  deals?: { code: string; discount: string }[]
}

export type Review = {
  user: string
  rating: number
  text: string
  date: string
}

export type LocationPayload = {
  zip: string
  lat: number
  lon: number
  label: string
}
