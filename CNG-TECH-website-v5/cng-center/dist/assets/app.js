import { parseNumber, calculateSavings, eligibilityMessage } from './logic.js';
document.documentElement.classList.add('enhanced');
const number = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const menu = document.querySelector('#nav-menu');
const toggle = document.querySelector('#menu-toggle');
if (menu && toggle) {
  toggle.hidden = false;
  const close = () => { menu.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('is-open', open); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { close(); toggle.focus(); } });
  menu.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) close(); });
}
const calculator = document.querySelector('#savings-form');
if (calculator) {
  calculator.hidden = false;
  calculator.addEventListener('submit', event => {
    event.preventDefault();
    const result = document.querySelector('#savings-result');
    const error = document.querySelector('#calculator-error');
    const data = Object.fromEntries([...new FormData(calculator)].map(([key, value]) => [key, parseNumber(value)]));
    try {
      const savings = calculateSavings(data);
      error.textContent = '';
      result.hidden = false;
      for (const key of ['petrolOnly', 'mixed', 'monthly', 'annual']) result.querySelector(`[data-value="${key}"]`).textContent = number.format(Math.abs(savings[key]));
      result.querySelector('[data-result-title]').textContent = savings.monthly >= 0 ? 'کاهش تخمینی هزینه ماهانه سوخت' : 'افزایش تخمینی هزینه ماهانه سوخت';
      result.querySelector('[data-annual-label]').textContent = savings.monthly >= 0 ? 'کاهش هزینه سالانه، با فرض ثابت بودن شرایط' : 'افزایش هزینه سالانه، با فرض ثابت بودن شرایط';
      result.querySelector('[data-percent]').textContent = `${number.format(Math.abs(savings.percent))}٪ ${savings.monthly >= 0 ? 'کمتر' : 'بیشتر'} از حالت تمام‌بنزینی`;
      result.focus();
    } catch (err) { result.hidden = true; error.textContent = err.message; error.focus(); }
  });
  calculator.addEventListener('input', () => { document.querySelector('#savings-result').hidden = true; document.querySelector('#calculator-error').textContent = ''; });
}
const eligibility = document.querySelector('#eligibility-form');
if (eligibility) {
  eligibility.hidden = false;
  const type = eligibility.querySelector('[name=type]');
  const year = eligibility.querySelector('[name=year]');
  const result = document.querySelector('#eligibility-result');
  const sync = () => { year.required = type.value === 'private'; year.disabled = type.value !== 'private'; year.closest('.field').hidden = year.disabled; result.hidden = true; };
  type.addEventListener('change', sync);
  year.addEventListener('input', () => { result.hidden = true; });
  sync();
  eligibility.addEventListener('submit', event => {
    event.preventDefault();
    const maxYear = Number(new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric' }).format(new Date())) + 1;
    const response = eligibilityMessage(type.value, parseNumber(year.value), Number(eligibility.dataset.minimum), maxYear);
    result.textContent = response.text;
    result.classList.toggle('error', response.error);
    result.hidden = false;
    result.focus();
  });
}
const search = document.querySelector('#article-search');
if (search) {
  search.closest('.search-wrap').hidden = false;
  const cards = [...document.querySelectorAll('[data-article]')];
  const filters = [...document.querySelectorAll('[data-category]')];
  let category = 'all';
  const normalize = value => value.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u200f]/g, ' ').replace(/\s+/g, ' ').trim();
  const filter = () => {
    const term = normalize(search.value);
    let count = 0;
    cards.forEach(card => { const show = (category === 'all' || card.dataset.articleCategory === category) && normalize(card.textContent).includes(term); card.hidden = !show; if (show) count++; });
    document.querySelector('#search-count').textContent = `${number.format(count)} مقاله`;
    document.querySelector('#search-empty').hidden = count !== 0;
  };
  search.addEventListener('input', filter);
  filters.forEach(button => button.addEventListener('click', () => { category = button.dataset.category; filters.forEach(b => b.setAttribute('aria-pressed', String(b === button))); filter(); }));
  filter();
}
