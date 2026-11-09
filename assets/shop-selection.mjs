const $ = s => document.querySelector(s);
const all = s => [...document.querySelectorAll(s)];
const catalog = JSON.parse($('[data-selection-catalog]').dataset.selectionCatalog);
const key = 'cngtech-product-selection-v1';
const fa = n => new Intl.NumberFormat('fa-IR').format(n);
const normalize = s => s.replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/ي/g,'ی').replace(/ك/g,'ک').trim().toLowerCase();
let items = {};
let persistent = true;
try {
 const saved = JSON.parse(localStorage.getItem(key) || '{}');
 for (const p of catalog) if (Number.isInteger(saved?.[p.slug]) && saved[p.slug]>0 && saved[p.slug]<=99) items[p.slug]=saved[p.slug];
} catch { persistent = false; }
function announce(text) { all('[data-selection-status]').forEach(el=>{el.textContent=text;}); }
function save() {
 try { localStorage.setItem(key,JSON.stringify(items)); } catch { persistent=false; }
}
function render() {
 all('[data-selection-count]').forEach(el=>{el.textContent=fa(Object.values(items).reduce((a,b)=>a+b,0));});
 const list=$('[data-selection-list]');
 if (!list) return;
 list.replaceChildren();
 if (!Object.keys(items).length) { const p=document.createElement('p');p.textContent='سبد انتخاب خالی است. از فهرست محصولات، کالا انتخاب کنید.';list.append(p); }
 for (const p of catalog.filter(p=>items[p.slug])) {
  const row=document.createElement('div');row.className='selection-item';
  const a=document.createElement('a');a.href=`/shop/${p.slug}/`;a.textContent=p.title;
  const label=document.createElement('label');label.textContent='تعداد ';
  const input=document.createElement('input');input.type='number';input.min='1';input.max='99';input.step='1';input.value=items[p.slug];input.setAttribute('aria-label',`تعداد ${p.title}`);
  input.addEventListener('change',()=>{const n=Number(input.value);if (!Number.isInteger(n)||n<1||n>99) {input.value=items[p.slug];announce('تعداد باید عدد صحیح بین ۱ و ۹۹ باشد.');return;}items[p.slug]=n;save();all('[data-selection-count]').forEach(el=>{el.textContent=fa(Object.values(items).reduce((a,b)=>a+b,0));});});
  label.append(input);
  const remove=document.createElement('button');remove.type='button';remove.textContent='حذف';remove.setAttribute('aria-label',`حذف ${p.title}`);remove.addEventListener('click',()=>{delete items[p.slug];save();render();announce('کالا از سبد انتخاب حذف شد.');$('[data-selection-copy]')?.focus();});
  row.append(a,label,remove);list.append(row);
 }
 const copy=$('[data-selection-copy]');if(copy) copy.disabled=!Object.keys(items).length;
}
all('[data-selection-add]').forEach(button=>button.addEventListener('click',()=>{
 const slug=button.dataset.selectionAdd;if(!catalog.some(p=>p.slug===slug))return;
 if ((items[slug]||0)>=99){announce('حداکثر تعداد قابل انتخاب ۹۹ است.');return;}
 items[slug]=(items[slug]||0)+1;save();render();announce(persistent?'کالا به سبد انتخاب اضافه شد؛ هنوز سفارشی ثبت نشده است.':'کالا اضافه شد؛ ذخیره مرورگر در دسترس نیست و با خروج از صفحه فهرست حفظ نمی‌شود.');
}));
$('[data-selection-copy]')?.addEventListener('click',async()=>{
 const text=['درخواست استعلام قیمت و موجودی:',...catalog.filter(p=>items[p.slug]).map(p=>`${p.title} — تعداد ${fa(items[p.slug])}`),'لطفاً قیمت، موجودی و شرایط ارسال را اعلام کنید.'].join('\n');
 try{await navigator.clipboard.writeText(text);announce('فهرست کپی شد. برای فروشنده ارسال کنید؛ این کار سفارش ثبت نمی‌کند.');}
 catch {let field=$('[data-selection-copy-fallback]');if(!field){field=document.createElement('textarea');field.dataset.selectionCopyFallback='';field.readOnly=true;field.setAttribute('aria-label','فهرست استعلام برای کپی دستی');$('[data-selection-list]').after(field);}field.value=text;field.focus();field.select();announce('کپی خودکار ممکن نشد؛ متن انتخاب‌شده را دستی کپی کنید.');}
});
const grid=$('[data-selection-grid]');
function filter(){
 if(!grid)return;
 const query=normalize($('[data-selection-search]').value);
 const category=$('[data-selection-category]')?.value || '';
 const cap=$('[data-selection-capacity]').value;
 const dir=$('[data-selection-sort]').value==='desc'?-1:1;
 const cards=all('[data-selection-product]');let count=0;
 cards.sort((a,b)=>dir*(Number(a.dataset.capacity)-Number(b.dataset.capacity))).forEach(card=>{
  card.hidden=!(query.split(/\s+/).every(term=>normalize(card.dataset.name).includes(term))&&(!category||card.dataset.category===category)&&(!cap||card.dataset.capacity===cap));if(!card.hidden)count++;grid.append(card);
 });
 $('[data-selection-results]').textContent=`${fa(count)} محصول`;$('[data-selection-empty]').hidden=count!==0;
}
all('[data-category-pick]').forEach(button=>button.addEventListener('click',()=>{
 $('[data-selection-category]').value=button.dataset.categoryPick;
 $('[data-selection-capacity]').value='';
 $('[data-selection-search]').value='';
 filter();$('[data-selection-category]').focus();
}));
all('[data-selection-category], [data-selection-search], [data-selection-capacity], [data-selection-sort]').forEach(el=>el.addEventListener(el.type==='search'?'input':'change',filter));
render();filter();
