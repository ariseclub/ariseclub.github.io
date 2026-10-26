import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

export const app = initializeApp({
  apiKey: "AIzaSyAdRctmMezyRBFVJBYZ8jufDqRmyARk790",
  authDomain: "arise-a3be8.firebaseapp.com",
  projectId: "arise-a3be8",
  storageBucket: "arise-a3be8.firebasestorage.app",
  messagingSenderId: "454589771976",
  appId: "1:454589771976:web:bebcc57c4b569e3974b5fd"
});

export const auth = getAuth(app);
export const db = getFirestore(app);

export const ADMINS = "admin";
export const MENUS = "canteen";
export const ATELIERS = "ateliers";
export const MEETINGS = "meetings";
export const MAPS = "map";

export function emailOf(user) {
  const provider = user.providerData[0];
  return ((provider && provider.email) || user.email || "").trim().toLowerCase();
}

export let authCheckError = "";

export async function isAuthorized(email) {
  authCheckError = "";
  if (!email) {
    authCheckError = "sin-correo";
    return false;
  }
  try {
    const snap = await getDoc(doc(db, ADMINS, email));
    if (!snap.exists()) authCheckError = "no-existe";
    return snap.exists();
  } catch (e) {
    authCheckError = e.code || "error";
    return false;
  }
}

export function authErrorText(email) {
  if (authCheckError === "permission-denied") return `Firestore no deja leer ${ADMINS}/${email}. Revisa que las reglas tengan el bloque match /${ADMINS}/{email}.`;
  if (authCheckError === "no-existe") return `No existe el documento ${ADMINS}/${email}. El ID tiene que ser exactamente ese correo, en minúsculas y sin espacios.`;
  if (authCheckError === "sin-correo") return "Tu cuenta no ha devuelto ningún correo.";
  return `No se pudo comprobar el correo ${email} (${authCheckError}).`;
}

export async function loadJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const POSTRE = "Pieza de fruta, yogur, lácteos, tarta del día o café.";
export const PRECIO_DEFECTO = "5,10";

export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function mondayOf(s) {
  const wd = fromISODate(s).getDay();
  return addDays(s, wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd);
}

export function formatLongDate(s) {
  return fromISODate(s).toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

export function formatDate(s) {
  return fromISODate(s).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export const ATELIER_STATES = {
  active: "En curso",
  upcoming: "Próximamente",
  completed: "Completado",
  paused: "En pausa"
};
