<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/lib.php';
headers_private();
try {
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) { header('Allow: GET, POST'); respond(405, ['message'=>'روش درخواست مجاز نیست.']); }
    session_open();
    if ((config()['messages_enabled'] ?? false) !== true) respond(503, ['message'=>'فرم پیام هنوز فعال نشده است.']);
    $_SESSION['message_ticket'] ??= bin2hex(random_bytes(32));
    $hash = hash('sha256', 'message:' . $_SESSION['message_ticket']);
    $existing = db()->prepare('SELECT reference FROM cng_requests WHERE ticket_hash = ?');
    $existing->execute([$hash]);
    $reference = $existing->fetchColumn();
    if ($_SERVER['REQUEST_METHOD'] === 'GET') respond(200, ['csrf'=>$_SESSION['csrf'], 'ticket'=>$_SESSION['message_ticket'], 'reference'=>$reference ?: null]);
    if (!post_valid($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) respond(403, ['message'=>'نشست معتبر نیست؛ صفحه را تازه‌سازی کنید.']);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') respond(415, ['message'=>'قالب درخواست معتبر نیست.']);
    $raw = file_get_contents('php://input', false, null, 0, 24577);
    if ($raw === false || strlen($raw)>24576) respond(413, ['message'=>'حجم پیام بیش از حد مجاز است.']);
    try { $input = json_decode($raw, true, 8, JSON_THROW_ON_ERROR); } catch (JsonException $e) { respond(400, ['message'=>'قالب پیام معتبر نیست.']); }
    if (!is_array($input) || !is_string($input['ticket'] ?? null) || !hash_equals($_SESSION['message_ticket'], $input['ticket'])) respond(403, ['message'=>'اعتبار فرم پایان یافته است.']);
    if ($reference) respond(200, ['reference'=>$reference]);
    if (!rate_limit('message-attempt', 12, 900)) respond(429, ['message'=>'تعداد تلاش‌ها زیاد است؛ ۱۵ دقیقه دیگر تلاش کنید.']);
    $data = ['kind'=>'message'];
    foreach (['name'=>400, 'topic'=>30, 'message'=>16000, 'contact'=>800, 'page'=>1000, 'website'=>200] as $key=>$max) {
        if (!is_string($input[$key] ?? '') || strlen($input[$key] ?? '') > $max) respond(422, ['message'=>'طول یا قالب یکی از فیلدها معتبر نیست.']);
        $data[$key] = trim($input[$key] ?? '');
    }
    if ($data['website'] !== '' || $data['message'] === '' || !in_array($data['topic'], ['question','service','followup','other'], true)) respond(422, ['message'=>'موضوع و متن پیام را درست وارد کنید.']);
    if (!preg_match('~^/[a-zA-Z0-9/_-]*$~D', $data['page'])) $data['page'] = '';
    unset($data['website']);
    if (!rate_limit('message-submit', 5, 3600) || !rate_limit('message-global', 200, 3600, true)) respond(429, ['message'=>'ظرفیت ارسال موقتاً تکمیل است؛ یک ساعت دیگر تلاش کنید.']);
    $payload = encrypt_payload($data);
    $insert = db()->prepare('INSERT INTO cng_requests (id, reference, ticket_hash, payload, status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())');
    for ($i=0; $i<128; $i++) {
        $reference = (string)random_int(10000,99999);
        try {
            $insert->execute([bin2hex(random_bytes(16)), $reference, $hash, $payload, 'new']);
            respond(201, ['reference'=>$reference]);
        } catch (PDOException $e) {
            if ((int)($e->errorInfo[1] ?? 0) !== 1062) throw $e;
            $existing->execute([$hash]);
            $previous = $existing->fetchColumn();
            if ($previous !== false) respond(200, ['reference'=>$previous]);
        }
    }
    respond(503, ['message'=>'ثبت پیام فعلاً ممکن نیست؛ بعداً دوباره تلاش کنید.']);
} catch (Throwable $e) {
    error_log('CNG message backend unavailable.');
    respond(503, ['message'=>'دریافت پیام فعلاً در دسترس نیست. پیام شما تأیید نشده است؛ بعداً دوباره تلاش کنید.']);
}
