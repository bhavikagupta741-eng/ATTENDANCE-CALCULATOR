// ---------------------------------------------------------------
// Attendix front end
// Talks to whichever backend is running (Express on :5000 by
// default, or FastAPI on :8000 — change API_BASE below).
// If no backend is reachable, falls back to localStorage so the
// app still works standalone.
// ---------------------------------------------------------------

const API_BASE = "https://attendance-calculator-1-zfco.onrender.com"; // switch to "http://localhost:8000/api" for FastAPI
const LOCAL_KEY = "attendix_subjects_v2";

let subjects = [];
let backendAvailable = false;
let currentDetailId = null;

const $ = (sel) => document.querySelector(sel);
const screens = { home: $("#screen-home"), form: $("#screen-form"), detail: $("#screen-detail") };

function showScreen(name){
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ---------------- math ----------------

function computeStats(attended, total, target){
  attended = Number(attended) || 0;
  total = Number(total) || 0;
  const t = (Number(target) || 75) / 100;
  const pct = total > 0 ? (attended / total) * 100 : 0;
  let note;
  if (total === 0){
    note = "no classes logged yet";
  } else if (pct >= (target || 75)){
    const bunkable = Math.floor(attended / t - total);
    note = bunkable > 0 ? `can skip next ${bunkable} class${bunkable === 1 ? "" : "es"}` : "right on the line";
  } else {
    const needed = Math.ceil((t * total - attended) / t);
    note = `attend next ${needed} class${needed === 1 ? "" : "es"} straight`;
  }
  return { pct, note, safe: pct >= (target || 75) };
}

function escapeHtml(str){
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- date ----------------

function renderDate(){
  const d = new Date();
  const opts = { weekday: "short", month: "short", day: "numeric" };
  $("#dateTag").textContent = d.toLocaleDateString("en-US", opts).toUpperCase();
}

// ---------------- persistence ----------------

async function loadSubjects(){
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    if (!res.ok) throw new Error("bad response");
    subjects = await res.json();
    setBackendStatus(true);
  } catch (err) {
    setBackendStatus(false);
    subjects = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  }
  renderHome();
}

function setBackendStatus(ok){
  backendAvailable = ok;
  const note = $("#syncNote");
  note.textContent = ok ? "backend connected — syncing live" : "backend offline — saving to this browser only";
  note.classList.toggle("ok", ok);
  note.classList.toggle("down", !ok);
}

function saveLocal(){ localStorage.setItem(LOCAL_KEY, JSON.stringify(subjects)); }

async function addSubject(name, target){
  if (backendAvailable){
    try {
      const res = await fetch(`${API_BASE}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, target, total: 0, attended: 0 }),
      });
      const created = await res.json();
      subjects.push(created);
      renderHome();
      return;
    } catch (err) { setBackendStatus(false); }
  }
  subjects.push({ id: crypto.randomUUID(), name, target, total: 0, attended: 0 });
  saveLocal();
  renderHome();
}

async function updateTally(id, present){
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  const total = Number(s.total) + 1;
  const attended = Number(s.attended) + (present ? 1 : 0);

  if (backendAvailable){
    try {
      const res = await fetch(`${API_BASE}/subjects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total, attended }),
      });
      const updated = await res.json();
      Object.assign(s, updated);
      renderDetail();
      return;
    } catch (err) { setBackendStatus(false); }
  }
  s.total = total;
  s.attended = attended;
  saveLocal();
  renderDetail();
}

async function removeSubject(id){
  if (backendAvailable){
    try { await fetch(`${API_BASE}/subjects/${id}`, { method: "DELETE" }); }
    catch (err) { setBackendStatus(false); }
  }
  subjects = subjects.filter(s => s.id !== id);
  saveLocal();
  showScreen("home");
  renderHome();
}

// ---------------- home ----------------

function renderHome(){
  const list = $("#subjectList");
  list.innerHTML = "";
  list.classList.toggle("is-empty", subjects.length === 0);
  $("#emptyState").style.display = subjects.length === 0 ? "block" : "none";

  subjects.forEach(s => {
    const { pct, safe } = computeStats(s.attended, s.total, s.target);
    const li = document.createElement("li");
    li.className = "subject-card";
    li.innerHTML = `
      <div class="subject-card-top">
        <span class="subject-card-name">${escapeHtml(s.name)}</span>
        <span class="subject-card-pct ${safe ? "safe" : "risk"}">${pct.toFixed(0)}%</span>
      </div>
      <div class="track">
        <div class="track-fill" style="width:${Math.min(100, pct)}%; background:${safe ? "var(--safe)" : "var(--danger)"};"></div>
        <div class="track-target" style="left:${s.target}%;"></div>
      </div>
      <div class="subject-card-meta">
        <span>${s.attended}/${s.total} held</span>
        <span>target ${s.target}%</span>
      </div>
    `;
    li.addEventListener("click", () => openDetail(s.id));
    list.appendChild(li);
  });

  const totalHeld = subjects.reduce((a, s) => a + Number(s.total || 0), 0);
  const totalAttended = subjects.reduce((a, s) => a + Number(s.attended || 0), 0);
  const overallEl = $("#overallValue");
  if (totalHeld === 0){
    overallEl.textContent = "—";
    overallEl.classList.remove("safe", "risk");
  } else {
    const pct = (totalAttended / totalHeld) * 100;
    overallEl.textContent = `${pct.toFixed(0)}%`;
    overallEl.classList.toggle("safe", pct >= 75);
    overallEl.classList.toggle("risk", pct < 75);
  }
}

// ---------------- form (new subject) ----------------

const nameInput = $("#subjectName");
const targetSlider = $("#targetSlider");
const targetValue = $("#targetValue");
const saveBtn = $("#saveBtn");
const formError = $("#formError");

function updateSaveState(){
  const ready = nameInput.value.trim().length > 0;
  saveBtn.disabled = !ready;
  saveBtn.classList.toggle("is-ready", ready);
}

targetSlider.addEventListener("input", () => { targetValue.textContent = `${targetSlider.value}%`; });
nameInput.addEventListener("input", updateSaveState);

$("#goAddBtn").addEventListener("click", () => {
  nameInput.value = "";
  targetSlider.value = 75;
  targetValue.textContent = "75%";
  formError.textContent = "";
  $("#formTitle").textContent = "New subject";
  updateSaveState();
  showScreen("form");
  setTimeout(() => nameInput.focus(), 50);
});

$("#backFromForm").addEventListener("click", () => showScreen("home"));

saveBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return;
  addSubject(name, Number(targetSlider.value));
  showScreen("home");
});

// ---------------- detail ----------------

function openDetail(id){
  currentDetailId = id;
  renderDetail();
  showScreen("detail");
}

function renderDetail(){
  const s = subjects.find(x => x.id === currentDetailId);
  if (!s) return;
  const { pct, note, safe } = computeStats(s.attended, s.total, s.target);

  $("#detailName").textContent = s.name;
  $("#detailTarget").textContent = `target ${s.target}%`;
  const pctEl = $("#detailPct");
  pctEl.textContent = `${pct.toFixed(0)}%`;
  pctEl.classList.toggle("safe", safe);
  pctEl.classList.toggle("risk", !safe);
  $("#detailNote").textContent = note;
  $("#statAttended").textContent = s.attended;
  $("#statHeld").textContent = s.total;
}

$("#backFromDetail").addEventListener("click", () => { showScreen("home"); renderHome(); });
$("#markPresent").addEventListener("click", () => updateTally(currentDetailId, true));
$("#markAbsent").addEventListener("click", () => updateTally(currentDetailId, false));
$("#deleteBtn").addEventListener("click", () => removeSubject(currentDetailId));

// ---------------- init ----------------

renderDate();
loadSubjects();
