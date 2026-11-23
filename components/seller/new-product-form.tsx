'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { formatPrice } from '@/lib/data'
import type { Product } from '@/lib/data'
import { apiRequest, listPublicCategories, uploadMedia, type ApiCategory } from '@/lib/api'
import { useSeller } from '@/components/seller/seller-provider'
import { PageHeader } from '@/components/seller/seller-shell'
import { Field, FormAlert, Select, inputClass } from '@/components/forms'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useCatalogProducts } from '@/components/catalog-provider'

const conditions: NonNullable<Product['condition']>[] = ['Brand new', 'Foreign used', 'Locally used']

export function NewProductForm() {
  const router = useRouter()
  const { addListing } = useSeller()
  const { refresh: refreshCatalog } = useCatalogProducts()
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [activeCategories, setActiveCategories] = useState<ApiCategory[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [categoriesError, setCategoriesError] = useState('')
  const [condition, setCondition] = useState<NonNullable<Product['condition']>>('Brand new')
  const [price, setPrice] = useState('')
  const [compareAt, setCompareAt] = useState('')
  const [stock, setStock] = useState('1')
  const [description, setDescription] = useState('')
  const [highlights, setHighlights] = useState('')
  const [negotiable, setNegotiable] = useState(true)
  const [minPrice, setMinPrice] = useState('')
  const [freeDelivery, setFreeDelivery] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [videoPreview, setVideoPreview] = useState<string>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<'active' | 'draft' | null>(null)

  useEffect(() => {
    let active = true
    void listPublicCategories()
      .then((items) => {
        if (!active) return
        setActiveCategories(items)
        setCategory((current) => current || items[0]?.slug || '')
        setCategoriesError(items.length ? '' : 'The marketplace has no active product categories configured. An admin needs to add or activate categories before products can be listed.')
      })
      .catch((error: unknown) => {
        if (!active) return
        setCategoriesError(error instanceof Error ? error.message : 'Product categories could not be loaded.')
      })
      .finally(() => {
        if (active) setCategoriesLoaded(true)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file))
    setPreviews(urls)
    return () => urls.forEach(URL.revokeObjectURL)
  }, [files])

  useEffect(() => {
    if (!videoFile) return setVideoPreview(undefined)
    const url = URL.createObjectURL(videoFile)
    setVideoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [videoFile])

  const priceNum = Number(price)
  const floorNum = Number(minPrice)
  const fee = Math.round(priceNum * 0.05)

  function validate() {
    const e: Record<string, string> = {}
    if (!files.length) e.photos = 'Add at least one product photo.'
    if (name.trim().length < 4) e.name = 'Give your product a clear name.'
    if (!Number.isFinite(priceNum) || priceNum < 100) e.price = 'Enter a price of at least ₦100.'
    if (compareAt && Number(compareAt) <= priceNum) e.compareAt = 'Original price must be higher than the selling price.'
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) e.stock = 'Enter a whole number.'
    if (description.trim().length < 30) e.description = 'Describe the product in at least 30 characters.'
    if (negotiable && minPrice && (floorNum >= priceNum || floorNum <= 0)) e.minPrice = 'Lowest price must be below the selling price.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(status: 'active' | 'draft') {
    if (submitting) return
    if (!category || !activeCategories.some((item) => item.slug === category)) {
      toast.error(categoriesError || 'Choose an active product category.')
      return
    }
    if (!validate()) {
      toast.error('Please fix the highlighted fields.')
      return
    }

    setSubmitting(status)
    try {
      const uploadedPhotos = await Promise.all(files.map((file) => uploadMedia(file, 'PRODUCT')))
      const uploadedVideo = videoFile ? await uploadMedia(videoFile, 'PRODUCT') : undefined
      const mediaIds = [...uploadedPhotos.map((asset) => asset.id), ...(uploadedVideo ? [uploadedVideo.id] : [])]

      const payload = {
        name: name.trim(),
        brand: brand.trim() || 'Unbranded',
        categorySlug: category,
        condition: condition === 'Brand new' ? 'BRAND_NEW' : condition === 'Foreign used' ? 'FOREIGN_USED' : 'LOCALLY_USED',
        price: priceNum,
        compareAt: compareAt ? Number(compareAt) : undefined,
        stock: Number(stock),
        description: description.trim(),
        highlights: highlights.split('\n').map((h) => h.trim()).filter(Boolean),
        specifications: {},
        negotiable,
        minPrice: negotiable && minPrice ? floorNum : undefined,
        freeDelivery,
        mediaIds,
        status: status === 'active' ? 'ACTIVE' : 'DRAFT',
      }

      const created = await apiRequest<Record<string, unknown>>('seller/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const image = (created?.image as string | undefined) ?? uploadedPhotos[0]?.url ?? '/placeholder.svg'
      const gallery = Array.isArray(created?.gallery) && created.gallery.length ? (created.gallery as string[]) : [image]
      addListing({
        id: String(created?.id ?? ''),
        slug: String(created?.slug ?? ''),
        sellerId: String((created?.seller as { id?: string } | undefined)?.id ?? ''),
        name: String(created?.name ?? name.trim()),
        brand: String(created?.brand ?? (brand.trim() || 'Unbranded')),
        category: String(created?.category ?? category),
        condition: (created?.condition as Product['condition']) ?? condition,
        price: Number(created?.price ?? priceNum),
        compareAt: created?.compareAt ? Number(created.compareAt) : undefined,
        stock: Number(created?.stock ?? Number(stock)),
        description: String(created?.description ?? description.trim()),
        highlights: Array.isArray(created?.highlights) ? (created.highlights as string[]) : highlights.split('\n').map((h) => h.trim()).filter(Boolean),
        negotiable: Boolean(created?.negotiable ?? negotiable),
        minPrice: created?.minPrice ? Number(created.minPrice) : negotiable && minPrice ? floorNum : undefined,
        freeDelivery: Boolean(created?.freeDelivery ?? freeDelivery),
        image,
        gallery,
        status,
      })

      if (status === 'active') {
        try {
          await refreshCatalog()
        } catch (error) {
          console.error('Product was posted, but the public catalog could not be refreshed.', error)
        }
      }
      toast.success(status === 'active' ? 'Your product is live' : 'Draft saved')
      router.push('/seller/products')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The product could not be posted.')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div>
      <PageHeader title="Post a product" description="Buyers across Nigeria will see this listing on OpenMarketz." />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit('active')
        }}
        className="grid gap-6 lg:grid-cols-[1fr_300px]"
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
            <h2 className="font-semibold">Photos and video</h2>
            <label htmlFor="product-photos" className="text-sm font-medium">Product photos <span className="text-destructive">* At least one required</span></label>
            <input id="product-photos" type="file" accept="image/*" multiple onChange={(e) => setFiles((current) => [...current, ...Array.from(e.target.files ?? [])].slice(0, 11))} className={inputClass} aria-invalid={!!errors.photos} />
            {errors.photos && <p className="text-sm text-destructive" role="alert">{errors.photos}</p>}
            <p className="text-xs text-muted-foreground">Choose several JPG, PNG, or WebP photos. The first photo is the main image; extra photos and video are optional.</p>
            {previews.length > 0 && <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">{previews.map((src, index) => <li key={`${files[index]?.name}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border"><Image src={src} alt={`Product photo ${index + 1}`} fill unoptimized className="object-cover" /><button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} className="absolute right-1 top-1 rounded-full bg-background/90 px-2 py-1 text-xs">Remove</button>{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-background/90 px-2 py-1 text-[10px]">Main photo</span>}</li>)}</ul>}
            <label htmlFor="product-video" className="mt-2 text-sm font-medium">Product video <span className="text-muted-foreground">(optional)</span></label>
            <input id="product-video" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} className={inputClass} />
            {videoPreview && <div className="max-w-sm"><video src={videoPreview} controls className="w-full rounded-xl" /><button type="button" onClick={() => setVideoFile(null)} className="mt-2 text-sm text-destructive">Remove video</button></div>}
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
            <h2 className="font-semibold">Details</h2>
            <Field label="Product name" htmlFor="p-name" error={errors.name}>
              <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Samsung Galaxy A55 128GB" className={inputClass} aria-invalid={!!errors.name} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Brand" htmlFor="p-brand" optional>
                <input id="p-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Category" htmlFor="p-cat">
                <Select id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)} disabled={!categoriesLoaded || activeCategories.length === 0}>
                  {!category && <option value="">{categoriesLoaded ? 'No active categories' : 'Loading categories…'}</option>}
                  {activeCategories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </Select>
                {categoriesError && <p className="text-sm text-destructive" role="alert">{categoriesError}</p>}
              </Field>
              <Field label="Condition" htmlFor="p-cond">
                <Select id="p-cond" value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}>
                  {conditions.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="p-desc" error={errors.description}>
              <textarea id="p-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!errors.description} className={cn(inputClass, 'h-auto resize-none py-3')} />
            </Field>
            <Field label="Key highlights" htmlFor="p-hl" optional hint="One per line, e.g. 12-month warranty">
              <textarea id="p-hl" rows={3} value={highlights} onChange={(e) => setHighlights(e.target.value)} className={cn(inputClass, 'h-auto resize-none py-3')} />
            </Field>
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
            <h2 className="font-semibold">Price, stock & bargaining</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Selling price (₦)" htmlFor="p-price" error={errors.price}>
                <input id="p-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} className={inputClass} aria-invalid={!!errors.price} />
              </Field>
              <Field label="Original price (₦)" htmlFor="p-compare" optional error={errors.compareAt}>
                <input id="p-compare" inputMode="numeric" value={compareAt} onChange={(e) => setCompareAt(e.target.value.replace(/\D/g, ''))} className={inputClass} />
              </Field>
              <Field label="Quantity in stock" htmlFor="p-stock" error={errors.stock}>
                <input id="p-stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))} className={inputClass} />
              </Field>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-2xl bg-muted/50 p-4">
              <div>
                <p className="text-sm font-medium">Allow buyers to bargain</p>
                <p className="text-xs text-muted-foreground">Buyers can send offers. You choose to accept, counter or decline.</p>
              </div>
              <Switch checked={negotiable} onCheckedChange={setNegotiable} aria-label="Allow bargaining" />
            </div>
            {negotiable && (
              <Field label="Lowest price you'd accept (₦)" htmlFor="p-min" optional error={errors.minPrice} hint="Private. Offers below this are declined automatically.">
                <input id="p-min" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ''))} className={inputClass} />
              </Field>
            )}
            <div className="flex items-start justify-between gap-4 rounded-2xl bg-muted/50 p-4">
              <div>
                <p className="text-sm font-medium">Offer free delivery</p>
                <p className="text-xs text-muted-foreground">You cover the OpenMarketz delivery fee for this item.</p>
              </div>
              <Switch checked={freeDelivery} onCheckedChange={setFreeDelivery} aria-label="Offer free delivery" />
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-28 lg:h-fit">
          <div className="overflow-hidden rounded-3xl border bg-card">
            <div className="relative aspect-square bg-muted">
              {previews[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[0]} alt="" className="size-full object-cover" />
              ) : (
                <Image src={activeCategories.find((c) => c.slug === category)?.imageUrl ?? activeCategories.find((c) => c.slug === category)?.image ?? '/placeholder.svg'} alt="" fill sizes="300px" className="object-cover opacity-60" />
              )}
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Preview</p>
              <p className="truncate font-medium">{name || 'Your product name'}</p>
              <p className="font-display text-lg font-semibold">{priceNum ? formatPrice(priceNum) : '₦0'}</p>
              {negotiable && <p className="text-xs font-medium text-primary">Open to offers</p>}
            </div>
          </div>
          {priceNum > 0 && (
            <FormAlert tone="info">{`OpenMarketz commission (5%): ${formatPrice(fee)}. You receive ${formatPrice(priceNum - fee)} per sale after delivery.`}</FormAlert>
          )}
          <button type="submit" disabled={!!submitting} aria-busy={submitting === 'active'} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting === 'active' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting === 'active' ? 'Publishing…' : 'Publish product'}
          </button>
          <button type="button" disabled={!!submitting} aria-busy={submitting === 'draft'} onClick={() => void submit('draft')} className="flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">
            {submitting === 'draft' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting === 'draft' ? 'Saving…' : 'Save as draft'}
          </button>
        </aside>
      </form>
    </div>
  )
}
