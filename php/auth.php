<?php
header("Access-Control-Allow-Origin: *"); // In production, restrict this to your domain
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db.php';

$action = isset($_GET['action']) ? $_GET['action'] : '';
$data = json_decode(file_get_contents("php://input"), true);

function sendResponse($success, $message, $data = []) {
    echo json_encode(array_merge(["success" => $success, "message" => $message], $data));
    exit;
}

try {
    // REGISTER
    if ($action === 'register' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
    $password = $data['password'];

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendResponse(false, "Invalid email format");
    }
    if (strlen($password) < 6) {
        sendResponse(false, "Password must be at least 6 characters");
    }

    // Check if email exists
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        sendResponse(false, "Email already registered");
    }

    // Hash password and insert
    $hash = password_hash($password, PASSWORD_DEFAULT);
    // Give 1 free credit (game) on signup
    $stmt = $pdo->prepare("INSERT INTO users (email, password_hash, credits) VALUES (?, ?, 1)");
    
    if ($stmt->execute([$email, $hash])) {
        // Auto login after register
        $_SESSION['user_id'] = $pdo->lastInsertId();
        sendResponse(true, "Registration successful", ["user" => ["email" => $email, "credits" => 1]]);
    } else {
        sendResponse(false, "Registration failed");
    }
}

// LOGIN
if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = $data['email'];
    $password = $data['password'];

    $stmt = $pdo->prepare("SELECT id, email, password_hash, credits FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user && $user['password_hash'] && password_verify($password, $user['password_hash'])) {
        $_SESSION['user_id'] = $user['id'];
        sendResponse(true, "Login successful", [
            "user" => [
                "id" => $user['id'],
                "email" => $user['email'],
                "credits" => $user['credits']
            ]
        ]);
    } else {
        sendResponse(false, "Invalid email or password");
    }
}


// LOGOUT
if ($action === 'logout') {
    session_destroy();
    sendResponse(true, "Logged out");
}

// CHECK SESSION (ME)
if ($action === 'check') {
    if (isset($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("SELECT id, email, credits FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        
        if ($user) {
            sendResponse(true, "Authenticated", ["user" => $user]);
        }
    }
    sendResponse(false, "Not authenticated");
}

// SIMPLE TRANSACTION ENDPOINT (credit or debit)
if ($action === 'transaction' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) {
        sendResponse(false, "Not authenticated");
    }
    $amount = isset($data['amount']) ? (int)$data['amount'] : 0;
    $description = isset($data['description']) ? trim($data['description']) : '';

    // adjust balance
    $stmt = $pdo->prepare("UPDATE users SET credits = credits + ? WHERE id = ?");
    $stmt->execute([$amount, $_SESSION['user_id']]);

    // record transaction
    $stmt2 = $pdo->prepare("INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, 'adjustment', ?)");
    $stmt2->execute([$_SESSION['user_id'], $amount, $description]);

    // return updated balance
    $stmt3 = $pdo->prepare("SELECT credits FROM users WHERE id = ?");
    $stmt3->execute([$_SESSION['user_id']]);
    $credits = $stmt3->fetchColumn();

    sendResponse(true, "Transaction recorded", ["credits" => $credits]);
}

// START GAME SESSION (Deducts 1 Credit)
if ($action === 'start_session' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) {
        sendResponse(false, "Not authenticated");
    }
    
    $boardId = isset($data['board_id']) ? $data['board_id'] : 'unknown';
    $gameName = isset($data['game_name']) ? $data['game_name'] : 'Unknown Game';
    
    // Check if board is actually online (strict 1s check)
    $stmtBoard = $pdo->prepare("SELECT last_seen FROM game_boards WHERE board_id = ? AND last_seen > NOW() - INTERVAL 1 SECOND");
    $stmtBoard->execute([$boardId]);
    if (!$stmtBoard->fetch()) {
        sendResponse(false, "Board is currently offline. Please try again.");
    }

    // Check if board is occupied (active session exists)
    $stmtOccupied = $pdo->prepare("SELECT id FROM game_sessions WHERE board_id = ? AND status = 'active' AND ended_at IS NULL");
    $stmtOccupied->execute([$boardId]);
    if ($stmtOccupied->fetch()) {
        sendResponse(false, "Game in Progress. Try again later.");
    }

    // Check balance
    $stmt = $pdo->prepare("SELECT credits FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $currentCredits = $stmt->fetchColumn();

    if ($currentCredits < 1) {
        sendResponse(false, "Insufficient credits");
    }

    // Deduct 1 credit
    $stmt = $pdo->prepare("UPDATE users SET credits = credits - 1 WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);

    // Record transaction
    $stmt = $pdo->prepare("INSERT INTO transactions (user_id, amount, type, description) VALUES (?, -1, 'game_play', ?)");
    $stmt->execute([$_SESSION['user_id'], "Played $gameName"]);

    // Create session
    $stmt = $pdo->prepare("INSERT INTO game_sessions (user_id, board_id, score, status, started_at) VALUES (?, ?, 0, 'active', NOW())");
    $stmt->execute([$_SESSION['user_id'], $boardId]);
    $sessionId = $pdo->lastInsertId();

    sendResponse(true, "Session started", ["session_id" => $sessionId, "credits" => $currentCredits - 1]);
}

// END GAME SESSION (Update Score)
if ($action === 'end_session' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) {
        sendResponse(false, "Not authenticated");
    }
    
    $sessionId = isset($data['session_id']) ? (int)$data['session_id'] : 0;
    $score = isset($data['score']) ? (int)$data['score'] : 0;
    
    if ($sessionId > 0) {
        // Update session
        $stmt = $pdo->prepare("UPDATE game_sessions SET score = ?, ended_at = NOW() WHERE id = ? AND user_id = ?");
        $stmt->execute([$score, $sessionId, $_SESSION['user_id']]);
        sendResponse(true, "Session ended", ["score" => $score]);
    }
    sendResponse(false, "Invalid session ID");
}

// CHANGE PASSWORD
if ($action === 'change_password' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) {
        sendResponse(false, "Not authenticated");
    }

    $current = isset($data['current_password']) ? $data['current_password'] : '';
    $newpass = isset($data['new_password']) ? $data['new_password'] : '';

    if (strlen($newpass) < 6) {
        sendResponse(false, "New password must be at least 6 characters");
    }

    // fetch existing hash
    $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($current, $row['password_hash'])) {
        sendResponse(false, "Current password is incorrect");
    }

    // update hash
    $hash = password_hash($newpass, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
    $stmt->execute([$hash, $_SESSION['user_id']]);

    sendResponse(true, "Password changed successfully");
}

    // If no valid action matches
    sendResponse(false, "Invalid action");

} catch (PDOException $e) {
    http_response_code(500);
    sendResponse(false, "Database error: " . $e->getMessage());
} catch (Exception $e) {
    http_response_code(500);
    sendResponse(false, "Server error: " . $e->getMessage());
}
?>
