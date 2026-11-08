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
  connectRealtime,
  getAccessToken,
  getPublicProduct,
  listBuyerOffers,
  listConversations,
  markConversationRead,
  respondToOffer as respondToOfferApi,
  sendConversationMessage,
  uploadMedia,
  type ApiConversation,
  type ApiMessage,
  type ApiOffer,
} from '@/lib/api'

export type CartItem = {
  key: string
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
}

export type DeliveryMethod = 'standard' | 'express' | 'pickup'
export type PaymentMethod = 'card' | 'transfer' | 'ussd' | 'pod'

export type OrderStatus = 'placed' | 'confirmed' | 'shipped' | 'out_for_delivery' | 'delivered'

export type Order = {
  id: string
  items: { productId: string; quantity: number; unitPrice: number; options: Record<string, string> }[]
  address: Address
  delivery: DeliveryMethod
  payment: PaymentMethod
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
  saveAddress: (address: Omit<Address, 'id'> & { id?: string }) => Address
  removeAddress: (id: string) => void
  selectedAddressId: string | null
  setSelectedAddressId: (id: string) => void
  delivery: DeliveryMethod
  setDelivery: (method: DeliveryMethod) => void
  orders: Order[]
  placeOrder: (payment: PaymentMethod) => Order | null
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

const demoAddress: Address = {
  id: 'addr_home',
  fullName: 'Adaeze Okafor',
  phone: '0803 123 4567',
  line1: '14 Admiralty Way, Lekki Phase 1',
  city: 'Lekki',
  state: 'Lagos',
  landmark: 'Opposite Mega Plaza',
  label: 'Home',
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
  const [offers, setOffers] = useState<Offer[]>([])
  const { notify } = useNotifications()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [addresses, setAddresses] = useState<Address[]>([demoAddress])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(demoAddress.id)
  const [delivery, setDelivery] = useState<DeliveryMethod>('standard')
  const [orders, setOrders] = useState<Order[]>([])
  const offersRef = useRef(offers)
  offersRef.current = offers
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const realtimeRef = useRef<Socket | null>(null)
  const isSeller = user?.seller?.status === 'approved'

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
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key)
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(product.stock, i.quantity + quantity) } : i))
      }
      return [...prev, { key, productId: product.id, quantity: Math.min(product.stock, quantity), options }]
    })
    toast.success('Added to cart', { description: product.name, action: { label: 'View cart', onClick: () => (window.location.href = '/cart') } })
  }, [products])

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i
        const stock = products.find((p) => p.id === i.productId)?.stock ?? 1
        return { ...i, quantity: Math.max(1, Math.min(stock, quantity)) }
      }),
    )
  }, [products])

  const removeFromCart = useCallback((key: string) => {
    setCart((prev) => prev.filter((i) => i.key !== key))
  }, [])

  const toggleWishlist = useCallback((product: Product) => {
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
  }, [])

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
          const voiceFile = new File([message.voiceNote.blob], 'voice-note.webm', {
            type: message.voiceNote.blob.type || 'audio/webm',
          })
          mediaId = (await uploadMedia(voiceFile, 'MESSAGE')).id
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
        const voiceFile = new File([input.voiceNote.blob], 'offer-voice-note.webm', {
          type: input.voiceNote.blob.type || 'audio/webm',
        })
        mediaId = (await uploadMedia(voiceFile, 'MESSAGE')).id
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

  const saveAddress: ShopContextValue['saveAddress'] = useCallback((input) => {
    const address: Address = { ...input, id: input.id ?? uid('addr') }
    setAddresses((prev) => (prev.some((a) => a.id === address.id) ? prev.map((a) => (a.id === address.id ? address : a)) : [...prev, address]))
    setSelectedAddressId(address.id)
    return address
  }, [])

  const removeAddress = useCallback((id: string) => {
    setAddresses((prev) => {
      const next = prev.filter((a) => a.id !== id)
      setSelectedAddressId((current) => (current === id ? (next[0]?.id ?? null) : current))
      return next
    })
  }, [])

  const placeOrder = useCallback(
    (payment: PaymentMethod) => {
      const address = addresses.find((a) => a.id === selectedAddressId)
      if (!address || cart.length === 0) return null
      const items = cart.flatMap((i) => {
        const product = products.find((p) => p.id === i.productId)
        return product ? [{ productId: i.productId, quantity: i.quantity, unitPrice: priceFor(product), options: i.options }] : []
      })
      const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD && delivery === 'standard' ? 0 : deliveryOptions[delivery].fee
      const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE)
      const order: Order = {
        id: `OMZ-${Math.floor(10000 + Math.random() * 89999)}`,
        items,
        address,
        delivery,
        payment,
        subtotal,
        deliveryFee,
        serviceFee,
        total: subtotal + deliveryFee + serviceFee,
        status: payment === 'transfer' ? 'placed' : 'confirmed',
        placedAt: Date.now(),
      }
      setOrders((prev) => [order, ...prev])
      setCart([])
      notify({
        type: 'order',
        title: `Order ${order.id} placed`,
        body: payment === 'transfer' ? 'We will confirm your order once your transfer is received.' : `Payment confirmed. Total ${formatPrice(order.total)}.`,
        href: `/orders/${order.id}`,
      })
      return order
    },
    [addresses, selectedAddressId, cart, delivery, priceFor, notify, products],
  )

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const value = useMemo<ShopContextValue>(
    () => ({
      cart, cartCount, wishlist, addToCart, updateQuantity, removeFromCart, toggleWishlist,
      priceFor, acceptedOfferFor, offers, submitOffer, respondToOffer,
      conversations, openConversation, sendMessage, retryMessage, markRead,
      addresses, saveAddress, removeAddress, selectedAddressId, setSelectedAddressId, delivery, setDelivery,
      orders, placeOrder,
    }),
    [
      cart, cartCount, wishlist, addToCart, updateQuantity, removeFromCart, toggleWishlist,
      priceFor, acceptedOfferFor, offers, submitOffer, respondToOffer,
      conversations, openConversation, sendMessage, retryMessage, markRead,
      addresses, saveAddress, removeAddress, selectedAddressId, delivery, orders, placeOrder,
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
  const { cart, priceFor, delivery } = useShop()
  const { products } = useCatalogProducts()
  const lines = cart.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId)
    return product ? [{ item, product, unitPrice: priceFor(product) }] : []
  })
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.item.quantity, 0)
  const listSubtotal = lines.reduce((sum, l) => sum + (l.product.compareAt ?? l.product.price) * l.item.quantity, 0)
  const freeDelivery = subtotal >= FREE_DELIVERY_THRESHOLD && delivery === 'standard'
  const deliveryFee = lines.length === 0 ? 0 : freeDelivery ? 0 : deliveryOptions[delivery].fee
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE)
  return {
    lines,
    subtotal,
    savings: Math.max(0, listSubtotal - subtotal),
    deliveryFee,
    serviceFee,
    total: subtotal + deliveryFee + serviceFee,
    freeDelivery,
    remainingForFree: Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal),
  }
}
