import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, ATELIERS, MEETINGS, ATELIER_STATES, loadJson, escapeHtml } from "./firebase.js";
import { requireAdmin } from "./admin.js";

const $ = (id) => document.getElementById(id);
let currentUid = "";
const ICONS = [
  ["fa-solid fa-laptop-code", "Ordenador"],
  ["fa-solid fa-code", "Código"],
  ["fa-solid fa-robot", "Robot"],
  ["fa-solid fa-microchip", "Electrónica"],
  ["fa-solid fa-screwdriver-wrench", "Herramientas"],
  ["fa-solid fa-location-dot", "Mapa"],
  ["fa-solid fa-mug-hot", "Cafetería"],
  ["fa-solid fa-calendar-days", "Calendario"],
  ["fa-solid fa-microphone-lines", "Charla"],
  ["fa-solid fa-lightbulb", "Idea"],
  ["fa-solid fa-gear", "Engranaje"]
];
const KINDS = {
  ateliers: {
    collection: ATELIERS,
    list: "atelierList",
    json: "data/ateliers.json",
    nuevo: "Nuevo taller",
    empty: () => ({ titulo: "", descripcion: "", fecha: "", estado: "upcoming", icono: ICONS[0][0], enlace: "", orden: 0 }),
    sort: (a, b) => (a.orden ?? 0) - (b.orden ?? 0),
    fields: [
      { key: "titulo", label: "Título", type: "text", required: true, wide: true },
      { key: "descripcion", label: "Descripción", type: "textarea", wide: true },
      { key: "estado", label: "Estado", type: "select", options: Object.entries(ATELIER_STATES) },
      { key: "fecha", label: "Fecha", type: "date", hint: "Vacía: «En curso» o «Fecha por definir»" },
      { key: "icono", label: "Icono", type: "select", options: ICONS, icon: true },
      { key: "orden", label: "Orden", type: "number", hint: "Los números bajos salen primero" },
      { key: "enlace", label: "Enlace", type: "text", wide: true, placeholder: "mapa.html o https://…", hint: "Opcional. Al pulsar la tarjeta se abre esta dirección" }
    ]
  },
  meetings: {
    collection: MEETINGS,
    list: "meetingList",
    json: "data/meetings.json",
    nuevo: "Nueva reunión",
    empty: () => ({ titulo: "", descripcion: "", fecha: "", cancelada: false }),
    sort: (a, b) => (b.fecha || "").localeCompare(a.fecha || ""),
    fields: [
      { key: "titulo", label: "Título", type: "text", required: true, wide: true },
      { key: "descripcion", label: "Descripción", type: "textarea", wide: true },
      { key: "fecha", label: "Fecha", type: "date", required: true },
      { key: "cancelada", label: "Cancelada", type: "checkbox" }
    ]
  }
};
let uid = 0;

function fieldHtml(f, value, n) {
  const id = `f${n}-${f.key}`;
  const req = f.required ? " required" : "";
  const hint = f.hint ? `<small class="hint">${escapeHtml(f.hint)}</small>` : "";
  const cls = `field${f.wide ? " field-wide" : ""}`;
  if (f.type === "checkbox") {
    return `<label class="${cls}"><input type="checkbox" name="${f.key}" ${value ? "checked" : ""}> ${f.label}</label>`;
  }
  let control;
  if (f.type === "textarea") {
    control = `<textarea name="${f.key}" ${req}>${escapeHtml(value)}</textarea>`;
  } else if (f.type === "select") {
    const opts = f.options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${v === value ? "selected" : ""}>${escapeHtml(l)}</option>`).join("");
    control = `<select name="${f.key}" ${req}>${opts}</select>`;
    if (f.icon) control = `<span class="icon-preview"><i class="${value}"></i></span>${control}`;
  } else {
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : "";
    control = `<input type="${f.type}" name="${f.key}" value="${escapeHtml(value)}" ${req}${ph}>`;
  }
  return `<label class="${cls}">${f.label}${control}${hint}</label>`;
}

function readForm(kind, form) {
  const data = {};
  for (const f of kind.fields) {
    const el = form.elements[f.key];
    if (f.type === "checkbox") data[f.key] = el.checked;
    else if (f.type === "number") data[f.key] = Number(el.value) || 0;
    else data[f.key] = el.value.trim();
  }
  return data;
}

function titleOf(kind, data) {
  return data.titulo || kind.nuevo;
}

function buildCard(kind, item) {
  const n = ++uid;
  const form = document.createElement("form");
  form.className = "item-card";
  form.innerHTML = `
    <header class="item-head">
      <h3 class="item-title"></h3>
      <span class="item-badge" hidden>Sin guardar</span>
    </header>
    ${kind.fields.map((f) => fieldHtml(f, item[f.key] ?? "", n)).join("")}
    <footer class="item-actions">
      <button type="button" class="danger" data-action="delete">Borrar</button>
      <button type="submit" class="primary">Guardar</button>
      <span class="msg" role="status"></span>
    </footer>
  `;
  let id = item.id || null;
  const title = form.querySelector(".item-title");
  const badge = form.querySelector(".item-badge");
  const msg = form.querySelector(".msg");
  const setDirty = (on) => {
    badge.hidden = !on;
    form.classList.toggle("is-dirty", on);
  };
  title.textContent = titleOf(kind, item);
  setDirty(!id);

  form.addEventListener("input", (e) => {
    setDirty(true);
    msg.textContent = "";
    if (e.target.name === "titulo") title.textContent = titleOf(kind, { titulo: e.target.value.trim() });
    if (e.target.name === "icono") e.target.previousElementSibling.className = e.target.value;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = { ...readForm(kind, form), updatedBy: currentUid, updatedAt: serverTimestamp() };
    const save = form.querySelector('button[type="submit"]');
    save.disabled = true;
    msg.textContent = "Guardando…";
    try {
      if (id) await setDoc(doc(db, kind.collection, id), data);
      else id = (await addDoc(collection(db, kind.collection), data)).id;
      setDirty(false);
      msg.textContent = "Guardado. Ya se ve en la web.";
    } catch (err) {
      console.error("[GESTIÓN] Error al guardar", err);
      msg.textContent = err.code === "permission-denied" ? "Sin permiso para guardar. Revisa las reglas de Firestore." : "No se pudo guardar.";
    } finally {
      save.disabled = false;
    }
  });

  form.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    if (!confirm(`¿Borrar «${titleOf(kind, readForm(kind, form))}»? No se puede deshacer.`)) return;
    try {
      if (id) await deleteDoc(doc(db, kind.collection, id));
      form.remove();
      updateEmpty(kind);
    } catch (err) {
      console.error("[GESTIÓN] Error al borrar", err);
      msg.textContent = err.code === "permission-denied" ? "Sin permiso para borrar. Revisa las reglas de Firestore." : "No se pudo borrar.";
    }
  });

  return form;
}

function updateEmpty(kind) {
  const list = $(kind.list);
  if (!list) return;
  const empty = list.querySelector(".empty");
  if (empty) empty.remove();
  if (!list.querySelector(".item-card")) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = kind.nuevo === "Nuevo taller" ? "No hay talleres todavía." : "No hay reuniones todavía.";
    list.append(p);
  }
}
