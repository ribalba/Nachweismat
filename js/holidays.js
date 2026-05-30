/*
 * Gesetzliche Feiertage in Deutschland – je Bundesland.
 *
 * Beweglich Feiertage werden aus dem Ostersonntag berechnet
 * (Gauß'sche Osterformel). Alle Daten werden als lokale ISO-Strings
 * (YYYY-MM-DD) zurückgegeben.
 */

// Liste der Bundesländer (Code -> Name)
const BUNDESLAENDER = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

// --- Datums-Hilfsfunktionen (alle in lokaler Zeit) ---------------------------

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

// Ostersonntag nach der anonymen gregorianischen Osterformel
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Buß- und Bettag: Mittwoch vor dem 23. November
function bussUndBettag(year) {
  let d = new Date(year, 10, 23); // 23. November
  do {
    d = addDays(d, -1);
  } while (d.getDay() !== 3); // 3 = Mittwoch
  return d;
}

/**
 * Berechnet alle gesetzlichen Feiertage eines Jahres für ein Bundesland.
 * @returns {Object<string,string>} Map von ISO-Datum -> Feiertagsname
 */
function computeHolidays(year, state) {
  const easter = easterSunday(year);
  const result = {};
  const add = (date, name) => {
    result[toISO(date)] = name;
  };

  // --- Bundesweite Feiertage -------------------------------------------------
  add(new Date(year, 0, 1), "Neujahr");
  add(addDays(easter, -2), "Karfreitag");
  add(addDays(easter, 1), "Ostermontag");
  add(new Date(year, 4, 1), "Tag der Arbeit");
  add(addDays(easter, 39), "Christi Himmelfahrt");
  add(addDays(easter, 50), "Pfingstmontag");
  add(new Date(year, 9, 3), "Tag der Deutschen Einheit");
  add(new Date(year, 11, 25), "1. Weihnachtstag");
  add(new Date(year, 11, 26), "2. Weihnachtstag");

  // --- Länderspezifische Feiertage ------------------------------------------
  // Heilige Drei Könige
  if (["BW", "BY", "ST"].includes(state)) {
    add(new Date(year, 0, 6), "Heilige Drei Könige");
  }
  // Internationaler Frauentag
  if (state === "BE" || (state === "MV" && year >= 2023)) {
    add(new Date(year, 2, 8), "Internationaler Frauentag");
  }
  // Fronleichnam (Ostern + 60)
  if (["BW", "BY", "HE", "NW", "RP", "SL"].includes(state)) {
    add(addDays(easter, 60), "Fronleichnam");
  }
  // Mariä Himmelfahrt: landesweit nur im Saarland gesetzlicher Feiertag.
  // (In Bayern nur in überwiegend katholischen Gemeinden – hier nicht gesetzt.)
  if (state === "SL") {
    add(new Date(year, 7, 15), "Mariä Himmelfahrt");
  }
  // Weltkindertag
  if (state === "TH" && year >= 2019) {
    add(new Date(year, 8, 20), "Weltkindertag");
  }
  // Reformationstag
  const reformationAlways = ["BB", "MV", "SN", "ST", "TH"];
  const reformationSince2018 = ["HB", "HH", "NI", "SH"];
  if (
    reformationAlways.includes(state) ||
    (reformationSince2018.includes(state) && year >= 2018)
  ) {
    add(new Date(year, 9, 31), "Reformationstag");
  }
  // Allerheiligen
  if (["BW", "BY", "NW", "RP", "SL"].includes(state)) {
    add(new Date(year, 10, 1), "Allerheiligen");
  }
  // Buß- und Bettag (nur Sachsen)
  if (state === "SN") {
    add(bussUndBettag(year), "Buß- und Bettag");
  }

  return result;
}

// Export für Browser (global) – kein Modulsystem nötig.
window.BUNDESLAENDER = BUNDESLAENDER;
window.computeHolidays = computeHolidays;
window.dateUtils = { toISO, addDays, easterSunday };
