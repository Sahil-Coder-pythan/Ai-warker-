# AI Worker — GitHub wipe + ZIP upload

Powerful upload: 800–1000+ files, retries, keeps `.gitignore` / `.env.example`.

## Backend
- POST /api/verify — token + repo list
- POST /api/wipe — wipe to placeholder README
- POST /api/upload — ZIP (map optional; empty map = ZIP structure)
- POST /api/wipe-and-upload — wipe then upload
- POST /api/brain — optional Groq

## Deploy
app.py, requirements.txt, render.yaml, README.md,
public/index.html, public/app.js, public/style.css

Env: optional GROQ_API_KEY, MASTER_ENCRYPTION_KEY, FLASK_SECRET_KEY

## Improvements (v2)
- Max ZIP 250MB
- Parallel blob workers: 20 + sequential retry
- Blob retries on 403/429/5xx
- Does NOT skip package.json, README, .gitignore, .env.example
- Only skips __MACOSX, .DS_Store, .git
- Verifies critical root files after upload
- Clear failed-file list in response
