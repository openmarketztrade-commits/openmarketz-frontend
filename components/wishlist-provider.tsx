'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import {
  addWishlistItem,
  createWishlist,
  deleteWishlist,
  listWishlists,
  removeWishlistItem,
  updateWishlist,
  type ApiWishlist,
} from '@/lib/api'

export type Occasion = 'birthday' | 'wedding' | 'baby' | 'graduation' | 'housewarming' | 'holiday' | 'just-because'

export const occasions: { value: Occasion; label: string }[] = [
  { value: 'birthday', label: 'Birthday' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'baby', label: 'Baby shower' },
  { value: 'graduation', label: 'Graduation' },
  { value: 'housewarming', label: 'Housewarming' },
  { value: 'holiday', label: 'Holiday / Christmas' },
  { value: 'just-because', label: 'Just because' },
]

export type GiftList = {
  id: string
  name: string
  note: string
  occasion: Occasion
  eventDate: string
  productIds: string[]
  ownerName: string
  ownerRegion: string
  createdAt: number
}

export type SharedPayload = Omit<GiftList, 'createdAt'>

export type Gift = {
  listId: string
  productId: string
  giverName: string
  anonymous: boolean
  message: string
  reference: string
  amount: number
  at: number
}

type WishlistContextValue = {
  lists: GiftList[]
  gifts: Gift[]
  createList: (input: Omit<GiftList, 'id' | 'createdAt'>) => Promise<GiftList>
  updateList: (id: string, patch: Partial<Omit<GiftList, 'id'>>) => Promise<void>
  deleteList: (id: string) => Promise<void>
  toggleInList: (listId: string, productId: string) => Promise<void>
  giftsFor: (listId: string) => Gift[]
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

function mapWishlist(apiList: ApiWishlist, userName: string, region: string): { list: GiftList; gifts: Gift[] } {
  const list: GiftList = {
    id: apiList.id,
    name: apiList.name,
    note: apiList.note,
    occasion: (occasions.find((item) => item.value === apiList.occasion)?.value ?? 'just-because'),
    eventDate: apiList.eventDate ? apiList.eventDate.slice(0, 10) : '',
    productIds: apiList.items.map((item) => item.productId),
    ownerName: userName,
    ownerRegion: region,
    createdAt: new Date(apiList.createdAt).getTime(),
  }
  const gifts = (apiList.gifts ?? []).flatMap((contribution) =>
    contribution.items.map((item) => ({
      listId: apiList.id,
      productId: item.productId,
      giverName: contribution.giverName ?? 'A friend',
      anonymous: contribution.anonymous,
      message: contribution.message ?? '',
      reference: contribution.reference,
      amount: item.amount,
      at: new Date(contribution.createdAt).getTime(),
    })),
  )
  return { list, gifts }
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth()
  const [lists, setLists] = useState<GiftList[]>([])
  const [gifts, setGifts] = useState<Gift[]>([])

  const refresh = useCallback(async () => {
    if (!user) return
    const apiLists = await listWishlists()
    const mapped = apiLists.map((item) => mapWishlist(item, `${user.firstName} ${user.lastName}`, user.region))
    setLists(mapped.map((item) => item.list))
    setGifts(mapped.flatMap((item) => item.gifts))
  }, [user])

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      setLists([])
      setGifts([])
      return
    }
    void refresh().catch((error) => console.error('Unable to load wishlists.', error))
  }, [authReady, refresh, user])

  const createList = useCallback<WishlistContextValue['createList']>(async (input) => {
    const created = await createWishlist({
      name: input.name,
      note: input.note,
      occasion: input.occasion,
      eventDate: input.eventDate || undefined,
    })
    for (const productId of input.productIds) await addWishlistItem(created.id, productId)
    const list: GiftList = {
      ...input,
      id: created.id,
      createdAt: new Date(created.createdAt).getTime(),
    }
    setLists((previous) => [list, ...previous])
    return list
  }, [])

  const updateList = useCallback<WishlistContextValue['updateList']>(async (id, patch) => {
    const current = lists.find((item) => item.id === id)
    if (!current) throw new Error('Wishlist not found.')
    await updateWishlist(id, {
      name: patch.name,
      note: patch.note,
      occasion: patch.occasion,
      eventDate: patch.eventDate || undefined,
    })
    const nextProductIds = patch.productIds ?? current.productIds
    await Promise.all([
      ...current.productIds.filter((productId) => !nextProductIds.includes(productId))
        .map((productId) => removeWishlistItem(id, productId)),
      ...nextProductIds.filter((productId) => !current.productIds.includes(productId))
        .map((productId) => addWishlistItem(id, productId)),
    ])
    setLists((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item))
  }, [lists])

  const deleteList = useCallback<WishlistContextValue['deleteList']>(async (id) => {
    await deleteWishlist(id)
    setLists((previous) => previous.filter((item) => item.id !== id))
    setGifts((previous) => previous.filter((gift) => gift.listId !== id))
  }, [])

  const toggleInList = useCallback<WishlistContextValue['toggleInList']>(async (listId, productId) => {
    const list = lists.find((item) => item.id === listId)
    if (!list) throw new Error('Wishlist not found.')
    if (list.productIds.includes(productId)) {
      await removeWishlistItem(listId, productId)
      setLists((previous) => previous.map((item) => item.id === listId
        ? { ...item, productIds: item.productIds.filter((id) => id !== productId) }
        : item))
    } else {
      await addWishlistItem(listId, productId)
      setLists((previous) => previous.map((item) => item.id === listId
        ? { ...item, productIds: [...item.productIds, productId] }
        : item))
    }
  }, [lists])

  const giftsFor = useCallback((listId: string) => gifts.filter((gift) => gift.listId === listId), [gifts])

  const value = useMemo(
    () => ({ lists, gifts, createList, updateList, deleteList, toggleInList, giftsFor }),
    [lists, gifts, createList, updateList, deleteList, toggleInList, giftsFor],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlists() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlists must be used within WishlistProvider')
  return ctx
}

export function shareUrl(token: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/w/${token}`
}
