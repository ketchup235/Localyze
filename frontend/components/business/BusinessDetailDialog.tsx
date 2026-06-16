import { Star, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Business, Review } from "@/lib/types"

export interface ReviewForm {
  name: string
  rating: number
  text: string
}

export interface CouponForm {
  code: string
  discount: string
}

interface BusinessDetailDialogProps {
  business: Business | null
  reviews: Review[]
  reviewForm: ReviewForm
  couponForm: CouponForm
  captchaQuestion: string
  captchaAnswer: string
  onReviewFormChange: (form: ReviewForm) => void
  onCouponFormChange: (form: CouponForm) => void
  onCaptchaAnswerChange: (value: string) => void
  onReviewSubmit: () => void
  onCouponSubmit: () => void
  onClose: () => void
}

export function BusinessDetailDialog({
  business,
  reviews,
  reviewForm,
  couponForm,
  captchaQuestion,
  captchaAnswer,
  onReviewFormChange,
  onCouponFormChange,
  onCaptchaAnswerChange,
  onReviewSubmit,
  onCouponSubmit,
  onClose,
}: BusinessDetailDialogProps) {
  return (
    <Dialog
      open={!!business}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-3xl">
        {business && (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle>{business.name}</DialogTitle>
              <DialogDescription>{business.address}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <Badge>{business.category || "local"}</Badge>
              <Badge className="bg-emerald-400/20 text-emerald-300">
                <Star className="mr-1 h-3 w-3" />
                {business.rating?.toFixed(1) || "4.0"}
              </Badge>
              <Badge className="bg-sky-400/20 text-sky-200">
                {business.review_count || 0} reviews
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
                  onChange={(event) => onReviewFormChange({ ...reviewForm, name: event.target.value })}
                />
                <div className="relative">
                  <select
                    className="appearance-none h-11 w-full rounded-xl border border-white/15 bg-slate-950/60 pl-4 pr-10 text-sm text-foreground"
                    value={reviewForm.rating}
                    onChange={(event) =>
                      onReviewFormChange({ ...reviewForm, rating: Number(event.target.value) })
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
                  onChange={(event) => onReviewFormChange({ ...reviewForm, text: event.target.value })}
                />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Share a Coupon</h3>
                <Input
                  placeholder="Coupon code"
                  value={couponForm.code}
                  onChange={(event) => onCouponFormChange({ ...couponForm, code: event.target.value })}
                />
                <Input
                  placeholder="Discount details"
                  value={couponForm.discount}
                  onChange={(event) =>
                    onCouponFormChange({ ...couponForm, discount: event.target.value })
                  }
                />
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                  {captchaQuestion || "Loading captcha..."}
                  <Input
                    placeholder="Answer"
                    aria-label="Answer the verification question"
                    value={captchaAnswer}
                    onChange={(event) => onCaptchaAnswerChange(event.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onReviewSubmit}>Submit Review</Button>
              <Button variant="outline" onClick={onCouponSubmit}>
                Submit Coupon
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
