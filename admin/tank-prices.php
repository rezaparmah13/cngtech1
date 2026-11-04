<?php
declare(strict_types=1);
// Loaded by the existing authenticated admin controller; no standalone endpoint.
function tank_capacities(): array { return [20, 28, 52, 62, 75, 92, 100, 113]; }
function tank_price_path(): string { return dirname(__DIR__, 2) . '/cng-private/tank-prices.json'; }
function tank_price_load(): array {
    $path = tank_price_path();
    if (!file_exists($path)) return ['version' => 1, 'revision' => 0, 'products' => []];
    $data = json_decode((string)file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($data) || ($data['version'] ?? null) !== 1 || !is_int($data['revision'] ?? null) || !is_array($data['products'] ?? null)) throw new RuntimeException('Invalid private catalog');
    return $data;
}
function tank_price_parse(mixed $raw): ?int {
    if (!is_string($raw) || strlen($raw) > 120) throw new InvalidArgumentException('قیمت نامعتبر است.');
    $raw = strtr($raw, array_combine(preg_split('//u', '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', -1, PREG_SPLIT_NO_EMPTY), str_split('01234567890123456789')));
    $raw = str_replace([',', '٬', ' '], '', trim($raw));
    if ($raw === '') return null;
    if (!preg_match('/^[0-9]{1,13}$/D', $raw) || (float)$raw < 1 || (float)$raw > 1000000000000) throw new InvalidArgumentException('قیمت باید عدد صحیح مثبت، حداکثر یک تریلیون تومان باشد.');
    return (int)$raw;
}
function tank_price_save(array $post): void {
    $products = [];
    foreach (tank_capacities() as $capacity) {
        $price = tank_price_parse($post['price_' . $capacity] ?? null);
        $availability = $post['availability_' . $capacity] ?? null;
        if (!in_array($availability, ['inquiry', 'available', 'unavailable'], true)) throw new InvalidArgumentException('وضعیت موجودی نامعتبر است.');
        $products['tank-' . $capacity] = ['capacity' => $capacity, 'priceToman' => $price, 'availability' => $availability];
    }
    $revision = $post['revision'] ?? null;
    if (!is_string($revision) || !preg_match('/^[0-9]{1,10}$/D', $revision)) throw new InvalidArgumentException('نسخه اطلاعات نامعتبر است.');
    $path = tank_price_path();
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false) throw new RuntimeException('Private storage unavailable');
    $temporary = null;
    try {
        if (!chmod($path . '.lock', 0600) || !flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock prices');
        $old = tank_price_load();
        if ((int)$revision !== $old['revision']) throw new InvalidArgumentException('اطلاعات در صفحه دیگری تغییر کرده است. صفحه قیمت‌ها را دوباره باز کنید و تغییرات را تکرار کنید.');
        $data = ['version' => 1, 'revision' => $old['revision'] + 1, 'mode' => 'telephone', 'currency' => 'TOMAN', 'updatedAt' => gmdate('c'), 'products' => $products];
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
        $temporary = tempnam(dirname($path), '.tank-prices-');
        if ($temporary === false || !chmod($temporary, 0600)) throw new RuntimeException('Cannot create private file');
        if (file_put_contents($temporary, $json) !== strlen($json) || !rename($temporary, $path)) throw new RuntimeException('Cannot save prices');
        $temporary = null;
    } finally {
        if (is_string($temporary) && is_file($temporary)) unlink($temporary);
        flock($lock, LOCK_UN); fclose($lock);
    }
}
function tank_price_page(): string {
    $data = tank_price_load();
    $body = '<nav class="admin-toolbar"><a class="button button-ghost" href="/admin/">درخواست‌ها و پیام‌ها</a><form method="post" action="/admin/">' . csrf_field() . '<input type="hidden" name="action" value="logout"><button class="button button-ghost">خروج امن</button></form></nav><h2>قیمت و موجودی مخزن‌ها</h2><p class="notice">این اطلاعات در فایل خصوصی سرور ذخیره می‌شود، نه مرورگر. اتصال نمایش قیمت به فروشگاه هنوز فعال نیست؛ ذخیره این فرم قیمت عمومی سایت را تغییر نمی‌دهد. پرداخت آنلاین همچنان غیرفعال است.</p>';
    if (($_GET['saved'] ?? '') === '1') $body .= '<p role="status">قیمت‌ها و وضعیت موجودی در سرور ذخیره شدند.</p>';
    if (isset($data['updatedAt'])) $body .= '<p>آخرین تغییر (UTC): <bdi>' . html($data['updatedAt']) . '</bdi></p>';
    $body .= '<p>قیمت‌ها به تومان هستند. قیمت خالی یعنی «تماس بگیرید». صفر قیمت معتبر نیست. موجودی را مستقل از قیمت تعیین کنید.</p><form method="post" action="/admin/">' . csrf_field() . '<input type="hidden" name="action" value="tank-prices"><input type="hidden" name="revision" value="' . html((string)$data['revision']) . '"><div class="admin-list">';
    foreach (tank_capacities() as $capacity) {
        $p = $data['products']['tank-' . $capacity] ?? [];
        $body .= '<section class="request-panel"><h3>مخزن ' . $capacity . ' لیتری</h3><div class="field"><label for="price-' . $capacity . '">قیمت به تومان</label><input id="price-' . $capacity . '" name="price_' . $capacity . '" inputmode="numeric" maxlength="40" placeholder="خالی = تماس بگیرید" value="' . html((string)($p['priceToman'] ?? '')) . '"></div><div class="field"><label for="availability-' . $capacity . '">موجودی</label><select id="availability-' . $capacity . '" name="availability_' . $capacity . '">';
        foreach (['inquiry' => 'نیازمند استعلام', 'available' => 'موجود', 'unavailable' => 'ناموجود'] as $value => $label) $body .= '<option value="' . $value . '"' . (($p['availability'] ?? 'inquiry') === $value ? ' selected' : '') . '>' . $label . '</option>';
        $body .= '</select></div></section>';
    }
    return $body . '</div><button class="button">ذخیره قیمت و موجودی در سرور</button></form>';
}
