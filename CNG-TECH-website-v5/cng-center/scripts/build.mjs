import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, articles, s, b, p, e, abs, dateLabel, readTime, fa, link, external, articleCard, badge } from './shared.mjs';
import { home, servicePage, planPage, calculatorPage, magazine, contact, privacy } from './pages.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
const production = process.argv.includes('--production');
const base = new URL(s.url);
if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) throw Error('site.url must be an HTTPS origin without a path.');
if (!/^\+\d{10,15}$/.test(b.phone)) throw Error('Invalid international telephone number');
for (const url of [b.mapUrl, p.officialUrl, ...s.socialLinks.map(x => x.url)]) if (new URL(url).protocol !== 'https:') throw Error('External links must use HTTPS');
const slugs = new Set();
for (const a of articles) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug) || slugs.has(a.slug)) throw Error(`Invalid/duplicate article slug: ${a.slug}`);
  slugs.add(a.slug);
  if (!a.title || !a.description || !a.sections.length || !Number.isFinite(Date.parse(a.date))) throw Error(`Incomplete article: ${a.slug}`);
}
for (const a of articles) for (const slug of a.related || []) if (!slugs.has(slug)) throw Error(`Missing related article: ${slug}`);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.copyFileSync(path.join(root, 'deploy/apache.htaccess'), path.join(out, '.htaccess'));
const routes = [];
function emit(page, file = '') {
  page.noindex = !!page.noindex || !production;
  const target = path.join(out, file || `${page.path.slice(1)}index.html`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, layout(page));
  if (!file) routes.push({ path: page.path, modified: page.article?.updated || page.article?.date || s.contentDate });
}
const pages = [
  ['/', s.title, s.description, 'خانه', home],
  ['/services/', 'خدمات تخصصی CNG و ریمپ و تیونینگ در گنبد کاووس | CNG TECH', 'معرفی خدمات CNG TECH در گنبد کاووس؛ عیب‌یابی و تعمیر سیستم CNG، تنظیم موتور، مکانیکی، ریمپ و تیونینگ و بررسی سلامت سیستم گاز.', 'خدمات', servicePage],
  ['/free-conversion/', 'راهنمای طرح تبدیل رایگان CNG و مسیر رسمی ثبت‌نام | CNG TECH', 'شرایط اعلام‌شده تبدیل رایگان خودروهای شخصی، بررسی اولیه سال مدل و لینک سامانه رسمی. این سایت سامانه ثبت‌نام یا تأیید پذیرش نیست.', 'راهنمای طرح تبدیل', planPage],
  ['/calculator/', 'محاسبه هزینه بنزین و CNG؛ برآورد ماهانه | CNG TECH', 'مقایسه هزینه ماهانه سوخت بنزین و CNG با پیمایش، مصرف و قیمت پرداختی خودتان؛ پشتیبانی از اعداد فارسی و نتیجه تخمینی بدون دریافت اطلاعات شخصی.', 'محاسبه هزینه سوخت', calculatorPage],
  ['/articles/', 'مجله CNG؛ راهنمای تبدیل، نگهداری و هزینه سوخت | CNG TECH', 'مقالات فارسی درباره CNG، مزایا و محدودیت‌ها، تفاوت LPG، چک‌لیست پیش از تبدیل، نگهداری ایمن و مقایسه هزینه سوخت.', 'مجله CNG', magazine],
  ['/contact/', 'تماس با CNG TECH در گنبد کاووس | 09116438660', 'نشانی، ساعت کاری و شماره تماس سی‌ان‌جی تِک در گنبد کاووس؛ مسیریابی در نشان و مراجعه برای بررسی خودرو.', 'درباره ما و تماس', contact],
  ['/privacy/', 'حریم خصوصی و شرایط استفاده | CNG TECH', 'نحوه اجرای محلی ابزارهای سایت، لینک‌های بیرونی، تصاویر جایگزین و حدود راهنمایی فنی و طرح تبدیل CNG.', 'حریم خصوصی', privacy]
];
for (const [url, title, description, name, render] of pages) emit({ title, description, path: url, body: render(), breadcrumbs: url === '/' ? [] : [{ name, path: url }] });
for (const a of articles) {
  const url = `/articles/${a.slug}/`;
  const related = a.related.map(slug => articles.find(x => x.slug === slug));
  const body = `<header class="container page-intro article-header">${badge(e(a.category))}<h1>${e(a.title)}</h1><div class="article-meta"><span>تحریریه CNG TECH</span><time datetime="${e(a.date)}">${dateLabel(a.date)}</time><span>${fa(readTime(a))} دقیقه مطالعه</span></div></header><div class="container section first-section article-layout"><aside class="toc"><h2>در این راهنما</h2><ol>${a.sections.map((section, i) => `<li><a href="#section-${i + 1}">${e(section.heading)}</a></li>`).join('')}</ol></aside><article class="article-body prose"><p class="lead">${e(a.intro)}</p>${a.sections.map((section, i) => `<section id="section-${i + 1}"><h2>${e(section.heading)}</h2>${(section.paragraphs || []).map(text => `<p>${e(text)}</p>`).join('')}${section.bullets ? `<ul>${section.bullets.map(text => `<li>${e(text)}</li>`).join('')}</ul>` : ''}</section>`).join('')}${a.slug === 'fuel-costs' ? `<div class="button-row">${link('/calculator/', 'ورود به محاسبه‌گر', 'button')}</div>` : ''}<aside class="sources"><h2>منابع و مبنای مطلب</h2>${a.sources.length ? `<ul>${a.sources.map(source => `<li>${external(source.url, e(source.label))}</li>`).join('')}</ul>` : '<p>محاسبات بر پایه رابطه مسافت، مصرف و قیمت سوخت است؛ نرخ روز یا آمار تضمینی استفاده نشده است.</p>'}<p>تاریخ تدوین: ${dateLabel(a.updated || a.date)}. منابع خبری بیانگر اطلاعیه زمان انتشارند، نه استعلام زنده.</p></aside><p class="article-note">این راهنمای عمومی جایگزین بررسی تخصصی خودرو، دستورالعمل سازنده یا ضوابط رسمی جاری نیست.</p><section class="article-related"><h2>مطالعه بعدی</h2><ul>${related.map(item => `<li>${link(`/articles/${item.slug}/`, e(item.title))}</li>`).join('')}</ul></section></article></div>`;
  emit({ title: `${a.title} | CNG TECH`, description: a.description, path: url, body, article: a, breadcrumbs: [{ name: 'مجله CNG', path: '/articles/' }, { name: a.title, path: url }], schema: [{ '@type': 'Article', '@id': `${abs(url)}#article`, headline: a.title, description: a.description, inLanguage: s.language, datePublished: a.date, dateModified: a.updated || a.date, mainEntityOfPage: { '@id': `${abs(url)}#webpage` }, author: { '@type': 'Organization', name: 'تحریریه CNG TECH', url: abs('/contact/') }, publisher: { '@id': abs('/#business') }, image: abs('/assets/social-card.png') }] });
}
emit({ title: 'صفحه پیدا نشد | CNG TECH', description: 'صفحه درخواستی پیدا نشد؛ از صفحه اصلی یا فهرست خدمات ادامه دهید.', path: '/404.html', body: '<section class="container not-found"><p class="big-code">404</p><h1>این مسیر به صفحه‌ای نمی‌رسد.</h1><p>ممکن است نشانی تغییر کرده باشد.</p><a class="button" href="/">بازگشت به خانه</a></section>', noindex: true }, '404.html');
fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route => `<url><loc>${e(abs(route.path))}</loc><lastmod>${route.modified}</lastmod></url>`).join('')}</urlset>\n`);
fs.writeFileSync(path.join(out, 'robots.txt'), production ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nSitemap: ${abs('/sitemap.xml')}\n` : 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify({ mode: production ? 'production' : 'preview', builtAt: new Date().toISOString(), pages: routes.length, origin: s.url }, null, 2));
console.log(`Built ${routes.length} pages + 404 → dist/ (${production ? 'production: indexable' : 'preview: noindex'})`);
console.log('Reminder: domain/hosting activation, real photographs, exact address and verified social links require owner action.');
