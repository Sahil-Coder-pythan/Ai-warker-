"""Flask app to receive a ZIP and mapping JSON and apply file operations to a GitHub repo.

Environment variables expected:
- GITHUB_TOKEN : a Personal Access Token with repo access
- GITHUB_REPO  : owner/repo (e.g. Sahil-Coder-pythan/Ai-warker-)
- GITHUB_BRANCH (optional) : branch name to target (default: repo default branch)

POST /apply
- form field `zip` : the zip file (multipart file)
- form field `mapping` : JSON string describing operations (see example_mapping.json)

The mapping format example (see uploader_service/example_mapping.json):
{
  "default_operation": "upload",         # upload files from zip that are not listed in operations
  "operations": [
    {"action": "upload", "zip_path": "public/app.js", "repo_path": "public/app.js"},
    {"action": "delete", "repo_path": "old/file.txt"}
  ]
}

This service will:
- read the zip file contents in memory
- follow the mapping instructions and apply create/update/delete using GitHub Contents API
- return a JSON report of successes and failures
"""

import os
import io
import json
import base64
import zipfile
from flask import Flask, request, jsonify
from github_client import GitHubClient

app = Flask(__name__)

TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = os.environ.get("GITHUB_REPO")
BRANCH = os.environ.get("GITHUB_BRANCH")  # optional

if not TOKEN or not REPO:
    app.logger.warning("GITHUB_TOKEN or GITHUB_REPO not set. The service will not operate until set.")


def load_mapping(mapping_field):
    if not mapping_field:
        return {"default_operation": "upload", "operations": []}
    try:
        return json.loads(mapping_field)
    except Exception as e:
        raise ValueError(f"Invalid mapping JSON: {e}")


@app.route("/apply", methods=["POST"])    
def apply_mapping():
    if not TOKEN or not REPO:
        return jsonify({"error": "GITHUB_TOKEN and GITHUB_REPO must be set in environment"}), 400

    if 'zip' not in request.files:
        return jsonify({"error": "Missing 'zip' file in form-data"}), 400

    zip_file = request.files['zip']
    mapping = load_mapping(request.form.get('mapping'))

    try:
        z = zipfile.ZipFile(io.BytesIO(zip_file.read()))
    except Exception as e:
        return jsonify({"error": f"Failed to read zip: {e}"}), 400

    gh = GitHubClient(token=TOKEN, repo=REPO, branch=BRANCH)

    ops = mapping.get('operations', [])
    default_op = mapping.get('default_operation', 'upload')

    # Build quick map for ops by zip_path or repo_path
    ops_by_zip = {op.get('zip_path'): op for op in ops if 'zip_path' in op}
    ops_by_repo = {op.get('repo_path'): op for op in ops if 'repo_path' in op}

    report = {"performed": [], "errors": []}

    # First apply explicit ops in mapping
    for op in ops:
        action = op.get('action')
        repo_path = op.get('repo_path')
        zip_path = op.get('zip_path')
        try:
            if action in ('upload', 'update'):
                if not zip_path:
                    raise ValueError("upload/update op requires zip_path")
                try:
                    data = z.read(zip_path)
                except KeyError:
                    raise FileNotFoundError(f"zip does not contain {zip_path}")
                gh.create_or_update_file(repo_path, data, message=op.get('message') or f"Upload {repo_path}")
                report['performed'].append({"action": action, "repo_path": repo_path})

            elif action == 'delete':
                gh.delete_file(repo_path, message=op.get('message') or f"Delete {repo_path}")
                report['performed'].append({"action": action, "repo_path": repo_path})

            else:
                raise ValueError(f"Unknown action: {action}")
        except Exception as e:
            report['errors'].append({"op": op, "error": str(e)})

    # Then walk zip and apply default operation for files not referenced explicitly
    for info in z.infolist():
        if info.is_dir():
            continue
        zip_path = info.filename
        # skip files referenced already
        if zip_path in ops_by_zip:
            continue
        repo_path = zip_path  # default: use same path in repo
        op = ops_by_repo.get(repo_path)
        if op:
            continue
        if default_op == 'upload':
            try:
                data = z.read(zip_path)
                gh.create_or_update_file(repo_path, data, message=f"Upload {repo_path}")
                report['performed'].append({"action": "upload", "repo_path": repo_path})
            except Exception as e:
                report['errors'].append({"zip_path": zip_path, "error": str(e)})
        # you can add other default actions like skip or delete

    return jsonify(report)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
