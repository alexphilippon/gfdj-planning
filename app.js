import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot,
  serverTimestamp, writeBatch, query, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { SEED_CMS, SEED_LABELS, SEED_RACES, SEED_BIRTHDAYS, TIER_NAMES } from "./seed.js";

/* ---------- Firebase ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDt80UK91_KpvvGdIsBaAfLyOXRlctWWek",
  authDomain: "groupama-fdj-united.firebaseapp.com",
  projectId: "groupama-fdj-united",
  storageBucket: "groupama-fdj-united.firebasestorage.app",
  messagingSenderId: "453165469514",
  appId: "1:453165469514:web:6bbc2e72757f9cce28fbb3",
};
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const storage = getStorage(fb);

/* ---------- Constantes ---------- */
const RANGE_START = "2026-10-01";
const RANGE_END = "2027-12-31";
const WINDOW = 10; // jours de tolérance autour d'une date / avant une course
const NETWORKS = [["x", "X"], ["fb", "FB"], ["ig", "IG"], ["tt", "TikTok"], ["yt", "YT"], ["li", "LinkedIn"]];
const PIGE_TYPES = [["astreinte", "Astreinte", "A"], ["classique", "Classique", "C"], ["premium", "Premium", "P"], ["expert", "Expert", "E"]];
const TEAMS = [["WT", "WorldTeam", "WT"], ["Conti", "Conti", "Conti"], ["Juniors", "Juniors", "U19"]];
const STATUS = { idee: "Idée", indexee: "Indexée", planifiee: "Planifiée", publiee: "Publiée", abandonnee: "Abandonnée" };
const isTouch = matchMedia("(pointer: coarse)").matches;

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const todayIso = () => iso(new Date());
const clampDate = (s) => (s < RANGE_START ? RANGE_START : s > RANGE_END ? RANGE_END : s);
const inRange = (s) => s >= RANGE_START && s <= RANGE_END;
const fmtShort = (s) => { const d = parse(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const fmtLong = (s) => parse(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtMonth = (s) => parse(s).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const startOfWeek = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));
const monthStart = (s) => s.slice(0, 8) + "01";
const monthEnd = (s) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
const addMonths = (s, n) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + n); return iso(d); };
const uid = () => Math.random().toString(36).slice(2, 9);
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "show" + (err ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = ""), err ? 5000 : 2400);
}
async function safe(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(e.code === "permission-denied" ? "Action non autorisée pour ce compte." : "Erreur : " + (e.message || e), true); }
}

/* ---------- État ---------- */
const S = {
  user: null, denied: false, ready: false, isAdmin: false,
  access: {}, lists: { cms: [], labels: [] },
  cards: [], entries: [], piges: [], races: [], birthdays: [],
  view: "planning", planView: "month", cursor: clampDate(todayIso()),
  panelTab: "suggest", expanded: new Set(),
  filters: { q: "", label: "", status: "actives", sort: "rating" },
  openDay: null,
};
let unsubs = [];

/* ---------- Liens & embeds ---------- */
function parseLink(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url.trim()); } catch { return { platform: "web", label: "Lien" }; }
  const h = u.hostname.replace(/^(www\.|m\.)/, "");
  let m;
  if (h === "youtu.be" || h.endsWith("youtube.com")) {
    const id = h === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") || (u.pathname.match(/\/(shorts|embed|live)\/([\w-]+)/) || [])[2];
    return { platform: "youtube", label: "YouTube", embed: id && `https://www.youtube.com/embed/${id}`, thumb: id && `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, vertical: u.pathname.includes("/shorts/") };
  }
  if (h.endsWith("tiktok.com")) {
    m = u.pathname.match(/\/video\/(\d+)/);
    return { platform: "tiktok", label: "TikTok", embed: m && `https://www.tiktok.com/embed/v2/${m[1]}`, vertical: true };
  }
  if (h.endsWith("instagram.com")) {
    m = u.pathname.match(/\/(p|reel|reels|tv)\/([\w-]+)/);
    const kind = m && (m[1] === "reels" ? "reel" : m[1]);
    return { platform: "instagram", label: "Instagram", embed: m && `https://www.instagram.com/${kind}/${m[2]}/embed/captioned/`, vertical: true };
  }
  if (h === "x.com" || h.endsWith("twitter.com")) {
    m = u.pathname.match(/\/status\/(\d+)/);
    return { platform: "x", label: "X", embed: m && `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&lang=fr`, vertical: true };
  }
  if (h.endsWith("facebook.com") || h === "fb.watch") {
    const video = /\/(videos|reel|watch)/.test(u.pathname) || h === "fb.watch";
    return { platform: "facebook", label: "Facebook", embed: `https://www.facebook.com/plugins/${video ? "video" : "post"}.php?href=${encodeURIComponent(url.trim())}&show_text=true&width=500`, vertical: true };
  }
  if (h.endsWith("linkedin.com")) {
    m = url.match(/(activity|share|ugcPost)[:-](\d{15,})/);
    return { platform: "linkedin", label: "LinkedIn", embed: m && `https://www.linkedin.com/embed/feed/update/urn:li:${m[1]}:${m[2]}`, vertical: true };
  }
  return { platform: "web", label: h };
}
function embedHtml(link) {
  const p = parseLink(link);
  if (!p) return "";
  if (!p.embed) return `<div class="embed-box"><a href="${esc(link)}" target="_blank" rel="noopener">Ouvrir le lien (${esc(p.label)}) ↗</a></div>`;
  return `<div class="embed-box ${p.vertical ? "" : "h"}"><iframe src="${esc(p.embed)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowfullscreen></iframe><a href="${esc(link)}" target="_blank" rel="noopener">Ouvrir sur ${esc(p.label)} ↗</a></div>`;
}

/* ---------- Données dérivées ---------- */
const cardById = (id) => S.cards.find((c) => c.id === id);
const cardEntries = (id) => S.entries.filter((e) => e.cardId === id);
const labelById = (id) => S.lists.labels.find((l) => l.id === id);
const raceById = (id) => S.races.find((r) => r.id === id);
const cmName = (id) => { const c = S.lists.cms.find((x) => x.id === id); return c ? (c.name ? `${c.id} – ${c.name}` : c.id) : id; };

function cardStatus(c) {
  if (c.statusManual === "abandonnee") return "abandonnee";
  if (c.statusManual === "publiee") return "publiee";
  const es = cardEntries(c.id);
  const pub = es.filter((e) => e.published).length;
  if (c.series ? c.seriesTarget && pub >= c.seriesTarget : pub > 0) return "publiee";
  if (es.length) return "planifiee";
  if ((c.labels || []).length && c.periodType) return "indexee";
  return "idee";
}
function deadlineLevel(c) {
  if (!c.deadline) return -1;
  const st = cardStatus(c);
  if (st === "publiee" || st === "abandonnee") return -1;
  const d = diffDays(todayIso(), c.deadline);
  return d <= 2 ? 2 : d <= 7 ? 1 : 0;
}
function deadlineBadge(c) {
  const l = deadlineLevel(c);
  if (l < 0) return "";
  const d = diffDays(todayIso(), c.deadline);
  const txt = d < 0 ? `Limite dépassée (${fmtShort(c.deadline)})` : d === 0 ? "Limite aujourd'hui" : `Limite ${fmtShort(c.deadline)}`;
  return `<span class="dl dl-${l}">${txt}</span>`;
}
function periodText(c) {
  if (c.periodType === "asap") return "Au plus vite";
  if (c.periodType === "date" && c.periodDate) return `Autour du ${fmtShort(c.periodDate)}`;
  if (c.periodType === "race" && c.raceId) { const r = raceById(c.raceId); return r ? `Pour ${r.name} (${fmtShort(r.start)})` : "Course supprimée"; }
  return "";
}
const starsHtml = (n) => `<span class="stars" aria-label="${n || 0} sur 5">${"★".repeat(n || 0)}<span class="off">${"★".repeat(5 - (n || 0))}</span></span>`;

function racesOn(date) {
  return S.races.filter((r) => r.start <= date && date <= r.end).map((r) => ({ r, stage: (r.stages || []).find((s) => s.date === date) }));
}
function entriesByDate(from, to) {
  const map = {};
  for (const e of S.entries) if (e.date >= from && e.date <= to) (map[e.date] ||= []).push(e);
  // anniversaires virtuels
  const materialized = new Set(S.entries.map((e) => e.birthdayKey).filter(Boolean));
  let d = from;
  while (d <= to) {
    const dm = `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    for (const b of S.birthdays) {
      if (b.day === dm && !materialized.has(`${b.id}_${d.slice(0, 4)}`)) {
        (map[d] ||= []).push({ virtual: true, id: `bday:${b.id}:${d}`, bday: b, date: d, title: `🎂 ${b.name}`, networks: [] });
      }
    }
    d = addDays(d, 1);
  }
  for (const k in map) map[k].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  return map;
}
const entryTitle = (e) => { const c = e.cardId && cardById(e.cardId); return c ? c.title : e.title || "Sans titre"; };

function visibleRange() {
  if (S.planView === "week") { const s = startOfWeek(S.cursor); return [s, addDays(s, 6)]; }
  return [monthStart(S.cursor), monthEnd(S.cursor)];
}
function suggestions() {
  const [from, to] = visibleRange();
  const out = [];
  for (const c of S.cards) {
    const st = cardStatus(c);
    if (st === "publiee" || st === "abandonnee") continue;
    if (!c.series && cardEntries(c.id).length) continue;
    let why = "";
    if (c.periodType === "asap") why = "Au plus vite";
    else if (c.periodType === "date" && c.periodDate && c.periodDate >= addDays(from, -WINDOW) && c.periodDate <= addDays(to, WINDOW)) why = `Autour du ${fmtShort(c.periodDate)}`;
    else if (c.periodType === "race" && c.raceId) {
      const r = raceById(c.raceId);
      if (r && r.end >= from && r.start <= addDays(to, WINDOW)) why = `Pour ${r.name} (${fmtShort(r.start)})`;
    }
    if (!why && c.deadline && c.deadline <= addDays(to, WINDOW) && deadlineLevel(c) >= 0) why = "Échéance proche";
    if (why) out.push({ c, why });
  }
  return out.sort((a, b) => deadlineLevel(b.c) - deadlineLevel(a.c) || (b.c.rating || 0) - (a.c.rating || 0) || a.c.title.localeCompare(b.c.title));
}

/* ---------- Auth & données ---------- */
onAuthStateChanged(auth, async (user) => {
  unsubs.forEach((u) => u()); unsubs = [];
  Object.assign(S, { user, denied: false, ready: false });
  if (!user) return renderGate();
  $("#app").innerHTML = `<div class="boot">Chargement…</div>`;
  try {
    const snap = await getDoc(doc(db, "config", "access"));
    if (!snap.exists()) {
      await setDoc(doc(db, "config", "access"), { adminEmail: user.email, allowedEmails: [] });
      toast("Compte admin initialisé");
    }
    const acc = (await getDoc(doc(db, "config", "access"))).data();
    if (acc.adminEmail === user.email && !(await getDoc(doc(db, "config", "lists"))).exists()) await seedAll();
    startListeners();
  } catch (e) {
    console.error(e);
    S.denied = true;
    renderGate();
  }
});

async function seedAll() {
  const b = writeBatch(db);
  b.set(doc(db, "config", "lists"), { cms: SEED_CMS, labels: SEED_LABELS });
  SEED_RACES.forEach((r) => b.set(doc(collection(db, "races")), r));
  SEED_BIRTHDAYS.forEach((x) => b.set(doc(collection(db, "birthdays")), x));
  await b.commit();
  toast("Données initiales importées");
}

function startListeners() {
  const pending = new Set(["access", "lists", "cards", "entries", "piges", "races", "birthdays"]);
  const done = (k) => {
    pending.delete(k);
    if (!pending.size && !S.ready) { S.ready = true; mountShell(); }
    else if (S.ready) refresh(k);
  };
  const fail = (e) => { console.error(e); if (e.code === "permission-denied") { S.denied = true; renderGate(); } };
  unsubs.push(onSnapshot(doc(db, "config", "access"), (s) => {
    const wasAdmin = S.isAdmin;
    S.access = s.data() || {};
    S.isAdmin = S.access.adminEmail === S.user.email;
    if (S.ready && wasAdmin !== S.isAdmin) mountShell();
    done("access");
  }, fail));
  unsubs.push(onSnapshot(doc(db, "config", "lists"), (s) => { S.lists = { cms: [], labels: [], ...(s.data() || {}) }; done("lists"); }, fail));
  const col = (name, key, sorter) => unsubs.push(onSnapshot(collection(db, name), (qs) => {
    S[key] = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (sorter) S[key].sort(sorter);
    done(key);
  }, fail));
  col("cards", "cards");
  col("entries", "entries");
  col("piges", "piges");
  col("races", "races", (a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  col("birthdays", "birthdays", (a, b) => a.day.slice(3).localeCompare(b.day.slice(3)) || a.day.localeCompare(b.day));
}

let rafId, changed = new Set();
function refresh(what) {
  changed.add(what);
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const c = changed; changed = new Set();
    renderBody();
    if (S.openDay && (c.has("piges") || c.has("entries") || c.has("lists") || c.has("cards"))) refreshDayModal();
  });
}

/* ---------- Écrans ---------- */
function renderGate() {
  if (S.denied) {
    $("#app").innerHTML = `<div class="gate"><div class="gate-box">
      <h1>Accès non autorisé<span>Planning GFDJ</span></h1>
      <p>Le compte <b>${esc(S.user?.email)}</b> n'est pas dans la liste d'accès. Demande à l'admin de l'ajouter, puis recharge la page.</p>
      <button class="btn" data-act="logout">Changer de compte</button></div></div>`;
    return;
  }
  $("#app").innerHTML = `<div class="gate"><div class="gate-box">
    <h1>Planning des publications<span>Groupama-FDJ United</span></h1>
    <p>Le desk des idées de contenus et le planning de publication de l'équipe. Connecte-toi avec ton compte Google pour y accéder.</p>
    <button class="btn primary" data-act="login">Se connecter avec Google</button></div></div>`;
}

function mountShell() {
  if (S.view === "admin" && !S.isAdmin) S.view = "planning";
  const u = S.user;
  $("#app").innerHTML = `
    <header class="top">
      <div class="brand"><b>Planning</b><span>Groupama-FDJ United</span></div>
      <nav>
        <button data-act="view" data-v="desk" class="${S.view === "desk" ? "on" : ""}">Desk</button>
        <button data-act="view" data-v="planning" class="${S.view === "planning" ? "on" : ""}">Planning</button>
        ${S.isAdmin ? `<button data-act="view" data-v="admin" class="${S.view === "admin" ? "on" : ""}">Admin</button>` : ""}
      </nav>
      <div class="top-actions">
        <button class="btn primary" data-act="new-card">Nouvelle idée</button>
        <button class="avatar" data-act="logout" title="Se déconnecter (${esc(u.email)})">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="">` : esc((u.displayName || u.email)[0].toUpperCase())}</button>
      </div>
    </header>
    <main id="main"></main>`;
  mountView();
}

function mountView() {
  const main = $("#main");
  if (S.view === "desk") {
    const f = S.filters;
    main.innerHTML = `
      <div class="toolbar">
        <input type="search" id="f-q" placeholder="Rechercher une idée" value="${esc(f.q)}">
        <select id="f-label"><option value="">Tous les libellés</option>${labelOptions(f.label)}</select>
        <select id="f-status">
          ${[["actives", "Idées actives"], ["all", "Toutes"], ...Object.entries(STATUS)].map(([v, l]) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
        <select id="f-sort">
          ${[["rating", "Tri : note"], ["recent", "Tri : plus récentes"], ["deadline", "Tri : échéance"]].map(([v, l]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
        <span class="count" id="desk-count"></span>
      </div>
      <div class="desk-grid" id="desk-grid"></div>`;
    $("#f-q").addEventListener("input", (e) => { f.q = e.target.value; renderBody(); });
    ["label", "status", "sort"].forEach((k) => $("#f-" + k).addEventListener("change", (e) => { f[k] = e.target.value; renderBody(); }));
  } else if (S.view === "planning") {
    main.innerHTML = `
      <div class="toolbar">
        <div class="seg">${[["year", "Année"], ["month", "Mois"], ["week", "Semaine"]].map(([v, l]) => `<button data-act="pv" data-v="${v}" class="${S.planView === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <button class="icon-btn" data-act="nav" data-d="-1" aria-label="Précédent">‹</button>
        <button class="icon-btn" data-act="nav" data-d="1" aria-label="Suivant">›</button>
        <button class="btn small" data-act="today">Aujourd'hui</button>
        <h2 id="plan-title"></h2>
        <span style="margin-left:auto"></span>
        <button class="icon-btn" data-act="pige-recap" title="Récap annuel des piges" aria-label="Récap annuel des piges">i</button>
      </div>
      <div class="plan-layout">
        <section id="plan-body"></section>
        <aside id="panel" data-drop="panel"><div class="panel-inner">
          <div class="panel-tabs">
            <button data-act="ptab" data-t="suggest" class="${S.panelTab === "suggest" ? "on" : ""}">Suggestions</button>
            <button data-act="ptab" data-t="all" class="${S.panelTab === "all" ? "on" : ""}">Toutes les idées</button>
          </div>
          <p class="panel-hint">${isTouch ? "Ouvre une idée pour la planifier à une date." : "Glisse une idée sur un jour pour la planifier. Dépose ici une publication pour la renvoyer au desk."}</p>
          <div id="panel-list"></div>
        </div></aside>
      </div>`;
  } else {
    main.innerHTML = `<div class="admin" id="admin-body"></div>`;
  }
  renderBody();
}

function renderBody() {
  if (!S.ready) return;
  if (S.view === "desk") renderDesk();
  else if (S.view === "planning") { renderPlan(); renderPanel(); }
  else if (S.view === "admin") renderAdmin();
}

function labelOptions(selected) {
  return Object.entries(TIER_NAMES).map(([t, name]) => {
    const ls = S.lists.labels.filter((l) => String(l.tier) === t);
    return ls.length ? `<optgroup label="${esc(name)}">${ls.map((l) => `<option value="${esc(l.id)}" ${selected === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</optgroup>` : "";
  }).join("");
}

/* ---------- Desk ---------- */
function cardMedia(c) {
  const p = parseLink(c.link);
  const badge = p ? `<span class="plat">${esc(p.label)}</span>` : "";
  if (c.imageUrl) return `<img src="${esc(c.imageUrl)}" alt="" loading="lazy">${badge}`;
  if (p?.thumb) return `<img src="${esc(p.thumb)}" alt="" loading="lazy">${badge}`;
  if (p) return `<div class="ph ph-platform"><span>${esc(p.label)}</span></div>`;
  return `<div class="ph ph-text"><p>${esc(c.text || c.title)}</p></div>`;
}
function cardHtml(c) {
  const st = cardStatus(c);
  const lvl = deadlineLevel(c);
  const labels = (c.labels || []).map(labelById).filter(Boolean);
  const pub = cardEntries(c.id).filter((e) => e.published).length;
  return `<article class="card lvl-${lvl} ${st === "abandonnee" || st === "publiee" ? "dim" : ""}" data-act="open-card" data-id="${c.id}" ${isTouch ? "" : `draggable="true" data-drag="card:${c.id}"`}>
    <div class="card-media">${cardMedia(c)}</div>
    <div class="card-body">
      <div class="card-top"><span class="status s-${st}">${STATUS[st]}</span>${deadlineBadge(c)}</div>
      <h3>${esc(c.title)}</h3>
      ${starsHtml(c.rating)}
      ${periodText(c) ? `<p class="period">${esc(periodText(c))}</p>` : ""}
      ${labels.length ? `<div class="chips">${labels.slice(0, 3).map((l) => `<span class="chip">${esc(l.name)}</span>`).join("")}${labels.length > 3 ? `<span class="chip">+${labels.length - 3}</span>` : ""}</div>` : ""}
      ${c.series ? `<p class="series">Série : ${pub}${c.seriesTarget ? "/" + c.seriesTarget : ""} publiée${pub > 1 ? "s" : ""}</p>` : ""}
    </div></article>`;
}
function renderDesk() {
  const f = S.filters;
  const q = f.q.trim().toLowerCase();
  let list = S.cards.filter((c) => {
    const st = cardStatus(c);
    if (f.status === "actives" && (st === "publiee" || st === "abandonnee")) return false;
    if (f.status !== "actives" && f.status !== "all" && st !== f.status) return false;
    if (f.label && !(c.labels || []).includes(f.label)) return false;
    if (q && !`${c.title} ${c.text || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const ts = (c) => c.createdAt?.seconds || 9e9;
  if (f.sort === "rating") list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || ts(b) - ts(a));
  if (f.sort === "recent") list.sort((a, b) => ts(b) - ts(a));
  if (f.sort === "deadline") list.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  $("#desk-count").textContent = `${list.length} idée${list.length > 1 ? "s" : ""}`;
  $("#desk-grid").innerHTML = list.length
    ? list.map(cardHtml).join("")
    : `<div class="empty" style="grid-column:1/-1"><h2>${S.cards.length ? "Aucune idée ne correspond" : "Le desk est vide"}</h2><p>${S.cards.length ? "Modifie les filtres ou la recherche." : "Ajoute un lien, une image ou quelques mots pour garder une idée de contenu."}</p><button class="btn primary" data-act="new-card">Ajouter une idée</button></div>`;
}

/* ---------- Planning ---------- */
function dayCell(date, { mode, out, map }) {
  const off = !inRange(date);
  const races = racesOn(date);
  const piges = S.piges.filter((p) => p.date === date);
  const entries = map[date] || [];
  const d = parse(date);
  const cls = ["day", out ? "out" : "", off ? "off" : "", date === todayIso() ? "today" : ""].join(" ");
  return `<div class="${cls}" ${off ? "" : `data-drop="day" data-date="${date}"`}>
    <div class="day-head"><span class="dnum">${d.getDate()}</span><span class="dname">${mode === "week" || isTouch ? d.toLocaleDateString("fr-FR", { weekday: mode === "week" ? "short" : "long" }) : ""}</span>
      ${off ? "" : `<button class="day-add" data-act="open-day" data-date="${date}" title="Piges et publications du jour" aria-label="Ouvrir le ${fmtLong(date)}">+</button>`}</div>
    ${races.map(({ r, stage }) => {
      const t = (r.teams && r.teams[0]) || "WT";
      const short = (r.teams || []).map((x) => (TEAMS.find((y) => y[0] === x) || [])[2] || x).join("/");
      return `<div class="ribbon t-${esc(t)}" title="${esc(r.name)}${stage ? " – " + esc(stage.label) : ""}"><b>${esc(short)}</b>${esc(r.name)}${stage ? " " + esc(stage.label) : ""}</div>`;
    }).join("")}
    ${piges.length ? `<div class="piges">${piges.map((p) => {
      const t = PIGE_TYPES.find((x) => x[0] === p.type) || PIGE_TYPES[1];
      return `<button class="pige ${p.cm ? "" : "todo"}" data-act="open-day" data-date="${date}" title="${esc(t[1])}${p.cm ? " – " + esc(cmName(p.cm)) : " – à attribuer"}"><b>${t[2]}</b>${p.cm ? esc(p.cm) : "à attr."}${p.type === "astreinte" && p.hours ? " " + String(p.hours).replace(".", ",") + "h" : ""}</button>`;
    }).join("")}</div>` : ""}
    ${entries.map((e) => entryPill(e, mode)).join("")}
  </div>`;
}
function entryPill(e, mode) {
  const nets = (e.networks || []).map((n) => (NETWORKS.find((x) => x[0] === n) || [])[1]).filter(Boolean).join(" ");
  const cls = ["entry", e.virtual ? "bday" : "", e.published ? "pub" : "", !e.cardId && !e.virtual ? "solo" : ""].join(" ");
  const drag = !isTouch && !e.virtual ? `draggable="true" data-drag="entry:${e.id}"` : "";
  return `<div class="${cls}" data-act="open-entry" data-id="${esc(e.id)}" ${drag} title="${esc(entryTitle(e))}">
    ${e.time ? `<span class="t">${esc(e.time)}</span>` : ""}<span class="et">${esc(entryTitle(e))}</span>${nets ? `<span class="nets">${nets}</span>` : ""}
    ${mode === "week" && e.wording ? `<span class="wd">${esc(e.wording)}</span>` : ""}</div>`;
}
function renderPlan() {
  const body = $("#plan-body");
  const title = $("#plan-title");
  if (S.planView === "year") {
    title.textContent = "Oct. 2026 – déc. 2027";
    const map = entriesByDate(RANGE_START, RANGE_END);
    let html = `<div class="year">`;
    for (let m = RANGE_START; m <= RANGE_END; m = addMonths(m, 1)) {
      const lead = (parse(m).getDay() + 6) % 7;
      html += `<div class="mini"><h3>${fmtMonth(m)}</h3><div class="mini-grid">${"<span></span>".repeat(lead)}`;
      for (let d = m; d <= monthEnd(m); d = addDays(d, 1)) {
        const n = (map[d] || []).filter((e) => !e.virtual).length;
        const races = racesOn(d);
        const c = n === 0 ? "" : n === 1 ? "c1" : n <= 3 ? "c2" : "c3";
        const r = races.length ? "r-" + ((races[0].r.teams || [])[0] || "WT") : "";
        html += `<button class="${c} ${r} ${d === todayIso() ? "today" : ""}" data-act="goto-week" data-date="${d}" title="${fmtLong(d)}${n ? ` – ${n} publication${n > 1 ? "s" : ""}` : ""}${races.length ? " – " + esc(races.map((x) => x.r.name).join(", ")) : ""}">${parse(d).getDate()}</button>`;
      }
      html += `</div></div>`;
    }
    html += `</div><div class="legend"><span><i style="background:#D9E1F8"></i>1 publication</span><span><i style="background:#9FB2EC"></i>2 à 3</span><span><i style="background:var(--blue)"></i>4 et plus</span>
      <span><i style="background:var(--t-wt)"></i>Course WT</span><span><i style="background:var(--t-conti)"></i>Conti</span><span><i style="background:var(--t-juniors)"></i>Juniors</span></div>`;
    body.innerHTML = html;
    return;
  }
  let start, end, first, last;
  if (S.planView === "week") {
    start = startOfWeek(S.cursor); end = addDays(start, 6); first = start; last = end;
    title.textContent = `Semaine du ${fmtShort(start)}`;
  } else {
    first = monthStart(S.cursor); last = monthEnd(S.cursor);
    start = startOfWeek(first); end = addDays(startOfWeek(last), 6);
    title.textContent = fmtMonth(first);
  }
  const map = entriesByDate(start, end);
  let cells = "";
  for (let d = start; d <= end; d = addDays(d, 1)) cells += dayCell(d, { mode: S.planView, out: d < first || d > last, map });
  body.innerHTML = `<div class="weekdays">${["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((x) => `<div>${x}</div>`).join("")}</div><div class="grid ${S.planView}">${cells}</div>`;
}
function renderPanel() {
  const el = $("#panel-list");
  if (!el) return;
  let items;
  if (S.panelTab === "suggest") items = suggestions();
  else items = S.cards.filter((c) => !["publiee", "abandonnee"].includes(cardStatus(c)))
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title))
    .map((c) => ({ c, why: periodText(c) || STATUS[cardStatus(c)] }));
  if (!items.length) {
    el.innerHTML = `<p class="panel-empty">${S.panelTab === "suggest" ? "Aucune idée rattachée à cette période. Les idées « au plus vite », datées ou liées à une course de la période apparaîtront ici." : "Aucune idée active dans le desk."}</p>`;
    return;
  }
  el.innerHTML = items.map(({ c, why }) => {
    const open = S.expanded.has(c.id);
    const p = parseLink(c.link);
    const img = c.imageUrl || p?.thumb;
    const labels = (c.labels || []).map(labelById).filter(Boolean);
    return `<div class="sug lvl-${deadlineLevel(c)}" ${isTouch ? "" : `draggable="true" data-drag="card:${c.id}"`}>
      <button class="sug-head" data-act="sug-toggle" data-id="${c.id}" aria-expanded="${open}"><span class="sug-title">${esc(c.title)}</span>${c.rating ? `<span class="sug-stars">★${c.rating}</span>` : ""}</button>
      <div class="sug-why">${esc(why)}${c.series ? " · série" : ""}${deadlineBadge(c)}</div>
      ${open ? `<div class="sug-detail">${img ? `<img src="${esc(img)}" alt="">` : ""}${c.text ? `<p>${esc(c.text.slice(0, 220))}${c.text.length > 220 ? "…" : ""}</p>` : ""}
        ${labels.length ? `<div class="chips">${labels.map((l) => `<span class="chip">${esc(l.name)}</span>`).join("")}</div>` : ""}
        <button class="btn small" data-act="open-card" data-id="${c.id}">Ouvrir la fiche</button></div>` : ""}
    </div>`;
  }).join("");
}

/* ---------- Glisser-déposer (ordinateur) ---------- */
if (!isTouch) {
  document.addEventListener("dragstart", (e) => {
    const el = e.target.closest?.("[data-drag]");
    if (!el) return;
    e.dataTransfer.setData("text/plain", el.dataset.drag);
    e.dataTransfer.effectAllowed = "move";
    document.body.classList.add("dragging");
  });
  document.addEventListener("dragend", () => { document.body.classList.remove("dragging"); $$(".over").forEach((x) => x.classList.remove("over")); });
  document.addEventListener("dragover", (e) => {
    const t = e.target.closest?.("[data-drop]");
    if (!t) return;
    e.preventDefault();
    $$(".over").forEach((x) => x !== t && x.classList.remove("over"));
    t.classList.add("over");
  });
  document.addEventListener("drop", async (e) => {
    const t = e.target.closest?.("[data-drop]");
    if (!t) return;
    e.preventDefault();
    t.classList.remove("over");
    const [kind, id] = (e.dataTransfer.getData("text/plain") || "").split(":");
    if (t.dataset.drop === "day") {
      const date = t.dataset.date;
      if (kind === "card") await planCard(id, date);
      if (kind === "entry") { const en = S.entries.find((x) => x.id === id); if (en && en.date !== date) await safe(() => updateDoc(doc(db, "entries", id), { date }), `Déplacée au ${fmtShort(date)}`); }
    } else if (t.dataset.drop === "panel" && kind === "entry") {
      await returnToDesk(id);
    }
  });
}
async function planCard(cardId, date) {
  const c = cardById(cardId);
  if (!c) return;
  if (!c.series && cardEntries(cardId).length) {
    if (!confirm("Cette idée est déjà planifiée. La planifier une deuxième fois ?\n(Pour un format récurrent, coche « Série de publications » dans la fiche.)")) return;
  }
  await safe(() => addDoc(collection(db, "entries"), {
    date, time: "", networks: [], wording: "", title: c.title, cardId, published: false,
    createdBy: S.user.email, createdAt: serverTimestamp(),
  }), `« ${c.title} » planifiée le ${fmtShort(date)}`);
}
async function returnToDesk(entryId) {
  const en = S.entries.find((x) => x.id === entryId);
  if (!en) return;
  if (!en.cardId && !confirm("Cette publication n'a pas d'idée d'origine dans le desk. La supprimer ?")) return;
  await safe(() => deleteDoc(doc(db, "entries", entryId)), en.cardId ? "Renvoyée au desk" : "Publication supprimée");
}

/* ---------- Modales ---------- */
let modalCleanup = null;
function openModal(html, { wide = false, onClose } = {}) {
  closeModal();
  $("#modal-root").innerHTML = `<div class="scrim" data-scrim><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  modalCleanup = onClose || null;
  const first = $("#modal-root [autofocus]");
  if (first && !isTouch) first.focus();
  return $("#modal-root .modal");
}
function closeModal() {
  if (modalCleanup) { const f = modalCleanup; modalCleanup = null; f(); }
  S.openDay = null;
  $("#modal-root").innerHTML = "";
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#modal-root").innerHTML) closeModal(); });
document.addEventListener("mousedown", (e) => { if (e.target.matches?.("[data-scrim]")) closeModal(); });

/* Fiche idée */
function openCardModal(id) {
  const c = id ? cardById(id) : null;
  if (id && !c) return toast("Cette idée n'existe plus.", true);
  const d = c ? { ...c } : { title: "", text: "", link: "", rating: 0, labels: [], periodType: "", periodDate: "", raceId: "", deadline: "", series: false, seriesTarget: "" };
  let pendingBlob = null, removeImage = false, commentsUnsub = null;
  const st = c ? cardStatus(c) : "idee";
  const upcomingRaces = S.races.filter((r) => r.end >= todayIso() || r.id === d.raceId);
  const tiers = Object.entries(TIER_NAMES).map(([t, name]) => {
    const ls = S.lists.labels.filter((l) => String(l.tier) === t);
    return ls.length ? `<div class="tier"><h4>${esc(name)}</h4><div class="chk-chips">${ls.map((l) => `<label data-name="${esc(l.name.toLowerCase())}"><input type="checkbox" name="labels" value="${esc(l.id)}" ${(d.labels || []).includes(l.id) ? "checked" : ""}><span>${esc(l.name)}</span></label>`).join("")}</div></div>` : "";
  }).join("");

  const m = openModal(`
    <div class="modal-head"><h2>${c ? "Fiche idée" : "Nouvelle idée"}</h2>${c ? `<span class="status s-${st}">${STATUS[st]}</span>` : ""}<button class="icon-btn" data-act="close-modal" aria-label="Fermer">×</button></div>
    <div class="modal-body"><div class="${c ? "two-col" : ""}">
      <form id="card-form" class="modal-body" style="padding:0" autocomplete="off">
        <label class="field"><span>Titre</span><input class="big" name="title" required value="${esc(d.title)}" placeholder="Ex. Walk & talk pied du bus" ${c ? "" : "autofocus"}></label>
        <label class="field"><span>Lien de référence (Instagram, TikTok, YouTube, X…)</span><input name="link" type="url" value="${esc(d.link)}" placeholder="https://"></label>
        <div class="field"><span class="field-label">Visuel de référence</span>
          <div id="img-zone"></div></div>
        <label class="field"><span>Notes</span><textarea name="text" placeholder="L'idée en quelques mots, le hook, le format…">${esc(d.text)}</textarea></label>
        <div class="field"><span class="field-label">Envie / importance</span>
          <div class="star-input" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${n <= (d.rating || 0) ? "on" : ""}" aria-label="${n} sur 5">★</button>`).join("")}</div></div>
        <div class="field"><span class="field-label">Libellés</span>
          <input type="search" id="lbl-filter" placeholder="Filtrer les libellés" style="border:1px solid var(--line);border-radius:6px;padding:6px 10px">
          <div class="labels-box">${tiers || `<p class="muted">Aucun libellé. L'admin peut en créer dans l'onglet Admin.</p>`}</div></div>
        <div class="field"><span class="field-label">Période de production</span>
          <div class="seg" id="ptype">${[["", "Non définie"], ["asap", "Au plus vite"], ["date", "Date"], ["race", "Course"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(d.periodType || "") === v ? "on" : ""}">${l}</button>`).join("")}</div>
          <input type="date" name="periodDate" value="${esc(d.periodDate)}" min="${RANGE_START}" max="${RANGE_END}" ${d.periodType === "date" ? "" : "hidden"} style="border:1px solid var(--line);border-radius:6px;padding:6px 10px">
          <select name="raceId" ${d.periodType === "race" ? "" : "hidden"} style="border:1px solid var(--line);border-radius:6px;padding:6px 10px">
            <option value="">Choisir une course</option>${upcomingRaces.map((r) => `<option value="${r.id}" ${d.raceId === r.id ? "selected" : ""}>${fmtShort(r.start)} – ${esc(r.name)}</option>`).join("")}
          </select></div>
        <div class="row">
          <label class="field"><span>Date limite (obligation contractuelle)</span><input type="date" name="deadline" value="${esc(d.deadline)}"></label>
          <label class="field" style="flex:0 0 auto"><span>Série de publications</span><span class="row" style="align-items:center;gap:6px"><input type="checkbox" name="series" ${d.series ? "checked" : ""}> <input type="number" name="seriesTarget" min="1" max="99" placeholder="Objectif" value="${esc(d.seriesTarget)}" style="width:90px"></span></label>
        </div>
        ${c ? `<div class="row" style="align-items:end"><label class="field"><span>Planifier cette idée le</span><input type="date" id="plan-date" min="${RANGE_START}" max="${RANGE_END}" value="${esc(clampDate(d.periodDate || todayIso()))}"></label><button type="button" class="btn" data-act="card-plan">Planifier</button></div>` : ""}
      </form>
      ${c ? `<div class="modal-body" style="padding:0">
        <div id="embed-zone">${embedHtml(d.link)}</div>
        <div class="side-section"><h3>Planifications</h3><div class="plan-list" id="card-plans"></div></div>
        <div class="side-section"><h3>Commentaires</h3><div class="comments" id="comments"><p class="muted">Chargement…</p></div>
          <form class="comment-form" id="comment-form"><textarea name="t" placeholder="Ajouter un commentaire" required></textarea><button class="btn small" type="submit">Publier le commentaire</button></form></div>
      </div>` : ""}
    </div></div>
    <div class="modal-foot">
      ${c ? `<button class="btn danger" data-act="card-delete">Supprimer</button>
        ${st === "abandonnee" || c.statusManual ? `<button class="btn" data-act="card-status" data-v="">Réactiver</button>` : `<button class="btn" data-act="card-status" data-v="abandonnee">Abandonner</button><button class="btn" data-act="card-status" data-v="publiee">Marquer publiée</button>`}` : ""}
      <span class="spacer"></span>
      <button class="btn" data-act="close-modal">Annuler</button>
      <button class="btn primary" data-act="card-save">${c ? "Enregistrer" : "Ajouter au desk"}</button>
    </div>`, { wide: !!c, onClose: () => commentsUnsub && commentsUnsub() });

  const form = $("#card-form", m);
  const F = form.elements;
  let rating = d.rating || 0, ptype = d.periodType || "";

  const renderImg = () => {
    const url = pendingBlob ? URL.createObjectURL(pendingBlob) : !removeImage && d.imageUrl ? d.imageUrl : "";
    $("#img-zone", m).innerHTML = url
      ? `<div class="img-prev"><img src="${esc(url)}" alt=""><button type="button" class="btn small" data-act="img-remove">Retirer</button></div>`
      : `<label class="drop"><input type="file" accept="image/*" id="img-file">Clique pour choisir une image, glisse-la ici, ou colle-la (Ctrl+V)</label>`;
    const fi = $("#img-file", m);
    if (fi) fi.addEventListener("change", () => fi.files[0] && setImage(fi.files[0]));
  };
  const setImage = (file) => { if (!file.type.startsWith("image/")) return toast("Ce fichier n'est pas une image.", true); pendingBlob = file; removeImage = false; renderImg(); };
  renderImg();
  m.addEventListener("paste", (e) => { const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/")); if (it) { e.preventDefault(); setImage(it.getAsFile()); } });
  const iz = $("#img-zone", m);
  iz.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
  iz.addEventListener("drop", (e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); e.stopPropagation(); setImage(f); } });

  $("#stars", m).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const n = Number(b.dataset.n); rating = rating === n ? 0 : n;
    $$("#stars button", m).forEach((x) => x.classList.toggle("on", Number(x.dataset.n) <= rating));
  });
  $("#ptype", m).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    ptype = b.dataset.v;
    $$("#ptype button", m).forEach((x) => x.classList.toggle("on", x === b));
    F.periodDate.hidden = ptype !== "date";
    F.raceId.hidden = ptype !== "race";
  });
  $("#lbl-filter", m).addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    $$(".labels-box label", m).forEach((l) => (l.hidden = q && !l.dataset.name.includes(q)));
  });
  if (c) {
    let t;
    F.link.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => ($("#embed-zone", m).innerHTML = embedHtml(F.link.value)), 500); });
    const plans = cardEntries(c.id).sort((a, b) => a.date.localeCompare(b.date));
    $("#card-plans", m).innerHTML = plans.length
      ? plans.map((e) => `<button data-act="open-entry" data-id="${e.id}">${fmtLong(e.date)}${e.time ? " à " + esc(e.time) : ""}${e.published ? " – publiée" : ""}</button>`).join("")
      : `<p class="muted">Pas encore au planning.</p>`;
    commentsUnsub = onSnapshot(query(collection(db, "cards", c.id, "comments"), orderBy("createdAt")), (qs) => {
      const box = $("#comments", m); if (!box) return;
      box.innerHTML = qs.empty ? `<p class="muted">Aucun commentaire.</p>` : qs.docs.map((x) => {
        const v = x.data();
        const when = v.createdAt ? v.createdAt.toDate().toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
        const mine = v.authorEmail === S.user.email || S.isAdmin;
        return `<div class="comment"><small>${esc(v.authorName || v.authorEmail)} – ${when}${mine ? ` <button class="btn ghost small" data-act="comment-del" data-id="${x.id}" data-card="${c.id}">Supprimer</button>` : ""}</small>${esc(v.text).replace(/\n/g, "<br>")}</div>`;
      }).join("");
      box.scrollTop = box.scrollHeight;
    });
    $("#comment-form", m).addEventListener("submit", async (e) => {
      e.preventDefault();
      const ta = e.target.t; const text = ta.value.trim(); if (!text) return;
      ta.value = "";
      await safe(() => addDoc(collection(db, "cards", c.id, "comments"), { text, authorEmail: S.user.email, authorName: S.user.displayName || "", createdAt: serverTimestamp() }));
    });
  }

  m.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "img-remove") { pendingBlob = null; removeImage = true; renderImg(); }
    if (act === "card-save") {
      if (!F.title.value.trim()) { F.title.focus(); return toast("Donne un titre à l'idée.", true); }
      b.disabled = true;
      const ok = await saveCard();
      b.disabled = false;
      if (ok) closeModal();
    }
    if (act === "card-plan") {
      const date = $("#plan-date", m).value;
      if (!date || !inRange(date)) return toast("Choisis une date entre le 01/10/2026 et le 31/12/2027.", true);
      if (await saveCard()) { await planCard(c.id, date); closeModal(); }
    }
    if (act === "card-status") { await safe(() => updateDoc(doc(db, "cards", c.id), { statusManual: b.dataset.v, updatedAt: serverTimestamp() }), b.dataset.v === "abandonnee" ? "Idée abandonnée" : b.dataset.v === "publiee" ? "Idée marquée publiée" : "Idée réactivée"); closeModal(); }
    if (act === "card-delete") {
      const n = cardEntries(c.id).length;
      if (!confirm(`Supprimer définitivement « ${c.title} »${n ? ` et ses ${n} planification${n > 1 ? "s" : ""}` : ""} ?\nPour garder une trace, utilise plutôt « Abandonner ».`)) return;
      await safe(async () => {
        const batch = writeBatch(db);
        cardEntries(c.id).forEach((en) => batch.delete(doc(db, "entries", en.id)));
        batch.delete(doc(db, "cards", c.id));
        await batch.commit();
        if (c.imagePath) await deleteObject(sref(storage, c.imagePath)).catch(() => {});
      }, "Idée supprimée");
      closeModal();
    }
  });

  async function saveCard() {
    const fd = new FormData(form);
    const data = {
      title: fd.get("title").trim(),
      link: (fd.get("link") || "").trim(),
      text: (fd.get("text") || "").trim(),
      rating,
      labels: fd.getAll("labels"),
      periodType: ptype,
      periodDate: ptype === "date" ? fd.get("periodDate") || "" : "",
      raceId: ptype === "race" ? fd.get("raceId") || "" : "",
      deadline: fd.get("deadline") || "",
      series: !!fd.get("series"),
      seriesTarget: fd.get("series") && fd.get("seriesTarget") ? Number(fd.get("seriesTarget")) : "",
      updatedAt: serverTimestamp(),
    };
    if (ptype === "date" && !data.periodDate) ptype && toast("Période « Date » sans date : elle ne sera pas suggérée.", true);
    return !!(await safe(async () => {
      const ref = c ? doc(db, "cards", c.id) : doc(collection(db, "cards"));
      if (pendingBlob) {
        const blob = await resizeImage(pendingBlob);
        const path = `cards/${ref.id}/${Date.now()}.jpg`;
        await uploadBytes(sref(storage, path), blob, { contentType: "image/jpeg" });
        data.imageUrl = await getDownloadURL(sref(storage, path));
        data.imagePath = path;
        if (c?.imagePath) deleteObject(sref(storage, c.imagePath)).catch(() => {});
      } else if (removeImage && c?.imagePath) {
        deleteObject(sref(storage, c.imagePath)).catch(() => {});
        data.imageUrl = ""; data.imagePath = "";
      }
      if (c) await updateDoc(ref, data);
      else await setDoc(ref, { ...data, statusManual: "", createdAt: serverTimestamp(), createdBy: S.user.email });
      return true;
    }, c ? "Idée enregistrée" : "Idée ajoutée au desk"));
  }
}

async function resizeImage(file, max = 1200) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.85));
  } catch { return file; }
}

/* Publication (entrée du planning) */
function openEntryModal(arg) {
  // arg : id d'entrée | "bday:<id>:<date>" | { newDate }
  let e, isNew = false, bday = null;
  if (typeof arg === "string" && arg.startsWith("bday:")) {
    const [, bid, date] = arg.split(":");
    bday = S.birthdays.find((b) => b.id === bid);
    if (!bday) return;
    e = { date, time: "", networks: [], wording: "", title: `🎂 Anniversaire ${bday.name}`, published: false };
    isNew = true;
  } else if (typeof arg === "object") {
    e = { date: arg.newDate, time: "", networks: [], wording: "", title: "", published: false };
    isNew = true;
  } else {
    e = S.entries.find((x) => x.id === arg);
    if (!e) return toast("Cette publication n'existe plus.", true);
  }
  const card = e.cardId && cardById(e.cardId);
  const m = openModal(`
    <div class="modal-head"><h2>${isNew ? (bday ? "Anniversaire" : "Nouvelle publication") : "Publication"}</h2><button class="icon-btn" data-act="close-modal" aria-label="Fermer">×</button></div>
    <form class="modal-body" id="entry-form" autocomplete="off">
      ${card ? `<div class="field"><span class="field-label">Idée d'origine</span><div class="row" style="align-items:center"><b style="flex:1">${esc(card.title)}</b><button type="button" class="btn small" data-act="open-card" data-id="${card.id}">Ouvrir la fiche</button></div></div>`
        : `<label class="field"><span>Titre</span><input name="title" required value="${esc(e.title)}" placeholder="Ex. Annonce prolongation" ${isNew && !bday ? "autofocus" : ""}></label>`}
      <div class="row">
        <label class="field"><span>Date</span><input type="date" name="date" required min="${RANGE_START}" max="${RANGE_END}" value="${esc(e.date)}"></label>
        <label class="field"><span>Heure (facultatif)</span><input type="time" name="time" value="${esc(e.time)}"></label>
      </div>
      <div class="field"><span class="field-label">Réseaux</span><div class="chk-chips">${NETWORKS.map(([k, l]) => `<label><input type="checkbox" name="networks" value="${k}" ${(e.networks || []).includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
      <label class="field"><span>Wording</span><textarea name="wording" rows="6" placeholder="Texte du post">${esc(e.wording)}</textarea></label>
      <label class="row" style="align-items:center;gap:8px"><input type="checkbox" name="published" ${e.published ? "checked" : ""}> Publiée</label>
    </form>
    <div class="modal-foot">
      ${!isNew ? (card ? `<button class="btn" data-act="entry-back">Renvoyer au desk</button>` : `<button class="btn danger" data-act="entry-back">Supprimer</button>`) : ""}
      <span class="spacer"></span>
      <button class="btn" data-act="close-modal">Annuler</button>
      <button class="btn primary" data-act="entry-save">${isNew ? "Ajouter au planning" : "Enregistrer"}</button>
    </div>`);
  const form = $("#entry-form", m);
  m.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "entry-back") { await returnToDesk(e.id); closeModal(); }
    if (b.dataset.act === "entry-save") {
      const fd = new FormData(form);
      const date = fd.get("date");
      if (!date || !inRange(date)) return toast("Choisis une date entre le 01/10/2026 et le 31/12/2027.", true);
      if (!card && !(fd.get("title") || "").trim()) return toast("Donne un titre à la publication.", true);
      const data = { date, time: fd.get("time") || "", networks: fd.getAll("networks"), wording: (fd.get("wording") || "").trim(), published: !!fd.get("published") };
      if (!card) data.title = fd.get("title").trim();
      const ok = await safe(async () => {
        if (isNew) await addDoc(collection(db, "entries"), { ...data, cardId: "", birthdayKey: bday ? `${bday.id}_${e.date.slice(0, 4)}` : "", createdBy: S.user.email, createdAt: serverTimestamp() });
        else await updateDoc(doc(db, "entries", e.id), data);
        return true;
      }, isNew ? "Publication ajoutée" : "Publication enregistrée");
      if (ok) closeModal();
    }
  });
}

/* Journée : piges + publications */
function openDayModal(date) {
  openModal(`
    <div class="modal-head"><h2>${cap(fmtLong(date))}</h2><button class="icon-btn" data-act="close-modal" aria-label="Fermer">×</button></div>
    <div class="modal-body" id="day-body"></div>
    <div class="modal-foot"><span class="spacer"></span><button class="btn" data-act="close-modal">Fermer</button></div>`);
  S.openDay = date;
  refreshDayModal();
}
function refreshDayModal() {
  const date = S.openDay;
  const box = $("#day-body");
  if (!date || !box) return;
  const races = racesOn(date);
  const piges = S.piges.filter((p) => p.date === date);
  const entries = entriesByDate(date, date)[date] || [];
  const hoursOpts = (v) => `<option value="">Heures ?</option>${Array.from({ length: 16 }, (_, i) => (i + 1) / 2).map((h) => `<option value="${h}" ${Number(v) === h ? "selected" : ""}>${String(h).replace(".", ",")} h</option>`).join("")}`;
  box.innerHTML = `
    ${races.length ? `<div class="field"><span class="field-label">Courses</span>${races.map(({ r, stage }) => `<div class="ribbon t-${esc((r.teams || ["WT"])[0])}"><b>${esc((r.teams || []).join("/"))}</b>${esc(r.name)}${stage ? " – " + esc(stage.label) : ""}</div>`).join("")}</div>` : ""}
    <div class="field"><span class="field-label">Piges CM</span>
      ${piges.length ? piges.map((p) => `<div class="pige-row" data-pige="${p.id}">
        <select data-f="type">${PIGE_TYPES.map(([v, l]) => `<option value="${v}" ${p.type === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <select data-f="cm"><option value="">À attribuer</option>${S.lists.cms.map((c) => `<option value="${esc(c.id)}" ${p.cm === c.id ? "selected" : ""}>${esc(cmName(c.id))}</option>`).join("")}</select>
        ${p.type === "astreinte" ? `<select data-f="hours">${hoursOpts(p.hours)}</select>` : ""}
        <button class="btn ghost small danger" data-act="pige-del" data-id="${p.id}">Retirer</button></div>`).join("") : `<p class="muted">Aucune pige ce jour.</p>`}
      <div><button class="btn small" data-act="pige-add" data-date="${date}">Ajouter une pige</button></div></div>
    <div class="field"><span class="field-label">Publications</span>
      ${entries.length ? entries.map((e) => entryPill(e, "week")).join("") : `<p class="muted">Rien de planifié.</p>`}
      <div><button class="btn small" data-act="entry-new" data-date="${date}">Publication sans idée du desk</button></div></div>`;
  $$("[data-pige] select", box).forEach((sel) => sel.addEventListener("change", async () => {
    const id = sel.closest("[data-pige]").dataset.pige;
    const f = sel.dataset.f;
    const v = f === "hours" ? (sel.value ? Number(sel.value) : null) : sel.value || null;
    const patch = { [f]: v };
    if (f === "type" && v !== "astreinte") patch.hours = null;
    await safe(() => updateDoc(doc(db, "piges", id), patch));
  }));
}

function openPigeRecap() {
  const rows = [2026, 2027].map((y) => {
    const ps = S.piges.filter((p) => p.date.startsWith(String(y)));
    const count = (t) => ps.filter((p) => p.type === t).length;
    const hours = ps.filter((p) => p.type === "astreinte").reduce((s, p) => s + (Number(p.hours) || 0), 0);
    const missingHours = ps.filter((p) => p.type === "astreinte" && !p.hours).length;
    return { y, c: count("classique"), p: count("premium"), e: count("expert"), a: count("astreinte"), hours, missingHours, todo: ps.filter((p) => !p.cm).length };
  });
  openModal(`
    <div class="modal-head"><h2>Récap des piges</h2><button class="icon-btn" data-act="close-modal" aria-label="Fermer">×</button></div>
    <div class="modal-body">
      <table class="recap"><thead><tr><th></th>${rows.map((r) => `<th>${r.y}</th>`).join("")}</tr></thead><tbody>
        <tr><td>Classique</td>${rows.map((r) => `<td>${r.c}</td>`).join("")}</tr>
        <tr><td>Premium</td>${rows.map((r) => `<td>${r.p}</td>`).join("")}</tr>
        <tr><td>Expert</td>${rows.map((r) => `<td>${r.e}</td>`).join("")}</tr>
        <tr><td>Astreintes</td>${rows.map((r) => `<td>${r.a}</td>`).join("")}</tr>
        <tr><td>Heures d'astreinte</td>${rows.map((r) => `<td>${String(r.hours).replace(".", ",")} h${r.missingHours ? `<br><small style="color:var(--amber)">${r.missingHours} sans heures</small>` : ""}</td>`).join("")}</tr>
        <tr><td>Piges à attribuer</td>${rows.map((r) => `<td>${r.todo}</td>`).join("")}</tr>
      </tbody></table>
      <p class="muted">Compte sur la période couverte par l'outil (à partir du 01/10/2026).</p>
    </div>`);
}

/* ---------- Admin ---------- */
function renderAdmin() {
  const box = $("#admin-body");
  if (!box) return;
  const acc = S.access;
  box.innerHTML = `
    <section><h2>Accès</h2><p>Les comptes Google autorisés à utiliser l'outil. Admin : <b>${esc(acc.adminEmail)}</b>.</p>
      <div class="admin-list">${(acc.allowedEmails || []).map((em) => `<div class="admin-row"><span class="grow">${esc(em)}</span><button class="btn ghost small danger" data-act="acc-del" data-v="${esc(em)}">Retirer</button></div>`).join("") || `<p class="muted">Personne d'autre pour l'instant.</p>`}
        <form class="admin-row" data-form="acc-add"><input class="grow" type="email" name="email" placeholder="prenom.nom@gmail.com" required><button class="btn small">Autoriser</button></form></div></section>

    <section><h2>Community managers</h2><p>Proposés dans les piges.</p>
      <div class="admin-list">${S.lists.cms.map((c, i) => `<div class="admin-row"><b class="w-s">${esc(c.id)}</b><input class="grow" data-cm="${i}" value="${esc(c.name)}" placeholder="Nom complet"><button class="btn ghost small danger" data-act="cm-del" data-i="${i}">Retirer</button></div>`).join("")}
        <form class="admin-row" data-form="cm-add"><input class="w-s" name="id" placeholder="Init." maxlength="4" required><input class="grow" name="name" placeholder="Nom complet"><button class="btn small">Ajouter</button></form></div></section>

    <section><h2>Libellés</h2><p>Liste fermée proposée sur les idées. Classés par rang de partenariat.</p>
      <div class="admin-list">${S.lists.labels.map((l, i) => `<div class="admin-row"><input class="grow" data-lbl="${i}" value="${esc(l.name)}"><select data-lbltier="${i}">${Object.entries(TIER_NAMES).map(([t, n]) => `<option value="${t}" ${String(l.tier) === t ? "selected" : ""}>${esc(n)}</option>`).join("")}</select><button class="btn ghost small danger" data-act="lbl-del" data-i="${i}">Retirer</button></div>`).join("")}
        <form class="admin-row" data-form="lbl-add"><input class="grow" name="name" placeholder="Nouveau libellé" required><select name="tier">${Object.entries(TIER_NAMES).map(([t, n]) => `<option value="${t}">${esc(n)}</option>`).join("")}</select><button class="btn small">Ajouter</button></form></div></section>

    <section><h2>Courses</h2><p>Affichées en bandeau sur le planning et proposées dans la période des idées.</p>
      <div class="admin-list">${S.races.map((r) => `<div class="admin-row"><span class="race-teams">${(r.teams || []).map((t) => `<b class="${esc(t)}">${esc(t)}</b>`).join("")}</span><span class="grow"><b>${esc(r.name)}</b> – ${fmtShort(r.start)}${r.end !== r.start ? " au " + fmtShort(r.end) : ""}${r.start.slice(0, 4) !== "2026" ? " " + r.start.slice(0, 4) : ""}${(r.stages || []).length ? ` – ${r.stages.length} étapes` : ""}</span><button class="btn small" data-act="race-edit" data-id="${r.id}">Modifier</button><button class="btn ghost small danger" data-act="race-del" data-id="${r.id}">Supprimer</button></div>`).join("")}
        <div><button class="btn small" data-act="race-edit">Ajouter une course</button></div></div></section>

    <section><h2>Anniversaires</h2><p>Affichés chaque année comme un post prévu le jour même.</p>
      <div class="admin-list">${S.birthdays.map((b) => `<div class="admin-row"><b class="w-s">${esc(b.day)}</b><span class="grow">${esc(b.name)}</span><button class="btn ghost small danger" data-act="bday-del" data-id="${b.id}">Retirer</button></div>`).join("")}
        <form class="admin-row" data-form="bday-add"><input class="w-s" name="day" placeholder="JJ/MM" pattern="\\d{2}/\\d{2}" required><input class="grow" name="name" placeholder="Nom" required><button class="btn small">Ajouter</button></form></div></section>`;
}
const saveLists = (patch, msg) => safe(() => setDoc(doc(db, "config", "lists"), { ...S.lists, ...patch }), msg);

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.cm !== undefined) { const cms = S.lists.cms.map((c) => ({ ...c })); cms[t.dataset.cm].name = t.value.trim(); saveLists({ cms }, "Enregistré"); }
  if (t.dataset.lbl !== undefined) { const labels = S.lists.labels.map((l) => ({ ...l })); labels[t.dataset.lbl].name = t.value.trim(); saveLists({ labels }, "Libellé renommé"); }
  if (t.dataset.lbltier !== undefined) { const labels = S.lists.labels.map((l) => ({ ...l })); labels[t.dataset.lbltier].tier = Number(t.value); saveLists({ labels }, "Enregistré"); }
});
document.addEventListener("submit", async (e) => {
  if (e.target.matches("#card-form, #entry-form, #race-form")) { e.preventDefault(); return; }
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  const k = f.dataset.form;
  if (k === "acc-add") {
    const em = v.email.trim().toLowerCase();
    const list = [...new Set([...(S.access.allowedEmails || []), em])];
    await safe(() => updateDoc(doc(db, "config", "access"), { allowedEmails: list }), `${em} autorisé`);
  }
  if (k === "cm-add") {
    const id = v.id.trim().toUpperCase();
    if (S.lists.cms.some((c) => c.id === id)) return toast("Ces initiales existent déjà.", true);
    await saveLists({ cms: [...S.lists.cms, { id, name: v.name.trim() }] }, "CM ajouté");
  }
  if (k === "lbl-add") await saveLists({ labels: [...S.lists.labels, { id: slug(v.name) + "-" + uid(), name: v.name.trim(), tier: Number(v.tier) }] }, "Libellé ajouté");
  if (k === "bday-add") await safe(() => addDoc(collection(db, "birthdays"), { day: v.day, name: v.name.trim() }), "Anniversaire ajouté");
  f.reset();
});

function openRaceModal(id) {
  const r = id ? raceById(id) : { name: "", teams: ["WT"], start: "", end: "", grandTour: false, stages: [] };
  const toLine = (s) => `${s.date.split("-").reverse().join("/")} ${s.label}`;
  const m = openModal(`
    <div class="modal-head"><h2>${id ? "Modifier la course" : "Nouvelle course"}</h2><button class="icon-btn" data-act="close-modal" aria-label="Fermer">×</button></div>
    <form class="modal-body" id="race-form" autocomplete="off">
      <label class="field"><span>Nom</span><input name="name" required value="${esc(r.name)}" autofocus></label>
      <div class="field"><span class="field-label">Équipes</span><div class="chk-chips">${TEAMS.map(([v, l]) => `<label><input type="checkbox" name="teams" value="${v}" ${(r.teams || []).includes(v) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
      <div class="row">
        <label class="field"><span>Début</span><input type="date" name="start" required value="${esc(r.start)}"></label>
        <label class="field"><span>Fin</span><input type="date" name="end" value="${esc(r.end)}"></label>
      </div>
      <label class="row" style="align-items:center;gap:8px"><input type="checkbox" name="grandTour" ${r.grandTour ? "checked" : ""}> Grand Tour</label>
      <div class="field"><span class="field-label">Étapes (une par ligne : JJ/MM/AAAA Libellé)</span>
        <textarea name="stages" rows="7" placeholder="13/10/2026 Ét. 1">${esc((r.stages || []).map(toLine).join("\n"))}</textarea>
        <div class="row" style="align-items:center"><span class="muted">Grand Tour : générer 21 étapes depuis la date de début, repos après les étapes</span>
          <input type="number" id="rest1" value="9" min="1" max="20" style="width:60px"> et <input type="number" id="rest2" value="15" min="1" max="20" style="width:60px">
          <button type="button" class="btn small" data-act="gen-gt">Générer</button></div></div>
    </form>
    <div class="modal-foot"><span class="spacer"></span><button class="btn" data-act="close-modal">Annuler</button><button class="btn primary" data-act="race-save">Enregistrer</button></div>`);
  const form = $("#race-form", m);
  const F = form.elements;
  m.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "gen-gt") {
      if (!F.start.value) return toast("Indique d'abord la date de début.", true);
      const rests = [Number($("#rest1", m).value), Number($("#rest2", m).value)];
      let d = F.start.value; const lines = [];
      for (let n = 1; n <= 21; n++) { lines.push({ date: d, label: `Ét. ${n}` }); d = addDays(d, rests.includes(n) ? 2 : 1); }
      F.stages.value = lines.map(toLine).join("\n");
      F.end.value = lines[20].date;
      F.grandTour.checked = true;
    }
    if (b.dataset.act === "race-save") {
      const fd = new FormData(form);
      const stages = [];
      for (const line of (fd.get("stages") || "").split("\n").map((l) => l.trim()).filter(Boolean)) {
        const mm = line.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/);
        if (!mm) return toast(`Ligne d'étape illisible : « ${line} »`, true);
        stages.push({ date: `${mm[3]}-${mm[2]}-${mm[1]}`, label: mm[4] });
      }
      const data = { name: fd.get("name").trim(), teams: fd.getAll("teams"), start: fd.get("start"), end: fd.get("end") || fd.get("start"), grandTour: !!fd.get("grandTour"), stages };
      if (!data.name || !data.start) return toast("Nom et date de début obligatoires.", true);
      if (data.end < data.start) return toast("La fin est avant le début.", true);
      if (!data.teams.length) data.teams = ["WT"];
      const ok = await safe(async () => { id ? await setDoc(doc(db, "races", id), data) : await addDoc(collection(db, "races"), data); return true; }, "Course enregistrée");
      if (ok) closeModal();
    }
  });
}

/* ---------- Actions globales ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  if (b.closest(".modal") && !["close-modal", "open-card", "open-entry", "pige-add", "pige-del", "entry-new", "comment-del"].includes(b.dataset.act)) return; // gérés localement
  const act = b.dataset.act;
  switch (act) {
    case "login":
      try { await signInWithPopup(auth, new GoogleAuthProvider()); }
      catch (err) { if (err.code !== "auth/popup-closed-by-user") toast("Connexion impossible : " + (err.code || err.message), true); }
      break;
    case "logout": if (!S.user || confirm(`Se déconnecter (${S.user.email}) ?`)) { closeModal(); await signOut(auth); } break;
    case "view": S.view = b.dataset.v; mountShell(); break;
    case "new-card": openCardModal(null); break;
    case "open-card": e.stopPropagation(); openCardModal(b.dataset.id); break;
    case "open-entry": {
      e.stopPropagation();
      const id = b.dataset.id;
      openEntryModal(id);
      break;
    }
    case "close-modal": closeModal(); break;
    case "pv": S.planView = b.dataset.v; mountView(); break;
    case "nav": {
      const n = Number(b.dataset.d);
      S.cursor = clampDate(S.planView === "week" ? addDays(S.cursor, 7 * n) : S.planView === "month" ? addMonths(S.cursor, n) : S.cursor);
      renderBody();
      break;
    }
    case "today": S.cursor = clampDate(todayIso()); renderBody(); break;
    case "goto-week": S.cursor = b.dataset.date; S.planView = "week"; mountView(); break;
    case "ptab": S.panelTab = b.dataset.t; $$(".panel-tabs button").forEach((x) => x.classList.toggle("on", x === b)); renderPanel(); break;
    case "sug-toggle": S.expanded.has(b.dataset.id) ? S.expanded.delete(b.dataset.id) : S.expanded.add(b.dataset.id); renderPanel(); break;
    case "open-day": e.stopPropagation(); openDayModal(b.dataset.date); break;
    case "pige-recap": openPigeRecap(); break;
    case "pige-add": await safe(() => addDoc(collection(db, "piges"), { date: b.dataset.date, type: "classique", cm: null, hours: null, createdBy: S.user.email })); break;
    case "pige-del": await safe(() => deleteDoc(doc(db, "piges", b.dataset.id)), "Pige retirée"); break;
    case "entry-new": openEntryModal({ newDate: b.dataset.date }); break;
    case "comment-del": if (confirm("Supprimer ce commentaire ?")) await safe(() => deleteDoc(doc(db, "cards", b.dataset.card, "comments", b.dataset.id))); break;
    case "acc-del": if (confirm(`Retirer l'accès de ${b.dataset.v} ?`)) await safe(() => updateDoc(doc(db, "config", "access"), { allowedEmails: (S.access.allowedEmails || []).filter((x) => x !== b.dataset.v) }), "Accès retiré"); break;
    case "cm-del": if (confirm("Retirer ce CM de la liste ? Les piges déjà attribuées gardent ses initiales.")) await saveLists({ cms: S.lists.cms.filter((_, i) => i !== Number(b.dataset.i)) }, "CM retiré"); break;
    case "lbl-del": if (confirm("Retirer ce libellé ? Il disparaîtra des idées qui l'utilisent.")) await saveLists({ labels: S.lists.labels.filter((_, i) => i !== Number(b.dataset.i)) }, "Libellé retiré"); break;
    case "race-edit": openRaceModal(b.dataset.id); break;
    case "race-del": if (confirm("Supprimer cette course ?")) await safe(() => deleteDoc(doc(db, "races", b.dataset.id)), "Course supprimée"); break;
    case "bday-del": if (confirm("Retirer cet anniversaire ?")) await safe(() => deleteDoc(doc(db, "birthdays", b.dataset.id)), "Anniversaire retiré"); break;
  }
});

renderGate();
