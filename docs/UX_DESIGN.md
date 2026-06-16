# UX Design — Rationale, User Journey & Accessibility

This document covers the design thinking behind Localyze, the end-to-end user
journey, and the accessibility features built into the interface. It maps to the
rating sheet's **"UX Design: User Journey, Design Rationale, Accessibility
Features"** row.

## Design Rationale

**Goal:** make discovering a *local* business feel as effortless and inviting as
opening a map app, while steering people away from big chains toward the small
businesses the topic asks us to support.

Key decisions and why:

- **Zip-first, single-input entry.** The whole experience starts from one focused
  field. There are no accounts, no onboarding, and no clutter — lowering the
  barrier to the core action (find businesses near me).
- **Globe → map handoff.** The rotating 3D globe dives into the searched area and
  hands off to a flat interactive map. This is more than decoration: it gives the
  user a sense of *place* and makes the transition from "anywhere" to "right here"
  legible, reinforcing the local-discovery theme.
- **Results panel beside the map, not on top of it.** On desktop the list slides
  in at the left while the map stays visible at right, so users keep spatial
  context (where each business is) while scanning details. On mobile it becomes a
  bottom sheet — the standard, thumb-friendly pattern for map apps.
- **Chains filtered out by default.** The backend removes national chains so the
  results are *only* independent businesses, matching the product's purpose
  instead of making the user filter them out manually.
- **Trust through verification.** Reviews and coupons are community-sourced, so a
  lightweight math CAPTCHA guards every submission — keeping the data credible
  without forcing account creation.
- **Two ways to get help in-context.** A keyword help assistant and a voice
  control mean a user who is stuck can ask in natural language rather than hunting
  through menus.

## User Journey

1. **Arrive.** The hero presents the product in one line ("Find the businesses
   near you") with a single zip-code input.
2. **Search.** The user types a 5-digit zip (or speaks it via voice control).
   Invalid input is rejected immediately with a clear inline message.
3. **Travel.** The globe rolls to the location and dives in; the map fades up at
   the same spot, so the motion reads as one continuous zoom.
4. **Browse.** The results panel opens with the businesses found. The user can:
   - filter by **category** (Food / Retail / Services / Saved),
   - **sort** by Top Rated, Most Reviewed, or Name,
   - **filter by name** with a text box.
5. **Inspect.** Clicking a card (or a map pin) opens a detail dialog with reviews
   and any community coupons.
6. **Contribute.** From the dialog the user can leave a review (name, 1–5 stars,
   text) or share a coupon — each gated by the CAPTCHA.
7. **Save & export.** The user hearts favorites (persisted locally) and exports a
   formatted **report** of saved businesses with ratings, reviews, deals, and
   summary analytics.
8. **Recover.** If conference internet is down, the app falls back to bundled
   sample data and shows an "Offline sample data" badge, so the journey never
   dead-ends on an empty screen.

## Accessibility Features

- **Semantic, labeled inputs.** Zip and "search another zip" fields carry
  descriptive `aria-label`s; the rating selector and form fields use real form
  controls with visible labels.
- **Accessible dialog.** The business detail view is built on Radix UI's Dialog
  primitive, which provides a focus trap, focus restoration on close, `Escape`
  to dismiss, and correct `role`/`aria-modal` semantics out of the box.
- **Icon-only buttons are labeled.** Controls that show only an icon (save/heart,
  search, export) expose an `aria-label` so screen-reader users know their
  purpose.
- **Live result feedback.** The results count is announced via an `aria-live`
  region so assistive tech hears how many businesses were found after a search.
- **Keyboard support.** The zip field submits on `Enter`; all primary actions are
  standard buttons reachable and activatable by keyboard.
- **Readable contrast & motion.** The dark theme uses high-contrast text colors,
  and the headline motion is tied to user scroll rather than autoplaying
  aggressively.
- **Color is not the only signal.** Saved state, ratings, review counts, deals,
  and offline mode each use a text label or icon in addition to color.

## Intuitiveness

- Category and sort controls use plain words, not jargon.
- The help assistant and voice control provide in-context guidance.
- Empty and error states are explicit ("No businesses found. Try a different
  filter or zip code.") rather than blank.
