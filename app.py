"""
AI Worker — GitHub repo wipe + ZIP upload according to map.
Token stays per-browser. No cross-user file visibility.
"""
import os
import io
import json
import base64
import hashlib
import secrets
import zipfile
import tempfile
from datetime import datetime

import requests
from flask import Flask, request, jsonify, send_from_directory
from cryptography.fernet import Fernet, InvalidToken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path="/public")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024  # 40 MB ZIP max

GITHUB_API = "https://api.github.com"
TIMEOUT = 45


def get_fernet():
    key = os.environ.get("MASTER_ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception:
        return None


def encrypt_token(token: str) -> str:
    f = get_fernet()
    if not f:
        # Fallback: never store plain on server; client keeps it
        return ""
    return f.encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    f = get_fernet()
    if not f or not encrypted:
        return ""
    try:
        return f.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        return ""


def gh_headers(token: str):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AI-Worker/1.0",
    }


def parse_repo(repo_input: str):
    """Accept 'owner/repo' or full https URL."""
    s = (repo_input or "").strip().rstrip("/")
    if "github.com/" in s:
        parts = s.split("github.com/")[-1].split("/")
        if len(parts) >= 2:
            return parts[0], parts[1].replace(".git", "")
    if "/" in s:
        a, b = s.split("/", 1)
        return a.strip(), b.strip().replace(".git", "")
    return None, None


def github_get(token, path, params=None):
    r = requests.get(
        f"{GITHUB_API}{path}",
        headers=gh_headers(token),
        params=params or {},
        timeout=TIMEOUT,
    )
    return r


def github_put(token, path, json_body):
    r = requests.put(
        f"{GITHUB_API}{path}",
        headers=gh_headers(token),
        json=json_body,
        timeout=TIMEOUT,
    )
    return r


def github_post(token, path, json_body):
    r = requests.post(
        f"{GITHUB_API}{path}",
        headers=gh_headers(token),
        json=json_body,
        timeout=TIMEOUT,
    )
    return r


def github_delete(token, path, json_body=None):
    r = requests.delete(
        f"{GITHUB_API}{path}",
        headers=gh_headers(token),
        json=json_body,
        timeout=TIMEOUT,
    )
    return r


def get_default_branch(token, owner, repo):
    r = github_get(token, f"/repos/{owner}/{repo}")
    if r.status_code != 200:
        return None, r
    return r.json().get("default_branch", "main"), r


def get_ref_sha(token, owner, repo, branch):
    r = github_get(token, f"/repos/{owner}/{repo}/git/ref/heads/{branch}")
    if r.status_code != 200:
        return None, r
    return r.json()["object"]["sha"], r


def create_blob(token, owner, repo, content_bytes, encoding="base64"):
    b64 = base64.b64encode(content_bytes).decode("ascii")
    r = github_post(
        token,
        f"/repos/{owner}/{repo}/git/blobs",
        {"content": b64, "encoding": encoding},
    )
    if r.status_code not in (200, 201):
        return None, r
    return r.json()["sha"], r


def create_tree(token, owner, repo, tree_items, base_tree=None):
    body = {"tree": tree_items}
    if base_tree:
        body["base_tree"] = base_tree
    r = github_post(token, f"/repos/{owner}/{repo}/git/trees", body)
    if r.status_code not in (200, 201):
        return None, r
    return r.json()["sha"], r


def create_commit(token, owner, repo, message, tree_sha, parent_sha=None):
    body = {
        "message": message,
        "tree": tree_sha,
        "parents": [parent_sha] if parent_sha else [],
    }
    r = github_post(token, f"/repos/{owner}/{repo}/git/commits", body)
    if r.status_code not in (200, 201):
        return None, r
    return r.json()["sha"], r


def update_ref(token, owner, repo, branch, commit_sha, force=True):
    r = requests.patch(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/refs/heads/{branch}",
        headers=gh_headers(token),
        json={"sha": commit_sha, "force": force},
        timeout=TIMEOUT,
    )
    return r


def wipe_repo(token, owner, repo):
    """
    Wipe almost all files by replacing the tree with a single placeholder README.
    (GitHub rejects a completely empty tree with 422 Invalid tree info.)
    """
    branch, r = get_default_branch(token, owner, repo)
    if not branch:
        return False, f"Repo नहीं मिला या access नहीं: {r.status_code} {r.text[:200]}"

    parent_sha, r = get_ref_sha(token, owner, repo, branch)
    # parent_sha can be None for brand-new empty repo

    placeholder = (
        b"# Repository cleaned by AI Worker\n\n"
        b"All previous files were removed. Upload a new ZIP to restore content.\n"
    )
    blob_sha, r = create_blob(token, owner, repo, placeholder)
    if not blob_sha:
        return False, f"Placeholder blob fail: {r.status_code} {r.text[:250]}"

    tree_items = [
        {
            "path": "README.md",
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha,
        }
    ]
    tree_sha, r = create_tree(token, owner, repo, tree_items)
    if not tree_sha:
        return False, f"Tree बनाने में fail: {r.status_code} {r.text[:250]}"

    commit_sha, r = create_commit(
        token,
        owner,
        repo,
        f"AI Worker: wipe all files ({datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC)",
        tree_sha,
        parent_sha,
    )
    if not commit_sha:
        return False, f"Commit fail: {r.status_code} {r.text[:250]}"

    r = update_ref(token, owner, repo, branch, commit_sha, force=True)
    if r.status_code not in (200, 201):
        return False, f"Branch update fail: {r.status_code} {r.text[:250]}"

    return True, f"सारी फाइलें delete हो गईं (सिर्फ README.md बचा)। Branch: {branch}"


def strip_zip_root(namelist: list) -> list:
    """If all files live under a single top folder (e.g. ai-builder-v2/), strip it."""
    files = []
    for name in namelist:
        if name.endswith("/"):
            continue
        if name.startswith("__MACOSX") or "/__MACOSX/" in name:
            continue
        if name.startswith(".") or "/." in name:
            continue
        files.append(name.replace("\\", "/"))
    if not files:
        return []
    tops = set()
    for n in files:
        parts = n.split("/")
        if len(parts) >= 2:
            tops.add(parts[0])
        else:
            tops.add("")  # file at root
    if len(tops) == 1:
        only = next(iter(tops))
        if only:  # single folder root
            prefix = only + "/"
            return [n[len(prefix):] if n.startswith(prefix) else n for n in files]
    return files


def apply_map(file_map: dict, zip_namelist: list) -> dict:
    """
    Returns { target_repo_path: zip_internal_path }.

    - Map empty → ZIP structure, but auto-strip single top folder (ai-builder-v2/…).
    - Map given → keys = repo paths, values = zip paths or basenames.
    """
    result = {}  # target -> zip_internal

    # Build clean list of zip files (full internal paths)
    zip_files = []
    for name in zip_namelist:
        if name.endswith("/"):
            continue
        n = name.replace("\\", "/")
        if n.startswith("__MACOSX") or "/__MACOSX/" in n:
            continue
        if n.startswith(".") or "/." in n:
            continue
        zip_files.append(n)

    if not zip_files:
        return {}

    if not file_map:
        # Auto: strip single root folder so files land at repo root
        stripped = strip_zip_root(zip_files)
        # Map stripped target -> original zip path
        # Recompute: if strip happened, zip path still has prefix
        tops = set()
        for n in zip_files:
            parts = n.split("/")
            tops.add(parts[0] if len(parts) >= 2 else "")
        prefix = ""
        if len(tops) == 1:
            only = next(iter(tops))
            if only:
                prefix = only + "/"
        for zpath in zip_files:
            target = zpath[len(prefix):] if prefix and zpath.startswith(prefix) else zpath
            if target:
                result[target] = zpath
        return result

    # Explicit map: target (repo) -> source (zip path or basename)
    for target, source in file_map.items():
        target = str(target).lstrip("/").replace("\\", "/")
        source = str(source or target).lstrip("/").replace("\\", "/")
        match = None
        if source in zip_files:
            match = source
        else:
            # try with any single root prefix
            for z in zip_files:
                if z == source or z.endswith("/" + source) or z.split("/")[-1] == source.split("/")[-1]:
                    # prefer exact suffix match
                    if z.endswith(source) or z.split("/")[-1] == source.split("/")[-1]:
                        match = z
                        if z.endswith("/" + source) or z == source:
                            break
        if match:
            result[target] = match
    return result


def upload_zip(token, owner, repo, zip_bytes: bytes, file_map: dict, commit_message: str):
    branch, r = get_default_branch(token, owner, repo)
    if not branch:
        return False, f"Repo access fail: {r.status_code} {r.text[:200]}"

    parent_sha, _ = get_ref_sha(token, owner, repo, branch)

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        return False, "ZIP फाइल खराब है।"

    namelist = zf.namelist()
    mapping = apply_map(file_map or {}, namelist)
    if not mapping:
        return False, "ZIP में कोई usable फाइल नहीं मिली।"

    tree_items = []
    errors = []
    for target_path, zip_path in mapping.items():
        try:
            data = zf.read(zip_path)
        except KeyError:
            errors.append(f"ZIP में नहीं: {zip_path}")
            continue
        blob_sha, r = create_blob(token, owner, repo, data)
        if not blob_sha:
            errors.append(f"Blob fail {target_path}: {r.status_code}")
            continue
        tree_items.append(
            {
                "path": target_path,
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha,
            }
        )

    if not tree_items:
        return False, "कोई फाइल upload नहीं हो सकी। " + "; ".join(errors[:5])

    # Full replace tree (no base_tree) so old files are gone if user wiped first
    tree_sha, r = create_tree(token, owner, repo, tree_items)
    if not tree_sha:
        return False, f"Tree fail: {r.status_code} {r.text[:250]}"

    msg = commit_message or f"AI Worker: upload {len(tree_items)} files"
    commit_sha, r = create_commit(token, owner, repo, msg, tree_sha, parent_sha)
    if not commit_sha:
        return False, f"Commit fail: {r.status_code} {r.text[:250]}"

    r = update_ref(token, owner, repo, branch, commit_sha, force=True)
    if r.status_code not in (200, 201):
        return False, f"Branch update fail: {r.status_code} {r.text[:250]}"

    extra = f" | skipped: {len(errors)}" if errors else ""
    return True, f"{len(tree_items)} फाइलें upload हो गईं। Branch: {branch}{extra}"


# ---------- Routes ----------

@app.get("/")
def home():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/health")
def health():
    return jsonify(ok=True, service="AI Worker")


@app.post("/api/verify")
def verify_token():
    """Check token + list accessible repos (first 30)."""
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    if not token or not token.startswith(("ghp_", "github_pat_")):
        return jsonify(error="सही GitHub Personal Access Token डालें (ghp_... या github_pat_...)"), 400

    r = github_get(token, "/user")
    if r.status_code != 200:
        return jsonify(error=f"Token invalid या expired: {r.status_code}"), 401

    user = r.json()
    repos_r = github_get(token, "/user/repos", {"per_page": 30, "sort": "updated", "affiliation": "owner,collaborator"})
    repos = []
    if repos_r.status_code == 200:
        for item in repos_r.json():
            repos.append(
                {
                    "full_name": item["full_name"],
                    "private": item.get("private", False),
                    "default_branch": item.get("default_branch", "main"),
                }
            )

    return jsonify(
        login=user.get("login"),
        name=user.get("name") or user.get("login"),
        avatar=user.get("avatar_url"),
        repos=repos,
    )


@app.post("/api/wipe")
def api_wipe():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    owner, repo = parse_repo(data.get("repo") or "")
    if not token:
        return jsonify(error="Token चाहिए"), 400
    if not owner or not repo:
        return jsonify(error="Repo format: owner/repo"), 400

    ok, msg = wipe_repo(token, owner, repo)
    if ok:
        return jsonify(message=msg)
    return jsonify(error=msg), 400


@app.post("/api/upload")
def api_upload():
    """
    multipart:
      token, repo, map (JSON string optional), message (optional), file (ZIP)
    """
    token = (request.form.get("token") or "").strip()
    repo_input = request.form.get("repo") or ""
    map_raw = request.form.get("map") or "{}"
    message = (request.form.get("message") or "").strip()
    owner, repo = parse_repo(repo_input)

    if not token:
        return jsonify(error="Token चाहिए"), 400
    if not owner or not repo:
        return jsonify(error="Repo format: owner/repo"), 400

    f = request.files.get("file")
    if not f:
        return jsonify(error="ZIP फाइल चुनें"), 400

    zip_bytes = f.read()
    if len(zip_bytes) < 50:
        return jsonify(error="ZIP बहुत छोटी / खाली है"), 400

    try:
        file_map = json.loads(map_raw) if map_raw.strip() else {}
        if not isinstance(file_map, dict):
            file_map = {}
    except json.JSONDecodeError:
        return jsonify(error="Map JSON सही नहीं है"), 400

    ok, msg = upload_zip(token, owner, repo, zip_bytes, file_map, message)
    if ok:
        return jsonify(message=msg)
    return jsonify(error=msg), 400


@app.post("/api/wipe-and-upload")
def api_wipe_and_upload():
    """One-shot: wipe then upload ZIP according to map. Fast path for your use-case."""
    token = (request.form.get("token") or "").strip()
    repo_input = request.form.get("repo") or ""
    map_raw = request.form.get("map") or "{}"
    message = (request.form.get("message") or "AI Worker: wipe + fresh upload").strip()
    owner, repo = parse_repo(repo_input)

    if not token:
        return jsonify(error="Token चाहिए"), 400
    if not owner or not repo:
        return jsonify(error="Repo format: owner/repo"), 400

    f = request.files.get("file")
    if not f:
        return jsonify(error="ZIP फाइल चुनें"), 400
    zip_bytes = f.read()

    try:
        file_map = json.loads(map_raw) if map_raw.strip() else {}
        if not isinstance(file_map, dict):
            file_map = {}
    except json.JSONDecodeError:
        return jsonify(error="Map JSON सही नहीं है"), 400

    ok1, msg1 = wipe_repo(token, owner, repo)
    if not ok1:
        return jsonify(error="Wipe fail: " + msg1), 400

    ok2, msg2 = upload_zip(token, owner, repo, zip_bytes, file_map, message)
    if not ok2:
        return jsonify(error="Upload fail (wipe हो चुका): " + msg2), 400

    return jsonify(message=f"Wipe ✅ → {msg2}")


@app.post("/api/brain")
def api_brain():
    """
    Smart NLU + short spoken reply via Groq when GROQ_API_KEY is set.
    Returns: { mode, reply, intent } intent = wipe|upload|wipe_upload|hello|none
    """
    data = request.get_json(silent=True) or {}
    user_text = (data.get("text") or "").strip()
    context = data.get("context") or {}
    if not user_text:
        return jsonify(error="text required"), 400

    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        return jsonify(reply=None, intent=None, mode="local")

    system = (
        "You are AI Worker — a calm, professional voice agent for GitHub file operations. "
        "Always address the user as बॉस. Reply in natural short Hindi (1-2 sentences), warm and clear. "
        "Tasks: delete/wipe repo files, upload ZIP with a map, or wipe then upload. "
        "Never invent whether files were deleted/uploaded — only guide the next step. "
        "Also classify intent.\n\n"
        "Respond ONLY as JSON (no markdown):\n"
        '{"intent":"wipe|upload|wipe_upload|hello|none","reply":"spoken Hindi line for बॉस"}'
    )
    payload = {
        "model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b"),
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    f"Context: {json.dumps(context, ensure_ascii=False)}\n"
                    f"User said: {user_text}"
                ),
            },
        ],
        "temperature": 0.35,
        "max_tokens": 220,
        "response_format": {"type": "json_object"},
    }
    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
        if r.status_code != 200:
            return jsonify(reply=None, intent=None, mode="local", error=r.text[:200])
        raw = r.json()["choices"][0]["message"]["content"].strip()
        parsed = json.loads(raw)
        intent = (parsed.get("intent") or "none").strip().lower()
        if intent not in ("wipe", "upload", "wipe_upload", "hello", "none"):
            intent = "none"
        reply = (parsed.get("reply") or "").strip() or None
        return jsonify(reply=reply, intent=intent, mode="groq")
    except Exception as e:
        return jsonify(reply=None, intent=None, mode="local", error=str(e)[:120])


# ElevenLabs default voices (user-provided list)
ELEVEN_VOICES = [
    {"id": "CwhRBWXzGAHq8TQ4Fs17", "name": "Roger", "desc": "Laid-Back, Casual, Resonant"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "desc": "Mature, Reassuring, Confident"},
    {"id": "FGY2WhTYpPnrIDTdsKH5", "name": "Laura", "desc": "Enthusiast, Quirky Attitude"},
    {"id": "IKne3meq5aSn9XLyUdCD", "name": "Charlie", "desc": "Deep, Confident, Energetic"},
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "George", "desc": "Warm, Captivating Storyteller"},
    {"id": "N2lVS1w4EtoT3dr4eOWO", "name": "Callum", "desc": "Husky Trickster"},
    {"id": "SAz9YHcvj6GT2YYXdXww", "name": "River", "desc": "Relaxed, Neutral, Informative"},
    {"id": "SOYHLrjzK2X1ezoPC6cr", "name": "Harry", "desc": "Fierce Warrior"},
    {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam", "desc": "Energetic, Social Media Creator"},
    {"id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Alice", "desc": "Clear, Engaging Educator"},
    {"id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "desc": "Knowledgable, Professional"},
    {"id": "bIHbv24MWmeRgasZH58o", "name": "Will", "desc": "Relaxed Optimist"},
    {"id": "cgSgspJ2msm6clMCkdW9", "name": "Jessica", "desc": "Playful, Bright, Warm"},
    {"id": "cjVigY5qzO86Huf0OWal", "name": "Eric", "desc": "Smooth, Trustworthy"},
    {"id": "hpp4J3VqNfWAUOO0d1Us", "name": "Bella", "desc": "Professional, Bright, Warm"},
    {"id": "iP95p4xoKVk53GoZ742B", "name": "Chris", "desc": "Charming, Down-to-Earth"},
    {"id": "nPczCjzI2devNBz1zQrb", "name": "Brian", "desc": "Deep, Resonant and Comforting"},
    {"id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel", "desc": "Steady Broadcaster"},
    {"id": "pFZP5JQG7iQjIQuC4Bku", "name": "Lily", "desc": "Velvety Actress"},
    {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "desc": "Dominant, Firm"},
    {"id": "pqHfZKP75CvOlQylNhV4", "name": "Bill", "desc": "Wise, Mature, Balanced"},
]


@app.get("/api/voices")
def api_voices():
    has_key = bool(os.environ.get("ELEVENLABS_API_KEY", "").strip())
    return jsonify(voices=ELEVEN_VOICES, elevenlabs=has_key)


@app.post("/api/tts")
def api_tts():
    """ElevenLabs TTS. Needs ELEVENLABS_API_KEY in Render env."""
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    voice_id = (data.get("voice_id") or "EXAVITQu4vr4xnSDxMaL").strip()
    if not text:
        return jsonify(error="text required"), 400

    api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        return jsonify(error="ELEVENLABS_API_KEY not set on server"), 503

    # Prefer multilingual for Hindi
    model = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text[:2500],
        "model_id": model,
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.8,
            "style": 0.35,
            "use_speaker_boost": True,
        },
    }
    try:
        r = requests.post(
            url,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json=payload,
            timeout=45,
        )
        if r.status_code != 200:
            return jsonify(error=f"ElevenLabs {r.status_code}: {r.text[:200]}"), 400
        from flask import Response

        return Response(r.content, mimetype="audio/mpeg")
    except Exception as e:
        return jsonify(error=str(e)[:200]), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
