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
export function eligibilityMessage({ type, year, singleFuel, previousPlan }, { minimum = 1394, pickupMinimum = 1389, maxYear }) {
  const invalid = text => ({ error: true, status: 'invalid', reasons: [], text });
  if (!['sedan', 'hatchback', 'pickup'].includes(type)) return invalid('نوع خودرو را انتخاب کنید.');
  if (!Number.isInteger(year) || year < 1300 || year > maxYear) return invalid('سال ساخت خودرو را مطابق کارت خودرو انتخاب کنید.');
  if (!['yes', 'no'].includes(singleFuel) || !['yes', 'no', 'unknown'].includes(previousPlan)) return invalid('به همه پرسش‌های شرایط خودرو پاسخ دهید.');
  const reasons = [];
  const faYear = value => String(value).replace(/\d/g, n => '۰۱۲۳۴۵۶۷۸۹'[n]);
  if (type === 'hatchback') reasons.push('خودروهای سواری باید صندوق عقب مجزا داشته باشند؛ سواری هاچ‌بک با این شرط مطابقت ندارد.');
  const threshold = type === 'pickup' ? pickupMinimum : minimum;
  if (year < threshold) reasons.push(`مدل خودروهای ${type === 'pickup' ? 'وانت' : 'سواری'} باید ${faYear(threshold)} یا بالاتر باشد.`);
  if (singleFuel === 'no') reasons.push('نوع سوخت خودرو در سند باید تک‌سوز بنزینی درج شده باشد.');
  if (previousPlan === 'yes') reasons.push('خودرو نباید قبلاً از طریق طرح دولتی دوگانه‌سوز شده باشد.');
  const unknown = 'برای مشخص شدن امکان ثبت‌نام، سابقه استفاده خودرو از طرح دولتی باید بررسی شود.';
  if (reasons.length) {
    if (previousPlan === 'unknown') reasons.push(unknown);
    return { error: false, status: 'ineligible', reasons, text: 'بر اساس پاسخ‌های شما، خودرو با شرایط اولیه این طرح مطابقت ندارد. پذیرش نهایی به تأیید سامانه رسمی بستگی دارد.' };
  }
  if (previousPlan === 'unknown') return { error: false, status: 'unknown', reasons, text: `${unknown} پذیرش نهایی به تأیید سامانه رسمی بستگی دارد.` };
  return { error: false, status: 'eligible', reasons, text: 'خودروی شما شرایط اولیه اعلام‌شده را دارد. برای پیگیری مراحل، فرم درخواست ثبت‌نام را تکمیل کنید. پذیرش نهایی به تأیید سامانه رسمی بستگی دارد.' };
}
