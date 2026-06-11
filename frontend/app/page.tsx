"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { GlobeHero } from "@/components/globe/GlobeHero"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  fetchBusinesses,
  fetchCaptcha,
  fetchHelp,
  fetchLocation,
  fetchReviews,
  submitCoupon,
  submitReview,
  verifyCaptcha,
} from "@/lib/api"
import type { Business, LocationPayload, Review } from "@/lib/types"
import { Download, Heart, MapPin, MessageCircle, Search, Star, ChevronDown } from "lucide-react"

const categoryOptions = ["all", "food", "retail", "services", "saved"]

export default function HomePage() {
  const [zipInput, setZipInput] = useState("")
  const [zipError, setZipError] = useState("")
  const [currentZip, setCurrentZip] = useState("")
  const [locationFocus, setLocationFocus] = useState<LocationPayload | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [saved, setSaved] = useState<Business[]>([])
  const [category, setCategory] = useState("all")
  const [searchText, setSearchText] = useState("")
  const [sort, setSort] = useState("default")
  const [loading, setLoading] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [captchaQuestion, setCaptchaQuestion] = useState("")
  const [captchaAnswer, setCaptchaAnswer] = useState("")
  const [reviewForm, setReviewForm] = useState({ name: "", rating: 5, text: "" })
  const [couponForm, setCouponForm] = useState({ code: "", discount: "" })
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    {
      role: "assistant",
      text: "Hi! Ask me anything about Localyze: zip search, filters, saving, reviews, or coupons.",
    },
  ])
  const [resultsOpen, setResultsOpen] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [heroProgress, setHeroProgress] = useState(0)
  const heroProgressRef = useRef(0)
  const resultsPanelRef = useRef<HTMLDivElement | null>(null)
  const resultsOpenRef = useRef(false)

  useEffect(() => {
    const savedRaw = window.localStorage.getItem("localyze_saved")
    if (savedRaw) {
      try {
        setSaved(JSON.parse(savedRaw))
      } catch {
        setSaved([])
      }
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem("localyze_saved", JSON.stringify(saved))
  }, [saved])

  useEffect(() => {
    heroProgressRef.current = heroProgress
  }, [heroProgress])

  useEffect(() => {
    resultsOpenRef.current = resultsOpen
  }, [resultsOpen])

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

  const getFallbackLocation = (zip: string): LocationPayload | null => {
    const overrides: Record<string, LocationPayload> = {
      "10001": { zip, lat: 40.7506, lon: -73.9972, label: "New York City" },
      "19335": { zip, lat: 40.0, lon: -75.7, label: "Pennsylvania" },
      "90210": { zip, lat: 34.0901, lon: -118.4065, label: "Southern California" },
    }
    if (overrides[zip]) return overrides[zip]

    const zipNumber = Number.parseInt(zip, 10)
    if (!Number.isFinite(zipNumber)) return null

    const regions = [
      { min: 0, max: 19999, lat: 40.7, lon: -74.0, label: "Northeast" },
      { min: 20000, max: 39999, lat: 35.4, lon: -82.2, label: "Southeast" },
      { min: 40000, max: 59999, lat: 41.6, lon: -87.6, label: "Midwest" },
      { min: 60000, max: 79999, lat: 38.7, lon: -97.0, label: "South Central" },
      { min: 80000, max: 89999, lat: 39.6, lon: -111.9, label: "Mountain West" },
      { min: 90000, max: 96999, lat: 34.1, lon: -118.2, label: "California" },
      { min: 97000, max: 99999, lat: 47.2, lon: -122.3, label: "Pacific Northwest" },
    ]

    const region = regions.find((entry) => zipNumber >= entry.min && zipNumber <= entry.max)
    if (!region) return null

    return { zip, lat: region.lat, lon: region.lon, label: region.label }
  }

  const handleSearch = async () => {
    const cleaned = zipInput.trim()
    if (!/^\d{5}$/.test(cleaned) || parseInt(cleaned, 10) < 500) {
      setZipError("Please enter a valid 5-digit US zip code.")
      return
    }

    setZipError("")
    setCurrentZip(cleaned)
    setCategory("all")
    setSort("default")
    setSearchText("")

    try {
      setLoading(true)
      const businessesPromise = fetchBusinesses(cleaned)
      const locationPromise = fetchLocation(cleaned).catch(() => null)
      const [data, location] = await Promise.all([businessesPromise, locationPromise])
      setBusinesses(data)
      const focusLocation = location || getFallbackLocation(cleaned)
      setLocationFocus(focusLocation)
      setResultsOpen(true)
    } catch {
      setZipError("Unable to load data. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const toggleSaved = (business: Business) => {
    const exists = saved.some((b) => b.id === business.id)
    if (exists) {
      setSaved(saved.filter((b) => b.id !== business.id))
    } else {
      setSaved([...saved, business])
    }
  }

  const openBusiness = async (business: Business) => {
    setSelectedBusiness(business)
    setCaptchaAnswer("")
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
    if (!reviewForm.name.trim() || !reviewForm.text.trim()) return

    try {
      const captcha = await verifyCaptcha(captchaAnswer)
      if (!captcha.success) {
        setCaptchaQuestion("Captcha incorrect. Try another.")
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
      const newCaptcha = await fetchCaptcha()
      setCaptchaQuestion(newCaptcha.question)
      setCaptchaAnswer("")
    } catch {
      setCaptchaQuestion("Unable to submit review. Try again.")
    }
  }

  const handleCouponSubmit = async () => {
    if (!selectedBusiness) return
    if (!couponForm.code.trim() || !couponForm.discount.trim()) return

    try {
      const captcha = await verifyCaptcha(captchaAnswer)
      if (!captcha.success) {
        setCaptchaQuestion("Captcha incorrect. Try another.")
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
      setBusinesses(refreshed)
      setCouponForm({ code: "", discount: "" })
      const newCaptcha = await fetchCaptcha()
      setCaptchaQuestion(newCaptcha.question)
      setCaptchaAnswer("")
    } catch {
      setCaptchaQuestion("Unable to submit coupon. Try again.")
    }
  }

  const handleExport = () => {
    if (!saved.length) return
    const content = `
      <html>
        <head><title>Localyze Saved Businesses</title></head>
        <body style="font-family: Inter, sans-serif; padding: 24px;">
          <h1>Saved Businesses</h1>
          ${saved
            .map(
              (b) => `
              <div style="margin-bottom: 16px;">
                <strong>${b.name}</strong><br/>
                ${b.category || ""} | ${b.address || ""}
              </div>
            `,
            )
            .join("")}
        </body>
      </html>
    `
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(content)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleSendChat = async () => {
    if (!chatInput.trim()) return
    const message = chatInput.trim()
    setChatInput("")
    setChatMessages((prev) => [...prev, { role: "user", text: message }])
    try {
      const response = await fetchHelp(message)
      setChatMessages((prev) => [...prev, { role: "assistant", text: response.reply }])
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, I could not connect. Please try again." },
      ])
    }
  }

  const heroTextOpacity = Math.max(0, 1 - heroProgress * 2.8)
  const heroTextTranslate = heroProgress * -36
  const heroBaseOffset = -10
  const heroEase = heroProgress * heroProgress * (3 - 2 * heroProgress)
  const globeEase = Math.min(1, heroProgress / 0.9)
  const globeEaseSmooth = globeEase * globeEase * (3 - 2 * globeEase)
  const scrollSpinProgress = Math.min(1, Math.max(0, heroProgress))
  const zipOpacity = Math.min(1, Math.max(0, (scrollSpinProgress - 0.98) / 0.02))
  const zipTranslate = (1 - zipOpacity) * 14
  const zipScale = 0.98 + zipOpacity * 0.02
  const cinematicDuration = 600
  const cinematicEase = "cubic-bezier(0.65, 0, 0.35, 1)"
  const panelMotion = `transform ${cinematicDuration}ms ${cinematicEase}, opacity ${cinematicDuration}ms ${cinematicEase}`
  const mobilePanelMotion =
    `max-height ${cinematicDuration}ms ${cinematicEase}, opacity ${cinematicDuration}ms ${cinematicEase}, transform ${cinematicDuration}ms ${cinematicEase}`
  const isDesktop = viewport.width >= 768
  const desktopResultsOpen = resultsOpen && isDesktop
  const shouldAnimateGlobe = isDesktop && (resultsOpen || resultsOpenRef.current)

  // ── Panel is now 44vw (was 38vw) so cards have room to breathe ──
  const panelWidthVw = 44
  const panelShiftX = desktopResultsOpen ? 22 : 0
  const panelTranslateX = desktopResultsOpen ? "translateX(0)" : "translateX(-100%)"
  const panelOpacity = desktopResultsOpen ? 1 : 0
  const rightPanelPadding = 40
  const heroDiameter = viewport.width ? viewport.width * 1.04 : 1040
  const rightPanelWidth = viewport.width * (1 - panelWidthVw / 100)
  const panelDiameter =
    viewport.width && viewport.height
      ? Math.max(0, Math.min(rightPanelWidth, viewport.height) - rightPanelPadding * 2)
      : heroDiameter
  const globeDiameter = desktopResultsOpen ? panelDiameter : heroDiameter
  const globeScaleStart = 1.15
  const globeScaleEnd = 0.56
  const globeScaleBase = globeScaleStart - globeEaseSmooth * (globeScaleStart - globeScaleEnd)
  const globeScale = desktopResultsOpen ? 1 : globeScaleBase
  const globeTranslateY = desktopResultsOpen ? 0 : (1 - globeEaseSmooth) * 73
  const globeMotion = shouldAnimateGlobe
    ? `transform ${cinematicDuration}ms ${cinematicEase}, width ${cinematicDuration}ms ${cinematicEase}, height ${cinematicDuration}ms ${cinematicEase}`
    : "none"
  const spinMultiplier = 0.55

  return (
    <div id="top" className="relative h-screen overflow-hidden bg-background text-foreground">
      <header className="relative min-h-screen hero-gradient">
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative"
            style={{
              transform: `translateX(${panelShiftX}vw)`,
              transition: panelMotion,
              transformOrigin: "center",
              willChange: "transform",
            }}
          >
            <div
              className="relative"
              style={{
                width: `${globeDiameter}px`,
                height: `${globeDiameter}px`,
                transform: `translateY(${globeTranslateY}vh) scale(${globeScale})`,
                transformOrigin: "center",
                transition: globeMotion,
                willChange: "transform",
              }}
            >
              <GlobeHero
                focus={locationFocus}
                spinMultiplier={spinMultiplier}
                scrollSpinProgress={scrollSpinProgress}
              />
              <div
                className="absolute inset-0"
                style={{
                  opacity: zipOpacity,
                  transform: `translateY(${zipTranslate}px) scale(${zipScale})`,
                  pointerEvents: zipOpacity < 0.2 ? "none" : "auto",
                }}
              >
                <div className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
                  <Input
                    value={zipInput}
                    onChange={(event) => setZipInput(event.target.value)}
                    placeholder="Enter Zip Code"
                    aria-label="Enter your 5-digit zip code"
                    className="h-16 w-full text-center text-2xl font-semibold sm:h-20 sm:text-3xl"
                  />
                </div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-16">
                  <Button onClick={handleSearch} size="lg" className="h-14 px-10 text-lg sm:h-16 sm:px-12">
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
        </div>

        {/* ── Desktop results panel ── */}
        <div
          className="absolute left-0 top-0 z-20 hidden h-full md:flex"
          style={{
            width: `${panelWidthVw}vw`,
            transform: panelTranslateX,
            opacity: panelOpacity,
            transition: panelMotion,
            pointerEvents: desktopResultsOpen ? "auto" : "none",
          }}
        >
          <div className="flex h-full w-full flex-col border-r border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-xl">

            {/* Panel header */}
            <div className="flex items-start justify-between gap-4 px-8 pt-7 pb-1">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Results</p>
                <p className="text-xl font-semibold text-white">
                  {currentZip ? `Businesses near ${currentZip}` : "Businesses near you"}
                </p>
                <p className="text-xs text-slate-400 pt-0.5">
                  {loading ? "Searching…" : `${filteredBusinesses.length} businesses found`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setResultsOpen(false)} className="mt-1 shrink-0">
                Close
              </Button>
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

            {/* Filter controls — stacked for clarity */}
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
                  onClick={handleExport}
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
                  filteredBusinesses.map((business) => {
                    const isSaved = saved.some((item) => item.id === business.id)
                    return (
                      <Card key={business.id} className="flex flex-row gap-4 p-4">
                        {/* Left: name, address, badges */}
                        <div className="flex min-w-0 flex-1 flex-col gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-sm leading-snug">{business.name}</CardTitle>
                            <CardDescription className="mt-0.5 flex items-center gap-1 text-xs">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {business.address || currentZip}
                            </CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge>{business.category || "local"}</Badge>
                            <Badge className="bg-emerald-400/15 text-emerald-300">
                              <Star className="mr-1 h-3 w-3" />
                              {business.rating?.toFixed(1) || "4.0"}
                            </Badge>
                            <Badge className="bg-sky-400/15 text-sky-300">
                              {business.review_count || 0}{" "}
                              {business.review_count === 1 ? "review" : "reviews"}
                            </Badge>
                            {business.deals && business.deals.length > 0 && (
                              <Badge className="bg-amber-400/15 text-amber-300">
                                {business.deals.length} deal{business.deals.length > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Right: heart + View Details stacked */}
                        <div className="flex shrink-0 flex-col items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSaved(business)}
                            className="h-8 w-8 p-0"
                          >
                            <Heart
                              className={`h-4 w-4 ${isSaved ? "fill-emerald-400 text-emerald-400" : "text-slate-400"}`}
                            />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openBusiness(business)}
                            className="h-8 px-3 text-xs"
                          >
                            View Details
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
              </div>
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
              <p className="text-2xl text-slate-200 sm:text-3xl">
                Find the businesses near you.
              </p>
              <p className="text-lg text-slate-300 sm:text-xl">
                Enter a zip code to explore local shops, restaurants, and services.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile results panel ── */}
      <main className="md:hidden">
        <div
          className="overflow-hidden"
          style={{
            maxHeight: resultsOpen ? "80vh" : "0",
            opacity: resultsOpen ? 1 : 0,
            transform: resultsOpen ? "translateY(0)" : "translateY(16px)",
            transition: mobilePanelMotion,
            pointerEvents: resultsOpen ? "auto" : "none",
          }}
        >
          <div className="mx-4 mb-10 mt-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Results</p>
                <p className="text-base font-semibold text-white">
                  {currentZip ? `Businesses near ${currentZip}` : "Businesses near you"}
                </p>
                <p className="text-xs text-slate-400">
                  {loading ? "Searching…" : `${filteredBusinesses.length} businesses`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setResultsOpen(false)}>
                Close
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
                <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0">
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
                  {filteredBusinesses.map((business) => {
                    const isSaved = saved.some((item) => item.id === business.id)
                    return (
                      <Card
                        key={business.id}
                        className="flex w-[82vw] shrink-0 snap-center flex-row gap-4 p-4"
                      >
                        {/* Left: name, address, badges */}
                        <div className="flex min-w-0 flex-1 flex-col gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-sm leading-snug">{business.name}</CardTitle>
                            <CardDescription className="mt-0.5 flex items-center gap-1 text-xs">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {business.address || currentZip}
                            </CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge>{business.category || "local"}</Badge>
                            <Badge className="bg-emerald-400/15 text-emerald-300">
                              <Star className="mr-1 h-3 w-3" />
                              {business.rating?.toFixed(1) || "4.0"}
                            </Badge>
                            <Badge className="bg-sky-400/15 text-sky-300">
                              {business.review_count || 0} reviews
                            </Badge>
                          </div>
                        </div>

                        {/* Right: heart + View Details stacked */}
                        <div className="flex shrink-0 flex-col items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSaved(business)}
                            className="h-8 w-8 p-0"
                          >
                            <Heart
                              className={`h-4 w-4 ${isSaved ? "fill-emerald-400 text-emerald-400" : "text-slate-400"}`}
                            />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openBusiness(business)}
                            className="h-8 px-3 text-xs"
                          >
                            View Details
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Business detail dialog ── */}
      <Dialog
        open={!!selectedBusiness}
        onOpenChange={(open) => {
          if (!open) setSelectedBusiness(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          {selectedBusiness && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle>{selectedBusiness.name}</DialogTitle>
                <DialogDescription>{selectedBusiness.address}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <Badge>{selectedBusiness.category || "local"}</Badge>
                <Badge className="bg-emerald-400/20 text-emerald-300">
                  <Star className="mr-1 h-3 w-3" />
                  {selectedBusiness.rating?.toFixed(1) || "4.0"}
                </Badge>
                <Badge className="bg-sky-400/20 text-sky-200">
                  {selectedBusiness.review_count || 0} reviews
                </Badge>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-200">Recent Reviews</h3>
                {reviews.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No reviews yet. Be the first to share your experience.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {reviews.map((review, index) => (
                      <Card key={`${review.user}-${index}`} className="space-y-2">
                        <CardTitle className="text-base">{review.user}</CardTitle>
                        <CardDescription className="text-sm">
                          {review.rating.toFixed(1)} / 5
                        </CardDescription>
                        <p className="text-sm text-slate-200">{review.text}</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200">Leave a Review</h3>
                  <Input
                    placeholder="Your name"
                    value={reviewForm.name}
                    onChange={(event) =>
                      setReviewForm({ ...reviewForm, name: event.target.value })
                    }
                  />
                  <div className="relative">
                    <select
                      className="appearance-none h-11 w-full rounded-xl border border-white/15 bg-slate-950/60 pl-4 pr-10 text-sm text-foreground"
                      value={reviewForm.rating}
                      onChange={(event) =>
                        setReviewForm({
                          ...reviewForm,
                          rating: Number(event.target.value),
                        })
                      }
                    >
                      {[5, 4, 3, 2, 1].map((value) => (
                        <option key={value} value={value}>
                          {value} stars
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                  </div>
                  <Textarea
                    placeholder="Share your experience"
                    value={reviewForm.text}
                    onChange={(event) =>
                      setReviewForm({ ...reviewForm, text: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200">Share a Coupon</h3>
                  <Input
                    placeholder="Coupon code"
                    value={couponForm.code}
                    onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value })}
                  />
                  <Input
                    placeholder="Discount details"
                    value={couponForm.discount}
                    onChange={(event) =>
                      setCouponForm({ ...couponForm, discount: event.target.value })
                    }
                  />
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                    {captchaQuestion || "Loading captcha..."}
                    <Input
                      placeholder="Answer"
                      value={captchaAnswer}
                      onChange={(event) => setCaptchaAnswer(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleReviewSubmit}>Submit Review</Button>
                <Button variant="outline" onClick={handleCouponSubmit}>
                  Submit Coupon
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Chat widget ── */}
      <div
        className={`fixed right-6 top-20 z-[10050] w-[min(420px,90vw)] transition duration-300 ${
          chatOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0 pointer-events-none"
        }`}
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Localyze Assistant</p>
              <p className="text-xs text-slate-400">Intelligent help, powered by your data.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setChatOpen(false)}
            >
              Close
            </Button>
          </div>
          <div className="space-y-4 p-4">
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3">
              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "ml-auto bg-emerald-400 text-slate-950"
                      : "bg-slate-900 text-slate-200"
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ask a question..."
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
              />
              <Button onClick={handleSendChat}>Send</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-[10002] h-0 font-[Arial]">
        <div className="absolute bottom-2 right-2">
          <a className="px-2 text-[10px] no-underline" href="#">
            Terms
          </a>
          <a className="px-2 text-[10px] no-underline" href="#">
            Privacy
          </a>
        </div>
      </div>
    </div>
  )
}