import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { loadAteliers, loadMeetings, meetingState } from "./data.js";
import { db, MENUS, fromISODate, toISODate } from "./firebase.js";

const $ = (id) => document.getElementById(id);

loadMeetings().then((meetings) => {
  const next = meetings.find((m) => meetingState(m) === "future");
  const m = next || meetings[0];
  if (!m) return;
  const date = fromISODate(m.fecha);
  $("homeMeetingDate").textContent = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
  $("homeMeeting").textContent = `${next ? "Próxima" : "Última"}: ${m.titulo}`;
  $("homeMeetingText").textContent = m.descripcion || "";
}).catch(() => {});

loadAteliers().then((ateliers) => {
  const active = ateliers.filter((a) => a.estado === "active");
  if (active.length) $("homeAtelier").textContent = `En curso: ${active.map((a) => a.titulo).join(", ")}`;
}).catch(() => {});

const today = new Date();
if (today.getDay() === 0 || today.getDay() === 6) {
  $("homeCanteenText").textContent = "La cafetería abre de lunes a viernes";
} else {
  getDoc(doc(db, MENUS, toISODate(today))).then((snap) => {
    const plato = snap.exists() ? (snap.data().plato || "").trim() : "";
    if (/^festivo$/i.test(plato)) {
      $("homeCanteen").textContent = "Hoy es festivo";
      $("homeCanteenText").textContent = "La universidad no está abierta";
    } else if (plato) {
      $("homeCanteen").textContent = plato;
      $("homeCanteenText").textContent = `Plato del día · ${snap.data().precio || "5,10"} €`;
    }
  }).catch(() => {});
}
