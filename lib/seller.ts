import type { Product } from '@/lib/data'

export const STORE_ID = 's1'

export type ListingStatus = 'active' | 'draft' | 'paused'

export type SellerListing = Product & { status: ListingStatus; minPrice?: number; views: number }

export type BargainStatus = 'pending' | 'accepted' | 'declined' | 'countered'

export type BargainRequest = {
  id: string
  productId: string
  buyerName: string
  buyerCity: string
  productName?: string
  productImage?: string
  listPrice: number
  offerPrice: number
  counterPrice?: number
  quantity: number
  message?: string
  status: BargainStatus
  createdAt: number
  source: 'shop'
}

export type FulfilmentStatus = 'awaiting_dispatch' | 'packed' | 'handed_over' | 'in_transit' | 'delivered'

export const fulfilmentSteps: { id: FulfilmentStatus; label: string }[] = [
  { id: 'awaiting_dispatch', label: 'New order' },
  { id: 'packed', label: 'Packed' },
  { id: 'handed_over', label: 'Handed to delivery' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
]

export type DispatchMethod = 'dropoff' | 'pickup'

export type SalesOrder = {
  id: string
  buyer: { name: string; city: string; phone: string }
  items: { productId: string; productName?: string; quantity: number; unitPrice: number; options: Record<string, string> }[]
  total: number
  placedAt: number
  dispatchBy: number
  status: FulfilmentStatus
  dispatch?: { method: DispatchMethod; hub: string; waybill: string; at: number }
  payout: 'escrow' | 'released'
  source: 'shop' | 'api'
}

export type SellerAlertType = 'order' | 'dispatch' | 'offer' | 'request' | 'payout' | 'system'

export type SellerAlert = {
  id: string
  type: SellerAlertType
  title: string
  body: string
  href?: string
  at: number
  read: boolean
}

export const dropOffHubs = [
  'OpenMarketz Hub — Ikeja, Lagos',
  'OpenMarketz Hub — Lekki Phase 1, Lagos',
  'OpenMarketz Hub — Wuse II, Abuja',
  'OpenMarketz Hub — GRA, Port Harcourt',
]

const HOUR = 3_600_000

export function newWaybill() {
  return `WB-${Math.floor(10000 + Math.random() * 89999)}`
}

export function timeUntil(at: number) {
  const diff = at - Date.now()
  const hrs = Math.round(Math.abs(diff) / HOUR)
  if (diff < 0) return hrs < 1 ? 'Overdue' : `${hrs}h overdue`
  return hrs < 1 ? 'Due within the hour' : `Due in ${hrs}h`
}
