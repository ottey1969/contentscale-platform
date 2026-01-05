// TEMPORARY ADMIN SETUP - DELETE AFTER USE
const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Setup endpoint - creates admin with known password
router.get('/create-admin', async (req, res) => {
  try {
    // Generate fresh hash for "admin123"
    const hash = await bcrypt.hash('admin123', 10);
    
    // Delete old admin if exists
    await pool.query('DELETE FROM super_admins WHERE username = $1', ['ot']);
    
    // Create new admin
    await pool.query(
      'INSERT INTO super_admins (username, password_hash) VALUES ($1, $2)',
      ['ot', hash]
    );
    
    res.send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1 style="color: green;">✅ Admin Created!</h1>
          <p style="font-size: 18px;">Login credentials:</p>
          <div style="background: #f0f0f0; padding: 20px; border-radius: 10px; display: inline-block;">
            <p><strong>Username:</strong> ot</p>
            <p><strong>Password:</strong> admin123</p>
          </div>
          <br><br>
          <a href="/admin" style="background: blue; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px;">
            Go to Admin Panel
          </a>
          <br><br>
          <p style="color: red; font-size: 12px;">⚠️ Delete src/setup-admin.js after login!</p>
        </body>
      </html>
    `);
    
  } catch (error) {
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px;">
          <h1 style="color: red;">❌ Error</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});

module.exports = router;
