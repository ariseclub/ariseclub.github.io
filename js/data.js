import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, ATELIERS, MEETINGS, MAPS, loadJson, toISODate } from "./firebase.js";

async function loadCollection(name, fallback) {
  try {
    const snap = await getDocs(collection(db, name));
    if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(`[DATOS] No se pudo leer ${name} de Firestore, se usa ${fallback}`, e.code || e);
  }
  return loadJson(fallback);
}

export async function loadAteliers() {
  const items = await loadCollection(ATELIERS, "data/ateliers.json");
  return items.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

export function meetingState(m, today = toISODate(new Date())) {
  if (m.cancelada) return "canceled";
  return m.fecha < today ? "past" : "future";
}

export async function loadMeetings() {
  const items = await loadCollection(MEETINGS, "data/meetings.json");
  const today = toISODate(new Date());
  const future = items.filter((m) => m.fecha >= today).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const past = items.filter((m) => m.fecha < today).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return [...future, ...past];
}

export async function loadMap(id) {
  try {
    const snap = await getDoc(doc(db, MAPS, id));
    if (snap.exists()) return snap.data();
  } catch (e) {
    console.warn(`[DATOS] No se pudo leer ${MAPS}/${id} de Firestore, se usa el JSON`, e.code || e);
  }
  return loadJson(`data/mapa-${id}.json`);
}
