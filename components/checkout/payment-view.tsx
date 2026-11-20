'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Check, CreditCard, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { deliveryOptions, useCartTotals, useShop } from '@/components/shop-provider'
import { CheckoutSteps, OrderSummary, fieldClass } from '@/components/checkout/checkout-ui'
import { formatPrice } from '@/lib/data'
import { listSavedPaymentMethods, submitPaymentChallenge, type ApiSavedPaymentMethod } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function PaymentView() {
  const router = useRouter()
  const { addresses, selectedAddressId, delivery, checkout } = useShop()
  const { lines, total, quoteReady } = useCartTotals()
  const [methods, setMethods] = useState<ApiSavedPaymentMethod[]>([])
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [saveCard, setSaveCard] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [challenge, setChallenge] = useState<{
    orderId: string
    reference: string
    status: 'send_otp' | 'send_pin' | 'send_phone' | 'send_birthday'
    message: string
  } | null>(null)
  const [challengeValue, setChallengeValue] = useState('')
  const [error, setError] = useState('')
  const address = addresses.find((a) => a.id === selectedAddressId)
  const challengeInfo = challenge ? {
    send_otp: { label: 'One-time password', type: 'otp' as const, input: 'text', placeholder: 'Enter the code from your bank' },
    send_pin: { label: 'Card PIN', type: 'pin' as const, input: 'password', placeholder: 'Enter your card PIN' },
    send_phone: { label: 'Phone number', type: 'phone' as const, input: 'tel', placeholder: 'Enter the phone number registered with your bank' },
    send_birthday: { label: 'Date of birth', type: 'birthday' as const, input: 'text', placeholder: 'YYYY-MM-DD' },
  }[challenge.status] : null

  useEffect(() => {
    let active = true
    void listSavedPaymentMethods()
      .then((savedMethods) => {
        if (active) setMethods(savedMethods)
      })
      .catch((cause) => {
        if (active) console.error('Unable to load saved payment methods.', cause)
      })
    return () => { active = false }
  }, [])

  if (lines.length === 0 || !address) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground">{lines.length === 0 ? 'Your cart is empty.' : 'Please choose a delivery address first.'}</p>
        <Link href={lines.length === 0 ? '/products' : '/checkout/address'} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          {lines.length === 0 ? 'Browse products' : 'Choose address'}
        </Link>
      </div>
    )
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setProcessing(true)
    try {
      const result = await checkout({
        saveCard,
        savedPaymentMethodId: selectedMethodId || undefined,
      })
      if (result.payment.authorizationUrl?.startsWith('https://')) {
        window.location.assign(result.payment.authorizationUrl)
        return
      }
      if (result.payment.status && result.payment.status in {
        send_otp: true,
        send_pin: true,
        send_phone: true,
        send_birthday: true,
      }) {
        const status = result.payment.status as NonNullable<typeof challenge>['status']
        const label = {
          send_otp: 'one-time password',
          send_pin: 'card PIN',
          send_phone: 'phone number',
          send_birthday: 'date of birth',
        }[status]
        setChallenge({
          orderId: result.order.id,
          reference: result.payment.reference,
          status,
          message: `Your bank requested your ${label} to authorize this charge.`,
        })
        return
      }
      if (result.payment.status === 'success') {
        router.push(`/checkout/success?order=${encodeURIComponent(result.order.id)}&reference=${encodeURIComponent(result.payment.reference)}`)
        return
      }
      throw new Error(result.payment.status
        ? `The saved card requires another verification step (${result.payment.status}). Choose a different payment method.`
        : 'Paystack did not return a payment authorization link.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Payment could not be started.'
      setError(message)
      toast.error(message)
    } finally {
      setProcessing(false)
    }
  }

  async function submitChallenge(e: React.FormEvent) {
    e.preventDefault()
    if (!challenge || !challengeInfo) return
    setProcessing(true)
    setError('')
    try {
      const result = await submitPaymentChallenge(challenge.reference, challengeInfo.type, challengeValue)
      if (result.status === 'success') {
        router.push(`/checkout/success?order=${encodeURIComponent(challenge.orderId)}&reference=${encodeURIComponent(result.reference)}`)
        return
      }
      if (result.status in { send_otp: true, send_pin: true, send_phone: true, send_birthday: true }) {
        setChallenge({
          ...challenge,
          status: result.status as NonNullable<typeof challenge>['status'],
          message: result.message ?? 'Your bank requested another verification step.',
        })
        setChallengeValue('')
        return
      }
      throw new Error(result.message ?? 'The bank verification was not accepted.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Bank verification failed.'
      setError(message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <CheckoutSteps current={2} />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <form id="payment-form" onSubmit={challenge ? submitChallenge : pay} className="flex flex-col gap-8">
          <section className="flex items-start gap-4 rounded-2xl border bg-card p-4">
            <CreditCard className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex-1 text-sm">
              <p className="font-medium">{`Delivering to ${address.fullName}`}</p>
              <p className="text-muted-foreground">{`${address.line1}, ${address.city}, ${address.state}`}</p>
              <p className="mt-1 text-muted-foreground">{`${deliveryOptions[delivery].label} · ${deliveryOptions[delivery].eta}`}</p>
            </div>
            <Link href="/checkout/address" className="text-sm font-medium text-primary hover:underline">Change</Link>
          </section>

          {challenge && challengeInfo ? (
            <section>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Verify your card</h1>
              <p className="mt-2 text-sm text-muted-foreground">{challenge.message}</p>
              <label htmlFor="payment-challenge" className="mt-5 block text-sm font-medium">{challengeInfo.label}</label>
              <input
                id="payment-challenge"
                autoComplete={challenge.status === 'send_otp' ? 'one-time-code' : 'off'}
                inputMode={challenge.status === 'send_otp' || challenge.status === 'send_pin' ? 'numeric' : undefined}
                type={challengeInfo.input}
                placeholder={challengeInfo.placeholder}
                required
                value={challengeValue}
                onChange={(event) => setChallengeValue(event.target.value)}
                className={`${fieldClass} mt-2 max-w-sm`}
              />
            </section>
          ) : (
            <>
              <section>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Pay securely with Paystack</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your card details are entered on Paystack’s secure checkout. Card, bank transfer and USSD options depend on what Paystack enables for your account.
                </p>
                {methods.length > 0 && (
                  <fieldset className="mt-5">
                    <legend className="text-sm font-medium">Saved cards</legend>
                    <div className="mt-3 grid gap-3">
                      {methods.map((method) => {
                        const active = selectedMethodId === method.id
                        return (
                          <label key={method.id} className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-2xl border p-4',
                            active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
                          )}>
                            <input
                              type="radio"
                              name="saved-method"
                              value={method.id}
                              checked={active}
                              onChange={() => setSelectedMethodId(method.id)}
                              className="accent-primary"
                            />
                            <CreditCard className="size-5 text-primary" aria-hidden="true" />
                            <span className="text-sm font-medium">
                              {`${method.cardType ?? 'Card'} ending in ${method.last4}`}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">{`${method.expMonth}/${method.expYear}`}</span>
                            </span>
                            {active && <Check className="ml-auto size-4 text-primary" aria-hidden="true" />}
                          </label>
                        )
                      })}
                      <label className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-2xl border p-4',
                        !selectedMethodId ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
                      )}>
                        <input
                          type="radio"
                          name="saved-method"
                          value=""
                          checked={!selectedMethodId}
                          onChange={() => setSelectedMethodId('')}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium">Use a different payment method</span>
                      </label>
                    </div>
                  </fieldset>
                )}
                {!selectedMethodId && (
                  <label className="mt-5 flex items-start gap-3 text-sm">
                    <input type="checkbox" checked={saveCard} onChange={(event) => setSaveCard(event.target.checked)} className="mt-0.5 accent-primary" />
                    <span>Save this card for future purchases using Paystack’s secure authorization. OpenMarketz never stores card numbers or CVV.</span>
                  </label>
                )}
              </section>
              <section className="rounded-2xl border bg-card p-5">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                  Your payment is protected and held until delivery is confirmed.
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden="true" />
                  Card details are handled by Paystack; they are never sent to or stored by this site.
                </p>
              </section>
            </>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>

        <OrderSummary compact>
          <button
            type="submit"
            form="payment-form"
            disabled={processing || !quoteReady || (!!challenge && !challengeValue.trim())}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-70"
          >
            {processing || !quoteReady ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{processing ? 'Processing…' : 'Calculating total…'}</>
              : challenge ? 'Continue verification'
                : selectedMethodId ? `Pay ${formatPrice(total)} with saved card` : `Continue to Paystack · ${formatPrice(total)}`}
          </button>
        </OrderSummary>
      </div>
    </>
  )
}
