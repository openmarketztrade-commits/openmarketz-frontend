import type { Metadata } from 'next'
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
      </div>
    </>
  )
}
