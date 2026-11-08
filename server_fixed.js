const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const sql = require('mssql');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('./'));

const dbConfig = {
    user: 'chess_admin', 
    password: 'StrongPassword123!', 
    server: 'DESKTOP-EG2R0QB', // Твое имя сервера из SSMS
    database: 'ChessDB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        await sql.connect(dbConfig);

        const hashedPassword = await bcrypt.hash(password, 10);

        const request = new sql.Request();
        request.input('username', sql.NVarChar(50), username);
        request.input('password_hash', sql.NVarChar(sql.MAX), hashedPassword);

        const insertResult = await request.query(`
            INSERT INTO Users (username, password_hash)
            VALUES (@username, @password_hash);
            SELECT SCOPE_IDENTITY() AS id;
        `);

        const userId = insertResult.recordset[0]?.id;
        return res.status(201).json({ message: 'User registered successfully.', userId });
    } catch (error) {
        console.error('Registration error:', error);

        if (error.number === 2627 || (error.originalError && error.originalError.info && error.originalError.info.number === 2627)) {
            return res.status(409).json({ error: 'Username already exists.' });
        }

        return res.status(500).json({ error: 'Registration failed.' });
    } finally {
        await sql.close();
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        await sql.connect(dbConfig);

        const request = new sql.Request();
        request.input('username', sql.NVarChar(50), username);

        const result = await request.query(`
            SELECT id, username, password_hash, elo, energy, last_energy_update
            FROM Users
            WHERE username = @username
        `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'User not found.' });
        }

        const user = result.recordset[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid password.' });
        }

        // Возвращаем данные пользователя без пароля
        return res.status(200).json({
            id: user.id,
            username: user.username,
            elo: user.elo,
            energy: user.energy,
            last_energy_update: user.last_energy_update
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed.' });
    } finally {
        await sql.close();
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query('SELECT TOP 10 username, elo FROM Users ORDER BY elo DESC');
        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    } finally {
        await sql.close();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server is running on http://localhost:' + PORT);
});