# AI Worker v4 — permanent reliable GitHub ZIP upload

## Fix vs old timeout
Upload runs in **background job**. HTTP returns in <2s with `job_id`.
Frontend polls `/api/job/<id>` until done. Render 30s timeout cannot kill the upload.

## Capacity
- 1000+ files
- ZIP up to 250MB
- Parallel blobs + retries + Contents API rescue for package.json / README

## Map
Leave empty = full ZIP structure (auto strip single root folder).

## Deploy
```
build: pip install -r requirements.txt
start: gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 300
```
