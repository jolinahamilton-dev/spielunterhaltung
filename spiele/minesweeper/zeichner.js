// Canvas-Zeichner für beide Modi. Gezeichnet wird nur auf Anforderung (kein Dauer-Loop),
// scharf mit devicePixelRatio. Farben kommen aus CSS-Variablen und werden bei Themenwechsel neu gelesen.

// Zellcodes: 0–8 offene Zahl · 9 verdeckt · 10 Flagge · 11 Fragezeichen · 12 Treffer · 13 Mine (Ende)
//            14 falsche Flagge (Ende) · 15 außerhalb
export const CODE = Object.freeze({ VERDECKT: 9, FLAGGE: 10, FRAGE: 11, TREFFER: 12, MINE: 13, FALSCH: 14, AUSSEN: 15 });

const VARIABLEN = {
  gitter: '--ms-gitter', verdeckt: '--ms-verdeckt', verdecktLicht: '--ms-verdeckt-licht', offen: '--ms-offen',
  treffer: '--ms-treffer', flagge: '--ms-flagge', mine: '--ms-mine', text: '--text', leise: '--text-leise',
  fokus: '--fokus', akzent: '--akzent', akzentSanft: '--akzent-sanft', fehler: '--fehler',
  z1: '--ms-z1', z2: '--ms-z2', z3: '--ms-z3', z4: '--ms-z4', z5: '--ms-z5', z6: '--ms-z6', z7: '--ms-z7', z8: '--ms-z8',
};

/** Farben auflösen: Variable an einem versteckten Element als `color` setzen und berechneten Wert lesen */
export function leseFarben(wurzel) {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  wurzel.append(probe);
  const farben = {};
  for (const [name, v] of Object.entries(VARIABLEN)) {
    probe.style.color = `var(${v})`;
    farben[name] = getComputedStyle(probe).color || '#888';
  }
  probe.remove();
  farben.schrift = getComputedStyle(wurzel).getPropertyValue('--schrift').trim() || 'system-ui, sans-serif';
  return farben;
}

export function erstelleZeichner(canvas) {
  const g = canvas.getContext('2d');
  let farben = null;
  let W = 0, H = 0, dpr = 1;

  function groesse(breite, hoehe) {
    dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    W = breite; H = hoehe;
    canvas.width = Math.max(1, Math.round(breite * dpr));
    canvas.height = Math.max(1, Math.round(hoehe * dpr));
  }

  const kachel = (x, y, b, h, r) => {
    if (r > 0.5 && g.roundRect) g.roundRect(x, y, b, h, r);
    else g.rect(x, y, b, h);
  };

  function flagge(x, y, z, falsch) {
    const cx = x + z / 2, cy = y + z / 2;
    const s = z * 0.5;
    g.fillStyle = farben.text;
    g.fillRect(Math.round(cx - s * 0.32), Math.round(cy - s * 0.55), Math.max(1.5, z * 0.06), s * 1.1);
    g.beginPath();
    g.moveTo(cx - s * 0.26, cy - s * 0.55);
    g.lineTo(cx + s * 0.5, cy - s * 0.28);
    g.lineTo(cx - s * 0.26, cy);
    g.closePath();
    g.fillStyle = farben.flagge;
    g.fill();
    g.fillStyle = farben.text;
    g.fillRect(cx - s * 0.5, cy + s * 0.5, s * 0.75, Math.max(1.5, z * 0.06));
    if (falsch) {
      g.strokeStyle = farben.text;
      g.lineWidth = Math.max(1.5, z * 0.07);
      g.beginPath();
      g.moveTo(x + z * 0.22, y + z * 0.22); g.lineTo(x + z * 0.78, y + z * 0.78);
      g.moveTo(x + z * 0.78, y + z * 0.22); g.lineTo(x + z * 0.22, y + z * 0.78);
      g.stroke();
    }
  }

  function mine(x, y, z, farbe) {
    const cx = x + z / 2, cy = y + z / 2, r = z * 0.22;
    g.strokeStyle = farbe;
    g.lineWidth = Math.max(1.2, z * 0.06);
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const w = (k * Math.PI) / 4;
      g.moveTo(cx - Math.cos(w) * r * 1.5, cy - Math.sin(w) * r * 1.5);
      g.lineTo(cx + Math.cos(w) * r * 1.5, cy + Math.sin(w) * r * 1.5);
    }
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = farbe;
    g.fill();
  }

  /**
   * @param {object} o
   * @param {{x:number,y:number,zelle:number}} o.kamera  Anzeige-Zelle in der Bildmitte, Pixel pro Zelle
   * @param {(dx:number,dy:number)=>number} o.code
   * @param {{b:number,h:number}|null} o.grenzen   klassisch: Feldgröße in Anzeige-Koordinaten
   * @param {{dx:number,dy:number}|null} o.cursor
   * @param {{dx:number,dy:number}[]} o.markiert
   * @param {{dx:number,dy:number}[]} o.gedrueckt
   * @param {{dx:number,dy:number,anteil:number}|null} o.ring
   */
  function zeichne({ kamera, code, grenzen, cursor, markiert = [], gedrueckt = [], ring = null }) {
    if (!farben || !W || !H) return;
    const z = kamera.zelle;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const sx = (dx) => Math.round((dx - kamera.x) * z + W / 2);
    const sy = (dy) => Math.round((dy - kamera.y) * z + H / 2);
    let x0 = Math.floor(kamera.x - W / 2 / z) - 1, x1 = Math.ceil(kamera.x + W / 2 / z) + 1;
    let y0 = Math.floor(kamera.y - H / 2 / z) - 1, y1 = Math.ceil(kamera.y + H / 2 / z) + 1;
    if (grenzen) {
      x0 = Math.max(0, x0); y0 = Math.max(0, y0);
      x1 = Math.min(grenzen.b, x1); y1 = Math.min(grenzen.h, y1);
      const r = Math.min(10, z * 0.3);
      g.beginPath();
      kachel(sx(0) - 2, sy(0) - 2, sx(grenzen.b) - sx(0) + 4, sy(grenzen.h) - sy(0) + 4, r);
      g.fillStyle = farben.gitter;
      g.fill();
    } else {
      g.fillStyle = farben.gitter;
      g.fillRect(0, 0, W, H);
    }
    const spalten = Math.max(0, x1 - x0), zeilen = Math.max(0, y1 - y0);
    if (!spalten || !zeilen) return;
    const codes = new Uint8Array(spalten * zeilen);
    for (let j = 0; j < zeilen; j++) for (let i = 0; i < spalten; i++) codes[j * spalten + i] = code(x0 + i, y0 + j);

    const luecke = z >= 18 ? 2 : 1;
    const rad = Math.min(6, z * 0.16);
    const gedrSet = new Set(gedrueckt.map((p) => `${p.dx},${p.dy}`));

    // Flächen
    const flaeche = (filter, farbe) => {
      g.beginPath();
      let etwas = false;
      for (let j = 0; j < zeilen; j++) {
        for (let i = 0; i < spalten; i++) {
          const c = codes[j * spalten + i];
          if (!filter(c, x0 + i, y0 + j)) continue;
          const px = sx(x0 + i), py = sy(y0 + j);
          kachel(px + luecke / 2, py + luecke / 2, sx(x0 + i + 1) - px - luecke, sy(y0 + j + 1) - py - luecke, rad);
          etwas = true;
        }
      }
      if (etwas) { g.fillStyle = farbe; g.fill(); }
    };
    const istVerdeckt = (c) => c >= 9 && c <= 14 && c !== 12;
    const gedr = (dx, dy) => gedrSet.size > 0 && gedrSet.has(`${dx},${dy}`);
    flaeche((c, dx, dy) => c <= 8 || (c === 9 && gedr(dx, dy)), farben.offen);
    flaeche((c, dx, dy) => istVerdeckt(c) && !(c === 9 && gedr(dx, dy)), farben.verdeckt);
    flaeche((c) => c === 12, farben.treffer);
    // leichte Oberkante an verdeckten Zellen
    if (z >= 14) {
      g.beginPath();
      const dicke = Math.max(1, Math.round(z * 0.07));
      for (let j = 0; j < zeilen; j++) for (let i = 0; i < spalten; i++) {
        const c = codes[j * spalten + i];
        if (!istVerdeckt(c) || (c === 9 && gedr(x0 + i, y0 + j))) continue;
        const px = sx(x0 + i), py = sy(y0 + j), b = sx(x0 + i + 1) - px;
        g.rect(px + luecke / 2 + rad, py + luecke / 2, b - luecke - 2 * rad, dicke);
      }
      g.fillStyle = farben.verdecktLicht;
      g.fill();
    }

    // Zahlen, Flaggen, Minen
    const groesseSchrift = Math.max(9, Math.round(z * 0.6));
    g.font = `650 ${groesseSchrift}px ${farben.schrift}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let j = 0; j < zeilen; j++) {
      for (let i = 0; i < spalten; i++) {
        const c = codes[j * spalten + i];
        if (c === 0 || c === 9 || c === 15) continue;
        const px = sx(x0 + i), py = sy(y0 + j), b = sx(x0 + i + 1) - px;
        if (c <= 8) {
          g.fillStyle = farben[`z${c}`];
          g.fillText(String(c), px + b / 2, py + b / 2 + z * 0.04);
        } else if (c === 10 || c === 14) flagge(px, py, b, c === 14);
        else if (c === 11) {
          g.fillStyle = farben.leise;
          g.fillText('?', px + b / 2, py + b / 2 + z * 0.04);
        } else if (c === 12) mine(px, py, b, farben.fehler);
        else if (c === 13) mine(px, py, b, farben.leise);
      }
    }

    // Hervorhebungen
    const umrandung = (p, farbe, breite, fuellen) => {
      const px = sx(p.dx), py = sy(p.dy), b = sx(p.dx + 1) - px;
      if (fuellen) {
        g.globalAlpha = 0.55;
        g.fillStyle = fuellen;
        g.beginPath(); kachel(px + luecke / 2, py + luecke / 2, b - luecke, b - luecke, rad); g.fill();
        g.globalAlpha = 1;
      }
      g.strokeStyle = farbe;
      g.lineWidth = breite;
      g.beginPath();
      kachel(px + breite / 2, py + breite / 2, b - breite, b - breite, rad + 1);
      g.stroke();
    };
    for (const p of markiert) umrandung(p, farben.akzent, Math.max(2, z * 0.08), farben.akzentSanft);
    if (cursor) umrandung(cursor, farben.fokus, Math.max(2.5, z * 0.1), null);
    if (ring) {
      const px = sx(ring.dx), py = sy(ring.dy), b = sx(ring.dx + 1) - px;
      g.strokeStyle = farben.akzent;
      g.lineWidth = Math.max(3, z * 0.1);
      g.beginPath();
      g.arc(px + b / 2, py + b / 2, b * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ring.anteil));
      g.stroke();
    }
  }

  return {
    groesse,
    setzeFarben(f) { farben = f; },
    zeichne,
    get breite() { return W; },
    get hoehe() { return H; },
  };
}
