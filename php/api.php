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
    // Fallback for local source (php/api.php and php/db.php in same dir)
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
    $stmt = $pdo->prepare("SELECT board_id FROM game_boards WHERE board_id = ?");
    $stmt->execute([$id]);
    
    if ($stmt->fetch()) {
        // Update existing
        if ($stateJson !== null) {
            $stmt = $pdo->prepare("UPDATE game_boards SET last_seen = NOW(), status = 'online', state_json = ? WHERE board_id = ?");
            $stmt->execute([$stateJson, $id]);
        } else {
            // Just heartbeat
            $stmt = $pdo->prepare("UPDATE game_boards SET last_seen = NOW(), status = 'online' WHERE board_id = ?");
            $stmt->execute([$id]);
        }
    } else {
        // Insert new
        $initialState = $stateJson ?: json_encode(["state" => "idle", "pattern" => [], "timestamp" => time() * 1000]);
        
        // Lookup game_id from games table
        $stmtGame = $pdo->prepare("SELECT id FROM games WHERE slug = ?");
        $stmtGame->execute([$gameType]);
        $gameRow = $stmtGame->fetch();
        
        if ($gameRow) {
            $stmt = $pdo->prepare("INSERT INTO game_boards (board_id, game_id, state_json, last_seen, status) VALUES (?, ?, ?, NOW(), 'online')");
            $stmt->execute([$id, $gameRow['id'], $initialState]);
        }
    }
}

function getBoardState($pdo, $id) {
    $stmt = $pdo->prepare("SELECT state_json FROM game_boards WHERE board_id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    
    if ($row && $row['state_json']) {
        // AUTO-TIMEOUT LOGIC
        // If state hasn't changed in > 45 seconds, assume abandoned and reset to idle.
        // This cleans up stuck sessions from disconnected clients.
        $state = json_decode($row['state_json'], true);
        if ($state && isset($state['state']) && $state['state'] !== 'idle') {
            $lastTime = isset($state['timestamp']) ? $state['timestamp'] : 0;
            
            // Current Time (ms) - Last Update (ms) > 45000ms
            if ((time() * 1000) - $lastTime > 45000) {
                 // Reset to idle
                 $idleState = json_encode([
                     "state" => "idle",
                     "pattern" => [],
                     "timestamp" => time() * 1000
                 ]);
                 
                 // Update board state
                 $stmt = $pdo->prepare("UPDATE game_boards SET state_json = ? WHERE board_id = ?");
                 $stmt->execute([$idleState, $id]);
                 
                 // Close any hanging session for this board
                 $stmtSession = $pdo->prepare("UPDATE game_sessions SET status = 'abandoned', ended_at = NOW() WHERE board_id = ? AND status = 'active'");
                 $stmtSession->execute([$id]);
                 
                 return $idleState;
            }
        }
        return $row['state_json'];
    }
    return null;
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
            // Use DB time for consistency (avoid PHP vs MySQL time drift)
            $stmt = $pdo->prepare("SELECT last_seen, TIMESTAMPDIFF(SECOND, last_seen, NOW()) as lag_seconds FROM game_boards WHERE board_id = ? AND last_seen > NOW() - INTERVAL 5 SECOND");
            $stmt->execute([$targetBoard]);
            $row = $stmt->fetch();
            
            if ($row) {
                echo json_encode(['status' => 'online', 'lag' => $row['lag_seconds']]);
                exit;
            }
        }
        echo json_encode(['status' => 'offline']);
        exit;
    }

    if ($action === 'list_boards') {
        // Return list of active boards (seen in last 5 seconds)
        // Join with games table to get game slug for frontend compatibility
        // And check for active sessions to mark occupied boards
        $stmt = $pdo->query("
            SELECT 
                gb.board_id as id, 
                g.slug as game, 
                gb.last_seen,
                MAX(CASE WHEN gs.id IS NOT NULL THEN 1 ELSE 0 END) as is_occupied
            FROM game_boards gb
            LEFT JOIN games g ON gb.game_id = g.id
            LEFT JOIN game_sessions gs ON gb.board_id = gs.board_id 
                AND gs.status = 'active' 
                AND gs.ended_at IS NULL
            WHERE gb.last_seen > NOW() - INTERVAL 5 SECOND
            GROUP BY gb.board_id, g.slug, gb.last_seen
        ");
        $activeBoards = $stmt->fetchAll();
        
        // Format for frontend
        $result = [];
        foreach ($activeBoards as $board) {
             $result[] = [
                 'id' => $board['id'],
                 'game' => $board['game'] ?? 'unknown',
                 'last_seen' => strtotime($board['last_seen']),
                 'is_occupied' => (bool)$board['is_occupied']
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
