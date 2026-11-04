// Hash-Routing: #/ · #/spiel/<id> · #/einstellungen · #/statistik · #/info
// (funktioniert auf GitHub Pages ohne Umleitungs-Tricks)

export function leseRoute(hash = location.hash) {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (teile[0] === 'spiel' && teile[1]) return { name: 'spiel', id: teile[1] };
  if (['einstellungen', 'statistik', 'info'].includes(teile[0])) return { name: teile[0] };
  return { name: 'start' };
}

export function geheZu(pfad) {
  location.hash = pfad.startsWith('#') ? pfad : `#${pfad}`;
}

/** fn(route) bei jeder Änderung und einmal sofort */
export function beobachteRoute(fn) {
  const aufruf = () => fn(leseRoute());
  window.addEventListener('hashchange', aufruf);
  aufruf();
}
