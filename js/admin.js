import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, emailOf, isAuthorized, authErrorText } from "./firebase.js";

const page = location.pathname.split("/").pop() || "gestion.html";
const loginUrl = (extra = "") => `./login.html?next=${encodeURIComponent(page)}${extra}`;

export function requireAdmin() {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();
      if (!user) {
        window.location.replace(loginUrl());
        return;
      }
      const email = emailOf(user);
      if (!(await isAuthorized(email))) {
        console.error(`[ERROR] ❌ Correo no autorizado en admin/${email}`);
        await signOut(auth);
        window.location.replace(loginUrl(`&error=no-autorizado&motivo=${encodeURIComponent(authErrorText(email))}`));
        return;
      }
      document.getElementById("userEmail").textContent = email;
      document.getElementById("loading").hidden = true;
      document.getElementById("editorView").hidden = false;
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        await signOut(auth);
        window.location.replace("./login.html");
      });
      resolve(email);
    });
  });
}
