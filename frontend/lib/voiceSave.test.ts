import { describe, it, expect } from "vitest"
import type { Business } from "./types"
import { parseSaveCommand, normalizeName, matchBusinessName } from "./voiceSave"

describe("parseSaveCommand", () => {
  it("pulls the name after a leading save verb", () => {
    expect(parseSaveCommand("save joe's coffee")).toBe("joe's coffee")
  })
  it("is case-insensitive on the verb", () => {
    expect(parseSaveCommand("Save Corner Bakery")).toBe("Corner Bakery")
  })
  it("handles a polite prefix before the verb", () => {
    expect(parseSaveCommand("please save river books")).toBe("river books")
  })
  it("strips a leading article from the name", () => {
    expect(parseSaveCommand("save the corner bakery")).toBe("corner bakery")
  })
  it("accepts bookmark as a synonym", () => {
    expect(parseSaveCommand("bookmark river books")).toBe("river books")
  })
  it("accepts favorite/favourite as a synonym", () => {
    expect(parseSaveCommand("favourite joe's garage")).toBe("joe's garage")
    expect(parseSaveCommand("favorite joe's garage")).toBe("joe's garage")
  })
  it("returns null when there is no name after the verb", () => {
    expect(parseSaveCommand("save")).toBeNull()
  })
  it("does not treat the saved filter as a save command", () => {
    expect(parseSaveCommand("show me saved")).toBeNull()
    expect(parseSaveCommand("saved")).toBeNull()
  })
  it("returns null for unrelated commands", () => {
    expect(parseSaveCommand("filter by food")).toBeNull()
    expect(parseSaveCommand("no thanks")).toBeNull()
  })
})

describe("normalizeName", () => {
  it("lowercases, drops possessives and punctuation, collapses whitespace", () => {
    expect(normalizeName("Joe's Coffee House")).toBe("joe coffee house")
    expect(normalizeName("River & Co.")).toBe("river co")
    expect(normalizeName("  The  Corner   Bakery ")).toBe("the corner bakery")
  })
})

describe("matchBusinessName", () => {
  const businesses: Business[] = [
    { id: "1", name: "Joe's Coffee House", category: "food", address: "1 Main St" },
    { id: "2", name: "Corner Bakery", category: "food", address: "2 Main St" },
    { id: "3", name: "River Books", category: "retail", address: "3 Main St" },
    { id: "4", name: "Joe's Garage", category: "services", address: "4 Main St" },
  ]

  it("matches an exact (normalized) name", () => {
    expect(matchBusinessName("corner bakery", businesses)?.id).toBe("2")
  })
  it("matches when spoken name is a token subset of the real name", () => {
    expect(matchBusinessName("joe's coffee", businesses)?.id).toBe("1")
  })
  it("matches on a distinctive substring", () => {
    expect(matchBusinessName("coffee", businesses)?.id).toBe("1")
  })
  it("is case-insensitive", () => {
    expect(matchBusinessName("RIVER BOOKS", businesses)?.id).toBe("3")
  })
  it("returns null when nothing matches", () => {
    expect(matchBusinessName("pizza palace", businesses)).toBeNull()
  })
  it("returns null for an empty query", () => {
    expect(matchBusinessName("", businesses)).toBeNull()
  })
  it("returns null when the query is ambiguous across multiple results", () => {
    // "joe" appears in both "Joe's Coffee House" and "Joe's Garage".
    expect(matchBusinessName("joe", businesses)).toBeNull()
  })
})
