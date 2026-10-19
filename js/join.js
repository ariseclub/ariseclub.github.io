import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

const msg = document.getElementById("joinMsg");
const buttons = [document.getElementById("googleBtn"), document.getElementById("microsoftBtn")];

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

async function handleAuth(type) {
  buttons.forEach((b) => (b.disabled = true));
  msg.textContent = "";
  try {
    const result = await signInWithPopup(auth, createProvider(type));
    const user = result.user;
    const provider = user.providerData.find((x) => x.providerId === result.providerId) || user.providerData[0];
    const email = ((provider && provider.email) || user.email || "").trim().toLowerCase();
    const name = ((provider && provider.displayName) || user.displayName || "").trim();
    if (!email) throw new Error("No se pudo obtener el correo electrónico.");
    await setDoc(doc(db, "tempusers", email), { name, joined_at: serverTimestamp() }, { merge: true });
    window.location.href = "./index.html";
  } catch (e) {
    console.error("[UNIRSE] Error en autenticación", { message: e.message, code: e.code || "unknown" });
    buttons.forEach((b) => (b.disabled = false));
    msg.textContent = e.code === "auth/popup-blocked"
      ? "El navegador ha bloqueado la ventana de inicio de sesión. Permite las ventanas emergentes para esta web."
      : e.code === "auth/popup-closed-by-user"
        ? "Has cerrado la ventana antes de terminar."
        : "No se pudo enviar la solicitud. Inténtalo de nuevo.";
  }
}

document.getElementById("googleBtn").addEventListener("click", () => handleAuth("google"));
document.getElementById("microsoftBtn").addEventListener("click", () => handleAuth("microsoft"));
