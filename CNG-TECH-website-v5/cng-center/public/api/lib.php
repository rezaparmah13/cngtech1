<?php
declare(strict_types=1);
// Shared backend. No credentials belong inside the web root.
function config(): array {
    static $config;
    if ($config !== null) return $config;
    $file = dirname(__DIR__, 2) . '/cng-private/config.php';
    if (!is_file($file)) throw new RuntimeException('Backend not configured');
    $config = require $file;
    if (!is_array($config) || ($config['enabled'] ?? false) !== true || !extension_loaded('sodium') || !extension_loaded('pdo_mysql')) throw new RuntimeException('Backend unavailable');
    $key = base64_decode($config['encryption_key'] ?? '', true);
    if ($key === false || strlen($key) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES || !preg_match('~^https://[a-z0-9.-]+$~i', $config['origin'] ?? '') || strlen($config['admin_password_hash'] ?? '') < 50) throw new RuntimeException('Invalid configuration');
    return $config;
}
function db(): PDO {
    static $db;
    if ($db) return $db;
    $c = config();
    $db = new PDO($c['dsn'], $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    $db->exec("SET time_zone = '+00:00'");
    return $db;
}
function headers_private(): void {
    header('Cache-Control: no-store, private, max-age=0');
    header('Pragma: no-cache');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('X-Content-Type-Options: nosniff');
    // Preserve same-origin form POST origins; no-referrer makes browser navigation POSTs use Origin: null.
    header('Referrer-Policy: same-origin');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
}
function session_open(): void {
    $c = config();
    // Never trust X-Forwarded-Proto from an arbitrary client. Configure HTTPS at the host.
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') throw new RuntimeException('HTTPS required');
    if (strtolower($_SERVER['HTTP_HOST'] ?? '') !== strtolower((string)parse_url($c['origin'], PHP_URL_HOST))) throw new RuntimeException('Wrong host');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('__Host-cng-session');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    if (!session_start()) throw new RuntimeException('Session storage unavailable');
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $_SESSION['ticket'] ??= bin2hex(random_bytes(32));
}
function post_valid(string $token): bool {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    return $_SERVER['REQUEST_METHOD'] === 'POST' && ($origin === '' || hash_equals(config()['origin'], $origin)) && isset($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}
function respond(int $status, array $data): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function clean_expired(): void {
    db()->exec('DELETE FROM cng_requests WHERE created_at < UTC_TIMESTAMP() - INTERVAL 30 DAY');
    db()->exec('DELETE FROM cng_rate_limits WHERE expires_at < UTC_TIMESTAMP()');
}
function rate_limit(string $purpose, int $max, int $seconds, bool $global = false): bool {
    // Fixed buckets, atomic increments. IPs are keyed hashes, not stored in plain text.
    $now = time();
    $bucket = intdiv($now, $seconds);
    $identity = $global ? 'global' : ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $key = hash_hmac('sha256', $purpose . '|' . $identity . '|' . $bucket, config()['encryption_key']);
    $expires = gmdate('Y-m-d H:i:s', ($bucket + 1) * $seconds + 60);
    $stmt = db()->prepare('INSERT INTO cng_rate_limits (bucket_key, hits, expires_at) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE hits = hits + 1');
    $stmt->execute([$key, $expires]);
    $stmt = db()->prepare('SELECT hits FROM cng_rate_limits WHERE bucket_key = ?');
    $stmt->execute([$key]);
    return (int)$stmt->fetchColumn() <= $max;
}
function encrypt_payload(array $data): string {
    $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return base64_encode($nonce . sodium_crypto_secretbox(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $nonce, base64_decode(config()['encryption_key'], true)));
}
function decrypt_payload(string $value): array {
    $raw = base64_decode($value, true);
    if ($raw === false || strlen($raw) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + SODIUM_CRYPTO_SECRETBOX_MACBYTES) throw new RuntimeException('Invalid encrypted data');
    $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), base64_decode(config()['encryption_key'], true));
    if ($plain === false) throw new RuntimeException('Cannot decrypt');
    return json_decode($plain, true, 32, JSON_THROW_ON_ERROR);
}
function digits(string $value): string {
    return strtr(trim($value), array_combine(preg_split('//u', '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', -1, PREG_SPLIT_NO_EMPTY), str_split('01234567890123456789')));
}
function national_id(string $id): bool {
    if (!preg_match('/^\d{10}$/D', $id) || preg_match('/^(\d)\1{9}$/D', $id)) return false;
    $sum = 0;
    for ($i = 0; $i < 9; $i++) $sum += (int)$id[$i] * (10 - $i);
    $remainder = $sum % 11;
    return (int)$id[9] === ($remainder < 2 ? $remainder : 11 - $remainder);
}
function birth_date(string $date): bool {
    // Structural Jalali validation, not an identity/age registry lookup.
    if (!preg_match('~^(1[2345]\d{2})/(0[1-9]|1[0-2])/(0[1-9]|[12]\d|3[01])$~D', $date, $m)) return false;
    return (int)$m[2] <= 6 || ((int)$m[2] <= 11 && (int)$m[3] <= 30) || ((int)$m[2] === 12 && (int)$m[3] <= 30);
}
function validate_request(array $input): array {
    $text = function(string $key) use ($input): string {
        if (!isset($input[$key]) || !is_string($input[$key]) || strlen($input[$key]) > 200) return '';
        return digits($input[$key]);
    };
    $type = $text('ownerType');
    if (!in_array($type, ['adult', 'minor'], true)) throw new InvalidArgumentException('گروه سنی مالک را انتخاب کنید.');
    if ($text('consent') !== 'on') throw new InvalidArgumentException('برای ارسال، رضایت و اختیار قانونی لازم است.');
    $data = ['ownerType' => $type, 'ownerId' => $text('ownerId'), 'ownerBirth' => $text('ownerBirth'), 'mobile' => $text('mobile'), 'plate' => $text('plate')];
    if (!national_id($data['ownerId'])) throw new InvalidArgumentException('کد ملی مالک باید ۱۰ رقم و از نظر ساختار معتبر باشد.');
    if (!birth_date($data['ownerBirth'])) throw new InvalidArgumentException('تاریخ تولد مالک را به شکل شمسی ۱۳۷۰/۰۵/۲۱ وارد کنید.');
    if (!preg_match('/^09\d{9}$/D', $data['mobile'])) throw new InvalidArgumentException('شماره همراه را با ۰۹ و در ۱۱ رقم وارد کنید.');
    if (!preg_match('/^[\p{Arabic}\p{L}\d\s\-]{5,40}$/uD', $data['plate']) || !preg_match('/\d/', $data['plate']) || preg_match('/[\x00-\x1F\x7F]/', $data['plate'])) throw new InvalidArgumentException('تمام اجزای پلاک خودرو را بدون نشانه‌های اضافی وارد کنید.');
    if ($text('alternateContact') === 'on') {
        $data['callback'] = $text('callback');
        if (!preg_match('/^09\d{9}$/D', $data['callback'])) throw new InvalidArgumentException('شماره تماس هماهنگی باید ۱۱ رقم و با ۰۹ شروع شود.');
    }
    if ($type === 'minor') {
        $data['guardianRelation'] = $text('guardianRelation');
        $data['guardianId'] = $text('guardianId');
        $data['guardianBirth'] = $text('guardianBirth');
        if (!in_array($data['guardianRelation'], ['father', 'mother'], true) || !national_id($data['guardianId']) || !birth_date($data['guardianBirth']) || $data['guardianId'] === $data['ownerId']) throw new InvalidArgumentException('نسبت، کد ملی متفاوت و تاریخ تولد پدر یا مادر را کامل و صحیح وارد کنید.');
    }
    $data['consentVersion'] = 'request-v2-privacy-linked';
    // Deliberately ignore extra keys: passwords, OTPs, uploads and identity scans are not accepted.
    return $data;
}
function html(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
