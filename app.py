
import os
import re
import io
import json
import uuid
import base64
import zipfile
import hashlib
import requests

from flask import (
    Flask, request, render_template_string,
    redirect, url_for, session
)
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(32))

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

MAX_ZIP_SIZE = 25 * 1024 * 1024
MAX_TOTAL_SIZE = 50 * 1024 * 1024
MAX_FILES = 500
MAX_FILE_SIZE = 5 * 1024 * 1024

# Render par ek worker rakho, taaki preview data
# preview aur apply ke beech memory mein available rahe.
PREVIEWS = {}

SKIP_NAMES = {
    ".git", "node_modules", "__pycache__", ".env",
    ".DS_Store", ".pytest_cache", ".venv", "venv"
}

SKIP_EXTENSIONS = {".pyc", ".pyo"}


PAGE = """
<!doctype html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GitHub Worker</title>
<style>
*{box-sizing:border-box}
body{
 margin:0;background:#0b1020;color:#e8edff;
 font-family:Arial,sans-serif;padding:18px
}
main{max-width:850px;margin:auto}
.card{
 background:#141c31;border:1px solid #293653;
 border-radius:16px;padding:18px;margin-bottom:16px
}
h1{font-size:27px;margin:5px 0 10px}
h2{font-size:19px}
p{color:#aebcda;line-height:1.6}
label{display:block;margin:15px 0 7px;font-weight:bold}
input,textarea,select{
 width:100%;padding:13px;border-radius:9px;
 border:1px solid #394968;background:#0b1326;
 color:white;font-size:15px
}
textarea{min-height:180px;resize:vertical;font-family:monospace}
button{
 width:100%;padding:14px;border:0;border-radius:10px;
 background:#5877ff;color:white;font-weight:bold;
 font-size:16px;margin-top:16px
}
.secondary{background:#293653}
.item{
 background:#0b1326;border-radius:9px;
 padding:11px;margin:8px 0;overflow-wrap:anywhere
}
.ok{color:#76efb2}.warn{color:#ffd27b}.bad{color:#ff9393}
small{color:#aebcda}
a{color:#9fb6ff}
</style>
</head>
<body>
<main>
<div class="card">
<h1>GitHub Worker</h1>
<p>ZIP upload → automatic file matching → preview → GitHub commit.</p>
<p>GitHub token server ke Environment mein GITHUB_TOKEN ke naam se
hona chahiye. Is page par token paste mat karna.</p>
</div>

{% if error %}
<div class="card"><p class="bad">{{ error }}</p></div>
{% endif %}

{% if result %}
<div class="card">
<h2>Preview Result</h2>
<p>{{ result.message }}</p>

<h3>Upload / Update ({{ result.uploads|length }})</h3>
{% for name in result.uploads %}
<div class="item">＋ {{ name }}</div>
{% else %}
<p>No upload files.</p>
{% endfor %}

<h3>Delete ({{ result.deletes|length }})</h3>
{% for name in result.deletes %}
<div class="item warn">− {{ name }}</div>
{% else %}
<p>No files to delete.</p>
{% endfor %}

{% if result.warnings %}
<h3>Warnings</h3>
{% for warning in result.warnings %}
<div class="item warn">{{ warning }}</div>
{% endfor %}
{% endif %}

{% if result.token %}
<p class="warn">
Review the list carefully. Applying changes will create a GitHub commit.
</p>
<form method="post" action="/apply">
<input type="hidden" name="password" value="{{ password }}">
<input type="hidden" name="preview_id" value="{{ result.token }}">
<button type="submit">Confirm and Apply to GitHub</button>
</form>
{% endif %}
</div>
{% endif %}

<div class="card">
<h2>1. Admin Access</h2>
<form method="post" action="/preview" enctype="multipart/form-data">
<label>Admin Password</label>
<input type="password" name="password" required
 placeholder="ADMIN_PASSWORD value" autocomplete="current-password">

<label>GitHub Repository</label>
<input name="repo" required
 placeholder="Sahil-Coder-pythan/ai-builder"
 value="{{ repo or '' }}">

<label>ZIP File</label>
<input type="file" name="zip_file" accept=".zip,application/zip" required>

<label>Action</label>
<select name="mode">
<option value="replace" {% if mode == 'replace' %}selected{% endif %}>
REPLACE — upload mapped files and remove other tracked files
</option>
<option value="upload" {% if mode == 'upload' %}selected{% endif %}>
UPLOAD — only add or update mapped files
</option>
</select>

<label>File Mapping — one GitHub path per line</label>
<textarea name="file_map" required
 placeholder="app.py&#10;requirements.txt&#10;render.yaml&#10;README.md&#10;public/index.html&#10;public/chat.html&#10;public/style.css&#10;public/app.js">{{ file_map or '' }}</textarea>

<p><small>
ZIP ke andar extra root folder ho, jaise ai-builder/app.py,
toh bhi matching automatically try hogi.
Tree drawing (├──, └──) ki zarurat nahi.
Folders ke naam nahi, actual files ke paths likho.
</small></p>

<button type="submit">Analyze ZIP and Preview</button>
</form>
</div>

<div class="card">
<h2>Rules</h2>
<p>• UPLOAD existing unmapped files ko nahi hatata.</p>
<p>• REPLACE unmapped tracked files ko delete kar sakta hai.</p>
<p>• Preview check kiye bina Apply mat karna.</p>
<p>• ZIP mein duplicate file names hon aur matching ambiguous ho,
toh system error dega, guess nahi karega.</p>
</div>
</main>
</body>
</html>
"""


def render_page(error=None, result=None, repo="", mode="replace",
                file_map="", password=""):
    return render_template_string(
        PAGE,
        error=error,
        result=result,
        repo=repo,
        mode=mode,
        file_map=file_map,
        password=password
    )


def github_headers():
    if not GITHUB_TOKEN:
        raise ValueError(
            "Render Environment mein GITHUB_TOKEN missing hai."
        )

    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }


def github_request(method, endpoint, **kwargs):
    response = requests.request(
        method,
        "https://api.github.com" + endpoint,
        headers=github_headers(),
        timeout=60,
        **kwargs
    )

    if not response.ok:
        try:
            detail = response.json().get("message", response.text)
        except Exception:
            detail = response.text

        raise ValueError(
            f"GitHub API error ({response.status_code}): {detail}"
        )

    if response.status_code == 204:
        return {}

    return response.json()


def check_password(password):
    if not ADMIN_PASSWORD:
        raise ValueError(
            "Render Environment mein ADMIN_PASSWORD set nahi hai."
        )

    if not password or password != ADMIN_PASSWORD:
        raise ValueError("Admin password galat hai.")


def parse_repo(value):
    value = (value or "").strip().rstrip("/")
    value = re.sub(r"^https?://github\\.com/", "", value)
    value = value.removesuffix(".git")

    parts = value.split("/")

    if len(parts) != 2 or not all(parts):
        raise ValueError(
            "Repo format galat hai. Example: owner/repository"
        )

    owner, repo = parts

    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner):
        raise ValueError("GitHub owner name invalid hai.")

    if not re.fullmatch(r"[A-Za-z0-9_.-]+", repo):
        raise ValueError("GitHub repository name invalid hai.")

    return owner, repo


def get_owned_repo(repo_value):
    owner, repo = parse_repo(repo_value)

    user = github_request("GET", "/user")
    if user.get("login", "").lower() != owner.lower():
        raise ValueError(
            "Yeh Worker sirf token owner ke apne personal repository "
            "ke liye configured hai. Repo owner aur token owner check karo."
        )

    data = github_request("GET", f"/repos/{owner}/{repo}")

    if data.get("private") is False:
        # Public repos are allowed too, as long as the token owner owns it.
        pass

    return owner, repo, data


def clean_zip_path(path):
    path = path.replace("\\", "/").strip()
    path = path.lstrip("./")

    parts = []
    for part in path.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            return None
        parts.append(part)

    if not parts:
        return None

    if any(part in SKIP_NAMES for part in parts):
        return None

    if parts[-1].lower().endswith(tuple(SKIP_EXTENSIONS)):
        return None

    return "/".join(parts)


def parse_mapping(raw):
    """
    Mapping ke har line se GitHub destination path nikalo.
    Tree characters, bullets, backticks aur comments tolerate karta hai.
    """
    output = []
    seen = set()

    for line in (raw or "").splitlines():
        line = line.strip()

        if not line or line.startswith("```"):
            continue

        # Common tree drawing prefixes.
        line = re.sub(r"^[\\s│├└─|+`>*-]+", "", line).strip()

        # Ignore comments / explanatory arrows.
        line = re.split(r"\\s(?:←|#)\\s*", line, maxsplit=1)[0].strip()

        line = line.strip("`'\\\" ")
        line = line.replace("\\", "/").strip()

        # Directory headings aren't uploadable files.
        if not line or line.endswith("/"):
            continue

        # Remove accidental leading "./".
        while line.startswith("./"):
            line = line[2:]

        # Do not accept absolute or parent-traversal paths.
        if line.startswith("/") or ".." in line.split("/"):
            raise ValueError(f"Mapping path unsafe hai: {line}")

        # Ignore a standalone repository-root heading.
        if line.lower() in ("ai-builder", "root", "public"):
            continue

        if line not in seen:
            output.append(line)
            seen.add(line)

    if not output:
        raise ValueError(
            "File mapping empty hai. Har line par ek file path likho."
        )

    if len(output) > MAX_FILES:
        raise ValueError(f"Maximum {MAX_FILES} mapping paths allowed hain.")

    return output


def read_zip(zip_bytes):
    files = {}
    warnings = []
    total_size = 0

    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise ValueError("Uploaded file valid ZIP nahi hai.")

    with archive:
        entries = [
            info for info in archive.infolist()
            if not info.is_dir()
        ]

        if len(entries) > MAX_FILES:
            raise ValueError(f"ZIP mein maximum {MAX_FILES} files allowed hain.")

        for info in entries:
            original = info.filename.replace("\\", "/")

            if original.startswith("/") or ".." in original.split("/"):
                warnings.append(f"Unsafe ZIP path skipped: {original}")
                continue

            clean = clean_zip_path(original)
            if not clean:
                continue

            if info.file_size > MAX_FILE_SIZE:
                raise ValueError(
                    f"{clean} file 5 MB se badi hai."
                )

            total_size += info.file_size
            if total_size > MAX_TOTAL_SIZE:
                raise ValueError("ZIP ka unpacked size 50 MB se zyada hai.")

            if clean in files:
                raise ValueError(
                    f"ZIP mein duplicate normalized path mila: {clean}"
                )

            files[clean] = archive.read(info)

    if not files:
        raise ValueError(
            "ZIP mein upload karne layak files nahi mili."
        )

    return files, warnings


def match_source(target, zip_files):
    """
    Pehle exact path, phir extra root-folder ke saath suffix match,
    aur aakhir mein unique basename match.
    """
    target = target.strip("/")

    if target in zip_files:
        return target

    suffix_matches = [
        name for name in zip_files
        if name.endswith("/" + target)
    ]

    if len(suffix_matches) == 1:
        return suffix_matches[0]

    if len(suffix_matches) > 1:
        raise ValueError(
            f"{target}: ZIP mein multiple suffix matches hain: "
            + ", ".join(suffix_matches[:8])
        )

    basename = target.split("/")[-1]
    basename_matches = [
        name for name in zip_files
        if name.split("/")[-1] == basename
    ]

    if len(basename_matches) == 1:
        return basename_matches[0]

    if len(basename_matches) > 1:
        raise ValueError(
            f"{target}: basename '{basename}' multiple folders mein hai. "
            "ZIP structure aur mapping ko clear karo."
        )

    raise ValueError(
        f"Mapping wali file ZIP mein nahi mili: {target}"
    )


def get_branch_tree(owner, repo, branch):
    ref = github_request(
        "GET",
        f"/repos/{owner}/{repo}/git/ref/heads/{branch}"
    )

    commit_sha = ref["object"]["sha"]

    commit = github_request(
        "GET",
        f"/repos/{owner}/{repo}/git/commits/{commit_sha}"
    )

    tree_sha = commit["tree"]["sha"]

    tree = github_request(
        "GET",
        f"/repos/{owner}/{repo}/git/trees/{tree_sha}",
        params={"recursive": "1"}
    )

    if tree.get("truncated"):
        raise ValueError(
            "GitHub tree bahut bada hai aur response truncated hai. "
            "Is repository par safe replacement nahi kiya ja sakta."
        )

    tracked = {}

    for item in tree.get("tree", []):
        if item.get("type") == "blob":
            tracked[item["path"]] = item.get("sha")

    return commit_sha, tree_sha, tracked


def make_preview(repo_value, mode, raw_map, zip_bytes):
    owner, repo, repo_data = get_owned_repo(repo_value)
    targets = parse_mapping(raw_map)
    zip_files, warnings = read_zip(zip_bytes)

    uploads = {}

    for target in targets:
        source = match_source(target, zip_files)
        uploads[target] = zip_files[source]

    branch = repo_data.get("default_branch")
    if not branch:
        raise ValueError("Repository mein default branch nahi mili.")

    commit_sha, tree_sha, tracked = get_branch_tree(
        owner, repo, branch
    )

    if mode == "replace":
        deletes = sorted(set(tracked.keys()) - set(uploads.keys()))
    elif mode == "upload":
        deletes = []
    else:
        raise ValueError("Unknown action mode.")

    # Preview stores only mapped bytes, not the full ZIP.
    preview_id = uuid.uuid4().hex

    PREVIEWS[preview_id] = {
        "owner": owner,
        "repo": repo,
        "branch": branch,
        "base_commit": commit_sha,
        "base_tree": tree_sha,
        "uploads": uploads,
        "deletes": deletes,
        "mode": mode
    }

    return {
        "token": preview_id,
        "uploads": sorted(uploads.keys()),
        "deletes": deletes,
        "warnings": warnings,
        "message": (
            f"Repository: {owner}/{repo} | Branch: {branch} | "
            f"Mode: {mode.upper()}"
        )
    }


def apply_preview(preview_id):
    data = PREVIEWS.get(preview_id)

    if not data:
        raise ValueError(
            "Preview expire ya unavailable hai. ZIP dobara preview karo."
        )

    owner = data["owner"]
    repo = data["repo"]
    branch = data["branch"]

    # Abort if another commit changed the branch after preview.
    current_ref = github_request(
        "GET",
        f"/repos/{owner}/{repo}/git/ref/heads/{branch}"
    )

    current_sha = current_ref["object"]["sha"]

    if current_sha != data["base_commit"]:
        raise ValueError(
            "Preview ke baad repository badal gayi hai. "
            "Latest ZIP ka dobara preview banao."
        )

    tree_entries = []

    # Delete only files listed in the reviewed preview.
    for path in data["deletes"]:
        tree_entries.append({
            "path": path,
            "mode": "100644",
            "type": "blob",
            "sha": None
        })

    # Upload new blob objects.
    for path, content in data["uploads"].items():
        blob = github_request(
            "POST",
            f"/repos/{owner}/{repo}/git/blobs",
            json={
                "content": base64.b64encode(content).decode("ascii"),
                "encoding": "base64"
            }
        )

        tree_entries.append({
            "path": path,
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"]
        })

    new_tree = github_request(
        "POST",
        f"/repos/{owner}/{repo}/git/trees",
        json={
            "base_tree": data["base_tree"],
            "tree": tree_entries
        }
    )

    commit = github_request(
        "POST",
        f"/repos/{owner}/{repo}/git/commits",
        json={
            "message": (
                "GitHub Worker: "
                + ("replace mapped files" if data["mode"] == "replace"
                   else "upload mapped files")
            ),
            "tree": new_tree["sha"],
            "parents": [data["base_commit"]]
        }
    )

    # Update branch only if it still points to the previewed commit.
    latest = github_request(
        "GET",
        f"/repos/{owner}/{repo}/git/ref/heads/{branch}"
    )

    if latest["object"]["sha"] != data["base_commit"]:
        raise ValueError(
            "Apply ke dauran branch badal gayi. Commit bana hai, "
            "lekin branch update nahi ki gayi. Repo check karo."
        )

    github_request(
        "PATCH",
        f"/repos/{owner}/{repo}/git/refs/heads/{branch}",
        json={"sha": commit["sha"], "force": False}
    )

    PREVIEWS.pop(preview_id, None)

    return (
        f"Success! Commit: {commit['sha']} | "
        f"Uploaded/updated: {len(data['uploads'])} | "
        f"Deleted: {len(data['deletes'])}"
    )


@app.get("/")
def home():
    return render_page()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "github_token_configured": bool(GITHUB_TOKEN),
        "admin_password_configured": bool(ADMIN_PASSWORD)
    }


@app.post("/preview")
def preview():
    password = request.form.get("password", "")
    repo = request.form.get("repo", "")
    mode = request.form.get("mode", "replace")
    raw_map = request.form.get("file_map", "")

    try:
        check_password(password)

        upload = request.files.get("zip_file")
        if not upload or not upload.filename:
            raise ValueError("ZIP file select karo.")

        if not upload.filename.lower().endswith(".zip"):
            raise ValueError("Sirf .zip file upload karo.")

        zip_bytes = upload.read(MAX_ZIP_SIZE + 1)

        if len(zip_bytes) > MAX_ZIP_SIZE:
            raise ValueError("ZIP maximum 25 MB ka ho sakta hai.")

        result = make_preview(repo, mode, raw_map, zip_bytes)

        return render_page(
            result=result,
            repo=repo,
            mode=mode,
            file_map=raw_map,
            password=password
        )

    except Exception as exc:
        return render_page(
            error=str(exc),
            repo=repo,
            mode=mode,
            file_map=raw_map,
            password=password
        ), 400


@app.post("/apply")
def apply():
    password = request.form.get("password", "")
    preview_id = request.form.get("preview_id", "")

    try:
        check_password(password)
        message = apply_preview(preview_id)

        return render_page(
            result={
                "message": message,
                "uploads": [],
                "deletes": [],
                "warnings": [],
                "token": None
            }
        )

    except Exception as exc:
        return render_page(error=str(exc)), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
