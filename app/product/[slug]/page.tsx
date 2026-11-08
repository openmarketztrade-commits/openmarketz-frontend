import type { Metadata } from 'next'
import { ProductDetailClient } from './product-detail-client'

export const dynamicParams = true

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: slug, description: 'View product details on OpenMarketz.' }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProductDetailClient slug={slug} />
}
