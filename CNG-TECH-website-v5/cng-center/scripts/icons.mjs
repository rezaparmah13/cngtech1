export const paths = {
  arrow: '<path d="M19 12H5m7-7-7 7 7 7"/>',
  fuel: '<path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M3 21h14M5 11h10M8 6h4m3 6h2a2 2 0 0 1 2 2v3a1 1 0 0 0 2 0V7l-3-3"/>',
  leaf: '<path d="M5 19C-1 8 11 3 21 3c0 10-5 22-16 16Zm-2 3L16 9"/>',
  shield: '<path d="m12 2 9 4v6c0 5-6 9-9 10-3-1-9-5-9-10V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  check: '<path d="m5 12 4 4L19 6"/><path d="M20 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  chart: '<path d="M3 3v18h18M7 16l5-6 4 3 5-8m-5 0h5v5"/>',
  wrench: '<path d="m14 6 4 4 4-4a7 7 0 0 1-9 9l-6 6a3 3 0 0 1-4-4l6-6a7 7 0 0 1 9-9l-4 4Z"/>',
  engine: '<path d="M6 8h3l2-3h6v4h3v3h2v6h-4l-2 3H8l-3-4H2V9h4ZM9 2h8M13 2v3M2 6v14"/>',
  phone: '<path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3v3a2 2 0 0 1-2 2C9 22 2 15 2 5a2 2 0 0 1 2-2h3Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  message: '<path d="M21 11a9 9 0 0 1-13 8l-6 2 2-6A9 9 0 1 1 21 11Z"/><path d="M8 9h8m-8 4h5"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
};
export function icon(name, className = '') { return `<svg class="icon ${className}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.check}</svg>`; }
