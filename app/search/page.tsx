import type { Metadata } from 'next'
import Link from 'next/link'
import { categories } from '@/lib/data'
import { ListingView } from '@/components/listing/listing-view'
import { PageIntro } from '@/components/listing/page-intro'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams
  return { title: q ? `Results for "${q}"` : 'Search' }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const query = q.trim()
  return (
    <>
      <PageIntro
        title={query ? `Results for "${query}"` : 'Search'}
        description={
          query
            ? 'Search products from the marketplace catalog.'
            : 'Browse everything, or use the search bar to find something specific.'
        }
        crumbs={[{ label: 'Search' }]}
      />
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <ListingView key={query} products={[]} query={query} showCategoryFilter />
        {query && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`} className="rounded-full border bg-background px-4 py-1.5 text-sm hover:bg-muted">
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
