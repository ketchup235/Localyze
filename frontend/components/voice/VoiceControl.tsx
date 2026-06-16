"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Volume2, Loader2, X } from "lucide-react"

type VoiceControlProps = {
  // Runs the animated search for a zip; resolves with the result count once the
  // search + transition have played, or null if it failed/was invalid.
  onSearchZip: (zip: string) => Promise<{ count: number; zip: string } | null>
  onSetCategory: (category: string) => void
  onSetSort: (sort: string) => void
}

type Status = "idle" | "speaking" | "listening" | "working"

const ONES: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
}
const TEENS: Record<string, string> = {
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
}
const TENS: Record<string, string> = {
  twenty: "2", thirty: "3", forty: "4", fifty: "5",
  sixty: "6", seventy: "7", eighty: "8", ninety: "9",
}

// Convert a spoken phrase into a run of digits, then pull a 5-digit zip out of
// it. Handles single digits ("one zero zero zero one"), bare numbers ("10001"),
// teens and tens spoken as words ("nineteen three thirty five" → 19335), and
// "double"/"triple" ("double three" → 33). Speech engines love to return zips as
// a mix of these, which is why a naive single-digit map missed things like 19335.
function speechToDigits(text: string): string {
  const tokens = text
    .toLowerCase()
    // Strip separators the recognizer injects: hyphens ("thirty-five"), commas
    // and dots used as thousands separators ("19,335" / "19.335"), so a number
    // like 19335 isn't lost to formatting.
    .replace(/[-_]/g, " ")
    .replace(/[,.](?=\d)/g, "")
    // Drop any other stray punctuation (e.g. "three," → "three") so it doesn't
    // hide a number word.
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)

  let out = ""
  let repeat = 1 // set by "double"/"triple" to repeat the next single digit

  const push = (chunk: string) => {
    out += repeat > 1 ? chunk.repeat(repeat) : chunk
    repeat = 1
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const next = tokens[i + 1]

    if (/^\d+$/.test(t)) {
      push(t)
    } else if (t in ONES) {
      push(ONES[t])
    } else if (t in TEENS) {
      push(TEENS[t])
    } else if (t in TENS) {
      // "thirty five" → 35; bare "thirty" → 30.
      if (next && next in ONES && next !== "zero" && next !== "oh" && next !== "o") {
        push(TENS[t] + ONES[next])
        i++
      } else {
        push(TENS[t] + "0")
      }
    } else if (t === "hundred") {
      push("00")
    } else if (t === "double") {
      repeat = 2
    } else if (t === "triple") {
      repeat = 3
    }
    // Anything else (filler words like "my", "zip", "is") is ignored.
  }

  return out
}

// Pull a 5-digit zip out of a spoken phrase. Tries the word-aware parser first,
// then falls back to raw digits already present in the text.
function parseZip(text: string): string | null {
  const fromWords = speechToDigits(text).match(/\d{5}/)
  if (fromWords) return fromWords[0]
  const rawDigits = text.replace(/\D/g, "").match(/\d{5}/)
  return rawDigits ? rawDigits[0] : null
}

// Rank the browser's available voices and pick the most natural-sounding one.
// The default system voice is usually a flat, robotic fallback - modern browsers
// ship far warmer neural voices, but you have to opt into them explicitly:
//   • Edge:   "Microsoft Aria Online (Natural)" and friends
//   • Chrome: "Google US English"
//   • Safari/macOS: "(Premium)" / "(Enhanced)" voices (Ava, Samantha, …)
function pickNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang))
  const pool = english.length ? english : voices
  if (!pool.length) return null

  // Hand-picked names that sound especially human, in rough order of warmth.
  const preferredNames = [
    "aria", "jenny", "emma", "ava", "samantha", "serena", "allison",
    "google us english", "google uk english female",
  ]

  const score = (v: SpeechSynthesisVoice): number => {
    const name = v.name.toLowerCase()
    let s = 0
    if (/natural/.test(name)) s += 120 // Microsoft "Natural" neural voices
    if (/premium/.test(name)) s += 80 // Apple premium voices
    if (/enhanced/.test(name)) s += 55 // Apple enhanced voices
    if (/google/.test(name)) s += 50 // Google neural voices
    if (!v.localService) s += 25 // cloud voices are typically richer
    const idx = preferredNames.findIndex((n) => name.includes(n))
    if (idx !== -1) s += 40 - idx * 2
    if (/en-us/i.test(v.lang)) s += 10
    // Penalize the obviously synthetic / novelty system voices.
    if (/(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|eddy|flo|fred|good news|grandma|grandpa|jester|junior|kathy|organ|ralph|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)/.test(name)) s -= 100
    return s
  }

  return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null
}

// Map a spoken command to a category and/or sort change.
function interpretCommand(
  text: string,
): { category?: string; sort?: string; phrase: string } | null {
  const s = text.toLowerCase()
  let category: string | undefined
  let sort: string | undefined

  if (/\b(food|restaurant|restaurants|eat|dining|cafe)\b/.test(s)) category = "food"
  else if (/\b(retail|shop|shops|shopping|store|stores)\b/.test(s)) category = "retail"
  else if (/\b(service|services)\b/.test(s)) category = "services"
  else if (/\b(saved|favorite|favourites?|favorites)\b/.test(s)) category = "saved"
  else if (/\b(all|everything|reset|clear)\b/.test(s)) category = "all"

  if (/\b(top rated|highest rated|best rated|rating|ratings|best)\b/.test(s)) sort = "rating"
  else if (/\b(most reviewed|reviews?|popular)\b/.test(s)) sort = "reviews"
  else if (/\b(name|names|alphabetical|a to z|a z)\b/.test(s)) sort = "name"

  if (!category && !sort) return null

  const sortLabel =
    sort === "rating" ? "top rated" : sort === "reviews" ? "most reviewed" : sort === "name" ? "name" : ""
  let phrase = ""
  if (category && sort) phrase = `Showing ${category}, sorted by ${sortLabel}.`
  else if (category) phrase = category === "all" ? "Showing all businesses." : `Filtering by ${category}.`
  else if (sort) phrase = `Sorting by ${sortLabel}.`

  return { category, sort, phrase }
}

export function VoiceControl({ onSearchZip, onSetCategory, onSetSort }: VoiceControlProps) {
  const [supported, setSupported] = useState(true)
  const [status, setStatus] = useState<Status>("idle")
  const [caption, setCaption] = useState("")
  const recognitionRef = useRef<any>(null)
  const activeRef = useRef(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  // Set while listening: calling it immediately ends the current turn and submits
  // whatever has been heard so far. Used by the Enter-to-submit handler.
  const submitListenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR || typeof window.speechSynthesis === "undefined") setSupported(false)
  }, [])

  // Voices populate asynchronously in most browsers - load them now and refresh
  // when the list changes, caching the most natural-sounding pick.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return
    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      if (!voices.length) return
      voiceRef.current = pickNaturalVoice(voices)
      // Diagnostic: confirms a non-default voice was actually picked, and lists
      // what the browser offers. Check the console if it still sounds robotic.
      console.info(
        "[VoiceControl] using voice:",
        voiceRef.current?.name,
        "| available:",
        voices.map((v) => v.name),
      )
    }
    loadVoice()
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoice)
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoice)
  }, [])

  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* noop */
      }
      try {
        recognitionRef.current?.abort?.()
      } catch {
        /* noop */
      }
    }
  }, [])

  // Pressing Enter while the assistant is listening submits the captured speech
  // immediately instead of waiting for the natural silence cutoff.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return
      if (submitListenRef.current) {
        e.preventDefault()
        submitListenRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const speak = (text: string) =>
    new Promise<void>((resolve) => {
      setCaption(text)
      setStatus("speaking")
      try {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(text)
        // Re-resolve in case voices finished loading after mount.
        if (!voiceRef.current) {
          const voices = window.speechSynthesis.getVoices()
          if (voices.length) voiceRef.current = pickNaturalVoice(voices)
        }
        if (voiceRef.current) {
          utter.voice = voiceRef.current
          utter.lang = voiceRef.current.lang
        }
        // Slightly slower with a touch of pitch reads warmer and less synthetic
        // than the default flat delivery.
        utter.rate = 0.97
        utter.pitch = 1.05
        utter.onend = () => resolve()
        utter.onerror = () => resolve()
        window.speechSynthesis.speak(utter)
      } catch {
        resolve()
      }
    })

  const listen = () =>
    new Promise<string>((resolve) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SR) {
        resolve("")
        return
      }
      const recognition = new SR()
      recognitionRef.current = recognition
      recognition.lang = "en-US"
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.continuous = true

      let best = ""
      let settled = false
      // Safety cap so the mic can't hang open forever if the user never speaks.
      // Not shown to the user - when they do speak, the silence cutoff below ends
      // the turn well before this.
      const MAX_MS = 12000
      // Once we have real transcript text, finish this many ms after the user
      // stops talking.
      const SILENCE_MS = 1300

      let silenceTimer: ReturnType<typeof setTimeout> | null = null

      const clearSilence = () => {
        if (silenceTimer) {
          clearTimeout(silenceTimer)
          silenceTimer = null
        }
      }

      const cap = setTimeout(() => finish(), MAX_MS)

      const finish = () => {
        if (settled) return
        settled = true
        submitListenRef.current = null
        clearTimeout(cap)
        clearSilence()
        try {
          recognition.stop()
        } catch {
          /* noop */
        }
        resolve(best.trim())
      }

      // Expose a way to end this turn early (Enter key / explicit submit).
      submitListenRef.current = () => finish()

      // Restart the engine after it stops itself, as long as the window is still
      // open and we don't already have usable text. Deferred on purpose: calling
      // start() synchronously inside onend throws InvalidStateError in Chromium
      // (Arc included) because the engine hasn't reset yet.
      const restart = () => {
        if (settled || !activeRef.current) return
        setTimeout(() => {
          if (settled || !activeRef.current) return
          try {
            recognition.start()
          } catch {
            // If it's already running again, that's fine; otherwise give up.
            if (!best) finish()
          }
        }, 200)
      }

      setStatus("listening")
      setCaption("Listening…")

      recognition.onresult = (event: any) => {
        const text = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join(" ")
          .trim()
        if (text) {
          best = text
          setCaption(text)
          // Reset the natural-pause timer on every new word.
          clearSilence()
          silenceTimer = setTimeout(() => finish(), SILENCE_MS)
        }
      }
      recognition.onstart = () => console.info("[VoiceControl] recognition.onstart")
      recognition.onaudiostart = () => console.info("[VoiceControl] recognition.onaudiostart")
      recognition.onspeechstart = () => console.info("[VoiceControl] recognition.onspeechstart")
      recognition.onnomatch = () => console.info("[VoiceControl] recognition.onnomatch")
      recognition.onerror = (event: any) => {
        const err = event?.error
        console.info("[VoiceControl] recognition.onerror:", err)
        // Mic blocked: nothing we can do - surface it and stop.
        if (err === "not-allowed" || err === "service-not-allowed") {
          setCaption("Microphone access is blocked. Enable it in your browser settings.")
          finish()
          return
        }
        // A "network" / "language-not-supported" error here means this browser
        // can't reach a speech backend at all (common in Chromium browsers like
        // Arc/Brave that lack Google's speech API key).
        // "no-speech" / "aborted" fire constantly before the user talks - ignore
        // and let onend restart us inside the window.
      }
      recognition.onend = () => {
        if (settled) return
        // If we captured text and the engine stopped, the user is done.
        if (best) {
          finish()
          return
        }
        // Otherwise the engine bailed early - keep the window open.
        restart()
      }

      try {
        recognition.start()
      } catch {
        finish()
      }
    })

  const stopAll = () => {
    activeRef.current = false
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* noop */
    }
    try {
      recognitionRef.current?.stop?.()
    } catch {
      /* noop */
    }
    setStatus("idle")
    setCaption("")
  }

  const runFlow = async () => {
    if (activeRef.current) {
      stopAll()
      return
    }
    if (!supported) return
    activeRef.current = true

    try {
      await speak("Tell us a zip code you want to search for.")
      if (!activeRef.current) return

      const zipText = await listen()
      if (!activeRef.current) return
      const zip = parseZip(zipText)
      // Diagnostic: shows exactly what the recognizer returned vs. what we parsed.
      console.info("[VoiceControl] heard:", JSON.stringify(zipText), "→ zip:", zip)
      if (!zip) {
        await speak("Sorry, I didn't catch a valid five digit zip code. Tap the mic to try again.")
        stopAll()
        return
      }

      setStatus("working")
      setCaption(`Searching ${zip}…`)
      const result = await onSearchZip(zip)
      if (!activeRef.current) return
      if (!result) {
        await speak("I couldn't complete that search. Please try again.")
        stopAll()
        return
      }

      await speak(
        `I found ${result.count} ${result.count === 1 ? "business" : "businesses"} near ${zip}. ` +
          "Would you like me to filter by a category? You can say, for example, filter by food, or sort by top rated.",
      )
      if (!activeRef.current) return

      // Keep taking commands until the user is silent / says never mind.
      let keepGoing = true
      while (keepGoing && activeRef.current) {
        const commandText = await listen()
        if (!activeRef.current) break
        if (!commandText || /\b(no|nope|never mind|nothing|stop|cancel|that's all|thats all)\b/i.test(commandText)) {
          await speak("Okay.")
          break
        }
        const command = interpretCommand(commandText)
        if (!command) {
          await speak("I didn't catch that. You can say things like filter by services, or sort by most reviewed.")
          continue
        }
        if (command.category) onSetCategory(command.category)
        if (command.sort) onSetSort(command.sort)
        await speak(command.phrase + " Anything else?")
      }
    } catch {
      /* swallow - stopAll resets state */
    } finally {
      stopAll()
    }
  }

  if (!supported) return null

  const isActive = status !== "idle"

  return (
    <div className="fixed bottom-6 left-6 z-[10040] flex items-center gap-3">
      {/* Persistent live region so screen-reader users hear what the voice
          assistant heard and did, even though the caption is visual. */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {caption}
      </span>
      <button
        type="button"
        onClick={runFlow}
        aria-pressed={isActive}
        aria-label={isActive ? "Stop voice assistant" : "Start voice search"}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl backdrop-blur transition ${
          isActive
            ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
            : "border-white/10 bg-slate-950/85 text-emerald-300 hover:bg-slate-900"
        }`}
      >
        {status === "listening" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
        )}
        <span className="relative">
          {status === "idle" && <Mic className="h-6 w-6" />}
          {status === "listening" && <Mic className="h-6 w-6" />}
          {status === "speaking" && <Volume2 className="h-6 w-6" />}
          {status === "working" && <Loader2 className="h-6 w-6 animate-spin" />}
        </span>
      </button>

      {caption && (
        <div
          aria-hidden="true"
          className="flex max-w-[min(360px,70vw)] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-2 shadow-2xl backdrop-blur"
        >
          <p className="text-sm text-slate-200">{caption}</p>
          <button
            type="button"
            onClick={stopAll}
            aria-label="Stop"
            className="shrink-0 rounded-full p-1 text-slate-500 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
