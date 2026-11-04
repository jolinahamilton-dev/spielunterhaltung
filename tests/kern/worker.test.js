import { test, gleich, tief, wirft } from '../mini-test.js';
import { erstelleWorker } from '../../kern/worker-helfer.js';

const URL_WORKER = new URL('./echo.worker.js', import.meta.url);

test('Worker: Auftrag hin und zurück, Warte-Anzeige', async () => {
  const warten = [];
  const w = erstelleWorker(URL_WORKER, { beiWarten: (a) => warten.push(a) });
  tief(await w.rufe('echo', { x: 1 }), { x: 1 });
  gleich(await w.rufe('summe', [1, 2, 3]), 6);
  tief(warten, [true, false, true, false]);
  w.beende();
});

test('Worker: Fehler im Auftrag kommt als abgelehntes Promise', async () => {
  const w = erstelleWorker(URL_WORKER);
  await wirft(() => w.rufe('fehler'), 'Fehler erwartet');
  await wirft(() => w.rufe('gibtsnicht'), 'unbekannter Auftrag');
  w.beende();
});

test('Worker: Abbruch per Signal lehnt offene Aufträge ab', async () => {
  const ac = new AbortController();
  const w = erstelleWorker(URL_WORKER, { signal: ac.signal });
  const offen = w.rufe('langsam', 500);
  ac.abort();
  let name = '';
  try { await offen; } catch (f) { name = f.name; }
  gleich(name, 'AbortError');
  await wirft(() => w.rufe('echo', 1));
});
