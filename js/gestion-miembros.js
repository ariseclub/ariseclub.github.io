import { collection, getDocs, doc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, USERS, TEMPUSERS, escapeHtml } from "./firebase.js";
import { requireAdmin } from "./admin.js";

const $ = (id) => document.getElementById(id);
const lists = { pending: $("pendingList"), members: $("memberList") };
const EMPTY = {
  pending: "No hay solicitudes pendientes.",
  members: "Todavía no hay miembros.",
  search: "No hay nadie que coincida con la búsqueda."
};

let pending = [];
let members = [];
let view = "pending";

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatWhen(value) {
  const date = toDate(value);
  if (date) return date.toLocaleString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return typeof value === "string" && value.trim() ? value.trim() : "sin fecha";
}

function timeOf(value) {
  const date = toDate(value);
  return date ? date.getTime() : Infinity;
}

function byName(a, b) {
  return (a.name || a.id).localeCompare(b.name || b.id, "es", { sensitivity: "base" });
}

function matches(item) {
  const q = $("search").value.trim().toLowerCase();
  return !q || `${item.name || ""} ${item.id}`.toLowerCase().includes(q);
}

function rowHtml(item, isPending) {
  const dates = isPending
    ? `Solicitud: ${escapeHtml(formatWhen(item.joined_at))}`
    : `Solicitud: ${escapeHtml(formatWhen(item.joined_at))} · Aprobado: ${escapeHtml(formatWhen(item.approved_at))}`;
  const isMember = isPending && members.some((m) => m.id === item.id);
  const actions = isPending
    ? `<div class="member-actions">
        <button type="button" class="btn-secondary btn-danger" data-action="reject">Rechazar</button>
        <button type="button" data-action="accept"${isMember ? " disabled" : ""}>Aceptar</button>
      </div>`
    : "";
  return `
    <div class="member-info">
      <strong>${escapeHtml(item.name || "Sin nombre")}${isMember ? ' <span class="item-badge">Ya es miembro</span>' : ""}</strong>
      <a href="mailto:${escapeHtml(item.id)}">${escapeHtml(item.id)}</a>
      <small>${dates}</small>
    </div>
    ${actions}
    <p class="msg" role="status"></p>`;
}

async function accept(item, li) {
  const msg = li.querySelector(".msg");
  li.querySelectorAll("button").forEach((b) => (b.disabled = true));
  msg.textContent = "Aceptando…";
  try {
    const data = { name: item.name || "", approved_at: serverTimestamp() };
    if (item.joined_at) data.joined_at = item.joined_at;
    const batch = writeBatch(db);
    batch.set(doc(db, USERS, item.id), data);
    batch.delete(doc(db, TEMPUSERS, item.id));
    await batch.commit();
    pending = pending.filter((p) => p !== item);
    members.push({ id: item.id, name: item.name || "", joined_at: item.joined_at || null, approved_at: new Date() });
    render();
  } catch (e) {
    console.error("[MIEMBROS] Error al aceptar", e);
    li.querySelectorAll("button").forEach((b) => (b.disabled = false));
    msg.textContent = e.code === "permission-denied" ? "Sin permiso para aceptar. Revisa las reglas de Firestore de users y tempusers." : "No se pudo aceptar la solicitud.";
  }
}

async function reject(item, li) {
  if (!confirm(`¿Rechazar la solicitud de ${item.name || item.id} (${item.id})? Se borrará y no se puede deshacer.`)) return;
  const msg = li.querySelector(".msg");
  li.querySelectorAll("button").forEach((b) => (b.disabled = true));
  msg.textContent = "Rechazando…";
  try {
    await deleteDoc(doc(db, TEMPUSERS, item.id));
    pending = pending.filter((p) => p !== item);
    render();
  } catch (e) {
    console.error("[MIEMBROS] Error al rechazar", e);
    li.querySelectorAll("button").forEach((b) => (b.disabled = false));
    msg.textContent = e.code === "permission-denied" ? "Sin permiso para rechazar. Revisa las reglas de Firestore de tempusers." : "No se pudo rechazar la solicitud.";
  }
}

function renderList(key, items, isPending) {
  lists[key].replaceChildren(...items.filter(matches).map((item) => {
    const li = document.createElement("li");
    li.className = "member-row";
    li.innerHTML = rowHtml(item, isPending);
    if (isPending) {
      li.querySelector('[data-action="accept"]').addEventListener("click", () => accept(item, li));
      li.querySelector('[data-action="reject"]').addEventListener("click", () => reject(item, li));
    }
    return li;
  }));
}

function render() {
  pending.sort((a, b) => timeOf(a.joined_at) - timeOf(b.joined_at));
  members.sort(byName);
  renderList("pending", pending, true);
  renderList("members", members, false);
  $("pendingCount").textContent = pending.length;
  $("memberCount").textContent = members.length;
  const total = view === "pending" ? pending.length : members.length;
  const shown = lists[view].children.length;
  $("emptyMsg").hidden = shown > 0;
  $("emptyMsg").textContent = total ? EMPTY.search : EMPTY[view];
}

function showTab(key) {
  view = key;
  document.querySelectorAll("[data-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.tab === key)));
  Object.entries(lists).forEach(([k, list]) => (list.hidden = k !== key));
  render();
}

async function readCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function load() {
  const [tempRes, userRes] = await Promise.allSettled([readCollection(TEMPUSERS), readCollection(USERS)]);
  const errors = [];
  [[TEMPUSERS, tempRes], [USERS, userRes]].forEach(([name, res]) => {
    if (res.status === "fulfilled") return;
    errors.push(name);
    console.error("[MIEMBROS] Error al cargar", name, res.reason);
  });
  if (tempRes.status === "fulfilled") pending = tempRes.value;
  if (userRes.status === "fulfilled") members = userRes.value;
  $("loadMsg").textContent = errors.length ? `No se pudo leer ${errors.join(" ni ")} de Firestore. Revisa las reglas.` : "";
  render();
}

document.querySelectorAll("[data-tab]").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
$("search").addEventListener("input", render);

requireAdmin().then(load);
