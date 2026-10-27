<?php
// Copy ONLY to /home/CPANEL_USER/cng-private/config.php, outside public_html.
// For a different document root, this directory must be beside that root.
return [
    'enabled' => false, // Enable only after HTTPS, database, cron and privacy review.
    'origin' => 'https://cngtech.ir', // Exact canonical origin; no trailing slash.
    'dsn' => 'mysql:host=localhost;dbname=CPANEL_DATABASE;charset=utf8mb4',
    'db_user' => 'CPANEL_DB_USER',
    'db_password' => 'REPLACE_WITH_RANDOM_DATABASE_PASSWORD',
    'encryption_key' => 'REPLACE_WITH_BASE64_32_BYTE_KEY',
    'admin_user' => 'REPLACE_WITH_PRIVATE_ADMIN_USERNAME',
    'admin_password_hash' => 'REPLACE_WITH_PASSWORD_HASH',
];
