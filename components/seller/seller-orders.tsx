'use client'

import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Box, Check, MapPin, Phone, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/data'
import { getSellerShippingRates, type ShippingRate } from '@/lib/api'
import { fulfilmentSteps, timeUntil, type SalesOrder } from '@/lib/seller'
import { timeAgo } from '@/components/notifications-provider'
import { useSeller } from '@/components/seller/seller-provider'
import { PageHeader, StatusPill } from '@/components/seller/seller-shell'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'todo', label: 'To send' },
  { id: 'shipping', label: 'With delivery' },
  { id: 'done', label: 'Completed' },
] as const

const inTab = (o: SalesOrder, tab: (typeof tabs)[number]['id']) =>
  tab === 'todo' ? o.status === 'awaiting_dispatch' || o.status === 'packed' : tab === 'shipping' ? o.status === 'handed_over' || o.status === 'in_transit' : o.status === 'delivered'

export function SellerOrders() {
  const { orders } = useSeller()
  const focus = useSearchParams().get('focus')
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>(() => {
    const f = orders.find((o) => o.id === focus)
    return f ? (tabs.find((t) => inTab(f, t.id))?.id ?? 'todo') : 'todo'
  })
  const shown = orders.filter((o) => inTab(o, tab))

  return (
    <div>
      <PageHeader title="Orders & delivery" description="See who bought your products and send paid orders to OpenMarketz delivery." />
      <div role="tablist" aria-label="Order status" className="mb-4 flex w-fit gap-1 rounded-xl bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('h-8 rounded-lg px-3 text-sm font-medium text-muted-foreground', tab === t.id && 'bg-card text-foreground shadow-sm')}
          >
            {`${t.label} (${orders.filter((o) => inTab(o, t.id)).length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">No orders in this tab.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((o) => <OrderCard key={o.id} order={o} highlighted={o.id === focus} />)}
        </ul>
      )}
    </div>
  )
}

function OrderCard({ order: o, highlighted }: { order: SalesOrder; highlighted: boolean }) {
  const { productById, advanceOrder } = useSeller()
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const stepIndex = fulfilmentSteps.findIndex((s) => s.id === o.status)
  const overdue = o.dispatchBy < Date.now() && stepIndex < 2

  return (
    <li id={o.id} className={cn('scroll-mt-28 rounded-3xl border bg-card p-5', highlighted && 'ring-2 ring-primary')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            {o.id}
            <StatusPill status={o.status} />
          </p>
          <p className="text-xs text-muted-foreground">{`Paid ${timeAgo(o.placedAt)} · Payout ${o.payout === 'escrow' ? 'held in escrow' : 'released'}`}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-semibold">{formatPrice(o.total)}</p>
          {stepIndex < 2 && <p className={cn('text-xs font-medium', overdue ? 'text-deal' : 'text-amber-700')}>{`Send to delivery · ${timeUntil(o.dispatchBy)}`}</p>}
        </div>
      </div>

      <ol aria-label="Fulfilment progress" className="my-5 grid grid-cols-5 gap-1">
        {fulfilmentSteps.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-1.5">
            <span className={cn('h-1.5 rounded-full', i <= stepIndex ? 'bg-primary' : 'bg-muted')} />
            <span className={cn('text-[11px] leading-tight', i <= stepIndex ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <ul className="flex flex-col gap-2">
          {o.items.map((it, index) => {
            const p = productById(it.productId)
            return (
              <li key={`${it.productId}-${index}`} className="flex items-center gap-3">
                {p && <Image src={p.image} alt="" width={48} height={48} className="size-12 rounded-xl object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p?.name ?? it.productName ?? 'Marketplace request item'}</p>
                  <p className="text-xs text-muted-foreground">{`Qty ${it.quantity} · ${formatPrice(it.unitPrice)} each`}</p>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="rounded-2xl bg-muted/50 p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bought by</p>
          <p className="mt-1 font-medium">{o.buyer.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden="true" />{o.buyer.city}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="size-3" aria-hidden="true" />{o.buyer.phone.replace(/\d{4}$/, '••••')}</p>
        </div>
      </div>

      {o.dispatch && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-dashed p-3 text-sm">
          <Truck className="size-4 text-primary" aria-hidden="true" />
          <span>{`${o.dispatch.hub} · Tracking `}</span>
          {o.dispatch.trackingUrl ? <a href={o.dispatch.trackingUrl} target="_blank" rel="noreferrer" className="font-mono font-semibold text-primary underline">{o.dispatch.waybill}</a> : <span className="font-mono font-semibold">{o.dispatch.waybill}</span>}
        </p>
      )}

      {stepIndex < 2 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {o.status === 'awaiting_dispatch' && (
            <button
              type="button"
              onClick={() => {
                void advanceOrder(o.id, 'packed')
                  .then(() => toast.success(`${o.id} marked as packed`))
                  .catch((error) => toast.error(error instanceof Error ? error.message : 'Order status could not be updated.'))
              }}
              className="flex h-10 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold hover:bg-muted"
            >
              <Box className="size-4" aria-hidden="true" />
              Mark as packed
            </button>
          )}
          {o.source === 'api' && <button type="button" onClick={() => setDispatchOpen(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Truck className="size-4" aria-hidden="true" />
            Get Shipbubble rates
          </button>}
          {o.source !== 'api' && <p className="self-center text-xs text-muted-foreground">Carrier booking is available for paid marketplace orders.</p>}
        </div>
      )}

      <ShipbubbleDialog open={dispatchOpen} onOpenChange={setDispatchOpen} order={o} />
    </li>
  )
}

function ShipbubbleDialog({ open, onOpenChange, order }: { open: boolean; onOpenChange: (v: boolean) => void; order: SalesOrder }) {
  const { bookShipping } = useSeller()
  const [weight, setWeight] = useState('1')
  const [length, setLength] = useState('20')
  const [width, setWidth] = useState('15')
  const [height, setHeight] = useState('10')
  const [requestToken, setRequestToken] = useState<string | null>(null)
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loadingRates, setLoadingRates] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedRate = rates.find((rate) => `${rate.courierId}:${rate.serviceCode}` === selected)

  async function loadRates() {
    setLoadingRates(true)
    setError(null)
    try {
      const result = await getSellerShippingRates(order.id, {
        packageWeightKg: Number(weight), lengthCm: Number(length), widthCm: Number(width), heightCm: Number(height),
      })
      setRequestToken(result.requestToken)
      setRates(result.couriers)
      setSelected(result.couriers[0] ? `${result.couriers[0].courierId}:${result.couriers[0].serviceCode}` : '')
      if (!result.couriers.length) setError('Shipbubble returned no delivery options for this package.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Shipping rates could not be loaded.')
    } finally {
      setLoadingRates(false)
    }
  }

  async function bookSelected() {
    if (!selectedRate || !requestToken) return
    setSubmitting(true)
    setError(null)
    try {
      await bookShipping(order.id, { requestToken, courierId: selectedRate.courierId, serviceCode: selectedRate.serviceCode })
      onOpenChange(false)
      toast.success('Shipbubble delivery booked. Tracking details are now attached to this order.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The shipment could not be booked.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Ship ${order.id} with Shipbubble`}</DialogTitle>
          <DialogDescription>Enter the packed parcel dimensions to get live courier rates for the buyer’s delivery address.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['Weight (kg)', weight, setWeight], ['Length (cm)', length, setLength], ['Width (cm)', width, setWidth], ['Height (cm)', height, setHeight],
          ] as const).map(([label, value, setter]) => <label key={label} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{label}<input type="number" min="0.1" step="0.1" required value={value} onChange={(event) => { setter(event.target.value); setRequestToken(null); setRates([]) }} className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground" /></label>)}
        </div>
        <button type="button" disabled={loadingRates || [weight, length, width, height].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)} onClick={() => void loadRates()} className="flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-semibold disabled:opacity-50">
          {loadingRates ? 'Loading rates…' : 'Get live rates'}
        </button>
        {rates.length > 0 && <fieldset className="flex max-h-56 flex-col gap-2 overflow-y-auto">
          <legend className="mb-2 text-sm font-semibold">Available courier services</legend>
          {rates.map((rate) => {
            const value = `${rate.courierId}:${rate.serviceCode}`
            return <label key={value} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3', selected === value && 'border-primary bg-primary/5')}>
              <input type="radio" name={`courier-${order.id}`} checked={selected === value} onChange={() => setSelected(value)} className="accent-[var(--primary)]" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{rate.courierName} · {rate.serviceType}</span><span className="text-xs text-muted-foreground">{rate.deliveryEta} · {rate.trackingLevel} tracking</span></span>
              <span className="text-sm font-semibold">{formatPrice(rate.total)}</span>
            </label>
          })}
        </fieldset>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {selectedRate && <button type="button" disabled={submitting} onClick={() => void bookSelected()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Check className="size-4" aria-hidden="true" />
          {submitting ? 'Booking shipment…' : `Book ${selectedRate.courierName} · ${formatPrice(selectedRate.total)}`}
        </button>
        }
      </DialogContent>
    </Dialog>
  )
}
