const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const cors = require("cors");   // ✔ MUST BE HERE

const app = express();          // ✔ app must be declared BEFORE using it

// ---------------------------
// FIX: CORS for cookies (Render + mobile)
// ---------------------------
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());

// ---------------------------
// SESSION SETUP
// ---------------------------
app.use(
  session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: true,
  })
);


// ---------------------------
// DATABASE SETUP
// ---------------------------
const dbPath = path.join(__dirname, "energy_db.sqlite");
console.log("Using database at:", dbPath);

const db = new sqlite3.Database(dbPath);

// Create user + history tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT UNIQUE,
    password TEXT,
    location TEXT,
    role TEXT DEFAULT 'user'
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    appliances_json TEXT,
    total_kwh REAL,
    total_cost REAL,
    model_used TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add location column if not exists
db.run(`ALTER TABLE users ADD COLUMN location TEXT`, () => {});

// ---------------------------
// CREATE DEFAULT ADMIN
// ---------------------------
db.get("SELECT * FROM users WHERE email = 'admin@energy.com'", (err, row) => {
  if (!row) {
    const adminPass = bcrypt.hashSync("Admin@123", 8);

    db.run(
      "INSERT INTO users (username, email, password, location, role) VALUES (?, ?, ?, ?, ?)",
      ["Admin", "admin@energy.com", adminPass, "Head Office", "admin"],
      () => console.log("✔ Admin created: admin@energy.com / Admin@123")
    );
  } else {
    console.log("✔ Admin already exists");
  }
});


// ---------------------------------------------
// FIX 1: PROTECT ROOT ROUTE (Must be first!)
// ---------------------------------------------
app.get("/", (req, res) => {
    // If not logged in, redirect to the login page.
    if (!req.session.user) {
        return res.redirect("/login.html");
    }
    
    // If logged in, serve the main application page.
    // The client-side JS in index.html will then verify the session/role.
    return res.sendFile(path.join(__dirname, "index.html"));
});

// Serve static files (login.html, CSS, JS etc.)
// This must be placed AFTER the specific '/' route handler above.
app.use(express.static(__dirname));


// ---------------------------------------------
// FIX 2: REGISTER USER Endpoint (Implementation added)
// ---------------------------------------------
app.post("/register", (req, res) => {
    const { username, email, password, location } = req.body;
    
    if (!email || !password || !username) {
        return res.json({ status: "error", message: "Missing required fields" });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);

    db.run(
        "INSERT INTO users (username, email, password, location) VALUES (?, ?, ?, ?)",
        [username, email, hashedPassword, location || 'Not Provided'],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                     return res.json({ status: "error", message: "Email already registered." });
                }
                console.error("Registration error:", err);
                return res.json({ status: "error", message: "Registration failed due to server error." });
            }
            return res.json({ status: "ok", message: "Registration successful. Please log in." });
        }
    );
});


// ---------------------------
// LOGIN (No change needed)
// ---------------------------
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (!user) return res.json({ status: "error", message: "User not found" });

    if (!bcrypt.compareSync(password, user.password)) {
      return res.json({ status: "error", message: "Incorrect password" });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      location: user.location,
      role: user.role
    };

    return res.json({
      status: "ok",
      role: user.role,
      message: "Login successful"
    });
  });
});

// ---------------------------
// SESSION CHECK (No change needed)
// ---------------------------
app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.json({
      logged_in: false,
      role: null,
      username: null
    });
  }

  res.json({
    logged_in: true,
    role: req.session.user.role,
    username: req.session.user.username,
    location: req.session.user.location
  });
});

// ---------------------------
// USER — SAVE HISTORY (No change needed)
// ---------------------------
app.post("/api/save_history", (req, res) => {
  if (!req.session.user)
    return res.json({ status: "error", message: "Not authenticated" });

  const userId = req.session.user.id;
  const { appliances_json, total_kwh, total_cost, model_used } = req.body;

  db.run(
    "INSERT INTO history (user_id, appliances_json, total_kwh, total_cost, model_used) VALUES (?, ?, ?, ?, ?)",
    [userId, appliances_json, total_kwh, total_cost, model_used],
    function (err) {
      if (err)
        return res.json({ status: "error", message: "Failed to save history" });

      return res.json({ status: "ok", message: "History saved successfully" });
    }
  );
});

// ---------------------------
// USER — GET OWN HISTORY (No change needed)
// ---------------------------
app.get("/user/history", (req, res) => {
  if (!req.session.user) {
    return res.json({ status: "error", message: "Not logged in" });
  }

  const userId = req.session.user.id;

  db.all(
    "SELECT * FROM history WHERE user_id = ? ORDER BY id DESC",
    [userId],
    (err, rows) => {
      if (err)
        return res.json({ status: "error", message: "Failed to fetch history" });

      return res.json({ status: "ok", data: rows });
    }
  );
});

// ---------------------------
// ADMIN — GET ALL HISTORY (No change needed)
// ---------------------------
app.get("/admin/history", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.json({ status: "error", message: "Unauthorized" });
  }

  const query = `
    SELECT 
      history.id,
      users.username,
      users.email,
      users.location,
      history.total_kwh,
      history.total_cost,
      history.model_used,
      history.timestamp
    FROM history
    LEFT JOIN users ON users.id = history.user_id
    ORDER BY history.id DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.log("Admin history fetch error:", err);
      return res.json({ status: "error", message: "Failed to fetch data" });
    }

    // Format timestamp
    const formatted = rows.map(r => ({
      ...r,
      timestamp: r.timestamp
        ? new Date(r.timestamp.replace(" ", "T")).toLocaleString()
        : "N/A"
    }));

    res.json({ status: "ok", data: formatted });
  });
});


// ---------------------------------------------
// FIX 3: ADMIN — DELETE SINGLE ENTRY (Admin Check added)
// ---------------------------------------------
app.delete("/admin/delete-history/:id", (req, res) => {
    if (!req.session.user || req.session.user.role !== "admin") {
        return res.json({ status: "error", message: "Unauthorized" });
    }

    db.run("DELETE FROM history WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.json({ status: "error", message: "Delete failed" });
        res.json({ status: "ok", message: "Entry deleted" });
    });
});

// ---------------------------------------------
// FIX 3: ADMIN — DELETE ALL HISTORY (Admin Check added)
// ---------------------------------------------
app.delete("/admin/delete-all-history", (req, res) => {
    if (!req.session.user || req.session.user.role !== "admin") {
        return res.json({ status: "error", message: "Unauthorized" });
    }

    db.run("DELETE FROM history", function (err) {
        if (err) return res.json({ status: "error", message: "Delete failed" });
        res.json({ status: "ok", message: "All history deleted" });
    });
});

// ---------------------------
// LOGOUT (No change needed)
// ---------------------------
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ status: "ok", message: "Logged out" });
  });
});

// ---------------------------
// START SERVER
// ---------------------------
app.listen(3001, () => {
  console.log("Server running on http://localhost:3001/");
});
