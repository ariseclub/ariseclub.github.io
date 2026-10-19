export const isInterno = (data) => !!data.imageSize;

export function categoryColor(data, category) {
  const fallback = data.defaultColor || "#a855f7";
  const match = (data.categories || []).find((c) => c.name === (category || "Otros"));
  return match ? match.color : fallback;
}

export function pinIcon(color, { center = false, draft = false } = {}) {
  const size = center ? 30 : 26;
  const border = center ? "#ffffff" : "rgba(0,0,0,0.65)";
  return L.divIcon({
    className: `custom-pin-icon${draft ? " marker-draft" : ""}`,
    html: `<div class="marker-pin" style="background:${color};border-color:${border};width:${size}px;height:${size}px;"><div class="marker-inner"></div></div>`,
    iconSize: [size, size + 6],
    iconAnchor: [size / 2, size + 2],
    popupAnchor: [0, -size / 2]
  });
}

export function placeLatLng(data, place) {
  const c = place && place.coordinates;
  if (!Array.isArray(c) || c.length < 2 || c.some((v) => typeof v !== "number" || Number.isNaN(v))) return null;
  return isInterno(data) ? [data.imageSize.height - c[1], c[0]] : [c[0], c[1]];
}

export function coordsFromLatLng(data, latlng) {
  if (isInterno(data)) return [Math.round(latlng.lng), Math.round(data.imageSize.height - latlng.lat)];
  return [Number(latlng.lat.toFixed(7)), Number(latlng.lng.toFixed(7))];
}

export function directionsUrl(place) {
  const c = place.coordinates;
  if (Array.isArray(c) && c.length >= 2) return `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${c[0]},${c[1]}`;
  if (place.googleUrl) return place.googleUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || "")}`;
}

export function createMap(el, data) {
  if (isInterno(data)) {
    const zoom = typeof data.center?.zoom === "number" ? data.center.zoom : 0;
    const map = L.map(el, { crs: L.CRS.Simple, minZoom: zoom - 2, maxZoom: zoom + 2, zoomSnap: 0.25 });
    map.imageBounds = [[0, 0], [data.imageSize.height, data.imageSize.width]];
    map.baseZoom = zoom;
    map.setView(placeLatLng(data, data.center) || [data.imageSize.height / 2, data.imageSize.width / 2], zoom);
    return map;
  }
  const map = L.map(el).setView(placeLatLng(data, data.center), data.center.zoom || 15);
  map.baseZoom = data.center.zoom || 15;
  L.tileLayer("https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.{ext}", {
    maxZoom: 20,
    minZoom: 14,
    ext: "png",
    attribution: "&copy; OpenStreetMap contributors &copy; Stadia Maps"
  }).addTo(map);
  return map;
}

export function showFloor(map, data, floorId) {
  const floor = (data.floors || []).find((f) => f.id === floorId);
  if (!floor) return false;
  if (map.floorOverlay) map.removeLayer(map.floorOverlay);
  map.floorOverlay = L.imageOverlay(floor.image, map.imageBounds).addTo(map);
  return true;
}

export function floorControl(data, getCurrent, onSelect) {
  const Control = L.Control.extend({
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-control leaflet-bar");
      (data.floors || []).forEach((floor, i) => {
        const link = L.DomUtil.create("a", "", container);
        link.href = "#";
        link.title = floor.name || `Planta ${i + 1}`;
        link.setAttribute("role", "button");
        link.textContent = `P${i + 1}`;
        link.dataset.floorId = floor.id;
        L.DomEvent.disableClickPropagation(link);
        L.DomEvent.on(link, "click", (e) => {
          L.DomEvent.preventDefault(e);
          onSelect(floor.id);
        });
      });
      this.refresh = () => {
        Array.from(container.children).forEach((a) => a.classList.toggle("active-floor", a.dataset.floorId === getCurrent()));
      };
      this.refresh();
      return container;
    }
  });
  return new Control({ position: "topleft" });
}
