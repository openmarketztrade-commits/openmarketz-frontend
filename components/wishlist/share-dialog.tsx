'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Mail, MessageCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { shareUrl, type GiftList } from '@/components/wishlist-provider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fieldClass } from '@/components/checkout/checkout-ui'
import { createWishlistShare } from '@/lib/api'

export function ShareDialog({ list, open, onOpenChange }: { list: GiftList; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState(`Hi! I made a wishlist on OpenMarketz for my ${list.occasion.replace('-', ' ')}. You can pay for any item and it gets delivered to me.`)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const url = token ? shareUrl(token) : ''
  const text = `${message}\n\n${url}`

  useEffect(() => {
    if (!open) {
      setToken('')
      setError('')
      return
    }
    let active = true
    setLoading(true)
    void createWishlistShare(list.id)
      .then(({ token: shareToken }) => {
        if (active) setToken(shareToken)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The share link could not be created.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [list.id, open])

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
      window.setTimeout(() => setCopied(false), 2000)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Link could not be copied.')
    }
  }

  async function nativeShare() {
    if (url && navigator.share) {
      try {
        await navigator.share({ title: list.name, text: message, url })
      } catch {}
    } else copy()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask someone to pay for you</DialogTitle>
          <DialogDescription>{`Share "${list.name}". Anyone with the link can pay for items — no account needed.`}</DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input readOnly value={loading ? 'Creating secure link…' : url} aria-label="Share link" className={`${fieldClass} truncate text-muted-foreground`} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" disabled={!url} onClick={() => void copy()} className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50">
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white hover:opacity-90"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(list.name)}&body=${encodeURIComponent(text)}`}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted"
              >
                <Mail className="size-4" aria-hidden="true" />
                Email
              </a>
              <button type="button" disabled={!url} onClick={() => void nativeShare()} className="flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted disabled:opacity-50">
                <Send className="size-4" aria-hidden="true" />
                More
              </button>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  )
}
