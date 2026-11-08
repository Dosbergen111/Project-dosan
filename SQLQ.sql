-- 0. Сначала создаем таблицу Users (Фундамент)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Users]') AND type in (N'U'))
BEGIN
    CREATE TABLE Users (
        id INT PRIMARY KEY IDENTITY(1,1),
        username NVARCHAR(50) UNIQUE NOT NULL,
        passwordHash NVARCHAR(255) NOT NULL,
        is_premium BIT DEFAULT 0, -- 0 - обычный, 1 - премиум
        createdAt DATETIME DEFAULT GETDATE()
    );
    PRINT '✅ Таблица Users создана.';
END

-- 1. Теперь GameHistory (уже не выдаст ошибку)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GameHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE GameHistory (
        id INT PRIMARY KEY IDENTITY(1,1),
        userId INT NOT NULL,
        result NVARCHAR(50),
        fen TEXT,
        moves NVARCHAR(MAX),
        date DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_GameHistory_Users FOREIGN KEY (userId) REFERENCES Users(id)
    );
    PRINT '✅ Таблица GameHistory создана.';
END

-- 2. И GlobalChat
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GlobalChat]') AND type in (N'U'))
BEGIN
    CREATE TABLE GlobalChat (
        id INT PRIMARY KEY IDENTITY(1,1),
        userId INT NOT NULL,
        username NVARCHAR(50),
        message NVARCHAR(500),
        sentAt DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_GlobalChat_Users FOREIGN KEY (userId) REFERENCES Users(id)
    );
    PRINT '✅ Таблица GlobalChat создана.';
END
USE ChessDB;
GO
SELECT * FROM Users;
SELECT * FROM GameHistory;
SELECT * FROM GlobalChat;
