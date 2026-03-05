-- Schema for PyeArcade user/credit system

CREATE DATABASE IF NOT EXISTS pyearcade;
USE pyearcade;

-- user accounts with credit balance
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    credits INT NOT NULL DEFAULT 0
);

-- track available games
CREATE TABLE IF NOT EXISTS games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE
);

-- registered physical boards
CREATE TABLE IF NOT EXISTS game_boards (
    id VARCHAR(64) PRIMARY KEY,
    game VARCHAR(64) NOT NULL,
    state_json JSON,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- credit/debit transactions
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount INT NOT NULL,
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
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- insert initial available games
INSERT IGNORE INTO games (name, slug) VALUES
('Neon Recall', 'neon-recall'),
('Swipe Strike', 'swipe-strike');
