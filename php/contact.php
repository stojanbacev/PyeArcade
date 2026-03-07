<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db.php';

// Function to send JSON response
function sendResponse($success, $message) {
    echo json_encode(["success" => $success, "message" => $message]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

// Basic validation
if (!isset($data['message']) || trim($data['message']) === '') {
    sendResponse(false, "Message cannot be empty.");
}

$userId = isset($data['user_id']) ? $data['user_id'] : 'Guest';
$userEmail = isset($data['email']) ? $data['email'] : 'No email provided';
$subject = isset($data['subject']) ? $data['subject'] : 'General Inquiry';
$messageContent = trim($data['message']);

// --- 1. Log to Database (Optional but recommended) ---
try {
    // We'll insert into a new 'support_tickets' table if you want, 
    // but for now let's just log to a text file or rely on email.
    // Ideally, create a table: support_messages (id, user_id, subject, message, created_at)
    /*
    $stmt = $pdo->prepare("INSERT INTO support_messages (user_id, subject, message, created_at) VALUES (?, ?, ?, NOW())");
    $stmt->execute([$userId, $subject, $messageContent]);
    */
} catch (Exception $e) {
    // Ignore DB errors for now, email is priority
}

// --- 2. Send Email ---
$to = "contact@pyeclub.com";
$emailSubject = "Support Request: " . $subject;

$emailBody = "New Support Request\n\n";
$emailBody .= "User ID: " . $userId . "\n";
$emailBody .= "Email: " . $userEmail . "\n";
$emailBody .= "Subject: " . $subject . "\n";
$emailBody .= "--------------------------------------\n";
$emailBody .= $messageContent . "\n";
$emailBody .= "--------------------------------------\n";
$emailBody .= "Sent from PyeArcade Web App";

$headers = "From: no-reply@pyeclub.com\r\n";
$headers .= "Reply-To: " . $userEmail . "\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

if (mail($to, $emailSubject, $emailBody, $headers)) {
    sendResponse(true, "Message sent successfully.");
} else {
    // Fallback: If PHP mail() is not configured (common on localhost), log it
    error_log("Failed to send email to $to. Content: $emailBody");
    
    // On localhost dev environments without SMTP, mail() usually fails.
    // We can simulate success for testing if needed, or return error.
    // For production, ensure sendmail/postfix is configured.
    
    // sendResponse(false, "Failed to send email. Please try again later.");
    
    // Assuming this might be dev, we return error but log it.
    sendResponse(false, "Server mail configuration error.");
}
?>
