import { describe, it, expect } from "vitest"
import { speechToDigits, parseZip } from "./VoiceControl"

describe("speechToDigits", () => {
  describe("bare numbers", () => {
    it("passes a digit string through unchanged", () => {
      expect(speechToDigits("10001")).toBe("10001")
    })
    it("returns empty string when there are no numbers", () => {
      expect(speechToDigits("hello world")).toBe("")
    })
    it("returns empty string for empty input", () => {
      expect(speechToDigits("")).toBe("")
    })
  })

  describe("single-digit words", () => {
    it("maps spelled-out single digits", () => {
      expect(speechToDigits("one zero zero zero one")).toBe("10001")
    })
    it('treats "oh" and "o" as zero', () => {
      expect(speechToDigits("one oh oh o one")).toBe("10001")
    })
    it("is case-insensitive", () => {
      expect(speechToDigits("ONE Two THREE")).toBe("123")
    })
  })

  describe("teens", () => {
    it("maps ten through nineteen to two digits", () => {
      expect(speechToDigits("ten")).toBe("10")
      expect(speechToDigits("sixteen")).toBe("16")
      expect(speechToDigits("nineteen")).toBe("19")
    })
  })

  describe("tens", () => {
    it("combines a tens word with a following ones word", () => {
      expect(speechToDigits("thirty five")).toBe("35")
      expect(speechToDigits("ninety nine")).toBe("99")
    })
    it("pads a bare tens word with a trailing zero", () => {
      expect(speechToDigits("thirty")).toBe("30")
      expect(speechToDigits("twenty")).toBe("20")
    })
    it('does not merge a tens word with a following "oh"/zero (emitted separately)', () => {
      expect(speechToDigits("thirty oh")).toBe("300")
    })
  })

  describe("hundred", () => {
    it('expands "hundred" to two zeros', () => {
      expect(speechToDigits("one hundred")).toBe("100")
    })
  })

  describe("double / triple", () => {
    it("repeats the next single digit", () => {
      expect(speechToDigits("double three")).toBe("33")
      expect(speechToDigits("triple seven")).toBe("777")
    })
    it("ignores a trailing repeat word with no following digit", () => {
      expect(speechToDigits("five double")).toBe("5")
    })
  })

  describe("separators and punctuation", () => {
    it("ignores hyphens between number words", () => {
      expect(speechToDigits("thirty-five")).toBe("35")
    })
    it("strips comma and dot thousands separators", () => {
      expect(speechToDigits("19,335")).toBe("19335")
      expect(speechToDigits("19.335")).toBe("19335")
    })
    it("ignores stray punctuation around words", () => {
      expect(speechToDigits("three, four.")).toBe("34")
    })
  })

  describe("filler words", () => {
    it("ignores non-number words mixed into the phrase", () => {
      expect(speechToDigits("my zip is one zero zero zero one")).toBe("10001")
    })
  })

  describe("mixed forms (realistic recognizer output)", () => {
    it("parses a mix of teens, ones, and tens into a zip", () => {
      expect(speechToDigits("nineteen three thirty five")).toBe("19335")
    })
  })
})

describe("parseZip", () => {
  it("extracts a zip from spelled-out single digits", () => {
    expect(parseZip("one zero zero zero one")).toBe("10001")
  })
  it("extracts a zip from mixed number words", () => {
    expect(parseZip("nineteen three thirty five")).toBe("19335")
  })
  it("extracts a bare zip embedded in a sentence", () => {
    expect(parseZip("the code is 90210 thanks")).toBe("90210")
  })
  it("returns the first 5-digit run when extra digits follow", () => {
    expect(parseZip("100012345")).toBe("10001")
  })
  it("returns null when fewer than five digits are present", () => {
    expect(parseZip("only 1234 left")).toBeNull()
  })
  it("returns null for non-numeric input", () => {
    expect(parseZip("hello there")).toBeNull()
  })
})
