import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { ApiError, getPublicStore, listPublicStoreProducts, type CatalogProductApi } from '@/lib/api'
import type { Product } from '@/lib/data'
import { StoreHeader } from '@/components/store/store-header'
import { ListingView } from '@/components/listing/listing-view'
import { StoreReviews } from '@/components/store/store-reviews'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

async function getStore(slug: string) {
  try {
    const [store, page] = await Promise.all([getPublicStore(slug), listPublicStoreProducts(slug)])
    return { store, products: page.items.map(mapStoreProduct), error: null }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    console.error('Unable to load public store.', error)
    return { store: null, products: [], error: 'This store could not be loaded. Please try again later.' }
  }
}

function mapStoreProduct(product: CatalogProductApi): Product & { sellerSlug?: string } {
  const condition = product.condition === 'BRAND_NEW' ? 'Brand new' : product.condition === 'FOREIGN_USED' ? 'Foreign used' : product.condition === 'LOCALLY_USED' ? 'Locally used' : undefined
  return {
    id: product.id, slug: product.slug, name: product.name, brand: product.brand, category: product.category,
    sellerId: product.seller.id, sellerSlug: product.seller.slug, sellerName: product.seller.name,
    price: product.price, compareAt: product.compareAt, rating: product.rating ?? 0, reviews: product.reviews ?? 0,
    sold: product.sold ?? 0, stock: product.stock, image: product.image || '/placeholder.svg',
    gallery: product.gallery?.length ? product.gallery : [product.image || '/placeholder.svg'],
    freeDelivery: product.freeDelivery, description: product.description, highlights: product.highlights,
    specs: Object.entries(product.specs ?? {}).map(([label, value]) => ({ label, value })),
    variants: product.variants?.map(({ name, options }) => ({ name, options })), negotiable: product.negotiable,
    condition, unitLabel: product.unitLabel, video: product.video ?? undefined,
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const result = await getStore(slug)
  if (!result.store) return { title: 'Store unavailable' }
  return { title: result.store.name, description: result.store.tagline || result.store.about }
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { store, products, error } = await getStore(slug)
  if (!store) return <p role="alert" className="mx-auto max-w-3xl px-4 py-20 text-center text-muted-foreground">{error}</p>

  return (
    <>
      <StoreHeader store={store} />
      <div className="mx-auto max-w-7xl px-4 pt-10 md:px-6">
        <Tabs defaultValue="products" className="gap-8">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({store.reviewCount.toLocaleString()})</TabsTrigger>
            <TabsTrigger value="about">About the store</TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            <ListingView products={products} showCategoryFilter emptyMessage="This store has no published products." sellerSlug={slug} />
          </TabsContent>
          <TabsContent value="reviews">
            <StoreReviews slug={slug} />
          </TabsContent>
          <TabsContent value="about">
            <div className="grid gap-8 md:grid-cols-[1fr_320px]">
              <div>
                <h2 className="font-display text-xl font-semibold">{`About ${store.name}`}</h2>
                <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{store.about || 'The seller has not added a store description yet.'}</p>
              </div>
              <div className="rounded-2xl bg-secondary p-5">
                <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
                <p className="mt-3 font-medium">{store.verified ? 'Verified by OpenMarketz' : 'Seller not verified'}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{store.verified ? 'This seller has completed the marketplace verification process.' : 'Seller verification has not been confirmed.'}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
