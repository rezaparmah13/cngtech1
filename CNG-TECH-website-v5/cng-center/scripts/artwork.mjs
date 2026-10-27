// Original conceptual illustrations; these are not photographs or installation diagrams.
// SVG source artwork is editable without third-party design software.
import fs from 'node:fs';
import { icon } from './icons.mjs';
const out = new URL('../design/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const themes = [
  ['diagnostics', 'engine', 'DIAGNOSTICS', 'MEASURE / ANALYSE / UNDERSTAND'],
  ['cng-service', 'fuel', 'CNG SYSTEM', 'CARE / INSPECT / MAINTAIN'],
  ['mechanic', 'wrench', 'MECHANICAL', 'PRECISION / SERVICE / CARE'],
  ['team', 'check', 'TECHNICAL TEAM', 'KNOWLEDGE / TEAMWORK / PRECISION']
];
for (const [name, symbol, title, line] of themes) {
  const mark = icon(symbol).replace('<svg ', '<svg x="430" y="230" ').replace('width="24" height="24"', 'width="340" height="340"').replace('currentColor', '#d1ee88');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#214f40"/><stop offset="1" stop-color="#092b25"/></linearGradient><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#d1ee88" stroke-opacity=".07"/></pattern></defs><rect width="1200" height="900" fill="url(#bg)"/><rect width="1200" height="900" fill="url(#grid)"/><circle cx="600" cy="400" r="280" fill="none" stroke="#709677" stroke-opacity=".35"/><circle cx="600" cy="400" r="228" fill="#163e32" stroke="#73966e" stroke-dasharray="4 14"/>${mark}<path d="M110 400H270M930 400h160M600 80v40M600 680v40" stroke="#d1ee88" stroke-width="2"/><circle cx="270" cy="400" r="6" fill="#d1ee88"/><circle cx="930" cy="400" r="6" fill="#d1ee88"/><text x="75" y="90" fill="#c6dfae" font-family="Arial,sans-serif" font-size="25" letter-spacing="5">CNG TECH.</text><text x="600" y="775" text-anchor="middle" fill="#e6eddb" font-family="Arial,sans-serif" font-size="44" font-weight="bold" letter-spacing="5">${title}</text><text x="600" y="823" text-anchor="middle" fill="#9db499" font-family="Arial,sans-serif" font-size="16" letter-spacing="4">${line}</text></svg>`;
  fs.writeFileSync(new URL(`${name}.svg`, out), svg);
}
const car = fs.readFileSync(new URL('../public/assets/hero.svg', import.meta.url), 'utf8').replace('<svg ', '<svg x="0" y="-33" ' ).replace('width="720" height="580"', 'width="1200" height="967"');
fs.writeFileSync(new URL('workshop.svg', out), `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#123d33"/>${car}</svg>`);
console.log('Created editable conceptual artwork in design/');
