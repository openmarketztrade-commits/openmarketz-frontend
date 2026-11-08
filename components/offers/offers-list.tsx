'use client'

import Image from 'next/image'
import Link from 'next/link'
import { HandCoins, Mic } from 'lucide-react'
import { useShop, type OfferStatus } from '@/components/shop-provider'
import { formatPrice, getSeller } from '@/lib/data'
import { cn } from '@/lib/utils'
import { useCatalogProducts } from '@/components/catalog-provider'

const statusStyles: Record<OfferStatus, string> = {
  pending: 'bg-accent text-accent-foreground',
  accepted: 'bg-primary/10 text-primary',
  declined: 'bg-deal/10 text-deal',
  countered: 'bg-sky-100 text-sky-800',
}

export function OffersList() {
  const { offers, respondToOffer } = useShop()
  const { products } = useCatalogProducts()
  const buyerOffers = offers.filter((offer) => offer.role !== 'seller')

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">My offers</h1>
      <p className="mt-1 text-muted-foreground">Bargain requests you have sent to sellers. Accepted prices apply automatically at checkout.</p>

      {buyerOffers.length === 0 ? (
        <div className="mt-12 flex flex-col items-center rounded-3xl border border-dashed py-16 text-center">
          <HandCoins className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 font-medium">No offers yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Look for the Bargain button on negotiable products to propose your price.</p>
          <Link href="/products" className="mt-4 text-sm font-medium text-primary hover:underline">Browse products</Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {buyerOffers.map((offer) => {
            const product = products.find((p) => p.id === offer.productId || p.slug === offer.productSlug)
            const productSlug = product?.slug ?? offer.productSlug
            const productName = product?.name ?? offer.productName ?? 'Product'
            if (!productSlug) return null
            const seller = getSeller(offer.sellerId)
            const pct = Math.round((1 - offer.offerPrice / offer.listPrice) * 100)
            return (
              <li key={offer.id} className="flex flex-col rounded-3xl border bg-card p-5">
                <div className="flex gap-4">
                  <Link href={`/product/${productSlug}`} className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {(product?.image || offer.productImage) && <Image src={product?.image || offer.productImage || '/placeholder.svg'} alt={productName} fill sizes="80px" className="object-cover" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/product/${productSlug}`} className="line-clamp-2 text-sm font-medium hover:underline">{productName}</Link>
                      <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', statusStyles[offer.status])}>
                        {offer.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{seller?.name ?? offer.sellerName}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-display text-lg font-semibold tabular-nums">{formatPrice(offer.offerPrice)}</span>
                      <span className="text-sm text-muted-foreground line-through">{formatPrice(offer.listPrice)}</span>
                      {pct > 0 && <span className="text-xs font-medium text-deal">{`-${pct}%`}</span>}
                    </div>
                  </div>
                </div>
                {(offer.message || offer.voiceNote) && (
                  <div className="mt-4 rounded-2xl bg-muted p-3 text-sm">
                    {offer.message && <p className="leading-relaxed">{`"${offer.message}"`}</p>}
                    {offer.voiceNote && (
                      <div className="mt-2 flex items-center gap-2">
                        <Mic className="size-4 text-primary" aria-hidden="true" />
                        <audio src={offer.voiceNote.url} controls className="h-8 w-full" />
                      </div>
                    )}
                  </div>
                )}
                {offer.status === 'pending' && (
                  <div className="mt-4 rounded-2xl border border-dashed p-3">
                    <p className="text-xs text-muted-foreground">Waiting for the seller to respond.</p>
                  </div>
                )}
                {offer.status === 'countered' && offer.counterPrice !== undefined && (
                  <div className="mt-4 rounded-2xl border border-dashed p-3">
                    <p className="text-sm">{`Seller countered at ${formatPrice(offer.counterPrice)}.`}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void respondToOffer(offer.id, 'accept').catch(() => {})}
                        className="h-9 flex-1 rounded-full bg-primary text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        Accept counter
                      </button>
                      <button
                        type="button"
                        onClick={() => void respondToOffer(offer.id, 'decline').catch(() => {})}
                        className="h-9 flex-1 rounded-full border text-xs font-medium hover:bg-muted"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}
                {offer.status === 'accepted' && (
                  <Link href={`/product/${productSlug}`} className="mt-4 flex h-10 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90">
                    Buy at your price
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
