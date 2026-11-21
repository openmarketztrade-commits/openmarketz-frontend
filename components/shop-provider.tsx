'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { formatPrice, getSeller, type Product } from '@/lib/data'
import { useNotifications } from '@/components/notifications-provider'
import { useAuth } from '@/components/auth-provider'
import { useCatalogProducts } from '@/components/catalog-provider'
import {
  createBuyerOffer,
  createConversation,
  createWishlist,
  checkoutOrder,
  confirmOrderDelivery,
  connectRealtime,
  createVoiceNoteFile,
  deleteAddress,
  deleteCartItem,
  getAccessToken,
  getCheckoutQuote,
  getCart,
  getPublicProduct,
  listBuyerOffers,
  listConversations,
  listAddresses,
  listOrders,
  listWishlists,
  addWishlistItem,
  removeWishlistItem,
  markConversationRead,
  putCartItem,
  respondToOffer as respondToOfferApi,
  saveAddress as saveAddressApi,
  setDefaultAddress as setDefaultAddressApi,
  sendConversationMessage,
  uploadMedia,
  type ApiAddress,
  type ApiConversation,
  type ApiMessage,
  type ApiOrder,
  type ApiOffer,
  type CheckoutResult,
} from '@/lib/api'

export type CartItem = {
  key: string
  apiItemId?: string
  productId: string
  quantity: number
  options: Record<string, string>
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered'

export type Offer = {
  id: string
  productId: string
  sellerId: string
  listPrice: number
  offerPrice: number
  quantity: number
  message?: string
  voiceNote?: { url: string; duration: number; blob?: Blob }
  status: OfferStatus
  createdAt: number
  buyerId?: string
  buyerName?: string
  sellerName?: string
  role?: 'buyer' | 'seller'
  counterPrice?: number
  productSlug?: string
  productName?: string
  productImage?: string
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export type ChatMessage = {
  id: string
  from: 'buyer' | 'seller' | 'system'
  text?: string
  voiceNote?: { url: string; duration: number; blob?: Blob }
  image?: string
  offerId?: string
  status?: MessageStatus
  at: number
}

export type Conversation = {
  id: string
  sellerId: string
  productId: string
  messages: ChatMessage[]
  unread: number
  typing?: boolean
  sellerName?: string
  productName?: string
  productImage?: string
  productPrice?: number
}

type OutgoingMessage = Pick<ChatMessage, 'text' | 'voiceNote' | 'image'>

export type Address = {
  id: string
  fullName: string
  phone: string
  line1: string
  city: string
  state: string
  landmark?: string
  label: 'Home' | 'Work' | 'Other'
  googlePlaceId?: string
}

export type DeliveryMethod = 'standard' | 'express' | 'pickup'
export type PaymentMethod = 'paystack'

export type OrderStatus = 'placed' | 'confirmed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refunded'

export type Order = {
  id: string
  displayId?: string
  items: { id?: string; productId: string; quantity: number; unitPrice: number; options: Record<string, string> }[]
  address: Address
  delivery: DeliveryMethod
  payment: PaymentMethod
  shipment?: { id?: string; sellerId?: string; sellerName?: string; status: string; carrier?: string | null; waybill?: string | null; trackingUrl?: string | null } | null
  shipments?: { id?: string; sellerId?: string; sellerName?: string; status: string; carrier?: string | null; waybill?: string | null; trackingUrl?: string | null }[]
  buyerConfirmedDeliveredAt?: string | null
  paidAt?: string | null
  subtotal: number
  deliveryFee: number
  serviceFee: number
  total: number
  status: OrderStatus
  placedAt: number
}

type ShopContextValue = {
  cart: CartItem[]
  cartCount: number
  wishlist: Set<string>
  addToCart: (product: Product, quantity?: number, options?: Record<string, string>) => void
  updateQuantity: (key: string, quantity: number) => void
  removeFromCart: (key: string) => void
  toggleWishlist: (product: Product) => void
  priceFor: (product: Product) => number
  acceptedOfferFor: (productId: string) => Offer | undefined
  offers: Offer[]
  submitOffer: (input: Omit<Offer, 'id' | 'status' | 'createdAt' | 'sellerId' | 'listPrice'> & { product: Product }) => Promise<Offer>
  respondToOffer: (offerId: string, action: 'accept' | 'decline' | 'counter', counterPrice?: number) => Promise<void>
  conversations: Conversation[]
  openConversation: (product: Product) => Promise<string>
  sendMessage: (conversationId: string, message: OutgoingMessage) => Promise<void>
  retryMessage: (conversationId: string, messageId: string) => void
  markRead: (conversationId: string) => void
  addresses: Address[]
  saveAddress: (address: Omit<Address, 'id'> & { id?: string; isDefault?: boolean }) => Promise<Address>
  removeAddress: (id: string) => Promise<void>
  selectedAddressId: string | null
  setSelectedAddressId: (id: string) => void
  delivery: DeliveryMethod
  setDelivery: (method: DeliveryMethod) => void
  orders: Order[]
  checkoutQuote: Awaited<ReturnType<typeof getCheckoutQuote>> | null
  checkoutQuoteReady: boolean
  checkout: (options?: { saveCard?: boolean; savedPaymentMethodId?: string }) => Promise<CheckoutResult>
  refreshOrders: () => Promise<void>
  confirmDelivery: (orderId: string) => Promise<void>
}

const ShopContext = createContext<ShopContextValue | null>(null)

export const deliveryOptions: Record<DeliveryMethod, { label: string; eta: string; fee: number }> = {
  standard: { label: 'Standard delivery', eta: '3–5 business days', fee: 1500 },
  express: { label: 'Express delivery', eta: '1–2 business days', fee: 3500 },
  pickup: { label: 'Pickup station', eta: 'Ready in 2–4 days', fee: 800 },
}

export const SERVICE_FEE_RATE = 0.015
export const FREE_DELIVERY_THRESHOLD = 50000

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`
const cartKey = (productId: string, options: Record<string, string>) =>
  `${productId}::${Object.entries(options).sort().map(([k, v]) => `${k}=${v}`).join('|')}`

function mapAddress(address: ApiAddress): Address {
  return {
    id: address.id,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    city: address.city,
    state: address.state,
    landmark: address.landmark ?? undefined,
    label: address.label,
    googlePlaceId: address.googlePlaceId ?? undefined,
  }
}

function mapOrder(order: ApiOrder): Order {
  const statuses: Record<string, OrderStatus> = {
    PENDING_PAYMENT: 'placed',
    PAYMENT_FAILED: 'placed',
    CONFIRMED: 'confirmed',
    PROCESSING: 'confirmed',
    SHIPPED: 'shipped',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
  }
  const address = order.address
  return {
    id: order.id,
    displayId: order.orderNumber,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId ?? item.productSlug,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      options: item.options,
    })),
    address: {
      id: '',
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      city: address.city,
      state: address.state,
      landmark: address.landmark ?? undefined,
      label: 'Home',
    },
    delivery: order.deliveryMethod,
    payment: 'paystack',
    shipment: order.shipment,
    shipments: order.shipments,
    buyerConfirmedDeliveredAt: order.buyerConfirmedDeliveredAt,
    paidAt: order.paidAt,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    serviceFee: order.serviceFee,
    total: order.total,
    status: statuses[order.status] ?? 'placed',
    placedAt: new Date(order.createdAt).getTime(),
  }
}

function mapCartItems(items: Awaited<ReturnType<typeof getCart>>['items']): CartItem[] {
  return items.map((item) => ({
    key: cartKey(item.productId, item.options),
    apiItemId: item.id,
    productId: item.productId,
    quantity: item.quantity,
    options: item.options,
  }))
}

function mapApiOffer(offer: ApiOffer, userId: string): Offer {
  return {
    id: offer.id,
    productId: offer.productId,
    sellerId: offer.sellerId,
    buyerId: offer.buyerId,
    buyerName: offer.buyer.name,
    sellerName: offer.sellerName,
    role: offer.buyerId === userId ? 'buyer' : 'seller',
    listPrice: offer.listPrice,
    offerPrice: offer.offerPrice,
    counterPrice: offer.counterPrice,
    quantity: offer.quantity,
    message: offer.message,
    voiceNote: offer.voiceNote,
    status: offer.status === 'expired' || offer.status === 'withdrawn' ? 'declined' : offer.status,
    createdAt: new Date(offer.createdAt).getTime(),
    productSlug: offer.product.slug,
    productName: offer.product.name,
    productImage: offer.product.image,
  }
}

function mapApiMessage(message: ApiMessage): ChatMessage {
  const mediaUrl = message.mediaUrl
  return {
    id: message.id,
    from: message.from,
    text: message.text,
    offerId: message.offerId,
    voiceNote: mediaUrl && message.mediaResourceType === 'raw' ? { url: mediaUrl, duration: 0 } : undefined,
    image: mediaUrl && message.mediaResourceType !== 'raw' ? mediaUrl : undefined,
    at: new Date(message.at).getTime(),
    status: 'sent',
  }
}

function mapApiConversation(conversation: ApiConversation, isSeller: boolean): Conversation {
  return {
    id: conversation.id,
    sellerId: conversation.sellerId ?? '',
    productId: conversation.productId ?? '',
    sellerName: isSeller
      ? conversation.otherParticipant?.name ?? conversation.seller?.name
      : conversation.seller?.name ?? conversation.otherParticipant?.name,
    productName: conversation.product?.name,
    productImage: conversation.product?.image ?? undefined,
    productPrice: conversation.product?.price,
    unread: conversation.unread,
    messages: conversation.messages.map(mapApiMessage),
  }
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth()
  const { products } = useCatalogProducts()
  const [cart, setCart] = useState<CartItem[]>([])
  const [wishlist, setWishlist] = useState<Set<string>>(new Set())
  const [wishlistId, setWishlistId] = useState<string | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const { notify } = useNotifications()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressIdState] = useState<string | null>(null)
  const [delivery, setDelivery] = useState<DeliveryMethod>('standard')
  const [orders, setOrders] = useState<Order[]>([])
  const [checkoutQuote, setCheckoutQuote] = useState<Awaited<ReturnType<typeof getCheckoutQuote>> | null>(null)
  const [checkoutQuoteReady, setCheckoutQuoteReady] = useState(false)
  const offersRef = useRef(offers)
  offersRef.current = offers
  const cartRef = useRef(cart)
  cartRef.current = cart
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const realtimeRef = useRef<Socket | null>(null)
  const isSeller = user?.seller?.status === 'approved'

  const setSelectedAddressId = useCallback((id: string) => {
    setSelectedAddressIdState(id)
    if (user) {
      void setDefaultAddressApi(id).catch((error) => {
        toast.error(error instanceof Error ? error.message : 'The default address could not be updated.')
      })
    }
  }, [user])

  const refreshOrders = useCallback(async () => {
    if (!user) return
    const response = await listOrders()
    setOrders(response.items.map(mapOrder))
  }, [user])

  useEffect(() => {
    if (!user || !selectedAddressId || cart.length === 0) {
      setCheckoutQuote(null)
      setCheckoutQuoteReady(true)
      return
    }
    let active = true
    setCheckoutQuoteReady(false)
    void getCheckoutQuote(selectedAddressId, delivery)
      .then((quote) => {
        if (active) setCheckoutQuote(quote)
      })
      .catch((error) => {
        if (!active) return
        setCheckoutQuote(null)
        console.error('Unable to calculate checkout totals.', error)
      })
      .finally(() => {
        if (active) setCheckoutQuoteReady(true)
      })
    return () => { active = false }
  }, [cart, delivery, selectedAddressId, user])

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      setAddresses([])
      setSelectedAddressIdState(null)
      setOrders([])
      setWishlistId(null)
      setWishlist(new Set())
      return
    }

    let active = true
    const localCart = cartRef.current
    void (async () => {
      try {
        if (localCart.length) {
          await Promise.all(localCart.map((item) => putCartItem({
            productId: item.productId,
            quantity: item.quantity,
            options: item.options,
          })))
        }
        const [remoteCart, remoteAddresses, remoteOrders, remoteWishlists] = await Promise.all([
          getCart(),
          listAddresses(),
          listOrders(),
          listWishlists(),
        ])
        if (!active) return
        setCart(mapCartItems(remoteCart.items))
        const mappedAddresses = remoteAddresses.map(mapAddress)
        setAddresses(mappedAddresses)
        setSelectedAddressIdState(remoteAddresses.find((address) => address.isDefault)?.id ?? null)
        setOrders(remoteOrders.items.map(mapOrder))
        const defaultWishlist = remoteWishlists[0]
        setWishlistId(defaultWishlist?.id ?? null)
        setWishlist(new Set(defaultWishlist?.items.map((item) => item.productId) ?? []))
      } catch (error) {
        console.error('Unable to load account commerce data.', error)
        if (active) toast.error(error instanceof Error ? error.message : 'Your saved commerce data could not be loaded.')
      }
    })()
    return () => {
      active = false
    }
  }, [authReady, user])

  const refreshNegotiations = useCallback(async (showError = true) => {
    if (!user) return
    try {
      const [offerResponse, conversationResponse] = await Promise.all([
        listBuyerOffers(),
        listConversations(),
      ])
      const nextOffers = offerResponse.items.map((offer) => mapApiOffer(offer, user.id))
      const nextConversations = conversationResponse.map((conversation) => mapApiConversation(conversation, isSeller))
      setOffers(nextOffers)
      setConversations(nextConversations)
      const socket = realtimeRef.current
      if (socket?.connected) {
        for (const conversation of nextConversations) {
          socket.emit('conversation:join', { conversationId: conversation.id })
        }
      }
    } catch (error) {
      console.error('Unable to load marketplace offers and conversations.', error)
      if (showError) {
        toast.error(error instanceof Error ? error.message : 'Your offers and messages could not be loaded.')
      }
    }
  }, [isSeller, user])

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      realtimeRef.current?.disconnect()
      realtimeRef.current = null
      setOffers([])
      setConversations([])
      return
    }
    void refreshNegotiations()

    const token = getAccessToken()
    if (!token) return

    const socket = connectRealtime()
    realtimeRef.current = socket
    const joinLoadedConversations = () => {
      for (const conversation of conversationsRef.current) {
        socket.emit('conversation:join', { conversationId: conversation.id })
      }
    }
    const onMessage = (message: ApiMessage & { conversationId: string }) => {
      const mapped = mapApiMessage(message)
      setConversations((previous) => {
        const found = previous.some((conversation) => conversation.id === message.conversationId)
        if (!found) {
          void refreshNegotiations(false)
          return previous
        }
        return previous.map((conversation) =>
          conversation.id !== message.conversationId
            ? conversation
            : conversation.messages.some((item) => item.id === mapped.id)
              ? conversation
              : {
                  ...conversation,
                  unread: mapped.from === (isSeller ? 'buyer' : 'seller')
                    ? conversation.unread + 1
                    : conversation.unread,
                  messages: [...conversation.messages, mapped],
                },
        )
      })
    }
    const onOffer = (offer: ApiOffer) => {
      const mapped = mapApiOffer(offer, user.id)
      setOffers((previous) => [
        mapped,
        ...previous.filter((item) => item.id !== mapped.id),
      ])
    }
    const onConversationAvailable = () => {
      void refreshNegotiations(false)
    }
    const onConversationRead = (event: { conversationId: string; userId: string }) => {
      if (event.userId === user.id) return
      const ownRole = isSeller ? 'seller' : 'buyer'
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id !== event.conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.from === ownRole && message.status !== 'failed'
                    ? { ...message, status: 'read' }
                    : message,
                ),
              },
        ),
      )
    }

    socket.on('connect', joinLoadedConversations)
    socket.on('message:new', onMessage)
    socket.on('offer:updated', onOffer)
    socket.on('conversation:available', onConversationAvailable)
    socket.on('conversation:read', onConversationRead)
    socket.on('connect_error', (error: Error) => {
      console.error('Realtime connection failed.', error.message)
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      if (realtimeRef.current === socket) realtimeRef.current = null
    }
  }, [authReady, user, isSeller, refreshNegotiations])

  const requireSignIn = useCallback(() => {
    if (user) return
    toast.error('Sign in to contact sellers or make an offer.')
    throw new Error('Sign in to continue.')
  }, [user])

  const resolveApiProduct = useCallback(async (product: Product) => {
    const apiProduct = await getPublicProduct(product.slug)
    return apiProduct
  }, [])

  const acceptedOfferFor = useCallback(
    (productId: string) =>
      offers
        .filter((o) => {
          const productSlug = products.find((product) => product.id === productId)?.slug
          return (
            o.role !== 'seller' &&
            (o.productId === productId || (!!productSlug && o.productSlug === productSlug)) &&
            o.status === 'accepted'
          )
        })
        .sort((a, b) => b.createdAt - a.createdAt)[0],
    [offers, products],
  )

  const priceFor = useCallback(
    (product: Product) => acceptedOfferFor(product.id)?.offerPrice ?? product.price,
    [acceptedOfferFor],
  )

  const addToCart = useCallback((product: Product, quantity = 1, options: Record<string, string> = {}) => {
    const key = cartKey(product.id, options)
    const existing = cart.find((item) => item.key === key)
    const nextQuantity = Math.min(product.stock, (existing?.quantity ?? 0) + quantity)
    setCart((prev) => {
      return existing
        ? prev.map((item) => (item.key === key ? { ...item, quantity: nextQuantity } : item))
        : [...prev, { key, productId: product.id, quantity: nextQuantity, options }]
    })
    if (user) {
      void putCartItem({ productId: product.id, quantity: nextQuantity, options })
        .then((response) => setCart(mapCartItems(response.items)))
        .catch((error) => toast.error(error instanceof Error ? error.message : 'The item could not be saved to your cart.'))
    }
    toast.success('Added to cart', { description: product.name, action: { label: 'View cart', onClick: () => (window.location.href = '/cart') } })
  }, [cart, user])

  const updateQuantity = useCallback((key: string, quantity: number) => {
    let updatedItem: CartItem | undefined
    setCart((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i
        const stock = products.find((p) => p.id === i.productId)?.stock ?? 1
        updatedItem = { ...i, quantity: Math.max(1, Math.min(stock, quantity)) }
        return updatedItem
      }),
    )
    if (user && updatedItem) {
      void putCartItem({
        productId: updatedItem.productId,
        quantity: updatedItem.quantity,
        options: updatedItem.options,
      }).then((response) => setCart(mapCartItems(response.items)))
        .catch((error) => toast.error(error instanceof Error ? error.message : 'The cart quantity could not be updated.'))
    }
  }, [products, user])

  const removeFromCart = useCallback((key: string) => {
    const item = cart.find((entry) => entry.key === key)
    setCart((prev) => prev.filter((i) => i.key !== key))
    if (user && item?.apiItemId) {
      void deleteCartItem(item.apiItemId)
        .then((response) => setCart(mapCartItems(response.items)))
        .catch((error) => toast.error(error instanceof Error ? error.message : 'The cart item could not be removed.'))
    }
  }, [cart, user])

  const toggleWishlist = useCallback((product: Product) => {
    const removing = wishlist.has(product.id)
    setWishlist((prev) => {
      const next = new Set(prev)
      if (next.has(product.id)) {
        next.delete(product.id)
        toast('Removed from wishlist', { description: product.name })
      } else {
        next.add(product.id)
        toast.success('Saved to wishlist', { description: product.name })
      }
      return next
    })
    if (user) {
      void (async () => {
        let currentWishlistId = wishlistId
        if (!currentWishlistId) {
          const created = await createWishlist({ name: 'Saved items', occasion: 'just-because' })
          currentWishlistId = created.id
          setWishlistId(created.id)
        }
        if (removing) await removeWishlistItem(currentWishlistId, product.id)
        else await addWishlistItem(currentWishlistId, product.id)
      })().catch((error) => {
        setWishlist((previous) => {
          const next = new Set(previous)
          if (removing) next.add(product.id)
          else next.delete(product.id)
          return next
        })
        toast.error(error instanceof Error ? error.message : 'The wishlist could not be updated.')
      })
    }
  }, [user, wishlist, wishlistId])

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations((prev) => [
      conversation,
      ...prev.filter((item) => item.id !== conversation.id),
    ])
  }, [])

  const openConversation = useCallback(
    async (product: Product) => {
      requireSignIn()
      const apiProduct = await resolveApiProduct(product)
      const existing = conversations.find((conversation) => conversation.productId === apiProduct.id)
      if (existing) return existing.id

      const created = await createConversation({ productId: apiProduct.id })
      const mapped = mapApiConversation(created, isSeller)
      upsertConversation(mapped)
      return mapped.id
    },
    [conversations, requireSignIn, resolveApiProduct, upsertConversation, user],
  )

  const patchConversation = useCallback((conversationId: string, fn: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? fn(c) : c)))
  }, [])

  const setStatus = useCallback(
    (conversationId: string, messageId: string, status: MessageStatus) =>
      patchConversation(conversationId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId ? { ...m, status } : m)),
      })),
    [patchConversation],
  )

  const sendMessage = useCallback(
    async (conversationId: string, message: OutgoingMessage) => {
      const id = uid('msg')
      try {
        requireSignIn()
      } catch {
        return
      }
      patchConversation(conversationId, (c) => ({
        ...c,
        messages: [...c.messages, { ...message, from: isSeller ? 'seller' : 'buyer', id, status: 'sending', at: Date.now() }],
      }))
      try {
        let mediaId: string | undefined
        if (message.voiceNote?.blob) {
          mediaId = (await uploadMedia(createVoiceNoteFile(message.voiceNote.blob), 'MESSAGE')).id
        }
        if (message.image) {
          throw new Error('Image messages are not available yet. Send text or a voice note instead.')
        }
        const sent = await sendConversationMessage(conversationId, {
          text: message.text,
          mediaId,
        })
        patchConversation(conversationId, (conversation) => ({
          ...conversation,
          messages: [
            ...conversation.messages.filter((item) => item.id !== id && item.id !== sent.id),
            mapApiMessage(sent),
          ],
        }))
      } catch (error) {
        setStatus(conversationId, id, 'failed')
        toast.error(error instanceof Error ? error.message : 'Your message could not be sent.')
      }
    },
    [isSeller, patchConversation, requireSignIn, setStatus],
  )

  const retryMessage = useCallback(
    (conversationId: string, messageId: string) => {
      const message = conversations.find((item) => item.id === conversationId)?.messages.find((item) => item.id === messageId)
      if (!message) return
      patchConversation(conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.filter((item) => item.id !== messageId),
      }))
      void sendMessage(conversationId, { text: message.text, voiceNote: message.voiceNote, image: message.image })
    },
    [conversations, patchConversation, sendMessage],
  )

  const markRead = useCallback(async (conversationId: string) => {
    setConversations((prev) => prev.map((c) => (c.id === conversationId && c.unread ? { ...c, unread: 0 } : c)))
    try {
      await markConversationRead(conversationId)
    } catch (error) {
      console.error('Unable to mark the conversation as read.', error)
    }
  }, [])

  const submitOffer: ShopContextValue['submitOffer'] = useCallback(
    async ({ product, ...input }) => {
      requireSignIn()
      const apiProduct = await resolveApiProduct(product)
      let mediaId: string | undefined
      if (input.voiceNote?.blob) {
        mediaId = (await uploadMedia(createVoiceNoteFile(input.voiceNote.blob), 'MESSAGE')).id
      }
      const created = await createBuyerOffer({
        productId: apiProduct.id,
        quantity: input.quantity,
        offerPrice: input.offerPrice,
        message: input.message,
        mediaId,
      })
      const offer = mapApiOffer(created, user!.id)
      if (input.voiceNote && !offer.voiceNote) offer.voiceNote = input.voiceNote
      setOffers((prev) => [offer, ...prev.filter((item) => item.id !== offer.id)])
      const conversation = await createConversation({ productId: apiProduct.id })
      upsertConversation(mapApiConversation(conversation, isSeller))
      toast.success('Offer sent to seller', { description: 'You will be notified when they respond.' })
      return offer
    },
    [isSeller, requireSignIn, resolveApiProduct, upsertConversation, user],
  )

  const respondToOffer = useCallback(
    async (offerId: string, action: 'accept' | 'decline' | 'counter', counterPrice?: number) => {
      const offer = offersRef.current.find((o) => o.id === offerId)
      if (!offer) return
      try {
        const response = await respondToOfferApi(offerId, { action, counterPrice })
        const mapped = mapApiOffer(response, user?.id ?? '')
        setOffers((prev) => prev.map((item) => (item.id === offerId ? mapped : item)))
        const conversations = await listConversations()
        if (user) {
          for (const conversation of conversations) upsertConversation(mapApiConversation(conversation, isSeller))
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The offer could not be updated.')
        throw error
      }
      const product = products.find((p) => p.id === offer.productId || p.slug === offer.productSlug)
      const seller = getSeller(offer.sellerId)
      if (action === 'accept') {
        toast.success(`${seller?.name ?? 'Seller'} accepted your offer`, {
          description: `${product?.name ?? offer.productName ?? 'Item'} offer was accepted.`,
        })
      } else if (action === 'decline') {
        toast(`${seller?.name ?? 'Seller'} declined your offer`, { description: product?.name ?? offer.productName })
      }
      if (action !== 'counter') {
        notify({
          type: 'offer',
          title: action === 'accept' ? `Offer accepted by ${seller?.name ?? 'seller'}` : `Offer declined by ${seller?.name ?? 'seller'}`,
          body: action === 'accept'
            ? `${product?.name ?? offer.productName ?? 'Your item'} offer was accepted at ${formatPrice(offer.offerPrice)}.`
            : `${product?.name ?? offer.productName ?? 'Your item'} — you can send a new offer anytime.`,
          href: '/offers',
        })
      }
    },
    [isSeller, notify, products, upsertConversation, user],
  )

  const saveAddress: ShopContextValue['saveAddress'] = useCallback(async (input) => {
    requireSignIn()
    const saved = await saveAddressApi({
      id: input.id,
      fullName: input.fullName,
      phone: input.phone,
      googlePlaceId: input.googlePlaceId,
      line1: input.line1,
      city: input.city,
      state: input.state,
      label: input.label,
      landmark: input.landmark,
      isDefault: input.isDefault ?? !input.id,
    })
    const address = mapAddress(saved)
    setAddresses((prev) => prev.some((item) => item.id === address.id)
      ? prev.map((item) => item.id === address.id ? address : item)
      : [...prev, address])
    setSelectedAddressIdState(address.id)
    return address
  }, [requireSignIn])

  const removeAddress = useCallback(async (id: string) => {
    requireSignIn()
    await deleteAddress(id)
    setAddresses((prev) => prev.filter((address) => address.id !== id))
    setSelectedAddressIdState((current) => current === id ? null : current)
  }, [requireSignIn])

  const checkout = useCallback(async (options?: { saveCard?: boolean; savedPaymentMethodId?: string }) => {
    requireSignIn()
    if (!selectedAddressId) throw new Error('Choose a delivery address before checkout.')
    if (cart.length === 0) throw new Error('Your cart is empty.')
    const result = await checkoutOrder({
      addressId: selectedAddressId,
      deliveryMethod: delivery,
      ...options,
    })
    setCart([])
    setOrders((prev) => [mapOrder(result.order), ...prev.filter((order) => order.id !== result.order.id)])
    return result
  }, [cart, delivery, requireSignIn, selectedAddressId])

  const confirmDelivery = useCallback(async (orderId: string) => {
    await confirmOrderDelivery(orderId)
    await refreshOrders()
  }, [refreshOrders])

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const value = useMemo<ShopContextValue>(
    () => ({
      cart, cartCount, wishlist, addToCart, updateQuantity, removeFromCart, toggleWishlist,
      priceFor, acceptedOfferFor, offers, submitOffer, respondToOffer,
      conversations, openConversation, sendMessage, retryMessage, markRead,
      addresses, saveAddress, removeAddress, selectedAddressId, setSelectedAddressId, delivery, setDelivery,
      orders, checkout, refreshOrders, confirmDelivery, checkoutQuote, checkoutQuoteReady,
    }),
    [
      cart, cartCount, wishlist, addToCart, updateQuantity, removeFromCart, toggleWishlist,
      priceFor, acceptedOfferFor, offers, submitOffer, respondToOffer,
      conversations, openConversation, sendMessage, retryMessage, markRead,
      addresses, saveAddress, removeAddress, selectedAddressId, setSelectedAddressId, delivery, orders, checkout, refreshOrders,
      confirmDelivery, checkoutQuote, checkoutQuoteReady,
    ],
  )

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used within ShopProvider')
  return ctx
}

export function useCartTotals() {
  const { cart, priceFor, delivery, checkoutQuote, checkoutQuoteReady } = useShop()
  const { products } = useCatalogProducts()
  const lines = cart.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId)
    return product ? [{ item, product, unitPrice: priceFor(product) }] : []
  })
  const localSubtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.item.quantity, 0)
  const listSubtotal = lines.reduce((sum, l) => sum + (l.product.compareAt ?? l.product.price) * l.item.quantity, 0)
  const subtotal = checkoutQuote?.subtotal ?? localSubtotal
  const freeDelivery = checkoutQuote ? checkoutQuote.deliveryFee === 0 : subtotal >= FREE_DELIVERY_THRESHOLD && delivery === 'standard'
  const deliveryFee = checkoutQuote?.deliveryFee ?? (lines.length === 0 ? 0 : freeDelivery ? 0 : deliveryOptions[delivery].fee)
  const serviceFee = checkoutQuote?.serviceFee ?? Math.round(subtotal * SERVICE_FEE_RATE)
  const total = checkoutQuote?.total ?? subtotal + deliveryFee + serviceFee
  return {
    lines,
    subtotal,
    savings: Math.max(0, listSubtotal - subtotal),
    deliveryFee,
    serviceFee,
    total,
    freeDelivery,
    remainingForFree: Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal),
    quoteReady: checkoutQuoteReady,
  }
}
