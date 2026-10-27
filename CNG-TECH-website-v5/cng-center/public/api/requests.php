<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/lib.php';
headers_private();
try {
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
        header('Allow: GET, POST'); respond(405, ['message' => 'روش درخواست پشتیبانی نمی‌شود.']);
    }
    session_open();
    clean_expired();
    // Keep retries idempotent; a reload must show the completed request, not a new form.
    $ticketHash = hash('sha256', $_SESSION['ticket']);
    $existing = db()->prepare('SELECT reference FROM cng_requests WHERE ticket_hash = ?');
    $existing->execute([$ticketHash]);
    $reference = $existing->fetchColumn();
    if ($_SERVER['REQUEST_METHOD'] === 'GET') respond(200, ['csrf' => $_SESSION['csrf'], 'ticket' => $_SESSION['ticket'], 'reference' => $reference ?: null]);
    if (!post_valid($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) respond(403, ['message' => 'اعتبار نشست پایان یافته است. صفحه را تازه‌سازی کنید.']);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') respond(415, ['message' => 'قالب درخواست معتبر نیست.']);
    $raw = file_get_contents('php://input', false, null, 0, 12289);
    if ($raw === false || strlen($raw) > 12288) respond(413, ['message' => 'حجم درخواست بیش از حد مجاز است.']);
    try { $input = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { respond(400, ['message' => 'قالب اطلاعات معتبر نیست.']); }
    if (!is_array($input) || !is_string($input['ticket'] ?? null) || !hash_equals($_SESSION['ticket'], $input['ticket'])) respond(403, ['message' => 'اعتبار فرم پایان یافته است. صفحه را تازه‌سازی کنید.']);
    // One request per form session, including safe retries after a lost response.
    if ($reference) respond(200, ['reference' => $reference]);
    if (!rate_limit('request-attempt', 12, 900)) {
        header('Retry-After: 900'); respond(429, ['message' => 'تعداد تلاش‌ها زیاد است. ۱۵ دقیقه بعد دوباره تلاش کنید.']);
    }
    try { $data = validate_request($input); }
    catch (InvalidArgumentException $e) { respond(422, ['message' => $e->getMessage()]); }
    if (!rate_limit('request-submit', 5, 3600) || !rate_limit('request-global', 200, 3600, true)) {
        header('Retry-After: 3600'); respond(429, ['message' => 'ظرفیت ارسال موقتاً تکمیل شده است. یک ساعت دیگر تلاش کنید یا تماس بگیرید.']);
    }
    $reference = strtoupper(bin2hex(random_bytes(6)));
    $stmt = db()->prepare('INSERT INTO cng_requests (id, reference, ticket_hash, payload, status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())');
    $stmt->execute([bin2hex(random_bytes(16)), $reference, $ticketHash, encrypt_payload($data), 'new']);
    respond(201, ['reference' => $reference]);
} catch (Throwable $e) {
    // Never log payloads, database credentials or raw exception messages.
    error_log('CNG request backend unavailable; inspect server configuration privately.');
    respond(503, ['message' => 'فرم فعلاً آماده دریافت اطلاعات نیست. برای هماهنگی با ۰۹۱۱۶۴۳۸۶۶۰ تماس بگیرید.']);
}
