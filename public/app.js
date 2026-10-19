/* AI Worker — voice-first orb UI. Backend endpoints unchanged. */
const $ = (s) => document.querySelector(s);
const TOKEN_KEY = "ai_worker_token_v1";
const VOICE_KEY = "ai_worker_voice_v1";

const state = {
  token: "",
  repos: [],
  user: null,
  step: "idle", // idle | need_repo | need_intent | need_map | need_zip | confirm | working
  intent: null, // wipe | upload | wipe_upload
  repo: null,
  mapJson: "{}",
  zipFile: null,
  listening: false,
  speaking: false,
  voices: [],
  voiceURI: localStorage.getItem(VOICE_KEY) || "",
};

// ---------- UI helpers ----------
function setOrb(mode) {
  const o = $("#orb");
  o.className = "orb " + (mode || "idle");
}
function setStatus(t) {
  $("#statusLine").textContent = t || "";
}
function clearBoxes() {
  const layer = $("#boxLayer");
  [...layer.children].forEach((el) => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 240);
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

// ---------- TTS ----------
function loadVoices() {
  const list = speechSynthesis.getVoices() || [];
  state.voices = list;
  // Prefer natural Microsoft / Google Hindi or warm English
  if (!state.voiceURI && list.length) {
    const prefer = list.find((v) =>
      /heera|swara|neerja|microsoft.*(natural|online).*hi|google.*hindi|en-IN.*neural|aria|guy|jenny|sara/i.test(
        v.name + " " + v.lang
      )
    );
    const hi = list.find((v) => /hi-IN|hindi/i.test(v.lang + v.name));
    const enSoft = list.find((v) =>
      /en-US|en-GB/.test(v.lang) && /neural|natural|online|premium|enhanced/i.test(v.name)
    );
    state.voiceURI = (prefer || hi || enSoft || list[0]).voiceURI;
    localStorage.setItem(VOICE_KEY, state.voiceURI);
  }
  renderVoiceList();
}
function currentVoice() {
  return state.voices.find((v) => v.voiceURI === state.voiceURI) || state.voices[0] || null;
}
function renderVoiceList() {
  const box = $("#voiceList");
  if (!box) return;
  box.innerHTML = "";
  // Sort: Hindi first, then Microsoft/Google neural, then rest
  const sorted = [...state.voices].sort((a, b) => {
    const score = (v) => {
      let s = 0;
      if (/hi/i.test(v.lang)) s += 50;
      if (/microsoft|google|neural|natural|online/i.test(v.name)) s += 20;
      return -s;
    };
    return score(a) - score(b);
  });
  sorted.forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "voice-item" + (v.voiceURI === state.voiceURI ? " active" : "");
    b.textContent = `${v.name} (${v.lang})`;
    b.onclick = () => {
      state.voiceURI = v.voiceURI;
      localStorage.setItem(VOICE_KEY, v.voiceURI);
      renderVoiceList();
      speak("बॉस, ये नई आवाज़ सेट हो गई।");
    };
    box.appendChild(b);
  });
}
function speak(text) {
  return new Promise((resolve) => {
    try {
      speechSynthesis.cancel();
    } catch (_) {}
    const u = new SpeechSynthesisUtterance(text);
    const v = currentVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.pitch = 1.0;
    u.lang = (v && v.lang) || "hi-IN";
    state.speaking = true;
    setOrb("speaking");
    setStatus(text);
    u.onend = () => {
      state.speaking = false;
      setOrb(state.listening ? "listening" : "idle");
      setStatus("सुन रहा हूँ…");
      resolve();
    };
    u.onerror = () => {
      state.speaking = false;
      setOrb("listening");
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

// ---------- STT (always on) ----------
let recognition = null;
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus("इस ब्राउज़र में voice नहीं चल रहा। Chrome / Edge खोलो।");
    return;
  }
  recognition = new SR();
  recognition.lang = "hi-IN";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    if (state.speaking || state.step === "working") return;
    let text = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) text += e.results[i][0].transcript;
    }
    text = (text || "").trim();
    if (text) onUserSpeech(text);
  };
  recognition.onerror = () => {
    // restart quietly
    setTimeout(startListening, 600);
  };
  recognition.onend = () => {
    if (state.step !== "working" && $("#main") && !$("#main").classList.contains("hidden")) {
      setTimeout(startListening, 350);
    }
  };
}
function startListening() {
  if (!recognition || state.speaking) return;
  try {
    recognition.start();
    state.listening = true;
    setOrb("listening");
    setStatus("सुन रहा हूँ…");
  } catch (_) {
    /* already started */
  }
}
function stopListening() {
  state.listening = false;
  try {
    recognition && recognition.stop();
  } catch (_) {}
}

// ---------- Intent ----------
function detectIntent(t) {
  const s = t.toLowerCase();
  if (/wipe|delete|हटा|डिलीट|मिटा|साफ|खाली/.test(s) && /upload|अपलोड|डाल|replace|रिप्लेस/.test(s))
    return "wipe_upload";
  if (/upload|अपलोड|डाल|replace|रिप्लेस|नक्शा|map|zip/.test(s)) return "upload";
  if (/wipe|delete|हटा|डिलीट|मिटा|साफ|खाली/.test(s)) return "wipe";
  if (/worker|वर्कर|hello|नमस्ते|hi |hey/.test(s)) return "hello";
  return null;
}

async function onUserSpeech(text) {
  console.log("heard:", text);
  // If a text box is focused, ignore voice for typing flow
  if (document.activeElement && ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName)) {
    return;
  }

  const intent = detectIntent(text);

  if (state.step === "idle") {
    if (intent === "hello" || !intent) {
      await speak("बॉस, बताइए — फाइलें डिलीट करनी हैं, अपलोड, या दोनों?");
      return;
    }
    state.intent = intent;
    state.step = "need_repo";
    await speak("बॉस, मैंने नीचे बॉक्स भेज दिया है। अपनी repo चुन लीजिए।");
    showRepoBox();
    return;
  }

  if (state.step === "need_intent") {
    if (intent && intent !== "hello") {
      state.intent = intent;
      await afterRepoReady();
    } else {
      await speak("बॉस, डिलीट, अपलोड, या दोनों — साफ बता दीजिए।");
    }
  }
}

// ---------- Boxes ----------
function showRepoBox() {
  const repos = state.repos.length
    ? state.repos
    : [{ full_name: "कोई repo नहीं मिली — token permissions चेक करें" }];
  const html = `
    <div class="label">Repository</div>
    <div class="title">अपनी repo चुनो</div>
    <div class="repo-grid" id="repoGrid">
      ${repos
        .map(
          (r) =>
            `<button type="button" class="repo-btn" data-repo="${r.full_name || r}">${
              r.full_name || r
            }</button>`
        )
        .join("")}
    </div>`;
  const box = showBox(html);
  box.querySelectorAll(".repo-btn").forEach((btn) => {
    btn.onclick = async () => {
      const name = btn.getAttribute("data-repo");
      if (!name || name.includes("नहीं")) return;
      state.repo = name;
      clearBoxes();
      await speak(`बॉस, repo मिल चुकी है — ${name.split("/").pop()}।`);
      await afterRepoReady();
    };
  });
}

async function afterRepoReady() {
  if (!state.intent) {
    state.step = "need_intent";
    await speak("बॉस, अब बताइए — सारी फाइलें डिलीट करनी हैं, अपलोड, या डिलीट करके नई अपलोड?");
    return;
  }
  if (state.intent === "wipe") {
    state.step = "confirm";
    showConfirmWipe();
    return;
  }
  // upload or wipe_upload → need map then zip
  state.step = "need_map";
  await speak("बॉस, मैंने बॉक्स भेज दिया है। नक्शा पेस्ट कर दीजिए। खाली छोड़ोगे तो ZIP का structure लग जाएगा।");
  showMapBox();
}

function showConfirmWipe() {
  const html = `
    <div class="label">Confirm</div>
    <div class="title">${state.repo}</div>
    <p style="color:#64748b;font-size:0.9rem;margin-bottom:8px;">सारी फाइलें delete होंगी। सिर्फ README बचेगा।</p>
    <div class="check-row"><span class="tick">✓ Repo</span></div>
    <div class="fbox-actions">
      <button type="button" class="ghost" id="cCancel">रद्द</button>
      <button type="button" class="primary" id="cGo">Delete शुरू करो</button>
    </div>`;
  const box = showBox(html);
  box.querySelector("#cCancel").onclick = async () => {
    clearBoxes();
    state.step = "idle";
    state.intent = null;
    state.repo = null;
    await speak("ठीक है बॉस, रद्द कर दिया।");
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
      await speak("बॉस, JSON सही नहीं है। फिर से पेस्ट करो।");
      return;
    }
    clearBoxes();
    state.step = "need_zip";
    await speak("बॉस, नक्शा मिल गया। अब ZIP फाइल चुन लीजिए — बॉक्स भेज रहा हूँ।");
    showZipBox();
  };
  box.querySelector("#mapOk").onclick = () => go($("#mapArea").value);
  box.querySelector("#mapSkip").onclick = () => go("{}");
}

function showZipBox() {
  const html = `
    <div class="label">ZIP फाइल</div>
    <div class="title">जो फाइलें upload / replace करनी हैं</div>
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
    const ticks = box.querySelector("#ticks");
    ticks.innerHTML += `<span class="tick">✓ ZIP — ${f.name}</span>`;
    await speak("बॉस, फाइल मिल गई। अब बताइए — सिर्फ upload, या पहले सारी पुरानी delete करके फिर upload?");
    // action choice
    const act = document.createElement("div");
    act.className = "fbox-actions";
    act.style.marginTop = "10px";
    act.innerHTML = `
      <button type="button" class="ghost" id="onlyUp">सिर्फ Upload</button>
      <button type="button" class="primary" id="wipeUp">Delete + Upload</button>`;
    box.appendChild(act);
    act.querySelector("#onlyUp").onclick = () => runUpload(false);
    act.querySelector("#wipeUp").onclick = () => runUpload(true);
  };
}

// ---------- API actions ----------
async function runWipe() {
  clearBoxes();
  state.step = "working";
  stopListening();
  showProgress("फाइलें delete हो रही हैं…");
  await speak("ठीक है बॉस, start हो चुका हूँ। फाइलें delete कर रहा हूँ।");
  try {
    const res = await fetch("/api/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token, repo: state.repo }),
    });
    const data = await res.json();
    hideProgress();
    if (!res.ok) throw new Error(data.error || "Wipe fail");
    await speak("बॉस, फाइलें delete हो चुकी हैं आपके मुताबिक। GitHub पर check कर लो।");
  } catch (e) {
    hideProgress();
    await speak("बॉस, error आया — " + (e.message || "fail"));
  }
  resetFlow();
}

async function runUpload(doWipe) {
  clearBoxes();
  state.step = "working";
  stopListening();
  showProgress(doWipe ? "पहले delete, फिर upload…" : "फाइलें upload हो रही हैं…");
  await speak(
    doWipe
      ? "ठीक है बॉस, start। पहले पुरानी फाइलें हटा रहा हूँ, फिर नई लगा रहा हूँ।"
      : "ठीक है बॉस, upload start कर रहा हूँ।"
  );
  try {
    const fd = new FormData();
    fd.append("token", state.token);
    fd.append("repo", state.repo);
    fd.append("map", state.mapJson || "{}");
    fd.append("message", doWipe ? "AI Worker: wipe + upload" : "AI Worker: upload");
    fd.append("file", state.zipFile);
    const url = doWipe ? "/api/wipe-and-upload" : "/api/upload";
    const res = await fetch(url, { method: "POST", body: fd });
    const data = await res.json();
    hideProgress();
    if (!res.ok) throw new Error(data.error || "Upload fail");
    await speak("बॉस, काम पूरा। " + (data.message || "फाइलें लग चुकी हैं।") + " एक बार check कर लो।");
  } catch (e) {
    hideProgress();
    await speak("बॉस, error — " + (e.message || "fail"));
  }
  resetFlow();
}

function resetFlow() {
  state.step = "idle";
  state.intent = null;
  state.repo = null;
  state.mapJson = "{}";
  state.zipFile = null;
  $("#zipPicker").value = "";
  setOrb("listening");
  setStatus("सुन रहा हूँ…");
  startListening();
}

// ---------- Boot ----------
$("#menuBtn").onclick = () => $("#voicePanel").classList.toggle("hidden");
$("#vpClose").onclick = () => $("#voicePanel").classList.add("hidden");

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

async function enterMain(data) {
  state.user = data;
  state.repos = data.repos || [];
  $("#setup").classList.add("hidden");
  $("#main").classList.remove("hidden");
  initRecognition();
  await speak(`नमस्ते बॉस${data.login ? ", " + data.login : ""}. मैं AI Worker हूँ। बताइए क्या करना है।`);
  startListening();
}

$("#verifyBtn").onclick = async () => {
  const t = $("#tokenInput").value.trim();
  $("#setupErr").textContent = "";
  if (!t) {
    $("#setupErr").textContent = "Token डालो";
    return;
  }
  $("#verifyBtn").disabled = true;
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
    $("#setupErr").textContent = e.message;
  } finally {
    $("#verifyBtn").disabled = false;
  }
};

// Auto resume
(async () => {
  const saved = localStorage.getItem(TOKEN_KEY);
  if (!saved) return;
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: saved }),
    });
    const data = await res.json();
    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    state.token = saved;
    await enterMain(data);
  } catch (_) {
    localStorage.removeItem(TOKEN_KEY);
  }
})();
