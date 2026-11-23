'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ListingView } from '@/components/listing/listing-view'
import { PageIntro } from '@/components/listing/page-intro'
import { useCatalogProducts } from '@/components/catalog-provider'
import { cn } from '@/lib/utils'

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const { categories, categoriesLoaded, categoriesError } = useCatalogProducts()
  const category = categories.find((item) => item.slug === slug)

  if (!categoriesLoaded) {
    return <div role="status" className="mx-auto max-w-7xl px-4 py-12 text-sm text-muted-foreground md:px-6">Loading categories…</div>
  }

  if (!category) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center md:px-6">
        <h1 className="font-display text-2xl font-semibold">Category unavailable</h1>
        <p role={categoriesError ? 'alert' : undefined} className="mt-2 text-sm text-muted-foreground">
          {categoriesError || 'This category is no longer available.'}
        </p>
        <Link href="/products" className="mt-5 inline-flex text-sm font-medium text-primary">Browse all products</Link>
      </div>
    )
  }

  return (
    <>
      <PageIntro
        title={category.name}
        description={`Browse products in ${category.name}.`}
        crumbs={[{ label: 'All products', href: '/products' }, { label: category.name }]}
      />
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <nav aria-label="Other categories" className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {categories.map((item) => (
            <Link
              key={item.slug}
              href={`/category/${item.slug}`}
              aria-current={item.slug === slug ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors',
                item.slug === slug ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted',
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <ListingView products={[]} categorySlug={slug} />
      </div>
    </>
  )
}
