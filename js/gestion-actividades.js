import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, ATELIERS, MEETINGS, ATELIER_STATES, loadJson, escapeHtml } from "./firebase.js";
import { requireAdmin } from "./admin.js";

const $ = (id) => document.getElementById(id);
let currentEmail = "";

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
  const hint = f.hint ? `<small class="field-hint">${escapeHtml(f.hint)}</small>` : "";
  const cls = `field${f.wide ? " field-wide" : ""}`;
  if (f.type === "checkbox") {
    return `<label class="toggle ${cls}"><input id="${id}" name="${f.key}" type="checkbox"${value ? " checked" : ""}> ${f.label}</label>`;
  }
  let control;
  if (f.type === "textarea") {
    control = `<textarea id="${id}" name="${f.key}" rows="4"${req}>${escapeHtml(value)}</textarea>`;
  } else if (f.type === "select") {
    const opts = f.options.map(([v, l]) => `<option value="${escapeHtml(v)}"${v === value ? " selected" : ""}>${escapeHtml(l)}</option>`).join("");
    control = `<select id="${id}" name="${f.key}">${opts}</select>`;
    if (f.icon) control = `<span class="icon-select"><i class="${escapeHtml(value)}" aria-hidden="true"></i>${control}</span>`;
  } else {
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : "";
    control = `<input id="${id}" name="${f.key}" type="${f.type}" value="${escapeHtml(value)}"${ph}${req}>`;
  }
  return `<div class="${cls}"><label for="${id}">${f.label}</label>${control}${hint}</div>`;
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
    <div class="item-head">
      <h3 class="item-title"></h3>
      <span class="item-badge" hidden>Sin guardar</span>
    </div>
    <div class="field-grid">${kind.fields.map((f) => fieldHtml(f, item[f.key] ?? "", n)).join("")}</div>
    <div class="item-actions">
      <button type="button" class="btn-secondary btn-danger" data-action="delete">Borrar</button>
      <button type="submit">Guardar</button>
    </div>
    <p class="msg" role="status"></p>`;
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
    const data = { ...readForm(kind, form), updatedBy: currentEmail, updatedAt: serverTimestamp() };
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
  list.nextElementSibling.hidden = list.children.length > 0;
}

async function loadKind(kind) {
  const snap = await getDocs(collection(db, kind.collection));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(kind.sort);
  $(kind.list).replaceChildren(...items.map((it) => buildCard(kind, it)));
  updateEmpty(kind);
  return items.length;
}

async function loadAll() {
  $("importBox").hidden = true;
  try {
    const counts = await Promise.all(Object.values(KINDS).map(loadKind));
    $("importBox").hidden = counts.some((c) => c > 0);
  } catch (e) {
    console.error("[GESTIÓN] Error al cargar", e);
    $("loadMsg").textContent = "No se pudo leer Firestore. Revisa las reglas de las colecciones ateliers y meetings.";
  }
}

document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = KINDS[btn.dataset.add];
    const card = buildCard(kind, kind.empty());
    $(kind.list).prepend(card);
    updateEmpty(kind);
    card.querySelector("input, textarea").focus();
  });
});

$("importBtn").addEventListener("click", async () => {
  $("importBtn").disabled = true;
  $("importMsg").textContent = "Importando…";
  try {
    const batch = writeBatch(db);
    for (const kind of Object.values(KINDS)) {
      const items = await loadJson(kind.json);
      items.forEach((it) => batch.set(doc(collection(db, kind.collection)), { ...it, updatedBy: currentEmail, updatedAt: serverTimestamp() }));
    }
    await batch.commit();
    await loadAll();
  } catch (e) {
    console.error("[GESTIÓN] Error al importar", e);
    $("importMsg").textContent = e.code === "permission-denied" ? "Sin permiso para guardar. Revisa las reglas de Firestore." : "No se pudo importar.";
  } finally {
    $("importBtn").disabled = false;
  }
});

window.addEventListener("beforeunload", (e) => {
  if (document.querySelector(".item-card.is-dirty")) e.preventDefault();
});

requireAdmin().then((email) => {
  currentEmail = email;
  loadAll();
});
