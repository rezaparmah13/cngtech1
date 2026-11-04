// Explicit staging opt-in only; public pages do not import this module.
import { createMessageClient } from './message-client.mjs';
const mounted = new WeakSet();
export async function mountMessageForm(root, { enabled = false, client = createMessageClient(), page = '/' } = {}) {
  if (enabled !== true || !root || mounted.has(root)) return false;
  const form = root.querySelector('form');
  const fieldset = root.querySelector('fieldset');
  const button = root.querySelector('button');
  const status = root.querySelector('[role="status"]');
  if (!form || !fieldset || !button || !status) return false;
  mounted.add(root);
  let sending = false;
  let finished = false;
  const announce = text => { status.textContent = text; };
  const receipt = reference => {
    finished = true;
    fieldset.disabled = true;
    button.disabled = true;
    announce(`پیام ثبت شده است. کد پیگیری: ${reference}. این رسید به معنی رزرو نوبت یا ثبت‌نام رسمی نیست.`);
    status.setAttribute('tabindex', '-1');
    status.focus();
  };
  // Intercept before enabling controls, including Enter-key submission.
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || finished || fieldset.disabled || !form.reportValidity()) return;
    const fields = { page, website: '' };
    for (const key of ['name', 'topic', 'message', 'contact']) fields[key] = form.elements.namedItem(key).value;
    sending = true;
    fieldset.disabled = true;
    form.setAttribute('aria-busy', 'true');
    announce('در حال ارسال؛ منتظر دریافت کد پیگیری بمانید.');
    try {
      const result = await client.submit(fields);
      receipt(result.reference);
    } catch {
      // Keep the entered text. Never insert response content as HTML.
      announce('ثبت پیام تأیید نشد. متن شما در فرم باقی مانده است. برای تلاش مجدد دکمه ارسال را بزنید؛ اگر نشست نامعتبر است، پیش از تازه‌سازی صفحه متن را نزد خود نگه دارید.');
    } finally {
      sending = false;
      form.setAttribute('aria-busy', 'false');
      if (!finished) fieldset.disabled = false;
    }
  });
  announce('در حال آماده‌سازی فرم پیام…');
  try {
    const result = await client.prepare();
    if (result.reference) receipt(result.reference);
    else {
      button.type = 'submit';
      button.disabled = false;
      fieldset.disabled = false;
      announce('فرم آماده است. ارسال پیام به معنی رزرو نوبت نیست.');
    }
  } catch {
    fieldset.disabled = true;
    button.disabled = true;
    announce('فرم پیام فعلاً در دسترس نیست؛ امکان ارسال وجود ندارد.');
  }
  return true;
}
