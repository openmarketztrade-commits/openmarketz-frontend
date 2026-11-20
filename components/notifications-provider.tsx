'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/components/auth-provider'
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreference,
} from '@/lib/api'

export type NotificationType = 'order' | 'offer' | 'message' | 'wishlist' | 'account' | 'promo' | 'market' | 'support'

export type AppNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string
  at: number
  read: boolean
}

export type NotificationPrefs = Record<NotificationType, { inApp: boolean; email: boolean; sms: boolean }>

type NotificationsContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  notify: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  prefs: NotificationPrefs
  setPref: (type: NotificationType, channel: keyof NotificationPrefs[NotificationType], value: boolean) => void
}

export const notificationTypeLabels: Record<NotificationType, { label: string; description: string }> = {
  order: { label: 'Orders & delivery', description: 'Confirmations, dispatch and delivery updates' },
  offer: { label: 'Offers & bargaining', description: 'When sellers accept, decline or counter your offers' },
  message: { label: 'Messages', description: 'New chat messages from sellers' },
  wishlist: { label: 'Wishlist & gifts', description: 'Price drops, back in stock and gifts from friends' },
  account: { label: 'Account & security', description: 'Sign-ins, password changes and seller application status' },
  promo: { label: 'Deals & promotions', description: 'Flash sales and offers picked for you' },
  market: { label: 'Open Market', description: 'Responses and updates to your purchase requests' },
  support: { label: 'Support tickets', description: 'Replies and updates to your support requests' },
}

const defaultPrefs: NotificationPrefs = {
  order: { inApp: true, email: false, sms: false },
  offer: { inApp: true, email: false, sms: false },
  message: { inApp: true, email: false, sms: false },
  wishlist: { inApp: true, email: false, sms: false },
  account: { inApp: true, email: false, sms: false },
  promo: { inApp: true, email: false, sms: false },
  market: { inApp: true, email: false, sms: false },
  support: { inApp: true, email: false, sms: false },
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs)

  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      setNotifications([])
      setPrefs(defaultPrefs)
      return
    }
    let active = true
    void Promise.all([listNotifications(), getNotificationPreferences()])
      .then(([notificationResponse, preferenceResponse]) => {
        if (!active) return
        setNotifications(notificationResponse.items.map((item) => ({
          id: item.id,
          type: (item.type.toLowerCase() === 'market_request' ? 'market' : item.type.toLowerCase()) as NotificationType,
          title: item.title,
          body: item.body,
          href: item.href ?? '/notifications',
          at: new Date(item.createdAt).getTime(),
          read: Boolean(item.readAt),
        })))
        setPrefs((previous) => ({
          ...previous,
          ...Object.fromEntries(preferenceResponse.map((item) => {
            const type = item.type.toLowerCase() === 'market_request' ? 'market' : item.type.toLowerCase()
            return [type, { inApp: item.inApp, email: item.email, sms: item.sms }]
          })),
        }))
      })
      .catch((error) => console.error('Unable to load persisted notifications.', error))
    return () => { active = false }
  }, [authReady, user])

  const notify = useCallback<NotificationsContextValue['notify']>((n) => {
    if (!prefsRef.current[n.type].inApp) return
    const id = `n_${Math.random().toString(36).slice(2, 9)}`
    setNotifications((prev) => [{ ...n, id, at: Date.now(), read: false }, ...prev])
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    if (!id.startsWith('n_')) {
      void markNotificationRead(id).catch((error) => console.error('Unable to mark the notification as read.', error))
    }
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    if (user) {
      void markAllNotificationsRead().catch((error) => console.error('Unable to mark notifications as read.', error))
    }
  }, [user])

  const remove = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const setPref = useCallback<NotificationsContextValue['setPref']>((type, channel, value) => {
    setPrefs((prev) => ({ ...prev, [type]: { ...prev[type], [channel]: value } }))
    const apiType = type === 'market' ? 'MARKET_REQUEST' : type.toUpperCase()
    void updateNotificationPreference({
      type: apiType,
      inApp: channel === 'inApp' ? value : prefsRef.current[type].inApp,
      email: channel === 'email' ? value : prefsRef.current[type].email,
      sms: channel === 'sms' ? value : prefsRef.current[type].sms,
    }).catch((error) => console.error('Unable to save notification preference.', error))
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const value = useMemo(
    () => ({ notifications, unreadCount, notify, markRead, markAllRead, remove, prefs, setPref }),
    [notifications, unreadCount, notify, markRead, markAllRead, remove, prefs, setPref],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}

export function timeAgo(at: number) {
  const s = Math.round((Date.now() - at) / 1000)
  if (s < 60) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}
