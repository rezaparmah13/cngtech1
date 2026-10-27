<?php
declare(strict_types=1);
// Place beside config.php OUTSIDE the web root. Schedule hourly with PHP CLI.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
try {
    $c = require __DIR__ . '/config.php';
    $db = new PDO($c['dsn'], $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec("SET time_zone = '+00:00'");
    $db->exec('DELETE FROM cng_requests WHERE created_at <= UTC_TIMESTAMP() - INTERVAL 30 DAY');
    $db->exec('DELETE FROM cng_rate_limits WHERE expires_at <= UTC_TIMESTAMP()');
    echo "CNG retention cleanup complete.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "CNG cleanup failed; inspect private database configuration.\n");
    exit(1);
}
