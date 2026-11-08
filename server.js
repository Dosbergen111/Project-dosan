const regenSQL = `
    UPDATE Users 
    SET energy = CASE 
        WHEN energy + (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) > 5 THEN 5 
        ELSE energy + (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) 
    END,
    last_energy_update = CASE 
        WHEN energy + (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) >= 5 THEN GETDATE()
        ELSE DATEADD(MINUTE, (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) * 30, last_energy_update)
    END
    WHERE username = @username AND energy < 5 AND DATEDIFF(MINUTE, last_energy_update, GETDATE()) >= 30
`;
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const sql = require('mssql');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('./'));  // Подавать статические файлы из текущей папки

// Принудительно отправляем chess.html, если зашли по главному адресу
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/chess.html');
});

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
// Проверка подключения к базе при старте
sql.connect(dbConfig).then(pool => {
    if (pool.connected) {
        console.log("✅ СИСТЕМА: Соединение с ChessDB установлено успешно.");
    }
}).catch(err => {
    console.log("❌ КРИТИЧЕСКАЯ ОШИБКА: База данных недоступна!");
    console.error(err.message);
});
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

        // ВАЖНО: Добавили role, is_blocked и is_premium в SELECT
        const result = await request.query(`
            SELECT id, username, password_hash, elo, energy, role, is_blocked, is_premium, last_energy_update
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
        // ------------------------------

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed.' });
    } finally {
        await sql.close();
    }
});

app.post('/api/save-game', async (req, res) => {
    const { userId, result, fen, moves } = req.body;

    if (!userId || !fen) {
        return res.status(400).json({ error: 'Данные не полные' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('result', sql.NVarChar, result)
            .input('fen', sql.Text, fen)
            .input('moves', sql.NVarChar, moves)
            .query(`INSERT INTO GameHistory (userId, result, fen, moves) VALUES (@userId, @result, @fen, @moves)`);

        console.log(`[БАЗА] Партия сохранена для юзера ID: ${userId}`);
        res.json({ success: true, message: 'Партия в архиве' });
    } catch (err) {
        console.error('Ошибка сохранения истории:', err);
        res.status(500).send(err.message);
    }
});

// 1. Отправка сообщения в чат
app.post('/api/chat/send', async (req, res) => {
    const { userId, username, message } = req.body;
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('username', sql.NVarChar, username)
            .input('message', sql.NVarChar, message)
            .query('INSERT INTO GlobalChat (userId, username, message) VALUES (@userId, @username, @message)');
        res.json({ success: true });
    } catch (err) {
        console.error('Chat send error:', err);
        res.status(500).send(err.message);
    } finally {
        await sql.close();
    }
});

// 2. Получение истории чата (последние 50 сообщений)
app.get('/api/chat/messages', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query('SELECT TOP 50 * FROM GlobalChat ORDER BY sentAt DESC');
        res.json(result.recordset.reverse()); // Переворачиваем, чтобы новые были внизу
    } catch (err) {
        console.error('Chat messages error:', err);
        res.status(500).send(err.message);
    } finally {
        await sql.close();
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query('SELECT TOP 10 username, elo, is_premium FROM Users ORDER BY elo DESC, is_premium DESC');
        return res.status(200).json({ leaderboard: result.recordset });
    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    } finally {
        await sql.close();
    }
});


app.post('/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    if (!username || !oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Username, old password, and new password are required.' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    try {
        await sql.connect(dbConfig);

        const request = new sql.Request();
        request.input('username', sql.NVarChar(50), username);

        const result = await request.query(`
            SELECT password_hash FROM Users WHERE username = @username
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const isOldPasswordValid = await bcrypt.compare(oldPassword, result.recordset[0].password_hash);

        if (!isOldPasswordValid) {
            return res.status(401).json({ error: 'Old password is incorrect.' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        const updateRequest = new sql.Request();
        updateRequest.input('username', sql.NVarChar(50), username);
        updateRequest.input('password_hash', sql.NVarChar(sql.MAX), hashedNewPassword);

        await updateRequest.query(`
            UPDATE Users SET password_hash = @password_hash WHERE username = @username
        `);

        return res.status(200).json({ message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ error: 'Failed to change password.' });
    } finally {
        await sql.close();
    }
});

// Восстановление энергии каждые 30 минут
setInterval(async () => {
    try {
        await sql.connect(dbConfig);
        await sql.query(`
            UPDATE Users SET energy = CASE WHEN energy < 5 THEN energy + 1 ELSE energy END
        `);
        console.log('Energy restored for users with energy < 5');
    } catch (error) {
        console.error('Energy restoration error:', error);
    } finally {
        await sql.close();
    }
}, 30 * 60 * 1000); // 30 минут

const PORT = process.env.PORT || 3000;
// 1. Получить список всех пользователей (только для админа)

// 2. Заблокировать/Разблокировать пользователя
// Маршрут для блокировки
app.post('/admin/block', async (req, res) => {
    const { id, block } = req.body; // Фронтенд шлет id и block
    try {
        const pool = await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('status', sql.Bit, block);
        
        await request.query('UPDATE Users SET is_blocked = @status WHERE id = @id');
        res.status(200).json({ message: 'User status updated' });
    } catch (error) {
        console.error("Ошибка блокировки:", error.message);
        res.status(500).json({ error: 'Update failed' });
    }
    // sql.close() здесь НЕ НУЖЕН, он закрывает весь пул соединений
});
// Маршрут для VIP-статуса
app.post('/admin/toggle-premium', async (req, res) => {
    const { id, premiumStatus } = req.body; // Фронтенд шлет id и premiumStatus
    try {
        const pool = await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('status', sql.Bit, premiumStatus);
        
        await request.query('UPDATE Users SET is_premium = @status WHERE id = @id');
        res.status(200).json({ message: 'Premium status updated' });
    } catch (error) {
        console.error("Ошибка премиума:", error.message);
        res.status(500).json({ error: 'Update failed' });
    }
});
// 3. Изменить Elo (например, для тестов или наград)
app.post('/admin/update-elo', async (req, res) => {
    const { userId, newElo } = req.body;
    try {
        await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('id', sql.Int, userId);
        request.input('elo', sql.Int, newElo);
        
        await request.query('UPDATE Users SET elo = @elo WHERE id = @id');
        res.status(200).json({ message: 'Elo updated' });
    } catch (error) {
        res.status(500).json({ error: 'Elo update failed' });
    } finally {
        await sql.close();
    }
});

// Получение списка всех игроков (только для админа)
app.get('/admin/users', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        
        // 1. Регенерация (оставляем твой код, он верный)
        await pool.request().query(`
            UPDATE Users 
            SET energy = CASE 
                WHEN energy + (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) > 5 THEN 5 
                ELSE energy + (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) 
            END,
            last_energy_update = CASE 
                WHEN energy + (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) >= 5 THEN GETDATE()
                ELSE DATEADD(MINUTE, (DATEDIFF(MINUTE, last_energy_update, GETDATE()) / 30) * 30, last_energy_update)
            END
            WHERE energy < 5 AND DATEDIFF(MINUTE, last_energy_update, GETDATE()) >= 30
        `);

        // 2. Получаем список пользователей + ДОБАВИЛИ is_premium
        const result = await pool.request().query(`
            SELECT id, username, elo, energy, role, is_blocked, is_premium 
            FROM Users
        `);
        
        console.log(`[DEBUG] Данные загружены для ${result.recordset.length} юзеров.`);

        // 3. Отправляем (теперь объект содержит флаг премиума)
        res.status(200).json({ 
            users: result.recordset 
        });

    } catch (err) {
        console.error("❌ ОШИБКА АДМИНКИ:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/consume-energy', async (req, res) => {
    const { userId, amount } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        
        // Сначала проверяем, хватает ли энергии
        let userResult = await pool.request()
            .input('id', sql.Int, userId)
            .query('SELECT energy FROM Users WHERE id = @id');
        
        if (userResult.recordset[0].energy < amount) {
            return res.status(400).json({ success: false, message: 'Недостаточно энергии' });
        }

        // Вычитаем энергию
        let updateResult = await pool.request()
            .input('id', sql.Int, userId)
            .input('amount', sql.Int, amount)
            .query('UPDATE Users SET energy = energy - @amount OUTPUT inserted.energy WHERE id = @id');

        res.json({ success: true, newEnergy: updateResult.recordset[0].energy });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// ВСТАВЬ ЭТО В SERVER.JS
app.post('/use-energy', async (req, res) => {
    const { username } = req.body;
    const amount = 1;

    if (!username) {
        return res.status(400).json({ error: 'Username is required.' });
    }

    try {
        let pool = await sql.connect(dbConfig);

        // 1. Проверяем статус пользователя (Premium или нет)
        const userStatus = await pool.request()
            .input('user', sql.NVarChar, username)
            .query('SELECT is_premium, energy FROM Users WHERE username = @user');

        if (userStatus.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = userStatus.recordset[0];

        // 2. ЕСЛИ ПРЕМИУМ: Энергию не трогаем, просто говорим "OK"
        if (user.is_premium) {
            return res.json({ energy: user.energy, isPremium: true });
        }

        // 3. ДЛЯ ОБЫЧНЫХ: Списываем 1 ед. и сразу получаем новый остаток через OUTPUT
        let updateResult = await pool.request()
            .input('user', sql.NVarChar, username)
            .input('amt', sql.Int, amount)
            .query(`
                UPDATE Users 
                SET energy = energy - @amt 
                OUTPUT inserted.energy 
                WHERE username = @user AND energy >= @amt
            `);

        if (updateResult.recordset.length === 0) {
            return res.status(400).json({ error: 'Not enough energy.' });
        }

        // Возвращаем обновленное значение
        res.json({ 
            energy: updateResult.recordset[0].energy, 
            isPremium: false 
        });

    } catch (err) {
        console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ЭНЕРГИИ:", err.message);
        res.status(500).json({ error: 'Database error' });
    }
});
// Этот SQL-запрос — "сердце" твоей регенерации. 
// Он работает, даже если юзер был оффлайн год.

// ПРИМЕР: Вставляем в роут логина или получения профиля
app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        
        // 1. Сначала "будим" регенерацию для этого юзера
        await pool.request()
            .input('username', sql.NVarChar, username)
            .query(regenSQL);

        // 2. А теперь отдаем данные (они уже будут обновлены!)
        let result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT * FROM Users WHERE username = @username');

        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/buy-premium', async (req, res) => {
    const { userId, username } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
        await sql.connect(dbConfig);
        const r = new sql.Request();
        r.input('id', sql.Int, userId);
        r.input('premium', sql.Bit, 1);
        await r.query('UPDATE Users SET is_premium = @premium WHERE id = @id');
        const result = await r.query('SELECT id, username, elo, is_premium FROM Users WHERE id = @id');
        res.json({ success: true, user: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await sql.close();
    }
});

app.listen(PORT, () => {
    console.log('Server is running on http://localhost:' + PORT);
});
