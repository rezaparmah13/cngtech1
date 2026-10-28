const form = document.querySelector('#registration-form');
if (form) {
  const fields = document.querySelector('#request-fields');
  const status = document.querySelector('#request-availability');
  const result = document.querySelector('#request-result');
  const submit = document.querySelector('#request-submit');
  let csrf = '', ticket = '';
  const update = () => {
    const minor = form.elements.ownerType.checked;
    const guardian = document.querySelector('#guardian-fields');
    guardian.hidden = !minor; guardian.disabled = !minor;
    form.elements.mobile.disabled = minor;
    form.elements.mobile.required = !minor;
    const alternate = document.querySelector('#alternate-contact').checked;
    document.querySelector('#callback-field').hidden = !alternate;
    form.elements.callback.disabled = !alternate;
    for (const field of form.querySelectorAll('input, select')) {
      if (field.matches(':disabled')) clearError(field);
    }
  };
  const digits = value => value.replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim();
  function clearError(field) {
    field.setCustomValidity('');
    field.removeAttribute('aria-invalid');
    const error = document.getElementById(`${field.id || field.name}-error`);
    if (error) error.hidden = true;
  }
  function validate(field, display = false) {
    if (!field.matches('input, select')) return;
    clearError(field);
    if (field.matches(':disabled')) return;
    const value = digits(field.value);
    let message = '';
    if (field.validity.valueMissing) message = field.name === 'consent' ? 'برای ارسال، رضایت و اختیار قانونی لازم است.' : 'لطفاً این بخش را تکمیل کنید.';
    else if (['mobile', 'guardianMobile', 'callback'].includes(field.name) && !/^09\d{9}$/.test(value)) message = 'شماره همراه را به‌صورت ۱۱ رقمی و با ۰۹ وارد کنید.';
    else if (['ownerId', 'guardianId'].includes(field.name) && !/^\d{10}$/.test(value)) message = 'کد ملی را به‌صورت ۱۰ رقم، همراه با صفرهای ابتدایی وارد کنید.';
    else if (['ownerBirth', 'guardianBirth'].includes(field.name) && !/^1[2345]\d{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(value)) message = 'تاریخ تولد شمسی را به شکل ۱۳۷۰/۰۵/۲۱ وارد کنید.';
    field.setCustomValidity(message);
    if (message && display) {
      const id = `${field.id || field.name}-error`;
      let error = document.getElementById(id);
      if (!error) {
        error = document.createElement('small'); error.id = id; error.className = 'request-error';
        const container = field.closest('.field') || field.closest('label')?.querySelector('span');
        container.append(error);
        field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
      }
      error.hidden = false; error.textContent = message;
      field.setAttribute('aria-invalid', 'true');
    }
  }
  form.addEventListener('input', event => validate(event.target, true));
  form.addEventListener('change', event => validate(event.target, true));
  form.addEventListener('focusout', event => validate(event.target, true));
  form.addEventListener('invalid', event => validate(event.target, true), true);
  form.addEventListener('change', update);
  async function api(data) {
    const response = await fetch('/api/requests.php', {
      method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {},
      ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000)
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('فرم روی این پیش‌نمایش فعال نیست. ارسال واقعی به PHP، پایگاه‌داده و HTTPS روی هاست نیاز دارد.');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'ارتباط برقرار نشد. بعداً تلاش کنید یا با مجموعه تماس بگیرید.');
    return payload;
  }
  function showSuccess(reference, existing = false) {
    fields.disabled = true;
    status.textContent = existing ? 'درخواست شما قبلاً ثبت شده و نیازی به ارسال مجدد نیست.' : 'درخواست شما ثبت شد.';
    result.hidden = false;
    result.textContent = `شماره پیگیری: ${reference} — برای ادامه مراحل ثبت‌نام با شما تماس می‌گیریم. لطفاً شماره پیگیری را نگه دارید. این شماره، کد ثبت‌نام سامانه رسمی نیست.`;
  }
  api().then(data => {
    csrf = data.csrf; ticket = data.ticket;
    if (!csrf || !ticket) throw new Error('فرم هنوز فعال نشده است.');
    if (data.reference) { showSuccess(data.reference, true); return; }
    fields.disabled = false; update();
    status.textContent = 'فرم آماده ارسال است. اطلاعات فقط برای تماس و پیگیری درخواست به CNG TECH ارسال می‌شود.';
  }).catch(error => { status.textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'فرم در حال حاضر در دسترس نیست. لطفاً اتصال اینترنت را بررسی کنید و کمی بعد دوباره مراجعه کنید.' : error.message; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    for (const field of form.querySelectorAll('input, select')) validate(field, true);
    if (!csrf || fields.disabled || submit.disabled || !form.reportValidity()) return;
    submit.disabled = true; result.hidden = false; result.textContent = 'در حال ارسال؛ لطفاً صبر کنید…';
    const data = Object.fromEntries(new FormData(form));
    data.ownerType = form.elements.ownerType.checked ? 'minor' : 'adult';
    // The API's mobile field always belongs to the selected adult contact.
    if (data.ownerType === 'minor') data.mobile = data.guardianMobile;
    delete data.guardianMobile;
    data.ticket = ticket;
    try {
      const response = await api(data);
      form.reset(); update(); showSuccess(response.reference);
    } catch (error) {
      result.textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'نتیجه ارسال مشخص نیست. اتصال اینترنت را بررسی کنید و بدون تغییر اطلاعات دوباره تلاش کنید؛ درخواست تکراری ثبت نخواهد شد.' : error.message;
      submit.disabled = false;
    }
    result.focus();
  });
}
