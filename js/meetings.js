import { loadMeetings, meetingState } from "./data.js";
import { escapeHtml, fromISODate } from "./firebase.js";

const list = document.getElementById("meetingList");
const status = document.getElementById("meetingStatus");
const LABELS = { past: "Pasada", future: "Próxima", canceled: "Cancelada" };

function render(m) {
  const state = meetingState(m);
  const date = fromISODate(m.fecha);
  const month = date.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
  const li = document.createElement("li");
  li.className = `meeting-entry status-${state}`;
  li.innerHTML = `
    <div class="meeting-date"><span class="meeting-month">${month}</span><strong>${String(date.getDate()).padStart(2, "0")}</strong><span class="meeting-year">${date.getFullYear()}</span></div>
    <div class="meeting-body">
      <div class="meeting-topline">
        <h2>${escapeHtml(m.titulo)}</h2>
        <span class="meeting-status">${LABELS[state]}</span>
      </div>
      <p>${escapeHtml(m.descripcion)}</p>
    </div>`;
  return li;
}

loadMeetings()
  .then((items) => {
    list.replaceChildren(...items.filter((m) => m.fecha).map(render));
    status.hidden = items.length > 0;
    status.textContent = "Todavía no hay reuniones publicadas.";
  })
  .catch((e) => {
    console.error("[REUNIONES]", e);
    status.textContent = "No se pudieron cargar las reuniones. Inténtalo de nuevo más tarde.";
  });
