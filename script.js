const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const themeToggle = document.getElementById('theme-toggle');

let board = [];
let currentPlayer = 'white';
let selectedSquare = null;
let possibleMoves = [];
let moveHistory = [];
let enPassantTarget = null;
let castlingRights = { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } };
let gameActive = false;
let enableAnimations = true;
let enableSounds = true;
let enablePremiumSounds = false;
let enableCoordinates = true;
let enableMaterial = true;
let currentBoardStyle = 'default';
let currentBoardSize = 'medium';
let currentPieceSet = 'classic';
let blindBoardActive = false;

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
async function getAudioContext() {
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
        } catch (e) {
            console.warn('AudioContext resume failed:', e);
        }
    }
    return audioContext;
}
let playerElo = 1200;
let eloHistory = [];
let eloGainedInLastGame = 0;

// Переменные для игры против Stockfish
let gameMode = 'pvp'; // 'pvp' = человек vs человек, 'pvc' = человек vs компьютер
let playerColor = 'white';
let difficulty = 10; // 1-20, чем выше, тем сложнее
let isComputerThinking = false;
let stockfish = null;
let boardFlipped = false; // Переворот доски для чёрных игроков

const pieces = {
    'white': { 'king': '♔', 'queen': '♕', 'rook': '♖', 'bishop': '♗', 'knight': '♘', 'pawn': '♙' },
    'black': { 'king': '♚', 'queen': '♛', 'rook': '♜', 'bishop': '♝', 'knight': '♞', 'pawn': '♟' }
};

const pieceSets = {
    classic: pieces,
    gold: {
        white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
        black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
    },
    cyberpunk: {
        white: { king: '王', queen: '后', rook: '車', bishop: '象', knight: '馬', pawn: '兵' },
        black: { king: '玉', queen: '皇', rook: '車', bishop: '象', knight: '馬', pawn: '卒' }
    }
};

const pieceValues = { 'pawn': 1, 'knight': 3, 'bishop': 3, 'rook': 5, 'queen': 9, 'king': 0 };

function getPieceSymbol(piece) {
    if (!piece) return '';
    const activeSet = pieceSets[currentPieceSet] || pieceSets.classic;
    return activeSet[piece.color][piece.type] || pieces[piece.color][piece.type];
}

function changePieceSet(setName) {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    if ((setName === 'gold' || setName === 'cyberpunk') && !userData.is_premium) {
        showNotification('👑 Премиум-история: эти наборы доступны только VIP-пользователям', 'warning');
        return;
    }
    currentPieceSet = setName;
    localStorage.setItem('pieceSet', setName);
    updatePieceSetButtons();
    renderBoard();
}

function updatePieceSetButtons() {
    const buttons = document.querySelectorAll('.premium-piece-btn');
    buttons.forEach(btn => {
        if (btn.dataset.set === currentPieceSet) {
            btn.classList.add('active-piece');
        } else {
            btn.classList.remove('active-piece');
        }
    });
}

function toggleBlindBoard() {
    const checkbox = document.getElementById('blindboard-toggle');
    if (!checkbox) return;
    blindBoardActive = checkbox.checked;
    localStorage.setItem('blindBoardActive', blindBoardActive);
    boardElement.classList.toggle('blindboard-mode', blindBoardActive);
}

let whiteTime = 600;
let blackTime = 600;
let timerInterval;
let selectedTime = 600;
let gameMoves = [];

// Инициализация Stockfish
function initStockfish() {
    if (typeof Stockfish === 'undefined') {
        console.warn('Stockfish не загружен. Скачивание...');
        return;
    }
    new Stockfish().then(sf => {
        stockfish = sf;
        console.log('✅ Stockfish готов!');
    }).catch(err => {
        console.error('❌ Ошибка загрузки Stockfish:', err);
    });
}

function setGameMode(mode) {
    gameMode = mode;
    const colorLabel = document.getElementById('player-color-label');
    const colorButtons = document.getElementById('player-color-buttons');
    const diffLabel = document.getElementById('difficulty-label');
    const diffButtons = document.getElementById('difficulty-buttons');
    const opponentInfo = document.getElementById('opponent-info');
    
    if (mode === 'pvc') {
        colorLabel.style.display = 'block';
        colorButtons.style.display = 'flex';
        diffLabel.style.display = 'block';
        diffButtons.style.display = 'flex';
        if (opponentInfo) opponentInfo.style.display = 'block';
        updateOpponentInfo();
    } else {
        colorLabel.style.display = 'none';
        colorButtons.style.display = 'none';
        diffLabel.style.display = 'none';
        diffButtons.style.display = 'none';
        if (opponentInfo) opponentInfo.style.display = 'none';
    }
}

function setDifficulty(level) {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    if (level === 20 && !userData.is_premium) {
        showNotification('🔒 Гроссмейстер доступен только VIP-пользователям', 'warning');
        return;
    }

    difficulty = level;
    localStorage.setItem('difficulty', level);
    const diffButtons = document.getElementById('difficulty-buttons');
    if (diffButtons) {
        diffButtons.querySelectorAll('button').forEach(btn => {
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn.style.borderColor = '';
        });
        const button = Array.from(diffButtons.querySelectorAll('button')).find(btn => 
            btn.textContent.includes(level === 1 ? 'Новичок' : level === 5 ? 'Средний' : level === 10 ? 'Мастер' : 'Гроссмейстер')
        );
        if (button) {
            button.style.backgroundColor = 'var(--accent)';
            button.style.color = 'white';
            button.style.borderColor = 'var(--accent)';
        }
    }
    updateOpponentInfo();
}

function getStockfishMove() {
    if (!stockfish) {
        // Если Stockfish не загрузился, используем простой AI
        return getSimpleAIMove();
    }

    return new Promise((resolve) => {
        const fen = boardToFEN();
        const depth = Math.min(difficulty, 20);
        
        stockfish.postMessage('position fen ' + fen);
        stockfish.postMessage('go depth ' + depth);
        
        let bestMove = null;
        
        const onMessage = (event) => {
            if (event.data && event.data.includes('bestmove')) {
                const match = event.data.match(/bestmove\s+(\S+)/);
                if (match) {
                    bestMove = match[1];
                    stockfish.removeEventListener('message', onMessage);
                    resolve(bestMove);
                }
            }
        };
        
        stockfish.addEventListener('message', onMessage);
        
        // Таймаут на случай проблем
        setTimeout(() => {
            if (!bestMove) {
                stockfish.removeEventListener('message', onMessage);
                resolve(getSimpleAIMove());
            }
        }, 3000);
    });
}

function getSimpleAIMove() {
    // Продвинутый AI с поиском в глубину и оценкой позиции
    let depth = 1;
    
    // Определяем глубину поиска на основе сложности
    if (difficulty <= 2) depth = 1;      // Новичок - минимальный поиск
    else if (difficulty <= 5) depth = 2; // Средний - поиск на 2 хода
    else if (difficulty <= 10) depth = 3; // Мастер - поиск на 3 хода
    else depth = 4;                       // Гроссмейстер - глубокий поиск
    
    const result = minimax(board, depth, true, -Infinity, Infinity, difficulty);
    return result.move;
}

function minimax(boardState, depth, isMaximizing, alpha, beta, diff) {
    // Базовый случай - оцениваем позицию
    if (depth === 0) {
        return { score: evaluatePosition(boardState, diff), move: null };
    }
    
    const legalMoves = getAllLegalMoves(boardState, isMaximizing ? currentPlayer : (currentPlayer === 'white' ? 'black' : 'white'));
    
    if (legalMoves.length === 0) {
        // Мат или пат
        return { score: isMaximizing ? -10000 : 10000, move: null };
    }
    
    let bestMove = null;
    
    if (isMaximizing) {
        let maxScore = -Infinity;
        for (let move of legalMoves) {
            const newBoard = makeMoveCopy(boardState, move.from, move.to);
            const result = minimax(newBoard, depth - 1, false, alpha, beta, diff);
            
            if (result.score > maxScore) {
                maxScore = result.score;
                bestMove = move;
            }
            alpha = Math.max(alpha, result.score);
            if (beta <= alpha) break; // Альфа-бета отсечение
        }
        return { score: maxScore, move: bestMove };
    } else {
        let minScore = Infinity;
        for (let move of legalMoves) {
            const newBoard = makeMoveCopy(boardState, move.from, move.to);
            const result = minimax(newBoard, depth - 1, true, alpha, beta, diff);
            
            if (result.score < minScore) {
                minScore = result.score;
                bestMove = move;
            }
            beta = Math.min(beta, result.score);
            if (beta <= alpha) break; // Альфа-бета отсечение
        }
        return { score: minScore, move: bestMove };
    }
}

function getAllLegalMoves(boardState, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (boardState[r][c] && boardState[r][c].color === color) {
                const possibleMoves = getPossibleMovesForBoard(boardState, r, c);
                possibleMoves.forEach(move => {
                    moves.push({ from: { row: r, col: c }, to: move });
                });
            }
        }
    }
    return moves;
}

function makeMoveCopy(boardState, from, to) {
    // Глубокое копирование доски
    const newBoard = boardState.map(row => row.map(cell => cell ? { ...cell } : null));
    newBoard[to.row][to.col] = newBoard[from.row][from.col];
    newBoard[from.row][from.col] = null;
    return newBoard;
}

function getPossibleMovesForBoard(boardState, row, col) {
    const piece = boardState[row][col];
    if (!piece) return [];
    
    const moves = [];
    let candidateMoves = [];
    
    if (piece.type === 'pawn') candidateMoves = getPawnMovesForBoard(boardState, row, col, piece.color);
    else if (piece.type === 'rook') candidateMoves = getRookMovesForBoard(boardState, row, col, piece.color);
    else if (piece.type === 'bishop') candidateMoves = getBishopMovesForBoard(boardState, row, col, piece.color);
    else if (piece.type === 'queen') candidateMoves = getQueenMovesForBoard(boardState, row, col, piece.color);
    else if (piece.type === 'knight') candidateMoves = getKnightMovesForBoard(boardState, row, col, piece.color);
    else if (piece.type === 'king') candidateMoves = getKingMovesForBoard(boardState, row, col, piece.color);
    
    return candidateMoves.filter(move => !wouldBeInCheckForBoard(boardState, row, col, move.row, move.col, piece.color));
}

function getPawnMovesForBoard(boardState, row, col, color) {
    const moves = [];
    const direction = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    
    if (row + direction >= 0 && row + direction < 8 && !boardState[row + direction][col]) {
        moves.push({ row: row + direction, col: col });
        if (row === startRow && !boardState[row + 2 * direction][col]) {
            moves.push({ row: row + 2 * direction, col: col });
        }
    }
    
    if (col - 1 >= 0 && row + direction >= 0 && row + direction < 8 && boardState[row + direction][col - 1] && boardState[row + direction][col - 1].color !== color) {
        moves.push({ row: row + direction, col: col - 1 });
    }
    if (col + 1 < 8 && row + direction >= 0 && row + direction < 8 && boardState[row + direction][col + 1] && boardState[row + direction][col + 1].color !== color) {
        moves.push({ row: row + direction, col: col + 1 });
    }
    
    return moves;
}

function getRookMovesForBoard(boardState, row, col, color) {
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let [dr, dc] of directions) {
        for (let i = 1; i < 8; i++) {
            const nr = row + dr * i, nc = col + dc * i;
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
            if (!boardState[nr][nc]) moves.push({ row: nr, col: nc });
            else {
                if (boardState[nr][nc].color !== color) moves.push({ row: nr, col: nc });
                break;
            }
        }
    }
    return moves;
}

function getBishopMovesForBoard(boardState, row, col, color) {
    const moves = [];
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let [dr, dc] of directions) {
        for (let i = 1; i < 8; i++) {
            const nr = row + dr * i, nc = col + dc * i;
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
            if (!boardState[nr][nc]) moves.push({ row: nr, col: nc });
            else {
                if (boardState[nr][nc].color !== color) moves.push({ row: nr, col: nc });
                break;
            }
        }
    }
    return moves;
}

function getQueenMovesForBoard(boardState, row, col, color) {
    return getRookMovesForBoard(boardState, row, col, color).concat(getBishopMovesForBoard(boardState, row, col, color));
}

function getKnightMovesForBoard(boardState, row, col, color) {
    const moves = [];
    const deltas = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
    for (let [dr, dc] of deltas) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            if (!boardState[nr][nc] || boardState[nr][nc].color !== color) {
                moves.push({ row: nr, col: nc });
            }
        }
    }
    return moves;
}

function getKingMovesForBoard(boardState, row, col, color) {
    const moves = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                if (!boardState[nr][nc] || boardState[nr][nc].color !== color) {
                    moves.push({ row: nr, col: nc });
                }
            }
        }
    }
    return moves;
}

function wouldBeInCheckForBoard(boardState, fromRow, fromCol, toRow, toCol, color) {
    const testBoard = makeMoveCopy(boardState, { row: fromRow, col: fromCol }, { row: toRow, col: toCol });
    const kingPos = findKingForBoard(testBoard, color);
    return isSquareAttackedForBoard(kingPos.row, kingPos.col, color, testBoard);
}

function findKingForBoard(boardState, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (boardState[r][c] && boardState[r][c].type === 'king' && boardState[r][c].color === color) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

function isSquareAttackedForBoard(row, col, color, boardState) {
    const opponent = color === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (boardState[r][c] && boardState[r][c].color === opponent) {
                if (canAttackForBoard(r, c, row, col, boardState[r][c], boardState)) return true;
            }
        }
    }
    return false;
}

function canAttackForBoard(fromRow, fromCol, toRow, toCol, piece, boardState) {
    if (piece.type === 'pawn') {
        const direction = piece.color === 'white' ? -1 : 1;
        return fromRow + direction === toRow && Math.abs(fromCol - toCol) === 1;
    }
    if (piece.type === 'knight') {
        return (Math.abs(fromRow - toRow) === 2 && Math.abs(fromCol - toCol) === 1) ||
               (Math.abs(fromRow - toRow) === 1 && Math.abs(fromCol - toCol) === 2);
    }
    if (piece.type === 'king') {
        return Math.abs(fromRow - toRow) <= 1 && Math.abs(fromCol - toCol) <= 1;
    }
    if (piece.type === 'rook' || piece.type === 'queen') {
        if (fromRow === toRow || fromCol === toCol) {
            return isPathClearForBoard(fromRow, fromCol, toRow, toCol, boardState);
        }
    }
    if (piece.type === 'bishop' || piece.type === 'queen') {
        if (Math.abs(fromRow - toRow) === Math.abs(fromCol - toCol)) {
            return isPathClearForBoard(fromRow, fromCol, toRow, toCol, boardState);
        }
    }
    return false;
}

function isPathClearForBoard(fromRow, fromCol, toRow, toCol, boardState) {
    const dr = toRow > fromRow ? 1 : toRow < fromRow ? -1 : 0;
    const dc = toCol > fromCol ? 1 : toCol < fromCol ? -1 : 0;
    let r = fromRow + dr, c = fromCol + dc;
    
    while (r !== toRow || c !== toCol) {
        if (boardState[r][c]) return false;
        r += dr;
        c += dc;
    }
    return true;
}

function evaluatePosition(boardState, diff) {
    let score = 0;
    
    // Оценка материала
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (boardState[r][c]) {
                const piece = boardState[r][c];
                let pieceScore = pieceValues[piece.type] * 100;
                
                // Позиционная оценка
                if (piece.type === 'pawn') {
                    const pawnRank = piece.color === 'white' ? 7 - r : r;
                    pieceScore += pawnRank * 10 + (diff > 10 ? 15 : 5);
                } else if (piece.type === 'knight' || piece.type === 'bishop') {
                    pieceScore += 20 - Math.abs(r - 3.5) - Math.abs(c - 3.5);
                }
                
                score += (piece.color === currentPlayer ? 1 : -1) * pieceScore;
            }
        }
    }
    
    // Король в центре в эндшпиле
    const whiteKing = findKingForBoard(boardState, 'white');
    const blackKing = findKingForBoard(boardState, 'black');
    const endgameFactor = diff > 12 ? 0.5 : 0;
    
    if (whiteKing) score += (currentPlayer === 'white' ? 1 : -1) * (8 - Math.abs(whiteKing.row - 3.5) - Math.abs(whiteKing.col - 3.5)) * endgameFactor;
    if (blackKing) score += (currentPlayer === 'black' ? 1 : -1) * (8 - Math.abs(blackKing.row - 3.5) - Math.abs(blackKing.col - 3.5)) * endgameFactor;
    
    return score;
}




function isSquareAttackedWithBoard(row, col, color, tempBoard) {
    const opponent = color === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = tempBoard[r][c];
            if (piece && piece.color === opponent) {
                if (canAttackWithBoard(r, c, row, col, piece, tempBoard)) return true;
            }
        }
    }
    return false;
}

function findKing(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].type === 'king' && board[r][c].color === color) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

function getBestMove() {
    const bestMove = getSimpleAIMove();
    return bestMove;
}

async function showHint() { // Добавили async
    if (!gameActive) return;

    // 1. Проверка на ход компьютера
    if (gameMode === 'pvc' && currentPlayer !== playerColor) {
        alert('⏸️ Это ход компьютера');
        return;
    }

    // 2. Логика расхода энергии
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData) {
        alert('Вы не авторизованы для получения подсказок');
        return;
    }

    try {
        // Стучимся на сервер (используем тот же эндпоинт, что и для новой игры)
        const response = await fetch('/use-energy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userData.username })
        });

        const result = await response.json();

        if (!response.ok) {
            // Если энергии нет (сервер вернет 400)
            alert('Недостаточно энергии для подсказки!');
            return;
        }

        // Если списание прошло успешно — обновляем локальные данные и UI
        userData.energy = result.energy;
        localStorage.setItem('userData', JSON.stringify(userData));
        updateUI();

        // 3. Твой код показа подсказки (срабатывает только после оплаты)
        const hint = getBestMove();
        if (hint) {
            const fromSquare = String.fromCharCode(97 + hint.from.col) + (8 - hint.from.row);
            const toSquare = String.fromCharCode(97 + hint.to.col) + (8 - hint.to.row);
            const piece = board[hint.from.row][hint.from.col];
            const pieceName = {
                'pawn': 'Пешка',
                'knight': 'Конь',
                'bishop': 'Слон',
                'rook': 'Ладья',
                'queen': 'Ферзь',
                'king': 'Король'
            }[piece.type];
            
            alert(`💡 Подсказка: ${pieceName} с ${fromSquare} на ${toSquare}`);
        }

    } catch (error) {
        console.error('Hint error:', error);
        alert('Ошибка подключения к серверу');
    }
}
function quickSetBoardSize(size, buttonElement) {
    currentBoardSize = size;
    const sizeClass = size === 'small' ? 'board-size-small' : (size === 'large' ? 'board-size-large' : 'board-size-medium');
    
    const boardGridWrapper = document.querySelector('.board-grid-wrapper');
    if (boardGridWrapper) {
        boardGridWrapper.className = `board-grid-wrapper ${sizeClass}`;
    }
    
    localStorage.setItem('boardSize', size);
    
    // Синхронизировать выпадающий список настроек
    const boardSizeSelect = document.getElementById('board-size');
    if (boardSizeSelect) {
        boardSizeSelect.value = size;
    }
    
    // Обновить активную кнопку
    document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
    if (buttonElement instanceof HTMLElement) {
        buttonElement.classList.add('active');
    } else {
        const activeButton = document.querySelector(`.size-btn:nth-child(${size === 'small' ? 2 : size === 'large' ? 4 : 3})`);
        if (activeButton) activeButton.classList.add('active');
    }
}

async function makeComputerMove() {
    if (gameActive && gameMode === 'pvc' && currentPlayer !== playerColor) {
        isComputerThinking = true;
        statusElement.textContent = '🤖 Компьютер думает...';
        
        try {
            // Используем простой AI (так как Stockfish сложный в браузере)
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));
            
            const aiMove = getSimpleAIMove();
            if (aiMove) {
                makeMove(aiMove.from, aiMove.to);
            }
        } catch (err) {
            console.error('Ошибка при ходе компьютера:', err);
        }
        
        isComputerThinking = false;
    }
}

async function playSound(type) {
    if (!enableSounds) return;

    const audioCtx = await getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    let duration = 0.14;
    let frequency = 620;
    let waveType = 'sine';
    let volume = 0.19;

    if (type === 'move') {
        frequency = 620;
        duration = 0.12;
    } else if (type === 'capture') {
        frequency = 860;
        duration = 0.16;
    } else if (type === 'check') {
        frequency = 950;
        duration = 0.2;
    }

    if (enablePremiumSounds) {
        waveType = 'triangle';
        volume = 0.24;
    }

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.02, audioCtx.currentTime + duration);
    osc.type = waveType;
    osc.frequency.value = frequency;
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
}

function initBoard() {
    board = Array(8).fill().map(() => Array(8).fill(null));
    board[0] = [
        { type: 'rook', color: 'black' }, { type: 'knight', color: 'black' },
        { type: 'bishop', color: 'black' }, { type: 'queen', color: 'black' },
        { type: 'king', color: 'black' }, { type: 'bishop', color: 'black' },
        { type: 'knight', color: 'black' }, { type: 'rook', color: 'black' }
    ];
    for (let i = 0; i < 8; i++) {
        board[1][i] = { type: 'pawn', color: 'black' };
        board[6][i] = { type: 'pawn', color: 'white' };
    }
    board[7] = [
        { type: 'rook', color: 'white' }, { type: 'knight', color: 'white' },
        { type: 'bishop', color: 'white' }, { type: 'queen', color: 'white' },
        { type: 'king', color: 'white' }, { type: 'bishop', color: 'white' },
        { type: 'knight', color: 'white' }, { type: 'rook', color: 'white' }
    ];
    renderBoard();
    updateTimer();
    updateMaterialBalance();
    updateMovesPanel();
}

function renderBoard() {
    boardElement.innerHTML = '';
    
    // Определяем порядок отрисовки в зависимости от ориентации доски
    const rowStart = boardFlipped ? 7 : 0;
    const rowEnd = boardFlipped ? -1 : 8;
    const rowStep = boardFlipped ? -1 : 1;
    
    const colStart = boardFlipped ? 7 : 0;
    const colEnd = boardFlipped ? -1 : 8;
    const colStep = boardFlipped ? -1 : 1;
    
    // Отрисовка доски с правильным порядком элементов в DOM
    for (let displayRow = rowStart; displayRow !== rowEnd; displayRow += rowStep) {
        for (let displayCol = colStart; displayCol !== colEnd; displayCol += colStep) {
            const square = document.createElement('div');
            
            // Используем оригинальные координаты для логики игры
            const row = displayRow;
            const col = displayCol;
            
            // Стандартная логика цветов
            const isLight = ((row + col) % 2 === 0);
            square.className = 'square ' + (isLight ? 'light' : 'dark');
            
            // Сохраняем оригинальные координаты для обработки кликов
            square.dataset.row = row;
            square.dataset.col = col;
            square.addEventListener('click', () => handleSquareClick(row, col));
            
            // Подсвечивание атакованных клеток
            if (enableAnimations && isSquareAttacked(row, col, 'black')) {
                square.classList.add('attacked-by-black');
            }
            if (enableAnimations && isSquareAttacked(row, col, 'white')) {
                square.classList.add('attacked-by-white');
            }
            
            if (board[row][col]) {
                const piece = board[row][col];
                square.textContent = getPieceSymbol(piece);
                square.classList.add(piece.color + '-piece');
            }
            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                square.classList.add('selected');
            }
            if (possibleMoves.some(move => move.row === row && move.col === col)) {
                square.classList.add('possible');
            }
            boardElement.appendChild(square);
        }
    }
    boardElement.classList.toggle('gold-piece-set', currentPieceSet === 'gold');
    boardElement.classList.toggle('cyberpunk-piece-set', currentPieceSet === 'cyberpunk');
    
    // Обновить координаты в зависимости от ориентации
    updateBoardCoordinates();
    
    updateMaterialBalance();
}

function updateBoardCoordinates() {
    const rowLabels = document.querySelectorAll('.board-grid-wrapper .row-label');
    const colLabels = document.querySelectorAll('.board-grid-wrapper .col-label');
    
    if (!rowLabels || !colLabels || rowLabels.length === 0 || colLabels.length === 0) return;
    
    // Обновляем координаты в зависимости от ориентации
    if (boardFlipped) {
        // Для черных: ряды от 1 до 8, буквы от H до A
        for (let i = 0; i < 8; i++) {
            rowLabels[i].textContent = (i + 1);
            colLabels[i].textContent = String.fromCharCode(72 - i); // H, G, F, ..., A
        }
    } else {
        // Для белых: ряды от 8 до 1, буквы от A до H
        for (let i = 0; i < 8; i++) {
            rowLabels[i].textContent = (8 - i);
            colLabels[i].textContent = String.fromCharCode(65 + i); // A, B, C, ..., H
        }
    }
}

function updateMaterialBalance() {
    if (!enableMaterial) return;
    let whiteMat = 0, blackMat = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]) {
                if (board[r][c].color === 'white') whiteMat += pieceValues[board[r][c].type];
                else blackMat += pieceValues[board[r][c].type];
            }
        }
    }
    const diff = whiteMat - blackMat;
    const balanceDiv = document.getElementById('material-balance');
    if (balanceDiv) {
        if (diff > 0) balanceDiv.innerHTML = `⚪ +${diff}`;
        else if (diff < 0) balanceDiv.innerHTML = `⚫ +${Math.abs(diff)}`;
        else balanceDiv.innerHTML = `⚖️ 0`;
    }
    if (document.getElementById('white-material')) {
        document.getElementById('white-material').textContent = whiteMat;
        document.getElementById('black-material').textContent = blackMat;
    }
}

function updateMovesPanel() {
    const movesPanel = document.getElementById('current-moves');
    if (!movesPanel) return;
    
    let html = '';
    for (let i = 0; i < gameMoves.length; i += 2) {
        const moveNum = (i / 2) + 1;
        html += `<span class="move-number">${moveNum}.</span>`;
        html += `<span class="move-item">${gameMoves[i]}</span>`;
        if (gameMoves[i + 1]) html += `<span class="move-item">${gameMoves[i + 1]}</span>`;
    }
    movesPanel.innerHTML = html || 'Ходы будут отображаться здесь...';
}

function handleSquareClick(row, col) {
    if (!gameActive || isComputerThinking) return;
    
    // В режиме с компьютером - не позволять ходить когда не твой ход
    if (gameMode === 'pvc' && currentPlayer !== playerColor) return;
    
    if (selectedSquare) {
        if (possibleMoves.some(move => move.row === row && move.col === col)) {
            makeMove(selectedSquare, { row, col });
        } else {
            selectSquare(row, col);
        }
    } else {
        selectSquare(row, col);
    }
}

function selectSquare(row, col) {
    // В режиме с компьютером - не позволять выбирать фигуры не своего цвета
    if (gameMode === 'pvc' && currentPlayer !== playerColor) return;
    
    const piece = board[row][col];
    if (piece && piece.color === currentPlayer) {
        selectedSquare = { row, col };
        possibleMoves = getPossibleMoves(row, col);
        renderBoard();
    } else {
        selectedSquare = null;
        possibleMoves = [];
        renderBoard();
    }
}

function getPossibleMoves(row, col) {
    const piece = board[row][col];
    let moves = [];
    switch (piece.type) {
        case 'pawn': moves = getPawnMoves(row, col, piece.color); break;
        case 'rook': moves = getRookMoves(row, col, piece.color); break;
        case 'bishop': moves = getBishopMoves(row, col, piece.color); break;
        case 'queen': moves = getQueenMoves(row, col, piece.color); break;
        case 'knight': moves = getKnightMoves(row, col, piece.color); break;
        case 'king': moves = getKingMoves(row, col, piece.color); break;
    }
    moves = moves.filter(move => !wouldBeInCheck(row, col, move.row, move.col, piece.color));
    return moves;
}

function getPawnMoves(row, col, color) {
    const moves = [];
    const direction = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    if (!board[row + direction][col]) {
        moves.push({ row: row + direction, col });
        if (row === startRow && !board[row + 2 * direction][col]) {
            moves.push({ row: row + 2 * direction, col });
        }
    }
    if (col > 0 && board[row + direction][col - 1] && board[row + direction][col - 1].color !== color) {
        moves.push({ row: row + direction, col: col - 1 });
    }
    if (col < 7 && board[row + direction][col + 1] && board[row + direction][col + 1].color !== color) {
        moves.push({ row: row + direction, col: col + 1 });
    }
    if (enPassantTarget && enPassantTarget.row === row + direction && Math.abs(enPassantTarget.col - col) === 1) {
        moves.push({ row: row + direction, col: enPassantTarget.col });
    }
    return moves;
}

function getRookMoves(row, col, color) {
    const moves = [];
    const directions = [[0,1], [0,-1], [1,0], [-1,0]];
    for (const [dr, dc] of directions) {
        for (let i = 1; i < 8; i++) {
            const r = row + dr * i, c = col + dc * i;
            if (r < 0 || r > 7 || c < 0 || c > 7) break;
            if (board[r][c]) {
                if (board[r][c].color !== color) moves.push({ row: r, col: c });
                break;
            }
            moves.push({ row: r, col: c });
        }
    }
    return moves;
}

function getBishopMoves(row, col, color) {
    const moves = [];
    const directions = [[1,1], [1,-1], [-1,1], [-1,-1]];
    for (const [dr, dc] of directions) {
        for (let i = 1; i < 8; i++) {
            const r = row + dr * i, c = col + dc * i;
            if (r < 0 || r > 7 || c < 0 || c > 7) break;
            if (board[r][c]) {
                if (board[r][c].color !== color) moves.push({ row: r, col: c });
                break;
            }
            moves.push({ row: r, col: c });
        }
    }
    return moves;
}

function getQueenMoves(row, col, color) {
    return getRookMoves(row, col, color).concat(getBishopMoves(row, col, color));
}

function getKnightMoves(row, col, color) {
    const moves = [];
    const knightMoves = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
    for (const [dr, dc] of knightMoves) {
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < 8 && c >= 0 && c < 8 && (!board[r][c] || board[r][c].color !== color)) {
            moves.push({ row: r, col: c });
        }
    }
    return moves;
}

function getKingMoves(row, col, color) {
    const moves = [];
    const kingMoves = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
    for (const [dr, dc] of kingMoves) {
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < 8 && c >= 0 && c < 8 && (!board[r][c] || board[r][c].color !== color)) {
            moves.push({ row: r, col: c });
        }
    }
    if (color === 'white' && row === 7 && col === 4) {
        if (castlingRights.white.kingSide && !board[7][5] && !board[7][6] && !isSquareAttacked(7,4,color) && !isSquareAttacked(7,5,color) && !isSquareAttacked(7,6,color)) {
            moves.push({ row: 7, col: 6 });
        }
        if (castlingRights.white.queenSide && !board[7][1] && !board[7][2] && !board[7][3] && !isSquareAttacked(7,4,color) && !isSquareAttacked(7,3,color) && !isSquareAttacked(7,2,color)) {
            moves.push({ row: 7, col: 2 });
        }
    } else if (color === 'black' && row === 0 && col === 4) {
        if (castlingRights.black.kingSide && !board[0][5] && !board[0][6] && !isSquareAttacked(0,4,color) && !isSquareAttacked(0,5,color) && !isSquareAttacked(0,6,color)) {
            moves.push({ row: 0, col: 6 });
        }
        if (castlingRights.black.queenSide && !board[0][1] && !board[0][2] && !board[0][3] && !isSquareAttacked(0,4,color) && !isSquareAttacked(0,3,color) && !isSquareAttacked(0,2,color)) {
            moves.push({ row: 0, col: 2 });
        }
    }
    return moves;
}

function isSquareAttacked(row, col, color) {
    const opponent = color === 'white' ? 'black' : 'white';
        if (!board || board.length < 8) return false;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === opponent && canAttack(r, c, row, col, piece)) return true;
        }
    }
    return false;
}

function wouldBeInCheck(fromRow, fromCol, toRow, toCol, color) {
    const tempBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
    tempBoard[toRow][toCol] = tempBoard[fromRow][fromCol];
    tempBoard[fromRow][fromCol] = null;
    let kingRow, kingCol;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (tempBoard[r][c] && tempBoard[r][c].type === 'king' && tempBoard[r][c].color === color) {
                kingRow = r;
                kingCol = c;
            }
        }
    }
    const opponent = color === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = tempBoard[r][c];
            if (piece && piece.color === opponent && canAttackWithBoard(r, c, kingRow, kingCol, piece, tempBoard)) return true;
        }
    }
    return false;
}

function canAttack(fromRow, fromCol, toRow, toCol, piece) {
    const dr = toRow - fromRow, dc = toCol - fromCol;
    switch (piece.type) {
        case 'pawn': return Math.abs(dc) === 1 && dr === (piece.color === 'white' ? -1 : 1);
        case 'rook': return (dr === 0 || dc === 0) && isPathClear(fromRow, fromCol, toRow, toCol);
        case 'bishop': return Math.abs(dr) === Math.abs(dc) && isPathClear(fromRow, fromCol, toRow, toCol);
        case 'queen': return ((dr === 0 || dc === 0) || Math.abs(dr) === Math.abs(dc)) && isPathClear(fromRow, fromCol, toRow, toCol);
        case 'knight': return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
        case 'king': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
    }
    return false;
}

function canAttackWithBoard(fromRow, fromCol, toRow, toCol, piece, tempBoard) {
    const dr = toRow - fromRow, dc = toCol - fromCol;
    switch (piece.type) {
        case 'pawn': return Math.abs(dc) === 1 && dr === (piece.color === 'white' ? -1 : 1);
        case 'rook': return (dr === 0 || dc === 0) && isPathClearWithBoard(fromRow, fromCol, toRow, toCol, tempBoard);
        case 'bishop': return Math.abs(dr) === Math.abs(dc) && isPathClearWithBoard(fromRow, fromCol, toRow, toCol, tempBoard);
        case 'queen': return ((dr === 0 || dc === 0) || Math.abs(dr) === Math.abs(dc)) && isPathClearWithBoard(fromRow, fromCol, toRow, toCol, tempBoard);
        case 'knight': return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
        case 'king': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
    }
    return false;
}

function isPathClear(fromRow, fromCol, toRow, toCol) {
    const dr = toRow > fromRow ? 1 : toRow < fromRow ? -1 : 0;
    const dc = toCol > fromCol ? 1 : toCol < fromCol ? -1 : 0;
    let r = fromRow + dr, c = fromCol + dc;
    while (r !== toRow || c !== toCol) {
        if (board[r][c]) return false;
        r += dr;
        c += dc;
    }
    return true;
}

function isPathClearWithBoard(fromRow, fromCol, toRow, toCol, tempBoard) {
    const dr = toRow > fromRow ? 1 : toRow < fromRow ? -1 : 0;
    const dc = toCol > fromCol ? 1 : toCol < fromCol ? -1 : 0;
    let r = fromRow + dr, c = fromCol + dc;
    while (r !== toRow || c !== toCol) {
        if (tempBoard[r][c]) return false;
        r += dr;
        c += dc;
    }
    return true;
}

function makeMove(from, to) {
    const piece = board[from.row][from.col];
    const captured = board[to.row][to.col];
    
    if (piece.type === 'king' && Math.abs(to.col - from.col) === 2) {
        if (to.col === 6) {
            board[to.row][5] = board[to.row][7];
            board[to.row][7] = null;
        } else if (to.col === 2) {
            board[to.row][3] = board[to.row][0];
            board[to.row][0] = null;
        }
        castlingRights[piece.color].kingSide = false;
        castlingRights[piece.color].queenSide = false;
    }
    
    if (piece.type === 'pawn' && enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col) {
        board[from.row][to.col] = null;
    }
    
    if (piece.type === 'pawn' && (to.row === 0 || to.row === 7)) {
        piece.type = 'queen';
    }
    
    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;
    
    enPassantTarget = null;
    if (piece.type === 'pawn' && Math.abs(to.row - from.row) === 2) {
        enPassantTarget = { row: (from.row + to.row) / 2, col: to.col };
    }
    
    if (piece.type === 'king') {
        castlingRights[piece.color].kingSide = false;
        castlingRights[piece.color].queenSide = false;
    }
    if (piece.type === 'rook') {
        if (from.col === 0) castlingRights[piece.color].queenSide = false;
        if (from.col === 7) castlingRights[piece.color].kingSide = false;
    }
    
    moveHistory.push({ from, to, piece, captured });
    gameMoves.push(`${piece.type.charAt(0)}${String.fromCharCode(97 + from.col)}${8 - from.row}-${String.fromCharCode(97 + to.col)}${8 - to.row}`);
    
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
    selectedSquare = null;
    possibleMoves = [];
    
    playSound(captured ? 'capture' : 'move');
    updateStatus();
    updateMaterialBalance();
    updateMovesPanel();
    renderBoard();
    
    // Если играем против компьютера, делать его ход
    if (gameMode === 'pvc' && gameActive) {
        setTimeout(makeComputerMove, 500);
    }
}

function updateStatus() {
    const getGameStage = () => {
        const moveCount = gameMoves.length;
        if (moveCount < 20) return '📖 Дебют';
        if (moveCount < 40) return '⚔️ Миддльгейм';
        return '🎯 Эндшпиль';
    };
    
    const stageEmoji = getGameStage();
    
    if (isCheckmate()) {
        statusElement.textContent = `🏆 Мат! ${currentPlayer === 'white' ? 'Чёрные' : 'Белые'} выигрывают!`;
        gameActive = false;
        clearInterval(timerInterval);
        playSound('check');
        saveGame(currentPlayer === 'white' ? 'loss' : 'win');
    } else if (isStalemate()) {
        statusElement.textContent = '🤝 Пат! Ничья!';
        gameActive = false;
        clearInterval(timerInterval);
        saveGame('draw');
    } else if (isInCheck(currentPlayer)) {
        statusElement.textContent = `⚠️ Шах! ${stageEmoji} Ход ${currentPlayer === 'white' ? '⚪' : '⚫'}`;
        playSound('check');
    } else {
        statusElement.textContent = `${stageEmoji} Ход ${currentPlayer === 'white' ? '⚪' : '⚫'} (${gameMoves.length})`;
    }
}

function isInCheck(color) {
    let kingRow, kingCol;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].type === 'king' && board[r][c].color === color) {
                kingRow = r;
                kingCol = c;
            }
        }
    }
    return isSquareAttacked(kingRow, kingCol, color);
}

function isCheckmate() {
    if (!isInCheck(currentPlayer)) return false;
    return !hasLegalMoves();
}

function isStalemate() {
    if (isInCheck(currentPlayer)) return false;
    return !hasLegalMoves();
}

function hasLegalMoves() {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === currentPlayer) {
                if (getPossibleMoves(r, c).length > 0) return true;
            }
        }
    }
    return false;
}

function undoMove() {
    if (moveHistory.length > 0) {
        const last = moveHistory.pop();
        gameMoves.pop();
        board[last.from.row][last.from.col] = last.piece;
        board[last.to.row][last.to.col] = last.captured;
        currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
        updateStatus();
        updateMaterialBalance();
        updateMovesPanel();
        renderBoard();
    }
}

function resignGame() {
    if (!gameActive) return;
    const loser = currentPlayer;
    const winner = loser === 'white' ? 'black' : 'white';
    statusElement.textContent = `🏳️ ${loser === 'white' ? 'Белые' : 'Чёрные'} сдались. ${winner === 'white' ? 'Белые ⚪' : 'Чёрные ⚫'} выигрывают!`;
    gameActive = false;
    clearInterval(timerInterval);
    const resultType = loser === playerColor ? 'loss' : (winner === playerColor ? 'win' : 'draw');
    saveGame(resultType);
    saveGameResult(resultType === 'loss' ? 'Поражение' : resultType === 'win' ? 'Победа' : 'Ничья');
}

function agreeToDrawGame() {
    if (!gameActive) return;
    statusElement.textContent = `🤝 Ничья по согласию. Партия завершена.`;
    gameActive = false;
    clearInterval(timerInterval);
    saveGame('draw');
}

function stopGame() {
    if (!gameActive) return;
    statusElement.textContent = `🛑 Игра остановлена.`;
    gameActive = false;
    clearInterval(timerInterval);
}

function setTime(seconds) {
    selectedTime = seconds;
    whiteTime = seconds;
    blackTime = seconds;
    updateTimer();
}

function setPlayerColor(color) {
    playerColor = color;
    currentPlayer = 'white'; // Белые всегда начинают первыми
    
    // Перевернуть доску если играем черными
    boardFlipped = (color === 'black');
    localStorage.setItem('playerColor', color);
    
    // Обновить координаты даже если игра не активна
    updateBoardCoordinates();
    
    if (gameActive) {
        renderBoard();
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (!gameActive) return;
    timerInterval = setInterval(() => {
        if (currentPlayer === 'white') {
            whiteTime--;
        } else {
            blackTime--;
        }
        updateTimer();
        if (whiteTime <= 0 || blackTime <= 0) {
            clearInterval(timerInterval);
            const winner = whiteTime <= 0 ? 'black' : 'white';
            statusElement.textContent = `⏰ Время вышло! ${winner === 'white' ? 'Белые ⚪' : 'Чёрные ⚫'} выигрывают!`;
            gameActive = false;
            saveGame(winner === playerColor ? 'win' : 'loss');
        }
    }, 1000);
}

function updateTimer() {
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };
    if (document.getElementById('white-time-big')) {
        document.getElementById('white-time-big').textContent = formatTime(whiteTime);
        document.getElementById('black-time-big').textContent = formatTime(blackTime);
    }
}

async function resetGame() {
    // Расход энергии при игре против бота
    if (gameMode === 'pvc') {
        const userData = JSON.parse(localStorage.getItem('userData'));
        if (!userData) {
            showNotification('Вы не авторизованы для игры против бота', 'error');
            return;
        }
        
        try {
            const response = await fetch('/use-energy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: userData.username })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                if (response.status === 400 && result.error === 'Not enough energy.') {
                    showNotification('Недостаточно энергии! Энергия восстанавливается каждые 30 минут.', 'error');
                    return;
                } else {
                    showNotification(result.error || 'Ошибка расхода энергии', 'error');
                    return;
                }
            }
            
            // Обновить энергию в UI
            userData.energy = result.energy;
            localStorage.setItem('userData', JSON.stringify(userData));
            updateUI();
            
        } catch (error) {
            console.error('Use energy error:', error);
            showNotification('Ошибка подключения к серверу', 'error');
            return;
        }
    }
    
    clearInterval(timerInterval);
    initBoard();
    currentPlayer = 'white'; // Белые ВСЕГДА начинают первыми
    selectedSquare = null;
    possibleMoves = [];
    moveHistory = [];
    enPassantTarget = null;
    castlingRights = { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } };
    whiteTime = selectedTime;
    blackTime = selectedTime;
    gameMoves = [];
    gameActive = true;
    isComputerThinking = false;
    
    // Установить переворот доски если играем черными
    boardFlipped = (gameMode === 'pvc' && playerColor === 'black');
    
    updateStatus();
    updateTimer();
    renderBoard();
    startTimer();
    
    // Если компьютер играет за черных, он ходит после белых
    if (gameMode === 'pvc' && playerColor === 'black') {
        setTimeout(makeComputerMove, 1000);
    }
}

function saveGame(result) {
    const game = {
        date: new Date().toISOString(),
        moves: gameMoves.slice(),
        result: result,
        fen: boardToFEN(),
        pgn: movesToPGN(),
        duration: selectedTime - (currentPlayer === 'white' ? whiteTime : blackTime)
    };
    
    // Обновить Elo если это игра против компьютера
    if (gameMode === 'pvc') {
        updateEloAfterGame(result);
    }
    
    const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
    history.unshift(game);
    if (history.length > 100) history.pop();
    localStorage.setItem('chessHistory', JSON.stringify(history));
    
    // Сохранить Elo историю
    localStorage.setItem('eloHistory', JSON.stringify(eloHistory));
    localStorage.setItem('playerElo', playerElo);
    
    updateStatistics();
    updateLandingStats(); // Обновить статистику на landing странице после игры
}

async function saveGameResult(resultStatus) {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData) return;

    const gameData = {
        userId: userData.id,
        result: resultStatus,
        fen: boardToFEN(),
        moves: gameMoves.join(', ')
    };

    try {
        const response = await fetch('/api/save-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gameData)
        });
        if (response.ok) {
            console.log('Партия успешно записана в БД');
        }
    } catch (error) {
        console.error('Связь с сервером потеряна:', error);
    }
}

// Функция для обновления Elo рейтинга
function updateEloAfterGame(result) {
    // Получаем Elo противника на основе сложности
    const opponentEloMap = {
        1: 800,   // Новичок
        2: 900,
        3: 1000,
        4: 1100,
        5: 1300,  // Средний
        6: 1400,
        7: 1500,
        8: 1600,
        9: 1700,
        10: 1900, // Мастер
        11: 2000,
        12: 2100,
        13: 2200,
        14: 2300,
        15: 2400,
        16: 2500,
        17: 2600,
        18: 2700,
        19: 2800,
        20: 2900  // Гроссмейстер
    };
    
    const opponentElo = opponentEloMap[difficulty] || 1500;
    const K = 32; // Коэффициент для стандартной игры
    
    // Ожидаемый результат
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    
    let actualScore = 0;
    if (result === 'win') actualScore = 1;
    else if (result === 'draw') actualScore = 0.5;
    else actualScore = 0;
    
    // Новый рейтинг
    const eloChange = Math.round(K * (actualScore - expectedScore));
    playerElo = Math.max(100, playerElo + eloChange);
    eloGainedInLastGame = eloChange;
    
    // Сохранить историю
    const timestamp = new Date().toLocaleString('ru-RU');
    const difficultyText = ['🟢 Новичок', '🟡 Средний', '🔴 Мастер', '🔴 Гроссмейстер'][
        difficulty <= 2 ? 0 : difficulty <= 5 ? 1 : difficulty <= 10 ? 2 : 3
    ];
    
    eloHistory.push({
        date: timestamp,
        difficulty: difficultyText,
        result: result,
        change: eloChange,
        newElo: playerElo
    });
    
    // Оставить только последние 20 игр
    if (eloHistory.length > 20) eloHistory.shift();
    
    // Обновить отображение Elo
    updateEloDisplay();
}

function updateEloDisplay() {
    const eloRating = document.getElementById('elo-rating');
    const eloCategory = document.getElementById('elo-category');
    const eloSlider = document.getElementById('elo-slider');
    
    if (eloRating) {
        eloRating.textContent = playerElo;
        eloRating.style.animation = 'none';
        setTimeout(() => {
            eloRating.style.animation = 'pulse 0.6s ease-in-out';
        }, 10);
    }
    
    // Обновить категорию рейтинга
    if (eloCategory) {
        let category = 'Новичок';
        let emoji = '🟢';
        
        if (playerElo >= 1600 && playerElo < 1700) category = 'Средний уровень';
        else if (playerElo >= 1800 && playerElo < 1900) category = 'Хороший уровень';
        else if (playerElo >= 2000 && playerElo < 2100) category = 'Мастер';
        else if (playerElo >= 2200 && playerElo < 2300) category = 'Мастер-кандидат', emoji = '🔴';
        else if (playerElo >= 2400) category = 'Гроссмейстер', emoji = '🔴';
        else if (playerElo < 1600) category = 'Новичок', emoji = '🟢';
        
        if (playerElo >= 1500 && playerElo < 1600) emoji = '🟡';
        else if (playerElo >= 1700 && playerElo < 1800) emoji = '🟡';
        else if (playerElo >= 1900 && playerElo < 2000) emoji = '🟡';
        
        eloCategory.textContent = `${emoji} ${category} (${playerElo} Elo)`;
    }
    
    if (eloSlider) eloSlider.value = playerElo;
    
    // Обновить историю
    updateEloHistory();
}

function updateEloHistory() {
    const historyList = document.getElementById('elo-history-list');
    if (!historyList) return;
    
    if (eloHistory.length === 0) {
        historyList.innerHTML = '<div style="text-align: center; color: var(--secondary-text); padding: 20px;">Нет еще игр против компьютера</div>';
        return;
    }
    
    // Показать последние 10 игр
    const recentGames = eloHistory.slice(-10).reverse();
    
    historyList.innerHTML = recentGames.map((game, index) => {
        const resultEmoji = game.result === 'win' ? '🎉' : game.result === 'loss' ? '😔' : '🤝';
        const resultText = game.result === 'win' ? 'Победа' : game.result === 'loss' ? 'Поражение' : 'Ничья';
        const changeText = (game.change > 0 ? '+' : '') + game.change;
        
        return `
            <div class="elo-history-item ${game.result}">
                <div class="elo-history-date">${game.date}</div>
                <div class="elo-history-difficulty">${game.difficulty}</div>
                <div class="elo-history-result">${resultEmoji} ${resultText} <span style="color: var(--accent); margin-left: 8px;">${changeText}</span></div>
            </div>
        `;
    }).join('');
}

function getEloCategory(elo) {
    if (elo < 1200) return { name: 'Новичок', emoji: '🟢' };
    if (elo < 1400) return { name: 'Средний', emoji: '🟡' };
    if (elo < 1700) return { name: 'Хороший', emoji: '🟡' };
    if (elo < 2000) return { name: 'Мастер', emoji: '🔴' };
    if (elo < 2300) return { name: 'Мастер-кандидат', emoji: '🔴' };
    return { name: 'Гроссмейстер', emoji: '🔴' };
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
    const historyDiv = document.getElementById('game-history');
    const noHistoryDiv = document.getElementById('no-history');
    
    if (history.length === 0) {
        historyDiv.innerHTML = '';
        noHistoryDiv.style.display = 'block';
        return;
    }
    
    noHistoryDiv.style.display = 'none';
    historyDiv.innerHTML = '';
    
    history.forEach((game, index) => {
        const gameDiv = document.createElement('div');
        gameDiv.className = 'game-record';
        const resultClass = game.result === 'win' ? 'win' : (game.result === 'loss' ? 'loss' : 'draw');
        const resultText = game.result === 'win' ? '✅ Победа' : (game.result === 'loss' ? '❌ Поражение' : '🤝 Ничья');
        const movesList = game.moves.length > 0 ? game.moves.slice(0, 6).map(m => `<span class="move">${m}</span>`).join('') + (game.moves.length > 6 ? '...' : '') : 'Новая партия';
        
        gameDiv.innerHTML = `
            <div class="game-record-header">
                <span class="game-record-title">Партия ${index + 1}</span>
                <span class="game-record-date">${new Date(game.date).toLocaleString('ru-RU')}</span>
            </div>
            <div style="margin: 10px 0;">
                <span class="game-record-result ${resultClass}">${resultText}</span>
            </div>
            <div class="moves-list">${movesList}</div>
            <button onclick="loadGamePosition('${game.fen}')" style="margin-top: 8px; width: 100%;">Загрузить позицию</button>
        `;
        historyDiv.appendChild(gameDiv);
    });
}

function filterHistory() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const result = document.getElementById('filter-result').value;
    const records = document.querySelectorAll('.game-record');
    
    records.forEach(record => {
        const title = record.querySelector('.game-record-title').textContent.toLowerCase();
        const resultSpan = record.querySelector('.game-record-result').textContent;
        const matchesSearch = title.includes(search);
        const matchesResult = result === 'all' || 
            (result === 'win' && resultSpan.includes('Победа')) ||
            (result === 'loss' && resultSpan.includes('Поражение')) ||
            (result === 'draw' && resultSpan.includes('Ничья'));
        
        record.style.display = (matchesSearch && matchesResult) ? 'block' : 'none';
    });
}

function updateStatistics() {
    const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
    let wins = 0, losses = 0, draws = 0;
    history.forEach(game => {
        if (game.result === 'win') wins++;
        else if (game.result === 'loss') losses++;
        else if (game.result === 'draw') draws++;
    });
    
    if (document.getElementById('stat-total')) {
        document.getElementById('stat-total').textContent = history.length;
        document.getElementById('stat-wins').textContent = wins;
        document.getElementById('stat-losses').textContent = losses;
        document.getElementById('stat-draws').textContent = draws;
    }

    const premiumStats = document.getElementById('premium-stats');
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    if (premiumStats) {
        if (userData.is_premium) {
            premiumStats.style.display = 'grid';
            const winRate = history.length ? Math.round((wins / history.length) * 100) : 0;
            const bestStreak = history.reduce((acc, game) => {
                if (game.result === 'win') {
                    acc.current++;
                    acc.best = Math.max(acc.best, acc.current);
                } else {
                    acc.current = 0;
                }
                return acc;
            }, { current: 0, best: 0 }).best;
            const favoriteOpeningCount = {};
            history.forEach(game => {
                if (game.moves) {
                    const firstMove = game.moves.split(',')[0]?.trim();
                    if (firstMove) favoriteOpeningCount[firstMove] = (favoriteOpeningCount[firstMove] || 0) + 1;
                }
            });
            const favoriteOpening = Object.entries(favoriteOpeningCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Нет данных';
            document.getElementById('stat-winrate').textContent = winRate + '%';
            document.getElementById('stat-streak').textContent = bestStreak;
            document.getElementById('stat-opening').textContent = favoriteOpening;
        } else {
            premiumStats.style.display = 'none';
        }
    }
}

function boardToFEN() {
    let fen = '';
    for (let row = 0; row < 8; row++) {
        let emptyCount = 0;
        for (let col = 0; col < 8; col++) {
            if (board[row][col]) {
                if (emptyCount) fen += emptyCount;
                emptyCount = 0;
                const piece = board[row][col];
                const char = piece.type.charAt(0);
                fen += piece.color === 'white' ? char.toUpperCase() : char;
            } else {
                emptyCount++;
            }
        }
        if (emptyCount) fen += emptyCount;
        if (row < 7) fen += '/';
    }
    fen += ' ' + currentPlayer.charAt(0);
    return fen;
}

function movesToPGN() {
    let pgn = '';
    for (let i = 0; i < gameMoves.length; i += 2) {
        pgn += `${(i / 2) + 1}.${gameMoves[i]}`;
        if (gameMoves[i + 1]) pgn += ` ${gameMoves[i + 1]}`;
        pgn += ' ';
    }
    return pgn;
}

function copyFEN() {
    const fen = boardToFEN();
    navigator.clipboard.writeText(fen);
    alert('FEN скопирована в буфер обмена:\n' + fen);
}

function loadFromFEN() {
    const fen = document.getElementById('fen-input').value;
    if (!fen) return;
    // Простой парсер FEN (упрощённая версия)
    alert('Загрузка FEN-позиции пока не реализована. Используйте скопированные FEN.');
}

function loadGamePosition(fen) {
    document.getElementById('fen-input').value = fen;
    alert('Позиция загружена. Нажмите "Загрузить позицию" чтобы использовать её.');
}

function exportPGN() {
    const pgn = movesToPGN();
    const text = `[Event "Chess Master"]\n[Date "${new Date().toISOString().split('T')[0]}"]\n\n${pgn}`;
    downloadFile(text, 'game.pgn', 'text/plain');
}

function exportJSON() {
    const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
    downloadFile(JSON.stringify(history, null, 2), 'chess_history.json', 'application/json');
}

function downloadHistory() {
    const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
    downloadFile(JSON.stringify(history, null, 2), 'chess_history.json', 'application/json');
}

function uploadHistory() {
    const file = document.getElementById('history-file').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
            localStorage.setItem('chessHistory', JSON.stringify([...data, ...history]));
            loadHistory();
            alert('История загружена успешно!');
        } catch (err) {
            alert('Ошибка при загрузке файла');
        }
    };
    reader.readAsText(file);
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function shareGame() {
    const pgn = movesToPGN();
    const fen = boardToFEN();
    const text = `Моя партия в шахматы:\n\nФГ: ${fen}\n\nХоды: ${pgn}`;
    if (navigator.share) {
        navigator.share({ title: 'Chess Master', text: text });
    } else {
        alert('Ваша позиция:\n' + text);
    }
}

function toggleAnimations() {
    enableAnimations = !enableAnimations;
    localStorage.setItem('enableAnimations', enableAnimations);
    alert(enableAnimations ? 'Анимация включена' : 'Анимация отключена');
}

function changeboardStyle() {
    const style = document.getElementById('board-style').value;
    currentBoardStyle = style;
    
    // Удалить все классы стиля доски
    boardElement.classList.remove('board-style-blue', 'board-style-green', 'board-style-wood');
    
    // Добавить новый класс стиля если не default
    if (style !== 'default') {
        boardElement.classList.add(`board-style-${style}`);
    }
    
    localStorage.setItem('boardStyle', style);
}

function changeBoardSize() {
    const size = document.getElementById('board-size').value;
    currentBoardSize = size;
    const sizeClass = size === 'small' ? 'board-size-small' : (size === 'large' ? 'board-size-large' : 'board-size-medium');
    
    const boardGridWrapper = document.querySelector('.board-grid-wrapper');
    if (boardGridWrapper) {
        boardGridWrapper.className = `board-grid-wrapper ${sizeClass}`;
    }
    
    localStorage.setItem('boardSize', size);
    
    // Обновить быстрые кнопки
    const sizeButtons = document.querySelectorAll('.size-btn');
    sizeButtons.forEach(btn => btn.classList.remove('active'));
    if (size === 'small') sizeButtons[0].classList.add('active');
    else if (size === 'large') sizeButtons[2].classList.add('active');
    else sizeButtons[1].classList.add('active');
}

function updateElo() {
    playerElo = parseInt(document.getElementById('elo-slider').value);
    document.getElementById('elo-rating').textContent = playerElo;
    localStorage.setItem('playerElo', playerElo);
}

function exportSettings() {
    const settings = {
        enableAnimations,
        enableSounds,
        enableCoordinates,
        enableMaterial,
        currentBoardStyle,
        currentBoardSize,
        currentPieceSet,
        blindBoardActive,
        playerElo,
        selectedTime,
        themeToggle: themeToggle.checked
    };
    downloadFile(JSON.stringify(settings, null, 2), 'chess_settings.json', 'application/json');
}

function importSettings() {
    const file = document.getElementById('import-file').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const settings = JSON.parse(e.target.result);
            Object.assign({ enableAnimations, enableSounds, enableCoordinates, enableMaterial, currentBoardStyle, currentBoardSize, currentPieceSet, blindBoardActive, playerElo }, settings);
            localStorage.setItem('enableAnimations', enableAnimations);
            localStorage.setItem('enableSounds', enableSounds);
            localStorage.setItem('enableCoordinates', enableCoordinates);
            localStorage.setItem('enableMaterial', enableMaterial);
            localStorage.setItem('boardStyle', currentBoardStyle);
            localStorage.setItem('boardSize', currentBoardSize);
            localStorage.setItem('pieceSet', currentPieceSet);
            localStorage.setItem('blindBoardActive', blindBoardActive);
            localStorage.setItem('playerElo', playerElo);
            alert('Настройки загружены!');
            location.reload();
        } catch (err) {
            alert('Ошибка при загрузке настроек');
        }
    };
    reader.readAsText(file);
}

function clearHistory() {
    if (confirm('Вы уверены? Это действие необратимо.')) {
        localStorage.removeItem('chessHistory');
        loadHistory();
        alert('История очищена');
    }
}

function showTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    const targetTab = document.getElementById(tabId);
    
    // Если таб не найден, выходим, чтобы не плодить ошибки в консоли
    if (!targetTab) {
        console.warn(`Tab with id "${tabId}" not found.`);
        return;
    }

    // Скрываем все табы
    tabs.forEach(tab => tab.classList.remove('active'));
    // Показываем нужный
    targetTab.classList.add('active');

    if (tabId === 'chat') {
        loadMessages();
    }
    
    localStorage.setItem('currentTab', tabId);
    
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => btn.classList.remove('active'));

    if (tabId !== 'landing') {
        const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    } else {
        if (typeof updateLandingStats === 'function') updateLandingStats();
    }
    
    // Логика загрузки данных в зависимости от таба
    if (tabId === 'history') {
        if (typeof loadHistory === 'function') loadHistory();
        if (typeof updateStatistics === 'function') updateStatistics();
    } else if (tabId === 'leaderboard') {
        if (typeof loadLeaderboard === 'function') loadLeaderboard();
    } else if (tabId === 'settings') {
        if (typeof updateEloDisplay === 'function') updateEloDisplay();
    } else if (tabId === 'analyze') {
        runPositionAnalysis(); // Вынес тяжелый код в отдельную функцию для чистоты
    }
}

// Вспомогательная функция для анализа (чтобы не забивать showTab)
function runPositionAnalysis() {
    const legalMovesCount = document.getElementById('legal-moves');
    if (!legalMovesCount) return;

    let count = 0;
    let whiteMat = 0, blackMat = 0;
    const pieceValues = { 'king': 0, 'queen': 9, 'rook': 5, 'bishop': 3, 'knight': 3, 'pawn': 1 };

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                if (piece.color === currentPlayer) {
                    count += getPossibleMoves(r, c).length;
                }
                if (piece.color === 'white') whiteMat += pieceValues[piece.type];
                else blackMat += pieceValues[piece.type];
            }
        }
    }

    legalMovesCount.textContent = count;
    const positionEval = document.getElementById('position-eval');
    if (positionEval) {
        const eval_ = (whiteMat - blackMat) * 0.1;
        positionEval.textContent = eval_ > 0 ? `+${eval_.toFixed(1)}` : `${eval_.toFixed(1)}`;
    }

    const gameStats = document.getElementById('game-stats');
    if (gameStats) {
        const moves = typeof gameMoves !== 'undefined' ? gameMoves.length : 0;
        const stage = moves < 20 ? 'Дебют' : (moves < 40 ? 'Миддльгейм' : 'Эндшпиль');
        gameStats.innerHTML = `
            <p>📊 Ходов сделано: <strong>${moves}</strong></p>
            <p>🎯 Ход: <strong>${currentPlayer === 'white' ? '⚪ Белые' : '⚫ Чёрные'}</strong></p>
            <p>⚠️ Шах: <strong>${isInCheck(currentPlayer) ? '✓ ДА' : '✗ Нет'}</strong></p>
            <p>📈 Стадия: <strong>${stage}</strong></p>
            <p>⚖️ Материал: <strong>${(whiteMat - blackMat) > 0 ? '+' : ''}${whiteMat - blackMat}</strong></p>
        `;
    }
}
// Инициализация при загрузке страницы
themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
        document.body.classList.remove('light-theme');
        localStorage.setItem('chessTheme', 'dark');
    } else {
        document.body.classList.add('light-theme');
        localStorage.setItem('chessTheme', 'light');
    }
});

// Загрузить сохранённые настройки
if (localStorage.getItem('chessTheme') === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.checked = false;
}

if (localStorage.getItem('enableSounds') === 'false') enableSounds = false;
else document.getElementById('sound-toggle').checked = enableSounds;

if (localStorage.getItem('enablePremiumSounds') === 'true') enablePremiumSounds = true;
else enablePremiumSounds = false;

if (localStorage.getItem('enableAnimations') === 'false') enableAnimations = false;
else document.getElementById('animation-toggle').checked = enableAnimations;

if (localStorage.getItem('enableCoordinates') === 'false') enableCoordinates = false;
else document.getElementById('coordinates-toggle').checked = enableCoordinates;

if (localStorage.getItem('enableMaterial') === 'false') enableMaterial = false;
else document.getElementById('material-toggle').checked = enableMaterial;

if (localStorage.getItem('playerElo')) playerElo = parseInt(localStorage.getItem('playerElo'));
if (localStorage.getItem('eloHistory')) eloHistory = JSON.parse(localStorage.getItem('eloHistory'));
document.getElementById('elo-slider').value = playerElo;
document.getElementById('elo-rating').textContent = playerElo;

if (localStorage.getItem('boardSize')) currentBoardSize = localStorage.getItem('boardSize');
document.getElementById('board-size').value = currentBoardSize;

// Восстановить цвет игрока и переворот доски
if (localStorage.getItem('playerColor')) {
    playerColor = localStorage.getItem('playerColor');
    boardFlipped = (playerColor === 'black');
}

// Установить активную кнопку размера при загрузке
window.addEventListener('DOMContentLoaded', () => {
    // Проверить авторизацию пользователя
    checkAuth();
    
    const sizeButtons = document.querySelectorAll('.size-btn');
    sizeButtons.forEach(btn => btn.classList.remove('active'));
    
    if (currentBoardSize === 'small') sizeButtons[0].classList.add('active');
    else if (currentBoardSize === 'large') sizeButtons[2].classList.add('active');
    else sizeButtons[1].classList.add('active'); // medium по умолчанию
    
    // Применить размер при загрузке
    const sizeClass = currentBoardSize === 'small' ? 'board-size-small' : (currentBoardSize === 'large' ? 'board-size-large' : 'board-size-medium');
    const boardGridWrapper = document.querySelector('.board-grid-wrapper');
    if (boardGridWrapper) {
        boardGridWrapper.className = `board-grid-wrapper ${sizeClass}`;
    }
    
    // Обновить координаты при загрузке
    updateBoardCoordinates();
});

if (localStorage.getItem('boardStyle')) currentBoardStyle = localStorage.getItem('boardStyle');
document.getElementById('board-style').value = currentBoardStyle;

if (localStorage.getItem('pieceSet')) currentPieceSet = localStorage.getItem('pieceSet');
if (localStorage.getItem('blindBoardActive') === 'true') blindBoardActive = true;

document.addEventListener('DOMContentLoaded', () => {
    updatePieceSetButtons();
    boardElement.classList.toggle('blindboard-mode', blindBoardActive);

    const pieceSetSelect = document.getElementById('piece-set-select');
    if (pieceSetSelect) pieceSetSelect.value = currentPieceSet;
    const premiumSoundToggle = document.getElementById('premium-sound-toggle');
    if (premiumSoundToggle) premiumSoundToggle.checked = enablePremiumSounds;
    loadMessages();
});

if (localStorage.getItem('difficulty')) {
    difficulty = parseInt(localStorage.getItem('difficulty'));
}

if (localStorage.getItem('playerColor')) {
    playerColor = localStorage.getItem('playerColor');
}

// Установить обработчики для настроек
document.getElementById('sound-toggle').addEventListener('change', (e) => {
    enableSounds = e.target.checked;
    localStorage.setItem('enableSounds', enableSounds);
});

document.getElementById('animation-toggle').addEventListener('change', (e) => {
    enableAnimations = e.target.checked;
    localStorage.setItem('enableAnimations', enableAnimations);
});

document.getElementById('coordinates-toggle').addEventListener('change', (e) => {
    enableCoordinates = e.target.checked;
    localStorage.setItem('enableCoordinates', enableCoordinates);
});

document.getElementById('material-toggle').addEventListener('change', (e) => {
    enableMaterial = e.target.checked;
    localStorage.setItem('enableMaterial', enableMaterial);
    updateMaterialBalance();
});

document.getElementById('premium-sound-toggle').addEventListener('change', (e) => {
    enablePremiumSounds = e.target.checked;
    localStorage.setItem('enablePremiumSounds', enablePremiumSounds);
});

// Инициализация при загрузке
console.log('🎮 Инициализация Chess Master...');

// Обновить кнопки сложности ИИ
function updateDifficultyButtons() {
    const diffButtons = document.getElementById('difficulty-buttons');
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const isPremium = !!userData.is_premium;
    if (diffButtons) {
        diffButtons.querySelectorAll('button').forEach(btn => {
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.style.boxShadow = '';
            if (btn.textContent.includes('Гроссмейстер')) {
                btn.disabled = !isPremium;
                btn.title = isPremium ? 'VIP уровень' : 'Требуется премиум';
                btn.style.opacity = isPremium ? '1' : '0.5';
                btn.style.cursor = isPremium ? 'pointer' : 'not-allowed';
            }
        });
        
        // Определяем какая кнопка должна быть активной
        let activeButtonText = '';
        if (difficulty <= 2) activeButtonText = 'Новичок';
        else if (difficulty <= 5) activeButtonText = 'Средний';
        else if (difficulty <= 10) activeButtonText = 'Мастер';
        else activeButtonText = 'Гроссмейстер';
        
        const button = Array.from(diffButtons.querySelectorAll('button')).find(btn => 
            btn.textContent.includes(activeButtonText)
        );
        if (button) {
            button.style.backgroundColor = 'var(--accent)';
            button.style.color = 'white';
            button.style.borderColor = 'var(--accent)';
            button.style.boxShadow = '0 0 12px rgba(30, 144, 255, 0.4)';
        }
    }
}

function updateOpponentInfo() {
    const opponentInfo = document.getElementById('opponent-info');
    const opponentSkill = document.getElementById('opponent-skill');
    const opponentRating = document.getElementById('opponent-rating');
    const opponentStars = document.getElementById('opponent-stars');
    
    if (!opponentInfo || !opponentSkill || !opponentRating || !opponentStars) return;
    
    const opponentEloMap = {
        1: { skill: '🟢 Новичок', elo: 800, stars: '★☆☆☆☆' },
        2: { skill: '🟢 Новичок+', elo: 900, stars: '★★☆☆☆' },
        3: { skill: '🟡 Начинающий', elo: 1000, stars: '★★☆☆☆' },
        4: { skill: '🟡 Любитель', elo: 1100, stars: '★★☆☆☆' },
        5: { skill: '🟡 Средний', elo: 1300, stars: '★★★☆☆' },
        6: { skill: '🟡 Средний+', elo: 1400, stars: '★★★☆☆' },
        7: { skill: '🟡 Хороший', elo: 1500, stars: '★★★☆☆' },
        8: { skill: '🟡 Хороший+', elo: 1600, stars: '★★★☆☆' },
        9: { skill: '🟡 Тренер', elo: 1700, stars: '★★★★☆' },
        10: { skill: '🔴 Мастер', elo: 1900, stars: '★★★★☆' },
        11: { skill: '🔴 Мастер+', elo: 2000, stars: '★★★★☆' },
        12: { skill: '🔴 Кандидат', elo: 2100, stars: '★★★★☆' },
        13: { skill: '🔴 Кандидат+', elo: 2200, stars: '★★★★★' },
        14: { skill: '🔴 FIDE М.', elo: 2300, stars: '★★★★★' },
        15: { skill: '🔴 FIDE М+', elo: 2400, stars: '★★★★★' },
        16: { skill: '🔴 Гм', elo: 2500, stars: '★★★★★' },
        17: { skill: '🔴 Гм+', elo: 2600, stars: '★★★★★' },
        18: { skill: '🔴 Гм++', elo: 2700, stars: '★★★★★' },
        19: { skill: '🔴 Элита', elo: 2800, stars: '★★★★★' },
        20: { skill: '🔴 Суперпк', elo: 2900, stars: '★★★★★' }
    };
    
    const opponent = opponentEloMap[difficulty] || opponentEloMap[10];
    opponentSkill.textContent = opponent.skill;
    opponentRating.textContent = opponent.elo + ' Elo';
    opponentStars.textContent = opponent.stars;
}

// Обновить при загрузке если есть нужный элемент
updateEloDisplay();
// resetGame() будет вызван при нажатии "Играть"

// Функция для начала игры с главной страницы
function startGameFromLanding() {
    resetGame();
    showTab('game');
}

// Функция для обновления статистики на landing странице
function updateLandingStats() {
    const gameHistory = JSON.parse(localStorage.getItem('gameHistory')) || [];
    
    const landingElo = document.getElementById('landing-elo');
    const landingGames = document.getElementById('landing-games');
    const landingWins = document.getElementById('landing-wins');
    const landingTip = document.getElementById('landing-tip');
    
    if (landingElo) landingElo.textContent = playerElo;
    if (landingGames) landingGames.textContent = gameHistory.length;
    
    let wins = 0;
    gameHistory.forEach(game => {
        if (game.result === 'win') wins++;
    });
    if (landingWins) landingWins.textContent = wins;
    
    // Генерируем совет на основе рейтинга
    if (landingTip) {
        let tip = '';
        if (playerElo < 1200) {
            const tips = [
                '🎯 Совет: Развивай фигуры в дебюте, не обращай на мат в конце доски!',
                '♔ Совет: Берегись за фигуры, каждая имеет значение!',
                '🎪 Совет: Не спеши! Хороший ход часто лучше быстрого хода.',
            ];
            tip = tips[Math.floor(Math.random() * tips.length)];
        } else if (playerElo < 1600) {
            const tips = [
                '🏰 Совет: Рокировка защитит твоего короля от атак!',
                '🎲 Совет: Комбинации часто начинаются с теплого жертвоприношения.',
                '📖 Совет: Изучи основные дебютные принципы!',
            ];
            tip = tips[Math.floor(Math.random() * tips.length)];
        } else if (playerElo < 2000) {
            const tips = [
                '🔥 Совет: Позиционное понимание часто важнее тактики!',
                '⚡ Совет: Создавай слабости в лагере противника.',
                '🎨 Совет: Глубокий расчёт - ключ к победе на этом уровне.',
            ];
            tip = tips[Math.floor(Math.random() * tips.length)];
        } else {
            const tips = [
                '👑 Совет: Ты мастер! Продолжай оттачивать своё мастерство.',
                '🌟 Совет: Даже гроссмейстеры студируют партии для улучшения.',
                '♞ Совет: Единственный путь вверх - это играть сильнее соперников!',
            ];
            tip = tips[Math.floor(Math.random() * tips.length)];
        }
        landingTip.textContent = tip;
    }
}

// Клик на заголовок для возврата на главную вкладку (Игра)
document.querySelector('h1').addEventListener('click', () => {
    showTab('game');
});

/* ============================================================
   ФУНКЦИИ ДЛЯ РЕГИСТРАЦИИ И АВТОРИЗАЦИИ
   ============================================================ */

function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Очистить форму при открытии
        document.getElementById('auth-form').reset();
        document.getElementById('auth-error').textContent = '';
        // Сбросить в режим регистрации
        isLoginMode = false;
        toggleAuthMode();
    }
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function handleAuth(event) {
    event.preventDefault();
    
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const errorDiv = document.getElementById('auth-error');
    
    // Валидация
    if (!username || !password) {
        errorDiv.textContent = '⚠️ Заполните все поля!';
        return;
    }
    
    if (username.length < 3) {
        errorDiv.textContent = '⚠️ Ник должен содержать минимум 3 символа';
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = '⚠️ Пароль должен содержать минимум 6 символов';
        return;
    }
    
    try {
        errorDiv.textContent = '⏳ Отправляем...';
        
        if (isLoginMode) {
            // Режим входа
            const success = await handleLogin(username, password);
            if (success) {
                document.getElementById('auth-form').reset();
                errorDiv.textContent = '';
            } else {
                errorDiv.textContent = '❌ Неверный логин или пароль';
                errorDiv.style.color = '#ff0055';
            }
        } else {
            // Режим регистрации
            const response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                // Ошибка с сервера
                if (response.status === 409) {
                    errorDiv.textContent = '❌ Этот ник уже занят. Попробуйте другой.';
                } else {
                    errorDiv.textContent = `❌ ${result.error || 'Ошибка регистрации'}`;
                }
                errorDiv.style.color = '#ff0055';
                return;
            }
            
            // Успешная регистрация - автоматически входим
            errorDiv.textContent = '';
            showSuccessMessage(`🎉 Добро пожаловать, ${username}!`, () => {
                closeAuthModal();
                document.getElementById('auth-form').reset();
            });
            
            // Автоматический вход после регистрации
            await handleLogin(username, password);
        }
        
    } catch (error) {
        console.error('Auth error:', error);
        errorDiv.textContent = '❌ Ошибка подключения к серверу. Проверьте, запущен ли Node.js сервер на порту 3000.';
        errorDiv.style.color = '#ff0055';
    }
}

function showSuccessMessage(message, callback) {
    const successDiv = document.createElement('div');
    successDiv.className = 'auth-success';
    successDiv.innerHTML = `
        <h3>✅ ${message}</h3>
        <p style="margin-top: 15px; color: #00ff00; font-size: 14px;">Окно закроется через 2 секунды...</p>
    `;
    
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            successDiv.remove();
            if (callback) callback();
        }, 300);
    }, 2000);
}

async function handleChangePassword(event) {
    event.preventDefault();
    
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    
    if (!oldPassword || !newPassword) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('Новый пароль должен содержать минимум 6 символов', 'error');
        return;
    }
    
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData) {
        showNotification('Вы не авторизованы', 'error');
        return;
    }
    
    try {
        const response = await fetch('/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: userData.username,
                oldPassword,
                newPassword
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Пароль успешно изменён', 'success');
            document.getElementById('change-password-form').reset();
        } else {
            showNotification(result.error || 'Ошибка изменения пароля', 'error');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showNotification('Ошибка подключения к серверу', 'error');
    }
}

// Закрытие модального окна по клику на фон
document.addEventListener('click', (e) => {
    const modal = document.getElementById('auth-modal');
    if (modal && e.target === modal) {
        closeAuthModal();
    }
});

// Закрытие по клавише Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('auth-modal');
        if (modal && modal.style.display === 'flex') {
            closeAuthModal();
        }
    }
});

// Дополнительная инициализация после полной загрузки окна
// ВАЖНО: Stockfish уже инициализирован в DOMContentLoaded!
window.addEventListener('load', () => {
    console.log('✅ [LOAD] Окно полностью загружено');
    
    // Обновляем UI-компоненты, которые могли загрузиться после script.js
    if (typeof updateDifficultyButtons === 'function') {
        updateDifficultyButtons();
    }
    
    if (typeof updateLandingStats === 'function') {
        updateLandingStats();
    }
    
    console.log('✅ Приложение полностью готово!');
});

// Функции аутентификации
let currentUser = null;
let isLoginMode = false; // false = регистрация, true = вход

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const modal = document.getElementById('auth-modal');
    const header = modal.querySelector('.auth-modal-header h2');
    const submitBtn = modal.querySelector('.auth-submit-btn');
    const footerLink = modal.querySelector('.auth-modal-footer a');
    
    if (isLoginMode) {
        header.textContent = '🔑 Вход';
        submitBtn.textContent = '🚀 Войти';
        footerLink.textContent = 'Регистрация';
    } else {
        header.textContent = '⚡ Регистрация';
        submitBtn.textContent = '🚀 Зарегистрироваться';
        footerLink.textContent = 'Войти';
    }
}

async function handleLogin(username, password) {
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            // Сервер возвращает данные напрямую: { id, username, elo, energy, last_energy_update, role, is_premium }
            currentUser = data;
            localStorage.setItem('userData', JSON.stringify(data));
            updateUI();
            closeAuthModal();
            
            // Создаем информативное уведомление с ролью и статусом
            let welcomeMsg = `✅ Добро пожаловать, ${data.username}!`;
            if (data.role === 'admin') {
                welcomeMsg += ' 👑 [Администратор]';
            }
            if (data.is_premium) {
                welcomeMsg += ' 💎 [Premium активен]';
            }
            showNotification(welcomeMsg, 'success');
            return true;
        } else {
            showNotification('❌ ' + (data.error || 'Ошибка входа'), 'error');
            return false;
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('❌ Ошибка сети', 'error');
        return false;
    }
}

/**
 * КРИТИЧЕСКАЯ ФУНКЦИЯ: updateUI() - ОСНОВНОЕ УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ
 * Вызывается: При загрузке, после логина, после оплаты, при F5
 * Гарантирует: Админка НИКОГДА не исчезает, премиум-интерфейс всегда в синхе
 */
function updateUI() {
    const buyBtn = document.getElementById('buy-premium-btn');
    const loginBtn = document.getElementById('login-button');
    const userDataStr = localStorage.getItem('userData');
    let currentUserForUI = null;
    if (userDataStr) {
        try {
            currentUserForUI = JSON.parse(userDataStr);
        } catch (err) {
            currentUserForUI = null;
        }
    }
    if (buyBtn) {
        if (!currentUserForUI || currentUserForUI.is_premium) {
            buyBtn.style.display = 'none';
        } else {
            buyBtn.style.display = 'block';
        }
    }
    // 🔥 ЖЕСТКАЯ ПРОВЕРКА localStorage
    const userProfile = document.getElementById('user-profile');
    const authButton = loginBtn;
    const headerRight = document.querySelector('.header-right');
    const vipBadge = document.getElementById('vip-badge');

    console.log("[updateUI] 🔄 Запуск обновления интерфейса | isAuth:", !!userDataStr);

    // ===== РЕЖИМ: НЕ АВТОРИЗОВАН =====
    if (!userDataStr) {
        console.log("[updateUI] 🔓 Пользователь НЕ авторизован");
        if (userProfile) userProfile.style.display = 'none';
        if (authButton) authButton.style.display = 'block';
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.remove();
        document.body.classList.remove('premium-theme');
        if (vipBadge) vipBadge.style.display = 'none';
        return;
    }

    // ===== РЕЖИМ: АВТОРИЗОВАН =====
    try {
        const user = JSON.parse(userDataStr);
        if (!user || !user.username) throw new Error('Invalid user data');
        
        console.log(`[updateUI] 🟢 Авторизован: ${user.username} | Role: ${user.role} | Premium: ${user.is_premium}`);
        
        // 1️⃣ ПОКАЗЫВАЕМ ПРОФИЛЬ
        if (userProfile) userProfile.style.display = 'flex';
        if (authButton) authButton.style.display = 'none';
        
        // 2️⃣ ЗАПОЛНЯЕМ ДАННЫЕ ПРОФИЛЯ
        const nameEl = document.getElementById('user-name');
        const eloEl = document.getElementById('user-elo');
        const energyEl = document.getElementById('user-energy');
        
        if (nameEl) nameEl.textContent = user.username || '-';
        if (eloEl) eloEl.textContent = user.elo || 800;

        // 3️⃣ ПРЕМИУМ-РЕЖИМ И ЭНЕРГИЯ
        if (user.is_premium) {
            console.log("[updateUI] 👑 АКТИВИРУЮ PREMIUM-РЕЖИМ");
            document.body.classList.add('premium-theme');
            if (energyEl) {
                energyEl.textContent = "∞";
                energyEl.style.color = "#ffd700";
                energyEl.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.8)';
                energyEl.style.fontWeight = 'bold';
            }
            if (vipBadge) {
                vipBadge.style.display = 'inline-block';
                vipBadge.style.color = '#ffd700';
                vipBadge.style.marginLeft = '8px';
                vipBadge.style.fontWeight = 'bold';
                vipBadge.style.textShadow = '0 0 12px rgba(255, 215, 0, 0.8)';
                vipBadge.style.fontSize = '1.1em';
            }
        } else {
            console.log("[updateUI] ⚪ Premium-режим отключен");
            document.body.classList.remove('premium-theme');
            if (energyEl) {
                energyEl.textContent = user.energy || 0;
                energyEl.style.color = "";
                energyEl.style.textShadow = '';
                energyEl.style.fontWeight = 'normal';
            }
            if (vipBadge) vipBadge.style.display = 'none';
        }

        // 4️⃣ АДМИНКА - ЖЕСТКАЯ ЛОГИКА (CRITICAL FIX)
        let adminBtn = document.getElementById('admin-btn');
        if (user.role === 'admin' && headerRight) {
            console.log("[updateUI] 🔧 Проверяю админ-кнопку...");
            if (!adminBtn) {
                console.log("[updateUI] ➕ СОЗДАЮ админ-кнопку");
                adminBtn = document.createElement('button');
                adminBtn.id = 'admin-btn';
                adminBtn.className = 'auth-button';
                adminBtn.style.background = '#ff8c00';
                adminBtn.style.marginRight = '10px';
                adminBtn.style.fontWeight = 'bold';
                adminBtn.style.fontSize = '0.95em';
                adminBtn.textContent = '⚙️ Админка';
                adminBtn.title = 'Панель администратора';
                adminBtn.onclick = () => {
                    console.log("[updateUI] Переход в админку");
                    window.location.href = 'admin.html';
                };
                headerRight.prepend(adminBtn);
                console.log("[updateUI] ✅ Админ-кнопка добавлена в DOM");
            } else {
                console.log("[updateUI] ✓ Админ-кнопка уже существует");
            }
        } else if (adminBtn) {
            console.log("[updateUI] ❌ УДАЛЯЮ админ-кнопку (не админ)");
            adminBtn.remove();
        }

        // 5️⃣ ПРЕМИУМ-ИНТЕРФЕЙС И ПРОЧИЕ КОМПОНЕНТЫ
        if (typeof checkPremiumSettings === 'function') {
            checkPremiumSettings();
        }
        if (typeof updateLandingStats === 'function') {
            updateLandingStats();
        }

        console.log("[updateUI] ✅ Обновление завершено успешно");

    } catch (error) {
        console.error('❌ [updateUI] КРИТИЧЕСКАЯ ОШИБКА:', error.message);
        localStorage.removeItem('userData');
        document.body.classList.remove('premium-theme');
        updateUI(); // Рекурсивный вызов для очистки
    }
}
/**
 * ЖЕСТКАЯ ПРОВЕРКА АВТОРИЗАЦИИ
 * Вызывается в DOMContentLoaded ПЕРЕД ЧЕМ-ЛИБО ДРУГИМ
 */
function checkAuth() {
    console.log("[checkAuth] 🔍 Жесткая проверка авторизации...");
    const userData = localStorage.getItem('userData');
    
    if (userData) {
        try {
            const user = JSON.parse(userData);
            if (!user.username) throw new Error('Invalid username');
            currentUser = user;
            console.log(`[checkAuth] ✅ ОК: Пользователь ${user.username} восстановлен из localStorage`);
            console.log(`[checkAuth] Role: ${user.role} | Premium: ${user.is_premium}`);
            updateUI(); // ГАРАНТИЯ: вызываем updateUI()
            return true;
        } catch (error) {
            console.error('[checkAuth] ❌ localStorage повреждена:', error.message);
            localStorage.removeItem('userData');
            updateUI(); // Чистим UI
            return false;
        }
    }
    console.log("[checkAuth] Пользователь НЕ авторизован (localStorage пуст)");
    updateUI();
    return false;
}

/**
 * ВЫХОД ИЗ СИСТЕМЫ - Очищает ВСЕ следы авторизации
 */
function logout() {
    console.log("[logout] 🚪 Выполняю выход...");
    currentUser = null;
    localStorage.removeItem('userData');
    document.body.classList.remove('premium-theme');
    updateUI(); // Гарантийное обновление UI
    showTab('landing');
    showNotification('👋 Выход выполнен', 'info');
    console.log("[logout] ✅ Выход завершен");
}

/**
 * ОБНОВЛЕНИЕ ПРОФИЛЯ - Синхронизация с DOM
 */
function updateUserProfile() {
    console.log("[updateUserProfile] 🔄 Обновляю профиль пользователя");
    updateUI();
}

/**
 * ПОКАЗАТЬ СТРАНИЦУ ОПЛАТЫ - Модальное окно с тарифами
 */
function showPaymentPage() {
    console.log("[showPaymentPage] 💳 Открываю страницу оплаты");
    
    // Проверяем авторизацию
    const userData = localStorage.getItem('userData');
    if (!userData) {
        showNotification('❌ Сначала авторизуйтесь!', 'error');
        openAuthModal();
        return;
    }
    
    const user = JSON.parse(userData);
    
    // Создаем модальное окно если его еще нет
    let paymentModal = document.getElementById('payment-modal');
    if (!paymentModal) {
        paymentModal = document.createElement('div');
        paymentModal.id = 'payment-modal';
        paymentModal.className = 'payment-modal';
        paymentModal.innerHTML = `
            <div class="payment-modal-content">
                <div class="payment-modal-header">
                    <h2>💎 Премиум подписка</h2>
                    <button class="payment-close" onclick="closePaymentModal()">&times;</button>
                </div>
                <div class="payment-modal-body">
                    <p class="payment-intro">Получите неограниченную энергию и золотой интерфейс!</p>
                    
                    <div class="payment-cards">
                        <div class="payment-card">
                            <div class="payment-card-header">
                                <h3>🌙 Месяц</h3>
                                <div class="payment-price">$4.99</div>
                            </div>
                            <div class="payment-card-body">
                                <ul class="payment-features">
                                    <li>✓ Неограниченная энергия</li>
                                    <li>✓ Золотой интерфейс</li>
                                    <li>✓ Приоритет в рейтингах</li>
                                </ul>
                                <button class="payment-btn payment-btn-month" onclick="buyPremium('month', 4.99)">Купить</button>
                            </div>
                        </div>
                        
                        <div class="payment-card payment-card-popular">
                            <div class="payment-popular-badge">ПОПУЛЯРНО</div>
                            <div class="payment-card-header">
                                <h3>⭐ Квартал</h3>
                                <div class="payment-price">$12.99</div>
                                <small class="payment-save">Экономия 13%</small>
                            </div>
                            <div class="payment-card-body">
                                <ul class="payment-features">
                                    <li>✓ Неограниченная энергия</li>
                                    <li>✓ Золотой интерфейс</li>
                                    <li>✓ Приоритет в рейтингах</li>
                                </ul>
                                <button class="payment-btn payment-btn-quarter" onclick="buyPremium('quarter', 12.99)">Купить</button>
                            </div>
                        </div>
                        
                        <div class="payment-card">
                            <div class="payment-card-header">
                                <h3>♔ Навсегда</h3>
                                <div class="payment-price">$29.99</div>
                            </div>
                            <div class="payment-card-body">
                                <ul class="payment-features">
                                    <li>✓ Неограниченная энергия</li>
                                    <li>✓ Золотой интерфейс</li>
                                    <li>✓ Приоритет в рейтингах</li>
                                    <li>✓ Эксклюзивный бейдж</li>
                                </ul>
                                <button class="payment-btn payment-btn-lifetime" onclick="buyPremium('lifetime', 29.99)">Купить</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="payment-warning">
                        <p>⚠️ Это демо-версия. После нажатия «Купить» премиум активируется сразу.</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(paymentModal);
    }
    
    paymentModal.style.display = 'flex';
}

/**
 * ЗАКРЫТЬ ОКНО ОПЛАТЫ
 */
function closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * ПОКУПКА ПРЕМИУМА - Отправка на сервер
 */
async function buyPremium(plan, price) {
    const userData = localStorage.getItem('userData');
    if (!userData) {
        showNotification('❌ Ошибка авторизации', 'error');
        return;
    }
    
    const user = JSON.parse(userData);
    const button = event.target;
    const originalText = button.textContent;
    
    try {
        button.disabled = true;
        button.textContent = '⏳ Обработка...';
        
        console.log(`[buyPremium] 💳 Покупка ${plan} для пользователя ${user.id}`);
        
        const response = await fetch('/api/buy-premium', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                username: user.username,
                plan: plan,
                price: price
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Ошибка покупки');
        }
        
        // ✅ УСПЕХ: Обновляем localStorage и UI
        console.log('[buyPremium] ✅ Премиум активирован!');
        const updatedUser = { ...user, is_premium: true };
        localStorage.setItem('userData', JSON.stringify(updatedUser));
        
        showNotification(`🎉 Добро пожаловать в премиум! ${result.message}`, 'success');
        closePaymentModal();
        updateUI(); // ГАРАНТИЙНОЕ ОБНОВЛЕНИЕ
        
        // Открываем настройки чтобы показать новую панель
        setTimeout(() => showTab('settings'), 500);
        
    } catch (error) {
        console.error('[buyPremium] ❌ Ошибка:', error.message);
        showNotification(`❌ ${error.message}`, 'error');
        button.textContent = originalText;
        button.disabled = false;
    }
}

async function loadLeaderboard() {
    const content = document.getElementById('leaderboard-content');
    content.innerHTML = '<div class="leaderboard-loading">Загрузка...</div>';

    try {
        const response = await fetch('/leaderboard');
        const data = await response.json();

        if (response.ok) {
            content.innerHTML = `
                <div class="leaderboard-list">
                    ${data.leaderboard.map((player, index) => `
                        <div class="leaderboard-item ${player.is_premium ? 'premium-player' : ''} ${index < 3 ? 'top3' : ''}">
                            <div class="leaderboard-rank">${index + 1}</div>
                            <div class="leaderboard-name">
                                ${player.username}
                                ${player.is_premium ? '<span class="leaderboard-premium-badge">VIP</span>' : ''}
                            </div>
                            <div class="leaderboard-elo">${player.elo}</div>
                        </div>
                    `).join('')}
                </div>
                
            `;
        } else {
            content.innerHTML = '<div class="leaderboard-loading">Ошибка загрузки</div>';
        }
    } catch (error) {
        console.error('Leaderboard error:', error);
        content.innerHTML = '<div class="leaderboard-loading">Ошибка сети</div>';
    }
}

function showNotification(message, type = 'info') {
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Стили для уведомления
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    // Цвета для разных типов
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        info: '#2196F3',
        warning: '#ff9800'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    document.body.appendChild(notification);

    // Автоматическое удаление через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// CSS анимации для уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
async function useEnergy(cost) {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData) return true; // Если гость — играем без ограничений (или поменяй логику)

    const response = await fetch('/api/consume-energy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id, amount: cost })
    });

    const result = await response.json();

    if (result.success) {
        // Обновляем локальные данные и UI
        userData.energy = result.newEnergy;
        localStorage.setItem('userData', JSON.stringify(userData));
        updateUI(); 
        return true;
    } else {
        alert("Энергия на нуле! Подожди восстановления или купи Премиум.");
        return false;
    }
}
let energyInterval; // Чтобы интервалы не плодились как крысы в Найт-Сити

function startEnergyTimer(lastUpdateISO) {
    const timerElement = document.getElementById('energy-timer');
    const energyDisplay = document.getElementById('user-energy');
    if (!timerElement) return;

    if (window.energyInterval) clearInterval(window.energyInterval);

    const update = () => {
        const userData = JSON.parse(localStorage.getItem('userData'));
        if (!userData || userData.energy >= 5) {
            timerElement.innerText = "";
            clearInterval(window.energyInterval);
            return;
        }

        const lastUpdate = new Date(lastUpdateISO);
        const now = new Date();
        const intervalMs = 30 * 60 * 1000; // 30 минут
        const elapsedMs = now - lastUpdate;

        // 1. Считаем, сколько новых единиц УЖЕ накопилось
        const recovered = Math.floor(elapsedMs / intervalMs);
        
        if (recovered > 0) {
            // Если энергия восстановилась, обновляем данные
            userData.energy = Math.min(5, userData.energy + recovered);
            
            // Сдвигаем точку отсчета на количество полных интервалов
            const nextUpdateDate = new Date(lastUpdate.getTime() + (recovered * intervalMs));
            userData.last_energy_update = nextUpdateDate.toISOString();
            
            // Сохраняем и обновляем экран
            localStorage.setItem('userData', JSON.stringify(userData));
            if (energyDisplay) energyDisplay.innerText = userData.energy;

            // Рекурсивно перезапускаем с новой датой
            startEnergyTimer(userData.last_energy_update);
            return;
        }

        // 2. Считаем время до СЛЕДУЮЩЕЙ единицы
        const msUntilNext = intervalMs - (elapsedMs % intervalMs);
        const mins = Math.floor(msUntilNext / 60000);
        const secs = Math.floor((msUntilNext % 60000) / 1000);

        timerElement.innerText = `(⏳ ${mins}:${secs < 10 ? '0' : ''}${secs})`;
    };

    update();
    window.energyInterval = setInterval(update, 1000);
}
// Функция для включения/выключения золотой темы
function toggleThemePreference() {
    const isChecked = document.getElementById('theme-toggle').checked;
    const themeName = isChecked ? 'premium' : 'classic';
    
    // Сохраняем выбор в браузере
    localStorage.setItem('preferredTheme', themeName);
    
    // Применяем визуально
    if (themeName === 'premium') {
        document.body.classList.add('premium-theme');
    } else {
        document.body.classList.remove('premium-theme');
    }
}

// Вызывай эту функцию внутри своей основной updateUI()
function checkPremiumSettings() {
    console.log("[checkPremiumSettings] Запуск проверки VIP-настроек");
    const userDataStr = localStorage.getItem('userData');
    if (!userDataStr) {
        console.log("[checkPremiumSettings] Нет userData в localStorage");
        return;
    }

    try {
        const user = JSON.parse(userDataStr);
        const premiumBlock = document.getElementById('premium-settings');
        const energyDisplay = document.getElementById('user-energy');
        const blindToggle = document.getElementById('blindboard-toggle');
        const savedPieceSet = localStorage.getItem('pieceSet');

        if (user.is_premium) {
            console.log("[checkPremiumSettings] ✅ VIP статус активен. Разблокирую функции...");

            if (premiumBlock) {
                premiumBlock.style.display = 'block';
                console.log("[checkPremiumSettings] VIP-блок отображен");
            }

            if (energyDisplay) {
                energyDisplay.innerText = '∞';
                energyDisplay.style.color = '#ffd700';
                energyDisplay.style.textShadow = '0 0 5px rgba(255, 215, 0, 0.5)';
            }

            if (savedPieceSet) {
                currentPieceSet = savedPieceSet;
            }
            updatePieceSetButtons();

            if (blindToggle) {
                blindBoardActive = localStorage.getItem('blindBoardActive') === 'true';
                blindToggle.checked = blindBoardActive;
                boardElement.classList.toggle('blindboard-mode', blindBoardActive);
            }

            const premiumGlow = localStorage.getItem('premiumGlow') === 'true';
            const premiumCheckbox = document.getElementById('premium-theme-checkbox');
            const premiumSoundWrapper = document.getElementById('premium-sound-wrapper');
            const premiumSoundToggle = document.getElementById('premium-sound-toggle');

            if (premiumCheckbox) {
                premiumCheckbox.checked = premiumGlow;
            }
            document.body.classList.toggle('premium-highlight', premiumGlow);

            if (premiumSoundWrapper) {
                premiumSoundWrapper.style.display = 'block';
            }
            if (premiumSoundToggle) {
                enablePremiumSounds = localStorage.getItem('enablePremiumSounds') === 'true';
                premiumSoundToggle.checked = enablePremiumSounds;
            }

            updateDifficultyButtons();
        } else {
            console.log("[checkPremiumSettings] VIP статус отключен");
            if (premiumBlock) premiumBlock.style.display = 'none';
            const premiumSoundWrapper = document.getElementById('premium-sound-wrapper');
            if (premiumSoundWrapper) premiumSoundWrapper.style.display = 'none';
            document.body.classList.remove('premium-theme');
            console.log("[checkPremiumSettings] VIP статус отключен");
            if (premiumBlock) premiumBlock.style.display = 'none';
            document.body.classList.remove('premium-theme');
            if (energyDisplay) {
                energyDisplay.innerText = user.energy || 0;
                energyDisplay.style.color = "";
                energyDisplay.style.textShadow = '';
            }
            if (blindToggle) {
                blindToggle.checked = false;
            }
            blindBoardActive = false;
            boardElement.classList.remove('blindboard-mode');
            updateDifficultyButtons();
        }
    } catch (error) {
        console.error("[checkPremiumSettings] ❌ Ошибка:", error);
    }
}

function togglePremiumTheme() {
    console.log("[togglePremiumTheme] Переключение Premium-подсветки");
    const checkbox = document.getElementById('premium-theme-checkbox');
    if (!checkbox) {
        console.warn("[togglePremiumTheme] Чекбокс не найден");
        return;
    }

    if (checkbox.checked) {
        document.body.classList.add('premium-highlight');
        localStorage.setItem('premiumGlow', 'true');
        console.log("[togglePremiumTheme] ✅ Премиум-подсветка активирована");
    } else {
        document.body.classList.remove('premium-highlight');
        localStorage.setItem('premiumGlow', 'false');
        console.log("[togglePremiumTheme] ✅ Премиум-подсветка отключена");
    }
}

// Функция отправки сообщения в чат
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    if (!input) return;
    if (!input.value.trim()) {
        showNotification('Введите сообщение для чата', 'warning');
        return;
    }
    if (!user || !user.id) {
        showNotification('Нужно войти в систему, чтобы писать в чате', 'error');
        openAuthModal();
        return;
    }

    try {
        const res = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                username: user.username || 'Гость',
                message: input.value.trim()
            })
        });
        if (!res.ok) {
            const text = await res.text();
            showNotification('Ошибка отправки в чат', 'error');
            console.error('Ошибка отправки сообщения:', res.status, text);
            return;
        }
        input.value = '';
        await loadMessages();
    } catch (err) {
        console.error('Ошибка отправки сообщения:', err);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Функция загрузки сообщений чата
async function loadMessages() {
    try {
        const res = await fetch('/api/chat/messages');
        const box = document.getElementById('chat-box');
        if (!box) return;
        if (!res.ok) {
            const text = await res.text();
            console.error('Ошибка загрузки чата:', res.status, text);
            box.innerHTML = '<div class="chat-error">Не удалось загрузить сообщения чата.</div>';
            return;
        }
        const messages = await res.json();

        if (!messages || messages.length === 0) {
            box.innerHTML = '<div class="chat-empty">Чат пуст. Напишите первое сообщение.</div>';
            return;
        }

        box.innerHTML = messages.map(m => `
            <div class="chat-msg">
                <span class="chat-user" style="${m.username === 'Asik' ? 'color: #ffd700;' : ''}">${m.username || 'Гость'}:</span>
                <span class="chat-text">${m.message || ''}</span>
            </div>
        `).join('');
        box.scrollTop = box.scrollHeight;
    } catch (err) {
        console.error('Ошибка загрузки сообщений чата:', err);
        const box = document.getElementById('chat-box');
        if (box) box.innerHTML = '<div class="chat-error">Ошибка сети при загрузке чата.</div>';
    }
}

setInterval(loadMessages, 3000);

// ✅ checkPremiumSettings() уже вызывается внутри updateUI() в DOMContentLoaded
// Дополнительный вызов НЕ нужен - это вызовет дублирование!

// Динамический пересчет размера доски при изменении окна
window.onresize = function() {
    if (typeof board !== 'undefined' && board && typeof board.resize === 'function') {
        board.resize();
    }
};

// Гарантируем запуск после полной загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateUI);
} else {
    updateUI(); // Если скрипт загрузился позже DOM
}
