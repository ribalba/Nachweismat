/*
 * Stundennachweis-Generator – Logik
 *
 * Erzeugt pro Monat einen Stundennachweis mit vollen Stunden und etwas
 * Zufall, berücksichtigt Wochenenden, Feiertage des gewählten Bundeslandes
 * und Krankheitstage. Export als Excel (.xlsx) via SheetJS.
 */

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WOCHENTAGE = [
  "Sonntag", "Montag", "Dienstag", "Mittwoch",
  "Donnerstag", "Freitag", "Samstag",
];
const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
// Kalender-Reihenfolge: Montag zuerst
const KALENDER_KOPF = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// --- Zufalls-Hilfsfunktionen -------------------------------------------------

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Parst ein einzelnes Datum (TT.MM.JJJJ oder JJJJ-MM-TT) und liefert den
 * ISO-String (YYYY-MM-DD) oder null, wenn das Token kein Datum ist.
 */
function parseSingleDate(token) {
  let m;
  if ((m = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  }
  if ((m = token.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) {
    return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  }
  return null;
}

/** Wandelt einen ISO-String (YYYY-MM-DD) in ein lokales Date um. */
function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Liest eine freie Datums-Eingabe (durch Komma/Semikolon/Zeilenumbruch/Leerzeichen
 * getrennt) und liefert ein Set von ISO-Daten (YYYY-MM-DD).
 * Akzeptiert TT.MM.JJJJ und JJJJ-MM-TT.
 */
function parseSickDates(text) {
  const set = new Set();
  if (!text) return set;
  const tokens = text.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const t of tokens) {
    const iso = parseSingleDate(t);
    if (iso) set.add(iso);
  }
  return set;
}

/**
 * Liest Urlaubs-Eingaben: einzelne Tage und Zeiträume (durch Komma/Semikolon/
 * Zeilenumbruch getrennt). Ein Zeitraum wird per Bindestrich angegeben, z. B.
 * "15.07.2025 - 26.07.2025". Liefert ein Set aller Kalendertage (YYYY-MM-DD);
 * Wochenenden/Feiertage werden erst später beim Abgleich gefiltert.
 */
function parseVacationRanges(text) {
  const set = new Set();
  if (!text) return set;

  const expand = (isoA, isoB) => {
    let d = isoToDate(isoA);
    const end = isoToDate(isoB);
    let guard = 0;
    while (d <= end && guard < 1000) {
      set.add(window.dateUtils.toISO(d));
      d = window.dateUtils.addDays(d, 1);
      guard++;
    }
  };

  const entries = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    let m;
    // Deutsches Format mit Bindestrich: TT.MM.JJJJ - TT.MM.JJJJ
    if ((m = entry.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–]\s*(\d{1,2}\.\d{1,2}\.\d{4})$/))) {
      const a = parseSingleDate(m[1]);
      const b = parseSingleDate(m[2]);
      if (a && b) { expand(a, b); continue; }
    }
    // Generisch (z. B. ISO-Zeiträume), durch " - " oder "bis" getrennt
    if ((m = entry.match(/^(.+?)\s+(?:-|–|bis)\s+(.+)$/i))) {
      const a = parseSingleDate(m[1].trim());
      const b = parseSingleDate(m[2].trim());
      if (a && b) { expand(a, b); continue; }
    }
    // Einzelner Tag
    const single = parseSingleDate(entry);
    if (single) set.add(single);
  }
  return set;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Verteilt eine Gesamtstundenzahl auf n Tage als ganze Zahlen.
 * Die Summe bleibt exakt erhalten; die Werte schwanken um den Durchschnitt,
 * damit nicht jeder Tag identisch ist. Kein Tag überschreitet maxPerDay.
 * @returns {{hours:number[], capped:boolean}} capped=true, wenn das
 *   Tageslimit die Soll-Stunden nicht zuließ.
 */
function distributeHours(total, n, maxPerDay) {
  total = Math.max(0, Math.round(total));
  if (n <= 0) return { hours: [], capped: false };
  const cap = maxPerDay && maxPerDay > 0 ? maxPerDay : Infinity;

  // Soll passt nicht ins Tageslimit -> auf Kapazität deckeln
  let capped = false;
  if (total > n * cap) {
    total = n * cap;
    capped = true;
  }

  const base = Math.floor(total / n);
  const rem = total - base * n;
  const arr = new Array(n).fill(base);

  // Rest gleichmäßig zufällig verteilen
  const idx = shuffle([...Array(n).keys()]);
  for (let i = 0; i < rem; i++) arr[idx[i]]++;

  // Etwas Variation: Stunden zwischen Tagen verschieben (Summe bleibt gleich)
  const low = Math.max(1, base - 2);
  const high = Math.min(cap, base + 3);
  for (let k = 0; k < n * 3; k++) {
    const i = randInt(n);
    const j = randInt(n);
    if (i === j) continue;
    const amt = randInt(2) + 1; // 1 oder 2 Stunden verschieben
    if (arr[i] - amt >= low && arr[j] + amt <= high) {
      arr[i] -= amt;
      arr[j] += amt;
    }
  }
  return { hours: arr, capped };
}

// --- Monatsberechnung --------------------------------------------------------

/** Liefert alle Arbeitstage (Mo–Fr, ohne Feiertage) eines Monats. */
function workingDaysOfMonth(year, monthIndex, holidays) {
  const days = [];
  const last = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const date = new Date(year, monthIndex, d);
    const wd = date.getDay();
    const iso = window.dateUtils.toISO(date);
    if (wd === 0 || wd === 6) continue; // Wochenende
    if (holidays[iso]) continue; // Feiertag
    days.push(date);
  }
  return days;
}

/**
 * Erstellt die komplette Datenstruktur für alle Monate im Zeitraum.
 * @returns {Array} Liste von Monatsobjekten mit Tageszeilen.
 */
function buildTimesheet(config) {
  const {
    startYear, startMonth, endYear, endMonth,
    state, hoursValue, hoursMode, sickDates, maxPerDay,
    vacationMode, vacationDates, vacationPerMonth,
  } = config;

  // Feiertage je Jahr cachen
  const holidayCache = {};
  const getHolidays = (year) => {
    if (!holidayCache[year]) holidayCache[year] = computeHolidays(year, state);
    return holidayCache[year];
  };

  // 1. Alle Monate im Zeitraum sammeln
  const months = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const holidays = getHolidays(y);
    const wDays = workingDaysOfMonth(y, m, holidays);
    months.push({
      year: y, monthIndex: m, holidays, workingDays: wDays,
      sickSet: new Set(), vacationSet: new Set(),
    });
    m++;
    if (m > 11) { m = 0; y++; }
  }

  // 2. Konkret eingetragene Krankheitstage übernehmen (nur echte Arbeitstage)
  months.forEach((mo) => {
    mo.workingDays.forEach((d) => {
      const iso = window.dateUtils.toISO(d);
      if (sickDates.has(iso)) mo.sickSet.add(iso);
    });
  });

  // 2b. Urlaubstage bestimmen (nie auf Krankheitstagen)
  months.forEach((mo) => {
    if (vacationMode === "perMonth") {
      // Zufällig N Arbeitstage pro Monat als Urlaub markieren
      const candidates = mo.workingDays
        .map((d) => window.dateUtils.toISO(d))
        .filter((iso) => !mo.sickSet.has(iso));
      const pick = Math.min(Math.max(0, vacationPerMonth), candidates.length);
      shuffle(candidates).slice(0, pick).forEach((iso) => mo.vacationSet.add(iso));
    } else {
      // Konkrete Zeiträume/Tage übernehmen (nur echte Arbeitstage)
      mo.workingDays.forEach((d) => {
        const iso = window.dateUtils.toISO(d);
        if (vacationDates.has(iso) && !mo.sickSet.has(iso)) mo.vacationSet.add(iso);
      });
    }
  });

  // 3. Pro Monat Stunden berechnen
  const dailyAvg = hoursMode === "week" ? hoursValue / 5 : null;

  return months.map((mo) => {
    const wd = mo.workingDays.length;
    // Monats-Sollstunden
    let monthlyTarget;
    if (hoursMode === "week") {
      monthlyTarget = Math.round(dailyAvg * wd);
    } else {
      monthlyTarget = hoursValue; // feste Monatsstunden
    }
    let avgPerDay = wd > 0 ? Math.round(monthlyTarget / wd) : 0;
    if (maxPerDay > 0) avgPerDay = Math.min(avgPerDay, maxPerDay);

    // Arbeitstage in "gearbeitet", "krank" und "Urlaub" aufteilen
    const isoOf = (d) => window.dateUtils.toISO(d);
    const sickList = mo.workingDays.filter((d) => mo.sickSet.has(isoOf(d)));
    const vacationList = mo.workingDays.filter((d) => mo.vacationSet.has(isoOf(d)));
    const workDates = mo.workingDays.filter(
      (d) => !mo.sickSet.has(isoOf(d)) && !mo.vacationSet.has(isoOf(d))
    );

    // Krankheits- und Urlaubstage werden mit dem Tagesdurchschnitt gewertet
    const sickHoursEach = avgPerDay;
    const vacationHoursEach = avgPerDay;
    const sickTotal = sickList.length * sickHoursEach;
    const vacationTotal = vacationList.length * vacationHoursEach;
    const workTarget = Math.max(0, monthlyTarget - sickTotal - vacationTotal);
    const { hours: workHours, capped } = distributeHours(workTarget, workDates.length, maxPerDay);

    // Zeilen für alle Kalendertage erstellen
    const rows = [];
    let workIdx = 0;
    const last = new Date(mo.year, mo.monthIndex + 1, 0).getDate();
    let sumWorked = 0;
    let sumSick = 0;
    let sumVacation = 0;

    for (let d = 1; d <= last; d++) {
      const date = new Date(mo.year, mo.monthIndex, d);
      const iso = window.dateUtils.toISO(date);
      const wdNum = date.getDay();
      const row = {
        date,
        iso,
        weekday: WOCHENTAGE[wdNum],
        hours: 0,
        note: "",
        type: "work",
      };

      if (mo.holidays[iso]) {
        row.type = "holiday";
        row.note = mo.holidays[iso];
      } else if (wdNum === 0 || wdNum === 6) {
        row.type = "weekend";
        row.note = "Wochenende";
      } else if (mo.sickSet.has(iso)) {
        row.type = "sick";
        row.hours = sickHoursEach;
        row.note = "Krank";
        sumSick += sickHoursEach;
      } else if (mo.vacationSet.has(iso)) {
        row.type = "vacation";
        row.hours = vacationHoursEach;
        row.note = "Urlaub";
        sumVacation += vacationHoursEach;
      } else {
        row.hours = workHours[workIdx] ?? 0;
        workIdx++;
        sumWorked += row.hours;
      }
      rows.push(row);
    }

    return {
      year: mo.year,
      monthIndex: mo.monthIndex,
      label: `${MONATE[mo.monthIndex]} ${mo.year}`,
      rows,
      workingDays: wd,
      sickCount: sickList.length,
      vacationCount: vacationList.length,
      monthlyTarget,
      sumWorked,
      sumSick,
      sumVacation,
      sumTotal: sumWorked + sumSick + sumVacation,
      capped,
    };
  });
}

// --- Rendering (Vorschau) ----------------------------------------------------

function renderPreview(timesheet, config) {
  const container = document.getElementById("preview");
  container.innerHTML = "";

  if (timesheet.length === 0) {
    container.innerHTML = '<p class="hint">Keine Monate im gewählten Zeitraum.</p>';
    return;
  }

  // Urlaubsübersicht (genommen / Anspruch / übrig)
  const totalVacation = timesheet.reduce((a, m) => a + m.vacationCount, 0);
  if (totalVacation > 0 || (config && config.vacationEntitlement > 0)) {
    const summary = document.createElement("div");
    summary.className = "vacation-summary";
    let html = `<span>Urlaub genommen: <strong>${totalVacation} Tag(e)</strong></span>`;
    if (config && config.vacationEntitlement > 0) {
      const left = config.vacationEntitlement - totalVacation;
      const cls = left < 0 ? "vac-left vac-over" : "vac-left";
      html += `<span>Urlaubsanspruch: <strong>${config.vacationEntitlement} Tag(e)</strong></span>`;
      html += `<span class="${cls}">Übrig: <strong>${left} Tag(e)</strong>` +
        (left < 0 ? " (überzogen)" : "") + `</span>`;
    }
    summary.innerHTML = html;
    container.appendChild(summary);
  }

  timesheet.forEach((month) => {
    const card = document.createElement("div");
    card.className = "month-card";

    const head = document.createElement("div");
    head.className = "month-head";
    head.innerHTML = `
      <h3>${month.label}</h3>
      <div class="month-meta">
        <span>Arbeitstage: <strong>${month.workingDays}</strong></span>
        <span>Krank: <strong>${month.sickCount}</strong></span>
        <span>Urlaub: <strong>${month.vacationCount}</strong></span>
        <span>Gearbeitet: <strong>${month.sumWorked} h</strong></span>
        <span>Gesamt (inkl. Krank/Urlaub): <strong>${month.sumTotal} h</strong></span>
        ${month.capped ? '<span class="warn">⚠ Tageslimit verhindert volle Soll-Stunden</span>' : ""}
      </div>`;
    card.appendChild(head);
    card.appendChild(buildCalendar(month));
    container.appendChild(card);
  });
}

/** Baut ein Monats-Kalendergitter (Mo–So) als DOM-Element. */
function buildCalendar(month) {
  const cal = document.createElement("div");
  cal.className = "calendar";

  // Wochentags-Kopf
  KALENDER_KOPF.forEach((wd) => {
    const h = document.createElement("div");
    h.className = "cal-weekday";
    h.textContent = wd;
    cal.appendChild(h);
  });

  // Leere Zellen vor dem 1. (Montag-basiert)
  const first = month.rows[0].date;
  const offset = (first.getDay() + 6) % 7; // Mo=0 ... So=6
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell empty";
    cal.appendChild(empty);
  }

  // Tageszellen
  month.rows.forEach((r) => {
    const cell = document.createElement("div");
    cell.className = `cal-cell row-${r.type}`;
    const day = r.date.getDate();
    const hours = r.hours > 0 ? `<div class="cal-hours">${r.hours} h</div>` : "";
    const note = r.note ? `<div class="cal-note">${r.note}</div>` : "";
    cell.innerHTML = `<div class="cal-daynum">${day}</div>${hours}${note}`;
    cal.appendChild(cell);
  });

  return cal;
}

// --- Excel-Export ------------------------------------------------------------

async function ensureXLSX() {
  if (typeof XLSX !== "undefined") return true;
  // Fallback: SheetJS von CDN nachladen (z. B. bei lokaler Entwicklung
  // ohne vendor/-Datei).
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function exportExcel(timesheet, config) {
  const ok = await ensureXLSX();
  if (!ok) {
    alert("Excel-Bibliothek konnte nicht geladen werden.");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Übersichtsblatt
  const overview = [
    ["Stundennachweis – Übersicht"],
    ["Bundesland", window.BUNDESLAENDER[config.state]],
    ["Zeitraum", `${MONATE[config.startMonth]} ${config.startYear} – ${MONATE[config.endMonth]} ${config.endYear}`],
    ["Soll-Stunden", config.hoursMode === "week" ? `${config.hoursValue} h / Woche` : `${config.hoursValue} h / Monat`],
    [],
    ["Monat", "Arbeitstage", "Krankheitstage", "Urlaubstage", "Gearbeitet (h)", "Krank (h)", "Urlaub (h)", "Gesamt (h)"],
  ];
  timesheet.forEach((m) => {
    overview.push([m.label, m.workingDays, m.sickCount, m.vacationCount, m.sumWorked, m.sumSick, m.sumVacation, m.sumTotal]);
  });
  const sumAll = timesheet.reduce(
    (a, m) => {
      a.work += m.sumWorked; a.sick += m.sumSick; a.vacation += m.sumVacation;
      a.total += m.sumTotal; a.vacationDays += m.vacationCount;
      return a;
    },
    { work: 0, sick: 0, vacation: 0, total: 0, vacationDays: 0 }
  );
  overview.push([]);
  overview.push(["Summe", "", "", sumAll.vacationDays, sumAll.work, sumAll.sick, sumAll.vacation, sumAll.total]);

  // Urlaubsanspruch / Resturlaub
  if (config.vacationEntitlement > 0) {
    overview.push([]);
    overview.push(["Urlaubsanspruch (Tage)", config.vacationEntitlement]);
    overview.push(["Urlaub genommen (Tage)", sumAll.vacationDays]);
    overview.push(["Urlaub übrig (Tage)", config.vacationEntitlement - sumAll.vacationDays]);
  }

  const wsOverview = XLSX.utils.aoa_to_sheet(overview);
  wsOverview["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, "Übersicht");

  // Ein Blatt pro Monat – Tage liegen auf der X-Achse (Spalten)
  timesheet.forEach((month) => {
    const dayRow = ["Tag"];
    const weekdayRow = ["Wochentag"];
    const hoursRow = ["Stunden"];
    const noteRow = ["Bemerkung"];
    month.rows.forEach((r) => {
      dayRow.push(r.date.getDate());
      weekdayRow.push(WOCHENTAGE_KURZ[r.date.getDay()]);
      hoursRow.push(r.hours > 0 ? r.hours : "");
      noteRow.push(r.note);
    });

    const aoa = [
      [`Stundennachweis ${month.label}`],
      [`Bundesland: ${window.BUNDESLAENDER[config.state]}`],
      [],
      dayRow,
      weekdayRow,
      hoursRow,
      noteRow,
      [],
      [`Summe gearbeitet: ${month.sumWorked} h`],
      [`Summe Krank: ${month.sumSick} h`],
      [`Summe Urlaub: ${month.sumVacation} h (${month.vacationCount} Tage)`],
      [`Gesamt: ${month.sumTotal} h`],
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Erste Spalte breit (Beschriftung), Tagesspalten schmal
    ws["!cols"] = [{ wch: 16 }, ...month.rows.map(() => ({ wch: 5 }))];
    // Blattname: max 31 Zeichen, keine Sonderzeichen
    const safeName = `${String(month.monthIndex + 1).padStart(2, "0")}-${month.year}`;
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  const fname = `Stundennachweis_${config.startYear}-${String(config.startMonth + 1).padStart(2, "0")}_bis_${config.endYear}-${String(config.endMonth + 1).padStart(2, "0")}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// --- UI-Verdrahtung ----------------------------------------------------------

let currentTimesheet = null;
let currentConfig = null;

function readConfig() {
  const startMonth = parseInt(document.getElementById("startMonth").value, 10);
  const startYear = parseInt(document.getElementById("startYear").value, 10);
  const endMonth = parseInt(document.getElementById("endMonth").value, 10);
  const endYear = parseInt(document.getElementById("endYear").value, 10);
  const state = document.getElementById("state").value;
  const hoursValue = parseFloat(document.getElementById("hoursValue").value);
  const hoursMode = document.getElementById("hoursMode").value;
  const sickDates = parseSickDates(document.getElementById("sickDates").value);
  const maxPerDay = parseInt(document.getElementById("maxPerDay").value, 10) || 0;

  const vacationMode = document.getElementById("vacationMode").value;
  const vacationDates = parseVacationRanges(document.getElementById("vacationDates").value);
  const vacationPerMonth = parseInt(document.getElementById("vacationPerMonth").value, 10) || 0;
  const entitlementRaw = parseInt(document.getElementById("vacationEntitlement").value, 10);
  const vacationEntitlement = isNaN(entitlementRaw) ? 0 : Math.max(0, entitlementRaw);

  return {
    startMonth, startYear, endMonth, endYear, state, hoursValue, hoursMode,
    sickDates, maxPerDay,
    vacationMode, vacationDates, vacationPerMonth, vacationEntitlement,
  };
}

function validate(cfg) {
  if ([cfg.startMonth, cfg.startYear, cfg.endMonth, cfg.endYear].some(isNaN)) {
    return "Bitte Start- und Endmonat vollständig angeben.";
  }
  if (cfg.endYear < cfg.startYear || (cfg.endYear === cfg.startYear && cfg.endMonth < cfg.startMonth)) {
    return "Das Ende muss nach dem Anfang liegen.";
  }
  if (isNaN(cfg.hoursValue) || cfg.hoursValue <= 0) {
    return "Bitte eine gültige Stundenzahl angeben.";
  }
  if (cfg.maxPerDay <= 0 || cfg.maxPerDay > 24) {
    return "Bitte ein gültiges Tageslimit (1–24 Stunden) angeben.";
  }
  return null;
}

function init() {
  // Bundesländer-Dropdown füllen
  const stateSel = document.getElementById("state");
  Object.entries(window.BUNDESLAENDER).forEach(([code, name]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    stateSel.appendChild(opt);
  });

  // Monats-Dropdowns füllen
  ["startMonth", "endMonth"].forEach((id) => {
    const sel = document.getElementById(id);
    MONATE.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });

  // Sinnvolle Vorbelegung: aktuelles Jahr
  const now = new Date();
  document.getElementById("startMonth").value = 0;
  document.getElementById("startYear").value = now.getFullYear();
  document.getElementById("endMonth").value = now.getMonth();
  document.getElementById("endYear").value = now.getFullYear();

  // Urlaubs-Eingabeart umschalten (Zeiträume <-> Tage pro Monat)
  const vacationModeSel = document.getElementById("vacationMode");
  const vacationRangesField = document.getElementById("vacationRangesField");
  const vacationPerMonthField = document.getElementById("vacationPerMonthField");
  const syncVacationMode = () => {
    const perMonth = vacationModeSel.value === "perMonth";
    vacationRangesField.classList.toggle("hidden", perMonth);
    vacationPerMonthField.classList.toggle("hidden", !perMonth);
  };
  vacationModeSel.addEventListener("change", syncVacationMode);
  syncVacationMode();

  const form = document.getElementById("form");
  const errorBox = document.getElementById("error");
  const downloadBtn = document.getElementById("download");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorBox.textContent = "";
    const cfg = readConfig();
    const err = validate(cfg);
    if (err) {
      errorBox.textContent = err;
      downloadBtn.disabled = true;
      return;
    }
    currentConfig = cfg;
    currentTimesheet = buildTimesheet(cfg);
    renderPreview(currentTimesheet, cfg);
    downloadBtn.disabled = false;
    document.getElementById("results").classList.remove("hidden");
  });

  downloadBtn.addEventListener("click", () => {
    if (currentTimesheet) exportExcel(currentTimesheet, currentConfig);
  });
}

document.addEventListener("DOMContentLoaded", init);
