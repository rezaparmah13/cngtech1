import { parseNumber, calculateSavings, eligibilityMessage } from './logic.js';
document.documentElement.classList.add('enhanced');
// Keep the conversion form clear of the fixed mobile contact bar, even before
// interaction and while a focused field is scrolled out of view.
const requestPanel = document.querySelector('.request-panel');
if (requestPanel && 'IntersectionObserver' in window) {
  const root = document.documentElement;
  let inView = false;
  const updateContactBar = () => root.classList.toggle('request-form-visible',
    inView || requestPanel.contains(document.activeElement));
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    updateContactBar();
    root.classList.add('request-bar-ready');
  }, { rootMargin: '0px 0px 100px 0px' });
  observer.observe(requestPanel);
  requestPanel.addEventListener('focusin', updateContactBar);
  requestPanel.addEventListener('focusout', () => queueMicrotask(updateContactBar));
}
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
  const result = document.querySelector('#eligibility-result');
  const request = document.querySelector('#eligibility-request');
  const clear = () => { result.hidden = true; request.hidden = true; };
  eligibility.addEventListener('input', clear);
  eligibility.addEventListener('change', clear);
  eligibility.addEventListener('submit', event => {
    event.preventDefault();
    const maxYear = Number(new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric' }).format(new Date())) + 1;
    const answers = Object.fromEntries(new FormData(eligibility));
    answers.year = parseNumber(answers.year);
    const response = eligibilityMessage(answers, {
      minimum: Number(eligibility.dataset.minimum),
      pickupMinimum: Number(eligibility.dataset.pickupMinimum),
      maxYear
    });
    const message = document.createElement('p');
    message.textContent = response.text;
    result.replaceChildren(message);
    if (response.reasons.length) {
      const list = document.createElement('ul');
      for (const reason of response.reasons) {
        const item = document.createElement('li');
        item.textContent = reason;
        list.append(item);
      }
      result.append(list);
    }
    result.dataset.status = response.status;
    result.classList.toggle('error', response.error);
    result.hidden = false;
    request.hidden = response.status !== 'eligible';
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
