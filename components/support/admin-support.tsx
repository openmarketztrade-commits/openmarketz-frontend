'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-provider'
import {
  getSupportTicket,
  listAllSupportTickets,
  replyToSupportTicket,
  updateSupportTicketStatus,
  type ApiSupportTicket,
} from '@/lib/api'
import { inputClass } from '@/components/forms'

const ticketStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'] as const

export function AdminSupport() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<ApiSupportTicket[]>([])
  const [ticketId, setTicketId] = useState('')
  const [ticket, setTicket] = useState<ApiSupportTicket | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadTickets = useCallback(async () => {
    const result = await listAllSupportTickets()
    setTickets(result)
    return result
  }, [])

  const loadTicket = useCallback(async (id: string) => {
    setTicket(await getSupportTicket(id))
  }, [])

  useEffect(() => {
    if (user?.role !== 'ADMIN') return
    void loadTickets()
      .then((result) => {
        if (result[0]) setTicketId((current) => current || result[0].id)
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Support tickets could not be loaded.'))
  }, [loadTickets, user])

  useEffect(() => {
    if (!ticketId || user?.role !== 'ADMIN') return
    void loadTicket(ticketId).catch((cause) => setError(cause instanceof Error ? cause.message : 'This support ticket could not be loaded.'))
  }, [loadTicket, ticketId, user])

  async function sendReply(event: React.FormEvent) {
    event.preventDefault()
    if (!ticket || !draft.trim()) return
    setBusy(true)
    setError('')
    try {
      await replyToSupportTicket(ticket.id, draft.trim())
      setDraft('')
      await Promise.all([loadTicket(ticket.id), loadTickets()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reply could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(status: typeof ticketStatuses[number]) {
    if (!ticket) return
    setError('')
    try {
      await updateSupportTicketStatus(ticket.id, status)
      await Promise.all([loadTicket(ticket.id), loadTickets()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ticket status could not be updated.')
    }
  }

  if (user?.role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Admin access required</h1>
        <Link href="/support" className="mt-3 inline-block text-sm text-primary hover:underline">Go to support</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <h1 className="font-display text-3xl font-semibold">Support inbox</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-2">
          {tickets.length === 0 && <p className="rounded-xl border p-4 text-sm text-muted-foreground">No support tickets.</p>}
          {tickets.map((item) => (
            <button key={item.id} type="button" onClick={() => setTicketId(item.id)} className={`rounded-xl border p-3 text-left ${ticketId === item.id ? 'border-primary bg-primary/5' : 'bg-card'}`}>
              <span className="block text-xs text-muted-foreground">{item.ticketNumber} · {item.status.replaceAll('_', ' ').toLowerCase()}</span>
              <span className="mt-1 block truncate text-sm font-medium">{item.topic}</span>
              {item.email && <span className="mt-1 block truncate text-xs text-muted-foreground">{item.email}</span>}
            </button>
          ))}
        </aside>
        <section className="flex min-h-[600px] flex-col rounded-2xl border bg-card">
          {ticket ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <div>
                  <h2 className="font-semibold">{ticket.ticketNumber} · {ticket.topic}</h2>
                  <p className="text-sm text-muted-foreground">{ticket.name} · {ticket.email}</p>
                </div>
                <label className="sr-only" htmlFor="support-status">Ticket status</label>
                <select id="support-status" value={ticket.status} onChange={(event) => void changeStatus(event.target.value as typeof ticketStatuses[number])} className="h-9 rounded-lg border bg-background px-2 text-sm">
                  {ticketStatuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ').toLowerCase()}</option>)}
                </select>
              </header>
              <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                {ticket.message && <li className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm">{ticket.message}</li>}
                {ticket.replies?.map((reply) => {
                  const fromAdmin = reply.sender?.role === 'ADMIN'
                  return <li key={reply.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${fromAdmin ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-muted'}`}>{reply.body}</li>
                })}
              </ol>
              {error && <p role="alert" className="px-4 pb-2 text-sm text-destructive">{error}</p>}
              <form onSubmit={sendReply} className="flex gap-2 border-t p-3">
                <label htmlFor="support-reply" className="sr-only">Reply to customer</label>
                <textarea id="support-reply" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} className={`${inputClass} h-auto flex-1 resize-none py-2`} placeholder="Reply to customer…" />
                <button disabled={busy || !draft.trim()} className="self-end rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Sending…' : 'Send reply'}</button>
              </form>
            </>
          ) : <p className="m-auto p-6 text-sm text-muted-foreground">Select a support ticket to review it.</p>}
        </section>
      </div>
      {error && !ticket && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </main>
  )
}
