'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-provider'
import { followStore, getStoreFollowStatus, unfollowStore } from '@/lib/api'

export function StoreFollowButton({ slug, initialCount }: { slug: string; initialCount: number }) {
  const { user, authReady } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [following, setFollowing] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  useEffect(() => {
    if (!user) return
    let active = true
    void getStoreFollowStatus(slug).then((result) => {
      if (active) {
        setFollowing(result.following)
        setCount(result.followerCount)
      }
    }).catch(() => {})
    return () => { active = false }
  }, [slug, user])

  async function toggleFollow() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    setLoading(true)
    try {
      const result = following ? await unfollowStore(slug) : await followStore(slug)
      setFollowing(result.following)
      setCount(result.followerCount)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Store follow could not be updated.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{count.toLocaleString()} followers</span>
      <button type="button" onClick={() => void toggleFollow()} disabled={!authReady || loading} aria-pressed={following} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {loading ? <><Loader2 className="mr-1.5 inline size-4 animate-spin" aria-hidden="true" />Saving…</> : following ? 'Following' : 'Follow store'}
      </button>
    </div>
  )
}
