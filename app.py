import os
import re
import io
import json
import uuid
import base64
import zipfile
import hashlib
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import (
    Flask, request, render_template_string,
    redirect, url_for, session
)
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(32))

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

MAX_ZIP_SIZE = 40 * 1024 * 1024          # 40 MB
MAX_TOTAL_SIZE = 80 * 1024 * 1024        # 80 MB unpacked
MAX_FILES = 800
MAX_FILE_SIZE = 8 * 1024 * 1024          # 8 MB per file

PREVIEWS = {}

SKIP_NAMES = {
    ".git", "node_modules", "__pycache__", ".env",
    ".DS_Store", ".pytest_cache", ".venv", "venv",
    ".idea", ".vscode"
}
SKIP_EXTENSIONS = {".pyc", ".pyo", ".swp"}


PAGE = """
<!doctype html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GitHub Worker</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b1020;color:#e8edff;font-family:Arial,sans-serif;padding:16px}
main{max-width:900px;margin:auto}
.card{background:#141c31;border:1px solid #293653;border-radius:16px;padding:18px;margin-bottom:16px}
h1{font-size:26px;margin:4px 0 10px}
h2{font-size:18px;margin-top:0}
p{color:#aebcda;line-height:1.55;margin:8px 0}
label{display:block;margin:14px 0 6px;font-weight:bold}
input,textarea,select{
 width:100%;padding:12px;border-radius:9px;border:1px solid #394968;
 background:#0b1326;color:white;font-size:15px
}
textarea{min-height:200px;resize:vertical;font-family:monospace;font-size:13px}
button{
 width:100%;padding:14px;border:0;border-radius:10px;
 background:#5877ff;color:white;font-weight:bold;font-size:16px;margin-top:14px
}
.secondary{background:#293653}
.item{background:#0b1326;border-radius:9px;padding:10px;margin:6px 0;overflow-wrap:anywhere;font-size:14px}
.ok{color:#76efb2}.warn{color:#ffd27b}.bad{color:#ff9393}
small{color:#aebcda}
a{color:#9fb6ff}
.badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:12px;margin-right:6px}
.badge-green{background:#1a3a2a;color:#76efb2}
.badge-red{background:#3a1a1a;color:#ff9393}
.badge-yellow{background:#3a2f1a;color:#ffd27b}
</style>
</head>
<body>
<main>
<div class="card">
<h1>GitHub Worker</h1>
<p>ZIP upload → automatic matching → preview → GitHub commit (API only, mobile screen pe GitHub nahi khulega).</p>
<p><b>GITHUB_TOKEN</b> sirf Render Environment mein rakho. Is page par kabhi mat paste karo.</p>
</div>

{% if error %}
<div class="card"><p class="bad"><b>Error:</b> {{ error }}</p></div>
{% endif %}

{% if result %}
<div class="card">
<h2>Preview Result</h2>
<p>{{ result.message }}</p>

{% if result.uploads %}
<h3>Upload / Update <span class="badge badge-green">{{ result.uploads|length }}</span></h3>
{% for name in result.uploads %}
<div class="item">＋ {{ name }}</div>
{% endfor %}
{% endif %}

{% if result.deletes %}
<h3>Delete <span class="badge badge-red">{{ result.deletes|length }}</span></h3>
{% for name in result.deletes %}
<div class="item warn">− {{ name }}</div>
{% endfor %}
{% endif %}

{% if result.warnings %}
<h3>Warnings</h3>
{% for warning in result.warnings %}
<div class="item warn">{{ warning }}</div>
{% endfor %}
{% endif %}

{% if result.token %}
<p class="warn"><b>Carefully review.</b> Apply karne se GitHub pe commit banega.</p>
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
 placeholder="owner/repository  (example: Sahil-Coder-pythan/ai-builder)"
 value="{{ repo or '' }}">

<label>Action</label>
<select name="mode" id="modeSelect" onchange="toggleZip()">
<option value="replace" {% if mode == 'replace' %}selected{% endif %}>
REPLACE — mapped files upload + baaki tracked files delete
</option>
<option value="upload" {% if mode == 'upload' %}selected{% endif %}>
UPLOAD — sirf mapped files add/update (delete nahi)
</option>
<option value="delete_all" {% if mode == 'delete_all' %}selected{% endif %}>
DELETE ALL — repository ki sari tracked files delete (ZIP optional)
</option>
</select>

<div id="zipSection">
<label>ZIP File <span id="zipRequired">(required)</span></label>
<input type="file" name="zip_file" accept=".zip,application/zip" id="zipInput">
</div>

<label>File Mapping — one GitHub path per line
<small style="font-weight:normal;display:block;margin-top:4px">
Folders auto banenge. Example:<br>
app.py<br>
requirements.txt<br>
public/index.html<br>
public/css/style.css
</small>
</label>
<textarea name="file_map" id="fileMap"
 placeholder="app.py&#10;requirements.txt&#10;render.yaml&#10;README.md&#10;public/index.html&#10;public/chat.html&#10;public/style.css&#10;public/app.js">{{ file_map or '' }}</textarea>

<p><small>
• ZIP ke andar extra root folder (jaise ai-builder/app.py) ho to bhi automatic match try hoga.<br>
• Tree drawing (├── └──) ki zarurat nahi.<br>
• DELETE ALL mode mein mapping blank chhod sakte ho.
</small></p>

<button type="submit">Analyze & Preview</button>
</form>
</div>

<div class="card">
<h2>Rules</h2>
<p>• <b>UPLOAD</b> → existing unmapped files ko nahi hatata.</p>
<p>• <b>REPLACE</b> → unmapped tracked files ko delete kar sakta hai.</p>
<p>• <b>DELETE ALL</b> → sari tracked files delete (ZIP mat do, mapping blank chhod do).</p>
<p>• Preview check kiye bina Apply mat karna.</p>
<p>• ZIP mein duplicate names + ambiguous match = error (guess nahi karega).</p>
<p>• Sab kaam GitHub API se hota hai — mobile ki screen pe GitHub nahi khulega.</p>
</div>
</main>

<script>
function toggleZip() {
  const mode = document.getElementById('modeSelect').value;
  const zipInput = document.getElementById('zipInput');
  const zipReq = document.getElementById('zipRequired');
  const fileMap = document.getElementById('fileMap');
  if (mode === 'delete_all') {
    zipInput.removeAttribute('required');
    zipReq.textContent = '(optional)';
    fileMap.placeholder = '(blank chhod sakte ho for full delete)';
  } else {
    zipInput.setAttribute('required', 'required');
    zipReq.textContent = '(required)';
    fileMap.placeholder = 'app.py\\nrequirements.txt\\npublic/index.html ...';
  }
}
toggleZip();
</script>
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
        raise ValueError("Render Environment mein GITHUB_TOKEN missing hai.")
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
        timeout=90,
        **kwargs
    )
    if not response.ok:
        try:
            detail = response.json().get("message", response.text)
        except Exception:
            detail = response.text
        raise ValueError(f"GitHub API error ({response.status_code}): {detail}")
    if response.status_code == 204:
        return {}
    return response.json()


def check_password(password):
    if not ADMIN_PASSWORD:
        raise ValueError("Render Environment mein ADMIN_PASSWORD set nahi hai.")
    if not password or password != ADMIN_PASSWORD:
        raise ValueError("Admin password galat hai.")


def parse_repo(value):
    value = (value or "").strip().rstrip("/")
    value = re.sub(r"^https?://github\.com/", "", value, flags=re.I)
    value = value.removesuffix(".git")
    parts = value.split("/")
    if len(parts) != 2 or not all(parts):
        raise ValueError("Repo format galat hai. Example: owner/repository")
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
            "Yeh Worker sirf token owner ke apne personal repository ke liye hai. "
            "Repo owner aur token owner same hone chahiye."
        )
    data = github_request("GET", f"/repos/{owner}/{repo}")
    return owner, repo, data


def clean_zip_path(path):
    path = path.replace("\\", "/").strip().lstrip("./")
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
    output = []
    seen = set()
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line or line.startswith("```"):
            continue
        # tree characters, bullets etc remove
        line = re.sub(r"^[\s│├└─|+`>*>-]+", "", line).strip()
        line = re.split(r"\s(?:←|#)\s*", line, maxsplit=1)[0].strip()
        line = line.strip("`'\\\" ")
        line = line.replace("\\", "/").strip()
        if not line or line.endswith("/"):
            continue
        while line.startswith("./"):
            line = line[2:]
        if line.startswith("/") or ".." in line.split("/"):
            raise ValueError(f"Mapping path unsafe hai: {line}")
        if line.lower() in ("ai-builder", "root", "public", "src"):
            continue
        if line not in seen:
            output.append(line)
            seen.add(line)
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
        entries = [info for info in archive.infolist() if not info.is_dir()]
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
                raise ValueError(f"{clean} file {MAX_FILE_SIZE//1024//1024} MB se badi hai.")
            total_size += info.file_size
            if total_size > MAX_TOTAL_SIZE:
                raise ValueError(f"ZIP ka unpacked size {MAX_TOTAL_SIZE//1024//1024} MB se zyada hai.")
            if clean in files:
                raise ValueError(f"ZIP mein duplicate normalized path mila: {clean}")
            files[clean] = archive.read(info)
    return files, warnings


def match_source(target, zip_files):
    target = target.strip("/")
    if target in zip_files:
        return target
    suffix_matches = [name for name in zip_files if name.endswith("/" + target)]
    if len(suffix_matches) == 1:
        return suffix_matches[0]
    if len(suffix_matches) > 1:
        raise ValueError(
            f"{target}: ZIP mein multiple suffix matches hain → "
            + ", ".join(suffix_matches[:6])
        )
    basename = target.split("/")[-1]
    basename_matches = [
        name for name in zip_files if name.split("/")[-1] == basename
    ]
    if len(basename_matches) == 1:
        return basename_matches[0]
    if len(basename_matches) > 1:
        raise ValueError(
            f"{target}: basename '{basename}' multiple jagah hai. "
            "Mapping ko full path se clear karo."
        )
    raise ValueError(f"Mapping wali file ZIP mein nahi mili: {target}")


def get_branch_tree(owner, repo, branch):
    ref = github_request("GET", f"/repos/{owner}/{repo}/git/ref/heads/{branch}")
    commit_sha = ref["object"]["sha"]
    commit = github_request("GET", f"/repos/{owner}/{repo}/git/commits/{commit_sha}")
    tree_sha = commit["tree"]["sha"]
    tree = github_request(
        "GET",
        f"/repos/{owner}/{repo}/git/trees/{tree_sha}",
        params={"recursive": "1"}
    )
    if tree.get("truncated"):
        raise ValueError(
            "GitHub tree bahut bada hai (truncated). "
            "Is repository par safe replace nahi kiya ja sakta."
        )
    tracked = {}
    for item in tree.get("tree", []):
        if item.get("type") == "blob":
            tracked[item["path"]] = item.get("sha")
    return commit_sha, tree_sha, tracked


def make_preview(repo_value, mode, raw_map, zip_bytes):
    owner, repo, repo_data = get_owned_repo(repo_value)
    targets = parse_mapping(raw_map)
    zip_files = {}
    warnings = []

    if mode != "delete_all":
        if not zip_bytes:
            raise ValueError("Is mode ke liye ZIP file zaroori hai.")
        zip_files, warnings = read_zip(zip_bytes)
        if not zip_files:
            raise ValueError("ZIP mein upload karne layak files nahi mili.")

    uploads = {}
    if mode != "delete_all":
        if not targets:
            raise ValueError("File mapping empty hai. Har line par ek file path likho.")
        for target in targets:
            source = match_source(target, zip_files)
            uploads[target] = zip_files[source]

    branch = repo_data.get("default_branch")
    if not branch:
        raise ValueError("Repository mein default branch nahi mili.")

    commit_sha, tree_sha, tracked = get_branch_tree(owner, repo, branch)

    if mode == "replace":
        deletes = sorted(set(tracked.keys()) - set(uploads.keys()))
    elif mode == "upload":
        deletes = []
    elif mode == "delete_all":
        deletes = sorted(tracked.keys())
        uploads = {}
    else:
        raise ValueError("Unknown action mode.")

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
            f"Repository: {owner}/{repo} | Branch: {branch} | Mode: {mode.upper()} | "
            f"Tracked files abhi: {len(tracked)}"
        )
    }


def apply_preview(preview_id):
    data = PREVIEWS.get(preview_id)
    if not data:
        raise ValueError("Preview expire ya unavailable hai. Dobara Analyze & Preview karo.")

    owner = data["owner"]
    repo = data["repo"]
    branch = data["branch"]

    # Safety: branch still same?
    current_ref = github_request("GET", f"/repos/{owner}/{repo}/git/ref/heads/{branch}")
    current_sha = current_ref["object"]["sha"]
    if current_sha != data["base_commit"]:
        raise ValueError(
            "Preview ke baad repository change ho gayi. Latest state ka naya preview banao."
        )

    tree_entries = []

    # Deletes
    for path in data["deletes"]:
        tree_entries.append({
            "path": path,
            "mode": "100644",
            "type": "blob",
            "sha": None
        })

    # Uploads (blobs)
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

    commit_msg = {
        "replace": "GitHub Worker: replace mapped files",
        "upload": "GitHub Worker: upload mapped files",
        "delete_all": "GitHub Worker: delete all tracked files"
    }.get(data["mode"], "GitHub Worker update")

    commit = github_request(
        "POST",
        f"/repos/{owner}/{repo}/git/commits",
        json={
            "message": commit_msg,
            "tree": new_tree["sha"],
            "parents": [data["base_commit"]]
        }
    )

    # Final safety check
    latest = github_request("GET", f"/repos/{owner}/{repo}/git/ref/heads/{branch}")
    if latest["object"]["sha"] != data["base_commit"]:
        raise ValueError(
            "Apply ke dauran branch badal gayi. Commit ban gaya hai lekin branch update nahi hua. "
            "Repo check karo."
        )

    github_request(
        "PATCH",
        f"/repos/{owner}/{repo}/git/refs/heads/{branch}",
        json={"sha": commit["sha"], "force": False}
    )

    PREVIEWS.pop(preview_id, None)

    return (
        f"✅ Success! Commit: {commit['sha'][:12]}… | "
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

        zip_bytes = b""
        upload = request.files.get("zip_file")
        if upload and upload.filename:
            if not upload.filename.lower().endswith(".zip"):
                raise ValueError("Sirf .zip file upload karo.")
            zip_bytes = upload.read(MAX_ZIP_SIZE + 1)
            if len(zip_bytes) > MAX_ZIP_SIZE:
                raise ValueError(f"ZIP maximum {MAX_ZIP_SIZE//1024//1024} MB ka ho sakta hai.")

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
