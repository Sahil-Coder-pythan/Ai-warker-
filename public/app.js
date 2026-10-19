/* AI Worker — Chat UI (no voice). Wipe/upload + Groq Q&A */
const $ = (s) => document.querySelector(s);
const TOKEN_KEY = "ai_worker_token_v1";

const state = {
  token: "",
  login: "",
  repos: [],
  busy: false,
};

function addMsg(role, text, extraClass) {
  const el = document.createElement("div");
  el.className = "msg " + role + (extraClass ? " " + extraClass : "");
  if (role === "bot") {
    el.innerHTML = '<span class="tag">AI Worker</span>\n' + escapeHtml(text);
  } else if (role === "user") {
    el.textContent = text;
  } else {
    el.textContent = text;
  }
  $("#chat").appendChild(el);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return el;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fillRepos(repos) {
  const sel = $("#repoSelect");
  sel.innerHTML = '<option value="">Repo चुनो…</option>';
  (repos || []).forEach((r) => {
    const o = document.createElement("option");
    o.value = r.full_name;
    o.textContent = r.full_name + (r.private ? " 🔒" : "");
    sel.appendChild(o);
  });
}

function selectedRepo() {
  return ($("#repoSelect").value || "").trim();
}

function openTools() {
  $("#actionPanel").classList.remove("hidden");
}
function closeTools() {
  $("#actionPanel").classList.add("hidden");
}

function detectLocal(t) {
  const s = t.toLowerCase();
  if (/wipe|delete|हटा|डिलीट|मिटा|साफ|खाली/.test(s) && /upload|अपलोड|डाल|replace|रिप्लेस/.test(s))
    return "wipe_upload";
  if (/upload|अपलोड|डाल|replace|रिप्लेस|नक्शा|map|zip/.test(s)) return "upload";
  if (/wipe|delete|हटा|डिलीट|मिटा|साफ|खाली|हटान/.test(s)) return "wipe";
  if (/tool|tools|पैनल|सेटिंग|map|नक्शा|zip/.test(s)) return "tools";
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
          repo: selectedRepo() || null,
          repos: (state.repos || []).slice(0, 10).map((r) => r.full_name),
          login: state.login,
        },
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function doWipe() {
  const repo = selectedRepo();
  if (!repo) {
    addMsg("bot", "पहले ऊपर से repo चुनो, फिर Delete दबाओ।");
    return;
  }
  if (state.busy) return;
  state.busy = true;
  const m = addMsg("bot", "Delete शुरू… " + repo, "working");
  try {
    const res = await fetch("/api/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token, repo }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Wipe fail");
    m.classList.remove("working");
    m.innerHTML =
      '<span class="tag">AI Worker</span>\n' +
      escapeHtml(data.message || "फाइलें delete हो चुकी हैं। GitHub पर check कर लो।");
  } catch (e) {
    m.classList.remove("working");
    m.innerHTML =
      '<span class="tag">AI Worker</span>\n' + escapeHtml("Error: " + (e.message || "fail"));
  } finally {
    state.busy = false;
  }
}

async function doUpload(doWipeFirst) {
  const repo = selectedRepo();
  if (!repo) {
    addMsg("bot", "पहले ऊपर से repo चुनो।");
    return;
  }
  const file = $("#zipInput").files && $("#zipInput").files[0];
  if (!file) {
    addMsg("bot", "ZIP फाइल चुनो (⚙ Tools में), फिर Upload दबाओ।");
    openTools();
    return;
  }
  let mapJson = ($("#mapInput").value || "").trim() || "{}";
  try {
    JSON.parse(mapJson);
  } catch (_) {
    addMsg("bot", "Map JSON गलत है। ठीक करके फिर कोशिश करो।");
    return;
  }
  if (state.busy) return;
  state.busy = true;
  const label = doWipeFirst ? "Delete + Upload" : "Upload";
  const endpoint = doWipeFirst ? "/api/wipe-and-upload" : "/api/upload";
  const m = addMsg("bot", label + " शुरू… " + repo, "working");
  try {
    const fd = new FormData();
    fd.append("token", state.token);
    fd.append("repo", repo);
    fd.append("map", mapJson);
    fd.append("file", file);
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload fail");
    m.classList.remove("working");
    m.innerHTML =
      '<span class="tag">AI Worker</span>\n' +
      escapeHtml(data.message || "काम पूरा। GitHub पर check कर लो।");
  } catch (e) {
    m.classList.remove("working");
    m.innerHTML =
      '<span class="tag">AI Worker</span>\n' + escapeHtml("Error: " + (e.message || "fail"));
  } finally {
    state.busy = false;
  }
}

async function handleSend() {
  const input = $("#msgInput");
  const text = (input.value || "").trim();
  if (!text || state.busy) return;
  input.value = "";
  input.style.height = "auto";
  addMsg("user", text);

  const local = detectLocal(text);

  if (local === "tools") {
    openTools();
    addMsg("bot", "Tools पैनल खोल दिया। Map paste करो, ZIP चुनो, फिर Delete / Upload दबाओ। ऊपर से repo भी चुनना।");
    return;
  }

  if (local === "wipe") {
    if (!selectedRepo()) {
      addMsg("bot", "Repo ऊपर से चुनो, फिर मैं delete कर दूँगा। या ⚙ Tools से भी Delete दबा सकते हो।");
      return;
    }
    await doWipe();
    return;
  }

  if (local === "upload" || local === "wipe_upload") {
    openTools();
    addMsg(
      "bot",
      local === "wipe_upload"
        ? "Delete + Upload: Map (optional) + ZIP चुनो, फिर «Delete + Upload» दबाओ।"
        : "Upload: Map (optional) + ZIP चुनो, फिर «Upload» दबाओ।"
    );
    return;
  }

  const thinking = addMsg("bot", "सोच रहा हूँ…", "working");
  const brain = await askBrain(text);
  thinking.classList.remove("working");
  if (brain && brain.reply) {
    thinking.innerHTML =
      '<span class="tag">AI Worker</span>\n' + escapeHtml(brain.reply);
    if (brain.intent === "wipe" || brain.intent === "upload" || brain.intent === "wipe_upload") {
      openTools();
      addMsg("system", "File काम: ऊपर repo → ⚙ Tools → Map/ZIP → बटन।");
    }
  } else {
    thinking.innerHTML =
      '<span class="tag">AI Worker</span>\n' +
      escapeHtml(
        "मैं GitHub पर फाइलें delete/upload कर सकता हूँ, और सवाल भी।\n" +
          "• Delete / Upload लिखो\n" +
          "• या ⚙ Tools खोलो\n" +
          "• Render पर GROQ_API_KEY हो तो सामान्य सवालों के जवाब भी मिलेंगे।"
      );
  }
}

$("#toolsBtn").onclick = () => {
  if ($("#actionPanel").classList.contains("hidden")) openTools();
  else closeTools();
};
$("#btnClosePanel").onclick = closeTools;
$("#btnWipe").onclick = () => doWipe();
$("#btnUpload").onclick = () => doUpload(false);
$("#btnWipeUpload").onclick = () => doUpload(true);

$("#sendBtn").onclick = handleSend;
$("#msgInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
$("#msgInput").addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

async function enterMain(data) {
  state.login = data.login || "";
  state.repos = data.repos || [];
  $("#userLabel").textContent = state.login || "connected";
  fillRepos(state.repos);
  $("#setup").classList.add("hidden");
  $("#main").classList.remove("hidden");
  addMsg(
    "bot",
    "नमस्ते" + (state.login ? " " + state.login : "") + "। मैं AI Worker हूँ।\n" +
      "• ऊपर से repo चुनो\n" +
      "• Delete / Upload लिखो या ⚙ Tools खोलो\n" +
      "• Map + ZIP लगाकर Upload\n" +
      "• सामान्य सवाल भी (GROQ_API_KEY हो तो)"
  );
}

$("#verifyBtn").onclick = async () => {
  const t = $("#tokenInput").value.trim();
  $("#setupErr").textContent = "";
  if (!t) {
    $("#setupErr").textContent = "Token डालो, फिर Connect दबाओ";
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
    $("#setupErr").textContent = e.message || "Fail";
  } finally {
    $("#verifyBtn").disabled = false;
    $("#verifyBtn").textContent = "Connect";
  }
};

(function () {
  const saved = localStorage.getItem(TOKEN_KEY);
  if (saved) {
    $("#tokenInput").value = saved;
    $("#setupErr").textContent = "पुराना token भरा है — Connect दबाओ";
  }
  $("#tokenInput").focus();
})();
