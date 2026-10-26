import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  db, MENUS, POSTRE, PRECIO_DEFECTO, DAY_NAMES,
  toISODate, fromISODate, addDays, mondayOf, formatLongDate
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

const weekdayOf = (s) => (fromISODate(s).getDay() % 6 === 0 ? mondayOf(s) : s);
const today = () => weekdayOf(toISODate(new Date()));

const param = new URLSearchParams(location.search).get("fecha") || "";
let current = /^\d{4}-\d{2}-\d{2}$/.test(param) ? weekdayOf(param) : today();
let monday = "";
let week = {};
let loading = 0;

const platoOf = (data) => (data ? (data.plato || (data.primeros || []).join(", ")).trim() : "");
const isFestivo = (plato) => /^festivo$/i.test(plato);
const dayTitle = (s) => fromISODate(s).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, c => c.toUpperCase()).replace(/\bde\s+(\w)/, (_, p) => "de " + p.toUpperCase());

const chips = DAY_NAMES.map((name, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "day-chip";
  b.innerHTML = `<span>${name.slice(0, 3)}</span><strong></strong>`;
  b.addEventListener("click", () => select(addDays(monday, i)));
  $("weekDays").append(b);
  return b;
});

function renderChips() {
  chips.forEach((b, i) => {
    const date = addDays(monday, i);
    const plato = platoOf(week[date]);
    b.querySelector("strong").textContent = fromISODate(date).getDate();
    b.setAttribute("aria-label", formatLongDate(date));
    b.setAttribute("aria-pressed", String(date === current));
    b.classList.toggle("is-selected", date === current);
    b.classList.toggle("is-today", date === toISODate(new Date()));
    b.classList.toggle("is-festivo", isFestivo(plato));
    b.classList.toggle("has-menu", !!plato && !isFestivo(plato));
  });
}

function renderDay() {
  $("dateLabel").textContent = dayTitle(current);
  const data = week[current];
  const plato = platoOf(data);
  const festivo = isFestivo(plato);

  $("status").hidden = !!plato;
  $("status").textContent = "Todavía no hay menú publicado para este día.";
  $("festivo").hidden = !festivo;
  $("menu").hidden = !plato || festivo;
  if (plato && !festivo) {
    $("plato").textContent = plato;
    $("postre").textContent = POSTRE;
    $("price").textContent = `${data.precio || PRECIO_DEFECTO} €`;
  }
}

async function loadWeek() {
  const token = ++loading;
  week = {};
  renderChips();
  $("dateLabel").textContent = dayTitle(current);
  $("status").hidden = false;
  $("status").textContent = "Cargando menú…";
  $("menu").hidden = true;
  $("festivo").hidden = true;

  try {
    const dates = DAY_NAMES.map((_, i) => addDays(monday, i));
    const snaps = await Promise.all(dates.map((d) => getDoc(doc(db, MENUS, d))));
    if (token !== loading) return;
    dates.forEach((d, i) => (week[d] = snaps[i].exists() ? snaps[i].data() : null));
    renderChips();
    renderDay();
  } catch (e) {
    if (token !== loading) return;
    console.error("[MENU] Error al cargar", e);
    $("status").textContent = "No se pudo cargar el menú. Inténtalo de nuevo más tarde.";
  }
}

function select(date) {
  current = date;
  history.replaceState(null, "", date === today() ? location.pathname : `?fecha=${date}`);
  const newMonday = mondayOf(date);
  if (newMonday !== monday) {
    monday = newMonday;
    loadWeek();
  } else {
    renderChips();
    renderDay();
  }
}

$("prevWeek").addEventListener("click", () => select(addDays(current, -7)));
$("nextWeek").addEventListener("click", () => select(addDays(current, 7)));
$("todayBtn").addEventListener("click", () => select(today()));

select(current);
