const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { exec } = require('child_process');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Ensure tables and columns exist
(async () => {
    try {
        await pool.query(`ALTER TABLE loans ADD COLUMN IF NOT EXISTS remain_amount DECIMAL(12,2) DEFAULT 0`);
        await pool.query(`UPDATE loans SET remain_amount = COALESCE(remain_amount, amount) WHERE remain_amount IS NULL OR remain_amount = 0`);
        
        // Ensure custom categories table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                suggested_amount DECIMAL(12,2) DEFAULT 0,
                UNIQUE(user_id, name)
            )
        `);
        // Add column if the table already existed from our previous step
        await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS suggested_amount DECIMAL(12,2) DEFAULT 0`);
    } catch (err) {
        console.error('Error ensuring DB schema:', err.message);
    }
})();

/* =========================================
   SERVE FRONTEND STATIC FILES
========================================= */
app.use(express.static(path.join(__dirname, '../cashen-frontend')));

/* =========================================
   1. MIDDLEWARE: AUTHENTICATION CHECK
   ========================================= */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

/* =========================================
   2. AUTHENTICATION ROUTES
   ========================================= */

// Register User
app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
            [name, email, hashedPassword]
        );
        res.json(newUser.rows[0]);
    } catch (err) {
        if (!(err.code === '23505' && /users_email_key/.test(err.message))) {
            console.error('Registration failed:', err.message);
        }

        if (err.code === '23505' && /users_email_key/.test(err.message)) {
            return res.status(400).json('Email already registered');
        }

        res.status(500).json('Server Error');
    }
});

// Login User
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (user.rows.length === 0) return res.status(401).json("User not found");

        const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!validPassword) return res.status(401).json("Incorrect Password");

        const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET);
        res.json({ token, user: { name: user.rows[0].name, email: user.rows[0].email } });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Delete Account
app.delete('/auth/delete-account', authenticateToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
        res.json({ message: "Account deleted successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Change Password
app.put('/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (user.rows.length === 0) return res.status(404).json("User not found");

        const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
        if (!validPassword) return res.status(401).json("Current password is incorrect");

        if (newPassword.length < 6) return res.status(400).json("Password must be at least 6 characters");

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashedPassword, userId]);

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});


/* =========================================
   3. DATA RETRIEVAL (DASHBOARD)
   ========================================= */

app.get('/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const transactions = await pool.query("SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC", [userId]);
        const budgets = await pool.query("SELECT * FROM budgets WHERE user_id = $1", [userId]);
        const loans = await pool.query("SELECT * FROM loans WHERE user_id = $1", [userId]);
        const goals = await pool.query("SELECT * FROM goals WHERE user_id = $1", [userId]);
        const categories = await pool.query("SELECT * FROM categories WHERE user_id = $1", [userId]);

        const budgetObj = {};
        budgets.rows.forEach(b => budgetObj[b.category] = Number(b.limit_amount));

        res.json({
            transactions: transactions.rows,
            budgets: budgetObj,
            loans: loans.rows,
            goals: goals.rows,
            customCategories: categories.rows
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/* =========================================
   4. TRANSACTION ROUTES
   ========================================= */

app.post('/transactions', authenticateToken, async (req, res) => {
    try {
        const { description, amount, type, category, date } = req.body;
        const newTx = await pool.query(
            "INSERT INTO transactions (user_id, description, amount, type, category, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [req.user.id, description, amount, type, category, date]
        );
        res.json(newTx.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

app.delete('/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [id, req.user.id]);
        res.json({ message: "Transaction deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/* =========================================
   5. BUDGET ROUTES
   ========================================= */

app.post('/budgets', authenticateToken, async (req, res) => {
    try {
        const { category, limit_amount } = req.body;
        const userId = req.user.id;

        await pool.query("DELETE FROM budgets WHERE user_id = $1 AND category = $2", [userId, category]);
        const newBudget = await pool.query(
            "INSERT INTO budgets (user_id, category, limit_amount) VALUES ($1, $2, $3) RETURNING *",
            [userId, category, limit_amount]
        );

        res.json(newBudget.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

app.delete('/budgets', authenticateToken, async (req, res) => {
    try {
        const { category } = req.body;
        await pool.query("DELETE FROM budgets WHERE user_id = $1 AND category = $2", [req.user.id, category]);
        res.json({ message: "Budget deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/* =========================================
   6. LOAN ROUTES
   ========================================= */

app.post('/loans', authenticateToken, async (req, res) => {
    try {
        const { name, type, amount, remain_amount } = req.body;
        const remaining = remain_amount != null ? remain_amount : amount;
        const newLoan = await pool.query(
            "INSERT INTO loans (user_id, name, type, amount, remain_amount) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [req.user.id, name, type, amount, remaining]
        );
        res.json(newLoan.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

app.delete('/loans/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM loans WHERE id = $1 AND user_id = $2", [id, req.user.id]);
        res.json({ message: "Loan deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// --- UPDATE LOAN (Repayment) ---
app.put('/loans/:id', authenticateToken, async (req, res) => {
    try {
        const { remain_amount, name } = req.body;
        const { id } = req.params;
        const userId = req.user.id;

        const currentLoan = await pool.query("SELECT * FROM loans WHERE id = $1 AND user_id = $2", [id, userId]);
        if (currentLoan.rows.length === 0) return res.status(404).json("Loan not found");

        // 1. Update the loan balance ONLY. 
        // We removed the automatic transaction creation from here!
        const updated = await pool.query(
            "UPDATE loans SET remain_amount = COALESCE($1, remain_amount), name = COALESCE($2, name) WHERE id = $3 AND user_id = $4 RETURNING *",
            [remain_amount, name || null, id, userId]
        );

        res.json(updated.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/* =========================================
   7. GOAL ROUTES
   ========================================= */

app.post('/goals', authenticateToken, async (req, res) => {
    try {
        const { name, target_amount } = req.body;
        const newGoal = await pool.query(
            "INSERT INTO goals (user_id, name, target_amount, saved_amount) VALUES ($1, $2, $3, 0) RETURNING *",
            [req.user.id, name, target_amount]
        );
        res.json(newGoal.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

app.delete('/goals/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM goals WHERE id = $1 AND user_id = $2", [id, req.user.id]);
        res.json({ message: "Goal deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

app.put('/goals/:id', authenticateToken, async (req, res) => {
    try {
        const { saved_amount } = req.body;
        const { id } = req.params;

        const updated = await pool.query(
            "UPDATE goals SET saved_amount = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
            [saved_amount, id, req.user.id]
        );
        res.json(updated.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/* =========================================
   8. CATEGORY ROUTES
   ========================================= */

// Add Custom Category
app.post('/categories', authenticateToken, async (req, res) => {
    try {
        const { name, suggested_amount } = req.body;
        const amount = suggested_amount ? Number(suggested_amount) : 0;
        
        const newCat = await pool.query(
            "INSERT INTO categories (user_id, name, suggested_amount) VALUES ($1, $2, $3) RETURNING *",
            [req.user.id, name, amount]
        );
        res.json(newCat.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json('Category already exists');
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Delete Custom Category
app.delete('/categories/:name', authenticateToken, async (req, res) => {
    try {
        const { name } = req.params;
        await pool.query("DELETE FROM categories WHERE name = $1 AND user_id = $2", [name, req.user.id]);
        res.json({ message: "Category deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

/* =========================================
   START SERVER
========================================= */

const PORT = 5001;

app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`🚀 Server running at: ${url}`);
    exec(`open ${url}`);
});