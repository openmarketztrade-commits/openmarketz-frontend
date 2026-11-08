'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { useCatalogProducts } from '@/components/catalog-provider'
import { ProductCard } from '@/components/product-card'
import { SectionHeading } from '@/components/section-heading'

function useCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const tick = () => setRemaining(Math.max(0, end.getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return remaining
}

export function FlashDeals() {
  const remaining = useCountdown()
  const { products } = useCatalogProducts()
  const deals = products.filter((product) => product.compareAt).sort((a, b) => {
    const discountA = ((a.compareAt! - a.price) / a.compareAt!) * 100
    const discountB = ((b.compareAt! - b.price) / b.compareAt!) * 100
    return discountB - discountA
  }).slice(0, 5)
  const parts =
    remaining === null
      ? ['--', '--', '--']
      : [3600000, 60000, 1000].map((unit, i) =>
          String(Math.floor((remaining / unit) % (i === 0 ? 24 : 60))).padStart(2, '0'),
        )

  return (
    <section id="deals" className="mx-auto max-w-7xl scroll-mt-40 px-4 pt-20 md:px-6" aria-labelledby="deals-heading">
      <SectionHeading eyebrow="Ends tonight" title="Flash deals" href="/products">
        <div className="hidden items-center gap-2 sm:flex" aria-label="Time remaining">
          <Zap className="size-4 fill-deal text-deal" aria-hidden="true" />
          {parts.map((p, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="min-w-9 rounded-lg bg-foreground px-2 py-1 text-center font-mono text-sm font-semibold tabular-nums text-background">
                {p}
              </span>
              {i < 2 && <span className="text-muted-foreground">:</span>}
            </span>
          ))}
        </div>
      </SectionHeading>
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
        {deals.map((p) => (
          <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-auto">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
