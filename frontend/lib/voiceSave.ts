import type { Business } from "./types"

// Words that introduce a "save this business" command. "saved" is deliberately
// excluded (it's the saved-businesses filter, e.g. "show me saved").
const SAVE_VERB = /\b(save|bookmark|favou?rite)\b\s+(.+)/i
const LEADING_ARTICLE = /^(the|a|an)\s+/i

// Pull the business name out of a spoken save command. Returns null when the
// phrase isn't a save command or names nothing ("save" on its own).
export function parseSaveCommand(text: string): string | null {
  const match = text.match(SAVE_VERB)
  if (!match) return null
  const name = match[2].trim().replace(LEADING_ARTICLE, "").trim()
  return name || null
}

// Normalize a business name for loose comparison: lowercase, drop possessives
// ("Joe's" → "joe"), strip punctuation, and collapse whitespace. The recognizer
// rarely returns punctuation or possessives the same way a name is written.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const EXACT = 3
const SUBSTRING = 2
const TOKEN_SUBSET = 1

// Score how well a spoken query matches a single business name. Higher is better;
// 0 means no match.
function scoreName(query: string, name: string): number {
  if (!query || !name) return 0
  if (name === query) return EXACT
  if (name.includes(query) || query.includes(name)) return SUBSTRING

  const nameTokens = new Set(name.split(" "))
  const queryTokens = query.split(" ").filter(Boolean)
  const everyTokenMatches = queryTokens.every((t) => nameTokens.has(t))
  return queryTokens.length > 0 && everyTokenMatches ? TOKEN_SUBSET : 0
}

// Find the business that best matches a spoken name. Returns null when nothing
// matches or when two or more results tie for the best score (ambiguous — we'd
// rather ask again than save the wrong business).
export function matchBusinessName(
  spoken: string,
  businesses: readonly Business[],
): Business | null {
  const query = normalizeName(spoken)
  if (!query) return null

  let best: Business | null = null
  let bestScore = 0
  let tied = false

  for (const business of businesses) {
    const score = scoreName(query, normalizeName(business.name))
    if (score === 0) continue
    if (score > bestScore) {
      best = business
      bestScore = score
      tied = false
    } else if (score === bestScore) {
      tied = true
    }
  }

  return tied ? null : best
}
