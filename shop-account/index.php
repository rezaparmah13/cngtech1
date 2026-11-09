<?php
declare(strict_types=1);
/** Customer storefront TEMPLATE only: restricted staging /shop/index.php.
 * Keep disabled until release approval. Never copy backend/configuration into public_html. */
// Set these locally after approval. Never populate from GET/POST/cookies/headers.
$privateBackend = dirname(__DIR__, 2) . '/cng-private/backend/shop'; // e.g. /home/ACCOUNT/cng-private/backend/shop
$privateConfig = dirname(__DIR__, 2) . '/cng-private/shop-customer-http.json';  // e.g. /home/ACCOUNT/cng-private/shop-customer-http.json
$publicRoot = dirname(__DIR__);     // canonical absolute document root

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
// Host PHP configuration must also disable display_errors for startup/parse failures.
$bufferLevel = ob_get_level();
ob_start();
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) return false;
    // Do not propagate diagnostic messages containing paths, SQL or credentials.
    throw new ErrorException('shop_entrypoint_failure', 0, $severity);
});
$response = ['status' => 503, 'headers' => [
    'Content-Type' => 'text/plain; charset=utf-8', 'Cache-Control' => 'no-store',
    'X-Content-Type-Options' => 'nosniff',
    'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy' => 'no-referrer'], 'body' => 'Request unavailable'];
try {
    if ($privateBackend === '' || $privateConfig === '' || $publicRoot === '') {
        $response['status'] = 404;
    } else {
        $backend = realpath($privateBackend);
        $web = realpath($publicRoot);
        if ($backend === false || $backend !== $privateBackend || $web === false || $web !== $publicRoot
            || !is_dir($web) || $backend === $web || str_starts_with($backend, rtrim($web, '/') . '/')) {
            throw new RuntimeException('private_backend_required');
        }
        require_once $backend . '/ShopCustomerHttpRuntime.php';
        require_once $backend . '/ZibalHostingBootstrap.php';
        $payment = \CngTech\Shop\ZibalHostingBootstrap::load(dirname($privateConfig) . '/zibal.json', $publicRoot);
        $factory = $payment === null ? null : \CngTech\Shop\ZibalHostingBootstrap::factory($payment);
        $response = \CngTech\Shop\ShopCustomerHttpRuntime::handle($privateConfig, $publicRoot, $_SERVER, $factory);
    }
} catch (Throwable $error) {
    // Generic response only; no exception text goes to HTTP or application logs.
} finally {
    restore_error_handler();
    while (ob_get_level() > $bufferLevel) ob_end_clean();
}
http_response_code($response['status']);
foreach ($response['headers'] as $name => $value) header($name . ': ' . $value);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') echo $response['body'];
