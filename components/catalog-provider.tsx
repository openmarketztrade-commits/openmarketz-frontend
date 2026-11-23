'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { listPublicCategories, listPublicProducts, type ApiCategory, type CatalogProductApi } from '@/lib/api'
import { type Product } from '@/lib/data'

export function mapCatalogProduct(product: CatalogProductApi): Product & { sellerSlug?: string; sellerName?: string } {
  const condition =
    product.condition === 'BRAND_NEW'
      ? 'Brand new'
      : product.condition === 'FOREIGN_USED'
        ? 'Foreign used'
        : product.condition === 'LOCALLY_USED'
          ? 'Locally used'
          : undefined

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    sellerId: product.seller.id,
    sellerSlug: product.seller.slug,
    sellerName: product.seller.name,
    price: product.price,
    compareAt: product.compareAt,
    rating: product.rating ?? 0,
    reviews: product.reviews ?? 0,
    sold: product.sold ?? 0,
    stock: product.stock,
    image: product.image || '/placeholder.svg',
    gallery: product.gallery?.length ? product.gallery : [product.image || '/placeholder.svg'],
    freeDelivery: product.freeDelivery,
    description: product.description,
    highlights: product.highlights,
    specs: Object.entries(product.specs ?? {}).map(([label, value]) => ({ label, value })),
    variants: product.variants?.map((variant) => ({
      name: variant.name,
      options: variant.options,
    })),
    negotiable: product.negotiable,
    condition,
    unitLabel: product.unitLabel,
    video: product.video ?? undefined,
  }
}

type CatalogContextValue = {
  products: Product[]
  categories: ApiCategory[]
  categoriesLoaded: boolean
  categoriesError: string | null
  loaded: boolean
  error: string | null
  refresh: () => Promise<void>
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const items = await listPublicProducts()
      setProducts(items.map(mapCatalogProduct))
      setError(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Products could not be loaded.'
      setError(message)
      throw cause
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
      .catch((error: unknown) => {
        console.error('Unable to load public products from the marketplace API.', error)
      })
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    void listPublicCategories()
      .then((items) => {
        if (!cancelled) {
          setCategories(items)
          setCategoriesError(null)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : 'Categories could not be loaded.'
          setCategoriesError(message)
          console.error('Unable to load public categories from the marketplace API.', cause)
        }
      })
      .finally(() => { if (!cancelled) setCategoriesLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const value = useMemo(
    () => ({ products, loaded, error, refresh, categories, categoriesLoaded, categoriesError }),
    [products, loaded, error, refresh, categories, categoriesLoaded, categoriesError],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalogProducts() {
  const context = useContext(CatalogContext)
  if (!context) throw new Error('useCatalogProducts must be used within CatalogProvider')
  return context
}
