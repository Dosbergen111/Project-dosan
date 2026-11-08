// ========== ДОБАВИТЬ ЭТОТ КОД В КОНЕЦ server.js ==========

app.post('/api/buy-premium', async (req, res) => {
    const { userId, username, plan, price } = req.body;
    
    if (!userId || !username) {
        return res.status(400).json({ error: 'User ID и Username обязательны' });
    }
    
    if (!['month', 'quarter', 'lifetime'].includes(plan)) {
        return res.status(400).json({ error: 'Неверный план подписки' });
    }
    
    try {
        console.log(`💰 [PREMIUM] Обработка покупки: ${username} (ID: ${userId}) - План: ${plan}`);
        
        await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('id', sql.Int, userId);
        request.input('status', sql.Bit, 1);
        request.input('username', sql.NVarChar(50), username);
        
        const updateResult = await request.query(`
            UPDATE Users 
            SET is_premium = @status,
                energy = 5,
                last_energy_update = GETDATE()
            WHERE id = @id AND username = @username;
            
            SELECT id, username, elo, energy, role, is_blocked, is_premium, last_energy_update
            FROM Users
            WHERE id = @id;
        `);
        
        if (updateResult.recordsets[0].length === 0) {
            console.error(`❌ [PREMIUM] Пользователь не найден: ${username}`);
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const updatedUser = updateResult.recordsets[0][0];
        console.log(`✅ [PREMIUM] Успешно: ${username} is_premium = ${updatedUser.is_premium}`);
        
        return res.status(200).json({
            success: true,
            message: `Премиум активирован!`,
            user: updatedUser,
            plan: plan,
            price: price
        });
        
    } catch (error) {
        console.error('❌ [PREMIUM] Ошибка:', error.message);
        return res.status(500).json({ 
            error: 'Ошибка при активации премиума',
            details: error.message 
        });
    } finally {
        await sql.close();
    }
});

app.listen(PORT, () => {
    console.log('Server is running on http://localhost:' + PORT);
});
