import { useEffect, useState } from "react"
import type { Business } from "@/lib/types"

const STORAGE_KEY = "localyze_saved"

export interface UseSavedBusinesses {
  saved: Business[]
  isSaved: (id: string) => boolean
  toggleSaved: (business: Business) => void
}

// Keeps the saved list in sync with localStorage: loads it once on mount,
// then writes back whenever it changes.
export function useSavedBusinesses(): UseSavedBusinesses {
  const [saved, setSaved] = useState<Business[]>([])

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      setSaved(JSON.parse(raw))
    } catch {
      setSaved([])
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  }, [saved])

  const isSaved = (id: string): boolean => saved.some((b) => b.id === id)

  const toggleSaved = (business: Business): void => {
    setSaved((prev) =>
      prev.some((b) => b.id === business.id)
        ? prev.filter((b) => b.id !== business.id)
        : [...prev, business],
    )
  }

  return { saved, isSaved, toggleSaved }
}
