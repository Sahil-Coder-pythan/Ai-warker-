
# GitHub Worker

A mobile-friendly Flask app to preview, upload, update, and delete files
in personal GitHub repositories using the GitHub API.

## Render environment variables

- GITHUB_TOKEN: fine-grained token for your personal repositories
- ADMIN_PASSWORD: a long, unique password

Give the token Contents read/write permission only for the repositories
you want this Worker to manage.

## Run

pip install -r requirements.txt
python app.py

## Safety

- Preview before every operation.
- Explicit confirmation is required before applying changes.
- Replace operations are committed together.
- Never put the GitHub token in browser JavaScript or public source code.
- Test with a disposable repository before using important projects.

---

## Uploader Service (auto-upload from ZIP)

This repository now contains an optional helper service at `uploader_service/` that
accepts a ZIP file and a mapping JSON and applies create/update/delete operations
against a target GitHub repository using a personal access token.

Files added in `uploader_service/`:
- app.py — small Flask service exposing POST /apply that accepts `zip` (multipart file) and `mapping` (JSON string)
- github_client.py — minimal wrapper over GitHub Contents API (create/update/delete)
- example_mapping.json — example mapping file showing how to map ZIP paths to repo paths

Quick usage (local):

1) Set environment variables:

- GITHUB_TOKEN — personal access token with repo content permissions
- GITHUB_REPO — owner/repo (e.g. `Sahil-Coder-pythan/Ai-warker-`)
- (optional) GITHUB_BRANCH — branch to target

2) Run locally:

pip install -r requirements.txt
python -m uploader_service.app

3) Send a ZIP + mapping using curl:

curl -X POST "http://localhost:5000/apply" \
  -F "zip=@payload.zip" \
  -F "mapping=$(cat uploader_service/example_mapping.json)"

Render deploy:
- Create a Render Web Service pointing at this repository.
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120`
- Add environment variables in Render: `GITHUB_TOKEN` (secret), `GITHUB_REPO`, `ADMIN_PASSWORD`, `SECRET_KEY` (auto-generated or set manually).

Security notes:
- Keep `GITHUB_TOKEN` secret and limited to the specific repository.
- Test on disposable repos before running on important projects.

