import { bedieneAuftraege } from '../../kern/worker-dienst.js';

bedieneAuftraege({
  echo: (d) => d,
  summe: (liste) => liste.reduce((a, b) => a + b, 0),
  fehler: () => { throw new Error('absichtlich'); },
  langsam: (ms) => new Promise((ok) => setTimeout(() => ok('fertig'), ms)),
});
