// Logik-Löser und „ohne Raten“-Generator (ohne DOM, läuft im Worker).
// Der Löser sieht nur, was auch die Spielerin sieht: aufgedeckte Zahlen und sicher bekannte Minen.
// Stufen: 1 einfach (Zahl − bekannte Minen), 2 Paare (Teilmengen/Überlappung), 3 Aufzählung der Randgruppen.
// Alle Grenzen sind Rechenschritte, keine Zeit → gleicher Seed ergibt überall das gleiche Feld.
import { erstelleZufall } from '../../kern/zufall.js';
import { nachbarListe, verteileMinen, zaehleZahlen, startBereich } from './logik.js';

const MAX_GRUPPE = 22;

/**
 * Sichere Zellen und Minen aus der sichtbaren Lage ableiten.
 * @param {object} a
 * @param {number} a.n            Anzahl Zellen
 * @param {number[][]} a.nb       Nachbar-Listen
 * @param {Uint8Array} a.offen    1 = aufgedeckt (Zahl bekannt)
 * @param {Uint8Array} a.zahlen   Zahlen (nur für offene Zellen gelesen)
 * @param {Uint8Array} a.mine     1 = sicher bekannte Mine (Treffer oder abgeleitet)
 * @param {Uint8Array} [a.nutzbar] 1 = Zahl darf als Bedingung dienen (Standard: alle offenen)
 * @param {number|null} [a.gesamt] Minen insgesamt (klassisch) oder null (unendlich)
 * @param {{schritte:number, max:number}} [a.budget]
 * @returns {{ sicher:number[], minen:number[], stufe:number }}
 */
export function analysiere({ n, nb, offen, zahlen, mine, nutzbar = null, gesamt = null, budget = { schritte: 0, max: Infinity }, maxStufe = 3 }) {
  // Bedingungen: { r, zellen } – r Minen unter den unbekannten Nachbarzellen
  const bed = [];
  for (let i = 0; i < n; i++) {
    if (!offen[i] || (nutzbar && !nutzbar[i])) continue;
    let r = zahlen[i];
    const zellen = [];
    for (const c of nb[i]) {
      if (offen[c]) continue;
      if (mine[c]) r--;
      else zellen.push(c);
    }
    budget.schritte += 8;
    if (zellen.length) bed.push({ r, zellen });
  }
  const erg = (sicher, minen, stufe) => ({ sicher: [...new Set(sicher)], minen: [...new Set(minen)], stufe });

  // Stufe 1
  const s1 = [], m1 = [];
  for (const b of bed) {
    if (b.r === 0) s1.push(...b.zellen);
    else if (b.r === b.zellen.length) m1.push(...b.zellen);
  }
  if (s1.length || m1.length) return erg(s1, m1, 1);
  if (maxStufe < 2 || budget.schritte > budget.max) return erg([], [], 0);

  // Zelle → Bedingungen
  const zuBed = new Map();
  bed.forEach((b, k) => {
    for (const c of b.zellen) {
      let l = zuBed.get(c);
      if (!l) zuBed.set(c, (l = []));
      l.push(k);
    }
  });

  // Stufe 2: Paare überlappender Bedingungen
  const s2 = [], m2 = [];
  for (let a = 0; a < bed.length; a++) {
    const A = bed[a];
    const inA = new Set(A.zellen);
    const partner = new Set();
    for (const c of A.zellen) for (const k of zuBed.get(c)) if (k !== a) partner.add(k);
    for (const bi of partner) {
      const B = bed[bi];
      budget.schritte += A.zellen.length + B.zellen.length;
      let geteilt = 0;
      const nurB = [];
      for (const c of B.zellen) { if (inA.has(c)) geteilt++; else nurB.push(c); }
      if (!nurB.length) continue;
      const nurA = A.zellen.length - geteilt;
      // Minen im geteilten Teil: max(0, rA − |nurA|) … min(rA, |geteilt|)
      const geteiltMin = Math.max(0, A.r - nurA);
      const geteiltMax = Math.min(A.r, geteilt);
      const nurBMax = B.r - geteiltMin;
      const nurBMin = B.r - geteiltMax;
      if (nurBMax === 0) s2.push(...nurB);
      else if (nurBMin === nurB.length) m2.push(...nurB);
    }
  }
  if (s2.length || m2.length) return erg(s2, m2, 2);
  if (maxStufe < 3 || budget.schritte > budget.max) return erg([], [], 0);

  // Stufe 3: Randgruppen aufzählen
  return stufe3({ n, offen, mine, bed, zuBed, gesamt, budget, erg });
}

function stufe3({ n, offen, mine, bed, zuBed, gesamt, budget, erg }) {
  // Gruppen über gemeinsame Bedingungen (Union-Find über Bedingungen)
  const eltern = bed.map((_, k) => k);
  const wurzel = (k) => { while (eltern[k] !== k) { eltern[k] = eltern[eltern[k]]; k = eltern[k]; } return k; };
  for (const l of zuBed.values()) for (let j = 1; j < l.length; j++) eltern[wurzel(l[j])] = wurzel(l[0]);

  const gruppen = new Map();   // wurzel → { bedingungen:[k], zellen:[c] }
  bed.forEach((_, k) => {
    const w = wurzel(k);
    if (!gruppen.has(w)) gruppen.set(w, { bedingungen: [], zellen: [] });
    gruppen.get(w).bedingungen.push(k);
  });
  for (const [c, l] of zuBed) gruppen.get(wurzel(l[0])).zellen.push(c);

  let bekannt = 0, unbekannt = 0;
  for (let i = 0; i < n; i++) {
    if (offen[i]) continue;
    if (mine[i]) bekannt++;
    else unbekannt++;
  }
  const rand = zuBed.size;
  const innen = unbekannt - rand;

  const ergebnisse = [];   // je Gruppe: { zellen, anzahl[m], proZelle[m][k], min, max } oder { frei: size }
  for (const g of gruppen.values()) {
    if (g.zellen.length > MAX_GRUPPE) { ergebnisse.push({ frei: g.zellen.length }); continue; }
    const e = zaehleGruppe(g, bed, budget);
    if (!e) { ergebnisse.push({ frei: g.zellen.length }); continue; }
    ergebnisse.push(e);
  }

  const rest = gesamt === null ? null : gesamt - bekannt;
  let summeMin = 0, summeMax = 0, freiZellen = innen;
  for (const e of ergebnisse) {
    if (e.frei) freiZellen += e.frei;
    else { summeMin += e.min; summeMax += e.max; }
  }

  const sicher = [], minen = [];
  let feasMinSumme = 0, feasMaxSumme = 0;
  for (const e of ergebnisse) {
    if (e.frei) continue;
    let gesamtLsg = 0;
    const mineZahl = new Array(e.zellen.length).fill(0);
    let fMin = Infinity, fMax = -Infinity;
    for (let m = e.min; m <= e.max; m++) {
      if (!e.anzahl[m]) continue;
      if (rest !== null) {
        const andereMin = summeMin - e.min, andereMax = summeMax - e.max;
        const uebrig = rest - m;
        if (uebrig < andereMin || uebrig > andereMax + freiZellen) continue;
      }
      gesamtLsg += e.anzahl[m];
      for (let k = 0; k < e.zellen.length; k++) mineZahl[k] += e.proZelle[m][k];
      fMin = Math.min(fMin, m); fMax = Math.max(fMax, m);
    }
    if (!gesamtLsg) continue;
    feasMinSumme += fMin; feasMaxSumme += fMax;
    e.zellen.forEach((c, k) => {
      if (mineZahl[k] === 0) sicher.push(c);
      else if (mineZahl[k] === gesamtLsg) minen.push(c);
    });
  }

  // Innere Zellen (kein Kontakt zu Zahlen) über den Minenzähler
  if (rest !== null && innen > 0 && freiZellen === innen) {
    const innenZellen = () => {
      const l = [];
      for (let i = 0; i < n; i++) if (!offen[i] && !mine[i] && !zuBed.has(i)) l.push(i);
      return l;
    };
    if (feasMinSumme >= rest) sicher.push(...innenZellen());
    else if (rest - feasMaxSumme >= innen) minen.push(...innenZellen());
  }
  return erg(sicher, minen, sicher.length || minen.length ? 3 : 0);
}

/** Alle gültigen Belegungen einer Gruppe zählen (Backtracking mit Schritt-Budget) */
function zaehleGruppe(g, bed, budget) {
  // Zellen in Nachbarschaftsreihenfolge (BFS über Bedingungen) → frühes Abschneiden
  const lokal = new Map();
  const reihe = [];
  const bedLokal = g.bedingungen.map((k) => bed[k]);
  const besucht = new Set();
  const warte = [bedLokal[0]];
  besucht.add(bedLokal[0]);
  const zuB = new Map();
  for (const b of bedLokal) for (const c of b.zellen) { if (!zuB.has(c)) zuB.set(c, []); zuB.get(c).push(b); }
  while (warte.length) {
    const b = warte.shift();
    for (const c of b.zellen) {
      if (lokal.has(c)) continue;
      lokal.set(c, reihe.length);
      reihe.push(c);
      for (const b2 of zuB.get(c)) if (!besucht.has(b2)) { besucht.add(b2); warte.push(b2); }
    }
  }
  const nZ = reihe.length;
  const cons = bedLokal.map((b) => ({ r: b.r, offen: b.zellen.length, minen: 0 }));
  const zelleCons = reihe.map((c) => zuB.get(c).map((b) => cons[bedLokal.indexOf(b)]));
  const wert = new Uint8Array(nZ);
  const anzahl = new Array(nZ + 1).fill(0);
  const proZelle = Array.from({ length: nZ + 1 }, () => new Array(nZ).fill(0));
  let abbruch = false;

  function setze(k, v) {
    for (const c of zelleCons[k]) { c.offen--; c.minen += v; }
  }
  function zuruck(k, v) {
    for (const c of zelleCons[k]) { c.offen++; c.minen -= v; }
  }
  function ok(k) {
    for (const c of zelleCons[k]) if (c.minen > c.r || c.minen + c.offen < c.r) return false;
    return true;
  }
  function suche(k, m) {
    if (abbruch) return;
    if (++budget.schritte > budget.max) { abbruch = true; return; }
    if (k === nZ) {
      anzahl[m]++;
      const p = proZelle[m];
      for (let j = 0; j < nZ; j++) if (wert[j]) p[j]++;
      return;
    }
    for (let v = 0; v <= 1; v++) {
      wert[k] = v;
      setze(k, v);
      if (ok(k)) suche(k + 1, m + v);
      zuruck(k, v);
    }
    wert[k] = 0;
  }
  if (cons.some((c) => c.r < 0 || c.r > c.offen)) return null;
  suche(0, 0);
  if (abbruch) return null;
  let min = Infinity, max = -Infinity;
  for (let m = 0; m <= nZ; m++) if (anzahl[m]) { min = Math.min(min, m); max = Math.max(max, m); }
  if (min === Infinity) return null;
  return { zellen: reihe, anzahl, proZelle, min, max };
}

/**
 * Spielt ein Feld vom Startklick an nur mit Logik durch.
 * @returns {{ geloest:boolean, offen:Uint8Array, mine:Uint8Array, offenZahl:number }}
 */
export function loeseVoll({ b, h, minen, zahlen, start, anzahl, nb = nachbarListe(b, h), budget = { schritte: 0, max: Infinity } }) {
  const n = b * h;
  const offen = new Uint8Array(n), mine = new Uint8Array(n);
  let offenZahl = 0;
  const oeffne = (i) => {
    const stapel = [i];
    while (stapel.length) {
      const c = stapel.pop();
      if (offen[c] || minen[c]) continue;
      offen[c] = 1;
      offenZahl++;
      budget.schritte++;
      if (zahlen[c] === 0) for (const x of nb[c]) if (!offen[x]) stapel.push(x);
    }
  };
  oeffne(start);
  const ziel = n - anzahl;
  while (offenZahl < ziel && budget.schritte <= budget.max) {
    const r = analysiere({ n, nb, offen, zahlen, mine, gesamt: anzahl, budget });
    if (!r.sicher.length && !r.minen.length) break;
    for (const m of r.minen) mine[m] = 1;
    for (const s of r.sicher) {
      if (minen[s]) throw new Error('Löser-Fehler: Mine als sicher erkannt');
      oeffne(s);
    }
  }
  return { geloest: offenZahl === ziel, offen, mine, offenZahl };
}

/**
 * Feld erzeugen, das vom Startklick an ohne Raten lösbar ist (Erzeugen + Reparieren).
 * Deterministisch aus seed + start. Gelingt es im Budget nicht, kommt das beste Feld mit geraten = true.
 * @returns {{ minen:number[], geraten:boolean, versuche:number, schritte:number }}
 */
export function erzeugeOhneRaten({ b, h, anzahl, seed, start, maxSchritte = 30_000_000, maxVersuche = 40, maxReparaturen = 400, notbremseMs = 8000 }) {
  const n = b * h;
  const rng = erstelleZufall(`${seed}|${start}`);
  const nb = nachbarListe(b, h);
  const budget = { schritte: 0, max: maxSchritte };
  const sperre = new Uint8Array(n);
  const dicht = n - 9 < anzahl;
  for (const i of dicht ? [start] : startBereich(b, h, start)) sperre[i] = 1;
  const beginn = Date.now();
  let bestes = null, besteOffen = -1, versuche = 0;

  while (versuche < maxVersuche && budget.schritte < budget.max && Date.now() - beginn < notbremseMs) {
    versuche++;
    const minen = verteileMinen(b, h, anzahl, start, rng);
    for (let rep = 0; rep <= maxReparaturen; rep++) {
      const zahlen = zaehleZahlen(minen, b, h);
      const r = loeseVoll({ b, h, minen, zahlen, start, anzahl, nb, budget });
      if (r.offenZahl > besteOffen) { besteOffen = r.offenZahl; bestes = minen.slice(); }
      if (r.geloest) return { minen: liste(minen), geraten: false, versuche, schritte: budget.schritte };
      if (budget.schritte > budget.max || Date.now() - beginn > notbremseMs) break;
      // Reparatur: eine Mine vom festhängenden Rand in einen unberührten Bereich verschieben
      const randMinen = [], ziele = [];
      for (let i = 0; i < n; i++) {
        if (r.offen[i] || r.mine[i]) continue;
        const amRand = nb[i].some((x) => r.offen[x]);
        if (amRand) { if (minen[i]) randMinen.push(i); }
        else if (!minen[i] && !sperre[i]) ziele.push(i);
      }
      if (!randMinen.length || !ziele.length) break;
      const von = randMinen[Math.floor(rng.zahl() * randMinen.length)];
      const nach = ziele[Math.floor(rng.zahl() * ziele.length)];
      minen[von] = 0;
      minen[nach] = 1;
    }
  }
  return { minen: liste(bestes), geraten: true, versuche, schritte: budget.schritte };
}

function liste(minen) {
  const l = [];
  for (let i = 0; i < minen.length; i++) if (minen[i]) l.push(i);
  return l;
}
