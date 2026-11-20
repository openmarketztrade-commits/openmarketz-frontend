import type { Metadata } from 'next'
import { AdminSupport } from '@/components/support/admin-support'

export const metadata: Metadata = { title: 'Support inbox' }

export default function AdminSupportPage() {
  return <AdminSupport />
}
