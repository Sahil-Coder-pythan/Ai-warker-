
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
