-- Добавление новых колонок в таблицу Users
ALTER TABLE Users ADD role NVARCHAR(10) DEFAULT 'user';
ALTER TABLE Users ADD is_blocked BIT DEFAULT 0;

-- Создание таблицы истории матчей
CREATE TABLE MatchHistory (
    id INT IDENTITY(1,1) PRIMARY KEY,
    player_white INT FOREIGN KEY REFERENCES Users(id),
    player_black INT FOREIGN KEY REFERENCES Users(id),
    result NVARCHAR(10), -- 'white_win', 'black_win', 'draw'
    elo_change_white INT,
    elo_change_black INT,
    game_date DATETIME DEFAULT GETDATE()
);

-- Создание индексов для производительности
CREATE INDEX idx_match_history_player_white ON MatchHistory(player_white);
CREATE INDEX idx_match_history_player_black ON MatchHistory(player_black);
CREATE INDEX idx_match_history_date ON MatchHistory(game_date);