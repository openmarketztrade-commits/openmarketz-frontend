'use client'

import { useEffect, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { searchAddressPlaces, type AddressPrediction } from '@/lib/api'
import { fieldClass } from '@/components/checkout/checkout-ui'

export function AddressPlacePicker({
  value,
  placeId,
  onChange,
  inputId,
}: {
  value: string
  placeId?: string
  onChange: (placeId: string | undefined, description: string) => void
  inputId: string
}) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<AddressPrediction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    if (placeId || query.trim().length < 3) {
      setSuggestions([])
      setError('')
      setLoading(false)
      return
    }

    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchAddressPlaces(query.trim())
        .then((results) => {
          if (active) {
            setSuggestions(results)
            setError('')
          }
        })
        .catch((cause) => {
          if (active) {
            setSuggestions([])
            setError(cause instanceof Error ? cause.message : 'Address suggestions could not be loaded.')
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [placeId, query])

  function update(value: string) {
    setQuery(value)
    setError('')
    onChange(undefined, value)
  }

  function choose(suggestion: AddressPrediction) {
    setQuery(suggestion.description)
    setSuggestions([])
    onChange(suggestion.placeId, suggestion.description)
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={inputId}
          autoComplete="street-address"
          value={query}
          onChange={(event) => update(event.target.value)}
          aria-autocomplete="list"
          aria-controls={`${inputId}-suggestions`}
          className={`${fieldClass} pr-10`}
          placeholder="Search for a street address"
        />
        {loading && <Loader2 className="absolute right-3 top-3.5 size-5 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {suggestions.length > 0 && (
        <ul id={`${inputId}-suggestions`} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border bg-card p-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => choose(suggestion)}
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{suggestion.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      {!placeId && query.trim().length >= 3 && !loading && suggestions.length === 0 && !error && (
        <p className="mt-1 text-xs text-muted-foreground">Select an address suggestion to save an accurate delivery location.</p>
      )}
    </div>
  )
}
