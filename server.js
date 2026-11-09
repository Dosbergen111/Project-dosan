// Chess Master — сервер на PostgreSQL (Neon).
// Строка подключения берётся ТОЛЬКО из переменной окружения DATABASE_URL.
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('❌ Не задана переменная DATABASE_URL (строка подключения из Neon).');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});
pool.on('error', (err) => console.error('PG pool error:', err.message));

const app = express();
app.use(cors());
app.use(express.json());

// Раздаём только нужные файлы сайта (раньше express.static('./') отдавал и server.js, и package.json).
const PUBLIC_FILES = ['chess.html', 'admin.html', 'pay.html', 'checkout.html', 'script.js', 'style.css'];
PUBLIC_FILES.forEach((f) => app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, f))));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'chess.html')));

// ---- Регенерация энергии: +1 за каждые 30 минут, максимум 5 ----
// Условие и расчёт одинаковые, вычисляются по last_energy_update, поэтому таймер не нужен.
const MINUTES = `FLOOR(EXTRACT(EPOCH FROM (NOW() - last_energy_update)) / 60)`;
const REGEN_SET = `
    energy = LEAST(5, energy + (${MINUTES} / 30)::int),
    last_energy_update = CASE
        WHEN energy + (${MINUTES} / 30)::int >= 5 THEN NOW()
        ELSE last_energy_update + ((${MINUTES} / 30)::int * 30) * INTERVAL '1 minute'
    END`;
const REGEN_WHERE = `energy < 5 AND ${MINUTES} >= 30`;

async function regenEnergyForUser(username) {
    await pool.query(`UPDATE users SET ${REGEN_SET} WHERE username = $1 AND ${REGEN_WHERE}`, [username]);
}

// ---- Регистрация ----
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        const r = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
            [username, hash]
        );
        return res.status(201).json({ message: 'User registered successfully.', userId: r.rows[0].id });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Username already exists.' });
        }
        console.error('Registration error:', error.message);
        return res.status(500).json({ error: 'Registration failed.' });
    }
});

// ---- Вход ----
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
        await regenEnergyForUser(username);
        const r = await pool.query(
            `SELECT id, username, password_hash, elo, energy, role, is_blocked, is_premium, last_energy_update
             FROM users WHERE username = $1`,
            [username]
        );
        if (r.rows.length === 0) {
            return res.status(401).json({ error: 'User not found.' });
        }
        const user = r.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid password.' });
        }
        if (user.is_blocked) {
            return res.status(403).json({ error: 'Ваш аккаунт заблокирован администрацией.' });
        }
        return res.status(200).json({
            id: user.id,
            username: user.username,
            elo: user.elo,
            energy: user.energy,
            role: user.role,
            is_premium: user.is_premium,
            last_energy_update: user.last_energy_update
        });
    } catch (error) {
        console.error('Login error:', error.message);
        return res.status(500).json({ error: 'Login failed.' });
    }
});

// ---- История партий ----
app.post('/api/save-game', async (req, res) => {
    const { userId, result, fen, moves } = req.body;
    if (!userId || !fen) {
        return res.status(400).json({ error: 'Данные не полные' });
    }
    try {
        await pool.query(
            'INSERT INTO gamehistory (userid, result, fen, moves) VALUES ($1, $2, $3, $4)',
            [userId, result, fen, moves]
        );
        res.json({ success: true, message: 'Партия в архиве' });
    } catch (err) {
        console.error('Ошибка сохранения истории:', err.message);
        res.status(500).json({ error: 'Save failed' });
    }
});

// ---- Общий чат ----
app.post('/api/chat/send', async (req, res) => {
    const { userId, username, message } = req.body;
    if (!userId || !message) {
        return res.status(400).json({ error: 'userId and message required' });
    }
    try {
        await pool.query(
            'INSERT INTO globalchat (userid, username, message) VALUES ($1, $2, $3)',
            [userId, username, String(message).slice(0, 500)]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Chat send error:', err.message);
        res.status(500).json({ error: 'Send failed' });
    }
});

app.get('/api/chat/messages', async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT id, userid AS "userId", username, message, sentat AS "sentAt"
             FROM globalchat ORDER BY sentat DESC LIMIT 50`
        );
        res.json(r.rows.reverse());
    } catch (err) {
        console.error('Chat messages error:', err.message);
        res.status(500).json({ error: 'Load failed' });
    }
});

// ---- Таблица лидеров ----
app.get('/leaderboard', async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT username, elo, is_premium FROM users ORDER BY elo DESC, is_premium DESC LIMIT 10'
        );
        return res.status(200).json({ leaderboard: r.rows });
    } catch (error) {
        console.error('Leaderboard error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
});

// ---- Смена пароля ----
app.post('/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Username, old password, and new password are required.' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    try {
        const r = await pool.query('SELECT password_hash FROM users WHERE username = $1', [username]);
        if (r.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const ok = await bcrypt.compare(oldPassword, r.rows[0].password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Old password is incorrect.' });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, username]);
        return res.status(200).json({ message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change password error:', error.message);
        return res.status(500).json({ error: 'Failed to change password.' });
    }
});

// ---- Админка (ВНИМАНИЕ: пока без проверки прав, как и в исходной версии) ----
app.get('/admin/users', async (req, res) => {
    try {
        await pool.query(`UPDATE users SET ${REGEN_SET} WHERE ${REGEN_WHERE}`);
        const r = await pool.query(
            'SELECT id, username, elo, energy, role, is_blocked, is_premium FROM users ORDER BY id'
        );
        res.status(200).json({ users: r.rows });
    } catch (err) {
        console.error('Ошибка админки:', err.message);
        res.status(500).json({ error: 'Load failed' });
    }
});

app.post('/admin/block', async (req, res) => {
    const { id, block } = req.body;
    try {
        await pool.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [!!block, id]);
        res.status(200).json({ message: 'User status updated' });
    } catch (error) {
        console.error('Ошибка блокировки:', error.message);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.post('/admin/toggle-premium', async (req, res) => {
    const { id, premiumStatus } = req.body;
    try {
        await pool.query('UPDATE users SET is_premium = $1 WHERE id = $2', [!!premiumStatus, id]);
        res.status(200).json({ message: 'Premium status updated' });
    } catch (error) {
        console.error('Ошибка премиума:', error.message);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.post('/admin/update-elo', async (req, res) => {
    const { userId, newElo } = req.body;
    try {
        await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newElo, userId]);
        res.status(200).json({ message: 'Elo updated' });
    } catch (error) {
        res.status(500).json({ error: 'Elo update failed' });
    }
});

// ---- Энергия ----
app.post('/api/consume-energy', async (req, res) => {
    const { userId, amount } = req.body;
    try {
        const r = await pool.query(
            'UPDATE users SET energy = energy - $2 WHERE id = $1 AND energy >= $2 RETURNING energy',
            [userId, amount]
        );
        if (r.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Недостаточно энергии' });
        }
        res.json({ success: true, newEnergy: r.rows[0].energy });
    } catch (err) {
        console.error('consume-energy error:', err.message);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/use-energy', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Username is required.' });
    }
    try {
        await regenEnergyForUser(username);
        const s = await pool.query('SELECT is_premium, energy FROM users WHERE username = $1', [username]);
        if (s.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (s.rows[0].is_premium) {
            return res.json({ energy: s.rows[0].energy, isPremium: true });
        }
        const u = await pool.query(
            'UPDATE users SET energy = energy - 1 WHERE username = $1 AND energy >= 1 RETURNING energy',
            [username]
        );
        if (u.rows.length === 0) {
            return res.status(400).json({ error: 'Not enough energy.' });
        }
        res.json({ energy: u.rows[0].energy, isPremium: false });
    } catch (err) {
        console.error('use-energy error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    try {
        await regenEnergyForUser(username);
        const r = await pool.query(
            'SELECT id, username, elo, energy, role, is_blocked, is_premium, last_energy_update FROM users WHERE username = $1',
            [username]
        );
        res.json(r.rows[0]);
    } catch (err) {
        console.error('api/login error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// ---- Премиум (ДЕМО: платёж не проверяется, как и в исходной версии) ----
app.post('/api/buy-premium', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
        const r = await pool.query(
            'UPDATE users SET is_premium = TRUE WHERE id = $1 RETURNING id, username, elo, is_premium',
            [userId]
        );
        res.json({ success: true, user: r.rows[0] });
    } catch (err) {
        console.error('buy-premium error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

const PORT = process.env.PORT || 3000;
pool.query('SELECT 1')
    .then(() => console.log('✅ Соединение с Neon установлено.'))
    .catch((err) => console.error('❌ База недоступна:', err.message));
app.listen(PORT, () => console.log('Server is running on http://localhost:' + PORT));
