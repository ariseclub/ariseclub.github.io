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
export const USERS = "users";
export const TEMPUSERS = "tempusers";
export const PROPOSALS = "map_proposals";

export const ATELIER_STATES = {
  active: "En curso",
  upcoming: "Próximamente",
  completed: "Completado",
  paused: "En pausa"
};

export const POSTRE = "Pieza de fruta, yogur, lácteos, tarta del día o café.";
export const PRECIO_DEFECTO = "5,10";
export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export let authCheckError = "";

export async function isAuthorized(uid) {
  authCheckError = "";
  if (!uid) {
    authCheckError = "sin-uid";
    return false;
  }
  try {
    const snap = await getDoc(doc(db, ADMINS, uid));
    if (!snap.exists()) authCheckError = "no-existe";
    return snap.exists();
  } catch (e) {
    authCheckError = e.code || "error";
    return false;
  }
}

export function authErrorText(code) {
  switch (code) {
    case "auth/invalid-email":
      return "El correo electrónico no es válido.";
    case "auth/user-disabled":
      return "Esta cuenta ha sido deshabilitada.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Correo o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos fallidos. Inténtalo más tarde.";
    case "auth/popup-closed-by-user":
      return "Cerraste la ventana de inicio de sesión.";
    case "auth/account-exists-with-different-credential":
      return "Ya existe una cuenta con este correo usando otro método de acceso.";
    default:
      return "Ha ocurrido un error al iniciar sesión. Inténtalo de nuevo.";
  }
}

export async function loadJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
