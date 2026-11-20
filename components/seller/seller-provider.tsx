'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSeller, type Product } from '@/lib/data'
import { useShop } from '@/components/shop-provider'
import { useAuth } from '@/components/auth-provider'
import { listSellerOrders, listSellerProducts, updateSellerOrderShipment } from '@/lib/api'
import { mapCatalogProduct, useCatalogProducts } from '@/components/catalog-provider'
import {
  STORE_ID, newWaybill,
  type BargainRequest, type DispatchMethod, type FulfilmentStatus, type ListingStatus, type SalesOrder, type SellerAlert, type SellerListing,
} from '@/lib/seller'

export type NewListing = Pick<Product, 'name' | 'brand' | 'category' | 'price' | 'stock' | 'description' | 'highlights' | 'freeDelivery' | 'image' | 'gallery'> &
  Partial<Pick<Product, 'compareAt' | 'negotiable' | 'condition' | 'variants'>> & {
    id?: string
    slug?: string
    sellerId?: string
    rating?: number
    reviews?: number
    sold?: number
    specs?: { label: string; value: string }[]
    badge?: 'Best seller' | 'New' | 'Limited'
    minPrice?: number
    status: ListingStatus
    views?: number
  }

type SellerValue = {
  store: NonNullable<ReturnType<typeof getSeller>>
  listings: SellerListing[]
  bargains: BargainRequest[]
  orders: SalesOrder[]
  alerts: SellerAlert[]
  listingsLoaded: boolean
  listingsError: string | null
  unreadAlerts: number
  productById: (id: string) => Product | undefined
  addListing: (input: NewListing) => SellerListing
  setListingStatus: (id: string, status: ListingStatus) => void
  updateStock: (id: string, stock: number) => void
  respondToBargain: (id: string, action: 'accept' | 'decline' | { counter: number }) => Promise<void>
  advanceOrder: (id: string, next: FulfilmentStatus, dispatch?: { method: DispatchMethod; hub: string }) => Promise<void>
  markAlertRead: (id: string) => void
  markAllAlertsRead: () => void
}

const SellerContext = createContext<SellerValue | null>(null)

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export function SellerProvider({ children }: { children: React.ReactNode }) {
  const shop = useShop()
  const { user } = useAuth()
  const { products: catalog } = useCatalogProducts()
  const store = getSeller(STORE_ID)!
  const [listings, setListings] = useState<SellerListing[]>([])
  const [listingsLoaded, setListingsLoaded] = useState(false)
  const [listingsError, setListingsError] = useState<string | null>(null)
  const [bargains] = useState<BargainRequest[]>([])
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [apiOrders, setApiOrders] = useState<SalesOrder[]>([])
  const [alerts, setAlerts] = useState<SellerAlert[]>([])
  const [shopOverrides, setShopOverrides] = useState<Record<string, Partial<SalesOrder>>>({})
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (user?.seller?.status !== 'approved') {
      setListings([])
      setListingsLoaded(true)
      setListingsError(null)
      return
    }

    let active = true
    setListingsLoaded(false)
    void listSellerProducts()
      .then((items) => {
        if (!active) return
        setListings(items.map((item) => ({
          ...mapCatalogProduct(item),
          status: item.status === 'DRAFT' ? 'draft' : item.status === 'PAUSED' ? 'paused' : 'active',
          minPrice: item.minPrice,
          views: 0,
        })))
        setListingsError(null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        const message = cause instanceof Error ? cause.message : 'Your products could not be loaded.'
        setListingsError(message)
        console.error('Unable to load seller products from the marketplace API.', cause)
      })
      .finally(() => {
        if (active) setListingsLoaded(true)
      })
    return () => { active = false }
  }, [user?.seller?.status])

  useEffect(() => {
    if (user?.seller?.status !== 'approved') {
      setApiOrders([])
      return
    }
    let active = true
    void listSellerOrders()
      .then(({ items }) => {
        if (!active) return
        setApiOrders(items
          .filter((order) => order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELLED' && order.status !== 'REFUNDED')
          .map((order) => {
            const shipmentStatus = order.shipment?.status
            const statusMap: Record<string, FulfilmentStatus> = {
              AWAITING_DISPATCH: 'awaiting_dispatch',
              PACKED: 'packed',
              HANDED_OVER: 'handed_over',
              IN_TRANSIT: 'in_transit',
              DELIVERED: 'delivered',
            }
            const status = statusMap[shipmentStatus ?? ''] ??
              (order.status === 'DELIVERED' ? 'delivered' : 'awaiting_dispatch')
            const placedAt = new Date(order.paidAt ?? order.createdAt).getTime()
            return {
              id: order.id,
              buyer: {
                name: order.address.fullName,
                city: `${order.address.city}, ${order.address.state}`,
                phone: order.address.phone,
              },
              items: order.items.map((item) => ({
                productId: item.productId ?? '',
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                options: item.options,
              })),
              total: order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
              placedAt,
              dispatchBy: placedAt + 24 * 3_600_000,
              status,
              dispatch: order.shipment ? {
                method: order.shipment.method === 'pickup' ? 'pickup' : 'dropoff',
                hub: order.shipment.hub ?? 'OpenMarketz Delivery',
                waybill: order.shipment.waybill ?? 'Pending',
                at: placedAt,
              } : undefined,
              payout: order.adminConfirmedDeliveredAt ? 'released' : 'escrow',
              source: 'api',
            } satisfies SalesOrder
          }))
      })
      .catch((cause) => console.error('Unable to load seller orders from the marketplace API.', cause))
    return () => { active = false }
  }, [user?.seller?.status])

  const productById = useCallback(
    (id: string) => listings.find((l) => l.id === id) ?? catalog.find((p) => p.id === id),
    [listings, catalog],
  )

  // Orders and offers the buyer side placed on this store's products surface here too.
  const shopOrders = useMemo<SalesOrder[]>(
    () =>
      shop.orders.flatMap((o) => {
        const items = o.items.filter((i) => productById(i.productId)?.sellerId === STORE_ID)
        if (!items.length) return []
        const base: SalesOrder = {
          id: o.id,
          buyer: { name: o.address.fullName, city: `${o.address.city}, ${o.address.state}`, phone: o.address.phone },
          items,
          total: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
          placedAt: o.placedAt,
          dispatchBy: o.placedAt + 24 * 3_600_000,
          status: 'awaiting_dispatch',
          payout: 'escrow',
          source: 'shop',
        }
        return [{ ...base, ...shopOverrides[o.id] }]
      }),
    [shop.orders, shopOverrides, productById],
  )

  const shopBargains = useMemo<BargainRequest[]>(
    () =>
      shop.offers
        .filter((o) => o.role === 'seller')
        .map((o) => ({
          id: o.id,
          productId: o.productId,
          buyerName: o.buyerName ?? 'Buyer',
          buyerCity: '—',
          productName: o.productName,
          productImage: o.productImage,
          listPrice: o.listPrice,
          offerPrice: o.offerPrice,
          quantity: o.quantity,
          message: o.message,
          createdAt: o.createdAt,
          source: 'shop' as const,
          status: o.status,
          counterPrice: o.counterPrice,
        })),
    [shop.offers],
  )

  const derivedAlerts = useMemo<SellerAlert[]>(
    () => [
      ...shopOrders
        .filter((o) => o.status === 'awaiting_dispatch')
        .map((o) => ({
          id: `alert-${o.id}`, type: 'dispatch' as const, title: `Send ${o.id} to delivery`,
          body: `${o.buyer.name} paid for ${o.items.length} item${o.items.length > 1 ? 's' : ''}. Drop off or book a pickup within 24 hours.`,
          href: `/seller/orders?focus=${o.id}`, at: o.placedAt, read: readIds.has(`alert-${o.id}`),
        })),
      ...shopBargains
        .filter((b) => b.status === 'pending')
        .map((b) => ({
          id: `alert-${b.id}`, type: 'offer' as const, title: 'New bargain request',
          body: `A buyer offered ${b.offerPrice.toLocaleString('en-NG')} NGN for ${productById(b.productId)?.name ?? 'your listing'}.`,
          href: '/seller/offers', at: b.createdAt, read: readIds.has(`alert-${b.id}`),
        })),
    ],
    [shopOrders, shopBargains, readIds, productById],
  )

  const allOrders = useMemo(() => {
    const merged = new Map([...shopOrders, ...orders, ...apiOrders].map((order) => [order.id, order]))
    return [...merged.values()].sort((a, b) => b.placedAt - a.placedAt)
  }, [shopOrders, orders, apiOrders])
  const allBargains = useMemo(() => [...shopBargains, ...bargains].sort((a, b) => b.createdAt - a.createdAt), [shopBargains, bargains])
  const allAlerts = useMemo(() => [...derivedAlerts, ...alerts].sort((a, b) => b.at - a.at), [derivedAlerts, alerts])

  const pushAlert = useCallback((a: Omit<SellerAlert, 'id' | 'at' | 'read'>) => {
    setAlerts((prev) => [{ ...a, id: `a_${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), read: false }, ...prev])
  }, [])

  const addListing = useCallback(
    (input: NewListing) => {
      const id = input.id ?? `sp_${Math.random().toString(36).slice(2, 8)}`
      const slug = input.slug ?? `${slugify(input.name)}-${id.slice(3)}`
      const listing: SellerListing = {
        ...input,
        id,
        slug,
        sellerId: input.sellerId ?? STORE_ID,
        rating: input.rating ?? 0,
        reviews: input.reviews ?? 0,
        sold: input.sold ?? 0,
        specs: input.specs ?? [],
        badge: input.badge ?? 'New',
        views: input.views ?? 0,
      }
      setListings((prev) => [listing, ...prev])
      pushAlert({ type: 'system', title: input.status === 'active' ? 'Listing is live' : 'Draft saved', body: `${input.name} ${input.status === 'active' ? 'is now visible to buyers.' : 'was saved as a draft.'}`, href: '/seller/products' })
      return listing
    },
    [pushAlert],
  )

  const setListingStatus = useCallback((id: string, status: ListingStatus) => {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
  }, [])

  const updateStock = useCallback((id: string, stock: number) => {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, stock: Math.max(0, Math.floor(stock)) } : l)))
  }, [])

  const respondToBargain = useCallback<SellerValue['respondToBargain']>(
    async (id, action) => {
      const isShop = shop.offers.some((o) => o.id === id)
      if (isShop) {
        if (action === 'accept') await shop.respondToOffer(id, 'accept')
        else if (action === 'decline') await shop.respondToOffer(id, 'decline')
        else await shop.respondToOffer(id, 'counter', action.counter)
        return
      }
      throw new Error('Offer not found.')
    },
    [shop],
  )

  const advanceOrder = useCallback<SellerValue['advanceOrder']>(
    async (id, next, dispatch) => {
      const patch: Partial<SalesOrder> = { status: next }
      if (apiOrders.some((order) => order.id === id)) {
        await updateSellerOrderShipment(id, {
          status: next === 'packed' ? 'PACKED' : next === 'handed_over' ? 'HANDED_OVER' : 'IN_TRANSIT',
          ...(dispatch ? { method: dispatch.method, hub: dispatch.hub } : {}),
        })
        if (dispatch) patch.dispatch = { ...dispatch, waybill: 'Pending', at: Date.now() }
        setApiOrders((previous) => previous.map((order) => order.id === id ? { ...order, ...patch } : order))
        return
      }
      if (dispatch) patch.dispatch = { ...dispatch, waybill: newWaybill(), at: Date.now() }
      if (shop.orders.some((o) => o.id === id)) {
        setShopOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
        setReadIds((prev) => new Set(prev).add(`alert-${id}`))
      } else {
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
      }
      if (dispatch) {
        pushAlert({
          type: 'dispatch',
          title: dispatch.method === 'pickup' ? `Pickup booked for ${id}` : `Drop-off confirmed for ${id}`,
          body: dispatch.method === 'pickup' ? 'A rider will collect the package from your store within 4 hours.' : `Hand the package to the desk at ${dispatch.hub}.`,
          href: `/seller/orders?focus=${id}`,
        })
      }
    },
    [shop.orders, pushAlert, apiOrders],
  )

  const markAlertRead = useCallback((id: string) => {
    setReadIds((prev) => new Set(prev).add(id))
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)))
  }, [])

  const markAllAlertsRead = useCallback(() => {
    setReadIds((prev) => new Set([...prev, ...derivedAlerts.map((a) => a.id)]))
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })))
  }, [derivedAlerts])

  const unreadAlerts = allAlerts.filter((a) => !a.read).length

  const value = useMemo(
    () => ({
      store, listings, bargains: allBargains, orders: allOrders, alerts: allAlerts, unreadAlerts, listingsLoaded, listingsError, productById,
      addListing, setListingStatus, updateStock, respondToBargain, advanceOrder, markAlertRead, markAllAlertsRead,
    }),
    [store, listings, allBargains, allOrders, allAlerts, unreadAlerts, listingsLoaded, listingsError, productById, addListing, setListingStatus, updateStock, respondToBargain, advanceOrder, markAlertRead, markAllAlertsRead],
  )

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>
}

export function useSeller() {
  const ctx = useContext(SellerContext)
  if (!ctx) throw new Error('useSeller must be used within SellerProvider')
  return ctx
}
