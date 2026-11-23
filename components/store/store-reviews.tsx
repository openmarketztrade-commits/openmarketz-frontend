'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { listStoreReviews } from '@/lib/api'

type StoreReview = Awaited<ReturnType<typeof listStoreReviews>>['items'][number]

export function StoreReviews({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<StoreReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listStoreReviews(slug).then(({ items }) => {
      if (active) setReviews(items)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Reviews could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [slug])

  if (loading) return <p className="py-8 text-sm text-muted-foreground">Loading store reviews…</p>
  if (error) return <p role="alert" className="py-8 text-sm text-destructive">{error}</p>
  if (!reviews.length) return <p className="py-8 text-sm text-muted-foreground">No customer reviews yet. Reviews from delivered orders will appear here.</p>

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{review.reviewer}</p>
            <span className="flex items-center gap-1 text-sm font-medium"><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />{review.rating}/5</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Purchased: {review.productName}</p>
          {review.body && <p className="mt-3 text-sm leading-relaxed">{review.body}</p>}
        </li>
      ))}
    </ul>
  )
}
