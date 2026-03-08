<?php
// Central Database Connection

// Load environment variables if .env exists
if (file_exists(__DIR__ . '/.env')) {
    $env = parse_ini_file(__DIR__ . '/.env');
    foreach ($env as $key => $value) {
        putenv("$key=$value");
    }
}

$host = getenv('DB_HOST') ?: 'localhost'; 
$db   = getenv('DB_NAME') ?: 'pyearcade';
$user = getenv('DB_USER') ?: 'pyearcadeuser';
$pass = getenv('DB_PASS') ?: '@Selonegorci03';
$charset = getenv('DB_CHARSET') ?: 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    // In production, log this to a file instead of echoing
    http_response_code(500);
    echo json_encode(["error" => "Database connection failed"]);
    exit;
}

// Start secure session if not already started
if (session_status() === PHP_SESSION_NONE) {
    // Set secure session params (HttpOnly, Secure if https)
    // session_set_cookie_params([
    //     'lifetime' => 0, // Session cookie (closes with browser)
    //     'path' => '/',
    //     'domain' => '', // Current domain
    //     'secure' => true, // Ensure you are on HTTPS
    //     'httponly' => true,
    //     'samesite' => 'Strict'
    // ]);
    session_start();
}
?>
