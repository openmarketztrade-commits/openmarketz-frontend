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

  const intent = await apiRequest<CloudinaryUploadIntent>('media/upload-intents', {
    method: 'POST',
    body: JSON.stringify({ purpose, contentType: file.type }),
  })
  if (file.size > intent.maxBytes) {
    throw new Error(`This file is too large. The maximum size is ${Math.floor(intent.maxBytes / (1024 * 1024))} MB.`)
  }

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', intent.apiKey)
  form.append('signature', intent.signature)
  for (const [key, value] of Object.entries(intent.params)) {
    form.append(key, String(value))
  }

  const uploadResponse = await fetch(intent.uploadUrl, {
    method: 'POST',
    body: form,
  })
  const uploaded = (await uploadResponse.json()) as {
    public_id?: string
    error?: { message?: string }
  }
  if (!uploadResponse.ok || uploaded.public_id !== intent.publicId) {
    throw new Error(uploaded.error?.message ?? 'The file could not be uploaded.')
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
