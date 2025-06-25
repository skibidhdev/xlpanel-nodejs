const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '../xlpanel.db'));

// Create tables if they don't exist
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    pterodactyl_id INTEGER UNIQUE NOT NULL,
    coins INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // AFK sessions table
  db.run(`CREATE TABLE IF NOT EXISTS afk_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    coins_earned INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Coin transactions table
  db.run(`CREATE TABLE IF NOT EXISTS coin_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

module.exports = {
  // User operations
  createUser: (username, email, pterodactylId, isAdmin = false) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, email, pterodactyl_id, is_admin) VALUES (?, ?, ?, ?)',
        [username, email, pterodactylId, isAdmin ? 1 : 0],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  getUser: (username) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  getUserById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  updateUserCoins: (userId, amount) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET coins = coins + ? WHERE id = ?',
        [amount, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  },

  // AFK session operations
  startAfkSession: (userId) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO afk_sessions (user_id) VALUES (?)',
        [userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  getAfkSession: (sessionId) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM afk_sessions WHERE id = ?', [sessionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  endAfkSession: (sessionId, coinsEarned) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE afk_sessions SET end_time = CURRENT_TIMESTAMP, coins_earned = ? WHERE id = ?',
        [coinsEarned, sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  },

  getUserAfkSessions: (userId) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM afk_sessions WHERE user_id = ? ORDER BY start_time DESC LIMIT 10',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  // Transaction operations
  addTransaction: (userId, amount, type, description) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO coin_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)',
        [userId, amount, type, description],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  getUserTransactions: (userId) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
};
