# AI Worker — Voice Orb

साफ सफेद स्क्रीन · बीच में गोल-गोल orb · हमेशा सुनता है · Microsoft/Google neural voices · conversational boxes

## Backend (working — do not break)
- POST /api/verify — token + repo list
- POST /api/wipe — all files to placeholder README
- POST /api/upload — ZIP + map
- POST /api/wipe-and-upload
- POST /api/brain — optional Groq (GROQ_API_KEY in Render)

## Deploy files
app.py, requirements.txt, render.yaml, README.md,
public/index.html, public/app.js, public/style.css

Optional env: GROQ_API_KEY, GROQ_MODEL=llama-3.3-70b-versatile

## Use
1. Token → Connect
2. White screen + spinning orb listens always
3. Speak: delete / upload / both
4. Select repo from box → map → ZIP → done
