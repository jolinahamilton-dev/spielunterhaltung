// Sicherung aller Spielstände, Einstellungen und Statistiken als JSON-Datei – und wieder einlesen.
// Eingelesene Dateien gelten als nicht vertrauenswürdig: Format, Größe, Schlüssel und Werte werden streng geprüft.
import { PRAEFIX } from './speicher.js';

export const SICHERUNG_FORMAT = 1;
export const MAX_DATEI_BYTES = 5 * 1024 * 1024;
const MAX_EINTRAEGE = 2000;
const SCHLUESSEL_MUSTER = /^[A-Za-z0-9_.:-]{1,200}$/;
const AUSGESCHLOSSEN = new Set(['backup-vor-import']);
export const BACKUP_SCHLUESSEL = 'backup-vor-import';

/** Alle Einträge der App aus dem Speicher (ohne Präfix) */
function eintraege(backend) {
  const daten = {};
  for (let i = 0; i < backend.length; i++) {
    const k = backend.key(i);
    if (!k || !k.startsWith(PRAEFIX)) continue;
    const kurz = k.slice(PRAEFIX.length);
    if (AUSGESCHLOSSEN.has(kurz)) continue;
    daten[kurz] = backend.getItem(k);
  }
  return daten;
}

/** Sicherungsobjekt erstellen */
export function erstelleSicherung(backend, version = '?', jetzt = new Date()) {
  return {
    app: 'spielunterhaltung',
    format: SICHERUNG_FORMAT,
    version,
    datum: jetzt.toISOString(),
    daten: eintraege(backend),
  };
}

export function dateiName(jetzt = new Date()) {
  const d = jetzt.toISOString().slice(0, 10);
  return `spielunterhaltung-sicherung-${d}.json`;
}

/**
 * Prüft eine eingelesene Sicherung.
 * @param {string} text  Dateiinhalt
 * @returns {{ ok: true, sicherung: object, anzahl: number, spiele: string[], datum: string } | { ok: false, fehler: string }}
 */
export function pruefeSicherung(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, fehler: 'Die Datei ist leer.' };
  if (text.length > MAX_DATEI_BYTES) return { ok: false, fehler: 'Die Datei ist zu groß für eine Sicherung.' };
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, fehler: 'Die Datei ist keine gültige Sicherung (kein JSON).' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, fehler: 'Die Datei ist keine gültige Sicherung.' };
  if (obj.app !== 'spielunterhaltung') return { ok: false, fehler: 'Die Datei stammt nicht aus Spielunterhaltung.' };
  if (obj.format !== SICHERUNG_FORMAT) return { ok: false, fehler: 'Diese Sicherung hat ein unbekanntes Format.' };
  const daten = obj.daten;
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return { ok: false, fehler: 'Die Sicherung enthält keine Daten.' };
  const schluessel = Object.keys(daten);
  if (schluessel.length > MAX_EINTRAEGE) return { ok: false, fehler: 'Die Sicherung enthält zu viele Einträge.' };
  for (const k of schluessel) {
    if (!SCHLUESSEL_MUSTER.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype' || AUSGESCHLOSSEN.has(k)) {
      return { ok: false, fehler: 'Die Sicherung enthält ungültige Einträge.' };
    }
    const wert = daten[k];
    if (typeof wert !== 'string') return { ok: false, fehler: 'Die Sicherung enthält ungültige Werte.' };
    try { JSON.parse(wert); } catch { return { ok: false, fehler: 'Die Sicherung enthält beschädigte Werte.' }; }
  }
  const spiele = [...new Set(schluessel.filter((k) => k.endsWith(':stand') || k.includes(':daten:')).map((k) => k.split(':')[0]))].sort();
  const datum = typeof obj.datum === 'string' && !Number.isNaN(Date.parse(obj.datum)) ? obj.datum : '';
  return { ok: true, sicherung: { ...obj, daten }, anzahl: schluessel.length, spiele, datum };
}

/**
 * Ersetzt alle App-Daten durch die (geprüfte) Sicherung. Vorher wird der aktuelle Stand unter
 * BACKUP_SCHLUESSEL abgelegt; schlägt das Schreiben fehl, wird er wiederhergestellt.
 */
export function spieleEin(backend, sicherung) {
  const vorher = erstelleSicherung(backend);
  const alleSchluessel = [];
  for (let i = 0; i < backend.length; i++) {
    const k = backend.key(i);
    if (k && k.startsWith(PRAEFIX)) alleSchluessel.push(k);
  }
  try {
    for (const k of alleSchluessel) backend.removeItem(k);
    for (const [k, v] of Object.entries(sicherung.daten)) backend.setItem(PRAEFIX + k, v);
    try { backend.setItem(PRAEFIX + BACKUP_SCHLUESSEL, JSON.stringify(vorher)); } catch { /* Platz knapp – Backup ist optional */ }
    return { ok: true };
  } catch {
    // zurückrollen
    for (let i = backend.length - 1; i >= 0; i--) {
      const k = backend.key(i);
      if (k && k.startsWith(PRAEFIX)) backend.removeItem(k);
    }
    for (const [k, v] of Object.entries(vorher.daten)) { try { backend.setItem(PRAEFIX + k, v); } catch { /* egal */ } }
    return { ok: false, fehler: 'Nicht genug Speicherplatz – es wurde nichts geändert.' };
  }
}

/** Gibt es einen Stand von vor dem letzten Einlesen? */
export function hatBackup(backend) {
  return backend.getItem(PRAEFIX + BACKUP_SCHLUESSEL) !== null;
}

/** Stellt den Stand von vor dem letzten Einlesen wieder her */
export function stelleBackupWiederHer(backend) {
  const roh = backend.getItem(PRAEFIX + BACKUP_SCHLUESSEL);
  if (!roh) return { ok: false, fehler: 'Kein früherer Stand vorhanden.' };
  const p = pruefeSicherung(roh);
  if (!p.ok) return p;
  const r = spieleEin(backend, p.sicherung);
  if (r.ok) backend.removeItem(PRAEFIX + BACKUP_SCHLUESSEL);
  return r;
}
