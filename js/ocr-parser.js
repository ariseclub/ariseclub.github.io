export const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes"];

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DAY_HINTS = [
  ["lunes", "unes"],
  ["martes", "artes"],
  ["miercoles", "ercoles", "rcoles"],
  ["jueves", "ueves"],
  ["viernes", "iernes", "ernes"]
];

function dayOf(word) {
  const w = norm(word).replace(/[^a-z]/g, "");
  if (w.length < 4) return -1;
  return DAY_HINTS.findIndex((hints) => hints.some((h) => w.includes(h)));
}

const centerX = (b) => (b.x0 + b.x1) / 2;

export function findColumns(words) {
  const found = new Map();
  for (const w of words) {
    if (w.confidence < 60) continue;
    const i = dayOf(w.text);
    if (i >= 0 && !found.has(i)) found.set(i, w.bbox);
  }
  if (found.size < 2) return null;

  const pts = [...found].map(([i, b]) => [i, centerX(b)]);
  const n = pts.length;
  const mi = pts.reduce((s, p) => s + p[0], 0) / n;
  const mx = pts.reduce((s, p) => s + p[1], 0) / n;
  const slope = pts.reduce((s, p) => s + (p[0] - mi) * (p[1] - mx), 0) /
                pts.reduce((s, p) => s + (p[0] - mi) ** 2, 0);
  const centers = DAYS.map((_, i) => found.has(i) ? centerX(found.get(i)) : mx + slope * (i - mi));

  const headerBottom = Math.max(...[...found.values()].map((b) => b.y1));
  const headerHeight = Math.max(...[...found.values()].map((b) => b.y1 - b.y0));
  return { centers, spacing: slope, headerBottom, headerHeight, found: [...found.keys()] };
}

export function findPostre(lines) {
  const line = lines.find((l) => /\bpostres?\s*:/.test(norm(l.text)));
  if (!line) return null;
  const text = line.text
    .replace(/^.*?\bpostres?\s*:\s*/i, "")
    .replace(/(\s+[^\p{L}\s]+)+\s*$/u, "")
    .trim();
  return { text: capitalize(text), bbox: line.bbox };
}

export function findPrice(lines) {
  const line = lines.find((l) => /\d\s*€|€\s*\d/.test(l.text));
  if (!line) return null;
  const text = line.text.trim()
    .replace(/^(\S{1,2}\s+)+(?=\p{L}{3})/u, "")
    .replace(/(\s+[^\s)]{1,2})+$/u, "");
  return { text, bbox: line.bbox };
}

export function findCell(cols, dayIndex, bottomY, imageWidth) {
  const c = cols.centers[dayIndex];
  const half = Math.abs(cols.spacing) / 2;
  const left = Math.max(0, Math.round(c - half));
  const right = Math.min(imageWidth, Math.round(c + half));
  const top = Math.round(cols.headerBottom + cols.headerHeight * 0.5);
  const bottom = Math.round(bottomY - cols.headerHeight * 0.3);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

export function cleanCell(lines) {
  const letters = (t) => t.replace(/^[^\p{L}(]+|[^\p{L})]+$/gu, "");
  const joined = lines
    .filter((l) => l.words.some((w) => w.confidence >= 60 && /\p{L}{3}/u.test(w.text)))
    .flatMap((l) => l.words)
    .filter((w) => w.confidence >= 60)
    .map((w) => letters(w.text))
    .filter((t) => /\p{L}/u.test(t))
    .join(" ")
    .trim();
  if (/^festivo$/i.test(joined)) return "Festivo";
  return capitalize(joined === joined.toUpperCase() ? joined.toLowerCase() : joined);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function findWeek(text, fallbackYear) {
  const m = norm(text).replace(/\s+/g, " ").match(/\bal (\d{1,2}) de ([a-z]{4,})(?: de (\d{4}))?/);
  if (!m) return null;
  const month = MONTHS.findIndex((name) => m[2].startsWith(name.slice(0, 4)));
  if (month < 0) return null;
  const friday = new Date(m[3] ? Number(m[3]) : fallbackYear, month, Number(m[1]));
  if (friday.getDay() !== 5) return null;
  friday.setDate(friday.getDate() - 4);
  const pad = (n) => String(n).padStart(2, "0");
  return `${friday.getFullYear()}-${pad(friday.getMonth() + 1)}-${pad(friday.getDate())}`;
}
