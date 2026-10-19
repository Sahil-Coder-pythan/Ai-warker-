/* AI Worker — ElevenLabs voice + premium orb. Backend wipe/upload unchanged. */
const $ = (s) => document.querySelector(s);
const TOKEN_KEY = "ai_worker_token_v1";
const VOICE_KEY = "ai_worker_el_voice_v1";

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah

const state = {
  token: "",
  repos: [],
  step: "idle",
  intent: null,
  repo: null,
  mapJson: "{}",
  zipFile: null,
  listening: false,
  speaking: false,
  voices: [],
  voiceId: localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE,
  elevenOk: false,
  audio: null,
};

// ---------- UI ----------
function setOrb(mode) {
  $("#orb").className = "orb state-" + (mode || "idle");
}
function setStatus(t) {
  $("#statusLine").textContent = t || "";
}
function clearBoxes() {
  const layer = $("#boxLayer");
  [...layer.children].forEach((el) => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 220);
  });
}
function showBox(html) {
  clearBoxes();
  const el = document.createElement("div");
  el.className = "fbox";
  el.innerHTML = html;
  $("#boxLayer").appendChild(el);
  return el;
}
function showProgress(text) {
  $("#progText").textContent = text || "काम चल रहा है…";
  $("#progress").classList.remove("hidden");
  setOrb("working");
}
function hideProgress() {
  $("#progress").classList.add("hidden");
}

// ---------- ElevenLabs TTS ----------
async function loadVoices() {
  try {
    const r = await fetch("/api/voices");
    const d = await r.json();
    state.voices = d.voices || [];
    state.elevenOk = !!d.elevenlabs;
    $("#voiceHint").textContent = state.elevenOk
      ? "ElevenLabs connected · कोई भी voice चुनो"
      : "⚠️ Render env में ELEVENLABS_API_KEY डालो — वरना browser voice चलेगी";
    renderVoiceList();
  } catch (_) {
    state.voices = [];
    $("#voiceHint").textContent = "Voice list load fail";
  }
}

function renderVoiceList() {
  const box = $("#voiceList");
  box.innerHTML = "";
  state.voices.forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "voice-item" + (v.id === state.voiceId ? " active" : "");
    b.innerHTML = `${v.name}<small>${v.desc}</small>`;
    b.onclick = async () => {
      state.voiceId = v.id;
      localStorage.setItem(VOICE_KEY, v.id);
      renderVoiceList();
      await speak("बॉस, ये नई आवाज़ सेट हो गई।");
    };
    box.appendChild(b);
  });
}

function stopAudio() {
  const a = $("#ttsAudio");
  try {
    a.pause();
    a.src = "";
  } catch (_) {}
  if (state.audio) {
    try {
      URL.revokeObjectURL(state.audio);
    } catch (_) {}
    state.audio = null;
  }
}

function browserSpeak(text) {
  return new Promise((resolve) => {
    try {
      speechSynthesis.cancel();
    } catch (_) {}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    u.rate = 1.02;
    state.speaking = true;
    setOrb("speaking");
    setStatus(text);
    u.onend = u.onerror = () => {
      state.speaking = false;
      setOrb(state.listening ? "listening" : "idle");
      setStatus("सुन रहा हूँ…");
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

async function speak(text) {
  stopAudio();
  setStatus(text);
  setOrb("speaking");
  state.speaking = true;

  if (!state.elevenOk) {
    await browserSpeak(text);
    return;
  }

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: state.voiceId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("TTS fail", err);
      await browserSpeak(text);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    state.audio = url;
    const a = $("#ttsAudio");
    a.src = url;
    await new Promise((resolve) => {
      a.onended = a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  } catch (e) {
    console.warn(e);
    await browserSpeak(text);
  } finally {
    state.speaking = false;
    setOrb(state.listening ? "listening" : "idle");
    setStatus("सुन रहा हूँ…");
  }
}

// ---------- STT always-on (silent — no beeps; softer pickup) ----------
let recognition = null;
let recRestartTimer = null;
let lastHeardAt = 0;

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus("Chrome / Edge में खोलो — voice के लिए");
    return;
  }
  recognition = new SR();
  // Hindi primary; continuous + interim helps catch soft speech
  recognition.lang = "hi-IN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onresult = (e) => {
    if (state.speaking || state.step === "working") return;
    let finalText = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = (e.results[i][0] && e.results[i][0].transcript) || "";
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    // soft visual only while user is speaking — no sound
    if (interim && !finalText) {
      setStatus("… " + interim.slice(0, 40));
      setOrb("listening");
    }
    const text = (finalText || "").trim();
    if (!text) return;
    // debounce duplicate finals within 1.2s
    const now = Date.now();
    if (now - lastHeardAt < 1200) return;
    lastHeardAt = now;
    setStatus(text);
    onUserSpeech(text);
  };

  recognition.onerror = (ev) => {
    // no sound; quiet restart. ignore 'aborted' / 'no-speech' noise
    const err = (ev && ev.error) || "";
    if (err === "aborted" || err === "no-speech") {
      scheduleRestart(300);
      return;
    }
    scheduleRestart(800);
  };

  recognition.onend = () => {
    if (state.step === "working" || $("#main").classList.contains("hidden")) return;
    if (state.speaking) {
      scheduleRestart(500);
      return;
    }
    scheduleRestart(250);
  };
}

function scheduleRestart(ms) {
  if (recRestartTimer) clearTimeout(recRestartTimer);
  recRestartTimer = setTimeout(() => startListening(), ms);
}

function startListening() {
  if (!recognition || state.speaking || state.step === "working") return;
  try {
    recognition.start();
    state.listening = true;
    setOrb("listening");
    setStatus("सुन रहा हूँ…");
  } catch (_) {
    // already started — ignore
  }
}

function stopListening() {
  state.listening = false;
  if (recRestartTimer) clearTimeout(recRestartTimer);
  try {
    recognition && recognition.stop();
  } catch (_) {}
}

// ---------- Intent (local fallback + Groq brain) ----------
function detectIntentLocal(t) {
  const s = t.toLowerCase();
  if (/wipe|delete|हटा|डिलीट|मिटा|साफ|खाली/.test(s) && /upload|अपलोड|डाल|replace|रिप्लेस/.test(s))
    return "wipe_upload";
  if (/upload|अपलोड|डाल|replace|रिप्लेस|नक्शा|map|zip/.test(s)) return "upload";
  if (/wipe|delete|हटा|डिलीट|मिटा|साफ|खाली/.test(s)) return "wipe";
  if (/worker|वर्कर|hello|नमस्ते|hi |hey/.test(s)) return "hello";
  return null;
}

async function askBrain(text) {
  try {
    const res = await fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        context: {
          step: state.step,
          intent: state.intent,
          repo: state.repo,
          repos: (state.repos || []).slice(0, 8).map((r) => r.full_name),
        },
      }),
    });
    if (!res.ok) return { mode: "local", reply: null, intent: null };
    return await res.json();
  } catch (_) {
    return { mode: "local", reply: null, intent: null };
  }
}

async function onUserSpeech(text) {
  if (document.activeElement && ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName)) return;

  // Groq brain (if GROQ_API_KEY set) + local fallback
  const brain = await askBrain(text);
  let intent = brain.intent && brain.intent !== "none" ? brain.intent : detectIntentLocal(text);
  if (intent === "none") intent = null;

  if (state.step === "idle") {
    if (intent === "hello" || !intent) {
      const line =
        brain.reply ||
        "बॉस, बताइए — फाइलें डिलीट करनी हैं, अपलोड, या दोनों?";
      await speak(line);
      return;
    }
    state.intent = intent;
    state.step = "need_repo";
    await speak(
      brain.reply || "बॉस, मैंने नीचे बॉक्स भेज दिया है। अपनी repo चुन लीजिए।"
    );
    showRepoBox();
    return;
  }
  if (state.step === "need_intent") {
    if (intent && intent !== "hello") {
      state.intent = intent;
      if (brain.reply) await speak(brain.reply);
      await afterRepoReady();
    } else {
      await speak(
        brain.reply || "बॉस, डिलीट, अपलोड, या दोनों — साफ बता दीजिए।"
      );
    }
  }
}

// ---------- Boxes ----------
function showRepoBox() {
  const repos = state.repos.length ? state.repos : [];
  const html = `
    <div class="label">Repository</div>
    <div class="title">अपनी repo चुनो</div>
    <div class="repo-grid">
      ${
        repos.length
          ? repos
              .map(
                (r) =>
                  `<button type="button" class="repo-btn" data-repo="${r.full_name}">${r.full_name}</button>`
              )
              .join("")
          : `<p style="color:#a1a1aa;font-size:0.9rem">कोई repo नहीं · token permissions चेक करें</p>`
      }
    </div>`;
  const box = showBox(html);
  box.querySelectorAll(".repo-btn").forEach((btn) => {
    btn.onclick = async () => {
      state.repo = btn.getAttribute("data-repo");
      clearBoxes();
      await speak(`बॉस, repo मिल चुकी है — ${state.repo.split("/").pop()}।`);
      await afterRepoReady();
    };
  });
}

async function afterRepoReady() {
  if (!state.intent) {
    state.step = "need_intent";
    await speak("बॉस, अब बताइए — सारी फाइलें डिलीट, अपलोड, या डिलीट करके नई अपलोड?");
    return;
  }
  if (state.intent === "wipe") {
    state.step = "confirm";
    showConfirmWipe();
    return;
  }
  state.step = "need_map";
  await speak("बॉस, मैंने बॉक्स भेज दिया है। नक्शा पेस्ट कर दीजिए। खाली छोड़ोगे तो ZIP का structure लग जाएगा।");
  showMapBox();
}

function showConfirmWipe() {
  const html = `
    <div class="label">Confirm</div>
    <div class="title">${state.repo}</div>
    <p style="color:#a1a1aa;font-size:0.88rem;margin-bottom:10px">सारी फाइलें delete होंगी।</p>
    <div class="check-row"><span class="tick">✓ Repo</span></div>
    <div class="fbox-actions">
      <button type="button" class="ghost" id="cCancel">रद्द</button>
      <button type="button" class="primary" id="cGo">Delete शुरू</button>
    </div>`;
  const box = showBox(html);
  box.querySelector("#cCancel").onclick = async () => {
    clearBoxes();
    resetFlow(false);
    await speak("ठीक है बॉस, रद्द।");
  };
  box.querySelector("#cGo").onclick = () => runWipe();
}

function showMapBox() {
  const html = `
    <div class="label">नक्शा (Map JSON)</div>
    <div class="title">optional — खाली भी छोड़ सकते हो</div>
    <textarea id="mapArea" placeholder='{"app.py":"app.py","public/index.html":"public/index.html"}'></textarea>
    <div class="fbox-actions">
      <button type="button" class="ghost" id="mapSkip">खाली छोड़ो</button>
      <button type="button" class="primary" id="mapOk">आगे</button>
    </div>`;
  const box = showBox(html);
  const go = async (raw) => {
    state.mapJson = (raw || "{}").trim() || "{}";
    try {
      JSON.parse(state.mapJson);
    } catch {
      await speak("बॉस, JSON सही नहीं है।");
      return;
    }
    clearBoxes();
    state.step = "need_zip";
    await speak("बॉस, नक्शा मिल गया। अब ZIP चुन लीजिए।");
    showZipBox();
  };
  box.querySelector("#mapOk").onclick = () => go($("#mapArea").value);
  box.querySelector("#mapSkip").onclick = () => go("{}");
}

function showZipBox() {
  const html = `
    <div class="label">ZIP फाइल</div>
    <div class="title">upload / replace वाली फाइलें</div>
    <div class="check-row" id="ticks">
      <span class="tick">✓ Repo</span>
      <span class="tick">✓ नक्शा</span>
    </div>
    <div class="fbox-actions">
      <button type="button" class="primary" id="pickZip">ZIP चुनो</button>
    </div>`;
  const box = showBox(html);
  box.querySelector("#pickZip").onclick = () => $("#zipPicker").click();
  $("#zipPicker").onchange = async () => {
    const f = $("#zipPicker").files[0];
    if (!f) return;
    state.zipFile = f;
    box.querySelector("#ticks").innerHTML += `<span class="tick">✓ ${f.name}</span>`;
    await speak("बॉस, फाइल मिल गई। सिर्फ upload, या पहले delete फिर upload?");
    const act = document.createElement("div");
    act.className = "fbox-actions";
    act.innerHTML = `
      <button type="button" class="ghost" id="onlyUp">सिर्फ Upload</button>
      <button type="button" class="primary" id="wipeUp">Delete + Upload</button>`;
    box.appendChild(act);
    act.querySelector("#onlyUp").onclick = () => runUpload(false);
    act.querySelector("#wipeUp").onclick = () => runUpload(true);
  };
}

// ---------- Actions (same APIs) ----------
async function runWipe() {
  clearBoxes();
  state.step = "working";
  stopListening();
  showProgress("फाइलें delete हो रही हैं…");
  await speak("ठीक है बॉस, start। फाइलें delete कर रहा हूँ।");
  try {
    const res = await fetch("/api/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token, repo: state.repo }),
    });
    const data = await res.json();
    hideProgress();
    if (!res.ok) throw new Error(data.error || "Wipe fail");
    await speak("बॉस, फाइलें delete हो चुकी हैं। GitHub पर check कर लो।");
  } catch (e) {
    hideProgress();
    await speak("बॉस, error — " + (e.message || "fail"));
  }
  resetFlow(true);
}

async function runUpload(doWipe) {
  clearBoxes();
  state.step = "working";
  stopListening();
  showProgress(doWipe ? "पहले delete, फिर upload…" : "Upload हो रहा है…");
  await speak(doWipe ? "Start। पहले पुरानी हटा रहा हूँ, फिर नई लगा रहा हूँ।" : "Upload start।");
  try {
    const fd = new FormData();
    fd.append("token", state.token);
    fd.append("repo", state.repo);
    fd.append("map", state.mapJson || "{}");
    fd.append("message", doWipe ? "AI Worker: wipe + upload" : "AI Worker: upload");
    fd.append("file", state.zipFile);
    const res = await fetch(doWipe ? "/api/wipe-and-upload" : "/api/upload", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    hideProgress();
    if (!res.ok) throw new Error(data.error || "Upload fail");
    await speak("बॉस, काम पूरा। " + (data.message || "") + " Check कर लो।");
  } catch (e) {
    hideProgress();
    await speak("बॉस, error — " + (e.message || "fail"));
  }
  resetFlow(true);
}

function resetFlow(startMic) {
  state.step = "idle";
  state.intent = null;
  state.repo = null;
  state.mapJson = "{}";
  state.zipFile = null;
  $("#zipPicker").value = "";
  setOrb("listening");
  setStatus("सुन रहा हूँ…");
  if (startMic) startListening();
}

// ---------- Boot ----------
$("#menuBtn").onclick = () => $("#voicePanel").classList.toggle("hidden");
$("#vpClose").onclick = () => $("#voicePanel").classList.add("hidden");

async function enterMain(data) {
  state.repos = data.repos || [];
  $("#setup").classList.add("hidden");
  $("#main").classList.remove("hidden");
  await loadVoices();
  initRecognition();
  await speak(`नमस्ते बॉस${data.login ? ", " + data.login : ""}. मैं AI Worker हूँ। बताइए क्या करना है।`);
  startListening();
}

// Connect — box NEVER auto-closes. Only hides after successful Connect click.
$("#verifyBtn").onclick = async () => {
  const t = $("#tokenInput").value.trim();
  $("#setupErr").textContent = "";
  if (!t) {
    $("#setupErr").textContent = "Token यहाँ type करो, फिर Connect दबाओ";
    $("#tokenInput").focus();
    return;
  }
  if (!t.startsWith("ghp_") && !t.startsWith("github_pat_")) {
    $("#setupErr").textContent = "Token ghp_ या github_pat_ से शुरू होना चाहिए";
    return;
  }
  $("#verifyBtn").disabled = true;
  $("#verifyBtn").textContent = "Connecting…";
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verify fail");
    state.token = t;
    localStorage.setItem(TOKEN_KEY, t);
    await enterMain(data);
  } catch (e) {
    $("#setupErr").textContent = e.message || "Connect fail";
    $("#tokenInput").focus();
  } finally {
    $("#verifyBtn").disabled = false;
    $("#verifyBtn").textContent = "Connect";
  }
};

// Prefill saved token only — user MUST press Connect. Box stays.
(function prefillToken() {
  const saved = localStorage.getItem(TOKEN_KEY);
  if (saved) {
    $("#tokenInput").value = saved;
    $("#setupErr").textContent = "पुराना token भरा है — Connect दबाओ (या नया type करो)";
  }
  $("#tokenInput").focus();
})();
