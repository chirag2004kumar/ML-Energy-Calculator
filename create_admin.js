// create_admin.js - Script to create admin users
// Run this with: node create_admin.js

const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const readline = require("readline");

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Connect to database
const db = new sqlite3.Database("./energy_db.sqlite");

console.log("\n========================================");
console.log("  ⚡ ADMIN USER CREATION SCRIPT");
console.log("========================================\n");
console.log("This script will create a new admin user");
console.log("for the Energy Management System.\n");

// Prompt for username
rl.question("Enter admin username: ", (username) => {
  if (!username || username.trim() === "") {
    console.log("\n❌ Error: Username cannot be empty");
    rl.close();
    db.close();
    return;
  }

  // Prompt for email
  rl.question("Enter admin email: ", (email) => {
    if (!email || !email.includes("@")) {
      console.log("\n❌ Error: Please enter a valid email address");
      rl.close();
      db.close();
      return;
    }

    // Prompt for password
    rl.question("Enter admin password (min 6 characters): ", (password) => {
      if (!password || password.length < 6) {
        console.log("\n❌ Error: Password must be at least 6 characters long");
        rl.close();
        db.close();
        return;
      }

      // Hash the password
      console.log("\n🔐 Hashing password...");
      const hashedPassword = bcrypt.hashSync(password, 8);

      // Insert admin into database
      console.log("💾 Creating admin user...");
      
      db.run(
        "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'admin')",
        [username, email, hashedPassword],
        function (err) {
          if (err) {
            console.error("\n❌ Error creating admin:", err.message);
            
            if (err.message.includes("UNIQUE")) {
              console.log("\n⚠️  This email already exists in the database.");
              console.log("   Please use a different email address.");
            } else if (err.message.includes("no such table")) {
              console.log("\n⚠️  Database tables not found.");
              console.log("   Please run 'npm start' first to initialize the database.");
            }
          } else {
            console.log("\n✅ Admin user created successfully!");
            console.log("\n========================================");
            console.log("  📋 ADMIN CREDENTIALS");
            console.log("========================================");
            console.log("  Username:", username);
            console.log("  Email:   ", email);
            console.log("  Password:", password);
            console.log("  Role:     ADMIN");
            console.log("========================================\n");
            console.log("🔐 You can now login at:");
            console.log("   http://localhost:3000/admin\n");
            console.log("⚠️  IMPORTANT: Keep these credentials secure!");
            console.log("   Consider changing the password after first login.\n");
          }

          // Close database and readline
          db.close();
          rl.close();
        }
      );
    });
  });
});

// Handle readline close
rl.on("close", () => {
  console.log("\n👋 Exiting admin creation script...\n");
  process.exit(0);
});

// Handle errors
process.on("uncaughtException", (err) => {
  console.error("\n❌ Unexpected error:", err.message);
  
  if (err.message.includes("Cannot find module")) {
    console.log("\n⚠️  Missing dependencies detected!");
    console.log("   Please run: npm install\n");
  }
  
  process.exit(1);
});