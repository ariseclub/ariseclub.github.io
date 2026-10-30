import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, MAPS, PROPOSALS, loadJson, escapeHtml } from "./firebase.js";
import { requireAdmin } from "./admin.js";
import { isInterno, categoryColor, pinIcon, placeLatLng, coordsFromLatLng, coordsFromGoogleUrl, createMap, showFloor, floorControl, slugify, campusesOf, campusControl } from "./map-core.js";

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
let proposals = [];
let reviewing = null;
let campusDraft = [];
let campusPins = [];
let campusCtl = null;

const setMsg = (id, text) => ($(id).textContent = text);

function permissionText(e, action) {
  return e.code === "permission-denied" ? `Sin permiso para ${action}. Revisa las reglas de Firestore.` : `No se pudo ${action}.`;
}

function mapPayload() {
  return { ...JSON.parse(JSON.stringify(data)), updatedBy: currentUid, updatedAt: serverTimestamp() };
}

async function saveMap() {
  await setDoc(doc(db, MAPS, mapId), mapPayload());
  setSource(true);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return value instanceof Date ? value : null;
}

function formatWhen(value) {
  const date = toDate(value);
  return date ? date.toLocaleString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "sin fecha";
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
  const names = categoriesWithOthers();
  if (value && !names.includes(value)) names.push(value);
  sel.innerHTML = names.map((n) => `<option>${escapeHtml(n)}</option>`).join("") + `<option value="">Otros</option>`;
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

function setFormMode() {
  $("saveBtn").textContent = reviewing ? "Aprobar y publicar" : "Guardar lugar";
  $("deleteBtn").textContent = reviewing ? "Rechazar" : "Borrar";
  $("deleteBtn").hidden = !reviewing && selected < 0;
  $("formMeta").hidden = !reviewing;
  if (reviewing) {
    const author = reviewing.author_name || reviewing.author_email || "alguien sin nombre";
    const email = reviewing.author_name && reviewing.author_email ? ` (${reviewing.author_email})` : "";
    $("formMeta").textContent = `Enviada por ${author}${email} el ${formatWhen(reviewing.created_at)}.`;
  }
}

function selectPlace(i, force = false) {
  if (!force && (i !== selected || reviewing) && !confirmDiscard()) return;
  selected = i;
  dirty = false;
  reviewing = null;
  const p = i >= 0 ? data.places[i] : { name: "", category: "", description: "", coordinates: null, floor: currentFloor };
  $("formTitle").textContent = i >= 0 ? `Editar «${p.name}»` : "Nuevo lugar";
  form.elements.name.value = p.name || "";
  fillCategorySelect(p.category);
  form.elements.description.value = p.description || "";
  form.elements.c0.value = p.coordinates ? p.coordinates[0] : "";
  form.elements.c1.value = p.coordinates ? p.coordinates[1] : "";
  if (isInterno(data)) form.elements.floor.value = p.floor || currentFloor;
  else form.elements.googleUrl.value = p.googleUrl || "";
  setFormMode();
  setMsg("placeMsg", "");
  form.hidden = false;
  if (isInterno(data) && p.floor && p.floor !== currentFloor) setFloor(p.floor, false);
  renderMarkers();
  renderList();
  renderProposals();
  placeDraft();
  const latlng = placeLatLng(data, p);
  if (latlng) map.setView(latlng, Math.max(map.getZoom(), isInterno(data) ? map.baseZoom + 1 : 17));
}

function closeForm() {
  selected = -1;
  reviewing = null;
  dirty = false;
  form.hidden = true;
  if (draft) map.removeLayer(draft);
  draft = null;
  renderMarkers();
  renderList();
  renderProposals();
}

function reviewProposal(prop) {
  if (prop === reviewing || !confirmDiscard()) return;
  selectPlace(-1, true);
  reviewing = prop;
  $("formTitle").textContent = `Propuesta: «${prop.name || "Sin nombre"}»`;
  form.elements.name.value = prop.name || "";
  fillCategorySelect(prop.category);
  form.elements.description.value = prop.description || "";
  form.elements.c0.value = Array.isArray(prop.coordinates) ? prop.coordinates[0] : "";
  form.elements.c1.value = Array.isArray(prop.coordinates) ? prop.coordinates[1] : "";
  form.elements.googleUrl.value = prop.googleUrl || "";
  setFormMode();
  renderProposals();
  placeDraft();
  const latlng = placeLatLng(data, prop);
  if (latlng) map.setView(latlng, Math.max(map.getZoom(), 17));
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderProposals() {
  const panel = $("proposalPanel");
  panel.hidden = isInterno(data);
  if (panel.hidden) return;
  panel.classList.toggle("panel-notice", proposals.length > 0);
  $("proposalCount").textContent = proposals.length === 1 ? "1 pendiente" : `${proposals.length} pendientes`;
  if (!proposals.length) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "No hay propuestas pendientes.";
    $("proposalList").replaceChildren(li);
    return;
  }
  $("proposalList").replaceChildren(...proposals.map((prop) => {
    const li = document.createElement("li");
    const info = [prop.category || "Otros", prop.author_name || prop.author_email, formatWhen(prop.created_at)].filter(Boolean).join(" · ");
    li.innerHTML = `<button type="button" class="place-item${prop === reviewing ? " is-active" : ""}"><span class="place-title"><span class="chip-dot" style="background:${escapeHtml(categoryColor(data, prop.category))}"></span>${escapeHtml(prop.name || "Sin nombre")}</span><span class="place-desc">${escapeHtml(info)}</span></button>`;
    li.querySelector("button").addEventListener("click", () => reviewProposal(prop));
    return li;
  }));
}

async function loadProposals() {
  proposals = [];
  setMsg("proposalMsg", "");
  if (isInterno(data)) return renderProposals();
  try {
    const snap = await getDocs(collection(db, PROPOSALS));
    proposals = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(a.created_at)?.getTime() ?? Infinity) - (toDate(b.created_at)?.getTime() ?? Infinity));
  } catch (e) {
    console.error("[MAPA] Error al leer las propuestas", e);
    setMsg("proposalMsg", "No se pudieron leer las propuestas. Revisa la regla de map_proposals en Firestore.");
  }
  renderProposals();
}

async function approveProposal(place) {
  const prop = reviewing;
  const backup = data.places.slice();
  data.places.push(place);
  const batch = writeBatch(db);
  batch.set(doc(db, MAPS, mapId), mapPayload());
  batch.delete(doc(db, PROPOSALS, prop.id));
  await batch.commit().catch((err) => {
    data.places = backup;
    throw err;
  });
  proposals = proposals.filter((p) => p !== prop);
  setSource(true);
  return data.places.length - 1;
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
  $("saveBtn").disabled = true;
  if (reviewing) {
    setMsg("placeMsg", "Publicando…");
    try {
      const index = await approveProposal(place);
      selectPlace(index, true);
      setMsg("placeMsg", "Aprobada y publicada. Ya se ve en la web.");
    } catch (err) {
      console.error("[MAPA] Error al aprobar la propuesta", err);
      setMsg("placeMsg", permissionText(err, "aprobar la propuesta"));
    } finally {
      $("saveBtn").disabled = false;
    }
    return;
  }
  const backup = data.places.slice();
  if (selected >= 0) data.places[selected] = place;
  else data.places.push(place);
  const index = selected >= 0 ? selected : data.places.length - 1;
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

async function rejectProposal() {
  const prop = reviewing;
  if (!confirm(`¿Rechazar la propuesta «${prop.name || "Sin nombre"}»? Se borrará y no se puede deshacer.`)) return;
  $("deleteBtn").disabled = true;
  setMsg("placeMsg", "Rechazando…");
  try {
    await deleteDoc(doc(db, PROPOSALS, prop.id));
    proposals = proposals.filter((p) => p !== prop);
    closeForm();
    setMsg("placeMsg", "");
    setMsg("proposalMsg", `Propuesta «${prop.name || "Sin nombre"}» rechazada.`);
  } catch (err) {
    console.error("[MAPA] Error al rechazar la propuesta", err);
    setMsg("placeMsg", permissionText(err, "rechazar la propuesta"));
  } finally {
    $("deleteBtn").disabled = false;
  }
}

$("deleteBtn").addEventListener("click", async () => {
  if (reviewing) return rejectProposal();
  if (selected < 0) return;
  const name = data.places[selected].name;
  if (!confirm(`¿Borrar «${name}» del mapa? No se puede deshacer.`)) return;
  const backup = data.places.slice();
  data.places.splice(selected, 1);
  try {
    await saveMap();
    closeForm();
    setMsg("listMsg", `«${name}» se ha quitado del mapa.`);
  } catch (err) {
    console.error("[MAPA] Error al borrar", err);
    data.places = backup;
    setMsg("placeMsg", permissionText(err, "borrar"));
  }
});

$("cancelBtn").addEventListener("click", () => {
  if (confirmDiscard()) closeForm();
});

form.elements.googleUrl.addEventListener("input", () => {
  const coords = !isInterno(data) && coordsFromGoogleUrl(form.elements.googleUrl.value);
  if (!coords) return;
  form.elements.c0.value = coords[0];
  form.elements.c1.value = coords[1];
  placeDraft();
  map.setView(coords, Math.max(map.getZoom(), 17));
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

function campusRow(c, i) {
  const row = document.createElement("div");
  row.className = "campus-row";
  const coords = Array.isArray(c.coordinates) ? `${c.coordinates[0]}, ${c.coordinates[1]} · zoom ${c.zoom}` : "Sin posición";
  row.innerHTML = `
    <div class="campus-row-head">
      ${i === 0 ? '<span class="item-badge">Principal</span>' : '<button type="button" class="btn-secondary btn-small" data-act="main">Hacer principal</button>'}
      <small class="campus-coords">${escapeHtml(coords)}</small>
    </div>
    <input type="text" data-field="name" value="${escapeHtml(c.name || "")}" placeholder="Nombre del campus" aria-label="Nombre del campus" maxlength="120">
    <input type="text" data-field="description" value="${escapeHtml(c.description || "")}" placeholder="Dirección o descripción" aria-label="Descripción del campus" maxlength="300">
    <div class="campus-actions">
      <button type="button" class="btn-secondary btn-small" data-act="view">Ver</button>
      <button type="button" class="btn-secondary btn-small" data-act="here">Usar esta vista</button>
      ${campusDraft.length > 1 ? '<button type="button" class="btn-secondary btn-small btn-danger" data-act="remove">Quitar</button>' : ""}
    </div>`;
  row.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => (c[input.dataset.field] = input.value)));
  row.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", () => {
    const act = btn.dataset.act;
    if (act === "view") return map.setView(c.coordinates, c.zoom || map.baseZoom);
    if (act === "here") {
      c.coordinates = coordsFromLatLng(data, map.getCenter());
      c.zoom = Math.round(map.getZoom() * 4) / 4;
    }
    if (act === "main") campusDraft.unshift(...campusDraft.splice(i, 1));
    if (act === "remove") campusDraft.splice(i, 1);
    setMsg("campusMsg", "Pulsa «Guardar campus» para que se vea en la web.");
    renderCampuses();
  }));
  return row;
}

function renderCampuses() {
  $("campusRows").replaceChildren(...campusDraft.map(campusRow));
  campusPins.forEach((m) => map.removeLayer(m));
  campusPins = campusDraft.filter((c) => Array.isArray(c.coordinates)).map((c) => L.marker(c.coordinates, { icon: pinIcon(data.defaultColor || "#a855f7", { center: true }), title: c.name, interactive: false, keyboard: false }).addTo(map));
}

function addCampusControl() {
  if (campusCtl) map.removeControl(campusCtl);
  campusCtl = null;
  const campuses = campusesOf(data);
  if (campuses.length < 2) return;
  campusCtl = campusControl(campuses, campuses[0].id, (id) => {
    const c = campuses.find((x) => x.id === id);
    if (c) map.setView(c.coordinates, c.zoom || map.baseZoom);
  });
  map.addControl(campusCtl);
}

function setupCampuses() {
  const interno = isInterno(data);
  $("campusPanel").hidden = interno;
  $("viewPanel").hidden = !interno;
  campusPins = [];
  campusCtl = null;
  if (interno) return;
  campusDraft = JSON.parse(JSON.stringify(campusesOf(data)));
  renderCampuses();
  addCampusControl();
}

$("addCampusBtn").addEventListener("click", () => {
  campusDraft.push({ id: "", name: "", description: "", coordinates: coordsFromLatLng(data, map.getCenter()), zoom: Math.round(map.getZoom() * 4) / 4 });
  renderCampuses();
  setMsg("campusMsg", "Mueve el mapa hasta el nuevo campus, pulsa «Usar esta vista», ponle nombre y guarda.");
  $("campusRows").lastElementChild.querySelector('[data-field="name"]').focus();
});

$("saveCampusBtn").addEventListener("click", async () => {
  const list = campusDraft.map((c) => ({ name: (c.name || "").trim(), description: (c.description || "").trim(), coordinates: c.coordinates, zoom: c.zoom || map.baseZoom }));
  if (!list.length || list.some((c) => !c.name)) {
    setMsg("campusMsg", "Cada campus necesita un nombre.");
    return;
  }
  const used = new Set();
  const campuses = list.map((c) => {
    let id = slugify(c.name);
    for (let n = 2; used.has(id); n++) id = `${slugify(c.name)}-${n}`;
    used.add(id);
    return { id, ...c };
  });
  const backup = { campuses: data.campuses, center: data.center };
  data.campuses = campuses;
  data.center = { ...data.center, name: campuses[0].name, description: campuses[0].description, coordinates: campuses[0].coordinates, zoom: campuses[0].zoom };
  setMsg("campusMsg", "Guardando…");
  try {
    await saveMap();
    campusDraft = JSON.parse(JSON.stringify(campuses));
    renderCampuses();
    addCampusControl();
    setMsg("campusMsg", "Campus guardados. Ya se ven en la web.");
  } catch (err) {
    console.error("[MAPA] Error al guardar los campus", err);
    if (backup.campuses === undefined) delete data.campuses;
    else data.campuses = backup.campuses;
    data.center = backup.center;
    setMsg("campusMsg", permissionText(err, "guardar"));
  }
});

async function loadEditor(id) {
  mapId = id;
  selected = -1;
  reviewing = null;
  proposals = [];
  dirty = false;
  draft = null;
  markers = [];
  floors = null;
  ["listMsg", "categoryMsg", "centerMsg", "placeMsg", "proposalMsg", "campusMsg"].forEach((m) => setMsg(m, ""));
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
  setupCampuses();
  loadProposals();
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
