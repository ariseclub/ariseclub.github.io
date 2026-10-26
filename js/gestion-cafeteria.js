import { doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, MENUS, POSTRE, PRECIO_DEFECTO, DAY_NAMES, toISODate, fromISODate, addDays, mondayOf } from "./firebase.js";
import { requireAdmin } from "./admin.js";
import { findColumns, findPostre, findPrice, findCell, findWeek, cleanCell } from "./ocr-parser.js";

const $ = (id) => document.getElementById(id);
let currentUid = "";
let monday = mondayOf(toISODate(new Date()));

requireAdmin().then((uid) => {
  currentUid = uid;
  setWeek(monday);
});

$("postreFijo").textContent = POSTRE;
$("priceInput").value = PRECIO_DEFECTO;

const weekDates = () => DAY_NAMES.map((_, i) => addDays(monday, i));
const shortDate = (s) => fromISODate(s).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
const dayInput = (i) => $(`plato-${i}`);
const festivoBox = (i) => $(`festivo-${i}`);
const isFestivo = (plato) => /^festivo$/i.test(plato);
let dirty = false;

const grid = $("weekGrid");
DAY_NAMES.forEach((name, i) => {
  const row = document.createElement("div");
  row.className = "day-row";
  row.innerHTML = `
    <span class="day-name">${name}</span>
    <label class="festivo-label"><input type="checkbox" id="festivo-${i}"> Festivo</label>
    <input type="text" id="plato-${i}" placeholder="Plato del día">
    <span class="date-label" id="date-${i}"></span>
  `;
  grid.append(row);
  dayInput(i).addEventListener("input", () => (dirty = true));
  festivoBox(i).addEventListener("change", () => {
    setFestivo(i, festivoBox(i).checked);
    dirty = true;
  });
});

function setFestivo(i, on, plato = "") {
  festivoBox(i).checked = on;
  dayInput(i).disabled = on;
  dayInput(i).value = on ? "Festivo" : plato;
  dayInput(i).closest(".day-row").classList.toggle("is-festivo", on);
}

function readWeek() {
  return DAY_NAMES.map((_, i) => (festivoBox(i).checked ? "Festivo" : dayInput(i).value.trim()));
}

function fillWeek(platos) {
  DAY_NAMES.forEach((_, i) => setFestivo(i, isFestivo(platos[i] || ""), platos[i] || ""));
}

function weekText(dates) {
  const [first, last] = [fromISODate(dates[0]), fromISODate(dates[4])];
  const from = first.getMonth() === last.getMonth() ? first.getDate() : shortDate(dates[0]);
  return `${from} al ${shortDate(dates[4])}`;
}

async function setWeek(newMonday, load = true) {
  monday = newMonday;
  const dates = weekDates();
  dates.forEach((d, i) => ($(`date-${i}`).textContent = shortDate(d)));
  $("weekLabel").textContent = weekText(dates);
  $("thisWeekBtn").hidden = monday === mondayOf(toISODate(new Date()));
  if (load) await loadWeek();
}

function goToWeek(newMonday) {
  if (dirty && !confirm("Hay cambios sin guardar en esta semana. ¿Cambiar de semana igualmente?")) return;
  setWeek(newMonday);
}

$("prevWeek").addEventListener("click", () => goToWeek(addDays(monday, -7)));
$("nextWeek").addEventListener("click", () => goToWeek(addDays(monday, 7)));
$("thisWeekBtn").addEventListener("click", () => goToWeek(mondayOf(toISODate(new Date()))));
$("priceInput").addEventListener("input", () => (dirty = true));
$("clearBtn").addEventListener("click", () => {
  if (confirm("¿Vaciar los platos de la semana? (No se borra nada hasta que guardes)")) {
    fillWeek([]);
    dirty = true;
  }
});

const platoOf = (data) => (data.plato || (data.primeros || []).join(", ")).trim();
let savedDates = new Set();
let loading = 0;

async function loadWeek() {
  const token = ++loading;
  $("saveMsg").textContent = "";
  dirty = false;
  try {
    const dates = weekDates();
    const snaps = await Promise.all(dates.map((d) => getDoc(doc(db, MENUS, d))));
    if (token !== loading) return;
    savedDates = new Set(dates.filter((_, i) => snaps[i].exists()));
    fillWeek(snaps.map((s) => (s.exists() ? platoOf(s.data()) : "")));
    const saved = snaps.find((s) => s.exists() && s.data().precio);
    $("priceInput").value = saved ? saved.data().precio : PRECIO_DEFECTO;
    if (savedDates.size) $("saveMsg").textContent = `Cargados ${savedDates.size} días ya guardados de esta semana.`;
  } catch (e) {
    if (token !== loading) return;
    console.error("[MENU] Error al cargar", e);
    $("saveMsg").textContent = "No se pudo cargar el menú de esta semana.";
  }
}

$("saveBtn").addEventListener("click", async () => {
  const platos = readWeek();
  const dates = weekDates();
  const precio = $("priceInput").value.trim().replace(/\s*€$/, "") || PRECIO_DEFECTO;
  const borrar = dates.filter((d, i) => !platos[i] && savedDates.has(d));
  if (platos.every((p) => !p) && !borrar.length) {
    $("saveMsg").textContent = "No hay ningún plato que guardar.";
    return;
  }
  $("saveBtn").disabled = true;
  $("saveMsg").textContent = "Guardando…";
  try {
    const batch = writeBatch(db);
    let n = 0;
    platos.forEach((plato, i) => {
      if (!plato) return;
      batch.set(doc(db, MENUS, dates[i]), { fecha: dates[i], plato, precio, updatedBy: currentUid, updatedAt: serverTimestamp() });
      n++;
    });
    borrar.forEach((d) => batch.delete(doc(db, MENUS, d)));
    await batch.commit();
    dirty = false;
    savedDates = new Set(dates.filter((_, i) => platos[i]));
    const partes = [];
    if (n) partes.push(`Guardados ${n} ${n === 1 ? "día" : "días"} de la semana del ${shortDate(dates[0])}.`);
    if (borrar.length) {
      const nombres = borrar.map((d) => DAY_NAMES[dates.indexOf(d)].toLowerCase());
      partes.push(`Sin plato, se quita del menú: ${nombres.join(", ")}.`);
    }
    $("saveMsg").textContent = partes.join(" ");
  } catch (e) {
    console.error("[MENU] Error al guardar", e);
    $("saveMsg").textContent = e.code === "permission-denied" ? "Sin permiso para guardar. Revisa las reglas de Firestore." : "No se pudo guardar el menú.";
  } finally {
    $("saveBtn").disabled = false;
  }
});
