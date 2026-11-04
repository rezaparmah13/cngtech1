<?php
declare(strict_types=1);
// Read-only public projection. Never expose private catalog metadata or configuration.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET'); http_response_code(405); echo '{"error":"method_not_allowed"}'; exit;
}
require_once __DIR__ . '/../admin/tank-prices.php';
try {
    $data = tank_price_load();
    $products = [];
    foreach (tank_capacities() as $capacity) {
        $id = 'tank-' . $capacity;
        $row = $data['products'][$id] ?? [];
        $price = $row['priceToman'] ?? null;
        $availability = $row['availability'] ?? 'inquiry';
        $products[$id] = [
            'priceToman' => is_int($price) && $price > 0 && $price <= 1000000000000 ? $price : null,
            'availability' => in_array($availability, ['available', 'unavailable', 'inquiry'], true) ? $availability : 'inquiry',
        ];
    }
    echo json_encode(['products' => $products], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    http_response_code(503);
    echo '{"error":"prices_unavailable"}';
}
