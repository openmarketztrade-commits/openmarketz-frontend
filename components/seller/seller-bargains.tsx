'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Check, Loader2, MapPin, Repeat, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/data'
import type { BargainRequest, BargainStatus } from '@/lib/seller'
import { timeAgo } from '@/components/notifications-provider'
import { useSeller } from '@/components/seller/seller-provider'
import { PageHeader, StatusPill } from '@/components/seller/seller-shell'
import { inputClass } from '@/components/forms'
import { cn } from '@/lib/utils'

const tabs: { id: 'pending' | 'responded'; label: string }[] = [
  { id: 'pending', label: 'Waiting for you' },
  { id: 'responded', label: 'Responded' },
]

export function SellerBargains() {
  const { bargains } = useSeller()
  const [tab, setTab] = useState<'pending' | 'responded'>('pending')
  const shown = bargains.filter((b) => (tab === 'pending' ? b.status === 'pending' : b.status !== 'pending'))

  return (
    <div>
      <PageHeader title="Bargain requests" description="Accept, counter or decline offers buyers make on your products." />
      <div role="tablist" aria-label="Bargain status" className="mb-4 flex w-fit gap-1 rounded-xl bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('h-8 rounded-lg px-3 text-sm font-medium text-muted-foreground', tab === t.id && 'bg-card text-foreground shadow-sm')}
          >
            {t.label}
            {t.id === 'pending' && ` (${bargains.filter((b) => b.status === 'pending').length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing here right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((b) => <BargainCard key={b.id} bargain={b} />)}
        </ul>
      )}
    </div>
  )
}

const statusLabel: Record<BargainStatus, string> = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined', countered: 'Countered' }

function BargainCard({ bargain: b }: { bargain: BargainRequest }) {
  const { productById, respondToBargain } = useSeller()
  const p = productById(b.productId)
  const [countering, setCountering] = useState(false)
  const [busy, setBusy] = useState<'accept' | 'counter' | 'decline' | null>(null)
  const [counter, setCounter] = useState(String(Math.round((b.offerPrice + b.listPrice) / 2 / 100) * 100))
  const off = Math.round((1 - b.offerPrice / b.listPrice) * 100)

  return (
    <li className="rounded-2xl border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {(b.productImage || p?.image) && <Image src={b.productImage ?? p!.image} alt="" width={72} height={72} className="size-18 shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{b.productName ?? p?.name ?? 'Product'}</p>
            <StatusPill status={b.status} label={statusLabel[b.status]} />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" aria-hidden="true" />
            {`${b.buyerName} · ${b.buyerCity} · ${timeAgo(b.createdAt)}`}
          </p>
          {b.message && <p className="mt-2 rounded-xl bg-muted/60 p-3 text-sm">{`“${b.message}”`}</p>}
        </div>
        <div className="flex shrink-0 flex-row items-baseline gap-3 sm:flex-col sm:items-end sm:gap-0">
          <p className="font-display text-xl font-semibold">{formatPrice(b.offerPrice)}</p>
          <p className="text-xs text-muted-foreground">
            <span className="line-through">{formatPrice(b.listPrice)}</span>
            {` · ${off}% off · Qty ${b.quantity}`}
          </p>
          {b.counterPrice && <p className="text-xs font-medium text-sky-700">{`You countered ${formatPrice(b.counterPrice)}`}</p>}
        </div>
      </div>

      {b.status === 'pending' && (
        <div className="mt-4 flex flex-col gap-3 border-t pt-4">
          {countering ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                if (busy) return
                const n = Number(counter)
                if (!(n > b.offerPrice && n < b.listPrice)) {
                  toast.error(`Counter must be between ${formatPrice(b.offerPrice)} and ${formatPrice(b.listPrice)}`)
                  return
                }
                setBusy('counter')
                try {
                  await respondToBargain(b.id, { counter: n })
                  toast.success(`Counter offer of ${formatPrice(n)} sent`)
                  setCountering(false)
                } catch {
                  // The provider surfaces the API error.
                } finally {
                  setBusy(null)
                }
              }}
            >
              <label htmlFor={`counter-${b.id}`} className="text-sm font-medium">Your price (₦)</label>
              <input id={`counter-${b.id}`} inputMode="numeric" value={counter} onChange={(e) => setCounter(e.target.value.replace(/\D/g, ''))} className={cn(inputClass, 'h-10 w-36')} />
              <button type="submit" disabled={!!busy} aria-busy={busy === 'counter'} className="flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-60">
                {busy === 'counter' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {busy === 'counter' ? 'Sending…' : 'Send counter'}
              </button>
              <button type="button" disabled={!!busy} onClick={() => setCountering(false)} className="h-10 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">Cancel</button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  if (busy) return
                  setBusy('accept')
                  void respondToBargain(b.id, 'accept').then(() => {
                    toast.success(`Accepted ${formatPrice(b.offerPrice)}. The buyer can now check out at this price.`)
                  }).catch(() => {}).finally(() => setBusy(null))
                }}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy === 'accept' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                {busy === 'accept' ? 'Accepting…' : 'Accept'}
              </button>
              <button type="button" disabled={!!busy} onClick={() => setCountering(true)} className="flex h-10 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">
                <Repeat className="size-4" aria-hidden="true" />
                Counter
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  if (busy) return
                  setBusy('decline')
                  void respondToBargain(b.id, 'decline').then(() => {
                    toast('Offer declined')
                  }).catch(() => {}).finally(() => setBusy(null))
                }}
                className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-deal hover:bg-deal/10 disabled:opacity-50"
              >
                {busy === 'decline' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
                {busy === 'decline' ? 'Declining…' : 'Decline'}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
