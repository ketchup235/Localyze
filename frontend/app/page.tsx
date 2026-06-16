"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { GlobeHero } from "@/components/globe/GlobeHero"
import { MapView } from "@/components/map/MapView"
import { VoiceControl } from "@/components/voice/VoiceControl"
import { BusinessCard } from "@/components/business/BusinessCard"
import {
  BusinessDetailDialog,
  type CouponForm,
  type ReviewForm,
} from "@/components/business/BusinessDetailDialog"
import { HelpChat } from "@/components/chat/HelpChat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
  fetchBusinesses,
  fetchCaptcha,
  fetchReviews,
  getErrorMessage,
  submitCoupon,
  submitReview,
  verifyCaptcha,
} from "@/lib/api"
import type { BusinessSource } from "@/lib/api"
import type { Business, LocationPayload, Review } from "@/lib/types"
import { ZIP_LOCATIONS, getFallbackLocation } from "@/lib/locations"
import { printSavedBusinessesReport } from "@/lib/report"
import { useSavedBusinesses } from "@/hooks/useSavedBusinesses"
import { Download, MessageCircle, Search, ChevronDown } from "lucide-react"

const categoryOptions = ["all", "food", "retail", "services", "saved"]

export default function HomePage() {
  const [zipInput, setZipInput] = useState("")
  const [zipError, setZipError] = useState("")
  const [currentZip, setCurrentZip] = useState("")
  const [locationFocus, setLocationFocus] = useState<LocationPayload | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [dataSource, setDataSource] = useState<BusinessSource>("none")
  const { saved, isSaved, toggleSaved } = useSavedBusinesses()
  const [category, setCategory] = useState("all")
  const [searchText, setSearchText] = useState("")
  const [sort, setSort] = useState("default")
  const [loading, setLoading] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [captchaQuestion, setCaptchaQuestion] = useState("")
  const [captchaAnswer, setCaptchaAnswer] = useState("")
  const [reviewForm, setReviewForm] = useState<ReviewForm>({ name: "", rating: 5, text: "" })
  const [couponForm, setCouponForm] = useState<CouponForm>({ code: "", discount: "" })
  const [formError, setFormError] = useState("")
  const [chatOpen, setChatOpen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [heroProgress, setHeroProgress] = useState(0)
  // "globe" = scrollable globe hero, "map" = handed off to the slippy map.
  const [phase, setPhase] = useState<"globe" | "map">("globe")
  const [hasSearched, setHasSearched] = useState(false)
  const [globeUnzoomKey, setGlobeUnzoomKey] = useState(0)
  // ms per radian for the globe's roll. Re-searches use a slower value.
  const [rollMsPerRad, setRollMsPerRad] = useState(500)
  const heroProgressRef = useRef(0)
  const resultsPanelRef = useRef<HTMLDivElement | null>(null)
  const resultsOpenRef = useRef(false)
  const transitionTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    heroProgressRef.current = heroProgress
  }, [heroProgress])

  useEffect(() => {
    resultsOpenRef.current = resultsOpen
  }, [resultsOpen])

  useEffect(() => {
    return () => {
      transitionTimers.current.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    updateViewport()
    window.addEventListener("resize", updateViewport)
    return () => window.removeEventListener("resize", updateViewport)
  }, [])

  useEffect(() => {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const handleWheel = (event: WheelEvent) => {
      const target = event.target as Node | null
      if (
        (heroProgressRef.current >= 1 || resultsOpenRef.current) &&
        resultsPanelRef.current &&
        target &&
        resultsPanelRef.current.contains(target)
      ) {
        return
      }
      event.preventDefault()
      const delta = event.deltaY
      setHeroProgress((prev) => clamp(prev + delta / 1000, 0, 1))
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener("wheel", handleWheel)
    }
  }, [])

  const filteredBusinesses = useMemo(() => {
    const source = category === "saved" ? saved : businesses
    let result = [...source]

    if (category !== "saved" && category !== "all") {
      result = result.filter((b) => (b.category || "").toLowerCase().includes(category))
    }

    if (searchText.trim()) {
      const query = searchText.toLowerCase()
      result = result.filter((b) => b.name.toLowerCase().includes(query))
    }

    if (sort === "rating") {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    } else if (sort === "reviews") {
      result.sort((a, b) => (b.review_count || 0) - (a.review_count || 0))
    } else if (sort === "name") {
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    }

    return result
  }, [businesses, saved, category, searchText, sort])

  // Fired by the globe as its dive nears the surface — crossfade to the map right
  // away (no lingering at max zoom), then open the results panel.
  const handleDiveComplete = () => {
    setPhase("map")
    transitionTimers.current.push(setTimeout(() => setResultsOpen(true), 250))
  }

  const handleSearch = async (zipArg?: string): Promise<Business[] | null> => {
    const cleaned = (zipArg ?? zipInput).trim()
    if (!/^\d{5}$/.test(cleaned) || parseInt(cleaned, 10) < 500) {
      setZipError("Please enter a valid 5-digit US zip code.")
      return null
    }

    setZipInput(cleaned)
    setZipError("")
    setCurrentZip(cleaned)
    setCategory("all")
    setSort("default")
    setSearchText("")
    setHasSearched(true)

    const immediate = ZIP_LOCATIONS[cleaned] || getFallbackLocation(cleaned)
    transitionTimers.current.forEach(clearTimeout)

    if (phase === "map") {
      // Re-search: crossfade to the globe (it's still at the same surface the map
      // was, so they match — no cut), let it pull back out to the wide view, then
      // roll + dive into the new zip. The crossfade BACK to the map is fired by
      // onDiveComplete, so the slower roll is never cut off by a fixed timer.
      setSelectedBusiness(null)
      setResultsOpen(false)
      setRollMsPerRad(280) // even faster re-search roll
      setPhase("globe")
      setGlobeUnzoomKey((k) => k + 1) // globe pulls back out — inverse of the dive
      transitionTimers.current = [
        setTimeout(() => {
          if (immediate) setLocationFocus({ ...immediate }) // then roll + dive to new zip
        }, 1150),
      ]
    } else {
      // First search: globe rolls to the location and dives in; the map is revealed
      // by onDiveComplete as the dive nears the surface.
      setRollMsPerRad(500)
      if (immediate) setLocationFocus({ ...immediate })
      transitionTimers.current = []
    }

    try {
      setLoading(true)
      const result = await fetchBusinesses(cleaned)
      setBusinesses(result.businesses)
      setDataSource(result.source)
      return result.businesses
    } catch {
      setZipError("Unable to load data. Please try again.")
      return null
    } finally {
      setLoading(false)
    }
  }

  // Voice: run the search for a spoken zip, then report the count once the
  // globe → map animation has had time to play.
  const handleVoiceSearch = async (zip: string) => {
    const data = await handleSearch(zip)
    if (!data) return null
    await new Promise((resolve) => setTimeout(resolve, 2600))
    return { count: data.length, zip }
  }

  const openBusiness = async (business: Business) => {
    setSelectedBusiness(business)
    setCaptchaAnswer("")
    setFormError("")
    setReviewForm({ name: "", rating: 5, text: "" })
    setCouponForm({ code: "", discount: "" })

    try {
      const [reviewData, captchaData] = await Promise.all([
        fetchReviews(business.id),
        fetchCaptcha(),
      ])
      setReviews(reviewData)
      setCaptchaQuestion(captchaData.question)
    } catch {
      setReviews([])
      setCaptchaQuestion("Captcha unavailable. Try again.")
    }
  }

  const handleReviewSubmit = async () => {
    if (!selectedBusiness) return
    if (!reviewForm.name.trim() || !reviewForm.text.trim()) {
      setFormError("Please enter your name and a review before submitting.")
      return
    }
    setFormError("")

    try {
      const captcha = await verifyCaptcha(captchaAnswer)
      if (!captcha.success) {
        setFormError("That verification answer was incorrect — here's a new question to try.")
        const newCaptcha = await fetchCaptcha()
        setCaptchaQuestion(newCaptcha.question)
        setCaptchaAnswer("")
        return
      }

      await submitReview({
        businessId: selectedBusiness.id,
        user: reviewForm.name.trim(),
        rating: reviewForm.rating,
        text: reviewForm.text.trim(),
      })
      const refreshed = await fetchReviews(selectedBusiness.id)
      setReviews(refreshed)
      setReviewForm({ name: "", rating: 5, text: "" })
      setFormError("")
      const newCaptcha = await fetchCaptcha()
      setCaptchaQuestion(newCaptcha.question)
      setCaptchaAnswer("")
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  }

  const handleCouponSubmit = async () => {
    if (!selectedBusiness) return
    if (!couponForm.code.trim() || !couponForm.discount.trim()) {
      setFormError("Please enter a coupon code and discount details before submitting.")
      return
    }
    setFormError("")

    try {
      const captcha = await verifyCaptcha(captchaAnswer)
      if (!captcha.success) {
        setFormError("That verification answer was incorrect — here's a new question to try.")
        const newCaptcha = await fetchCaptcha()
        setCaptchaQuestion(newCaptcha.question)
        setCaptchaAnswer("")
        return
      }

      await submitCoupon({
        businessId: selectedBusiness.id,
        code: couponForm.code.trim(),
        discount: couponForm.discount.trim(),
      })
      const refreshed = await fetchBusinesses(currentZip)
      setBusinesses(refreshed.businesses)
      setDataSource(refreshed.source)
      setCouponForm({ code: "", discount: "" })
      setFormError("")
      const newCaptcha = await fetchCaptcha()
      setCaptchaQuestion(newCaptcha.question)
      setCaptchaAnswer("")
    } catch (error) {
      setFormError(getErrorMessage(error))
    }
  }

  const heroTextOpacity = Math.max(0, 1 - heroProgress * 2.8)
  const heroTextTranslate = heroProgress * -36
  const heroBaseOffset = -10
  const globeEase = Math.min(1, heroProgress / 0.9)
  const globeEaseSmooth = globeEase * globeEase * (3 - 2 * globeEase)
  const scrollSpinProgress = Math.min(1, Math.max(0, heroProgress))
  const zipReveal = Math.min(1, Math.max(0, (scrollSpinProgress - 0.98) / 0.02))
  // Hide the on-globe zip box once we've searched (we're zooming into the map).
  const zipOpacity = hasSearched ? 0 : zipReveal
  const zipTranslate = (1 - zipReveal) * 14
  const zipScale = 0.98 + zipReveal * 0.02
  const cinematicDuration = 600
  const cinematicEase = "cubic-bezier(0.65, 0, 0.35, 1)"
  const panelMotion = `transform ${cinematicDuration}ms ${cinematicEase}, opacity ${cinematicDuration}ms ${cinematicEase}`
  const mobilePanelMotion =
    `max-height ${cinematicDuration}ms ${cinematicEase}, opacity ${cinematicDuration}ms ${cinematicEase}, transform ${cinematicDuration}ms ${cinematicEase}`
  const isDesktop = viewport.width >= 768
  const desktopResultsOpen = resultsOpen && isDesktop

  // Globe sizing — unchanged on-load / scroll behaviour. (The render cost is
  // tamed inside GlobeHero by capping the drawing-buffer resolution, not by
  // changing this layout.)
  const heroDiameter = viewport.width ? viewport.width * 1.04 : 1040
  const globeScaleStart = 1.15
  const globeScaleEnd = 0.7
  const globeScaleBase = globeScaleStart - globeEaseSmooth * (globeScaleStart - globeScaleEnd)
  // Once searching, the canvas sits at scale 1 so it always covers the screen —
  // the globe can never be trapped inside a smaller square (the "box" that was
  // clipping it). The camera does the zooming instead, pulling back to `globeWideZ`
  // (computed from the viewport so the whole sphere fits) and diving from there.
  const globeScale = hasSearched ? 1 : globeScaleBase
  const aspect = viewport.width && viewport.height ? viewport.height / viewport.width : 0.5625
  const globeWideZ = Math.max(7, Math.min(18, 2.15 / Math.tan(0.33 * aspect)))
  const globeTranslateY = hasSearched ? 0 : (1 - globeEaseSmooth) * 73
  // No CSS transition on the globe: the search hand-off snaps scale→1 while the
  // camera snaps to the matching wide distance, so the size is unchanged and there
  // is no in-between frame where it could clip.
  const globeMotion = "none"

  // Desktop panel slide-in.
  const panelTranslateX = desktopResultsOpen ? "translateX(0)" : "translateX(-100%)"
  const panelOpacity = desktopResultsOpen ? 1 : 0

  return (
    <div id="top" className="relative h-screen overflow-hidden bg-background text-foreground">
      {/* ── Map layer (revealed after the globe zooms in; pan by drag, no scroll) ── */}
      <div
        className="absolute inset-0 z-0"
        style={{
          opacity: phase === "map" ? 1 : 0,
          transition: "opacity 800ms ease",
          pointerEvents: phase === "map" ? "auto" : "none",
        }}
      >
        <MapView
          focus={locationFocus}
          businesses={filteredBusinesses}
          selectedId={selectedBusiness?.id ?? null}
          panelOpen={resultsOpen}
          onSelectBusiness={openBusiness}
        />
      </div>

      {/* ── Globe hero (fades out as we hand off to the map) ── */}
      <header
        className="relative min-h-screen hero-gradient"
        style={{
          opacity: phase === "map" ? 0 : 1,
          transition: "opacity 800ms ease",
          pointerEvents: phase === "map" ? "none" : "auto",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative"
            style={{
              width: `${heroDiameter}px`,
              height: `${heroDiameter}px`,
              transform: `translateY(${globeTranslateY}vh) scale(${globeScale})`,
              transformOrigin: "center",
              transition: globeMotion,
              willChange: "transform",
            }}
          >
            <GlobeHero
              focus={locationFocus}
              spinMultiplier={0.55}
              // Scroll-spin only applies to the pre-search hero. After searching,
              // zero it so it can't inject a fast burst of rotation between the
              // zoom-out and the roll on a re-search.
              scrollSpinProgress={hasSearched ? 0 : scrollSpinProgress}
              unzoomKey={globeUnzoomKey}
              active={phase !== "map"}
              wideZ={globeWideZ}
              onDiveComplete={handleDiveComplete}
              rollMsPerRad={rollMsPerRad}
            />
            <div
              className="absolute inset-0"
              style={{
                opacity: zipOpacity,
                transform: `translateY(${zipTranslate}px) scale(${zipScale})`,
                pointerEvents: zipOpacity < 0.2 ? "none" : "auto",
                transition: "opacity 400ms ease",
              }}
            >
              <div className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
                <Input
                  value={zipInput}
                  onChange={(event) => setZipInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch()
                  }}
                  placeholder="Enter Zip Code"
                  aria-label="Enter your 5-digit zip code"
                  className="h-16 w-full text-center text-2xl font-semibold sm:h-20 sm:text-3xl"
                />
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-16">
                <Button onClick={() => handleSearch()} size="lg" className="h-14 px-10 text-lg sm:h-16 sm:px-12">
                  <Search className="h-4 w-4" />
                  Search
                </Button>
              </div>
              {zipError && (
                <p className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-20 text-center text-sm text-rose-400">
                  {zipError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 flex h-full flex-col items-center justify-start px-6 pt-8 text-center pointer-events-none">
          <div className="absolute right-6 top-3 pointer-events-auto">
            <Button variant="ghost" size="sm" onClick={() => setChatOpen(true)}>
              <MessageCircle className="h-4 w-4" />
              Help
            </Button>
          </div>
          <div className="relative w-full max-w-4xl">
            <div
              className="space-y-6"
              style={{
                opacity: heroTextOpacity,
                transform: `translateY(${heroTextTranslate + heroBaseOffset}px)`,
              }}
            >
              <h1 className="text-6xl font-semibold tracking-tight text-emerald-400 sm:text-7xl lg:text-8xl">
                Localyze
              </h1>
              <p className="text-2xl text-slate-200 sm:text-3xl">Find the businesses near you.</p>
              <p className="text-lg text-slate-300 sm:text-xl">
                Enter a zip code to explore local shops, restaurants, and services.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Desktop results panel ── */}
      <div
        className="absolute left-0 top-0 z-20 hidden h-full w-[44vw] md:flex"
        style={{
          transform: panelTranslateX,
          opacity: panelOpacity,
          transition: panelMotion,
          pointerEvents: desktopResultsOpen ? "auto" : "none",
        }}
      >
        <div className="flex h-full w-full flex-col border-r border-white/10 bg-slate-950/85 shadow-2xl backdrop-blur-xl">
          {/* Panel header */}
          <div className="flex items-start justify-between gap-4 px-8 pt-7 pb-1">
            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Results</p>
              <p className="text-xl font-semibold text-white">
                {currentZip ? `Businesses near ${currentZip}` : "Businesses near you"}
              </p>
              <p className="text-xs text-slate-400 pt-0.5" aria-live="polite">
                {loading ? "Searching…" : `${filteredBusinesses.length} businesses found`}
              </p>
              {dataSource === "seed" && !loading && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  Offline sample data
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setResultsOpen(false)} className="mt-1 shrink-0">
              Close
            </Button>
          </div>

          {/* Search another zip */}
          <div className="mt-4 px-8">
            <div className="flex gap-2">
              <Input
                value={zipInput}
                onChange={(event) => setZipInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch()
                }}
                placeholder="Search another zip code…"
                aria-label="Search another zip code"
                className="h-10"
              />
              <Button onClick={() => handleSearch()} size="sm" className="h-10 px-4 shrink-0">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {zipError && <p className="mt-1 text-xs text-rose-400">{zipError}</p>}
          </div>

          {/* Category pills */}
          <div className="mt-5 flex flex-wrap gap-2 px-8">
            {categoryOptions.map((item) => (
              <Button
                key={item}
                variant={category === item ? "default" : "outline"}
                size="sm"
                onClick={() => setCategory(item)}
                className="capitalize"
              >
                {item}
              </Button>
            ))}
          </div>

          {/* Filter controls */}
          <div className="mt-4 flex flex-col gap-3 px-8">
            <Input
              placeholder="Filter by name…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="w-full"
            />
            <div className="flex gap-8">
              <div className="relative flex-1">
                <select
                  className="appearance-none w-full h-11 rounded-xl border border-white/15 bg-slate-950/60 pl-4 pr-10 text-sm text-foreground"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="default">Sort: Default</option>
                  <option value="rating">Top Rated</option>
                  <option value="reviews">Most Reviewed</option>
                  <option value="name">Name (A–Z)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => printSavedBusinessesReport(saved, sort, currentZip)}
                className="shrink-0"
              >
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-8 mt-5 border-t border-white/8" />

          {/* Business cards list */}
          <div ref={resultsPanelRef} className="mt-4 flex-1 overflow-y-auto px-8 pb-10">
            <div className="flex flex-col gap-5">
              {loading && (
                <Card className="text-center py-8">
                  <p className="text-sm text-slate-400">Searching for local businesses…</p>
                </Card>
              )}
              {!loading && filteredBusinesses.length === 0 && (
                <Card className="text-center py-8">
                  <p className="text-sm text-slate-400">
                    No businesses found. Try a different filter or zip code.
                  </p>
                </Card>
              )}
              {!loading &&
                filteredBusinesses.map((business) => (
                  <BusinessCard
                    key={business.id}
                    business={business}
                    isSaved={isSaved(business.id)}
                    currentZip={currentZip}
                    onToggleSave={toggleSaved}
                    onOpen={openBusiness}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile results panel ── */}
      <main className="md:hidden">
        <div
          className="absolute bottom-0 left-0 right-0 z-20 overflow-hidden"
          style={{
            maxHeight: resultsOpen ? "72vh" : "0",
            opacity: resultsOpen ? 1 : 0,
            transform: resultsOpen ? "translateY(0)" : "translateY(16px)",
            transition: mobilePanelMotion,
            pointerEvents: resultsOpen ? "auto" : "none",
          }}
        >
          <div className="mx-4 mb-4 mt-4 rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Results</p>
                <p className="text-base font-semibold text-white">
                  {currentZip ? `Businesses near ${currentZip}` : "Businesses near you"}
                </p>
                <p className="text-xs text-slate-400">
                  {loading ? "Searching…" : `${filteredBusinesses.length} businesses`}
                </p>
                {dataSource === "seed" && !loading && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    Offline sample data
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setResultsOpen(false)}>
                Close
              </Button>
            </div>

            {/* Search another zip */}
            <div className="mt-3 flex gap-2">
              <Input
                value={zipInput}
                onChange={(event) => setZipInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch()
                }}
                placeholder="Search another zip code…"
                aria-label="Search another zip code"
                className="h-10"
              />
              <Button onClick={() => handleSearch()} size="sm" className="h-10 px-4 shrink-0">
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {categoryOptions.map((item) => (
                <Button
                  key={item}
                  variant={category === item ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory(item)}
                  className="capitalize shrink-0"
                >
                  {item}
                </Button>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <Input
                placeholder="Filter by name…"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <select
                    className="appearance-none w-full h-11 rounded-xl border border-white/15 bg-slate-950/60 pl-4 pr-10 text-sm text-foreground"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="default">Sort: Default</option>
                    <option value="rating">Top Rated</option>
                    <option value="reviews">Most Reviewed</option>
                    <option value="name">Name (A–Z)</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printSavedBusinessesReport(saved, sort, currentZip)}
                  className="shrink-0"
                >
                  <Download className="h-4 w-4" />
                  PDF
                </Button>
              </div>
            </div>

            <div className="mt-5">
              {loading && (
                <Card className="text-center py-6">
                  <p className="text-sm text-slate-400">Searching for local businesses…</p>
                </Card>
              )}
              {!loading && filteredBusinesses.length === 0 && (
                <Card className="text-center py-6">
                  <p className="text-sm text-slate-400">
                    No businesses found. Try a different zip code.
                  </p>
                </Card>
              )}
              {!loading && filteredBusinesses.length > 0 && (
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 no-scrollbar">
                  {filteredBusinesses.map((business) => (
                    <BusinessCard
                      key={business.id}
                      business={business}
                      isSaved={isSaved(business.id)}
                      currentZip={currentZip}
                      onToggleSave={toggleSaved}
                      onOpen={openBusiness}
                      className="w-[82vw] shrink-0 snap-center"
                      showDeals={false}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Business detail dialog ── */}
      <BusinessDetailDialog
        business={selectedBusiness}
        reviews={reviews}
        reviewForm={reviewForm}
        couponForm={couponForm}
        captchaQuestion={captchaQuestion}
        captchaAnswer={captchaAnswer}
        formError={formError}
        onReviewFormChange={setReviewForm}
        onCouponFormChange={setCouponForm}
        onCaptchaAnswerChange={setCaptchaAnswer}
        onReviewSubmit={handleReviewSubmit}
        onCouponSubmit={handleCouponSubmit}
        onClose={() => setSelectedBusiness(null)}
      />

      {/* ── Chat widget ── */}
      <HelpChat open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* ── Voice assistant (bottom-left) ── */}
      <VoiceControl
        onSearchZip={handleVoiceSearch}
        onSetCategory={setCategory}
        onSetSort={setSort}
      />
    </div>
  )
}
