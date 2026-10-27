import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, MAPS, loadJson, escapeHtml } from "./firebase.js";
import { requireAdmin } from "./admin.js";
import { isInterno, categoryColor, pinIcon, placeLatLng, coordsFromLatLng, createMap, showFloor, floorControl } from "./map-core.js";

const $ = (id) => document.getElementById(id);
const form = $("placeForm");
let currentUid = "";
let mapId = "externo";
let data = null;
let map = null;
let floors = null;
let currentFloor = null;
let markers = [];
let draft = null;
let selected = -1;
let dirty = false;

const setMsg = (id, text) => ($(id).textContent = text);

function permissionText(e, action) {
  return e.code === "permission-denied" ? `Sin permiso para ${action}. Revisa las reglas de Firestore.` : `No se pudo ${action}.`;
}

async function saveMap() {
  const clean = JSON.parse(JSON.stringify(data));
  await setDoc(doc(db, MAPS, mapId), { ...clean, updatedBy: currentUid, updatedAt: serverTimestamp() });
  delete data.updatedAt;
  setSource(true);
}

function setSource(inFirestore) {
  $("sourceMsg").textContent = inFirestore
    ? "Estos datos están en Firestore y son los que ve la web."
    : "Este mapa aún no está en Firestore: ves el contenido del JSON actual. Se guardará en Firestore la primera vez que guardes un cambio.";
  $("sourceMsg").classList.toggle("is-warning", !inFirestore);
}

function categoriesWithOthers() {
  const names = (data.categories || []).map((c) => c.name);
  data.places.forEach((p) => {
    if (p.category && !names.includes(p.category)) names.push(p.category);
  });
  return names;
}

function fillCategorySelect(value) {
  const sel = form.elements.category;
  sel.innerHTML = categoriesWithOthers().map((n) => `<option>${escapeHtml(n)}</option>`).join("") + `<option value="">Otros</option>`;
  sel.value = value || "";
}

function renderMarkers() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  data.places.forEach((p, i) => {
    if (i === selected) return;
    if (isInterno(data) && p.floor !== currentFloor) return;
    const latlng = placeLatLng(data, p);
    if (!latlng) return;
    const m = L.marker(latlng, { icon: pinIcon(categoryColor(data, p.category)), title: p.name }).addTo(map);
    m.on("click", () => selectPlace(i));
    markers.push(m);
  });
}

function renderList() {
  const q = $("placeSearch").value.trim().toLowerCase();
  const items = data.places
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => `${p.name} ${p.category || ""} ${p.floor || ""}`.toLowerCase().includes(q))
    .sort((a, b) => (a.p.name || "").localeCompare(b.p.name || "", "es"));
  $("placeList").replaceChildren(...items.map(({ p, i }) => {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="place-item${i === selected ? " is-active" : ""}"><span class="place-title"><span class="chip-dot" style="background:${escapeHtml(categoryColor(data, p.category))}"></span>${escapeHtml(p.name || "Sin nombre")}</span><span class="place-desc">${escapeHtml([p.category, p.floor].filter(Boolean).join(" · "))}</span></button>`;
    li.querySelector("button").addEventListener("click", () => selectPlace(i));
    return li;
  }));
  $("placeCount").textContent = `${data.places.length} lugares`;
}

function readCoords() {
  const a = parseFloat(form.elements.c0.value);
  const b = parseFloat(form.elements.c1.value);
  return Number.isNaN(a) || Number.isNaN(b) ? null : [a, b];
}

function placeDraft() {
  const coords = readCoords();
  const place = { coordinates: coords };
  const latlng = coords && placeLatLng(data, place);
  if (!latlng || (isInterno(data) && form.elements.floor.value !== currentFloor)) {
    if (draft) map.removeLayer(draft);
    draft = null;
    return;
  }
  const icon = pinIcon(categoryColor(data, form.elements.category.value), { draft: true });
  if (draft) {
    draft.setLatLng(latlng).setIcon(icon);
    return;
  }
  draft = L.marker(latlng, { icon, draggable: true, zIndexOffset: 1000 }).addTo(map);
  draft.on("dragend", () => setCoords(draft.getLatLng()));
}

function setCoords(latlng) {
  const c = coordsFromLatLng(data, latlng);
  form.elements.c0.value = c[0];
  form.elements.c1.value = c[1];
  if (isInterno(data)) form.elements.floor.value = currentFloor;
  dirty = true;
  placeDraft();
}

function setFloor(id, recenter = true) {
  if (!showFloor(map, data, id)) return;
  currentFloor = id;
  floors.refresh();
  if (recenter) map.setView([data.imageSize.height / 2, data.imageSize.width / 2], map.baseZoom);
  renderMarkers();
  placeDraft();
}

function confirmDiscard() {
  return !dirty || confirm("Hay cambios sin guardar en este lugar. ¿Descartarlos?");
}

function selectPlace(i, force = false) {
  if (!force && i !== selected && !confirmDiscard()) return;
  selected = i;
  dirty = false;
  const p = i >= 0 ? data.places[i] : { name: "", category: "", description: "", coordinates: null, floor: currentFloor };
  $("formTitle").textContent = i >= 0 ? `Editar «${p.name}»` : "Nuevo lugar";
  form.elements.name.value = p.name || "";
  fillCategorySelect(p.category);
  form.elements.description.value = p.description || "";
  form.elements.c0.value = p.coordinates ? p.coordinates[0] : "";
  form.elements.c1.value = p.coordinates ? p.coordinates[1] : "";
  if (isInterno(data)) form.elements.floor.value = p.floor || currentFloor;
  else form.elements.googleUrl.value = p.googleUrl || "";
  $("deleteBtn").hidden = i < 0;
  setMsg("placeMsg", "");
  form.hidden = false;
  if (isInterno(data) && p.floor && p.floor !== currentFloor) setFloor(p.floor, false);
  renderMarkers();
  renderList();
  placeDraft();
  const latlng = placeLatLng(data, p);
  if (latlng) map.setView(latlng, Math.max(map.getZoom(), isInterno(data) ? map.baseZoom + 1 : 17));
}

function setupForm() {
  const interno = isInterno(data);
  $("c0Label").textContent = interno ? "X (píxeles)" : "Latitud";
  $("c1Label").textContent = interno ? "Y (píxeles)" : "Longitud";
  form.elements.c0.step = interno ? "1" : "any";
  form.elements.c1.step = interno ? "1" : "any";
  $("floorField").hidden = !interno;
  $("googleField").hidden = interno;
  form.elements.floor.innerHTML = (data.floors || []).map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name || f.id)}</option>`).join("");
  form.hidden = true;
}

form.addEventListener("input", (e) => {
  dirty = true;
  if (["c0", "c1", "category", "floor"].includes(e.target.name)) {
    if (e.target.name === "floor" && isInterno(data) && e.target.value !== currentFloor) setFloor(e.target.value, false);
    placeDraft();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const coords = readCoords();
  if (!coords) {
    setMsg("placeMsg", "Falta la posición: pulsa en el mapa donde está el lugar.");
    return;
  }
  const place = {
    name: form.elements.name.value.trim(),
    category: form.elements.category.value,
    description: form.elements.description.value.trim(),
    coordinates: coords
  };
  if (isInterno(data)) place.floor = form.elements.floor.value;
  else if (form.elements.googleUrl.value.trim()) place.googleUrl = form.elements.googleUrl.value.trim();
  const backup = data.places.slice();
  if (selected >= 0) data.places[selected] = place;
  else data.places.push(place);
  const index = selected >= 0 ? selected : data.places.length - 1;
  $("saveBtn").disabled = true;
  setMsg("placeMsg", "Guardando…");
  try {
    await saveMap();
    selectPlace(index, true);
    setMsg("placeMsg", "Guardado. Ya se ve en la web.");
  } catch (err) {
    console.error("[MAPA] Error al guardar", err);
    data.places = backup;
    setMsg("placeMsg", permissionText(err, "guardar"));
  } finally {
    $("saveBtn").disabled = false;
  }
});

$("deleteBtn").addEventListener("click", async () => {
  if (selected < 0) return;
  const name = data.places[selected].name;
  if (!confirm(`¿Borrar «${name}» del mapa? No se puede deshacer.`)) return;
  const backup = data.places.slice();
  data.places.splice(selected, 1);
  try {
    await saveMap();
    selected = -1;
    dirty = false;
    form.hidden = true;
    if (draft) map.removeLayer(draft);
    draft = null;
    renderMarkers();
    renderList();
    setMsg("listMsg", `«${name}» se ha quitado del mapa.`);
  } catch (err) {
    console.error("[MAPA] Error al borrar", err);
    data.places = backup;
    setMsg("placeMsg", permissionText(err, "borrar"));
  }
});

$("cancelBtn").addEventListener("click", () => {
  if (!confirmDiscard()) return;
  selected = -1;
  dirty = false;
  form.hidden = true;
  if (draft) map.removeLayer(draft);
  draft = null;
  renderMarkers();
  renderList();
});

$("addBtn").addEventListener("click", () => selectPlace(-1));
$("placeSearch").addEventListener("input", renderList);

function categoryRow(c = { name: "", color: "#a855f7" }) {
  const row = document.createElement("div");
  row.className = "category-row";
  row.innerHTML = `
    <input type="color" value="${escapeHtml(c.color)}" aria-label="Color">
    <input type="text" value="${escapeHtml(c.name)}" placeholder="Nombre" aria-label="Nombre de la categoría" required>
    <button type="button" class="btn-secondary btn-small" aria-label="Quitar categoría">Quitar</button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  return row;
}

function renderCategories() {
  $("categoryRows").replaceChildren(...(data.categories || []).map(categoryRow));
}

$("addCategoryBtn").addEventListener("click", () => {
  const row = categoryRow();
  $("categoryRows").append(row);
  row.querySelector('input[type="text"]').focus();
});

$("saveCategoriesBtn").addEventListener("click", async () => {
  const rows = [...$("categoryRows").children];
  const cats = rows.map((r) => ({ name: r.querySelector('input[type="text"]').value.trim(), color: r.querySelector('input[type="color"]').value })).filter((c) => c.name);
  const backup = data.categories;
  data.categories = cats;
  setMsg("categoryMsg", "Guardando…");
  try {
    await saveMap();
    setMsg("categoryMsg", "Categorías guardadas.");
    renderMarkers();
    renderList();
    if (!form.hidden) fillCategorySelect(form.elements.category.value);
  } catch (err) {
    console.error("[MAPA] Error al guardar categorías", err);
    data.categories = backup;
    setMsg("categoryMsg", permissionText(err, "guardar"));
  }
});

$("centerBtn").addEventListener("click", async () => {
  if (!confirm("¿Usar la vista actual del mapa como vista inicial de la web?")) return;
  const backup = JSON.parse(JSON.stringify(data.center));
  data.center.coordinates = coordsFromLatLng(data, map.getCenter());
  data.center.zoom = Math.round(map.getZoom() * 4) / 4;
  if (isInterno(data)) data.center.floor = currentFloor;
  setMsg("centerMsg", "Guardando…");
  try {
    await saveMap();
    setMsg("centerMsg", "Vista inicial guardada.");
  } catch (err) {
    console.error("[MAPA] Error al guardar la vista", err);
    data.center = backup;
    setMsg("centerMsg", permissionText(err, "guardar"));
  }
});

async function loadEditor(id) {
  mapId = id;
  selected = -1;
  dirty = false;
  draft = null;
  markers = [];
  floors = null;
  ["listMsg", "categoryMsg", "centerMsg", "placeMsg"].forEach((m) => setMsg(m, ""));
  document.querySelectorAll("[data-map]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.map === id)));
  if (map) {
    map.remove();
    map = null;
  }
  $("editorBody").hidden = true;
  setMsg("sourceMsg", "Cargando…");
  let inFirestore = false;
  try {
    const snap = await getDoc(doc(db, MAPS, id));
    if (snap.exists()) {
      data = snap.data();
      inFirestore = true;
    } else {
      data = await loadJson(`data/mapa-${id}.json`);
    }
  } catch (e) {
    console.error("[MAPA] Error al cargar", e);
    setMsg("sourceMsg", "No se pudo leer Firestore. Revisa las reglas de la colección map.");
    return;
  }
  delete data.updatedAt;
  delete data.updatedBy;
  data.places = data.places || [];
  data.categories = data.categories || [];
  setSource(inFirestore);
  $("editorBody").hidden = false;
  setupForm();
  map = createMap("map", data);
  map.on("click", (e) => {
    if (form.hidden) selectPlace(-1);
    setCoords(e.latlng);
  });
  if (isInterno(data)) {
    floors = floorControl(data, () => currentFloor, (f) => setFloor(f));
    map.addControl(floors);
    currentFloor = (data.center && data.center.floor) || data.floors[0].id;
    showFloor(map, data, currentFloor);
    floors.refresh();
  } else {
    currentFloor = null;
  }
  renderMarkers();
  renderList();
  renderCategories();
}

document.querySelectorAll("[data-map]").forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.map === mapId || !confirmDiscard()) return;
    loadEditor(tab.dataset.map);
  });
});

window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

requireAdmin().then((uid) => {
  currentUid = uid;
  loadEditor(new URLSearchParams(location.search).get("mapa") === "interno" ? "interno" : "externo");
});
