import { loadMap } from "./data.js";
import { escapeHtml } from "./firebase.js";
import { isInterno, categoryColor, pinIcon, placeLatLng, directionsUrl, createMap, showFloor, floorControl, campusesOf, campusControl } from "./map-core.js";
import { setupProposals } from "./mapa-propuestas.js";

const MAP_ID = document.body.dataset.mapa;
const search = document.getElementById("search");
const filters = document.getElementById("filters");
const list = document.getElementById("places-list");

let data;
let map;
let markers = [];
let activeCategory = "Todos";
let currentFloor = null;
let floors = null;

function menuControl() {
  const Control = L.Control.extend({
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-control leaflet-bar");
      const link = L.DomUtil.create("a", "", container);
      link.href = "#";
      link.title = "Mostrar u ocultar la lista";
      link.setAttribute("role", "button");
      link.innerHTML = "&#9776;";
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, "click", (e) => {
        L.DomEvent.preventDefault(e);
        document.body.classList.toggle("sidebar-collapsed");
        setTimeout(() => map.invalidateSize(), 300);
      });
      return container;
    }
  });
  return new Control({ position: "topleft" });
}

function filtered() {
  const q = search.value.trim().toLowerCase();
  return data.places.filter((p) => {
    const text = `${p.name || ""} ${p.description || ""} ${p.category || ""}`.toLowerCase();
    return text.includes(q) && (activeCategory === "Todos" || (p.category || "Otros") === activeCategory);
  });
}

function renderMarkers(places) {
  markers.forEach((m) => map.removeLayer(m.marker));
  markers = [];
  places.forEach((p) => {
    if (isInterno(data) && p.floor !== currentFloor) return;
    const latlng = placeLatLng(data, p);
    if (!latlng) return;
    const marker = L.marker(latlng, { icon: pinIcon(categoryColor(data, p.category)), title: p.name }).addTo(map);
    const link = isInterno(data) ? "" : `<br><a href="${escapeHtml(directionsUrl(p))}" target="_blank" rel="noopener noreferrer">¿Cómo llegar?</a>`;
    marker.bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.description)}${link}`);
    markers.push({ place: p, marker });
  });
}

function focusPlace(p) {
  if (isInterno(data) && p.floor && p.floor !== currentFloor) setFloor(p.floor, false);
  const found = markers.find((m) => m.place === p);
  if (!found) return;
  map.setView(found.marker.getLatLng(), isInterno(data) ? map.baseZoom + 2 : 18, { animate: true });
  found.marker.openPopup();
  if (window.matchMedia("(max-width: 900px)").matches) document.body.classList.add("sidebar-collapsed");
  setTimeout(() => map.invalidateSize(), 300);
}

function renderList(places) {
  if (!places.length) {
    list.innerHTML = `<li class="map-empty">No hay lugares que coincidan.</li>`;
    return;
  }
  list.replaceChildren(...places.map((p) => {
    const li = document.createElement("li");
    const floorName = isInterno(data) ? ((data.floors || []).find((f) => f.id === p.floor) || {}).name : "";
    li.innerHTML = `
      <button type="button" class="place-item">
        <span class="place-title">${escapeHtml(p.name)}</span>
        <span class="place-desc">${escapeHtml([p.category, floorName, p.description].filter(Boolean).join(" · "))}</span>
      </button>
      ${isInterno(data) ? "" : `<a class="go-link" href="${escapeHtml(directionsUrl(p))}" target="_blank" rel="noopener noreferrer">¿Cómo llegar?</a>`}`;
    li.querySelector("button").addEventListener("click", () => focusPlace(p));
    return li;
  }));
}

function apply() {
  const places = filtered();
  renderMarkers(places);
  renderList(places);
}

function buildChips() {
  const cats = ["Todos", ...new Set(data.places.map((p) => p.category || "Otros"))];
  filters.replaceChildren(...cats.map((cat) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip${cat === activeCategory ? " active" : ""}`;
    chip.setAttribute("aria-pressed", String(cat === activeCategory));
    chip.innerHTML = cat === "Todos" ? "Todos" : `<span class="chip-dot" style="background:${escapeHtml(categoryColor(data, cat))}"></span>${escapeHtml(cat)}`;
    chip.addEventListener("click", () => {
      activeCategory = cat;
      filters.querySelectorAll(".chip").forEach((c) => {
        c.classList.toggle("active", c === chip);
        c.setAttribute("aria-pressed", String(c === chip));
      });
      apply();
    });
    return chip;
  }));
}

function setFloor(id, recenter = true) {
  if (!showFloor(map, data, id)) return;
  currentFloor = id;
  if (floors) floors.refresh();
  if (recenter) {
    const center = data.center && data.center.floor === id ? placeLatLng(data, data.center) : null;
    map.setView(center || [data.imageSize.height / 2, data.imageSize.width / 2], map.baseZoom, { animate: true });
  }
  apply();
}

async function main() {
  try {
    data = await loadMap(MAP_ID);
  } catch (e) {
    console.error("[MAPA]", e);
    list.innerHTML = `<li class="map-empty">No se pudo cargar el mapa. Inténtalo de nuevo más tarde.</li>`;
    return;
  }
  data.places = data.places || [];
  map = createMap("map", data);
  map.addControl(menuControl());
  buildChips();
  search.addEventListener("input", apply);
  if (isInterno(data)) {
    floors = floorControl(data, () => currentFloor, (id) => setFloor(id));
    map.addControl(floors);
    setFloor((data.center && data.center.floor) || data.floors[0].id);
  } else {
    const campuses = campusesOf(data);
    const pins = {};
    campuses.forEach((c) => {
      pins[c.id] = L.marker(placeLatLng(data, c), { icon: pinIcon(data.defaultColor || "#a855f7", { center: true }), title: c.name, zIndexOffset: 500 })
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(c.name)}</strong><br>${escapeHtml(c.description)}`);
    });
    const goToCampus = (id) => {
      const campus = campuses.find((c) => c.id === id) || campuses[0];
      map.setView(placeLatLng(data, campus), campus.zoom || map.baseZoom);
      pins[campus.id].openPopup();
      const url = new URL(location.href);
      if (campus === campuses[0]) url.searchParams.delete("campus");
      else url.searchParams.set("campus", campus.id);
      history.replaceState(null, "", url);
    };
    const wanted = campuses.find((c) => c.id === new URLSearchParams(location.search).get("campus"));
    if (campuses.length > 1) map.addControl(campusControl(campuses, (wanted || campuses[0]).id, goToCampus));
    if (wanted && wanted !== campuses[0]) goToCampus(wanted.id);
    apply();
    setupProposals(map, data);
  }
}

main();
