export function normalizeDigits(value) {
  return String(value).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
}
export function parseNumber(value) {
  const clean = normalizeDigits(value).trim().replace(/[٬,]/g, '').replace('٫', '.');
  return clean !== '' && /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
}
export function calculateSavings({ distance, petrolConsumption, gasConsumption, petrolPrice, gasPrice, gasShare }) {
  const values = [distance, petrolConsumption, gasConsumption, petrolPrice, gasPrice, gasShare];
  if (values.some(v => typeof v !== 'number' || !Number.isFinite(v)) || distance <= 0 || distance > 100000 || petrolConsumption <= 0 || petrolConsumption > 100 || gasConsumption <= 0 || gasConsumption > 100 || petrolPrice <= 0 || petrolPrice > 10000000 || gasPrice <= 0 || gasPrice > 10000000 || gasShare < 0 || gasShare > 100) throw new RangeError('مقدارهای واردشده معتبر نیستند. واحدها و محدوده‌ها را بررسی کنید.');
  const petrolOnly = distance / 100 * petrolConsumption * petrolPrice;
  const share = gasShare / 100;
  const mixed = petrolOnly * (1 - share) + distance / 100 * share * gasConsumption * gasPrice;
  const monthly = petrolOnly - mixed;
  return { petrolOnly, mixed, monthly, annual: monthly * 12, percent: monthly / petrolOnly * 100 };
}
export function eligibilityMessage(type, year, minimum, maxYear) {
  if (type === 'private') {
    if (!Number.isInteger(year) || year < 1300 || year > maxYear) return { error: true, text: 'سال مدل را به‌صورت چهاررقمی و مطابق کارت خودرو وارد کنید.' };
    return year >= minimum
      ? { error: false, text: 'سال مدل شما با شرط سنی ذکرشده در اطلاعیه هم‌خوان است؛ این نتیجه تأیید مشمول بودن نیست. شرایط فعلی خودرو، ظرفیت و پذیرش را در سامانه رسمی بررسی کنید.' }
      : { error: false, text: 'سال مدل شما پایین‌تر از حد اعلام‌شده در اطلاعیه خودروهای شخصی است. این ابزار از وضعیت لحظه‌ای طرح خبر ندارد؛ برای شرایط جدید یا سایر گروه‌ها به سامانه رسمی مراجعه کنید.' };
  }
  if (type === 'online') return { error: false, text: 'در خبر ۲۹ شهریور ۱۴۰۵، مسیر خودروهای پرپیمایش اینترنتی بر پایه معرفی سکو و پیامک تأیید توضیح داده شده است. وضعیت معرفی و پذیرش خود را از سکوی مربوط و سامانه رسمی بررسی کنید؛ این ابزار صلاحیت شما را تأیید نمی‌کند.' };
  if (type === 'public') return { error: false, text: 'برای تاکسی و وانت عمومی، شرایط و معرفی از مسیر مربوط باید در سامانه رسمی بررسی شود. شرط مدل خودروهای شخصی به‌تنهایی ملاک تصمیم برای این گروه نیست.' };
  return { error: true, text: 'نوع کاربری خودرو را انتخاب کنید.' };
}
