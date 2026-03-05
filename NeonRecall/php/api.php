<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$boardId = isset($_GET['board']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['board']) : '';
$action = isset($_GET['action']) ? $_GET['action'] : '';
$registryFile = "boards_registry.json";

// Helper to update registry
function updateRegistry($id) {
    global $registryFile;
    $registry = [];
    if (file_exists($registryFile)) {
        $registry = json_decode(file_get_contents($registryFile), true);
        if (!is_array($registry)) $registry = [];
    }
    
    // Update timestamp for this board
    $registry[$id] = time();
    
    // Clean up old entries (> 3 seconds)
    foreach ($registry as $key => $timestamp) {
        if (time() - $timestamp > 3) {
            unset($registry[$key]);
        }
    }
    
    file_put_contents($registryFile, json_encode($registry));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $filename = "board_" . ($boardId ?: 'default') . ".json";
    $json = file_get_contents('php://input');
    
    // Basic validation
    $data = json_decode($json);
    if ($data === null) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid JSON"]);
        exit;
    }

    if (file_put_contents($filename, $json)) {
        echo json_encode(["success" => true, "file" => $filename]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Failed to save file"]);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'check_status') {
        // Strict check for specific board
        $targetBoard = isset($_GET['target']) ? $_GET['target'] : '';
        if (file_exists($registryFile) && $targetBoard) {
            $registry = json_decode(file_get_contents($registryFile), true);
            if (isset($registry[$targetBoard])) {
                $lastSeen = $registry[$targetBoard];
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
        // Return list of active boards
        if (file_exists($registryFile)) {
            $registry = json_decode(file_get_contents($registryFile), true);
            
            // Filter stale entries just in case
            $activeBoards = [];
            foreach ($registry as $id => $timestamp) {
                if (time() - $timestamp <= 3) {
                    $activeBoards[] = [
                        'id' => $id,
                        'last_seen' => $timestamp,
                        'game' => (strpos($id, 'swipe_strike') !== false) ? 'swipe-strike' : 'neon-recall' // Simple inference
                    ];
                }
            }
            header('Content-Type: application/json');
            echo json_encode($activeBoards);
        } else {
            echo json_encode([]);
        }
        exit;
    }

    // Normal polling from Board
    if ($boardId) {
        updateRegistry($boardId); // Heartbeat!
        
        $filename = "board_" . $boardId . ".json";
        if (file_exists($filename)) {
            header('Content-Type: application/json');
            readfile($filename);
        } else {
            // Default state if file doesn't exist
            echo json_encode([
                "state" => "idle",
                "pattern" => [],
                "timestamp" => time() * 1000
            ]);
        }
    }
}
?>