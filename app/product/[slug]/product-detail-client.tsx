'use client'

import Link from 'next/link'
import { getCategory, getSeller } from '@/lib/data'
import { useCatalogProducts } from '@/components/catalog-provider'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ProductGallery } from '@/components/product/product-gallery'
import { PurchasePanel } from '@/components/product/purchase-panel'
import { SellerCard } from '@/components/product/seller-card'
import { ProductDetails } from '@/components/product/product-details'
import { ProductFeatures } from '@/components/product/product-features'
import { ProductCard } from '@/components/product-card'
import { SectionHeading } from '@/components/section-heading'

export function ProductDetailClient({ slug }: { slug: string }) {
  const { products, loaded, error } = useCatalogProducts()
  const product = products.find((item) => item.slug === slug)
  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center md:px-6">
        <p className="font-medium">{!loaded ? 'Loading product…' : error ? `Products could not be loaded: ${error}` : 'Product not found.'}</p>
        <Link href="/products" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          Browse products
        </Link>
      </div>
    )
  }

  const category = getCategory(product.category)
  const seller = getSeller(product.sellerId)
  const sameCategory = products.filter((item) => item.category === product.category && item.id !== product.id)
  const related = [...sameCategory, ...products.filter((item) => item.category !== product.category && item.id !== product.id)].slice(0, 5)

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
      <Breadcrumbs
        items={[
          ...(category ? [{ label: category.name, href: `/category/${category.slug}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="lg:sticky lg:top-40 lg:self-start">
          <ProductGallery images={product.gallery} name={product.name} video={product.video} />
        </div>
        <PurchasePanel product={product} />
      </div>

      <div className="mt-16">
        <ProductFeatures product={product} />
      </div>

      {seller && (
        <div className="mt-16">
          <SellerCard seller={seller} />
        </div>
      )}

      {product.sellerName && !seller && (
        <div className="mt-16 rounded-2xl border p-5">
          <p className="font-medium">{product.sellerName}</p>
        </div>
      )}

      <section className="mt-16" aria-label="Product details">
        <ProductDetails product={product} />
      </section>

      <section className="mt-20">
        <SectionHeading title="You may also like" href={category ? `/category/${category.slug}` : '/products'} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {related.map((item) => <ProductCard key={item.id} product={item} />)}
        </div>
      </section>
    </div>
  )
}
