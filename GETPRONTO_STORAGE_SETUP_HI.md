# Get Pronto photo storage — Stratic Market

## Setup on Render
1. Get a **secret/server-side** API key from Get Pronto (never use a public key here).
2. Render Dashboard → your Stratic Market service → Environment.
3. Add `GETPRONTO_API_KEY` and paste the secret value there. Never put the key in GitHub or this ZIP.
4. Save changes and redeploy.
5. Upload a test product photo and check the Get Pronto dashboard for the new `stratic-market` asset.

When configured, product photos and payment QR images are uploaded to Get Pronto. The app keeps its existing local/database fallback path if cloud upload fails. Product photos are served from Get Pronto after upload; private payment QR images are redirected only from the existing authenticated endpoint.

## Important capacity warning
Get Pronto's Free plan is limited to **5 GB total storage and 10 GB monthly bandwidth**. This is suitable for testing or a small catalogue, not 5,000–10,000 new photos per day. At an average of 500 KB per photo, that is roughly 2.5–5 GB of new images per day, before extra photos and delivery bandwidth. The app cannot make that volume permanently free or guarantee unlimited storage. Monitor the provider quota and plan for paid/object storage before launch at that scale.

## Reliability notes
- Uploads are queued in the background after the app accepts a listing; a provider error is logged and the existing fallback remains active.
- Existing product deletion behavior remains unchanged; this integration does not run automatic cloud cleanup.
- Never share the API key in chat, screenshots, source files, or GitHub.
