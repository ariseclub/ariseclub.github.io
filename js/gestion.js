import { collection, getCountFromServer } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, PROPOSALS } from "./firebase.js";
import { requireAdmin } from "./admin.js";

requireAdmin().then(async () => {
  try {
    const count = (await getCountFromServer(collection(db, PROPOSALS))).data().count;
    const badge = document.getElementById("proposalBadge");
    badge.textContent = count === 1 ? "1 propuesta" : `${count} propuestas`;
    badge.hidden = count === 0;
  } catch (e) {
    console.warn("[GESTION] No se pudo contar las propuestas del mapa", e.code || e);
  }
});
