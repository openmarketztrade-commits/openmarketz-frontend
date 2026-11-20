'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { countries, type CountryCode } from '@/lib/geo'
import { ApiError, apiRequest, errorMessage, getAccessToken, setAccessToken } from '@/lib/api'

export type Gender = 'female' | 'male' | 'prefer-not'

export type SellerApplication = {
  brandName: string
  handle: string
  logoUrl?: string
  businessEmail: string
  country: CountryCode
  idType: string
  bannerUrl?: string
  status: 'under_review' | 'approved' | 'rejected'
  submittedAt: number
}

export type SellerApplicationInput = {
  brandName: string
  handle: string
  logoUrl?: string
  bannerUrl?: string
  logoMediaId: string
  bannerMediaId: string
  description: string
  categories: string[]
  businessType: 'individual' | 'registered'
  registrationNumber?: string
  businessPhone: string
  businessEmail: string
  country: CountryCode
  region: string
  city: string
  address: string
  ownerName: string
  ownerBirthDate: string
  idType: string
  idNumber: string
  idDocumentMediaId: string
  selfieMediaId: string
  bankName: string
  accountNumber: string
  accountName: string
}

export type User = {
  id: string
  role: string
  firstName: string
  lastName: string
  email: string
  emailVerified: boolean
  phone: string
  country: CountryCode
  region: string
  birthDate: string
  gender: Gender
  avatarUrl?: string
  marketing: boolean
  twoFactor: boolean
  createdAt: number
  seller?: SellerApplication
}

export type SignUpInput = Omit<User, 'id' | 'role' | 'emailVerified' | 'twoFactor' | 'createdAt' | 'seller' | 'avatarUrl'> & {
  password: string
}

type Result = { ok: true } | { ok: false; error: string }
type SignInResult = { ok: true; redirectTo?: string } | { ok: false; error: string }

type ApiUser = {
  id: string
  role: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  country?: string
  region?: string | null
  birthDate?: string | null
  gender?: string | null
  emailVerifiedAt?: string | null
  marketingOptIn?: boolean
  twoFactorEnabled?: boolean
  avatarMedia?: { secureUrl: string } | null
  createdAt: string
}

type AuthResponse = { accessToken: string; user: ApiUser }

type ApiSellerApplication = {
  brandName: string
  handle: string
  businessEmail: string
  country: string
  idType: string
  status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'
  submittedAt: string
  logoMedia?: { secureUrl: string | null } | null
  bannerMedia?: { secureUrl: string | null } | null
}

function mapSellerApplication(application: ApiSellerApplication): SellerApplication {
  const status: SellerApplication['status'] =
    application.status === 'APPROVED'
      ? 'approved'
      : application.status === 'REJECTED'
        ? 'rejected'
        : 'under_review'
  return {
    brandName: application.brandName,
    handle: application.handle,
    businessEmail: application.businessEmail,
    country: countries.find((item) => item.code === application.country)?.code ?? 'NG',
    idType: application.idType,
    logoUrl: application.logoMedia?.secureUrl ?? undefined,
    bannerUrl: application.bannerMedia?.secureUrl ?? undefined,
    status,
    submittedAt: new Date(application.submittedAt).getTime(),
  }
}

type AuthContextValue = {
  user: User | null
  authReady: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signUp: (input: SignUpInput) => Promise<Result>
  verifyEmail: (email: string, code: string) => Promise<Result>
  resendVerification: (email: string) => Promise<Result>
  signOut: () => Promise<Result>
  requestPasswordReset: (email: string) => Promise<Result>
  resetPassword: (email: string, code: string, password: string) => Promise<Result>
  updateProfile: (patch: Partial<Omit<User, 'id' | 'email' | 'createdAt'>>) => Promise<Result>
  changePassword: (current: string, next: string) => Promise<Result>
  submitSellerApplication: (app: SellerApplicationInput) => Promise<Result>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapApiUser(apiUser: ApiUser): User {
  const country = countries.find((item) => item.code === apiUser.country)?.code ?? 'NG'
  const gender = apiUser.gender === 'female' || apiUser.gender === 'male' ? apiUser.gender : 'prefer-not'

  return {
    id: apiUser.id,
    role: apiUser.role,
    firstName: apiUser.firstName,
    lastName: apiUser.lastName,
    email: apiUser.email,
    emailVerified: Boolean(apiUser.emailVerifiedAt),
    phone: apiUser.phone ?? '',
    country,
    region: apiUser.region ?? '',
    birthDate: apiUser.birthDate ? apiUser.birthDate.slice(0, 10) : '',
    gender,
    avatarUrl: apiUser.avatarMedia?.secureUrl,
    marketing: Boolean(apiUser.marketingOptIn),
    twoFactor: Boolean(apiUser.twoFactorEnabled),
    createdAt: new Date(apiUser.createdAt).getTime(),
  }
}

function resultError(error: unknown): Result {
  return { ok: false, error: errorMessage(error) }
}

async function loadSellerApplication(token: string): Promise<SellerApplication | undefined> {
  const application = await apiRequest<ApiSellerApplication | null>(
    'seller/applications/me',
    {},
    { accessToken: token },
  )
  return application ? mapSellerApplication(application) : undefined
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const session = await apiRequest<{ accessToken: string }>(
          'auth/refresh',
          { method: 'POST' },
          { authenticated: false },
        )
        setAccessToken(session.accessToken)
        const apiUser = await apiRequest<ApiUser>(
          'auth/me',
          {},
          { accessToken: session.accessToken },
        )
        const seller = await loadSellerApplication(session.accessToken)
        if (active) setUser({ ...mapApiUser(apiUser), seller })
      } catch (error) {
        setAccessToken(null)
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error('Unable to restore the OpenMarketz session.', error)
        }
      } finally {
        if (active) setAuthReady(true)
      }
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      try {
      const session = await apiRequest<AuthResponse>(
        'auth/login',
        { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) },
        { authenticated: false },
      )
      setAccessToken(session.accessToken)
      const seller = await loadSellerApplication(session.accessToken)
      setUser({ ...mapApiUser(session.user), seller })
        return {
          ok: true,
          redirectTo: seller
            ? seller.status === 'approved'
              ? '/seller'
              : '/sell'
            : undefined,
        }
      } catch (error) {
        return resultError(error)
      }
    },
    [],
  )

  const signUp = useCallback<AuthContextValue['signUp']>(async (input) => {
    try {
      await apiRequest(
        'auth/signup',
        {
          method: 'POST',
          body: JSON.stringify({
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            email: input.email.trim(),
            password: input.password,
            phone: input.phone.trim(),
            country: input.country,
            region: input.region,
            birthDate: input.birthDate,
            gender: input.gender,
            marketingOptIn: input.marketing,
          }),
        },
        { authenticated: false },
      )
      return { ok: true }
    } catch (error) {
      return resultError(error)
    }
  }, [])

  const verifyEmail = useCallback<AuthContextValue['verifyEmail']>(async (email, code) => {
    try {
      const session = await apiRequest<AuthResponse>(
        'auth/verify-email',
        { method: 'POST', body: JSON.stringify({ email: email.trim(), code }) },
        { authenticated: false },
      )
      setAccessToken(session.accessToken)
      const seller = await loadSellerApplication(session.accessToken)
      setUser({ ...mapApiUser(session.user), seller })
      return { ok: true }
    } catch (error) {
      return resultError(error)
    }
  }, [])

  const resendVerification = useCallback<AuthContextValue['resendVerification']>(async (email) => {
    try {
      await apiRequest(
        'auth/resend-verification',
        { method: 'POST', body: JSON.stringify({ email: email.trim() }) },
        { authenticated: false },
      )
      return { ok: true }
    } catch (error) {
      return resultError(error)
    }
  }, [])

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    try {
      await apiRequest('auth/logout', { method: 'POST' })
      return { ok: true }
    } catch (error) {
      return resultError(error)
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const requestPasswordReset = useCallback<AuthContextValue['requestPasswordReset']>(async (email) => {
    try {
      await apiRequest(
        'auth/forgot-password',
        { method: 'POST', body: JSON.stringify({ email: email.trim() }) },
        { authenticated: false },
      )
      return { ok: true }
    } catch (error) {
      return resultError(error)
    }
  }, [])

  const resetPassword = useCallback<AuthContextValue['resetPassword']>(async (email, code, password) => {
    try {
      await apiRequest(
        'auth/reset-password',
        { method: 'POST', body: JSON.stringify({ email: email.trim(), code, newPassword: password }) },
        { authenticated: false },
      )
      return { ok: true }
    } catch (error) {
      return resultError(error)
    }
  }, [])

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(async (patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current))
    return { ok: true }
  }, [])

  const changePassword = useCallback<AuthContextValue['changePassword']>(async () => ({
    ok: false,
    error: 'Password changes are not available yet. Use “Forgot password?” to reset your password.',
  }), [])

  const submitSellerApplication = useCallback<AuthContextValue['submitSellerApplication']>(
    async (app) => {
      try {
        const response = await apiRequest<{ application: { status: ApiSellerApplication['status']; submittedAt: string } }>(
          'seller/applications',
          {
            method: 'POST',
            body: JSON.stringify({
              brandName: app.brandName,
              handle: app.handle,
              description: app.description,
              categories: app.categories,
              businessType: app.businessType,
              registrationNumber: app.registrationNumber,
              businessPhone: app.businessPhone,
              businessEmail: app.businessEmail,
              country: app.country,
              region: app.region,
              city: app.city,
              address: app.address,
              ownerName: app.ownerName,
              ownerBirthDate: app.ownerBirthDate,
              idType: app.idType,
              idNumber: app.idNumber,
              bankName: app.bankName,
              accountNumber: app.accountNumber,
              accountName: app.accountName,
              logoMediaId: app.logoMediaId,
              bannerMediaId: app.bannerMediaId,
              idDocumentMediaId: app.idDocumentMediaId,
              selfieMediaId: app.selfieMediaId,
            }),
          },
        )
        const seller: SellerApplication = {
          brandName: app.brandName,
          handle: app.handle,
          logoUrl: app.logoUrl,
          bannerUrl: app.bannerUrl,
          businessEmail: app.businessEmail,
          country: app.country,
          idType: app.idType,
          status:
            response.application.status === 'APPROVED'
              ? 'approved'
              : response.application.status === 'REJECTED'
                ? 'rejected'
                : 'under_review',
          submittedAt: new Date(response.application.submittedAt).getTime(),
        }
        setUser((current) => (current ? { ...current, seller } : current))
        return { ok: true }
      } catch (error) {
        return resultError(error)
      }
    },
    [],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authReady,
      signIn,
      signUp,
      verifyEmail,
      resendVerification,
      signOut,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      changePassword,
      submitSellerApplication,
    }),
    [
      user,
      authReady,
      signIn,
      signUp,
      verifyEmail,
      resendVerification,
      signOut,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      changePassword,
      submitSellerApplication,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export const initialsOf = (u: Pick<User, 'firstName' | 'lastName'>) =>
  `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase()
