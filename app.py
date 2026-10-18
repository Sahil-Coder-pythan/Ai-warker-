
import os
import io
import re
import json
import time
import base64
import secrets
import zipfile
import requests
from urllib.parse import urlparse
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024

TOKEN = os.getenv("GITHUB_TOKEN", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
MAX_FILES = 500
MAX_TOTAL = 50 * 1024 * 1024
MAX_FILE = 5 * 1024 * 1024
PREVIEWS = {}

BLOCKED_PARTS = {".git", "node_modules", "__pycache__"}
BLOCKED_NAMES = {".env", ".DS_Store"}


def headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def gh(method, api, path, **kwargs):
    r = requests.request(
        method, api + path, headers=headers(), timeout=25, **kwargs
    )
    if not r.ok:
        raise RuntimeError(
            f"GitHub API error {r.status_code}: {r.text[:350]}"
        )
    if r.status_code == 204 or not r.content:
        return {}
    return r.json()


def authorized():
    return bool(ADMIN_PASSWORD) and secrets.compare_digest(
        request.headers.get("X-Admin-Password", ""),
        ADMIN_PASSWORD
    )


def repo_details(link):
    if not TOKEN:
        raise ValueError("Render Environment mein GITHUB_TOKEN set karo.")

    u = urlparse(link.strip())
    if u.scheme != "https" or u.hostname != "github.com":
        raise ValueError("Sirf https://github.com/OWNER/REPO link do.")

    parts = u.path.strip("/").split("/")
    if len(parts) < 2:
        raise ValueError("Repository link adhura hai.")

    owner = parts[0]
    repo = parts[1].removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner):
        raise ValueError("Invalid repository owner.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid repository name.")

    api = f"https://api.github.com/repos/{owner}/{repo}"

    # Verify the token's identity and allow only personal repos
    # owned by that authenticated account.
    me = requests.get(
        "https://api.github.com/user", headers=headers(), timeout=20
    )
    if not me.ok:
        raise ValueError("GitHub token invalid hai ya access nahi mila.")

    username = me.json().get("login", "").lower()
    details = gh("GET", api, "")
    actual_owner = details.get("owner", {}).get("login", "").lower()

    if actual_owner != username:
        raise ValueError(
            "Safety rule: sirf token-owner ki apni personal repositories allowed hain."
        )
    if details.get("disabled"):
        raise ValueError("Repository disabled hai.")

    branch = details.get("default_branch") or "main"
    return api, owner, repo, branch


def clean_path(value):
    p = value.strip().replace("\\", "/").lstrip("/")
    parts = p.split("/")
    if not p or any(x in ("", ".", "..") for x in parts):
        raise ValueError(f"Invalid path: {value}")
    if any(x in BLOCKED_PARTS for x in parts):
        raise ValueError(f"Blocked path: {value}")
    if parts[-1] in BLOCKED_NAMES or parts[-1].endswith(".pyc"):
        raise ValueError(f"Blocked file: {value}")
    return "/".join(parts)


def parse_map(text):
    mapping = {}
    folder = ""

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        if "->" in line:
            src, dst = line.split("->", 1)
            src = src.strip().lstrip("- ").strip()
            mapping[src] = clean_path(dst)
            continue

        if line.upper() == "ROOT:":
            folder = ""
            continue

        if line.endswith(":"):
            folder = line[:-1].strip().strip("/")
            if folder.upper() == "ROOT":
                folder = ""
            elif folder:
                clean_path(folder + "/placeholder")
            continue

        filename = line.lstrip("-* ").strip()
        if filename:
            dst = f"{folder}/{filename}" if folder else filename
            mapping[filename] = clean_path(dst)

    if not mapping:
        raise ValueError("Upload/Replace ke liye file map zaroori hai.")

    if len(set(mapping.values())) != len(mapping):
        raise ValueError("Map mein duplicate destination paths hain.")
    return mapping


def read_upload(upload):
    if not upload or not upload.filename:
        raise ValueError("ZIP ya file select karo.")

    raw = upload.read()
    if not raw:
        raise ValueError("Uploaded file khaali hai.")

    if upload.filename.lower().endswith(".zip"):
        try:
            z = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile:
            raise ValueError("ZIP file valid nahi hai.")

        result = {}
        total = 0
        for info in z.infolist():
            if info.is_dir():
                continue
            if info.flag_bits & 1:
                raise ValueError("Password-protected ZIP supported nahi hai.")
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/"):
                raise ValueError(f"Unsafe ZIP path: {name}")
            if any(p in BLOCKED_PARTS for p in name.split("/")):
                continue
            if name.split("/")[-1] in BLOCKED_NAMES:
                continue
            if name.endswith(".pyc"):
                continue
            if info.file_size > MAX_FILE:
                raise ValueError(f"File 5 MB se badi hai: {name}")

            total += info.file_size
            if total > MAX_TOTAL:
                raise ValueError("ZIP extract limit 50 MB hai.")
            if len(result) >= MAX_FILES:
                raise ValueError("ZIP mein 500 se zyada files hain.")

            if name in result:
                raise ValueError(f"ZIP mein duplicate path: {name}")
            result[name] = z.read(info)

        if not result:
            raise ValueError("ZIP mein usable files nahi mili.")
        return result

    # A standalone file can be uploaded with a map such as:
    # README.md -> README.md
    return {upload.filename: raw}


def map_files(raw_files, mapping):
    mapped = {}
    used = set()
    missing = []

    for source, destination in mapping.items():
        hits = [
            p for p in raw_files
            if p == source or p.split("/")[-1] == source
        ]
        if len(hits) > 1:
            raise ValueError(
                f"{source} multiple files se match hota hai: {hits}. "
                "Map mein ZIP ka exact source path likho."
            )
        if not hits:
            missing.append(source)
            continue

        src = hits[0]
        if src in used:
            raise ValueError(f"Ek ZIP file multiple baar map hui: {src}")
        used.add(src)
        mapped[destination] = raw_files[src]

    extras = sorted(set(raw_files) - used)
    if missing:
        raise ValueError(f"Map wali files missing hain: {missing}")
    if extras:
        raise ValueError(f"ZIP ki kuch files map nahi hui: {extras}")
    return mapped


def get_head_tree(api, branch):
    ref = gh("GET", api, f"/git/ref/heads/{branch}")
    head = ref["object"]["sha"]
    commit = gh("GET", api, f"/git/commits/{head}")
    tree_sha = commit["tree"]["sha"]
    tree = gh("GET", api, "/git/trees/" + tree_sha,
              params={"recursive": "1"})
    if tree.get("truncated"):
        raise ValueError("Repository tree bahut bada hai; safe operation roka.")
    blobs = {
        x["path"]: x for x in tree.get("tree", [])
        if x["type"] == "blob"
    }
    return head, tree_sha, blobs


def detect_mode(command, selected):
    c = command.lower()
    if selected in ("delete", "upload", "replace"):
        return selected

    wants_upload = any(x in c for x in (
        "upload", "zip", "अपलोड", "चढ़ा", "लगाओ", "लगानी"
    ))
    wants_delete = any(x in c for x in (
        "delete", "remove", "हटा", "डिलीट", "मिटा"
    ))
    if wants_delete and wants_upload:
        return "replace"
    if wants_delete:
        return "delete"
    if wants_upload:
        return "upload"
    raise ValueError("Command se action samajh nahi aaya. Mode select karo.")


def make_preview(api, owner, repo, branch, mode, mapped):
    head, tree_sha, old = get_head_tree(api, branch)
    incoming = mapped or {}
    new_paths = set(incoming)
    old_paths = set(old)

    added = sorted(new_paths - old_paths)
    updated = sorted(new_paths & old_paths)
    deleted = sorted(old_paths) if mode == "delete" else (
        sorted(old_paths - new_paths) if mode == "replace" else []
    )

    # Avoid showing an action that doesn't change anything.
    if mode == "delete" and not deleted:
        note = "Repository mein delete karne layak tracked files nahi mili."
    else:
        note = "Review the exact file list before confirming."

    return {
        "api": api, "owner": owner, "repo": repo, "branch": branch,
        "mode": mode, "head": head, "tree_sha": tree_sha, "old": old,
        "files": incoming, "added": added, "updated": updated,
        "deleted": deleted, "note": note
    }


def commit_plan(plan, message):
    api = plan["api"]
    branch = plan["branch"]

    # Don't commit if another change happened after preview.
    current, _, _ = get_head_tree(api, branch)
    if current != plan["head"]:
        raise ValueError("Preview ke baad repo badli. Dobara Preview banao.")

    entries = []
    for path, data in plan["files"].items():
        blob = gh("POST", api, "/git/blobs", json={
            "content": base64.b64encode(data).decode("ascii"),
            "encoding": "base64"
        })
        entries.append({
            "path": path, "mode": "100644",
            "type": "blob", "sha": blob["sha"]
        })

    for path in plan["deleted"]:
        entries.append({
            "path": path, "mode": "100644",
            "type": "blob", "sha": None
        })

    if not entries:
        raise ValueError("Koi change nahi hai.")

    tree = gh("POST", api, "/git/trees", json={
        "base_tree": plan["tree_sha"], "tree": entries
    })
    commit = gh("POST", api, "/git/commits", json={
        "message": (message or "Update via GitHub Worker")[:150],
        "tree": tree["sha"], "parents": [plan["head"]]
    })

    # force=False protects against overwriting a newer branch.
    gh("PATCH", api, f"/git/refs/heads/{branch}", json={
        "sha": commit["sha"], "force": False
    })
    return commit["sha"]


PAGE = r"""
<!doctype html><html lang="hi"><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GitHub Worker</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#080d18;color:#f1f5ff;
font:15px system-ui;padding:16px}main{max-width:780px;margin:auto}
h1{margin-bottom:5px}.muted,small{color:#aab8d0}
.card{background:#111a2b;border:1px solid #293a55;border-radius:15px;
padding:16px;margin:14px 0}
label{display:block;font-weight:700;margin:13px 0 6px}
input,textarea,select,button{width:100%;padding:12px;border-radius:10px;
font:inherit}input,textarea,select{background:#080f1e;color:#fff;
border:1px solid #354761}textarea{min-height:150px}
button{margin-top:12px;background:#7d9aff;color:#071024;border:0;
font-weight:800}button.danger{background:#ffbd70}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#080f1e;
padding:12px;border-radius:10px;max-height:360px;overflow:auto}
</style></head><body><main>
<h1>⚡ GitHub Worker</h1>
<div class="muted">Server-side file manager · ZIP map · One commit</div>
<div class="card">
<label>Admin password</label><input id="pw" type="password">
<label>Apni GitHub repository ka link</label>
<input id="repo" placeholder="https://github.com/USERNAME/REPOSITORY">
<label>Command</label>
<textarea id="cmd">Purani files delete karke ZIP wali files map ke mutabik upload karo.</textarea>
<label>Action</label>
<select id="mode">
<option value="auto">Command se khud samjho</option>
<option value="delete">Sirf purani files DELETE karo</option>
<option value="upload">Sirf files UPLOAD/UPDATE karo; baaki rakho</option>
<option value="replace">Purani files DELETE + mapped files UPLOAD</option>
</select>
<label>ZIP ya ek file</label><input id="file" type="file" accept=".zip,*/*">
<label>File map (upload/replace ke liye)</label>
<textarea id="map">ROOT:
- app.py
- requirements.txt
- render.yaml
- README.md

public/:
- index.html
- style.css
- app.js</textarea>
<label>Commit message</label>
<input id="msg" value="Update files using GitHub Worker">
<button onclick="preview()">1. Preview banao</button>
<pre id="out">Yahan status aur file list dikhegi.</pre>
<label><input id="confirm" type="checkbox" style="width:auto">
Maine poora Preview check kar liya hai aur listed changes approve karta hoon.</label>
<button class="danger" onclick="applyPlan()">2. Confirm karke apply karo</button>
</div></main>
<script>
let previewId="";
function h(){return {"X-Admin-Password":document.getElementById("pw").value}}
async function preview(){
 const f=document.getElementById("file").files[0];
 const mode=document.getElementById("mode").value;
 if(mode!=="delete"&&!f){alert("Upload/replace ke liye file ya ZIP select karo.");return}
 const d=new FormData();
 d.append("repo",document.getElementById("repo").value);
 d.append("command",document.getElementById("cmd").value);
 d.append("mode",mode);
 d.append("map",document.getElementById("map").value);
 if(f)d.append("file",f);
 const out=document.getElementById("out");
 out.textContent="Server par preview ban raha hai...";
 document.getElementById("confirm").checked=false;
 try{
  const r=await fetch("/preview",{method:"POST",headers:h(),body:d});
  const j=await r.json();previewId=j.preview_id||"";
  out.textContent=JSON.stringify(j,null,2);
 }catch(e){out.textContent="Network error: "+e}
}
async function applyPlan(){
 if(!previewId){alert("Pehle Preview banao.");return}
 if(!document.getElementById("confirm").checked){
  alert("Pehle confirmation checkbox tick karo.");return}
 if(!confirm("Listed changes ko GitHub par apply karna hai?"))return;
 const out=document.getElementById("out");
 out.textContent="Server par commit ban raha hai...";
 try{
  const r=await fetch("/apply",{method:"POST",headers:{
   ...h(),"Content-Type":"application/json"},
   body:JSON.stringify({preview_id:previewId,
    message:document.getElementById("msg").value})});
  const j=await r.json();out.textContent=JSON.stringify(j,null,2);
  if(r.ok)previewId="";
 }catch(e){out.textContent="Network error: "+e}
}
</script></body></html>
"""


@app.get("/")
def home():
    return render_template_string(PAGE)


@app.get("/health")
def health():
    return {"ok": True, "configured": bool(TOKEN and ADMIN_PASSWORD)}


@app.post("/preview")
def preview():
    if not authorized():
        return jsonify(error="Password incorrect or not configured."), 401
    try:
        api, owner, repo, branch = repo_details(request.form.get("repo", ""))
        command = request.form.get("command", "")
        mode = detect_mode(command, request.form.get("mode", "auto"))

        mapped = {}
        if mode != "delete":
            raw = read_upload(request.files.get("file"))
            mapping = parse_map(request.form.get("map", ""))
            mapped = map_files(raw, mapping)

        plan = make_preview(api, owner, repo, branch, mode, mapped)
        pid = secrets.token_urlsafe(32)
        PREVIEWS[pid] = {"plan": plan, "created": time.time()}

        return jsonify({
            "preview_id": pid,
            "repository": f"{owner}/{repo}",
            "branch": branch,
            "mode": mode.upper(),
            "new_files": len(plan["added"]),
            "updated_files": len(plan["updated"]),
            "deleted_files": len(plan["deleted"]),
            "added": plan["added"],
            "updated": plan["updated"],
            "deleted": plan["deleted"],
            "note": plan["note"],
            "message": "Preview ready. Apply karne se pehle list check karo."
        })
    except Exception as e:
        return jsonify(error=str(e)), 400


@app.post("/apply")
def apply():
    if not authorized():
        return jsonify(error="Unauthorized"), 401
    data = request.get_json(silent=True) or {}
    pid = data.get("preview_id", "")
    saved = PREVIEWS.get(pid)
    if not saved:
        return jsonify(error="Preview expired/missing. Dobara Preview banao."), 400
    if time.time() - saved["created"] > 900:
        PREVIEWS.pop(pid, None)
        return jsonify(error="Preview 15 minutes baad expire ho gaya. Dobara banao."), 400

    try:
        plan = saved["plan"]
        sha = commit_plan(plan, data.get("message", "Update via GitHub Worker"))
        PREVIEWS.pop(pid, None)
        return jsonify({
            "ok": True,
            "message": "Ho gaya! GitHub par changes commit ho gaye. Check kar lo.",
            "repository": f"{plan['owner']}/{plan['repo']}",
            "commit": sha,
            "commit_url": f"https://github.com/{plan['owner']}/{plan['repo']}/commit/{sha}",
            "added": plan["added"],
            "updated": plan["updated"],
            "deleted": plan["deleted"]
        })
    except Exception as e:
        return jsonify(error=str(e)), 400


@app.errorhandler(413)
def too_large(_):
    return jsonify(error="Upload 25 MB se chhota hona chahiye."), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 10000)))
