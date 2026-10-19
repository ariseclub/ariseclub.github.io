import { loadAteliers } from "./data.js";
import { escapeHtml, formatDate, ATELIER_STATES } from "./firebase.js";

const list = document.getElementById("ateliersList");
const status = document.getElementById("ateliersStatus");

function dateText(a) {
  if (a.fecha) return formatDate(a.fecha);
  return a.estado === "active" ? "En curso" : "Fecha por definir";
}

function render(a) {
  const estado = ATELIER_STATES[a.estado] ? a.estado : "upcoming";
  const icono = /^[a-z0-9 -]+$/i.test(a.icono || "") ? a.icono : "fa-solid fa-laptop-code";
  const inner = `
    <i class="${icono} activity-icon" aria-hidden="true"></i>
    <h3>${escapeHtml(a.titulo)}</h3>
    <p>${escapeHtml(a.descripcion)}</p>
    <div class="activity-date"><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>${escapeHtml(dateText(a))}</span></div>
    <span class="activity-status status-${estado}">${ATELIER_STATES[estado]}</span>`;
  const li = document.createElement("li");
  const enlace = /^(https?:\/\/|(?![a-z][a-z0-9+.-]*:)\S+$)/i.test(a.enlace || "") ? a.enlace : "";
  li.innerHTML = enlace
    ? `<a class="activity-window" href="${escapeHtml(enlace)}">${inner}</a>`
    : `<div class="activity-window">${inner}</div>`;
  return li;
}

loadAteliers()
  .then((items) => {
    list.replaceChildren(...items.map(render));
    status.hidden = items.length > 0;
    status.textContent = "Todavía no hay talleres publicados.";
  })
  .catch((e) => {
    console.error("[TALLERES]", e);
    status.textContent = "No se pudieron cargar los talleres. Inténtalo de nuevo más tarde.";
  });
