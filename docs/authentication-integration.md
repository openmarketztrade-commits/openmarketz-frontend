# Frontend authentication integration

The Next.js auth context calls the NestJS API using `NEXT_PUBLIC_API_URL`. Set it to the API base URL, including the configured prefix; the local default is `http://localhost:4000/api/v1`.

The API currently supports buyer registration, email verification, login, refresh-cookie sessions, and password reset. Seller credentials are not separate: sellers create and verify a buyer account, then continue to `/sell` to start a seller application.

The browser sends API requests with credentials enabled. Configure the backend's `FRONTEND_ORIGINS` to include the exact frontend origin. The access token stays in memory; session restoration and refresh use the backend's HTTP-only `openmarketz_session` cookie.
