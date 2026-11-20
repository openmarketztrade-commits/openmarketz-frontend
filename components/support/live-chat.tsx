'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Headset, Send } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import {
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  replyToSupportTicket,
  type ApiSupportTicket,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const quickReplies = ['Where is my order?', 'I need help with a payment', 'I have a problem with a seller']
const activeStatuses = new Set(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'])

export function LiveChat({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { user } = useAuth()
  const inputId = useId()
  const listRef = useRef<HTMLOListElement>(null)
  const [tickets, setTickets] = useState<ApiSupportTicket[]>([])
  const [ticket, setTicket] = useState<ApiSupportTicket | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [ticketId, setTicketId] = useState('')

  const refreshTicket = useCallback(async (id: string) => {
    const updated = await getSupportTicket(id)
    setTicket(updated)
  }, [])

  const refreshTickets = useCallback(async () => {
    const items = await listSupportTickets()
    setTickets(items)
    return items
  }, [])

  useEffect(() => {
    if (!user) {
      setTickets([])
      setTicket(null)
      return
    }
    let active = true
    void refreshTickets()
      .then((items) => {
        if (!active) return
        const latest = items.find((item) => activeStatuses.has(item.status)) ?? items[0]
        if (latest) setTicketId(latest.id)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Support history could not be loaded.')
      })
    return () => { active = false }
  }, [refreshTickets, user])

  useEffect(() => {
    if (!ticketId) {
      setTicket(null)
      return
    }
    let active = true
    void refreshTicket(ticketId)
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'This support ticket could not be loaded.')
      })
    const poll = window.setInterval(() => {
      void refreshTicket(ticketId).catch((cause) => console.error('Unable to refresh support ticket replies.', cause))
    }, 10_000)
    return () => {
      active = false
      window.clearInterval(poll)
    }
  }, [refreshTicket, ticketId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [ticket])

  async function send(text: string) {
    const value = text.trim()
    if (!value || sending || !user) return
    if (!ticket && value.length < 10) {
      setError('Please add a little more detail before opening a support ticket.')
      return
    }
    setSending(true)
    setError('')
    try {
      if (ticket) {
        await replyToSupportTicket(ticket.id, value)
        await refreshTicket(ticket.id)
      } else {
        const created = await createSupportTicket({
          name: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          topic: 'Live chat',
          message: value,
        })
        await refreshTickets()
        setTicketId(created.id)
      }
      setDraft('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  const replies = ticket?.replies ?? []
  const initialMessage = ticket?.message

  return (
    <section aria-label="Support ticket chat" className={cn('flex h-[560px] flex-col overflow-hidden rounded-3xl border bg-card', className)}>
      <header className={cn('flex items-center gap-3 border-b p-4', compact && 'hidden')}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Headset className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Support messages</h2>
          <p className="text-xs text-muted-foreground">Messages are saved to your support ticket history.</p>
        </div>
      </header>

      {!user ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">Sign in to start a support chat and keep your replies in your ticket history.</p>
          <Link href="/login?next=%2Fsupport" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign in</Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <label htmlFor={`${inputId}-history`} className="sr-only">Support ticket history</label>
            <select id={`${inputId}-history`} value={ticketId} onChange={(event) => setTicketId(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs">
              <option value="">New support message</option>
              {tickets.map((item) => <option key={item.id} value={item.id}>{`${item.ticketNumber} · ${item.topic} · ${item.status.replaceAll('_', ' ').toLowerCase()}`}</option>)}
            </select>
            {ticketId && <button type="button" onClick={() => setTicketId('')} className="shrink-0 text-xs font-medium text-primary hover:underline">New chat</button>}
          </div>

          <ol ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
            {ticket && (
              <li className="self-center rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{`${ticket.ticketNumber} · ${ticket.status.replaceAll('_', ' ').toLowerCase()}`}</li>
            )}
            {initialMessage && (
              <li className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">{initialMessage}</li>
            )}
            {replies.map((reply) => {
              const fromSupport = reply.sender?.role === 'ADMIN'
              return (
                <li key={reply.id} className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed', fromSupport ? 'self-start rounded-bl-md bg-muted' : 'self-end rounded-br-md bg-primary text-primary-foreground')}>
                  {reply.body}
                  {fromSupport && <span className="mt-1 block text-[10px] opacity-70">{reply.sender?.firstName ?? 'Support'}</span>}
                </li>
              )
            })}
            {!ticket && <li className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm leading-relaxed">Send a message to open a support ticket. Our team will reply here.</li>}
          </ol>

          {error && <p role="alert" className="px-4 pb-2 text-xs text-destructive">{error}</p>}
          {!ticket && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
              {quickReplies.map((item) => (
                <button key={item} type="button" disabled={sending} onClick={() => setDraft(item)} className="h-8 shrink-0 rounded-full border px-3 text-xs font-medium hover:bg-muted">{item}</button>
              ))}
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); void send(draft) }} className="flex gap-2 border-t p-3">
            <label htmlFor={inputId} className="sr-only">Type your support message</label>
            <input id={inputId} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={ticket ? 'Reply to your ticket…' : 'Describe how we can help…'} className="h-11 flex-1 rounded-xl border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            <button type="submit" aria-label="Send message" disabled={!draft.trim() || sending} className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
              {sending ? <span className="text-xs">…</span> : <Send className="size-4" aria-hidden="true" />}
            </button>
          </form>
        </>
      )}
    </section>
  )
}
