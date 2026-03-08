<?php
// process_payment.php
// Receives a Square payment token (source_id) and charges the specified amount in cents.
// Returns JSON { success: bool, message?: string, payment?: object }

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load DB and session so we can optionally record the payment for a logged-in user.
require_once 'db.php';
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function sendReceiptEmail($to, $subject, $body) {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    // The receipt should come from a valid contact address.
    // Default to contact@pyeclub.com (can be overridden via RECEIPT_FROM env var).
    $from = getenv('RECEIPT_FROM') ?: 'contact@pyeclub.com';
    $fromName = 'PYE Club';

    // Prefer SMTP if configured (more reliable on shared hosts than mail())
    $smtpHost = getenv('SMTP_HOST');
    $smtpPort = getenv('SMTP_PORT') ?: 587;
    $smtpUser = getenv('SMTP_USER');
    $smtpPass = getenv('SMTP_PASS');
    $smtpSecure = strtolower(getenv('SMTP_SECURE') ?: 'tls'); // tls, ssl, or none

    $replyTo = getenv('REPLY_TO') ?: $from;

    $message = "From: $fromName <$from>\r\n";
    $message .= "Reply-To: $replyTo\r\n";
    $message .= "To: $to\r\n";
    $message .= "Subject: $subject\r\n";
    $message .= "MIME-Version: 1.0\r\n";
    $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $message .= "\r\n";
    $message .= $body;

    if ($smtpHost) {
        // Minimal SMTP implementation (AUTH LOGIN) for reliability.
        $transport = ($smtpSecure === 'ssl') ? "ssl://$smtpHost" : $smtpHost;
        $port = (int)$smtpPort;
        $timeout = 10;

        $fp = @stream_socket_client("$transport:$port", $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
        if (!$fp) {
            return false;
        }

        $read = fn() => fgets($fp, 515);
        $send = fn($cmd) => fwrite($fp, $cmd . "\r\n");

        $greeting = $read();
        if (strpos($greeting, '220') !== 0) {
            fclose($fp);
            return false;
        }

        $send("EHLO " . gethostname());
        $read();
        while ($line = $read()) {
            if (preg_match('/^\d{3} /', $line)) break;
        }

        if ($smtpSecure === 'tls') {
            $send('STARTTLS');
            $read();
            stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            $send("EHLO " . gethostname());
            $read();
            while ($line = $read()) {
                if (preg_match('/^\d{3} /', $line)) break;
            }
        }

        if ($smtpUser && $smtpPass) {
            $send('AUTH LOGIN');
            $read();
            $send(base64_encode($smtpUser));
            $read();
            $send(base64_encode($smtpPass));
            $read();
        }

        $send("MAIL FROM: <$from>");
        $read();
        $send("RCPT TO: <$to>");
        $read();
        $send('DATA');
        $read();
        $send(str_replace("\n.", "\n..", $message) . "\r\n.");
        $read();
        $send('QUIT');
        $read();

        fclose($fp);
        return true;
    }

    // Fallback to mail() if SMTP isn't configured
    $headers = "From: $fromName <$from>\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    return @mail($to, $subject, $body, $headers);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
    exit;
}

$sourceId = $data['source_id'] ?? null;
$amount = $data['amount'] ?? null;
$credits = isset($data['credits']) ? (int)$data['credits'] : null;

if (!$sourceId || !$amount) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields (source_id, amount)']);
    exit;
}

// Ensure amount is an integer (cents)
$amount = (int) $amount;
if ($amount <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Amount must be a positive integer (cents)']);
    exit;
}

// NOTE: Replace this with your own Location ID if needed. Some Square accounts require it.
$locationId = getenv('SQUARE_LOCATION_ID') ?: null;

$idempotencyKey = bin2hex(random_bytes(16));

$payload = [
    'source_id' => $sourceId,
    'idempotency_key' => $idempotencyKey,
    'amount_money' => [
        'amount' => $amount,
        'currency' => 'USD',
    ],
];

if ($locationId) {
    $payload['location_id'] = $locationId;
}

// Function to manually parse .env if parse_ini_file is disabled
if (!function_exists('loadEnv')) {
    function loadEnv($path) {
        if (!file_exists($path)) return false;
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) return false;
        
        foreach ($lines as $line) {
            $line = trim($line);
            if (!$line || strpos($line, '#') === 0) continue;
            
            // Simple key=value parse
            $parts = explode('=', $line, 2);
            if (count($parts) === 2) {
                $name = trim($parts[0]);
                $value = trim($parts[1]);
                putenv("$name=$value");
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
            }
        }
        return true;
    }
}

// Load .env variables (already loaded by db.php include, but just in case)
if (!loadEnv(__DIR__ . '/.env')) {
    loadEnv(__DIR__ . '/../.env');
}

$squareUrl = getenv('SQUARE_API_URL') ?: 'https://connect.squareup.com/v2/payments';
$squareToken = getenv('SQUARE_ACCESS_TOKEN');

if (!$squareToken) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server Configuration Error: Square Token missing']);
    exit;
}

$ch = curl_init($squareUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Accept: application/json',
    'Authorization: Bearer ' . $squareToken,
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Payment request failed: ' . $curlErr]);
    exit;
}

$body = json_decode($response, true);

if ($httpCode >= 200 && $httpCode < 300 && isset($body['payment'])) {
    $paymentId = $body['payment']['id'] ?? null;
    $output = ['success' => true, 'payment' => $body['payment']];

    // If logged in, ensure we do not double-credit if the same payment is submitted twice.
    if (isset($_SESSION['user_id']) && $credits && $credits > 0) {
        $uid = $_SESSION['user_id'];
        $description = 'Square payment ' . ($paymentId ?? 'unknown');

        // Check for idempotency: was this payment already recorded?
        $stmt = $pdo->prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'purchase' AND description = ? LIMIT 1");
        $stmt->execute([$uid, $description]);
        $already = $stmt->fetchColumn();

        if ($already) {
            // Return current balance without double-applying credits
            $stmt = $pdo->prepare("SELECT credits FROM users WHERE id = ?");
            $stmt->execute([$uid]);
            $output['credits'] = (int)$stmt->fetchColumn();
            echo json_encode($output);
            exit;
        }

        // Apply credits and record transaction atomically
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("UPDATE users SET credits = credits + ? WHERE id = ?");
            $stmt->execute([$credits, $uid]);

            $stmt = $pdo->prepare("INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, 'purchase', ?)");
            $stmt->execute([$uid, $credits, $description]);

            $stmt = $pdo->prepare("SELECT credits FROM users WHERE id = ?");
            $stmt->execute([$uid]);
            $output['credits'] = (int)$stmt->fetchColumn();

            $pdo->commit();

            // Send an email receipt if we can find an email address.
            $stmt = $pdo->prepare("SELECT email FROM users WHERE id = ?");
            $stmt->execute([$uid]);
            $userEmail = $stmt->fetchColumn();
            if ($userEmail) {
                $subject = "Your PYE Club Credit Purchase";
                $body = "Thank you for your purchase!\n\n" .
                        "Amount: $" . number_format($amount / 100, 2) . "\n" .
                        "Credits Added: $credits\n" .
                        "Payment ID: " . ($paymentId ?? 'unknown') . "\n" .
                        "Date: " . date('Y-m-d H:i:s') . "\n\n" .
                        "If you have any questions, reply to this email.";
                sendReceiptEmail($userEmail, $subject, $body);
            }

        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to record transaction: ' . $e->getMessage()]);
            exit;
        }
    } else {
        // Return the requested credits so the client can apply them if desired.
        $output['credits'] = $credits;

        // If a fallback email was provided, send a receipt there.
        $fallbackEmail = isset($data['email']) ? filter_var($data['email'], FILTER_VALIDATE_EMAIL) : false;
        if ($fallbackEmail) {
            $subject = "Your PYE Club Credit Purchase";
            $body = "Thank you for your purchase!\n\n" .
                    "Amount: $" . number_format($amount / 100, 2) . "\n" .
                    "Credits: $credits\n" .
                    "Payment ID: " . ($paymentId ?? 'unknown') . "\n" .
                    "Date: " . date('Y-m-d H:i:s') . "\n\n" .
                    "If you have any questions, reply to this email.";
            sendReceiptEmail($fallbackEmail, $subject, $body);
        }
    }

    echo json_encode($output);
    exit;
}

// Square errors are returned under "errors"
$message = 'Payment failed';
if (isset($body['errors']) && is_array($body['errors']) && count($body['errors']) > 0) {
    $message = $body['errors'][0]['detail'] ?? $body['errors'][0]['category'] ?? json_encode($body['errors']);
}

http_response_code($httpCode ?: 500);
echo json_encode(['success' => false, 'message' => $message, 'raw' => $body]);
