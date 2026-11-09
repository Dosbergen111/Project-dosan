// Chess Master — сервер на PostgreSQL (Neon).
// Строка подключения берётся ТОЛЬКО из переменной окружения DATABASE_URL.
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const { randomBytes } = require('crypto');
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

function leagueForElo(elo) {
    if (elo < 1000) return 'Bronze';
    if (elo < 1400) return 'Silver';
    if (elo < 1800) return 'Gold';
    if (elo < 2200) return 'Platinum';
    return 'Master';
}

const app = express();
app.use(cors());
app.use(express.json());

// Раздаём только нужные файлы сайта (раньше express.static('./') отдавал и server.js, и package.json).
const PUBLIC_FILES = ['chess.html', 'admin.html', 'pay.html', 'checkout.html', 'script.js', 'style.css', 'theme.css'];
PUBLIC_FILES.forEach((f) => app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, f))));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'chess.html')));

const sessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function createSessionToken(userId) {
    const now = Date.now();
    for (const [token, session] of sessions) {
        if (session.expiresAt <= now) sessions.delete(token);
    }
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { userId: Number(userId), expiresAt: now + SESSION_TTL_MS });
    return token;
}

async function requireAdmin(req, res, next) {
    const match = String(req.get('authorization') || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
    const session = match ? sessions.get(match[1]) : null;
    if (!session || session.expiresAt <= Date.now()) {
        if (match) sessions.delete(match[1]);
        return res.status(401).json({ error: 'Administrator sign-in required.' });
    }
    try {
        const account = await pool.query(
            'SELECT role, is_blocked FROM users WHERE id = $1',
            [session.userId]
        );
        if (!account.rows[0] || account.rows[0].role !== 'admin' || account.rows[0].is_blocked) {
            sessions.delete(match[1]);
            return res.status(403).json({ error: 'Administrator access denied.' });
        }
        session.expiresAt = Date.now() + SESSION_TTL_MS;
        req.adminUserId = session.userId;
        return next();
    } catch (error) {
        console.error('Admin authorization error:', error.message);
        return res.status(500).json({ error: 'Authorization unavailable.' });
    }
}

const rooms = new Map();
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const ROOM_HEARTBEAT_MS = 15000;

function pruneRooms() {
    const now = Date.now();
    for (const [id, room] of rooms) {
        if (now - room.updatedAt > ROOM_TTL_MS) rooms.delete(id);
    }
}

function findRoomSeat(room, token) {
    if (room.white?.token === token) return room.white;
    if (room.black?.token === token) return room.black;
    return null;
}

function roomResponse(room, token) {
    const now = Date.now();
    const seat = findRoomSeat(room, token);
    if (seat) seat.lastSeenAt = now;
    const playerStatus = (player) => player ? {
        username: player.username,
        connected: now - player.lastSeenAt < ROOM_HEARTBEAT_MS
    } : null;
    return {
        roomId: room.id,
        started: Boolean(room.black),
        finished: room.finished,
        winner: room.winner,
        version: room.version,
        turn: room.turn,
        fen: room.fen,
        moves: room.moves.map((move) => move.coordinate),
        players: {
            white: playerStatus(room.white),
            black: playerStatus(room.black)
        }
    };
}

function getRoomAndSeat(roomId, token) {
    const room = rooms.get(roomId);
    if (!room) return { room: null, seat: null };
    const seat = findRoomSeat(room, token);
    if (seat) seat.lastSeenAt = Date.now();
    return { room, seat };
}

app.post('/api/room/create', (req, res) => {
    pruneRooms();
    if (rooms.size >= 1000) return res.status(503).json({ error: 'Room capacity reached.' });
    let id;
    do {
        id = randomBytes(6).toString('hex');
    } while (rooms.has(id));
    const userId = Number(req.body?.userId);
    const room = {
        id,
        white: {
            color: 'white',
            token: randomBytes(24).toString('hex'),
            userId: Number.isSafeInteger(userId) && userId > 0 ? userId : null,
            username: String(req.body?.username || 'Гость').trim().slice(0, 32) || 'Гость',
            lastSeenAt: Date.now()
        },
        black: null,
        moves: [],
        turn: 'white',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        version: 0,
        finished: false,
        winner: null,
        updatedAt: Date.now()
    };
    rooms.set(id, room);
    return res.status(201).json({
        roomId: id,
        playerToken: room.white.token,
        color: 'white',
        joinUrl: `/chess.html?room=${encodeURIComponent(id)}`
    });
});

app.post('/api/room/:id/join', (req, res) => {
    pruneRooms();
    const room = rooms.get(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.finished) return res.status(410).json({ error: 'Room is already finished.' });
    if (room.black) return res.status(409).json({ error: 'Room already has two players.' });
    const userId = Number(req.body?.userId);
    room.black = {
        color: 'black',
        token: randomBytes(24).toString('hex'),
        userId: Number.isSafeInteger(userId) && userId > 0 ? userId : null,
        username: String(req.body?.username || 'Гость').trim().slice(0, 32) || 'Гость',
        lastSeenAt: Date.now()
    };
    room.version++;
    room.updatedAt = Date.now();
    return res.status(200).json({
        roomId: room.id,
        playerToken: room.black.token,
        color: 'black',
        state: roomResponse(room, room.black.token)
    });
});

app.get('/api/room/:id/state', (req, res) => {
    pruneRooms();
    const { room, seat } = getRoomAndSeat(req.params.id, String(req.query.token || ''));
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!seat) return res.status(403).json({ error: 'Invalid room token.' });
    return res.json({ state: roomResponse(room, seat.token) });
});

app.post('/api/room/:id/move', (req, res) => {
    pruneRooms();
    const { room, seat } = getRoomAndSeat(req.params.id, String(req.body?.playerToken || ''));
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!seat) return res.status(403).json({ error: 'Invalid room token.' });
    if (!room.black || room.finished) return res.status(409).json({ error: 'Room is not accepting moves.' });
    if (Number(req.body?.expectedVersion) !== room.version) {
        return res.status(409).json({ error: 'Room state changed. Reload the current position.' });
    }
    if (seat.color !== room.turn) return res.status(409).json({ error: 'It is not your turn.' });
    const uci = String(req.body?.move || '').toLowerCase();
    const fen = req.body?.fen;
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci) ||
        typeof fen !== 'string' || fen.length > 256 || fen.trim().split(/\s+/).length !== 6) {
        return res.status(400).json({ error: 'Invalid move.' });
    }
    room.moves.push({ coordinate: `${uci.slice(0, 2)}-${uci.slice(2, 4)}`, uci });
    room.fen = fen;
    room.turn = room.turn === 'white' ? 'black' : 'white';
    room.version++;
    room.updatedAt = Date.now();
    return res.json({ state: roomResponse(room, seat.token) });
});

app.post('/api/room/:id/finish', async (req, res) => {
    pruneRooms();
    const { room, seat } = getRoomAndSeat(req.params.id, String(req.body?.playerToken || ''));
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!seat) return res.status(403).json({ error: 'Invalid room token.' });
    if (!room.black) return res.status(409).json({ error: 'Waiting for the second player.' });
    if (room.finished) return res.json({ success: true, state: roomResponse(room, seat.token) });
    if (room.finishing) return res.status(409).json({ error: 'Room finish is already being processed.' });
    const result = req.body?.result;
    if (!['win', 'loss', 'draw'].includes(result)) {
        return res.status(400).json({ error: 'Invalid game result.' });
    }
    const winner = result === 'draw' ? 'draw' : result === 'win' ? seat.color : (seat.color === 'white' ? 'black' : 'white');
    let client;
    let profile = null;
    room.finishing = true;
    try {
        const whiteId = room.white.userId;
        const blackId = room.black.userId;
        if (whiteId && blackId && whiteId !== blackId) {
            client = await pool.connect();
            await client.query('BEGIN');
            const accounts = await client.query(
                'SELECT id, elo FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
                [[whiteId, blackId]]
            );
            const white = accounts.rows.find((account) => Number(account.id) === whiteId);
            const black = accounts.rows.find((account) => Number(account.id) === blackId);
            if (white && black) {
                const whiteElo = Number(white.elo);
                const blackElo = Number(black.elo);
                if (!Number.isFinite(whiteElo) || !Number.isFinite(blackElo)) {
                    throw new Error('Stored player Elo is not numeric.');
                }
                const expectedWhite = 1 / (1 + Math.pow(10, (blackElo - whiteElo) / 400));
                const whiteScore = winner === 'draw' ? 0.5 : winner === 'white' ? 1 : 0;
                let whiteChange = Math.round(32 * (whiteScore - expectedWhite));
                if (whiteChange === 0 && winner !== 'draw' && whiteScore !== expectedWhite) {
                    whiteChange = whiteScore > expectedWhite ? 1 : -1;
                }
                const whiteNewElo = Math.max(100, whiteElo + whiteChange);
                const blackNewElo = Math.max(100, blackElo - whiteChange);
                const moves = room.moves.map((move) => move.coordinate).join(', ');
                await client.query(
                    'INSERT INTO gamehistory (userid, result, fen, moves) VALUES ($1, $2, $3, $4), ($5, $6, $3, $4)',
                    [whiteId, winner === 'draw' ? 'draw' : winner === 'white' ? 'win' : 'loss',
                        room.fen, moves, blackId, winner === 'draw' ? 'draw' : winner === 'black' ? 'win' : 'loss']
                );
                await client.query(
                    'UPDATE users SET elo = CASE id WHEN $1 THEN $2 WHEN $3 THEN $4 END, league = CASE id WHEN $1 THEN $5 WHEN $3 THEN $6 END WHERE id IN ($1, $3)',
                    [whiteId, whiteNewElo, blackId, blackNewElo, leagueForElo(whiteNewElo), leagueForElo(blackNewElo)]
                );
                const profileId = Number(seat.userId);
                const profileElo = profileId === whiteId ? whiteNewElo : blackNewElo;
                profile = {
                    id: profileId,
                    elo: profileElo,
                    league: leagueForElo(profileElo)
                };
            }
            await client.query('COMMIT');
        }
        room.finished = true;
        room.finishing = false;
        room.winner = winner;
        room.version++;
        room.updatedAt = Date.now();
        return res.json({ success: true, state: roomResponse(room, seat.token), profile });
    } catch (error) {
        room.finishing = false;
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Room finish rollback failed:', rollbackError.message);
            }
        }
        console.error('Room finish error:', error.message);
        return res.status(500).json({ error: 'Room could not be finished.' });
    } finally {
        if (client) client.release();
    }
});

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
                    , league
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
            league: user.league,
            last_energy_update: user.last_energy_update,
            sessionToken: createSessionToken(user.id)
        });
    } catch (error) {
        console.error('Login error:', error.message);
        return res.status(500).json({ error: 'Login failed.' });
    }
});

app.post('/logout', (req, res) => {
    const match = String(req.get('authorization') || '').match(/^Bearer\s+([a-f0-9]{64})$/i);
    if (match) sessions.delete(match[1]);
    return res.json({ success: true });
});

app.get('/api/profile', async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ error: 'Invalid user.' });
    }
    try {
        await pool.query(`UPDATE users SET ${REGEN_SET} WHERE id = $1 AND ${REGEN_WHERE}`, [userId]);
        const result = await pool.query(
            `SELECT id, username, elo, energy, role, is_premium, league, last_energy_update,
                    (SELECT COUNT(*) + 1 FROM users AS ranked
                     WHERE ranked.elo > profile.elo) AS rank
             FROM users AS profile WHERE id = $1`,
            [userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        return res.json(result.rows[0]);
    } catch (error) {
        console.error('Profile error:', error.message);
        return res.status(500).json({ error: 'Profile unavailable.' });
    }
});

// ---- История партий ----
app.post('/api/save-game', async (req, res) => {
    const userId = Number(req.body.userId ?? req.body.userid);
    const requestedResult = req.body.result;
    const result = requestedResult === 'lose' ? 'loss' : requestedResult;
    const { fen, moves } = req.body;
    const gameMode = req.body.gameMode === 'pvc' ? 'pvc' : 'pvp';
    const difficulty = Number(req.body.difficulty);
    if (!Number.isSafeInteger(userId) || userId < 1 ||
        !['win', 'loss', 'draw'].includes(result) ||
        typeof fen !== 'string' || fen.length > 256 ||
        typeof moves !== 'string' || moves.length > 20000) {
        return res.status(400).json({ error: 'Invalid game data.' });
    }

    const botEloForDifficulty = (level) => {
        if (!Number.isInteger(level) || level < 1 || level > 20) return null;
        if (level <= 2) return 800;
        if (level <= 5) return 1200;
        if (level <= 10) return 1600;
        return 2000;
    };
    const botElo = gameMode === 'pvc' ? botEloForDifficulty(difficulty) : null;
    if (gameMode === 'pvc' && botElo === null) {
        return res.status(400).json({ error: 'Invalid bot difficulty.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const account = await client.query(
            'SELECT elo FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        if (account.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found.' });
        }

        const oldElo = Number(account.rows[0].elo);
        if (!Number.isFinite(oldElo)) throw new Error('Stored player Elo is not numeric.');
        const opponentElo = gameMode === 'pvc' ? botElo : oldElo;
        const actualScore = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
        const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - oldElo) / 400));
        let eloChange = Math.round(32 * (actualScore - expectedScore));
        if (eloChange === 0 && result !== 'draw' && actualScore !== expectedScore) {
            eloChange = actualScore > expectedScore ? 1 : -1;
        }
        const newElo = Math.max(100, Math.round(oldElo + eloChange));
        eloChange = newElo - oldElo;
        const league = leagueForElo(newElo);

        const savedGame = await client.query(
            'INSERT INTO gamehistory (userid, result, fen, moves) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, result, fen, moves]
        );
        const updatedAccount = await client.query(
            'UPDATE users SET elo = $1, league = $2 WHERE id = $3 RETURNING elo, league',
            [newElo, league, userId]
        );
        if (updatedAccount.rows.length === 0) throw new Error('User disappeared during game save.');
        await client.query('COMMIT');
        return res.json({
            success: true,
            gameId: savedGame.rows[0].id,
            elo: Number(updatedAccount.rows[0].elo),
            eloChange,
            league: updatedAccount.rows[0].league
        });
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Game save rollback failed:', rollbackError.message);
            }
        }
        console.error('Game save error:', error.message);
        return res.status(500).json({ error: 'Game could not be saved.' });
    } finally {
        if (client) client.release();
    }
});

app.get('/api/history', async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ error: 'Invalid user.' });
    }
    try {
        const result = await pool.query(
            `SELECT id, result, fen, moves, created_at AS "createdAt"
             FROM gamehistory WHERE userid = $1 ORDER BY created_at DESC LIMIT 100`,
            [userId]
        );
        return res.json({ games: result.rows });
    } catch (error) {
        console.error('History load error:', error.message);
        return res.status(500).json({ error: 'History unavailable.' });
    }
});

app.get('/api/history/:gameId', async (req, res) => {
    const userId = Number(req.query.userId);
    const gameId = Number(req.params.gameId);
    if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(gameId) || gameId < 1) {
        return res.status(400).json({ error: 'Invalid game.' });
    }
    try {
        const result = await pool.query(
            `SELECT id, result, fen, moves, created_at AS "createdAt"
             FROM gamehistory WHERE id = $1 AND userid = $2`,
            [gameId, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Game not found.' });
        return res.json({ game: result.rows[0] });
    } catch (error) {
        console.error('History game load error:', error.message);
        return res.status(500).json({ error: 'Game unavailable.' });
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
    const userId = req.query.userId === undefined ? null : Number(req.query.userId);
    if (userId !== null && (!Number.isSafeInteger(userId) || userId < 1)) {
        return res.status(400).json({ error: 'Invalid user.' });
    }
    try {
        const r = await pool.query(
            `SELECT username, elo, league, is_premium,
                    RANK() OVER (ORDER BY elo DESC) AS rank
             FROM users ORDER BY elo DESC, id ASC LIMIT 10`
        );
        let userRank = null;
        if (userId !== null) {
            const rankResult = await pool.query(
                `SELECT position AS rank, username, elo, league
                 FROM (
                     SELECT id, username, elo, league,
                            RANK() OVER (ORDER BY elo DESC) AS position
                     FROM users
                 ) AS ranked
                 WHERE id = $1`,
                [userId]
            );
            userRank = rankResult.rows[0] || null;
        }
        return res.status(200).json({ leaderboard: r.rows, userRank });
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

// ---- Админка: доступ только для действующей сессии пользователя с ролью admin ----
app.get('/admin/users', requireAdmin, async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT id, username, elo, energy, role, is_blocked, is_premium FROM users ORDER BY id'
        );
        res.status(200).json({ users: r.rows });
    } catch (err) {
        console.error('Ошибка админки:', err.message);
        res.status(500).json({ error: 'Load failed' });
    }
});

app.post('/admin/block', requireAdmin, async (req, res) => {
    const { id, block } = req.body;
    try {
        await pool.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [!!block, id]);
        res.status(200).json({ message: 'User status updated' });
    } catch (error) {
        console.error('Ошибка блокировки:', error.message);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.post('/admin/toggle-premium', requireAdmin, async (req, res) => {
    const { id, premiumStatus } = req.body;
    try {
        await pool.query('UPDATE users SET is_premium = $1 WHERE id = $2', [!!premiumStatus, id]);
        res.status(200).json({ message: 'Premium status updated' });
    } catch (error) {
        console.error('Ошибка премиума:', error.message);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.post('/admin/update-elo', requireAdmin, async (req, res) => {
    const userId = Number(req.body.id ?? req.body.userId);
    const elo = Number(req.body.elo ?? req.body.newElo);
    if (!Number.isSafeInteger(userId) || userId < 1 ||
        !Number.isInteger(elo) || elo < 100 || elo > 3000) {
        return res.status(400).json({ error: 'User id must be positive and Elo must be an integer from 100 to 3000.' });
    }
    const league = leagueForElo(elo);
    try {
        const result = await pool.query(
            'UPDATE users SET elo = $1, league = $2 WHERE id = $3 RETURNING id, username, elo, league',
            [elo, league, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        return res.status(200).json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Admin Elo update error:', error.message);
        return res.status(500).json({ error: 'Elo update failed.' });
    }
});

// ---- Энергия ----
app.post('/api/consume-energy', async (req, res) => {
    const { userId, amount } = req.body;
    const energyAmount = Number(amount);
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1 ||
        !Number.isSafeInteger(energyAmount) || energyAmount < 1) {
        return res.status(400).json({ success: false, error: 'Invalid request.' });
    }
    try {
        await pool.query(`UPDATE users SET ${REGEN_SET} WHERE id = $1 AND ${REGEN_WHERE}`, [userId]);
        const r = await pool.query(
            `UPDATE users
             SET energy = energy - $2,
                 last_energy_update = CASE WHEN energy = 5 THEN NOW() ELSE last_energy_update END
             WHERE id = $1 AND is_premium = FALSE AND energy >= $2 RETURNING energy`,
            [userId, energyAmount]
        );
        if (r.rows.length === 0) {
            const user = await pool.query('SELECT is_premium, energy FROM users WHERE id = $1', [userId]);
            if (user.rows[0]?.is_premium) return res.json({ success: true, newEnergy: user.rows[0].energy });
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
            `UPDATE users
             SET energy = energy - 1,
                 last_energy_update = CASE WHEN energy = 5 THEN NOW() ELSE last_energy_update END
             WHERE username = $1 AND is_premium = FALSE AND energy >= 1 RETURNING energy`,
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
    if (!username) return res.status(400).json({ error: 'Username is required.' });
    try {
        await regenEnergyForUser(username);
        const r = await pool.query(
            'SELECT id, username, elo, energy, role, is_blocked, is_premium, league, last_energy_update FROM users WHERE username = $1',
            [username]
        );
        if (!r.rows[0]) return res.status(404).json({ error: 'User not found.' });
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
