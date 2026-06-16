import { Heart, MapPin, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import type { Business } from "@/lib/types"

interface BusinessCardProps {
  business: Business
  isSaved: boolean
  currentZip: string
  onToggleSave: (business: Business) => void
  onOpen: (business: Business) => void
  // Width/layout overrides for the desktop list vs. the mobile carousel.
  className?: string
  showDeals?: boolean
}

export function BusinessCard({
  business,
  isSaved,
  currentZip,
  onToggleSave,
  onOpen,
  className,
  showDeals = true,
}: BusinessCardProps) {
  const reviewCount = business.review_count || 0
  return (
    <Card className={`flex flex-row gap-4 p-4 ${className ?? ""}`}>
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
            {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
          </Badge>
          {showDeals && business.deals && business.deals.length > 0 && (
            <Badge className="bg-amber-400/15 text-amber-300">
              {business.deals.length} deal{business.deals.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleSave(business)}
          aria-label={isSaved ? `Remove ${business.name} from saved` : `Save ${business.name}`}
          aria-pressed={isSaved}
          className="h-8 w-8 p-0"
        >
          <Heart
            className={`h-4 w-4 ${isSaved ? "fill-emerald-400 text-emerald-400" : "text-slate-400"}`}
          />
        </Button>
        <Button size="sm" onClick={() => onOpen(business)} className="h-8 px-3 text-xs">
          View Details
        </Button>
      </div>
    </Card>
  )
}
