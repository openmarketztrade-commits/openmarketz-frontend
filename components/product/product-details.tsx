'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import type { Product } from '@/lib/data'
import { Rating } from '@/components/rating'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listProductReviews } from '@/lib/api'

export function ProductDetails({ product }: { product: Product }) {
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof listProductReviews>>['items']>([])
  const [reviewsError, setReviewsError] = useState('')

  useEffect(() => {
    let active = true
    void listProductReviews(product.id)
      .then((response) => {
        if (active) {
          setReviews(response.items)
          setReviewsError('')
        }
      })
      .catch((error) => {
        if (active) setReviewsError(error instanceof Error ? error.message : 'Reviews could not be loaded.')
      })
    return () => { active = false }
  }, [product.id])

  return (
    <Tabs defaultValue="specs" className="gap-6">
      <TabsList>
        <TabsTrigger value="specs">Specifications</TabsTrigger>
        <TabsTrigger value="reviews">{`Reviews (${product.reviews.toLocaleString()})`}</TabsTrigger>
      </TabsList>

      <TabsContent value="specs">
        <dl className="divide-y overflow-hidden rounded-2xl border">
          {[{ label: 'Brand', value: product.brand }, ...product.specs].map((s) => (
            <div key={s.label} className="grid grid-cols-[minmax(0,160px)_1fr] gap-4 px-5 py-3.5 text-sm">
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="font-medium">{s.value}</dd>
            </div>
          ))}
        </dl>
      </TabsContent>

      <TabsContent value="reviews">
        <div className="grid gap-10 md:grid-cols-[280px_1fr]">
          <div>
            <p className="font-display text-5xl font-semibold">{product.rating.toFixed(1)}</p>
            <Rating value={product.rating} size="md" className="mt-2" />
            <p className="mt-1 text-sm text-muted-foreground">{`Based on ${product.reviews.toLocaleString()} reviews`}</p>
          </div>
          {reviewsError ? (
            <p role="alert" className="text-sm text-destructive">{reviewsError}</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verified reviews yet.</p>
          ) : (
          <ul className="flex flex-col divide-y">
            {reviews.map((r) => (
              <li key={r.id} className="py-5 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <Rating value={r.rating} />
                  <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</span>
                </div>
                {r.body && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>}
                <p className="mt-3 flex items-center gap-1.5 text-xs">
                  <span className="font-medium">{r.reviewer}</span>
                  <span className="flex items-center gap-1 text-primary"><BadgeCheck className="size-3.5" />Verified purchase</span>
                </p>
              </li>
            ))}
          </ul>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
