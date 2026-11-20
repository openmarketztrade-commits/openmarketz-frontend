'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { deliveryOptions, useShop } from '@/components/shop-provider'
import { formatPrice } from '@/lib/data'
import { CheckoutSteps } from '@/components/checkout/checkout-ui'
import { useCatalogProducts } from '@/components/catalog-provider'
import { verifyPayment } from '@/lib/api'

export function SuccessView() {
  const params = useSearchParams()
  const { orders, refreshOrders } = useShop()
  const { products } = useCatalogProducts()
  const orderId = params.get('order')
  const reference = params.get('reference')
  const isGift = params.get('gift') === '1'
  const [verification, setVerification] = useState<'pending' | 'verified' | 'failed'>(reference ? 'pending' : 'verified')
  const [verificationError, setVerificationError] = useState('')

  useEffect(() => {
    if (!reference) return
    let active = true
    void verifyPayment(reference)
      .then(async (result) => {
        if (result.status !== 'success') throw new Error('Payment has not been confirmed yet.')
        await refreshOrders()
        if (active) setVerification('verified')
      })
      .catch((error) => {
        if (!active) return
        setVerification('failed')
        setVerificationError(error instanceof Error ? error.message : 'Payment verification failed.')
      })
    return () => { active = false }
  }, [reference, refreshOrders])

  const order = orders.find((o) => o.id === orderId) ?? (orderId ? undefined : orders[0])

  if (verification === 'pending') {
    return <p role="status" className="py-24 text-center text-muted-foreground">Verifying your Paystack payment…</p>
  }

  if (verification === 'failed') {
    return (
      <div role="alert" className="mx-auto max-w-lg py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Payment not confirmed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{verificationError}</p>
        <p className="mt-2 text-sm text-muted-foreground">If your bank debited you, allow a few minutes for Paystack to update before retrying.</p>
        <Link href="/orders" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Check order history</Link>
      </div>
    )
  }

  if (isGift) {
    return (
      <div className="mx-auto mt-12 max-w-xl text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10"
        >
          <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
        </motion.div>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">Your gift payment is confirmed</h1>
        <p className="mt-2 text-muted-foreground">The wishlist owner has been notified. Their address remains private, and delivery updates are handled through their order history.</p>
        <Link href="/" className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90">Continue shopping</Link>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground">We could not find that order.</p>
        <Link href="/orders" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">View my orders</Link>
      </div>
    )
  }

  const eta = deliveryOptions[order.delivery].eta

  return (
    <>
      <CheckoutSteps current={3} />
      <div className="mx-auto mt-12 max-w-xl text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10"
        >
          <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
        </motion.div>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">Thank you, your order is in!</h1>
        <p className="mt-2 text-muted-foreground">
          {`Order ${order.displayId ?? order.id} has been sent to the seller. Expected delivery: ${eta}.`}
        </p>

        <div className="mt-8 rounded-3xl border bg-card p-6 text-left">
          <ul className="flex flex-col gap-3">
            {order.items.map((item) => {
              const product = products.find((p) => p.id === item.productId)
              return (
                <li key={item.productId + JSON.stringify(item.options)} className="flex justify-between gap-4 text-sm">
                  <span className="line-clamp-1">{`${item.quantity} × ${product?.name}`}</span>
                  <span className="font-medium tabular-nums">{formatPrice(item.unitPrice * item.quantity)}</span>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex justify-between border-t pt-4">
            <span className="font-medium">Total paid</span>
            <span className="font-display text-xl font-semibold tabular-nums">{formatPrice(order.total)}</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {`Delivering to ${order.address.fullName}, ${order.address.line1}, ${order.address.city}`}
          </p>
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/orders/${order.id}`} className="flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90">
            Track order
          </Link>
          <Link href="/products" className="flex h-12 items-center justify-center rounded-full border px-6 text-sm font-medium hover:bg-muted">
            Continue shopping
          </Link>
        </div>
      </div>
    </>
  )
}
