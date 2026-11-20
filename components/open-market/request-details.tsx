'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BadgeCheck, CalendarDays, Check, Clock, Eye, MapPin, MessageCircle, Package, Star, Truck } from 'lucide-react'
import { formatPrice, getCategory } from '@/lib/data'
import { conditionLabels, timeAgo, type SellerResponse } from '@/lib/open-market'
import { useOpenMarket } from '@/components/open-market/open-market-provider'
import { RequestStatusBadge } from '@/components/open-market/request-card'
import { Field, FormAlert, SubmitButton, inputClass } from '@/components/forms'
import { cn } from '@/lib/utils'
import { useCatalogProducts } from '@/components/catalog-provider'
import { useAuth } from '@/components/auth-provider'
import { toast } from 'sonner'

export function RequestDetails({ id }: { id: string }) {
  const { requests, responsesFor, loadRequest, loadResponses } = useOpenMarket()
  const { user } = useAuth()
  const posted = useSearchParams().get('posted') === '1'
  const request = requests.find((r) => r.id === id)
  const [loading, setLoading] = useState(!request)

  useEffect(() => {
    let active = true
    setLoading(true)
    void loadRequest(id)
      .catch((error) => toast.error(error instanceof Error ? error.message : 'The request could not be loaded.'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [id, loadRequest])

  useEffect(() => {
    if (user) {
      void loadResponses(id).catch((error) => toast.error(error instanceof Error ? error.message : 'Seller offers could not be loaded.'))
    }
  }, [id, loadResponses, user])

  if (!request) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">{loading ? 'Loading request…' : 'Request not found'}</h1>
        {!loading && <Link href="/open-market/requests" className="text-sm font-medium text-primary hover:underline">Browse all requests</Link>}
      </div>
    )
  }

  const responses = responsesFor(request.id)
  const isMine = request.buyerId === user?.id
  const lowest = responses[0]?.price

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/open-market" className="hover:text-foreground">Open Market</Link>
        {' / '}
        <Link href="/open-market/requests" className="hover:text-foreground">Requests</Link>
      </nav>

      {posted && <div className="mt-4"><FormAlert tone="success">Your request is posted. Sellers can now view it and respond.</FormAlert></div>}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-8">
          <article className="overflow-hidden rounded-3xl border bg-card">
            {request.image && (
              <div className="relative aspect-[16/8] bg-muted">
                <Image src={request.image || '/placeholder.svg'} alt={request.title} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" priority />
              </div>
            )}
            <div className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <RequestStatusBadge status={request.status} />
                <span className="text-xs text-muted-foreground">{`${getCategory(request.category)?.name ?? 'Other'} · ${conditionLabels[request.condition]}`}</span>
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-balance md:text-3xl">{request.title}</h1>
              <p className="leading-relaxed text-muted-foreground">{request.description}</p>
              <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-muted/60 p-4 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted-foreground">Budget</dt><dd className="font-semibold tabular-nums">{`${formatPrice(request.budgetMin)} – ${formatPrice(request.budgetMax)}`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Quantity</dt><dd className="font-semibold">{request.quantity}</dd></div>
                <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden="true" />Location</dt><dd className="font-semibold">{request.location}</dd></div>
                <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" aria-hidden="true" />Needed by</dt><dd className="font-semibold">{request.neededBy ? new Date(request.neededBy).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : 'Flexible'}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>{`Posted by ${request.buyerName}`}</span>
                <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{timeAgo(request.postedHoursAgo)}</span>
                <span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden="true" />{`${request.views} views`}</span>
              </div>
            </div>
          </article>

          <section aria-labelledby="offers">
            <div className="flex items-baseline justify-between">
              <h2 id="offers" className="font-display text-xl font-semibold">{`Seller offers (${responses.length})`}</h2>
              {lowest && <p className="text-sm text-muted-foreground">{`Lowest: ${formatPrice(lowest)}`}</p>}
            </div>
            {responses.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No offers yet. Sellers usually respond within an hour.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {responses.map((r) => <OfferCard key={r.id} response={r} isMine={isMine} budgetMax={request.budgetMax} />)}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-40 lg:self-start">
          {isMine ? <BuyerPanel requestStatus={request.status} count={responses.length} /> : request.status === 'open' ? <RespondForm requestId={request.id} budgetMax={request.budgetMax} /> : (
            <div className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">This request has been fulfilled and is no longer accepting offers.</div>
          )}
        </aside>
      </div>
    </div>
  )
}

function OfferCard({ response, isMine, budgetMax }: { response: SellerResponse; isMine: boolean; budgetMax: number }) {
  const { acceptResponse, declineResponse } = useOpenMarket()
  const { products } = useCatalogProducts()
  const sellerName = response.sellerName ?? 'Seller'
  const seller = {
    name: sellerName,
    slug: response.sellerSlug ?? '',
    initials: sellerName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    verified: response.sellerVerified ?? false,
    rating: response.sellerRating ?? 0,
  }
  const product = response.productId ? products.find((p) => p.id === response.productId) : undefined

  return (
    <li className={cn('rounded-2xl border bg-card p-5', response.status === 'accepted' && 'border-primary ring-2 ring-primary/20', response.status === 'declined' && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={`/store/${seller.slug}`} className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">{seller.initials}</span>
          <span>
            <span className="flex items-center gap-1 font-medium">
              {seller.name}
              {seller.verified && <BadgeCheck className="size-4 text-primary" aria-label="Verified seller" />}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5"><Star className="size-3 fill-current text-amber-500" aria-hidden="true" />{seller.rating}</span>
            </span>
          </span>
        </Link>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold tabular-nums">{formatPrice(response.price)}</p>
          {response.price <= budgetMax && <p className="text-xs font-medium text-primary">Within budget</p>}
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{response.note}</p>
      {product && (
        <Link href={`/product/${product.slug}`} className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-2 hover:bg-muted">
          <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-background">
            <Image src={product.image || '/placeholder.svg'} alt="" fill sizes="56px" className="object-cover" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Package className="size-3" aria-hidden="true" />Attached listing</span>
            <span className="line-clamp-1 text-sm font-medium">{product.name}</span>
          </span>
        </Link>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Truck className="size-3.5" aria-hidden="true" />{`Delivers in ${response.deliveryDays} day${response.deliveryDays > 1 ? 's' : ''}`}</span>
          <span>{timeAgo(response.postedHoursAgo)}</span>
        </span>
        {response.status === 'accepted' ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-medium text-primary"><Check className="size-4" aria-hidden="true" />Accepted</span>
            {isMine && <Link href={`/open-market/checkout/${response.id}`} className="flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Continue to payment</Link>}
          </div>
        ) : response.status === 'declined' ? (
          <span className="text-sm text-muted-foreground">Declined</span>
        ) : isMine ? (
          <div className="flex gap-2">
            <Link href="/messages" className="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium hover:bg-muted"><MessageCircle className="size-4" aria-hidden="true" />Chat</Link>
            <button type="button" onClick={() => {
              void declineResponse(response.id).catch((error) => toast.error(error instanceof Error ? error.message : 'The offer could not be declined.'))
            }} className="h-10 rounded-xl border px-3 text-sm font-medium hover:bg-muted">Decline</button>
            <button
              type="button"
              onClick={() => {
                void acceptResponse(response.id)
                  .then(() => toast.success('Offer accepted.'))
                  .catch((error) => toast.error(error instanceof Error ? error.message : 'The offer could not be accepted.'))
              }}
              className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Accept offer
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function BuyerPanel({ requestStatus, count }: { requestStatus: string; count: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">This is your request</h2>
      <p className="text-sm text-muted-foreground">
        {requestStatus === 'accepted'
          ? 'You accepted an offer. Complete secure Paystack checkout to place the order.'
          : count
            ? 'Compare offers below and chat with a seller if you need more details before accepting.'
            : 'Sellers are reviewing your request. We will notify you as offers come in.'}
      </p>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-2"><Check className="size-4 text-primary" aria-hidden="true" />Accepting an offer does not charge you</li>
      </ul>
    </div>
  )
}

function RespondForm({ requestId, budgetMax }: { requestId: string; budgetMax: number }) {
  const { submitResponse } = useOpenMarket()
  const [price, setPrice] = useState('')
  const [days, setDays] = useState('2')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const p = Number(price)
    const d = Number(days)
    const err: Record<string, string> = {}
    if (!p || p < 100) err.price = 'Enter your offer price.'
    if (!Number.isInteger(d) || d < 1 || d > 60) err.days = 'Enter 1–60 days.'
    if (note.trim().length < 15) err.note = 'Describe what you are offering (15+ characters).'
    setErrors(err)
    if (Object.keys(err).length) return
    try {
      await submitResponse({ requestId, price: p, deliveryDays: d, note: note.trim() })
      setSent(true)
      setPrice('')
      setNote('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your offer could not be sent.')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border bg-card p-6" noValidate>
      <h2 className="font-display text-lg font-semibold">Make an offer</h2>
      {sent && <FormAlert tone="success">Offer submitted. It now appears on this request.</FormAlert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your price (₦)" error={errors.price} hint={`Budget up to ${formatPrice(budgetMax)}`} htmlFor="op">
          <input id="op" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} className={inputClass} aria-invalid={!!errors.price || undefined} />
        </Field>
        <Field label="Delivery (days)" error={errors.days} htmlFor="od">
          <input id="od" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} aria-invalid={!!errors.days || undefined} />
        </Field>
      </div>
      <Field label="Message to buyer" error={errors.note} htmlFor="on">
        <textarea id="on" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Brand, condition, warranty, what's included…" className={cn(inputClass, 'h-auto py-3')} aria-invalid={!!errors.note || undefined} />
      </Field>
      <SubmitButton>Send offer</SubmitButton>
    </form>
  )
}
