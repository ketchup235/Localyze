# Accessibility

Localyze is built to be usable by everyone, including people who rely on a
keyboard, a screen reader, voice input, or reduced-motion settings. This document
summarizes the accessibility features so they can be highlighted during the
presentation (FBLA rating sheet — *UX Design: accessibility features*).

## Voice control — an assistive, hands-free path

The microphone button (bottom-left) lets a user **search by zip, change the
category, and change the sort entirely by voice** — no typing, no precise mouse
targeting required. This directly supports users with motor impairments, low
vision, or anyone who finds typing difficult.

- The button exposes its state to assistive tech with `aria-pressed` and a
  context-aware `aria-label` ("Start voice search" / "Stop voice assistant").
- A persistent **`role="status"` / `aria-live="polite"` region** announces what
  the assistant heard and did (e.g. "Searching 10001 — found 6 businesses"), so
  blind users get the same feedback sighted users see in the caption.
- Spoken results are also read back aloud via speech synthesis, closing the loop
  for eyes-free use.

## Keyboard & navigation

- **Skip link**: the first focusable element is a "Skip to main content" link
  (visible on focus) so keyboard users can bypass the hero.
- All interactive controls are native `<button>` / `<input>` / `<select>`
  elements, so they are focusable and operable with Tab / Enter / Space by
  default.
- The business detail view uses a Radix UI `Dialog`, which traps focus while
  open and restores it on close.
- Zip search responds to **Enter** in every input.

## Screen-reader support (ARIA)

- Result counts use `aria-live="polite"` so the "N businesses found" total is
  announced as filters change.
- Save buttons use `aria-pressed` and a descriptive `aria-label`
  ("Save {name}" / "Remove {name} from saved").
- Form submission errors render with `role="alert"` / `aria-live="assertive"`
  so validation problems are announced immediately.
- The verification (CAPTCHA) input is explicitly labeled.
- `lang="en"` is set on the document; landmark elements (`<header>`, `<main>`)
  structure the page.

## Reduced motion

The app honors the OS-level **`prefers-reduced-motion`** setting: UI transitions,
spinners, and the voice pulse are neutralized for users who are sensitive to
motion (see `app/globals.css`).

## Forms & input

- Inputs enforce the same length limits as the server (`maxLength`), so feedback
  is immediate rather than only on submit.
- Validation messages are specific and human-readable, surfaced inline near the
  action (see input validation in the README).

## Visual design

- Dark theme with high-contrast emerald/sky accent text on dark slate surfaces.
- Status is never conveyed by color alone — icons and text labels accompany
  color (e.g. the "Offline sample data" badge, saved-heart fill + label).

## Known limitations / future work

- The 3D globe hero is decorative; its WebGL rotation is not yet gated behind
  `prefers-reduced-motion` (DOM animations are). Users can search immediately
  without interacting with it.
- Map markers rely on the Leaflet default controls; richer keyboard panning is a
  future enhancement.
