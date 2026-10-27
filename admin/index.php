<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require dirname(__DIR__) . '/api/lib.php';
headers_private();
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . html($_SESSION['csrf']) . '">'; }
function redirect_admin(string $query = ''): never { header('Location: /admin/' . $query, true, 303); exit; }
function shell(string $body): never {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>مدیریت درخواست‌ها | CNG TECH</title><link rel="stylesheet" href="/assets/style.css"><link rel="stylesheet" href="/assets/requests.css"></head><body class="admin-page"><main class="container section"><a href="/">CNG TECH · بازگشت به سایت</a><h1>مدیریت درخواست‌ها</h1>' . $body . '</main></body></html>';
    exit;
}
try {
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) { http_response_code(405); header('Allow: GET, POST'); shell('<p>روش درخواست مجاز نیست.</p>'); }
    session_open();
    $c = config();
    $message = '';
    if (!empty($_SESSION['admin']) && (time() - ($_SESSION['lastSeen'] ?? 0) > 1200 || time() - ($_SESSION['loginAt'] ?? 0) > 28800)) {
        unset($_SESSION['admin']);
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 4096) { http_response_code(413); shell('<p>حجم درخواست نامعتبر است.</p>'); }
        if (!is_string($_POST['csrf'] ?? null) || !post_valid($_POST['csrf'])) { http_response_code(403); shell('<p>نشست نامعتبر است. <a href="/admin/">دوباره وارد شوید.</a></p>'); }
        $action = $_POST['action'] ?? '';
        if ($action === 'login' && empty($_SESSION['admin'])) {
            // Throttle before password hashing, both per IP and globally.
            if (!rate_limit('admin-login', 10, 900) || !rate_limit('admin-login-global', 60, 900, true)) {
                http_response_code(429); header('Retry-After: 900'); $message = 'تلاش بیش از حد؛ ۱۵ دقیقه دیگر امتحان کنید.';
            } else {
                $username = is_string($_POST['username'] ?? null) ? $_POST['username'] : '';
                $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
                $valid = strlen($password) <= 256 && password_verify($password, $c['admin_password_hash']);
                if ($valid && hash_equals($c['admin_user'], $username)) {
                    session_regenerate_id(true);
                    $_SESSION['admin'] = true;
                    $_SESSION['lastSeen'] = $_SESSION['loginAt'] = time();
                    $_SESSION['csrf'] = bin2hex(random_bytes(32));
                    redirect_admin();
                }
                http_response_code(401); $message = 'نام کاربری یا رمز عبور نادرست است.';
            }
        } elseif (!empty($_SESSION['admin'])) {
            if ($action === 'logout') {
                $_SESSION = [];
                setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
                session_destroy(); redirect_admin();
            }
            $id = is_string($_POST['id'] ?? null) ? $_POST['id'] : '';
            if (!preg_match('/^[a-f0-9]{32}$/D', $id)) { http_response_code(400); shell('<p>شناسه نامعتبر است.</p>'); }
            if ($action === 'delete' && ($_POST['confirm'] ?? '') === 'yes') {
                $stmt = db()->prepare('DELETE FROM cng_requests WHERE id = ?'); $stmt->execute([$id]); redirect_admin('?done=deleted');
            }
            if ($action === 'status' && in_array($_POST['status'] ?? '', ['new', 'contacted', 'closed'], true)) {
                $stmt = db()->prepare('UPDATE cng_requests SET status = ? WHERE id = ?'); $stmt->execute([$_POST['status'], $id]); redirect_admin('?id=' . $id);
            }
            http_response_code(400); shell('<p>عملیات معتبر نیست. <a href="/admin/">بازگشت</a></p>');
        }
    }
    if (empty($_SESSION['admin'])) shell('<div class="admin-login request-panel"><p>ورود فقط برای مسئول مجاز CNG TECH. از دستگاه مشترک استفاده نکنید.</p>' . ($message ? '<p class="notice" role="alert">' . html($message) . '</p>' : '') . '<form method="post" action="/admin/">' . csrf_field() . '<input type="hidden" name="action" value="login"><div class="field"><label for="username">نام کاربری</label><input id="username" name="username" autocomplete="username" maxlength="80" required></div><div class="field"><label for="password">رمز عبور</label><input type="password" id="password" name="password" autocomplete="current-password" maxlength="256" required></div><button class="button">ورود</button></form></div>');
    $_SESSION['lastSeen'] = time();
    clean_expired();
    $body = '<div class="admin-toolbar"><a class="button button-ghost" href="/admin/">فهرست درخواست‌ها</a><form method="post" action="/admin/">' . csrf_field() . '<input type="hidden" name="action" value="logout"><button class="button button-ghost">خروج امن</button></form></div><p class="notice">اطلاعات محرمانه است؛ فقط برای پیگیری مجاز استفاده کنید. کد ورود مشتری را دریافت یا ذخیره نکنید. درخواست‌ها پس از ۳۰ روز حذف می‌شوند؛ پس از پایان کار می‌توانید زودتر حذف کنید.</p>';
    $statuses = ['new' => 'جدید', 'contacted' => 'تماس گرفته شد', 'closed' => 'پیگیری پایان یافت'];
    if (isset($_GET['id'])) {
        $id = is_string($_GET['id']) ? $_GET['id'] : '';
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) { http_response_code(404); shell($body . '<p>درخواست پیدا نشد.</p>'); }
        $stmt = db()->prepare('SELECT * FROM cng_requests WHERE id = ?'); $stmt->execute([$id]); $row = $stmt->fetch();
        if (!$row) { http_response_code(404); shell($body . '<p>درخواست پیدا نشد یا حذف شده است.</p>'); }
        $data = decrypt_payload($row['payload']);
        $labels = ['ownerType' => 'گروه سنی مالک', 'ownerId' => 'کد ملی مالک', 'ownerBirth' => 'تاریخ تولد مالک', 'guardianRelation' => 'نسبت', 'guardianId' => 'کد ملی پدر / مادر', 'guardianBirth' => 'تاریخ تولد پدر / مادر', 'mobile' => $data['ownerType'] === 'minor' ? 'همراه به نام پدر / مادر انتخاب‌شده' : 'همراه به نام مالک', 'plate' => 'پلاک خودرو', 'callback' => 'تماس هماهنگی', 'consentVersion' => 'نسخه رضایت ثبت‌شده'];
        $display = ['adult' => '۱۸ سال یا بیشتر (اظهار متقاضی)', 'minor' => 'زیر ۱۸ سال (اظهار متقاضی)', 'father' => 'پدر', 'mother' => 'مادر'];
        $body .= '<h2>پیگیری ' . html($row['reference']) . '</h2><p>زمان دریافت (UTC): <bdi>' . html($row['created_at']) . '</bdi></p><dl class="admin-details">';
        foreach ($labels as $key => $label) if (isset($data[$key])) $body .= '<div><dt>' . html($label) . '</dt><dd><bdi>' . html($display[$data[$key]] ?? $data[$key]) . '</bdi></dd></div>';
        $body .= '</dl><p class="fine-print">کد ملی فقط کنترل ساختاری شده است. سن، تاریخ تولد، مالکیت سیم‌کارت، پلاک و اختیار قانونی استعلام نشده‌اند و باید در مسیر رسمی بررسی شوند.</p><form class="admin-toolbar" method="post" action="/admin/">' . csrf_field() . '<input type="hidden" name="action" value="status"><input type="hidden" name="id" value="' . html($id) . '"><label for="status">وضعیت پیگیری</label><select id="status" name="status">';
        foreach ($statuses as $key => $label) $body .= '<option value="' . $key . '"' . ($row['status'] === $key ? ' selected' : '') . '>' . $label . '</option>';
        $body .= '</select><button class="button">ذخیره وضعیت</button></form><form class="admin-delete" method="post" action="/admin/">' . csrf_field() . '<input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="' . html($id) . '"><label class="request-check"><input type="checkbox" name="confirm" value="yes" required><span>حذف دائمی این درخواست را تأیید می‌کنم.</span></label><button class="button button-ghost">حذف اطلاعات</button></form>';
    } else {
        $page = max(1, min(100000, (int)($_GET['page'] ?? 1)));
        $count = (int)db()->query('SELECT COUNT(*) FROM cng_requests')->fetchColumn();
        $offset = ($page - 1) * 30;
        $rows = db()->query('SELECT id, reference, status, created_at FROM cng_requests ORDER BY created_at DESC, id DESC LIMIT 30 OFFSET ' . $offset)->fetchAll();
        $body .= '<p>تعداد درخواست‌های موجود: ' . $count . '</p>';
        if (($_GET['done'] ?? '') === 'deleted') $body .= '<p role="status">اطلاعات درخواست حذف شد.</p>';
        if (!$rows) $body .= '<p>درخواستی برای نمایش وجود ندارد.</p>';
        $body .= '<div class="admin-list">';
        foreach ($rows as $row) $body .= '<article><h2><a href="/admin/?id=' . html($row['id']) . '">درخواست ' . html($row['reference']) . '</a></h2><p>' . html($statuses[$row['status']] ?? '') . ' · <bdi>' . html($row['created_at']) . '</bdi> UTC</p><a href="/admin/?id=' . html($row['id']) . '">مشاهده جزئیات</a></article>';
        $body .= '</div><nav class="admin-toolbar" aria-label="صفحه‌های درخواست‌ها">';
        if ($page > 1) $body .= '<a href="?page=' . ($page - 1) . '">صفحه قبل</a>';
        if ($offset + 30 < $count) $body .= '<a href="?page=' . ($page + 1) . '">صفحه بعد</a>';
        $body .= '</nav>';
    }
    shell($body);
} catch (Throwable $e) {
    error_log('CNG admin backend unavailable; inspect server configuration privately.');
    http_response_code(503);
    shell('<p class="notice">پنل هنوز راه‌اندازی نشده یا موقتاً در دسترس نیست. تنظیمات خصوصی هاست و پایگاه‌داده را بررسی کنید.</p>');
}
