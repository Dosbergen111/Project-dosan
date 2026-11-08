USE ChessDB;
GO

-- 1. Сначала удаляем старую таблицу, если она есть
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
GO

-- 2. Создаем таблицу со всеми нужными полями СРАЗУ
CREATE TABLE dbo.Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    password_hash NVARCHAR(MAX) NOT NULL,
    elo INT NOT NULL DEFAULT 800,
    energy INT NOT NULL DEFAULT 5,
    role NVARCHAR(20) NOT NULL DEFAULT 'user', -- Добавили роль сразу
    is_blocked BIT NOT NULL DEFAULT 0,         -- Статус блока сразу
    league NVARCHAR(50) NOT NULL DEFAULT 'Bronze', -- Лигу сразу
    last_energy_update DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- 3. Добавляем твой админский аккаунт (пароль нужно будет хешировать в приложении)
-- Внимание: если ты просто добавишь строку через SQL, bcrypt на сервере ее не пропустит.
-- Лучше сначала зарегистрируйся через сайт, а потом выполни UPDATE ниже.
UPDATE Users SET role = 'admin' WHERE username = 'Asik'
GO
USE ChessDB;
-- Поиск по всем базам данных, где есть таблица Users
USE ChessDB;
SELECT * FROM Users;