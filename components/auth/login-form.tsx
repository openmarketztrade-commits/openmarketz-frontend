'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-provider'
import { Field, FormAlert, PasswordInput, SubmitButton, inputClass, isEmail } from '@/components/forms'

export function LoginForm() {
  const { signIn } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/account'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nextErrors: typeof errors = {}
    if (!isEmail(email)) nextErrors.email = 'Enter a valid email address'
    if (!password) nextErrors.password = 'Enter your password'
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length) return
    setLoading(true)
    const res = await signIn(email, password)
    setLoading(false)
    if (!res.ok) return setFormError(res.error)
    toast.success('Welcome back!')
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/account'
    router.push(safeNext === '/account' ? res.redirectTo ?? safeNext : safeNext)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError && <FormAlert>{formError}</FormAlert>}

      <Field label="Email address" htmlFor="login-email" error={errors.email}>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email) || undefined}
          placeholder="you@example.com"
          className={inputClass}
        />
      </Field>

      <Field label="Password" htmlFor="login-password" error={errors.password}>
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password) || undefined}
          placeholder="Your password"
        />
      </Field>

      <div className="flex items-center justify-end text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline underline-offset-2">
          Forgot password?
        </Link>
      </div>

      <SubmitButton loading={loading}>{loading ? 'Signing in…' : 'Sign in'}</SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        {'New to OpenMarketz? '}
        <Link href={`/signup${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-primary hover:underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  )
}
