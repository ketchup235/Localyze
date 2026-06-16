import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { VoiceControl } from "./VoiceControl"

const props = {
  onSearchZip: vi.fn(async () => null),
  onSetCategory: vi.fn(),
  onSetSort: vi.fn(),
}

// Minimal Web Speech API stubs so the component treats the browser as supported.
function installSpeechApis() {
  ;(window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  ;(window as unknown as Record<string, unknown>).speechSynthesis = {
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
  }
}

function removeSpeechApis() {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  delete (window as unknown as Record<string, unknown>).speechSynthesis
}

describe("VoiceControl accessibility", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders nothing when the Web Speech API is unavailable", () => {
    removeSpeechApis()
    const { container } = render(<VoiceControl {...props} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("exposes the mic control with an accessible name and unpressed state", () => {
    installSpeechApis()
    render(<VoiceControl {...props} />)
    const button = screen.getByRole("button", { name: /start voice search/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute("aria-pressed", "false")
  })

  it("provides a polite, atomic live region so voice feedback is announced", () => {
    installSpeechApis()
    render(<VoiceControl {...props} />)
    const status = screen.getByRole("status")
    expect(status).toHaveAttribute("aria-live", "polite")
    expect(status).toHaveAttribute("aria-atomic", "true")
  })
})
