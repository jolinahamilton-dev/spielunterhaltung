// Kleiner DOM-Baukasten: h('button', { class: 'knopf', on: { click: fn } }, 'Text')

const SVG_NS = 'http://www.w3.org/2000/svg';

function setzeAttribute(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;            // nur für feste, eigene SVG-Texte
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

function haengeAn(el, kinder) {
  for (const k of kinder.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** HTML-Element erzeugen */
export function h(tag, attrs, ...kinder) {
  const el = document.createElement(tag);
  setzeAttribute(el, attrs);
  haengeAn(el, kinder);
  return el;
}

/** SVG-Element erzeugen */
export function s(tag, attrs, ...kinder) {
  const el = document.createElementNS(SVG_NS, tag);
  setzeAttribute(el, attrs);
  haengeAn(el, kinder);
  return el;
}

/** Stylesheet eines Spiels einmalig einbinden (url relativ zur App-Wurzel oder absolut) */
export function ladeStil(url) {
  const href = new URL(url, document.baseURI).href;
  if ([...document.styleSheets].some((s) => s.href === href) || document.querySelector(`link[data-stil="${href}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-stil': href }));
}

/** Festes SVG-Symbol (eigener, vertrauenswürdiger Text) als Element */
export function symbol(svgText, klasse = 'symbol') {
  const span = h('span', { class: klasse, 'aria-hidden': 'true' });
  span.innerHTML = svgText;
  return span;
}
