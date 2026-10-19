const $ = (s) => document.querySelector(s);

const STORAGE_KEY = "ai_worker_token_v1";

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.dataset.old = btn.textContent;
    btn.textContent = label || "…";
  } else if (btn.dataset.old) {
    btn.textContent = btn.dataset.old;
  }
}

function getToken() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveToken(t) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch (_) {}
}

function clearToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

function showStatus(el, msg, isError) {
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status " + (isError ? "error" : "success");
}

async function apiJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ---------- Boot ---------- */
const token = getToken();
if (token) {
  $("#stepToken").classList.add("hidden");
  $("#stepDash").classList.remove("hidden");
  // soft re-verify
  apiJSON("/api/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  })
    .then((d) => {
      $("#userBadge").classList.remove("hidden");
      $("#userBadge").innerHTML = `<img src="${d.avatar}" alt=""> @${d.login}`;
      renderRepos(d.repos || []);
    })
    .catch(() => {
      clearToken();
      location.reload();
    });
}

function renderRepos(repos) {
  const box = $("#repoList");
  box.innerHTML = "";
  repos.slice(0, 12).forEach((r) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "repo-chip";
    chip.textContent = r.full_name;
    chip.onclick = () => {
      $("#repoInput").value = r.full_name;
    };
    box.appendChild(chip);
  });
}

/* ---------- Verify ---------- */
$("#verifyBtn").onclick = async () => {
  const t = $("#tokenInput").value.trim();
  const status = $("#tokenStatus");
  if (!t) {
    showStatus(status, "Token डालो", true);
    return;
  }
  setBusy($("#verifyBtn"), true, "Checking…");
  try {
    const d = await apiJSON("/api/verify", {
      method: "POST",
      body: JSON.stringify({ token: t }),
    });
    saveToken(t);
    showStatus(status, `Connected as @${d.login}`, false);
    $("#userBadge").classList.remove("hidden");
    $("#userBadge").innerHTML = `<img src="${d.avatar}" alt=""> @${d.login}`;
    renderRepos(d.repos || []);
    setTimeout(() => {
      $("#stepToken").classList.add("hidden");
      $("#stepDash").classList.remove("hidden");
    }, 400);
  } catch (e) {
    showStatus(status, e.message, true);
  } finally {
    setBusy($("#verifyBtn"), false);
  }
};

/* ---------- Wipe ---------- */
$("#wipeBtn").onclick = async () => {
  const token = getToken();
  const repo = $("#repoInput").value.trim();
  const status = $("#wipeStatus");
  if (!repo) {
    showStatus(status, "Repo लिखो (owner/repo)", true);
    return;
  }
  if (!confirm(`सारी फाइलें delete होंगी:\n${repo}\n\nपक्का?`)) return;

  setBusy($("#wipeBtn"), true, "Wiping…");
  showStatus(status, "GitHub API से wipe हो रहा है…", false);
  try {
    const d = await apiJSON("/api/wipe", {
      method: "POST",
      body: JSON.stringify({ token, repo }),
    });
    showStatus(status, d.message, false);
    toast("Wipe done ✅");
  } catch (e) {
    showStatus(status, e.message, true);
  } finally {
    setBusy($("#wipeBtn"), false);
  }
};

/* ---------- Upload helpers ---------- */
function buildFormData(extra = {}) {
  const fd = new FormData();
  fd.append("token", getToken());
  fd.append("repo", $("#repoInput").value.trim());
  fd.append("map", $("#mapInput").value.trim() || "{}");
  fd.append("message", $("#commitMsg").value.trim());
  const file = $("#zipFile").files[0];
  if (file) fd.append("file", file);
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  return fd;
}

async function postForm(url, fd) {
  const res = await fetch(url, { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

$("#uploadOnlyBtn").onclick = async () => {
  const status = $("#uploadStatus");
  if (!$("#repoInput").value.trim()) {
    showStatus(status, "Repo लिखो", true);
    return;
  }
  if (!$("#zipFile").files[0]) {
    showStatus(status, "ZIP चुनो", true);
    return;
  }
  setBusy($("#uploadOnlyBtn"), true, "Uploading…");
  setBusy($("#wipeUploadBtn"), true);
  showStatus(status, "ZIP पढ़ा जा रहा है + GitHub पर push…", false);
  try {
    const d = await postForm("/api/upload", buildFormData());
    showStatus(status, d.message, false);
    toast("Upload done ✅");
  } catch (e) {
    showStatus(status, e.message, true);
  } finally {
    setBusy($("#uploadOnlyBtn"), false);
    setBusy($("#wipeUploadBtn"), false);
  }
};

$("#wipeUploadBtn").onclick = async () => {
  const status = $("#uploadStatus");
  if (!$("#repoInput").value.trim()) {
    showStatus(status, "Repo लिखो", true);
    return;
  }
  if (!$("#zipFile").files[0]) {
    showStatus(status, "ZIP चुनो", true);
    return;
  }
  if (!confirm("पहले सारी पुरानी फाइलें delete, फिर नई ZIP upload होगी। पक्का?")) return;

  setBusy($("#wipeUploadBtn"), true, "Wipe + Upload…");
  setBusy($("#uploadOnlyBtn"), true);
  showStatus(status, "1) Wipe… 2) ZIP extract + push…", false);
  try {
    const d = await postForm("/api/wipe-and-upload", buildFormData());
    showStatus(status, d.message, false);
    toast("Wipe + Upload done ✅");
  } catch (e) {
    showStatus(status, e.message, true);
  } finally {
    setBusy($("#wipeUploadBtn"), false);
    setBusy($("#uploadOnlyBtn"), false);
  }
};

$("#logoutBtn").onclick = () => {
  clearToken();
  location.reload();
};
