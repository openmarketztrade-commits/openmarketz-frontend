'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CreditCard, Loader2, ShieldCheck, Truck } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { useShop } from '@/components/shop-provider'
import { Field, Select, inputClass } from '@/components/forms'
import { formatPrice } from '@/lib/data'
import {
  checkoutOpenMarketResponse,
  getOpenMarketCheckoutQuote,
  getOpenMarketResponse,
  listSavedPaymentMethods,
  submitPaymentChallenge,
  type ApiMarketRequest,
  type ApiMarketResponse,
  type ApiSavedPaymentMethod,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type PaymentChallenge = {
  reference: string
  orderId: string
  status: 'send_otp' | 'send_pin' | 'send_phone' | 'send_birthday'
  message: string
}

const challengeLabels = {
  send_otp: { title: 'Verify your card', label: 'One-time password', type: 'otp' as const, input: 'text', placeholder: 'Enter the code from your bank' },
  send_pin: { title: 'Verify your card', label: 'Card PIN', type: 'pin' as const, input: 'password', placeholder: 'Enter your card PIN' },
  send_phone: { title: 'Verify your card', label: 'Phone number', type: 'phone' as const, input: 'tel', placeholder: 'Enter the phone number registered with your bank' },
  send_birthday: { title: 'Verify your card', label: 'Date of birth', type: 'birthday' as const, input: 'text', placeholder: 'YYYY-MM-DD' },
}

function mapRequest(request: ApiMarketRequest) {
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
    postedHoursAgo: 0,
    status: request.status.toLowerCase() as 'open' | 'accepted' | 'closed',
    views: 0,
  }
}

function mapResponse(response: ApiMarketResponse) {
  return {
    id: response.id,
    requestId: response.requestId,
    sellerId: response.sellerId ?? response.seller.id,
    sellerName: response.seller.name,
    sellerSlug: response.seller.slug,
    price: response.price,
    deliveryDays: response.deliveryDays,
    note: response.note,
    productId: response.productId ?? undefined,
    postedHoursAgo: 0,
    status: response.status.toLowerCase() as 'pending' | 'accepted' | 'declined',
  }
}

export function OfferCheckout({ responseId }: { responseId: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const { addresses, selectedAddressId, setSelectedAddressId, delivery, setDelivery } = useShop()
  const [detail, setDetail] = useState<(ApiMarketResponse & { request: ApiMarketRequest }) | null>(null)
  const [methods, setMethods] = useState<ApiSavedPaymentMethod[]>([])
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [saveCard, setSaveCard] = useState(false)
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof getOpenMarketCheckoutQuote>> | null>(null)
  const [challenge, setChallenge] = useState<PaymentChallenge | null>(null)
  const [challengeValue, setChallengeValue] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getOpenMarketResponse(responseId)
      .then((response) => { if (active) setDetail(response) })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The accepted offer could not be loaded.')
      })
    return () => { active = false }
  }, [responseId])

  useEffect(() => {
    if (!user) return
    let active = true
    void listSavedPaymentMethods()
      .then((savedMethods) => { if (active) setMethods(savedMethods) })
      .catch((cause) => console.error('Unable to load saved payment methods.', cause))
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!selectedAddressId) {
      setQuote(null)
      return
    }
    let active = true
    void getOpenMarketCheckoutQuote(responseId, selectedAddressId, delivery)
      .then((nextQuote) => { if (active) setQuote(nextQuote) })
      .catch((cause) => {
        if (active) {
          setQuote(null)
          setError(cause instanceof Error ? cause.message : 'The checkout total could not be calculated.')
        }
      })
    return () => { active = false }
  }, [delivery, responseId, selectedAddressId])

  const request = detail ? mapRequest(detail.request) : null
  const response = detail ? mapResponse(detail) : null
  const address = addresses.find((item) => item.id === selectedAddressId)
  const challengeInfo = challenge ? challengeLabels[challenge.status] : null

  async function pay(event: React.FormEvent) {
    event.preventDefault()
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/open-market/checkout/${responseId}`)}`)
      return
    }
    if (!selectedAddressId) {
      setError('Choose a saved delivery address.')
      return
    }
    setProcessing(true)
    setError('')
    try {
      const result = await checkoutOpenMarketResponse(responseId, {
        addressId: selectedAddressId,
        deliveryMethod: delivery,
        saveCard: saveCard && !selectedMethodId,
        savedPaymentMethodId: selectedMethodId || undefined,
      })
      if (result.payment.authorizationUrl?.startsWith('https://')) {
        window.location.assign(result.payment.authorizationUrl)
        return
      }
      if (result.payment.status && result.payment.status in challengeLabels) {
        const status = result.payment.status as PaymentChallenge['status']
        setChallenge({
          orderId: result.order.id,
          reference: result.payment.reference,
          status,
          message: `Your bank requested ${challengeLabels[status].label.toLowerCase()} to authorize this charge.`,
        })
        return
      }
      if (result.payment.status === 'success') {
        router.push(`/checkout/success?order=${encodeURIComponent(result.order.id)}&reference=${encodeURIComponent(result.payment.reference)}`)
        return
      }
      throw new Error('Paystack did not return a checkout link or a supported verification step.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Checkout could not be started.'
      setError(message)
      toast.error(message)
    } finally {
      setProcessing(false)
    }
  }

  async function submitChallenge(event: React.FormEvent) {
    event.preventDefault()
    if (!challenge || !challengeInfo || !challengeValue.trim()) return
    setProcessing(true)
    setError('')
    try {
      const result = await submitPaymentChallenge(challenge.reference, challengeInfo.type, challengeValue.trim())
      if (result.status === 'success') {
        router.push(`/checkout/success?order=${encodeURIComponent(challenge.orderId)}&reference=${encodeURIComponent(result.reference)}`)
        return
      }
      if (result.status in challengeLabels) {
        const status = result.status as PaymentChallenge['status']
        setChallenge({ ...challenge, status, message: result.message ?? `Your bank requested ${challengeLabels[status].label.toLowerCase()}.` })
        setChallengeValue('')
        return
      }
      throw new Error(result.message ?? 'Your bank did not accept the verification details.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Bank verification failed.'
      setError(message)
    } finally {
      setProcessing(false)
    }
  }

  if (!user) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">Sign in to checkout</h1>
        <p className="text-muted-foreground">Your accepted offer and payment are linked to your account.</p>
        <Link href={`/login?next=${encodeURIComponent(`/open-market/checkout/${responseId}`)}`} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</Link>
      </main>
    )
  }

  if (!request || !response) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">{error || 'Loading accepted offer…'}</h1>
        <Link href="/open-market/requests?scope=mine" className="text-sm font-medium text-primary hover:underline">Back to my requests</Link>
      </main>
    )
  }

  if (response.status !== 'accepted') {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">This offer has not been accepted</h1>
        <Link href={`/open-market/requests/${request.id}`} className="text-sm font-medium text-primary hover:underline">Return to the request</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <Link href={`/open-market/requests/${request.id}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to request</Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Pay for accepted offer</h1>
      <p className="mt-2 text-sm text-muted-foreground">Payment is processed securely by Paystack. Funds remain held until delivery is confirmed.</p>
      <form onSubmit={challenge ? submitChallenge : pay} className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Truck className="size-4" aria-hidden="true" />Delivery details</h2>
            {addresses.length ? (
              <div className="mt-4 flex flex-col gap-3">
                <Field label="Saved address" htmlFor="market-address">
                  <Select id="market-address" value={selectedAddressId ?? ''} onChange={(event) => setSelectedAddressId(event.target.value)}>
                    <option value="">Choose an address</option>
                    {addresses.map((item) => <option key={item.id} value={item.id}>{`${item.fullName} · ${item.line1}, ${item.city}`}</option>)}
                  </Select>
                </Field>
                {address && <p className="text-sm text-muted-foreground">{`${address.phone} · ${address.city}, ${address.state}`}</p>}
                <Field label="Delivery method" htmlFor="market-delivery">
                  <Select id="market-delivery" value={delivery} onChange={(event) => setDelivery(event.target.value as typeof delivery)}>
                    <option value="standard">Standard delivery</option>
                    <option value="express">Express delivery</option>
                    <option value="pickup">Pickup</option>
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="mt-4 text-sm">
                <p className="text-muted-foreground">Add a saved delivery address before paying.</p>
                <Link href="/checkout/address" className="mt-3 inline-flex text-primary hover:underline">Add delivery address</Link>
              </div>
            )}
          </section>

          {challenge && challengeInfo ? (
            <section className="rounded-3xl border bg-card p-6">
              <h2 className="font-semibold">{challengeInfo.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{challenge.message}</p>
              <Field label={challengeInfo.label} htmlFor="market-challenge">
                <input id="market-challenge" autoComplete={challenge.status === 'send_otp' ? 'one-time-code' : 'off'} inputMode={challenge.status === 'send_otp' || challenge.status === 'send_pin' ? 'numeric' : undefined} type={challengeInfo.input} placeholder={challengeInfo.placeholder} value={challengeValue} onChange={(event) => setChallengeValue(event.target.value)} className={inputClass} required />
              </Field>
            </section>
          ) : (
            <section className="rounded-3xl border bg-card p-6">
              <h2 className="font-semibold">Pay securely with Paystack</h2>
              <p className="mt-2 text-sm text-muted-foreground">Card details are entered on Paystack. OpenMarketz never stores your card number or CVV.</p>
              {methods.length > 0 && (
                <fieldset className="mt-5 grid gap-3">
                  <legend className="mb-2 text-sm font-medium">Saved cards</legend>
                  {methods.map((method) => (
                    <label key={method.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3', selectedMethodId === method.id && 'border-primary bg-primary/5')}>
                      <input type="radio" name="market-card" checked={selectedMethodId === method.id} onChange={() => setSelectedMethodId(method.id)} />
                      <CreditCard className="size-4 text-primary" aria-hidden="true" />
                      <span className="text-sm">{`${method.cardType ?? 'Card'} ending ${method.last4}`}</span>
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3">
                    <input type="radio" name="market-card" checked={!selectedMethodId} onChange={() => setSelectedMethodId('')} />
                    <span className="text-sm">Use Paystack checkout</span>
                  </label>
                </fieldset>
              )}
              {!selectedMethodId && <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={saveCard} onChange={(event) => setSaveCard(event.target.checked)} /><span>Save this card using Paystack’s secure authorization reference.</span></label>}
            </section>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl border bg-card p-6 lg:sticky lg:top-32 lg:self-start">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Accepted offer</p>
          <h2 className="font-medium leading-snug">{request.title}</h2>
          <p className="text-sm text-muted-foreground">{`${response.sellerName} · delivers in ${response.deliveryDays} day${response.deliveryDays > 1 ? 's' : ''}`}</p>
          <p className="text-sm text-muted-foreground">{response.note}</p>
          <dl className="flex flex-col gap-2 border-t pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Offer price</dt><dd>{formatPrice(response.price)}</dd></div>
            {quote && <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{formatPrice(quote.deliveryFee)}</dd></div>}
            {quote && <div className="flex justify-between"><dt className="text-muted-foreground">Service fee</dt><dd>{formatPrice(quote.serviceFee)}</dd></div>}
            <div className="flex justify-between border-t pt-3 font-semibold"><dt>Total</dt><dd>{quote ? formatPrice(quote.total) : 'Calculating…'}</dd></div>
          </dl>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />Seller settlement is subject to delivery confirmation and admin approval.</p>
          <button type="submit" disabled={processing || (!challenge && (!quote || !address)) || (challenge !== null && !challengeValue.trim())} className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {processing ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />Processing…</> : challenge ? 'Continue verification' : `Pay securely${quote ? ` · ${formatPrice(quote.total)}` : ''}`}
          </button>
        </aside>
      </form>
    </main>
  )
}
