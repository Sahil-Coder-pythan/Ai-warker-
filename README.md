# Stratic Global Market — modular launch foundation

A Node.js/Express + Neon PostgreSQL foundation for a country-aware marketplace and parcel booking workflow. It includes a responsive dashboard, parcel request API, country/language selection, shipment status timeline, optional AI assistant endpoint, upload validation, security middleware, and Prisma schema.

## Important truth about "real booking"
This project does **not** create a real carrier booking merely from a phone number. Real bookings, tracking numbers, pickup requests, shipping rates and labels require a carrier/aggregator account and valid API credentials; phone verification requires an OTP provider. Those integrations are deliberately configured as adapters and return a clear "not configured" response until credentials are added. Never advertise a demo booking as a confirmed courier booking.

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and set a long random `SESSION_SECRET` and Neon `DATABASE_URL`.
3. `npm install`
4. `npx prisma generate`
5. `npx prisma db push` (for initial prototype only; use reviewed migrations for production)
6. `npm start`
7. Open `http://localhost:3000`

## Render account persistence (important)

Render redeploys do not preserve files in the normal service filesystem. This app stores accounts, email addresses, products, and images in its file store. Attach a **Persistent Disk** to the web service mounted at `/var/data` (or set `DATA_DIR` to your disk mount path). The app then stores data under `/var/data/stratic-market`. Also set a stable `SESSION_SECRET` in Render Environment; do not change it between deploys, or existing login cookies will stop validating. If no Persistent Disk is attached, account records can still disappear on redeploy.

## Render
- Runtime: Node
- Build command: `npm install && npx prisma generate`
- Start command: `npm start`
- Set `NODE_ENV=production`, `APP_URL`, `SESSION_SECRET`, and Neon `DATABASE_URL` in Render Environment.
- Add a durable private object-storage provider before accepting customer parcel videos in production. Render local filesystem is not durable across deploys.
- Set OTP and carrier credentials only after registering with providers. Do not put secrets in GitHub, browser JavaScript, screenshots, or chat.

## Parcel flow
- Customer enters sender/receiver details, phone numbers, country/state/pincode, parcel dimensions/weight and optional declared value.
- The app creates a **booking request** and reference ID in the database.
- Unless a carrier adapter is configured, the request is not a carrier-confirmed booking and has no real tracking label.
- The starter dashboard provides an internal status view; live carrier tracking is a future adapter integration.

## Security / production checklist
- Configure OTP with rate limits and abuse controls.
- Add user accounts, verified phone ownership, role permissions, CSRF/session strategy, audit logs, privacy retention and deletion policies.
- Use private S3-compatible storage, signed upload URLs, size/type scanning and moderation for video/photo uploads.
- Add carrier API integration, idempotency, webhook signature verification and reconciliation.
- Add payment provider, refunds/disputes, tax/compliance and country-specific legal review.
- Run automated tests, dependency scans, backups, migrations, monitoring and load tests before public launch.
- The included project is a substantial starter, not yet a verified production-scale global marketplace and is not load-tested for 100k users.

## Languages
The `src/i18n/locales` directory contains language dictionaries. The current UI has a language picker and basic translated labels; complete legal, shipping and AI translations must be reviewed by native speakers.

## Project layout

- `src/routes`: browser and API routes
- `src/services`: isolated domain and provider-adapter boundaries
- `src/i18n/locales`: locale dictionaries
- `src/views` and `src/public`: responsive UI
- `prisma`: PostgreSQL schema
- `test`: unit tests
- `docs`: deployment, security, country launch and future module specifications

Many documented modules are roadmap specifications, not completed production functionality. File count is not a measure of production readiness.


## Two-phone language demo (temporary)
Open `/language-test` on both phones using the same deployed website URL. Choose English on one phone and Punjabi on the other. Create a demo parcel on either phone and tap Refresh on the other. This demo intentionally has no login and stores up to 100 sample records in server memory; records reset on restart/redeploy and are visible to anyone who knows the URL. Do not enter real names, phone numbers, or addresses. Only the predefined sample labels/statuses are localized (English, Punjabi, Hindi); arbitrary text is not automatically translated. The rest of the application and production parcel booking are not made production-ready by this test feature.


## Stratic Market (shop) on Render + Neon free
- Build command: `npm install && npx prisma generate && npx prisma db push`
- Use Neon's **direct** connection string (host without `-pooler`) as `DATABASE_URL` so `db push` works.
- Env: `NODE_VERSION=20`, `NODE_ENV=production`, `APP_URL`, `SESSION_SECRET` (40+ random characters), `DATABASE_URL`.
- Accounts, products (photo stored in Postgres, ~50 KB each) and orders are saved in Neon. Videos in `/market` are still temporary.
- Orders are Cash on Delivery only. Online payment needs a provider (Razorpay/Stripe) and is not connected.
