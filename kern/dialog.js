// Ruhiger modaler Dialog auf Basis von <dialog>. Esc und Klick neben den Dialog schließen ihn.
import { h } from './dom.js';

/**
 * @param {{ titel: string, inhalt?: Node|Node[], knoepfe?: {text:string, wert:any, primaer?:boolean}[] }} o
 * @returns {Promise<any>} Wert des gewählten Knopfs, null bei Abbruch
 */
export function zeigeDialog({ titel, inhalt = [], knoepfe = [{ text: 'OK', wert: true, primaer: true }] }) {
  return new Promise((fertig) => {
    let ergebnis = null;
    const titelId = `dlg-${Math.random().toString(36).slice(2)}`;
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': titelId },
      h('div', { class: 'dialog-kopf' },
        h('h2', { id: titelId, text: titel }),
      ),
      h('div', { class: 'dialog-inhalt' }, inhalt),
      knoepfe.length ? h('div', { class: 'dialog-fuss' },
        knoepfe.map((k) => h('button', {
          type: 'button', class: k.primaer ? 'knopf primaer' : 'knopf',
          on: { click: () => schliesse(k.wert) },
        }, k.text)),
      ) : null,
    );

    function schliesse(wert) {
      ergebnis = wert;
      dlg.close();
    }

    dlg.addEventListener('close', () => { dlg.remove(); fertig(ergebnis); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    // Knöpfe im Inhalt können den Dialog über ein Ereignis schließen
    dlg.addEventListener('dialog-wert', (e) => schliesse(e.detail));

    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Aus einem Inhalts-Element heraus den Dialog mit Wert schließen */
export function schliesseMit(el, wert) {
  el.dispatchEvent(new CustomEvent('dialog-wert', { detail: wert, bubbles: true }));
}
