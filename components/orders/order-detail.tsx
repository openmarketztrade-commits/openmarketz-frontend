'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, MapPin, MessageCircle, Star, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { deliveryOptions, useShop } from '@/components/shop-provider'
import { formatPrice, getSeller } from '@/lib/data'
import { OrderTimeline, StatusBadge } from '@/components/orders/order-ui'
import { useCatalogProducts } from '@/components/catalog-provider'
import { createProductReview } from '@/lib/api'

const paymentLabels = { paystack: 'Paystack secure checkout' } as const

export function OrderDetail({ id }: { id: string }) {
  const { orders, confirmDelivery } = useShop()
  const [confirming, setConfirming] = useState(false)
  const { products } = useCatalogProducts()
  const order = orders.find((o) => o.id === id)

  if (!order) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground">Order not found.</p>
        <Link href="/orders" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Back to orders</Link>
      </div>
    )
  }

  return (
    <>
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All orders
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{`Order ${order.displayId ?? order.id}`}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {`Placed ${new Date(order.placedAt).toLocaleString('en-NG', { dateStyle: 'long', timeStyle: 'short' })}`}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border bg-card p-6" aria-labelledby="tracking-heading">
            <div className="flex items-center justify-between gap-4">
              <h2 id="tracking-heading" className="font-display text-lg font-semibold">Tracking</h2>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Truck className="size-4" aria-hidden="true" />
                {`${deliveryOptions[order.delivery].label} · ${deliveryOptions[order.delivery].eta}`}
              </span>
            </div>
            {order.shipment && (
              <p className="mt-3 text-sm text-muted-foreground">
                {[
                  order.shipment.carrier,
                  order.shipment.waybill ? `Waybill ${order.shipment.waybill}` : undefined,
                ].filter(Boolean).join(' · ') || `Shipment status: ${order.shipment.status.toLowerCase().replaceAll('_', ' ')}`}
                {order.shipment.trackingUrl && (
                  <>
                    {' · '}
                    <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Track with carrier</a>
                  </>
                )}
              </p>
            )}
            <div className="mt-6">
              <OrderTimeline status={order.status} placedAt={order.placedAt} />
            </div>
            {order.shipment?.status === 'DELIVERED' && !order.buyerConfirmedDeliveredAt && (
              <button
                type="button"
                disabled={confirming}
                onClick={() => {
                  setConfirming(true)
                  void confirmDelivery(order.id)
                    .then(() => toast.success('Delivery confirmed.'))
                    .catch((error) => toast.error(error instanceof Error ? error.message : 'Delivery could not be confirmed.'))
                    .finally(() => setConfirming(false))
                }}
                className="mt-6 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {confirming ? 'Confirming…' : 'Confirm delivery'}
              </button>
            )}
          </section>

          <section className="rounded-3xl border bg-card" aria-labelledby="items-heading">
            <h2 id="items-heading" className="border-b p-6 font-display text-lg font-semibold">Items</h2>
            <ul className="divide-y">
              {order.items.map((item) => {
                const product = products.find((p) => p.id === item.productId)
                if (!product) return null
                const seller = getSeller(product.sellerId)
                return (
                  <li key={item.productId + JSON.stringify(item.options)} className="flex items-center gap-4 p-4 sm:px-6">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                      <Image src={product.image || '/placeholder.svg'} alt={product.name} fill sizes="64px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/product/${product.slug}`} className="line-clamp-1 text-sm font-medium hover:underline">{product.name}</Link>
                      <p className="text-xs text-muted-foreground">{`${seller?.name} · Qty ${item.quantity}`}</p>
                      {Object.keys(item.options).length > 0 && (
                        <p className="text-xs text-muted-foreground">{Object.entries(item.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                      )}
                      {order.status === 'delivered' && item.id && (
                        <ReviewComposer orderItemId={item.id} productId={item.productId} />
                      )}
                    </div>
                    <p className="text-sm font-medium tabular-nums">{formatPrice(item.unitPrice * item.quantity)}</p>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-3xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <MapPin className="size-4 text-primary" aria-hidden="true" />
              Delivery address
            </h2>
            <address className="mt-3 text-sm not-italic leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{order.address.fullName}</span>
              <br />
              {order.address.line1}
              <br />
              {`${order.address.city}, ${order.address.state}`}
              <br />
              {order.address.phone}
            </address>
          </section>
          <section className="rounded-3xl border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Payment</h2>
            <dl className="mt-4 flex flex-col gap-2.5 text-sm">
              <Row label="Method" value={paymentLabels[order.payment]} />
              <Row label="Subtotal" value={formatPrice(order.subtotal)} />
              <Row label="Delivery" value={order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)} />
              <Row label="Service fee" value={formatPrice(order.serviceFee)} />
              <div className="mt-1 flex justify-between border-t pt-3">
                <dt className="font-medium">Total</dt>
                <dd className="font-display text-lg font-semibold tabular-nums">{formatPrice(order.total)}</dd>
              </div>
            </dl>
          </section>
          <div className="flex gap-3">
            <Link href="/messages" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border text-sm font-medium hover:bg-muted">
              <MessageCircle className="size-4" aria-hidden="true" />
              Message seller
            </Link>
            <button
              type="button"
              onClick={() => toast('Our support team will reach out shortly')}
              className="h-11 flex-1 rounded-full border text-sm font-medium hover:bg-muted"
            >
              Get help
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}

function ReviewComposer({ orderItemId, productId }: { orderItemId: string; productId: string }) {
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await createProductReview(productId, { orderItemId, rating, body: body.trim() || undefined })
      setSubmitted(true)
      toast.success('Thanks for reviewing this product.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your review could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) return <p className="mt-2 text-xs font-medium text-primary">Review submitted</p>

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`review-rating-${orderItemId}`}>Rating</label>
      <select
        id={`review-rating-${orderItemId}`}
        value={rating}
        onChange={(event) => setRating(Number(event.target.value))}
        className="h-9 rounded-lg border bg-background px-2 text-xs"
      >
        {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{`${value} stars`}</option>)}
      </select>
      <label className="sr-only" htmlFor={`review-body-${orderItemId}`}>Review (optional)</label>
      <input
        id={`review-body-${orderItemId}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={2000}
        placeholder="Write a review"
        className="h-9 min-w-32 flex-1 rounded-lg border bg-background px-3 text-xs"
      />
      <button type="submit" disabled={submitting} className="flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
        <Star className="size-3.5" aria-hidden="true" />
        {submitting ? 'Submitting…' : 'Review'}
      </button>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
