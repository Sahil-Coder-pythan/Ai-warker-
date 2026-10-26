"""Security and visual add-on wrapper. Original app.py/public/app.js remain untouched."""
import os, json, io, hmac
from urllib.parse import parse_qs
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.wrappers import Request, Response
from app import app as worker_app

SECRET = os.environ.get("FLASK_SECRET_KEY", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
serializer = URLSafeTimedSerializer(SECRET, salt="ai-worker-admin-session") if SECRET else None
LOGIN_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Worker • Secure Access</title><link rel="stylesheet" href="/public/style.css"></head><body class="gate-body"><div class="gate-glow"></div><main class="gate-card"><div class="gate-mark">✦</div><div class="eyebrow">PRIVATE WORKSPACE · ENCRYPTED ACCESS</div><h1>AI <span>WORKER</span></h1><p class="gate-copy">Your workspace, protected.</p><form method="post" action="/__admin_login"><label for="admin_password">ADMIN PASSWORD</label><div class="password-wrap"><input id="admin_password" name="password" type="password" placeholder="Enter your access password" autocomplete="current-password" required autofocus><span>◈</span></div><button type="submit">UNLOCK WORKSPACE <b>↗</b></button>{error}<div class="gate-foot"><i></i> SECURE GATEWAY <span>•</span> PRIVATE ACCESS ONLY</div></form></main></body></html>"""

class SecurityGateway:
    def __init__(self, app): self.app=app
    def __call__(self, environ, start_response):
        req=Request(environ)
        path=req.path
        def respond(body, status="200 OK", headers=None):
            headers=headers or [("Content-Type","text/html; charset=utf-8"),("Cache-Control","no-store")]
            start_response(status, headers+[("Content-Length",str(len(body)))])
            return [body]
        if path == "/__admin_login" and req.method == "POST":
            if not ADMIN_PASSWORD or not SECRET or not serializer:
                return respond(LOGIN_HTML.replace("{error}", '<p class="gate-error">Server admin settings are missing. Set ADMIN_PASSWORD and FLASK_SECRET_KEY in Render.</p>').encode(), "503 Service Unavailable")
            password=(req.form.get("password") or "").encode()
            if hmac.compare_digest(password, ADMIN_PASSWORD.encode()):
                cookie=serializer.dumps({"ok":True})
                body=b"Redirecting..."
                start_response("303 See Other", [("Location","/"),("Set-Cookie",f"aw_session={cookie}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200"),("Cache-Control","no-store"),("Content-Length",str(len(body)))])
                return [body]
            html=LOGIN_HTML.replace("{error}", '<p class="gate-error">Password incorrect. Please try again.</p>')
            return respond(html.encode(), "401 Unauthorized")
        # Keep health check available for Render; all application routes require a signed session.
        if path == "/health": return self.app(environ, start_response)
        valid=False
        if serializer:
            try:
                data=serializer.loads(req.cookies.get("aw_session", ""), max_age=43200)
                valid=bool(data.get("ok"))
            except (BadSignature, SignatureExpired, Exception): valid=False
        if not valid:
            if path.startswith("/public/"):
                # Only the login screen stylesheet is public; no app scripts or APIs.
                if path == "/public/style.css":
                    css_path=os.path.join(os.path.dirname(__file__),"public","luxury.css")
                    try:
                        body=open(css_path,"rb").read()
                        return respond(body, headers=[("Content-Type","text/css; charset=utf-8"),("Cache-Control","no-store")])
                    except OSError: pass
            html=LOGIN_HTML.replace("{error}", "")
            return respond(html.encode(), headers=[("Content-Type","text/html; charset=utf-8"),("Cache-Control","no-store")])
        # Serve the luxury stylesheet without modifying the original stylesheet.
        if path == "/public/style.css":
            try:
                body=open(os.path.join(os.path.dirname(__file__),"public","luxury.css"),"rb").read()
                return respond(body, headers=[("Content-Type","text/css; charset=utf-8"),("Cache-Control","no-cache")])
            except OSError: pass
        # If configured in Render, use the server-side GitHub token; never expose it to browser JS.
        if GITHUB_TOKEN and path.startswith("/api/") and req.method in ("POST","PUT","PATCH"):
            raw=req.get_data(cache=True)
            ctype=req.content_type or ""
            try:
                if "application/json" in ctype:
                    obj=json.loads(raw or b"{}")
                    if isinstance(obj,dict): obj["token"]=GITHUB_TOKEN
                    raw=json.dumps(obj,separators=(",",":")).encode()
                elif "multipart/form-data" in ctype:
                    # Existing form parser is retained when no token is configured in the request.
                    # Frontend token field is replaced through a bounded body substitution.
                    import re
                    raw=re.sub(rb'(name="token"\r\n\r\n).*?(\r\n--)', lambda m:m.group(1)+GITHUB_TOKEN.encode()+m.group(2), raw, count=1, flags=re.S)
                environ["wsgi.input"]=io.BytesIO(raw); environ["CONTENT_LENGTH"]=str(len(raw))
            except Exception: pass
        return self.app(environ,start_response)

app=SecurityGateway(worker_app)
