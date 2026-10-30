import { firebaseConfig as C } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, addDoc, deleteDoc, orderBy, limit, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (s) => document.querySelector(s), app = $("#app"), nav = $("#nav");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cap = (s) => s.trim().charAt(0).toUpperCase() + s.trim().slice(1);
if (!C.apiKey || C.apiKey.startsWith("COLLE")) {
  app.innerHTML = '<div class="card"><h2>Configuration manquante</h2><p>Ouvre le fichier firebase-config.js et colle ta configuration Firebase.</p></div>';
  throw new Error("config");
}
const auth = getAuth(initializeApp(C)), db = getFirestore();
let S = { u: null, p: null, admin: false }, busy = false;

const ERR = {
  "auth/email-already-in-use": "Cette adresse e-mail a déjà un compte.",
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/weak-password": "Mot de passe trop faible (8 caractères minimum).",
  "auth/too-many-requests": "Trop d'essais. Réessaie dans quelques minutes.",
  "auth/network-request-failed": "Problème de connexion internet."
};
const msg = (e) => ERR[e.code] || "Une erreur est survenue : " + (e.code || e.message);
const say = (t, ok) => { const m = $("#m"); if (m) { m.textContent = t; m.className = ok ? "ok" : "err"; } };
const show = (h, tabs) => { document.body.classList.remove("w"); app.innerHTML = h; nav.classList.toggle("hidden", !tabs); window.scrollTo(0, 0); };

async function load() {
  const id = S.u.uid;
  const [p, a] = await Promise.all([getDoc(doc(db, "users", id)), getDoc(doc(db, "admins", id))]);
  S.p = p.exists() ? p.data() : null;
  S.admin = a.exists();
}

function navBar() {
  const h = location.hash || "#accueil";
  const items = [["#accueil", "Accueil"], ["#poser", "Poser"], ["#profil", "Profil"]];
  if (S.admin) items.push(["#admin", "Administration"]);
  nav.innerHTML = items.map(([k, t]) => `<a href="${k}" class="${h === k ? "on" : ""}">${t}${k === "#admin" ? ' <span class="b" id="bd"></span>' : ""}</a>`).join("");
  if (S.admin) getDocs(query(collection(db, "users"), where("status", "==", "pending"))).then((s) => { const b = $("#bd"); if (b) b.textContent = s.size || ""; }).catch(() => {});
}

function route() {
  if (!S.u) return authView();
  const st = S.admin ? "authorized" : S.p?.status;
  if (st === "authorized") {
    if (!S.admin && !S.p.year) return yearForm();
    if (!wf.has()) return welcome();
    const [h, a] = location.hash.slice(1).split("/");
    if (h === "profil") return profil();
    if (h === "admin" && S.admin) return admin();
    if (h === "annee") return yearPage(Number(a));
    if (h === "poser") return ask(a);
    if (h === "q" && a) return detail(a);
    return home();
  }
  if (st === "refused") return wait("Ton inscription n'a pas été acceptée. Contacte l'administration.");
  if (st === "pending") return wait("Ton compte est en attente de validation par l'administration de l'IUT de Gestion. Tu pourras accéder au site dès qu'il sera validé.", true);
  wait("Profil introuvable. Déconnecte-toi puis réessaie, ou contacte l'administration.");
}

onAuthStateChanged(auth, async (u) => {
  if (busy) return;
  if (!u) wf.clear();
  S = { u, p: null, admin: false };
  if (u) {
    show('<div class="card"><p>Chargement…</p></div>');
    try { await load(); } catch (e) {
      show(`<div class="card"><p class="err">Erreur de lecture : ${esc(e.code || e.message)}</p><button id="o">Se déconnecter</button></div>`);
      $("#o").onclick = () => signOut(auth);
      return;
    }
  }
  route();
});
addEventListener("hashchange", route);

function authView(mode = "in") {
  const reg = mode === "up";
  show(`<div class="card"><div class="tabs"><button class="${reg ? "alt" : ""}" id="ti">Se connecter</button><button class="${reg ? "" : "alt"}" id="tu">S'inscrire</button></div>
<form id="f">${reg ? '<input id="n" placeholder="Nom" required><input id="pr" placeholder="Prénom" required>' : ""}
<input id="e" type="email" placeholder="Adresse e-mail" required>
<input id="p" type="password" placeholder="Mot de passe" minlength="8" required>
${reg ? '<input id="p2" type="password" placeholder="Confirmer le mot de passe" required><label class="chk"><input id="c" type="checkbox"><span>Je suis étudiant de l\'IUT de Gestion de l\'Université de Lomé</span></label>' : ""}
<p id="m"></p><button id="go">${reg ? "Créer mon compte" : "Se connecter"}</button></form>
${reg ? "" : '<p><a href="#" id="fg">Mot de passe oublié ?</a></p>'}</div>`);
  $("#ti").onclick = () => authView("in");
  $("#tu").onclick = () => authView("up");
  const f = $("#f");
  const upd = () => { if (reg) $("#go").disabled = !($("#n").value.trim() && $("#pr").value.trim() && $("#p").value.length >= 8 && $("#p").value === $("#p2").value && $("#c").checked); };
  f.oninput = upd; f.onchange = upd; upd();
  if (!reg) $("#fg").onclick = async (ev) => {
    ev.preventDefault();
    const e = $("#e").value.trim();
    if (!e) return say("Saisis ton e-mail dans le champ ci-dessus.");
    try { await sendPasswordResetEmail(auth, e); } catch (x) { if (x.code !== "auth/user-not-found") return say(msg(x)); }
    say("Si cette adresse existe, un e-mail vient d'être envoyé.", 1);
  };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    $("#go").disabled = true; say("");
    const e = $("#e").value.trim(), p = $("#p").value;
    try {
      if (!reg) { await signInWithEmailAndPassword(auth, e, p); return; }
      busy = true;
      const c = await createUserWithEmailAndPassword(auth, e, p), id = c.user.uid;
      const nom = cap($("#n").value), pr = cap($("#pr").value), displayName = `${pr} ${nom[0]}.`;
      await setDoc(doc(db, "users", id), { nom, prenom: pr, email: c.user.email, displayName, status: "pending", certifieEtudiant: true, certifieLe: serverTimestamp(), creeLe: serverTimestamp() });
      await setDoc(doc(db, "publicProfiles", id), { displayName });
      busy = false; S.u = c.user; await load(); route();
    } catch (x) {
      busy = false;
      if (auth.currentUser) { S.u = auth.currentUser; try { await load(); } catch (y) {} route(); return; }
      say(msg(x)); $("#go").disabled = false;
    }
  };
}

let wd = false;
const wf = {
  has: () => { if (wd) return true; try { return !!sessionStorage.getItem("w"); } catch (e) { return false; } },
  set: () => { wd = true; try { sessionStorage.setItem("w", "1"); } catch (e) {} },
  clear: () => { wd = false; try { sessionStorage.removeItem("w"); } catch (e) {} }
};

function welcome() {
  show(`<div class="wel"><div class="logos"><div class="badge"><img src="logo-iutg.png" alt="IUT de Gestion"></div><div class="badge"><img src="logo-ul.png" alt="Université de Lomé"></div></div><div class="wc"><h2>Bienvenue, ${esc(S.p?.prenom || S.p?.displayName || "administrateur")}</h2><p>Plateforme d'entraide des étudiants de l'IUT de Gestion – Université de Lomé</p><button id="go">Continuer</button></div></div>`);
  document.body.classList.add("w");
  const go = () => { clearTimeout(t); if (!document.body.classList.contains("w")) return; wf.set(); route(); };
  const t = setTimeout(go, 5000);
  $("#go").onclick = go;
}

function wait(t, r) {
  show(`<div class="card"><h2>${S.p ? "Bonjour " + esc(S.p.prenom) : "Compte"}</h2><p>${esc(t)}</p><div class="row">${r ? '<button id="r">Actualiser</button>' : ""}<button class="alt" id="o">Se déconnecter</button></div></div>`);
  $("#o").onclick = () => signOut(auth);
  if (r) $("#r").onclick = async () => { await load(); route(); };
}

const D = (t) => (t?.seconds ? new Date(t.seconds * 1000).toLocaleDateString("fr-FR") : "");
const Y = ["", "1ère année", "2ème année", "3ème année"];
const docs = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
const byDate = (a, b) => (b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0);
const qItem = (d) => `<a class="q" href="#q/${d.id}"><b>${esc(d.titre)}</b><br><small>${esc(d.matiere)} · ${esc(d.authorName)} · ${D(d.creeLe)} · ${d.nbReponses || 0} réponse(s)</small></a>`;
const br = (t) => esc(t).replace(/\n/g, "<br>");

async function list(sel, q, sort) {
  try {
    const r = docs(await getDocs(q));
    if (sort) r.sort(byDate);
    $(sel).innerHTML = r.map(qItem).join("") || "<p>Aucune question pour le moment.</p>";
  } catch (x) { $(sel).innerHTML = `<p class="err">${esc(x.code || x.message)}</p>`; }
}

function yearForm() {
  show(`<div class="card"><h2>Ton année</h2><form id="f"><select id="y"><option value="1">1ère année</option><option value="2">2ème année</option><option value="3">3ème année</option></select><input id="fi" placeholder="Filière (ex. : Finance-Comptabilité)" maxlength="60" required><p id="m"></p><button>Continuer</button></form></div>`);
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const v = { year: Number($("#y").value), filiere: $("#fi").value.trim() };
    try {
      await updateDoc(doc(db, "users", S.u.uid), v);
      await updateDoc(doc(db, "publicProfiles", S.u.uid), v);
      S.p = { ...S.p, ...v }; route();
    } catch (x) { say(msg(x)); }
  };
}

function home() {
  show(`<div class="card"><h2>Bienvenue, ${esc(S.p?.displayName || "administrateur")}</h2><div class="years">${[1, 2, 3].map((n) => `<a href="#annee/${n}" class="${S.p?.year === n ? "mine" : ""}">${Y[n]}</a>`).join("")}</div></div><div class="card"><h2>Dernières questions</h2><div id="l">Chargement…</div></div>`, 1);
  navBar();
  list("#l", query(collection(db, "questions"), orderBy("creeLe", "desc"), limit(10)));
}

async function yearPage(n) {
  show(`<div class="card"><h2>${Y[n] || "Année"}</h2><input id="s" placeholder="Rechercher une question"><a class="btn" href="#poser/${n}">Poser une question</a><div id="l">Chargement…</div></div>`, 1);
  navBar();
  let r = [];
  const draw = () => {
    const t = $("#s").value.toLowerCase();
    $("#l").innerHTML = r.filter((x) => (x.titre + " " + x.matiere + " " + x.description).toLowerCase().includes(t)).map(qItem).join("") || "<p>Aucune question trouvée.</p>";
  };
  $("#s").oninput = draw;
  try { r = docs(await getDocs(query(collection(db, "questions"), where("year", "==", n)))).sort(byDate); draw(); }
  catch (x) { $("#l").innerHTML = `<p class="err">${esc(x.code || x.message)}</p>`; }
}

function ask(n) {
  const sel = Number(n) || S.p?.year;
  show(`<div class="card"><h2>Poser une question</h2><form id="f"><select id="y">${[1, 2, 3].map((k) => `<option value="${k}" ${k === sel ? "selected" : ""}>${Y[k]}</option>`).join("")}</select><input id="t" placeholder="Titre" maxlength="150" required><input id="mt" placeholder="Matière" maxlength="60" required><textarea id="d" placeholder="Décris ta question" maxlength="5000" required></textarea><p id="m"></p><button>Publier</button></form></div>`, 1);
  navBar();
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const r = await addDoc(collection(db, "questions"), { titre: $("#t").value.trim(), matiere: $("#mt").value.trim(), description: $("#d").value.trim(), year: Number($("#y").value), authorId: S.u.uid, authorName: S.p.displayName, creeLe: serverTimestamp(), nbReponses: 0 });
      location.hash = "#q/" + r.id;
    } catch (x) { say(msg(x)); }
  };
}

async function report(qid, aid, extrait) {
  const n = prompt("Motif du signalement :\n1 = Spam\n2 = Contenu inapproprié\n3 = Hors sujet\n4 = Autre");
  const motif = ["", "Spam", "Contenu inapproprié", "Hors sujet", "Autre"][Number(n)];
  if (!motif) return;
  const txt = (prompt("Précisions (facultatif) :") || "").slice(0, 300), target = aid || qid;
  try {
    await setDoc(doc(db, "reports", S.u.uid + "_" + target), { target, type: aid ? "answer" : "question", qid, aid: aid || "", motif, detail: txt, extrait: extrait.slice(0, 120), reporterId: S.u.uid, creeLe: serverTimestamp() });
    alert("Merci, le signalement a été envoyé.");
  } catch (x) { alert(x.code === "permission-denied" ? "Tu as déjà signalé ce contenu." : msg(x)); }
}

async function detail(id) {
  show('<div class="card"><p>Chargement…</p></div>', 1);
  navBar();
  try {
    const qs = await getDoc(doc(db, "questions", id));
    if (!qs.exists()) { show('<div class="card"><p>Cette question n\'existe pas ou a été supprimée.</p></div>', 1); navBar(); return; }
    const q = qs.data(), mine = q.authorId === S.u.uid;
    const A = docs(await getDocs(query(collection(db, "questions", id, "answers"), orderBy("creeLe"))));
    show(`<div class="card"><h2>${esc(q.titre)}</h2><small>${Y[q.year]} · ${esc(q.matiere)} · ${esc(q.authorName)} · ${D(q.creeLe)}</small><p>${br(q.description)}</p><div class="row">${S.admin || mine ? '<button class="alt" id="dq">Supprimer</button>' : ""}${mine ? "" : '<button class="alt" data-r="q">Signaler</button>'}</div></div>
<div class="card"><h2>${A.length} réponse(s)</h2>${A.map((a) => { const own = a.authorId === S.u.uid; return `<div class="item"><div><b>${esc(a.authorName)}</b> <small>${D(a.creeLe)}</small><br>${br(a.texte)}</div><div class="row">${own ? "" : `<button class="alt" data-r="${a.id}">Signaler</button>`}${S.admin || own ? `<button class="alt" data-a="${a.id}">Supprimer</button>` : ""}</div></div>`; }).join("")}
<form id="f"><textarea id="r" placeholder="Ta réponse" maxlength="3000" required></textarea><p id="m"></p><button>Répondre</button></form></div>`, 1);
    navBar();
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await addDoc(collection(db, "questions", id, "answers"), { texte: $("#r").value.trim(), authorId: S.u.uid, authorName: S.p.displayName, creeLe: serverTimestamp() });
        await updateDoc(doc(db, "questions", id), { nbReponses: increment(1) });
        detail(id);
      } catch (x) { say(msg(x)); }
    };
    if ($("#dq")) $("#dq").onclick = async () => { if (confirm("Supprimer cette question ?")) { await deleteDoc(doc(db, "questions", id)); location.hash = "#accueil"; } };
    document.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => { if (confirm("Supprimer cette réponse ?")) { await deleteDoc(doc(db, "questions", id, "answers", b.dataset.a)); detail(id); } }));
    document.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { const a = A.find((x) => x.id === b.dataset.r); report(id, a ? a.id : "", a ? a.texte : q.titre); }));
  } catch (x) { show(`<div class="card"><p class="err">${esc(x.code || x.message)}</p></div>`, 1); navBar(); }
}

async function reports() {
  const G = {};
  docs(await getDocs(collection(db, "reports"))).forEach((r) => { (G[r.target] ||= []).push(r); });
  const gs = Object.values(G).sort((a, b) => b.length - a.length);
  $("#l").innerHTML = gs.map((g) => `<div class="item"><div><b>${esc(g[0].extrait)}</b><br><small>${g[0].type === "answer" ? "Réponse" : "Question"} · ${g.length} signalement(s) · ${[...new Set(g.map((r) => r.motif))].map(esc).join(", ")}</small></div><div class="row"><a class="btn" href="#q/${g[0].qid}">Voir</a><button class="alt" data-ig="${g[0].target}">Ignorer</button><button data-del="${g[0].target}">Supprimer le contenu</button></div></div>`).join("") || "<p>Aucun signalement.</p>";
  const done = async (t, del) => {
    const g = G[t];
    try {
      if (del) await deleteDoc(g[0].type === "answer" ? doc(db, "questions", g[0].qid, "answers", g[0].aid) : doc(db, "questions", g[0].qid));
      await Promise.all(g.map((r) => deleteDoc(doc(db, "reports", r.id))));
      admin("reports");
    } catch (x) { alert(msg(x)); }
  };
  document.querySelectorAll("[data-ig]").forEach((b) => (b.onclick = () => done(b.dataset.ig)));
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => confirm("Supprimer ce contenu ?") && done(b.dataset.del, true)));
}


function profil() {
  const p = S.p || {};
  show(`<div class="card"><h2>Mon profil</h2><p>Nom affiché : <b>${esc(p.displayName)}</b><br>Nom complet : ${esc(p.prenom)} ${esc(p.nom)}<br>E-mail : ${esc(S.u.email)}<br>${Y[p.year] || ""} · ${esc(p.filiere)}${S.admin ? "<br>Rôle : administrateur" : ""}</p><button id="o">Se déconnecter</button></div><div class="card"><h2>Mes questions</h2><div id="l">Chargement…</div></div>`, 1);
  $("#o").onclick = () => signOut(auth);
  navBar();
  list("#l", query(collection(db, "questions"), where("authorId", "==", S.u.uid)), true);
}

async function admin(tab = "pending") {
  const T = { pending: "En attente", authorized: "Autorisés", refused: "Refusés", reports: "Signalements" };
  show(`<div class="card"><h2>Administration</h2><div class="tabs">${Object.entries(T).map(([k, v]) => `<button class="${k === tab ? "" : "alt"}" data-t="${k}">${v}</button>`).join("")}</div><div id="l">Chargement…</div></div>`, 1);
  navBar();
  document.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => admin(b.dataset.t)));
  try {
    if (tab === "reports") return await reports();
    const s = await getDocs(query(collection(db, "users"), where("status", "==", tab)));
    const rows = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0));
    const A = { pending: [["authorized", "Autoriser"], ["refused", "Refuser"]], authorized: [["pending", "Retirer l'accès"]], refused: [["pending", "Réexaminer"]] }[tab];
    $("#l").innerHTML = rows.length
      ? rows.map((r) => `<div class="item"><div><b>${esc(r.prenom)} ${esc(r.nom)}</b><br><small>${esc(r.email)} · ${r.creeLe ? new Date(r.creeLe.seconds * 1000).toLocaleDateString("fr-FR") : ""}</small></div><div class="row">${A.map(([st, t]) => `<button data-i="${r.id}" data-s="${st}">${t}</button>`).join("")}</div></div>`).join("")
      : "<p>Aucune personne.</p>";
    document.querySelectorAll("[data-i]").forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await updateDoc(doc(db, "users", b.dataset.i), { status: b.dataset.s, decideLe: serverTimestamp() }); admin(tab); }
      catch (x) { alert(msg(x)); b.disabled = false; }
    }));
  } catch (x) { $("#l").innerHTML = `<p class="err">${esc(x.code || x.message)}</p>`; }
}
