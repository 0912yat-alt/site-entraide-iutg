import { firebaseConfig as C } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
const show = (h, tabs) => { app.innerHTML = h; nav.classList.toggle("hidden", !tabs); window.scrollTo(0, 0); };

async function load() {
  const id = S.u.uid;
  const [p, a] = await Promise.all([getDoc(doc(db, "users", id)), getDoc(doc(db, "admins", id))]);
  S.p = p.exists() ? p.data() : null;
  S.admin = a.exists();
}

function navBar() {
  const h = location.hash || "#accueil";
  const items = [["#accueil", "Accueil"], ["#profil", "Profil"]];
  if (S.admin) items.push(["#admin", "Administration"]);
  nav.innerHTML = items.map(([k, t]) => `<a href="${k}" class="${h === k ? "on" : ""}">${t}${k === "#admin" ? ' <span class="b" id="bd"></span>' : ""}</a>`).join("");
  if (S.admin) getDocs(query(collection(db, "users"), where("status", "==", "pending"))).then((s) => { const b = $("#bd"); if (b) b.textContent = s.size || ""; }).catch(() => {});
}

function route() {
  if (!S.u) return authView();
  const st = S.admin ? "authorized" : S.p?.status;
  if (st === "authorized") {
    const h = location.hash;
    return h === "#profil" ? profil() : h === "#admin" && S.admin ? admin() : home();
  }
  if (st === "refused") return wait("Ton inscription n'a pas été acceptée. Contacte l'administration.");
  if (st === "pending") return wait("Ton compte est en attente de validation par l'administration de l'IUT de Gestion. Tu pourras accéder au site dès qu'il sera validé.", true);
  wait("Profil introuvable. Déconnecte-toi puis réessaie, ou contacte l'administration.");
}

onAuthStateChanged(auth, async (u) => {
  if (busy) return;
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

function wait(t, r) {
  show(`<div class="card"><h2>${S.p ? "Bonjour " + esc(S.p.prenom) : "Compte"}</h2><p>${esc(t)}</p><div class="row">${r ? '<button id="r">Actualiser</button>' : ""}<button class="alt" id="o">Se déconnecter</button></div></div>`);
  $("#o").onclick = () => signOut(auth);
  if (r) $("#r").onclick = async () => { await load(); route(); };
}

function home() {
  show(`<div class="card"><h2>Bienvenue, ${esc(S.p?.displayName || "administrateur")}</h2><p>Ton compte est validé. Les questions et les réponses arrivent à l'étape suivante.</p></div>`, 1);
  navBar();
}

function profil() {
  const p = S.p || {};
  show(`<div class="card"><h2>Mon profil</h2><p>Nom affiché : <b>${esc(p.displayName)}</b><br>Nom complet : ${esc(p.prenom)} ${esc(p.nom)}<br>E-mail : ${esc(S.u.email)}${S.admin ? "<br>Rôle : administrateur" : ""}</p><button id="o">Se déconnecter</button></div>`, 1);
  $("#o").onclick = () => signOut(auth);
  navBar();
}

async function admin(tab = "pending") {
  const T = { pending: "En attente", authorized: "Autorisés", refused: "Refusés" };
  show(`<div class="card"><h2>Administration</h2><div class="tabs">${Object.entries(T).map(([k, v]) => `<button class="${k === tab ? "" : "alt"}" data-t="${k}">${v}</button>`).join("")}</div><div id="l">Chargement…</div></div>`, 1);
  navBar();
  document.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => admin(b.dataset.t)));
  try {
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
