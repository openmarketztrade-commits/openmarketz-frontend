'use client'

import Image from 'next/image'
import { BadgeCheck, Calendar, MapPin, Star } from 'lucide-react'
import type { PublicStoreApi } from '@/lib/api'
import { StoreFollowButton } from '@/components/store/store-follow-button'

export function StoreHeader({ store }: { store: PublicStoreApi }) {
  const joined = new Date(store.createdAt)
  const joinedLabel = Number.isNaN(joined.getTime())
    ? '—'
    : joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
      <div className="relative h-44 overflow-hidden rounded-3xl bg-muted md:h-64">
        {store.bannerUrl && <Image src={store.bannerUrl} alt="" fill priority sizes="100vw" className="object-cover" />}
        <span className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
      </div>

      <div className="flex flex-col gap-6 px-2 md:flex-row md:items-end md:justify-between md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="-mt-12 flex size-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-background bg-primary font-display text-2xl font-semibold text-primary-foreground shadow-lg md:size-28">
            {store.logoUrl ? <Image src={store.logoUrl} alt={`${store.name} logo`} width={112} height={112} className="size-full object-cover" /> : store.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="md:pb-1">
            <h1 className="flex items-center gap-2 font-display text-3xl font-semibold tracking-tight">
              {store.name}
              {store.verified && <BadgeCheck className="size-6 text-primary" aria-label="Verified seller" />}
            </h1>
            {store.tagline && <p className="mt-1 text-muted-foreground">{store.tagline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 text-foreground">
                <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                <span className="font-medium">{store.rating.toFixed(1)}</span>
                <span className="text-muted-foreground">{`(${store.reviewCount.toLocaleString()} reviews)`}</span>
              </span>
              {store.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{store.location}</span>}
              <span className="flex items-center gap-1"><Calendar className="size-3.5" aria-hidden="true" />{`Joined ${joinedLabel}`}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <StoreFollowButton slug={store.slug} initialCount={store.followerCount ?? 0} />
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-2">
        {[
          ['Products', store.productCount.toLocaleString()],
          ['Seller status', store.verified ? 'Verified' : 'Not verified'],
        ].map(([label, value]) => (
          <div key={label} className="bg-background px-5 py-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-display text-xl font-semibold capitalize">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
