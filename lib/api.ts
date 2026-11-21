import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '')
const REALTIME_URL = new URL(API_BASE_URL).origin

export function connectRealtime(): Socket {
  return io(REALTIME_URL, {
    auth: (callback) => callback({ token: getAccessToken() }),
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  })
}

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

type CloudinaryUploadIntent = {
  uploadUrl: string
  resourceType: string
  uploadType: string
  publicId: string
  apiKey: string
  signature: string
  timestamp: number
  params: Record<string, string | number | boolean>
  maxBytes: number
}

export type UploadedMedia = {
  id: string
  purpose: string
  url: string | null
}

function normalizeContentType(contentType: string) {
  const normalized = contentType.split(';', 1)[0].trim().toLowerCase()
  if (!/^[a-zA-Z0-9/+.-]{3,100}$/.test(normalized)) {
    throw new Error('The selected file type is not supported.')
  }
  return normalized
}

export function createVoiceNoteFile(blob: Blob) {
  const contentType = normalizeContentType(blob.type || 'audio/webm')
  const extension = ({
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
  } as Record<string, string>)[contentType]
  if (!extension) throw new Error('This audio format is not supported. Please record a new voice note.')
  return new File([blob], `voice-note.${extension}`, { type: contentType })
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  {
    authenticated = true,
    accessToken: requestAccessToken,
  }: { authenticated?: boolean; accessToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = requestAccessToken ?? accessToken
  if (authenticated && token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  const text = await response.text()
  const payload: unknown = text ? JSON.parse(text) : undefined

  if (!response.ok) {
    const body = payload && typeof payload === 'object' ? (payload as { message?: unknown }) : undefined
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : typeof body?.message === 'string'
        ? body.message
        : 'The request could not be completed. Please try again.'
    throw new ApiError(message, response.status)
  }

  return payload as T
}

export async function uploadMedia(file: File, purpose: string): Promise<UploadedMedia> {
  if (!file.type) throw new Error('The selected file type could not be determined.')
  const contentType = normalizeContentType(file.type)

  const intent = await apiRequest<CloudinaryUploadIntent>('media/upload-intents', {
    method: 'POST',
    body: JSON.stringify({ purpose, contentType }),
  })
  if (file.size > intent.maxBytes) {
    throw new Error(`This file is too large. The maximum size is ${Math.floor(intent.maxBytes / (1024 * 1024))} MB.`)
  }

  const form = new FormData()
  const uploadFile = file.type === contentType
    ? file
    : new File([file], file.name, { type: contentType, lastModified: file.lastModified })
  form.append('file', uploadFile)
  form.append('api_key', intent.apiKey)
  form.append('signature', intent.signature)
  for (const [key, value] of Object.entries(intent.params)) {
    form.append(key, String(value))
  }

  const uploadResponse = await fetch(intent.uploadUrl, {
    method: 'POST',
    body: form,
  })
  const responseText = await uploadResponse.text()
  let uploaded: { public_id?: string; error?: { message?: string } } | undefined
  try {
    uploaded = responseText ? JSON.parse(responseText) as typeof uploaded : undefined
  } catch {
    throw new Error(`The upload service returned an unreadable response (HTTP ${uploadResponse.status}).`)
  }
  if (!uploadResponse.ok) {
    throw new Error(uploaded?.error?.message ?? `The upload service rejected the file (HTTP ${uploadResponse.status}).`)
  }
  if (uploaded?.public_id !== intent.publicId) {
    throw new Error('The uploaded file could not be verified. Please try again.')
  }

  return apiRequest<UploadedMedia>('media/finalize', {
    method: 'POST',
    body: JSON.stringify({ purpose, publicId: intent.publicId }),
  })
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed. Please try again.'
}

export type CatalogProductApi = {
  id: string
  slug: string
  name: string
  brand: string
  category: string
  seller: { id: string; slug: string; name: string; verified?: boolean; location?: string; rating?: number; reviews?: number }
  price: number
  compareAt?: number
  rating?: number
  reviews?: number
  sold?: number
  stock: number
  image: string
  gallery: string[]
  video?: string | null
  freeDelivery: boolean
  description: string
  highlights: string[]
  specs: Record<string, string>
  variants?: { id?: string; name: string; options: string[] }[]
  negotiable?: boolean
  condition?: string
  unitLabel?: string
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  minPrice?: number
  updatedAt?: string
}

export type PublicStoreApi = {
  id: string
  slug: string
  name: string
  tagline: string
  about: string
  location: string
  verified: boolean
  rating: number
  reviewCount: number
  logoUrl: string | null
  bannerUrl: string | null
  createdAt: string
  productCount: number
}

export async function getPublicStore(slug: string) {
  return apiRequest<PublicStoreApi>(`catalog/stores/${encodeURIComponent(slug)}`, { method: 'GET', cache: 'no-store' }, { authenticated: false })
}

export async function listPublicStoreProducts(slug: string, page = 1, limit = 24) {
  return apiRequest<{ items: CatalogProductApi[]; total: number; page: number; limit: number; pages: number }>(
    `catalog/stores/${encodeURIComponent(slug)}/products?page=${page}&limit=${limit}`,
    { method: 'GET', cache: 'no-store' },
    { authenticated: false },
  )
}

export type ApiOffer = {
  id: string
  buyerId: string
  buyer: { id: string; name: string }
  sellerId: string
  sellerName?: string
  productId: string
  product: { id: string; slug: string; name: string; image?: string }
  quantity: number
  listPrice: number
  offerPrice: number
  counterPrice?: number
  message?: string
  voiceNote?: { url: string; duration: number }
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 'withdrawn' | 'expired'
  createdAt: string
  respondedAt?: string
}

export type ApiMessage = {
  id: string
  senderId: string
  senderName: string
  from: 'buyer' | 'seller'
  text?: string
  offerId?: string
  mediaUrl?: string
  mediaResourceType?: string
  at: string
}

export type ApiConversation = {
  id: string
  kind: string
  productId: string | null
  product: { id: string; slug: string; name: string; price: number; image: string | null } | null
  sellerId?: string
  seller?: { id: string; name: string } | null
  otherParticipant?: { id: string; name: string } | null
  unread: number
  messages: ApiMessage[]
  updatedAt: string
}

export async function listPublicProducts(): Promise<CatalogProductApi[]> {
  const response = await apiRequest<{ items: CatalogProductApi[] }>('catalog/products?limit=100', { method: 'GET' })
  return response.items ?? []
}

export async function getPublicProduct(slug: string): Promise<CatalogProductApi> {
  return apiRequest<CatalogProductApi>(`catalog/products/${encodeURIComponent(slug)}`, { method: 'GET' })
}

export async function listSellerProducts(): Promise<CatalogProductApi[]> {
  const response = await apiRequest<{ items: CatalogProductApi[] }>('seller/products', { method: 'GET' })
  return response.items ?? []
}

export async function createSellerProduct(input: Record<string, unknown>) {
  return apiRequest<CatalogProductApi>('seller/products', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function listSellerDashboard() {
  return apiRequest<{ application?: unknown; store?: unknown }>('seller/dashboard', { method: 'GET' })
}

export async function listBuyerOffers() {
  return apiRequest<{ items: ApiOffer[] }>('offers', { method: 'GET' })
}

export async function createBuyerOffer(input: { productId: string; quantity: number; offerPrice: number; message?: string; mediaId?: string }) {
  return apiRequest<ApiOffer>('offers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function respondToOffer(offerId: string, input: { action: 'accept' | 'decline' | 'counter'; counterPrice?: number }) {
  return apiRequest<ApiOffer>(`offers/${encodeURIComponent(offerId)}/respond`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function listConversations() {
  return apiRequest<ApiConversation[]>('messages/conversations', { method: 'GET' })
}

export async function createConversation(input: { productId: string }) {
  return apiRequest<ApiConversation>('messages/conversations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function sendConversationMessage(conversationId: string, input: { text?: string; mediaId?: string; offerId?: string }) {
  return apiRequest<ApiMessage>(`messages/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function markConversationRead(conversationId: string) {
  return apiRequest<{ success: boolean }>(`messages/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'PATCH',
  })
}

export type ApiAddress = {
  id: string
  fullName: string
  phone: string
  line1: string
  city: string
  state: string
  country: string
  landmark: string | null
  label: 'Home' | 'Work' | 'Other'
  isDefault: boolean
  googlePlaceId: string | null
  area: string | null
}

export type AddressPrediction = { placeId: string; description: string }

export type ApiOrder = {
  id: string
  orderNumber: string
  status: string
  name?: string
  email?: string
  currency: string
  subtotal: number
  deliveryFee: number
  serviceFee: number
  total: number
  deliveryMethod: 'standard' | 'express' | 'pickup'
  address: Omit<ApiAddress, 'id' | 'isDefault' | 'googlePlaceId' | 'area'> & {
    latitude?: number | null
    longitude?: number | null
  }
  items: {
    id: string
    productId: string | null
    productName: string
    productSlug: string
    quantity: number
    unitPrice: number
    options: Record<string, string>
    seller: { id: string; name: string; slug: string }
  }[]
  payments: { id: string; reference: string; status: string; amount: number; authorizationUrl: string | null }[]
  shipment: { id?: string; sellerId?: string; status: string; method?: string | null; hub?: string | null; carrier?: string | null; waybill?: string | null; trackingUrl?: string | null } | null
  shipments?: { id?: string; sellerId?: string; sellerName?: string; status: string; method?: string | null; hub?: string | null; carrier?: string | null; waybill?: string | null; trackingUrl?: string | null }[]
  buyerConfirmedDeliveredAt?: string | null
  adminConfirmedDeliveredAt?: string | null
  paidAt?: string | null
  createdAt: string
}

export type CheckoutResult = {
  order: ApiOrder
  payment: {
    reference: string
    authorizationUrl: string | null
    amount: number
    currency: string
    status?: string
  }
}

export async function listAddresses() {
  return apiRequest<ApiAddress[]>('addresses', { method: 'GET' })
}

export async function searchAddressPlaces(input: string) {
  return apiRequest<AddressPrediction[]>(`addresses/places?input=${encodeURIComponent(input)}`, { method: 'GET' })
}

export async function saveAddress(input: {
  id?: string
  fullName: string
  phone: string
  googlePlaceId?: string
  line1?: string
  city?: string
  state?: string
  label: ApiAddress['label']
  landmark?: string
  isDefault?: boolean
}) {
  const { id, ...body } = input
  return apiRequest<ApiAddress>(id ? `addresses/${encodeURIComponent(id)}` : 'addresses', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  })
}

export async function setDefaultAddress(id: string) {
  return apiRequest<ApiAddress>(`addresses/${encodeURIComponent(id)}/default`, { method: 'PATCH' })
}

export async function deleteAddress(id: string) {
  return apiRequest<{ success: boolean }>(`addresses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getCart() {
  return apiRequest<{
    id?: string
    items: { id: string; productId: string; quantity: number; options: Record<string, string> }[]
    subtotal: number
  }>('cart', { method: 'GET' })
}

export async function putCartItem(input: { productId: string; quantity: number; options: Record<string, string> }) {
  return apiRequest<{
    id?: string
    items: { id: string; productId: string; quantity: number; options: Record<string, string> }[]
    subtotal: number
  }>('cart/items', { method: 'PUT', body: JSON.stringify(input) })
}

export async function deleteCartItem(id: string) {
  return apiRequest<{
    id?: string
    items: { id: string; productId: string; quantity: number; options: Record<string, string> }[]
    subtotal: number
  }>('cart/items/' + encodeURIComponent(id), { method: 'DELETE' })
}

export async function clearCart() {
  return apiRequest<{ success: boolean }>('cart', { method: 'DELETE' })
}

export async function checkoutOrder(input: {
  addressId: string
  deliveryMethod: 'standard' | 'express' | 'pickup'
  saveCard?: boolean
  savedPaymentMethodId?: string
}) {
  return apiRequest<CheckoutResult>('orders/checkout', { method: 'POST', body: JSON.stringify(input) })
}

export async function checkoutOpenMarketResponse(responseId: string, input: {
  addressId: string
  deliveryMethod: 'standard' | 'express' | 'pickup'
  saveCard?: boolean
  savedPaymentMethodId?: string
}) {
  return apiRequest<CheckoutResult>(`orders/open-market/${encodeURIComponent(responseId)}/checkout`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getOpenMarketCheckoutQuote(responseId: string, addressId: string, deliveryMethod: 'standard' | 'express' | 'pickup') {
  return apiRequest<{ subtotal: number; deliveryFee: number; serviceFee: number; total: number; currency: string }>(
    `orders/open-market/${encodeURIComponent(responseId)}/quote?addressId=${encodeURIComponent(addressId)}&deliveryMethod=${deliveryMethod}`,
    { method: 'GET' },
  )
}

export async function getCheckoutQuote(addressId: string, deliveryMethod: 'standard' | 'express' | 'pickup') {
  return apiRequest<{ subtotal: number; deliveryFee: number; serviceFee: number; total: number; currency: string }>(
    `orders/quote?addressId=${encodeURIComponent(addressId)}&deliveryMethod=${deliveryMethod}`,
    { method: 'GET' },
  )
}

export async function listOrders() {
  return apiRequest<{ items: ApiOrder[] }>('orders', { method: 'GET' })
}

export async function listSellerOrders() {
  return apiRequest<{ items: ApiOrder[] }>('orders/seller', { method: 'GET' })
}

export async function updateSellerOrderShipment(id: string, input: {
  status: 'PACKED' | 'HANDED_OVER' | 'IN_TRANSIT'
  method?: 'dropoff' | 'pickup'
  hub?: string
  carrier?: string
  waybill?: string
  trackingUrl?: string
}) {
  return apiRequest<{ id: string; status: string }>(`orders/${encodeURIComponent(id)}/shipment`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export type ShippingRate = {
  courierId: string
  courierName: string
  serviceCode: string
  serviceType: string
  total: number
  deliveryEta: string
  trackingLevel: string
}

export async function getSellerShippingRates(id: string, input: {
  packageWeightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}) {
  return apiRequest<{ requestToken: string; couriers: ShippingRate[] }>(`orders/${encodeURIComponent(id)}/shipping/rates`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export async function bookSellerShipping(id: string, input: { requestToken: string; courierId: string; serviceCode: string }) {
  return apiRequest<unknown>(`orders/${encodeURIComponent(id)}/shipping/book`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export async function getOrder(id: string) {
  return apiRequest<ApiOrder>(`orders/${encodeURIComponent(id)}`, { method: 'GET' })
}

export async function confirmOrderDelivery(id: string) {
  return apiRequest<{ success: boolean }>(`orders/${encodeURIComponent(id)}/confirm-delivery`, { method: 'POST' })
}

export async function verifyPayment(reference: string) {
  return apiRequest<{ reference: string; status: string }>(
    `payments/${encodeURIComponent(reference)}/verify`,
    { method: 'GET' },
    { authenticated: false },
  )
}

export async function submitPaymentOtp(reference: string, otp: string) {
  return apiRequest<{ reference: string; status: string; message?: string }>(
    `payments/${encodeURIComponent(reference)}/otp`,
    { method: 'POST', body: JSON.stringify({ otp }) },
  )
}

export async function submitPaymentChallenge(reference: string, type: 'otp' | 'pin' | 'phone' | 'birthday', value: string) {
  return apiRequest<{ reference: string; status: string; message?: string }>(
    `payments/${encodeURIComponent(reference)}/challenge`,
    { method: 'POST', body: JSON.stringify({ type, value }) },
  )
}

export type ApiSavedPaymentMethod = {
  id: string
  cardType: string | null
  last4: string
  expMonth: string
  expYear: string
  bank: string | null
}

export async function listSavedPaymentMethods() {
  return apiRequest<ApiSavedPaymentMethod[]>('payments/methods', { method: 'GET' })
}

export async function deleteSavedPaymentMethod(id: string) {
  return apiRequest<{ success: boolean }>(`payments/methods/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createWishlist(input: { name: string; note?: string; occasion: string; eventDate?: string }) {
  return apiRequest<ApiWishlist>('wishlists', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateWishlist(id: string, input: { name?: string; note?: string; occasion?: string; eventDate?: string }) {
  return apiRequest<ApiWishlist>(`wishlists/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteWishlist(id: string) {
  return apiRequest<{ success: boolean }>(`wishlists/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type ApiWishlist = {
  id: string
  name: string
  note: string
  occasion: string
  eventDate: string | null
  createdAt: string
  items: { id: string; productId: string; product?: { id: string; slug: string; name: string; price?: number } }[]
  gifts?: {
    giverName: string | null
    anonymous: boolean
    message: string | null
    reference: string
    createdAt: string
    items: { productId: string; quantity: number; amount: number }[]
  }[]
}

export async function listWishlists() {
  return apiRequest<ApiWishlist[]>('wishlists', { method: 'GET' })
}

export async function addWishlistItem(wishlistId: string, productId: string) {
  return apiRequest<ApiWishlist>(`wishlists/${encodeURIComponent(wishlistId)}/items/${encodeURIComponent(productId)}`, {
    method: 'POST',
  })
}

export async function removeWishlistItem(wishlistId: string, productId: string) {
  return apiRequest<{ success: boolean }>(`wishlists/${encodeURIComponent(wishlistId)}/items/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  })
}

export async function createWishlistShare(id: string) {
  return apiRequest<{ token: string }>(`wishlists/${encodeURIComponent(id)}/share`, { method: 'POST' })
}

export async function getSharedWishlist(token: string) {
  return apiRequest<{
    id: string
    name: string
    note: string
    occasion: string
    eventDate: string | null
    owner: { firstName: string; region: string | null }
    giftedProductIds: string[]
    items: {
      id: string
      product: { id: string; slug: string; name: string; price: number; stock: number; image: string | null }
    }[]
  }>(`wishlists/shared/${encodeURIComponent(token)}`, { method: 'GET' }, { authenticated: false })
}

export async function createGiftPayment(token: string, input: {
  email: string
  giverName?: string
  anonymous?: boolean
  message?: string
  items: { productId: string; quantity: number }[]
}) {
  return apiRequest<{
    orderId: string
    payment: { reference: string; authorizationUrl: string; amount: number; currency: string }
  }>(`wishlists/shared/${encodeURIComponent(token)}/contributions`, {
    method: 'POST',
    body: JSON.stringify(input),
  }, { authenticated: false })
}

export async function createSupportTicket(input: {
  orderId?: string
  name: string
  email: string
  topic: string
  message: string
}) {
  return apiRequest<{ id: string; ticketNumber: string; status: string; topic: string }>(
    'support/tickets',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export type ApiSupportTicket = {
  id: string
  ticketNumber: string
  name?: string
  email?: string
  topic: string
  status: string
  message?: string
  createdAt: string
  updatedAt?: string
  replies?: ApiSupportReply[]
}

export type ApiSupportReply = {
  id: string
  ticketId: string
  senderId: string | null
  body: string
  sender: { firstName: string; role: string } | null
  createdAt: string
}

export async function listSupportTickets() {
  return apiRequest<ApiSupportTicket[]>('support/tickets', { method: 'GET' })
}

export async function listAllSupportTickets() {
  return apiRequest<ApiSupportTicket[]>('support/tickets/admin', { method: 'GET' })
}

export async function getSupportTicket(id: string) {
  return apiRequest<ApiSupportTicket>(`support/tickets/${encodeURIComponent(id)}`, { method: 'GET' })
}

export async function updateSupportTicketStatus(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED') {
  return apiRequest<ApiSupportTicket>(`support/tickets/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function replyToSupportTicket(id: string, body: string) {
  return apiRequest<ApiSupportReply>(
    `support/tickets/${encodeURIComponent(id)}/replies`,
    { method: 'POST', body: JSON.stringify({ body }) },
  )
}

export type ApiNotification = {
  id: string
  type: string
  title: string
  body: string
  href: string | null
  readAt: string | null
  createdAt: string
}

export type ApiNotificationPreference = {
  type: string
  inApp: boolean
  email: boolean
  sms: boolean
}

export async function listNotifications() {
  return apiRequest<{ items: ApiNotification[]; unreadCount: number }>('notifications', { method: 'GET' })
}

export async function markNotificationRead(id: string) {
  return apiRequest<{ success: boolean }>(`notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
}

export async function markAllNotificationsRead() {
  return apiRequest<{ updated: number }>('notifications/read-all', { method: 'POST' })
}

export async function getNotificationPreferences() {
  return apiRequest<ApiNotificationPreference[]>('notifications/preferences', { method: 'GET' })
}

export async function updateNotificationPreference(input: ApiNotificationPreference) {
  return apiRequest<ApiNotificationPreference>('notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function listProductReviews(productId: string) {
  return apiRequest<{
    items: { id: string; rating: number; body: string | null; createdAt: string; reviewer: string }[]
  }>(`reviews/products/${encodeURIComponent(productId)}`, { method: 'GET' }, { authenticated: false })
}

export async function createProductReview(productId: string, input: { orderItemId: string; rating: number; body?: string }) {
  return apiRequest<{ id: string; rating: number; body: string | null; createdAt: string }>(
    `reviews/products/${encodeURIComponent(productId)}`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export type ApiMarketRequest = {
  id: string
  buyerId: string
  title: string
  description: string
  budgetMin: number
  budgetMax: number
  quantity: number
  location: string
  neededBy: string | null
  condition: 'new' | 'used' | 'any'
  image?: string
  status: string
  createdAt: string
  category: { slug: string; name: string }
  buyerName: string
  responseCount: number
}

export type ApiMarketResponse = {
  id: string
  requestId: string
  sellerId?: string
  isMine?: boolean
  seller: { id: string; slug: string; name: string; verified?: boolean; rating?: number }
  price: number
  deliveryDays: number
  note: string
  productId?: string | null
  product?: { id: string; slug: string; name: string } | null
  status: string
  createdAt: string
}

export async function getOpenMarketResponse(id: string) {
  return apiRequest<ApiMarketResponse & { request: ApiMarketRequest }>(
    `open-market/responses/${encodeURIComponent(id)}`,
    { method: 'GET' },
  )
}

export async function listOpenMarketRequests() {
  return apiRequest<{ items: ApiMarketRequest[] }>('open-market/requests', { method: 'GET' }, { authenticated: false })
}

export async function listMyOpenMarketRequests() {
  return apiRequest<{ items: ApiMarketRequest[] }>('open-market/requests/mine', { method: 'GET' })
}

export async function listMyOpenMarketResponses() {
  return apiRequest<{ items: ApiMarketResponse[] }>('open-market/responses/mine', { method: 'GET' })
}

export async function getOpenMarketRequest(id: string) {
  return apiRequest<ApiMarketRequest>(`open-market/requests/${encodeURIComponent(id)}`, { method: 'GET' }, { authenticated: false })
}

export async function listOpenMarketResponses(id: string) {
  return apiRequest<{ items: ApiMarketResponse[] }>(`open-market/requests/${encodeURIComponent(id)}/responses`, { method: 'GET' })
}

export async function createOpenMarketRequest(input: {
  categorySlug: string
  title: string
  description: string
  budgetMin: number
  budgetMax: number
  quantity: number
  location: string
  neededBy?: string
  condition: 'new' | 'used' | 'any'
  imageMediaId?: string
}) {
  return apiRequest<ApiMarketRequest>('open-market/requests', { method: 'POST', body: JSON.stringify(input) })
}

export async function createOpenMarketResponse(requestId: string, input: {
  price: number
  deliveryDays: number
  note: string
  productId?: string
}) {
  return apiRequest<ApiMarketResponse>(`open-market/requests/${encodeURIComponent(requestId)}/responses`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function acceptOpenMarketResponse(id: string) {
  return apiRequest<{ success: boolean }>(`open-market/responses/${encodeURIComponent(id)}/accept`, { method: 'PATCH' })
}

export async function declineOpenMarketResponse(id: string) {
  return apiRequest<{ success: boolean }>(`open-market/responses/${encodeURIComponent(id)}/decline`, { method: 'PATCH' })
}
