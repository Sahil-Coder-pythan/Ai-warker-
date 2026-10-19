# AI Worker — GitHub File Agent

तुम सिर्फ बोलो / बटन दबाओ:

1. **Repo की सारी फाइलें delete**
2. **ZIP + नक्शा** देकर सही जगह फाइलें upload

सब कुछ GitHub API से बैकग्राउंड में होता है। Browser/mobile window नहीं खुलता।  
Token सिर्फ उसी डिवाइस के localStorage में रहता है — एक लिंक कई लोग चलाएँ तो भी एक-दूसरे की फाइलें/token कभी नहीं दिखतीं।

---

## Deploy (Render)

Repo root में ये फाइलें:

```
app.py
requirements.txt
render.yaml
README.md
public/
  index.html
  app.js
  style.css
```

Render Web Service:
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app`
- Env:
  - `FLASK_SECRET_KEY` (auto generate)
  - `MASTER_ENCRYPTION_KEY` (optional, for future server-side encrypt)

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## GitHub Token

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)**
2. Generate new token (classic)
3. Scope: **repo** (full)
4. Copy → AI Worker में paste → Verify

---

## नक्शा (Map) उदाहरण

जब ZIP का अंदर का structure अलग हो, या तुम force करना चाहो कि कौन सी फाइल कहाँ जाए:

```json
{
  "app.py": "app.py",
  "requirements.txt": "requirements.txt",
  "render.yaml": "render.yaml",
  "README.md": "README.md",
  "public/index.html": "public/index.html",
  "public/chat.html": "public/chat.html",
  "public/app.js": "public/app.js",
  "public/style.css": "public/style.css",
  "public/known_models.json": "public/known_models.json",
  "public/known_urls.json": "public/known_urls.json"
}
```

- **Left** = GitHub repo में path  
- **Right** = ZIP के अंदर का path (या सिर्फ filename — auto match)

Map खाली छोड़ोगे तो ZIP का अपना folder structure जैसा-का-तैसा लग जाएगा।

---

## Typical flow (तुम्हारा use-case)

1. Token verify
2. Repo चुनो: `Sahil-Coder-pythan/ai-builder`
3. ZIP चुनो (ai-builder-v3.zip)
4. नक्शा paste करो (ऊपर वाला)
5. **Wipe + Upload** दबाओ  
   → 5–15 सेकंड में पुरानी सब delete + नई फाइलें सही जगह

---

## Privacy

- Token browser localStorage में (इस डिवाइस पर)
- ZIP server memory में process होता है, disk पर permanent save नहीं
- कोई shared database / shared session नहीं — हर visitor isolated
