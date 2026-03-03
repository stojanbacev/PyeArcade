<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$boardId = isset($_GET['board']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['board']) : 'default';
$filename = "board_" . $boardId . ".json";

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
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
?>