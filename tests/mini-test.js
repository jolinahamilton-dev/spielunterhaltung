// Kleiner Test-Runner für den Browser – ohne npm.
const tests = [];

export function test(name, fn) { tests.push({ name, fn }); }

export function gleich(ist, soll, text = '') {
  if (!Object.is(ist, soll)) throw new Error(`${text} erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`.trim());
}

export function tief(ist, soll, text = '') {
  const a = JSON.stringify(ist), b = JSON.stringify(soll);
  if (a !== b) throw new Error(`${text} erwartet ${b}, war ${a}`.trim());
}

export function wahr(wert, text = 'Bedingung nicht erfüllt') {
  if (!wert) throw new Error(text);
}

export async function wirft(fn, text = 'Fehler erwartet') {
  try { await fn(); } catch { return; }
  throw new Error(text);
}

/** Führt alle Tests aus und zeigt sie in ziel an. */
export async function starte(ziel) {
  let ok = 0;
  const liste = document.createElement('ol');
  ziel.append(liste);
  for (const t of tests) {
    const li = document.createElement('li');
    const beginn = performance.now();
    try {
      await t.fn();
      ok++;
      li.className = 'ok';
      li.textContent = `✔ ${t.name}`;
    } catch (f) {
      li.className = 'fehler';
      li.textContent = `✘ ${t.name} – ${f?.message || f}`;
      console.error(t.name, f);
    }
    const ms = performance.now() - beginn;
    if (ms > 50) li.textContent += ` (${Math.round(ms)} ms)`;
    liste.append(li);
  }
  const summe = `${ok}/${tests.length} bestanden`;
  document.title = `${ok === tests.length ? '✔' : '✘'} ${summe}`;
  const kopf = document.createElement('p');
  kopf.className = ok === tests.length ? 'summe ok' : 'summe fehler';
  kopf.id = 'ergebnis';
  kopf.textContent = summe;
  ziel.prepend(kopf);
  return { ok, gesamt: tests.length };
}
