// Staging transport only. Not imported by the public pages.
// Never persist message bodies or session tokens in browser storage.
export function createMessageClient(fetcher = globalThis.fetch) {
  let session = null;
  let busy = false;
  const endpoint = '/api/messages.php';
  async function request(options) {
    const response = await fetcher(endpoint, { credentials: 'same-origin', cache: 'no-store', ...options });
    let data;
    try { data = await response.json(); } catch { throw new Error('پاسخ سرور معتبر نیست؛ ثبت پیام تأیید نشده است.'); }
    if (!response.ok) {
      if (response.status === 403) session = null;
      // Do not render arbitrary backend/proxy response text in the UI.
      const messages = {
        403: 'نشست معتبر نیست؛ فرم را دوباره آماده کنید.',
        422: 'موضوع و متن پیام را بررسی کنید.',
        429: 'تعداد درخواست‌ها زیاد است؛ بعداً تلاش کنید.',
        503: 'دریافت پیام فعلاً در دسترس نیست.'
      };
      throw new Error(messages[response.status] || 'ثبت پیام تأیید نشده است؛ بعداً تلاش کنید.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('پاسخ سرور معتبر نیست.');
    return data;
  }
  const validReference = value => typeof value === 'string' && /^[1-9][0-9]{4}$/.test(value);
  return {
    async prepare() {
      if (busy) throw new Error('درخواست قبلی در حال انجام است.');
      busy = true;
      session = null;
      try {
        const data = await request({ method: 'GET' });
        if (!/^[a-f0-9]{64}$/.test(data.csrf || '') || !/^[a-f0-9]{64}$/.test(data.ticket || '') || (data.reference !== null && !validReference(data.reference))) throw new Error('اطلاعات نشست معتبر نیست.');
        session = { csrf: data.csrf, ticket: data.ticket, reference: data.reference };
        return { reference: session.reference };
      } finally { busy = false; }
    },
    async submit(fields) {
      if (busy) throw new Error('درخواست قبلی در حال انجام است.');
      if (!session) throw new Error('ابتدا فرم را آماده کنید.');
      if (session.reference) return { reference: session.reference, alreadySubmitted: true };
      busy = true;
      try {
        const payload = { ticket: session.ticket };
        for (const key of ['name', 'topic', 'message', 'contact', 'page', 'website']) payload[key] = fields[key] ?? '';
        const data = await request({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(payload) });
        if (!validReference(data.reference)) throw new Error('کد پیگیری معتبر دریافت نشد؛ ثبت پیام تأیید نشده است.');
        session.reference = data.reference;
        return { reference: data.reference, alreadySubmitted: false };
      } finally { busy = false; }
    }
  };
}
