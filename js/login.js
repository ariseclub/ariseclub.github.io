import { GoogleAuthProvider, OAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, ADMINS, emailOf, isAuthorized, authErrorText } from "./firebase.js";

const PAGES = ["gestion.html", "gestion-cafeteria.html", "gestion-actividades.html", "gestion-mapa.html"];
const params = new URLSearchParams(location.search);
const next = PAGES.includes(params.get("next")) ? params.get("next") : "gestion.html";

const msg = document.getElementById("loginMsg");
const buttons = [document.getElementById("googleBtn"), document.getElementById("microsoftBtn")];

if (params.get("error") === "no-autorizado") {
  msg.textContent = params.get("motivo") || "Ese correo no está autorizado para entrar en la gestión.";
}

function createProvider(type) {
  if (type === "google") {
    const p = new GoogleAuthProvider();
    p.addScope("email");
    p.addScope("profile");
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  }
  const p = new OAuthProvider("microsoft.com");
  p.addScope("email");
  p.addScope("openid");
  p.addScope("profile");
  p.setCustomParameters({ prompt: "select_account" });
  return p;
}

async function checkUser(user) {
  const email = emailOf(user);
  const token = await user.getIdTokenResult().catch(() => null);
  const tokenEmail = (token && token.claims.email) || null;
  console.log("[AUTH] request.auth.token.email:", tokenEmail);
  console.log("[AUTH] Documento que se busca:", `${ADMINS}/${email}`);
  if (!tokenEmail) console.warn("[AUTH] El token no trae correo, así que la regla de admin no te deja leer el documento");
  else if (tokenEmail.toLowerCase() !== email) console.warn(`[AUTH] El correo del token (${tokenEmail.toLowerCase()}) no coincide con el documento que se busca, así que la regla de admin no te deja leerlo`);
  if (await isAuthorized(email)) {
    window.location.replace(`./${next}`);
    return;
  }
  await signOut(auth);
  msg.textContent = authErrorText(email || "(desconocido)");
  buttons.forEach((b) => (b.disabled = false));
}

async function handleAuth(type) {
  buttons.forEach((b) => (b.disabled = true));
  msg.textContent = "";
  try {
    const result = await signInWithPopup(auth, createProvider(type));
    await checkUser(result.user);
  } catch (e) {
    buttons.forEach((b) => (b.disabled = false));
    if (e.code === "auth/popup-blocked") {
      msg.textContent = "El navegador ha bloqueado la ventana de inicio de sesión. Permite las ventanas emergentes para esta web.";
    } else if (e.code === "auth/popup-closed-by-user") {
      msg.textContent = "Has cerrado la ventana antes de terminar.";
    } else {
      msg.textContent = e.code === "auth/account-exists-with-different-credential" ? "Ese correo ya entró antes con otro proveedor. Usa el mismo botón (Google o Microsoft) que la primera vez." : `No se pudo iniciar sesión (${e.code || "error"}).`;
    }
  }
}

const stopListening = onAuthStateChanged(auth, (user) => {
  stopListening();
  if (user) checkUser(user);
});

document.getElementById("googleBtn").addEventListener("click", () => handleAuth("google"));
document.getElementById("microsoftBtn").addEventListener("click", () => handleAuth("microsoft"));
