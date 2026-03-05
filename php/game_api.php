<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Database Connection
// Relative path assumes this file is deployed at /games/GameName/api.php (dist)
// and db.php is at /api/db.php
$dbPath = __DIR__ . '/../../api/db.php';

if (!file_exists($dbPath)) {
    // Fallback for local source (php/game_api.php and php/db.php in same dir)
    $dbPath = __DIR__ . '/db.php'; 
}

if (!file_exists($dbPath)) {
    http_response_code(500);
    echo json_encode(["error" => "Database configuration not found"]);
    exit;
}

require_once $dbPath;

$boardId = isset($_GET['board']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['board']) : '';
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Helper to update/check board state
function updateBoardHeartbeat($pdo, $id, $stateJson = null) {
    // Determine game type from ID (simple inference)
    $gameType = (strpos($id, 'swipe_strike') !== false) ? 'swipe-strike' : 'neon-recall';
    
    // Check if board exists
    $stmt = $pdo->prepare("SELECT id FROM game_boards WHERE id = ?");
    $stmt->execute([$id]);
    
    if ($stmt->fetch()) {
        // Update existing
        if ($stateJson !== null) {
            $stmt = $pdo->prepare("UPDATE game_boards SET last_seen = NOW(), state_json = ? WHERE id = ?");
            $stmt->execute([$stateJson, $id]);
        } else {
            // Just heartbeat
            $stmt = $pdo->prepare("UPDATE game_boards SET last_seen = NOW() WHERE id = ?");
            $stmt->execute([$id]);
        }
    } else {
        // Insert new
        $initialState = $stateJson ?: json_encode(["state" => "idle", "pattern" => [], "timestamp" => time() * 1000]);
        $stmt = $pdo->prepare("INSERT INTO game_boards (id, game, state_json, last_seen) VALUES (?, ?, ?, NOW())");
        $stmt->execute([$id, $gameType, $initialState]);
    }
}

function getBoardState($pdo, $id) {
    $stmt = $pdo->prepare("SELECT state_json FROM game_boards WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? $row['state_json'] : null;
}

// --- MAIN LOGIC ---

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // ... code ...
    // Note: This block already has try/catch inside for updateBoardHeartbeat
    try {
        $targetBoard = $boardId ?: 'default';
        // ...
        $json = file_get_contents('php://input');
        $data = json_decode($json);
        if ($data === null) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid JSON"]);
            exit;
        }

        updateBoardHeartbeat($pdo, $targetBoard, $json);
        echo json_encode(["success" => true, "board" => $targetBoard]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
    exit;

} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        if ($action === 'check_status') {
        // Strict check for specific board
        $targetBoard = isset($_GET['target']) ? $_GET['target'] : '';
        if ($targetBoard) {
            $stmt = $pdo->prepare("SELECT last_seen FROM game_boards WHERE id = ?");
            $stmt->execute([$targetBoard]);
            $row = $stmt->fetch();
            
            if ($row) {
                $lastSeen = strtotime($row['last_seen']);
                // Strict 2 second timeout for "Live" check
                if (time() - $lastSeen <= 2) {
                    echo json_encode(['status' => 'online', 'lag' => time() - $lastSeen]);
                    exit;
                }
            }
        }
        echo json_encode(['status' => 'offline']);
        exit;
    }

    if ($action === 'list_boards') {
        // Return list of active boards (seen in last 3 seconds)
        $stmt = $pdo->query("SELECT id, game, last_seen FROM game_boards WHERE last_seen > NOW() - INTERVAL 3 SECOND");
        $activeBoards = $stmt->fetchAll();
        
        // Format for frontend
        $result = [];
        foreach ($activeBoards as $board) {
             $result[] = [
                 'id' => $board['id'],
                 'game' => $board['game'],
                 'last_seen' => strtotime($board['last_seen'])
             ];
        }
        echo json_encode($result);
        exit;
    }

    // Normal polling from Board (Heartbeat + Get State)
    if ($boardId) {
        try {
            updateBoardHeartbeat($pdo, $boardId); // Heartbeat!
            
            $stateJson = getBoardState($pdo, $boardId);
            if ($stateJson) {
                echo $stateJson; // Return raw JSON stored in DB
            } else {
                // Default state
                echo json_encode([
                    "state" => "idle",
                    "pattern" => [],
                    "timestamp" => time() * 1000
                ]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["error" => "Database error"]);
        }
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
}
}
?>
