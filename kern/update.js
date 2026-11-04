// Service Worker anmelden, „Neue Version verfügbar“ anzeigen, Installation anbieten.
import { h } from './dom.js';

const PRUEF_ABSTAND_MS = 6 * 60 * 60 * 1000;

/** Läuft die App als Windows-App (Electron, Schema app:)? Dort gibt es keinen Service Worker. */
export const istDesktopApp = () => location.protocol === 'app:';

export function starteServiceWorker({ vorNeuladen = () => {} } = {}) {
  if (!('serviceWorker' in navigator) || istDesktopApp()) return;
  let neuLaden = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!neuLaden) return;          // erste Installation: nicht neu laden
    vorNeuladen();
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const zeigeBand = (wartend) => {
      if (document.querySelector('.update-band')) return;
      const bandEl = h('div', { class: 'update-band', role: 'status' },
        h('span', { text: 'Neue Version verfügbar' }),
        h('button', {
          type: 'button', class: 'knopf klein primaer',
          on: { click: () => { neuLaden = true; wartend.postMessage('skipWaiting'); } },
        }, 'Jetzt laden'),
        h('button', { type: 'button', class: 'knopf klein', on: { click: () => bandEl.remove() } }, 'Später'),
      );
      document.body.append(bandEl);
    };

    if (reg.waiting && navigator.serviceWorker.controller) zeigeBand(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const neu = reg.installing;
      neu?.addEventListener('statechange', () => {
        if (neu.state === 'installed' && navigator.serviceWorker.controller) zeigeBand(neu);
      });
    });
    setInterval(() => reg.update().catch(() => {}), PRUEF_ABSTAND_MS);
  }).catch((f) => console.warn('Service Worker nicht angemeldet:', f));
}

/** Eigener „App installieren“-Knopf (Chrome/Edge liefern beforeinstallprompt) */
export function erstelleInstallation() {
  let aufforderung = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); aufforderung = e; });
  window.addEventListener('appinstalled', () => { aufforderung = null; });
  return {
    moeglich: () => aufforderung !== null,
    async starte() {
      if (!aufforderung) return false;
      aufforderung.prompt();
      const { outcome } = await aufforderung.userChoice;
      aufforderung = null;
      return outcome === 'accepted';
    },
  };
}
