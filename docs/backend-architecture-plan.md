# OpenMarketz Backend Integration Plan

## 1. Purpose and scope

This document describes how I would build a separate NestJS backend and connect it to the existing Next.js storefront. It is an implementation plan, not an implementation: no application code, services, credentials, or infrastructure are changed by this document.

The backend must turn the current demo flows into persistent, authenticated, multi-user marketplace workflows. It must cover the existing customer, seller, Open Market, messaging, checkout, wishlist/gifting, notification, and support surfaces—not only product browsing.

## 2. What the current frontend contains

The app is a Next.js App Router frontend. Its state is currently held in client-side React context providers, with seeded catalogue and demo records:

- [`components/auth-provider.tsx`](../components/auth-provider.tsx): demo sign-up/sign-in, email verification, password reset/change, profile updates, and seller application. The demo user/session and data exist only in memory.
- [`components/shop-provider.tsx`](../components/shop-provider.tsx): cart, saved products, product bargain offers, conversations, addresses, checkout/order creation, and sample order data.
- [`components/seller/seller-provider.tsx`](../components/seller/seller-provider.tsx): seller product listings, bargain responses, order/dispatch updates, and alerts.
- [`components/open-market/open-market-provider.tsx`](../components/open-market/open-market-provider.tsx): buyer requests, seller responses, and accepting/declining responses.
- [`components/wishlist-provider.tsx`](../components/wishlist-provider.tsx): gift lists and simulated gifts. Shared lists are currently encoded into a client-generated URL rather than loaded from a server.
- [`components/notifications-provider.tsx`](../components/notifications-provider.tsx): in-memory notifications and channel preferences.
- [`lib/data.ts`](../lib/data.ts), [`lib/seller.ts`](../lib/seller.ts), and [`lib/open-market.ts`](../lib/open-market.ts): frontend catalogue, demo sellers, and seed records.

There are no NestJS services, Next.js API route handlers, database schemas/migrations, or real payment/upload integrations in the project today. Several UI actions only simulate success:

- [`components/checkout/payment-view.tsx`](../components/checkout/payment-view.tsx) displays card fields and fake transfer/USSD instructions, then creates a local order after a timeout.
- [`components/open-market/offer-checkout.tsx`](../components/open-market/offer-checkout.tsx) and [`components/wishlist/shared-list-view.tsx`](../components/wishlist/shared-list-view.tsx) simulate payment and escrow.
- [`components/seller/new-product-form.tsx`](../components/seller/new-product-form.tsx) currently falls back to category artwork instead of uploading the selected product photo.
- Seller onboarding uses browser object URLs for logo/banner/identity uploads; those URLs are not durable server media.
- Voice notes and chat messages are local mock behavior. Buyer-side offer responses are simulated, and seller-side counter offers need a consistent buyer-facing state.
- Ratings, review counts, follower counts, product sales, and some dashboards are seeded presentation data; the document below treats them as backend-backed capabilities only where they are exposed in the UI.

The frontend is the source of the screens and initial business rules, but all authorization, price calculation, stock checks, payment confirmation, offer state changes, and durable storage must be enforced by the backend.

## 3. Recommended architecture

### Services and responsibilities

1. **Existing Next.js app** — presentation, form interaction, route navigation, and server-side rendering of public catalogue/store pages. Replace provider mutations and seed data with typed API calls.
2. **Separate NestJS API** — REST API under a versioned prefix such as `/api/v1`; owns authentication, business rules, persistence, uploads authorization, payment lifecycle, notifications, and admin/seller permissions.
3. **PostgreSQL + Prisma** — authoritative relational store for users, sellers, products, offers, orders, payments, messages, wishlists, and audit history. Use database transactions for operations that must succeed or fail together.
4. **Redis (recommended when needed)** — rate-limit counters, short-lived payment/upload state, distributed job queues, and WebSocket scaling. Do not make Redis the source of truth.
5. **Cloudinary** — product/store/market-request media uploads and transformations. Keep media ownership and Cloudinary public IDs in the database; never accept an arbitrary client-supplied Cloudinary URL as proof of upload.
6. **Paystack** — hosted/embedded payment initialization on the server, payment verification, and signed webhooks. Never collect or store raw card numbers or CVV in the app.
7. **Email/SMS provider (choose during implementation)** — verification/reset emails, order and offer notifications, and optional SMS. The provider should sit behind a NestJS notification adapter so it can be replaced without changing domain logic.
8. **WebSocket gateway (recommended for live chat)** — authenticated Socket.IO or NestJS WebSocket events for messages, typing state, and unread updates. Persist every message before broadcasting; clients can still fetch conversation history over REST.

### Deployment shape

Deploy the API independently from Next.js, for example at `api.<domain>`, with PostgreSQL, managed Redis if enabled, Cloudinary, and Paystack configured through server-side environment variables. Configure exact CORS origins, HTTPS, health/readiness endpoints, structured logs, backups, and monitoring. Keep the frontend and backend API origins configurable by environment.

The API should publish OpenAPI/Swagger documentation and generated or shared TypeScript request/response types. Keep the frontend independent of NestJS internals.

## 4. Backend module boundaries

Suggested NestJS modules:

- `AuthModule`, `UsersModule`, `SessionsModule`
- `SellerModule`, `SellerApplicationsModule`, `PayoutAccountsModule`
- `CatalogModule`, `CategoriesModule`, `StoresModule`, `ReviewsModule`
- `MediaModule` (Cloudinary signing/asset ownership)
- `CartModule`, `AddressesModule`, `CheckoutModule`, `OrdersModule`
- `PaymentsModule` (Paystack initialization, verification, webhook, refunds)
- `OffersModule` (product bargains and counter offers)
- `OpenMarketModule` (requests, seller responses, acceptance and checkout)
- `WishlistModule` (private lists, share tokens, gifting)
- `MessagingModule` (conversations, messages, attachments, read state)
- `NotificationsModule` (in-app, email/SMS preferences and delivery)
- `SupportModule` (complaint tickets)
- `AdminModule` (seller approval, moderation, refunds, audit views)
- `HealthModule`

Controllers should be thin. Put state transitions and rules in services, validate request DTOs, and persist through repositories/Prisma. Use explicit DTOs rather than exposing ORM objects directly.

## 5. Proposed persistent data model

Use UUIDs (or another opaque identifier) for internal primary keys. Use timestamps in UTC and integer minor currency units for money; the initial market is Nigeria, so API responses should include the currency code (`NGN`) and avoid floating-point arithmetic.

| Entity | Important fields and relationships |
|---|---|
| `User` | email (normalized, unique), password hash, names, phone, country/region, birth date, gender, avatar media, email verification and account status |
| `AuthSession` | user, hashed refresh/session token, expiry, revoked time, device metadata |
| `EmailVerification` / `PasswordReset` | user/email, hashed one-time token/code, expiry, consumed time, attempt limits |
| `SellerApplication` | owner user, brand/handle, description/categories, business type, legal/business details, private KYC media references, status (`draft`, `under_review`, `approved`, `rejected`), reviewer and timestamps |
| `SellerStore` | owner user, unique slug/handle, public branding, verification status, public profile and operational settings |
| `PayoutAccount` | seller, bank code/name, encrypted or provider-tokenized account data, verified account name, status; do not expose account number in public seller APIs |
| `MediaAsset` | owner, Cloudinary public ID, resource type, secure URL, dimensions/format/size, purpose, visibility, upload and deletion state |
| `Category` | stable slug, name, image/media reference, description, active/sort order |
| `Product` | seller, category, slug, name/brand/description/highlights/specifications, condition, price/compare-at price, negotiability and private minimum price, stock/status, delivery options |
| `ProductMedia` | product, media asset, ordering, image/video role and alt text |
| `ProductVariant` / `VariantOption` | product variant names and allowed options; selected options are snapshotted on order lines |
| `Cart` / `CartItem` | owner user or secure guest-cart token, product/variant, quantity; prices are always refreshed by the server at checkout |
| `Address` | owner user, recipient, phone, structured address, delivery notes/label, default flag |
| `ProductOffer` | buyer, seller, product, quantity, list-price snapshot, buyer price, optional counter price, message/voice media, state and expiry |
| `OpenMarketRequest` | buyer, title/details/category, budget range, quantity, condition, location, needed-by date, optional media, state and expiry |
| `OpenMarketResponse` | request, seller, optional linked product, price, delivery estimate, note, state; enforce one winning response per request |
| `Order` / `OrderItem` | buyer, public order number, address/delivery snapshots, item/product/variant/price snapshots, subtotal/fees/total, fulfillment and cancellation state |
| `Payment` | order or gift, Paystack reference, amount/currency, provider status, verified timestamp, failure details, idempotency key |
| `PaymentEvent` / `LedgerEntry` | immutable provider event and internal debit/credit/fee/reversal entries; unique provider event/reference for idempotency |
| `Shipment` | order, fulfilment method, carrier/hub, tracking/waybill, status, timestamps and proof-of-delivery metadata |
| `SellerPayout` | seller, eligible order/ledger balance, destination account, transfer reference, status and reconciliation data |
| `Conversation` / `Message` | participants, optional product/order context, sender, text, voice/image media, delivery/read timestamps; participant membership is enforced |
| `Wishlist` / `WishlistItem` | owner, title/note/occasion/event date, product ordering, visibility, random revocable share token |
| `GiftContribution` | list/item, giver (nullable for guest), anonymity, message, order/payment reference and state; only paid/verified gifts count as funded |
| `Notification` / `NotificationPreference` | owner, type, title/body/link, read time, channel settings and delivery state |
| `SupportTicket` / `SupportMessage` | requester, contact, topic, optional order/request reference, assigned status, conversation and timestamps |
| `Review` | buyer/order item, seller/product, rating/text, moderation state; one eligible review per fulfilled item |
| `AuditEvent` | actor, action, target, safe metadata, request/correlation ID and timestamp for sensitive/admin/payment transitions |

Use foreign keys, unique constraints, indexes on common search/filter and owner/status/date queries, and soft deletion only where restoration or audit requirements justify it. Avoid duplicating derived values such as unread counts unless there is a measured need.

## 6. API surface and frontend coverage

All routes below are proposals. Public routes can be read anonymously; all mutations require an authenticated user unless specifically marked guest-capable. Use pagination, stable sorting, filtering, and consistent validation/error response formats.

| Frontend capability | Proposed endpoint family | Main operations |
|---|---|---|
| Sign up, sign in, verify email, reset/change password, profile, account security | `/auth`, `/users/me`, `/users/me/sessions` | Register/login/logout, refresh session, verify/resend code, request/complete reset, read/update profile, change password, revoke sessions |
| Public products, search, categories, sellers/stores | `/products`, `/categories`, `/stores` | Search/filter/sort; product detail; category listing; public store details/products; seller product counts and review summaries |
| Cart and delivery addresses | `/cart`, `/addresses` | Get/update cart, quantity and option changes, remove item, manage address/default |
| Standard checkout and orders | `/checkout`, `/orders` | Server quote; create pending order; initialize Paystack; read buyer order/list/detail; cancel only when state permits |
| Product bargains | `/products/:id/offers`, `/offers`, `/seller/offers` | Buyer submits/list/withdraw eligible offer; seller list/respond accept/decline/counter; buyer sees response and accepts counter; enforce price/stock/expiry rules |
| Seller onboarding/dashboard/products | `/seller/applications`, `/seller`, `/seller/products` | Submit/read application, admin review; seller overview; create/edit/draft/pause listing; stock and media management |
| Seller fulfilment | `/seller/orders`, `/orders/:id/fulfilment` | Seller order queue, valid status transitions, dispatch/pickup metadata, tracking and delivery confirmation |
| Open Market | `/market/requests`, `/market/responses` | Browse/filter/post/close buyer request; submit seller quote; buyer accepts one quote; checkout that response; close/expire remaining responses |
| Chat/messages | `/conversations`, `/conversations/:id/messages` | List/start conversation, fetch history, send text/media/offer reference, mark read; WebSocket events for new messages and typing |
| Wishlist/gifts | `/wishlists`, `/wishlists/:id/share`, `/shared-wishlists/:token`, `/gifts` | CRUD list/items, issue/revoke unguessable share token, anonymous or identified gift checkout, show only verified funded items |
| Notifications | `/notifications`, `/notification-preferences` | Paginated list, mark read/all read/delete, update per-type channel preferences |
| Support | `/support/tickets` | Create ticket, list/view own tickets, add message, admin assignment and response |
| Reviews/ratings | `/products/:id/reviews`, `/stores/:slug/reviews` | List public reviews; create/update only for eligible fulfilled order item; moderation |
| Payment provider | `/payments/paystack/initialize`, `/payments/paystack/verify`, `/webhooks/paystack` | Initialize using server-calculated amount; verify reference; receive signed webhooks; reconcile and deduplicate events |
| Media uploads | `/media/upload-intents`, `/media/:id` | Authorize purpose/size/type; return short-lived Cloudinary signed upload parameters; finalize and attach verified asset; delete owned unused asset |

### Route-to-surface mapping

- `/`, `/products`, `/category/[slug]`, `/search`, `/product/[slug]`, `/store/[slug]` → public catalog, search, product, and store endpoints.
- `/signup`, `/login`, `/forgot-password`, `/account`, `/account/security`, `/account/addresses` → auth, profile, session, and address endpoints.
- `/cart`, `/checkout/address`, `/checkout/payment`, `/checkout/success`, `/orders`, `/orders/[id]` → cart, quote/payment, and order endpoints.
- `/offers` and product `BargainDialog` → buyer offer endpoints; `/seller/offers` → seller response endpoints.
- `/sell`, `/seller`, `/seller/products`, `/seller/products/new`, `/seller/orders`, `/seller/notifications` → seller onboarding, catalog, fulfilment, and notifications.
- `/open-market`, `/open-market/new`, `/open-market/requests`, `/open-market/requests/[id]`, `/open-market/checkout/[id]`, `/seller/open-market` → request/response and checkout endpoints.
- `/messages` and product chat → conversations, messages, media, and real-time gateway.
- `/wishlist` and `/w/[token]` → private lists and revocable public share-token endpoints.
- `/notifications` and `/support` → notification settings/inbox and support ticket APIs.

## 7. Critical workflow design

### Authentication and account data

- Use Argon2id (or a well-reviewed password-hashing implementation) for password hashes; never persist or log passwords or OTPs.
- Prefer short-lived access credentials and rotating, revocable refresh sessions in `HttpOnly`, `Secure`, `SameSite` cookies. Keep cookie/CSRF strategy consistent with deployment origin and Next.js fetch behavior; do not put long-lived bearer tokens in local storage.
- Verify email and reset-password codes with cryptographically random, single-use, hashed values, short expiry, attempt throttling, and non-enumerating responses.
- The frontend currently allows users to skip email verification; decide and enforce whether unverified accounts may browse, buy, message, or sell.
- The UI presents two-factor toggles and signed-in device sessions. Do not represent these as real security features until server-side MFA and session revocation exist.
- Seller application status/approval and seller-role authorization must be server-owned. A client-provided `sellerId`, status, user ID, or role is never trusted.

### Cloudinary uploads

1. The signed-in client requests an upload intent with the media purpose (product, store logo/banner, request photo, chat attachment, avatar, or KYC document), MIME type, and size.
2. NestJS authorizes the user and purpose, validates limits, and returns a short-lived signature and tightly constrained upload parameters. The Cloudinary secret remains on the server.
3. The browser uploads directly to Cloudinary; the backend does not proxy large files.
4. The client finalizes the upload with the returned asset identifiers. The API verifies ownership/signature/expected resource type and creates a `MediaAsset`.
5. Only media owned by the user (or specifically authorized for the target seller/listing) can be attached. Deletion removes or invalidates both the relation and Cloudinary asset as policy allows.

Use image transformations and responsive derivatives for product/store imagery. Permit video only where the product model/UI uses it. Voice notes should have duration/type/size limits and access controls.

**KYC exception:** seller onboarding collects identity document and selfie data. Those must not be uploaded to a public Cloudinary folder or returned in public store/product responses. If Cloudinary is used for them, use a private/authenticated delivery configuration, restricted credentials, short-lived access, and retention/deletion rules validated against privacy requirements. Prefer a dedicated compliant private document store if those guarantees cannot be met. Never log the ID number or document URL.

### Paystack, orders, and money

1. Client submits product IDs, quantities/options, delivery choice/address ID, and any accepted offer or Open Market response ID—not client-calculated prices.
2. The API reloads authoritative prices, checks seller/product state and stock, applies an accepted offer only for its intended buyer/product/quantity and validity period, calculates delivery/service/commission fees, and creates a pending order plus immutable line-item snapshots in a database transaction.
3. The API initializes a Paystack transaction for the server-calculated total in NGN and stores its unique reference and expected amount/currency. Return only the provider checkout authorization/URL needed by the browser.
4. The browser completes payment using Paystack’s supported checkout flow; it does not send card details to this API.
5. A verified Paystack webhook is the primary asynchronous confirmation path. Verify the provider signature against the raw request body, verify the reference/amount/currency/status with Paystack when appropriate, and process once using unique constraints/idempotency. Client redirect/verification is a UX signal, not proof of payment.
6. On confirmed payment, atomically mark payment/order state, reserve or decrement stock exactly once, create ledger entries, and trigger receipt/notification/fulfilment work. On failure/expiry, release reservations and leave a clear retry/cancel state.
7. Refunds, chargebacks, partial fulfilment, duplicate webhooks, and reconciliation need explicit states and audit records.

The current checkout lists card, transfer, USSD, and pay-on-delivery. Confirm which methods Paystack supports for the merchant account and enable only configured channels. Pay-on-delivery is an offline collection/fulfilment workflow, not a successful Paystack payment. Never show fake account numbers or USSD codes; obtain actual provider instructions.

The current UI describes payments as held in escrow. **Do not promise escrow or release funds after delivery until the Paystack/acquirer arrangement and applicable legal/compliance requirements explicitly support the intended marketplace custody/split-settlement model.** Paystack payment collection alone should not be assumed to provide regulated escrow. The implementation must confirm the approved funds flow, seller payout timing, refund/dispute handling, and any applicable licensing before enabling these claims. Until then, show accurate payment and buyer-protection terms.

The UI displays a 1.5% service fee in checkout/gifting and a 5% seller-side figure in the listing form. Confirm the intended fee basis, payer, tax treatment, and whether rates differ by flow before implementing. Centralize approved fee configuration on the backend; do not trust frontend totals or hard-code fees in multiple components.

### Bargaining and Open Market

- Treat both product offers and Open Market responses as persisted state machines with validated transitions and an audit trail.
- Product offers need pending, accepted, declined, countered, withdrawn, and expired states (or a normalized offer/counter conversation model). Sellers must not accept another buyer’s offer or change a price outside configured seller limits. The private minimum price must never be exposed to buyers.
- A counter must return to the buyer for explicit acceptance before checkout. The current mock seller counter only stores a counter price and lacks a full buyer acceptance action; backend integration should supply that path.
- Accepting an Open Market response must reserve the winning response/order consistently and close or decline competing responses in one transaction. Do not mark an offer accepted merely because a checkout page was opened, as the current demo does.
- Set expiry, stock reservation, and cancellation rules so two buyers cannot pay against the same last unit or accepted quote.

### Chat, notification, wishlist, and support

- Persist messages and attachments before real-time delivery. Authorize every conversation read/write against its participants; do not allow clients to set sender identity, delivered/read state, or arbitrary `offerId`.
- Replace random mock seller replies with seller-authored messages. Voice recordings and image attachments use scoped media uploads.
- Notifications are generated from committed domain events (verified payment, offer response, message, delivery change, seller review). Use an outbox/queue so provider outages do not lose events. Channel preferences determine delivery; failed email/SMS attempts are retryable and observable.
- Shared wishlist tokens must be random, server-created, revocable, and scoped. Do not serialize private owner data or trust the client payload as the authoritative list. Guest gifting can be supported, but a gift only counts after verified payment and inventory/recipient delivery rules are clear.
- Support form submission must create a durable ticket; it must not return a fabricated ticket ID or claim an email was sent before persistence/provider delivery.

## 8. Frontend integration plan

1. Add a typed API client in the Next.js app with a single configurable base URL, cookie credentials, request IDs, schema-safe error handling, and no secret configuration in browser bundles.
2. Replace provider seed arrays and mutation callbacks incrementally with server queries/mutations. Keep context hooks initially if helpful, but make them cache/API adapters rather than the source of truth.
3. Use server-side data fetching for public product/category/store pages where it improves initial rendering and SEO; use client queries for interactive account, cart, chat, seller dashboard, and notifications.
4. Add loading, empty, unauthorized, validation, network failure, payment-pending, and retry UI states. Preserve existing route structure and form affordances where possible.
5. Keep cart usable for guests if desired, then merge it with the authenticated cart on sign-in using server-side price/stock validation.
6. Remove demo credentials/codes, seeded fake offers/orders/messages, fake payment fields/instructions, simulated seller replies, local seller approval assumptions, and fake ticket/payment success when their live replacements ship. Keep demo fixtures only in tests/story/demo mode.
7. Add generated API types from OpenAPI or a shared versioned contract and contract tests so frontend/backend DTOs cannot silently drift.

## 9. Security, privacy, and reliability requirements

- Enforce DTO validation, request-size limits, strict CORS, security headers, TLS, per-route rate limits, and abuse controls.
- Use role/ownership policies at every resource boundary: buyer, seller, admin, guest-share token. Test horizontal access attacks (changing an ID to another user's resource).
- Keep Paystack and Cloudinary secrets, cookie keys, database URLs, and email/SMS credentials in deployment secret storage only. Rotate and scope credentials.
- Verify Paystack signatures with the unmodified raw body; use idempotency keys and unique provider references. Never accept browser callbacks as final payment evidence.
- Protect against CSRF where cookie authentication is used; protect password/OTP flows against enumeration, brute force, replay, and abuse.
- Minimize KYC and personal data, encrypt sensitive payout/KYC fields at rest, restrict staff access, redact logs, set retention/deletion windows, and document consent and privacy policy requirements.
- Use database transactions for order placement, stock reservations, offer acceptance, gift funding, payment confirmation, and payout ledger changes.
- Add database backups and restore drills, migrations, webhook retry/replay tooling, payment reconciliation, operational alerts, and audit trails for admin/payment actions.
- Do not promise buyer protection, escrow, seller verification, refunds, or delivery guarantees beyond the operational and legal capability actually implemented.

## 10. Testing and acceptance criteria

### Automated testing

- Unit tests for pricing, fee calculation, offer transitions, seller permissions, stock reservation/release, and order state transitions.
- PostgreSQL integration tests for transaction rollback, unique constraints, concurrency, and ownership checks.
- API e2e tests for signup/verification, product search, seller application, listing creation, bargain/counter/acceptance, Open Market quote/checkout, cart checkout, payment/webhook idempotency, shipment updates, gifting, notifications, and support tickets.
- Paystack and Cloudinary adapter tests using provider test modes/stubs; no real charge or upload in CI.
- Frontend integration/contract tests for each provider-to-API path and regression tests on visible checkout and account flows.
- Security tests for invalid/expired tokens, unauthorized cross-user IDs, upload type/size/purpose violations, webhook signature failures, repeated webhooks, and rate limits.

### Release acceptance

- A new account can verify and sign in, and private data remains private across users and sessions.
- A seller can complete application review, upload permitted media, create/manage a product, receive/respond to offers, and fulfil a paid order.
- Buyers can search products, save addresses/cart, bargain, check out, and see order/payment status based only on server-confirmed data.
- Open Market requests, seller responses, winning quote, payment, and closure of competing responses persist across devices and reloads.
- A guest can open a valid shared wishlist and make a real verified gift payment without seeing the recipient's private address.
- Payment webhooks can be retried without duplicate orders, stock changes, notifications, or ledger entries.
- No live route displays seeded demo-only records or success messages unsupported by persisted backend state.
- Build, type checks, lint, unit/integration/e2e suites, migration checks, and deployment health checks pass.

## 11. Recommended delivery sequence

1. **Confirm policy and provider configuration:** approved escrow/funds flow, fee model, seller payout process, supported Paystack channels, identity/KYC handling, currencies, delivery model, email/SMS provider, and admin review process.
2. **Backend foundation:** NestJS service, configuration validation, Prisma/PostgreSQL migrations, OpenAPI, logging/request IDs, health checks, CI, and test environment.
3. **Identity and roles:** account lifecycle, secure sessions, verification/reset flows, profile, addresses, seller applications, admin approval, authorization guards.
4. **Catalog and Cloudinary:** categories, public sellers/stores, products, search/filter, media signing/finalization, seller product management.
5. **Orders and payments:** cart/quote, Paystack initialization and webhook verification, order/stock transactions, payment states, refunds/reconciliation groundwork.
6. **Marketplace negotiation:** product bargains and buyer counter acceptance, Open Market requests/responses, reservation/checkout rules.
7. **Seller operations:** order management, shipment/dispatch updates, payouts only after the funds flow is approved, seller dashboard data.
8. **Engagement features:** conversations/WebSockets, notifications/email/SMS, wishlists/gifts, reviews, and support tickets.
9. **Cutover and hardening:** remove mock behavior surface-by-surface, migrate or discard demo data intentionally, run security and load checks, operationalize monitoring/backups, and deploy gradually.

## 12. Decisions to confirm before implementation

These are material product, compliance, or provider choices that should be resolved before implementing the dependent flows:

1. What exact funds model is approved: immediate seller settlement, split settlement, delayed payout, or a separately approved escrow arrangement?
2. Which payment channels are enabled for the merchant account, and is pay-on-delivery retained?
3. What is the approved marketplace/service fee model (including the current 1.5% checkout/gift and 5% seller-form figures)?
4. Which Cloudinary setup or compliant private storage is approved for identity documents/selfies, and how long must KYC records be retained?
5. Which email/SMS provider, delivery carrier/hub integrations, and admin tools should be used?
6. Should guests be allowed to buy, create Open Market requests, message sellers, or only pay for a shared wishlist?
7. What are the cancellation, refund, dispute, stock reservation, delivery confirmation, and payout release policies?

