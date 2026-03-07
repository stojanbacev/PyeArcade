<?php
// Setup script to initialize database
header("Content-Type: text/plain");

// Try to include db.php based on environment (local dev vs deployed)
$dbPath = __DIR__ . '/db.php';
if (!file_exists($dbPath)) {
    // If running from src/php locally
    $dbPath = __DIR__ . '/../php/db.php'; 
    if (!file_exists($dbPath)) {
        // Absolute fallback for dist/api/
        $dbPath = 'db.php';
    }
}

if (file_exists($dbPath)) {
    require_once $dbPath;
} else {
    die("Error: db.php not found. Please ensure database configuration exists.");
}

try {
    echo "Connected to database successfully.\n";

    // SQL Schema embedded for portability
    $sql = <<<SQL
-- user accounts with credit balance
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    credits INT NOT NULL DEFAULT 0,
    auth_provider VARCHAR(50) DEFAULT 'email',
    provider_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- track available games
CREATE TABLE IF NOT EXISTS games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    cost INT NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- registered physical boards
CREATE TABLE IF NOT EXISTS game_boards (
    board_id VARCHAR(64) PRIMARY KEY,
    game_id INT NOT NULL,
    state_json JSON,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'offline',
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- credit/debit transactions
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'generic',
    reference_id VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- game session records
CREATE TABLE IF NOT EXISTS game_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    board_id VARCHAR(64) NOT NULL,
    score INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (board_id) REFERENCES game_boards(board_id)
);

-- insert initial available games
INSERT IGNORE INTO games (name, slug, cost, is_active) VALUES
('Neon Recall', 'neon-recall', 1, 1),
('Swipe Strike', 'swipe-strike', 1, 1);
SQL;

    // Split and execute statements
    $statements = explode(';', $sql);
    foreach ($statements as $statement) {
        $statement = trim($statement);
        if (!empty($statement)) {
            try {
                $pdo->exec($statement);
                // Simple feedback
                $preview = substr(str_replace("\n", " ", $statement), 0, 50);
                echo "Executed: $preview...\n";
            } catch (PDOException $e) {
                echo "Note: " . $e->getMessage() . "\n";
            }
        }
    }
    
    // Check for schema updates (e.g. adding columns to existing tables)
    try {
        // Try to add state_json if it doesn't exist
        $stmt = $pdo->query("SHOW COLUMNS FROM game_boards LIKE 'state_json'");
        if ($stmt->rowCount() == 0) {
             $pdo->exec("ALTER TABLE game_boards ADD COLUMN state_json JSON");
             echo "Updated game_boards with state_json column.\n";
        }

        // Try to add description to transactions if it doesn't exist
        $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'description'");
        if ($stmt->rowCount() == 0) {
             $pdo->exec("ALTER TABLE transactions ADD COLUMN description TEXT");
             echo "Updated transactions with description column.\n";
        }

        // Try to add slug to games if it doesn't exist
        $stmt = $pdo->query("SHOW COLUMNS FROM games LIKE 'slug'");
        if ($stmt->rowCount() == 0) {
             // If slug column is missing, ADD IT
             $pdo->exec("ALTER TABLE games ADD COLUMN slug VARCHAR(255) NOT NULL UNIQUE DEFAULT 'unknown'");
             // Populate existing rows if any
             $pdo->exec("UPDATE games SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug = 'unknown'");
             echo "Updated games with slug column.\n";
             
             // Now retry the inserts that might have failed earlier
             try {
                $pdo->exec("INSERT IGNORE INTO games (name, slug) VALUES ('Neon Recall', 'neon-recall'), ('Swipe Strike', 'swipe-strike')");
                echo "Retried game insertions.\n";
             } catch (PDOException $e) {
                // Ignore duplicate errors
             }
        } else {
             // If slug column ALREADY EXISTS, just ensure the rows are there
             try {
                $pdo->exec("INSERT IGNORE INTO games (name, slug) VALUES ('Neon Recall', 'neon-recall'), ('Swipe Strike', 'swipe-strike')");
                echo "Verified game insertions.\n";
             } catch (PDOException $e) {
                // Ignore
             }
        }

        // CLEANUP: remove any leftover social-login columns
        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'google_id'");
            if ($stmt->rowCount() > 0) {
                $pdo->exec("ALTER TABLE users DROP COLUMN google_id");
                echo "Removed leftover google_id column.\n";
            }
            $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'apple_id'");
            if ($stmt->rowCount() > 0) {
                $pdo->exec("ALTER TABLE users DROP COLUMN apple_id");
                echo "Removed leftover apple_id column.\n";
            }
            // make password non-nullable again
            $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'password_hash'");
            if ($stmt->rowCount() > 0) {
                $pdo->exec("ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL");
                echo "Ensured password_hash is NOT NULL.\n";
            }
        } catch (PDOException $e) {
            // ignore cleanup errors
        }


    } catch (PDOException $e) {
    } catch (PDOException $e) {
        // Ignore errors
    }

    echo "\nDatabase setup complete!\n";
    echo "You can now register a user at the web interface.";

} catch (PDOException $e) {
    die("DB Error: " . $e->getMessage());
}
