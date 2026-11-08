-- 1. ������� ���� ���� ������, ���� � ��� ���
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'ChessDB')
BEGIN
    CREATE DATABASE ChessDB;
END
GO

-- 2. ������� ����� �� ������ ����� �������
-- ���� �� ��� ��� ������ � ������� ���, ������ ����� ������ ������, ��� �� �������
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'chess_admin')
BEGIN
    CREATE LOGIN [chess_admin] WITH PASSWORD = 'StrongPassword123!', CHECK_POLICY = OFF;
END
GO

-- 3. ������ ������������� �� ����
USE ChessDB;
GO

-- 4. ������� ������������ ������ ���� ��� ����� ������
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'chess_admin')
BEGIN
    CREATE USER [chess_admin] FOR LOGIN [chess_admin];
END
GO

-- 5. ��������� ����� ���������
ALTER ROLE [db_owner] ADD MEMBER [chess_admin];
GO

-- 6. ������� ������� ������������� (���������)
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(50) NOT NULL UNIQUE,
        password_hash NVARCHAR(MAX) NOT NULL,
        elo INT NOT NULL DEFAULT 800,
        energy INT NOT NULL DEFAULT 5,
        last_energy_update DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

USE ChessDB;
GO

-- ��������� ������� role, ���� � ���
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'role')
    ALTER TABLE Users ADD role NVARCHAR(20) DEFAULT 'user';

-- ��������� ������� is_blocked, ���� � ���
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'is_blocked')
    ALTER TABLE Users ADD is_blocked BIT DEFAULT 0;

-- ��������, ��� Asik - �����
UPDATE Users SET role = 'admin' WHERE username = 'Asik';
GO
USE ChessDB;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'is_premium')
BEGIN
    ALTER TABLE Users ADD is_premium BIT DEFAULT 0;
END
GO

-- ���������, ���� �� �������. ���� ��� - ���������.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'is_premium')
BEGIN
    ALTER TABLE Users ADD is_premium BIT DEFAULT 0;
END
GO
-- ������ ���� ��������� ��� ����� (������ 'Asik' �� ���� ���)
UPDATE Users SET is_premium = 1 WHERE username = 'Asik';
SELECT id, username, elo, energy, role, is_blocked, is_premium FROM Users;



