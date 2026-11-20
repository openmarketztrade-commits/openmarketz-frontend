'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-provider'
import {
  acceptOpenMarketResponse,
  createOpenMarketRequest,
  createOpenMarketResponse,
  declineOpenMarketResponse,
  getOpenMarketRequest,
  listOpenMarketRequests,
  listOpenMarketResponses,
  listMyOpenMarketRequests,
  listMyOpenMarketResponses,
  type ApiMarketRequest,
  type ApiMarketResponse,
} from '@/lib/api'
import type { MarketRequest, SellerResponse } from '@/lib/open-market'

type NewRequest = Omit<MarketRequest, 'id' | 'buyerId' | 'buyerName' | 'postedHoursAgo' | 'status' | 'views'> & {
  imageMediaId?: string
}
type NewResponse = Omit<SellerResponse, 'id' | 'postedHoursAgo' | 'status' | 'sellerId' | 'sellerName' | 'sellerSlug'>

type OpenMarketValue = {
  requests: MarketRequest[]
  responses: SellerResponse[]
  postRequest: (input: NewRequest) => Promise<MarketRequest>
  submitResponse: (input: NewResponse) => Promise<void>
  acceptResponse: (responseId: string) => Promise<void>
  declineResponse: (responseId: string) => Promise<void>
  loadRequest: (requestId: string) => Promise<void>
  loadResponses: (requestId: string) => Promise<void>
  responsesFor: (requestId: string) => SellerResponse[]
}

const OpenMarketContext = createContext<OpenMarketValue | null>(null)

function mapRequest(request: ApiMarketRequest): MarketRequest {
  const statuses: Record<string, MarketRequest['status']> = {
    OPEN: 'open',
    ACCEPTED: 'accepted',
    CLOSED: 'closed',
  }
  return {
    id: request.id,
    title: request.title,
    description: request.description,
    category: request.category.slug,
    budgetMin: request.budgetMin,
    budgetMax: request.budgetMax,
    quantity: request.quantity,
    location: request.location,
    neededBy: request.neededBy ?? '',
    condition: request.condition,
    image: request.image,
    buyerId: request.buyerId,
    buyerName: request.buyerName,
    postedHoursAgo: Math.max(0, Math.round((Date.now() - new Date(request.createdAt).getTime()) / 3_600_000)),
    status: statuses[request.status] ?? 'closed',
    views: 0,
    responseCount: request.responseCount,
  }
}

function mapResponse(response: ApiMarketResponse): SellerResponse {
  const statuses: Record<string, SellerResponse['status']> = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
  }
  return {
    id: response.id,
    requestId: response.requestId,
    sellerId: response.sellerId ?? response.seller.id,
    isMine: response.isMine,
    sellerName: response.seller.name,
    sellerSlug: response.seller.slug,
    sellerVerified: response.seller.verified,
    sellerRating: response.seller.rating,
    price: response.price,
    deliveryDays: response.deliveryDays,
    note: response.note,
    productId: response.productId ?? response.product?.id,
    postedHoursAgo: Math.max(0, Math.round((Date.now() - new Date(response.createdAt).getTime()) / 3_600_000)),
    status: statuses[response.status] ?? 'pending',
  }
}

export function OpenMarketProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth()
  const [requests, setRequests] = useState<MarketRequest[]>([])
  const [responses, setResponses] = useState<SellerResponse[]>([])

  const loadRequest = useCallback(async (requestId: string) => {
    const request = await getOpenMarketRequest(requestId)
    setRequests((previous) => [mapRequest(request), ...previous.filter((item) => item.id !== request.id)])
  }, [])

  const loadResponses = useCallback(async (requestId: string) => {
    if (!user) return
    const response = await listOpenMarketResponses(requestId)
    const mapped = response.items.map(mapResponse)
    setResponses((previous) => [
      ...previous.filter((item) => item.requestId !== requestId),
      ...mapped,
    ])
  }, [user])

  useEffect(() => {
    if (!authReady) return
    let active = true
    setRequests([])
    setResponses([])
    void listOpenMarketRequests()
      .then((response) => {
        if (!active) return
        const openRequests = response.items.map(mapRequest)
        if (!user) {
          setRequests(openRequests)
          return
        }
        setRequests((previous) => {
          const requestMap = new Map([...previous, ...openRequests].map((item) => [item.id, item]))
          return [...requestMap.values()]
        })
      })
      .catch((error) => {
        console.error('Unable to load Open Market requests.', error)
        if (active) toast.error(error instanceof Error ? error.message : 'Open Market requests could not be loaded.')
      })
    if (user) {
      void listMyOpenMarketRequests()
        .then((response) => {
          if (!active) return
          const ownRequests = response.items.map(mapRequest)
          setRequests((previous) => {
            const requestMap = new Map([...previous.filter((item) => item.buyerId !== user.id), ...ownRequests].map((item) => [item.id, item]))
            return [...requestMap.values()]
          })
        })
        .catch((error) => {
          console.error('Unable to load the user’s Open Market requests.', error)
          if (active) toast.error(error instanceof Error ? error.message : 'Your Open Market requests could not be loaded.')
        })
      void listMyOpenMarketResponses()
        .then((response) => {
          if (active) setResponses(response.items.map(mapResponse))
        })
        .catch((error) => {
          console.error('Unable to load the user’s Open Market offers.', error)
          if (active) toast.error(error instanceof Error ? error.message : 'Your Open Market offers could not be loaded.')
        })
    }
    return () => { active = false }
  }, [authReady, user])

  const postRequest = useCallback<OpenMarketValue['postRequest']>(async (input) => {
    if (!user) throw new Error('Sign in to post an Open Market request.')
    const created = await createOpenMarketRequest({
      categorySlug: input.category,
      title: input.title,
      description: input.description,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      quantity: input.quantity,
      location: input.location,
      neededBy: input.neededBy || undefined,
      condition: input.condition,
      imageMediaId: input.imageMediaId,
    })
    const request = mapRequest(created)
    setRequests((previous) => [request, ...previous.filter((item) => item.id !== request.id)])
    return request
  }, [user])

  const submitResponse = useCallback<OpenMarketValue['submitResponse']>(async (input) => {
    if (!user) throw new Error('Sign in as an approved seller to make an offer.')
    const created = await createOpenMarketResponse(input.requestId, {
      price: input.price,
      deliveryDays: input.deliveryDays,
      note: input.note,
      productId: input.productId,
    })
    const response = { ...mapResponse(created), isMine: true }
    setResponses((previous) => [response, ...previous.filter((item) => item.id !== response.id)])
  }, [user])

  const acceptResponse = useCallback<OpenMarketValue['acceptResponse']>(async (responseId) => {
    await acceptOpenMarketResponse(responseId)
    const target = responses.find((item) => item.id === responseId)
    if (!target) return
    setResponses((previous) => previous.map((item) =>
      item.requestId !== target.requestId ? item : { ...item, status: item.id === responseId ? 'accepted' : 'declined' },
    ))
    setRequests((previous) => previous.map((item) =>
      item.id === target.requestId ? { ...item, status: 'accepted' } : item,
    ))
  }, [responses])

  const declineResponse = useCallback<OpenMarketValue['declineResponse']>(async (responseId) => {
    await declineOpenMarketResponse(responseId)
    setResponses((previous) => previous.map((item) =>
      item.id === responseId ? { ...item, status: 'declined' } : item,
    ))
  }, [])

  const responsesFor = useCallback(
    (requestId: string) => responses.filter((response) => response.requestId === requestId).sort((a, b) => a.price - b.price),
    [responses],
  )

  const value = useMemo(
    () => ({ requests, responses, postRequest, submitResponse, acceptResponse, declineResponse, loadRequest, loadResponses, responsesFor }),
    [requests, responses, postRequest, submitResponse, acceptResponse, declineResponse, loadRequest, loadResponses, responsesFor],
  )
  return <OpenMarketContext.Provider value={value}>{children}</OpenMarketContext.Provider>
}

export function useOpenMarket() {
  const ctx = useContext(OpenMarketContext)
  if (!ctx) throw new Error('useOpenMarket must be used within OpenMarketProvider')
  return ctx
}
