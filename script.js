const boardElement = document.getElementById('board');
const puzzleBoardElement = document.getElementById('puzzle-board');
const statusElement = document.getElementById('status');
const themeToggle = document.getElementById('theme-toggle');
const settingsThemeToggle = document.getElementById('theme-toggle-settings');

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
let historyReplay = null;
let hintsUsedThisGame = false;
let hintRequestPending = false;
let gameSaved = false;
let computerMoveTimeout = null;
let gameGeneration = 0;

let audioContext = null;
async function getAudioContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!audioContext) audioContext = new AudioContextConstructor();
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
        } catch (e) {
            console.warn('AudioContext resume failed:', e);
        }
    }
    return audioContext;
}
let eloHistory = [];
let eloGainedInLastGame = 0;

// Переменные для игры против Stockfish
let gameMode = 'pvp'; // 'pvp' = человек vs человек, 'pvc' = человек vs компьютер
let playerColor = 'white';
let difficulty = 10; // 1-20, чем выше, тем сложнее
let activeGameMode = 'pvp';
let activeGameDifficulty = 10;
let isComputerThinking = false;
let stockfish = null;
let stockfishLoadingPromise = null;
let stockfishWorkerUrl = null;
let boardFlipped = false; // Переворот доски для чёрных игроков
let chatRefreshTimeout = null;
let resetGamePending = false;

if (boardElement) {
    boardElement.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const square = target.closest('.square');
        if (!square || !boardElement.contains(square)) return;
        const row = Number(square.dataset.row);
        const col = Number(square.dataset.col);
        if (Number.isInteger(row) && Number.isInteger(col)) {
            handleSquareClick(row, col);
        }
    });
}

if (puzzleBoardElement) {
    puzzleBoardElement.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const square = target.closest('.puzzle-square');
        if (!square || !puzzleBoardElement.contains(square)) return;
        const row = Number(square.dataset.row);
        const col = Number(square.dataset.col);
        if (Number.isInteger(row) && Number.isInteger(col)) handlePuzzleSquareClick(row, col);
    });
}

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

async function refreshUserProfile(userId) {
    if (!userId) return;
    try {
        const response = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error(`Profile request failed: ${response.status}`);
        const profile = await response.json();
        const current = JSON.parse(localStorage.getItem('userData') || 'null');
        if (!current || String(current.id) !== String(profile.id)) return;
        const updated = { ...current, ...profile };
        updated.is_premium = profile.is_premium === true;
        updated.energy = Math.max(0, Math.min(5, Number(profile.energy) || 0));
        currentUser = updated;
        localStorage.setItem('userData', JSON.stringify(updated));
        updateUI();
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
    }
}

function changePieceSet(setName) {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    if ((setName === 'gold' || setName === 'cyberpunk') && userData.is_premium !== true) {
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
    if (gameActive) renderBoard();
}

let whiteTime = 600;
let blackTime = 600;
let timerInterval;
let selectedTime = 600;
let gameMoves = [];
let analysisRunning = false;
let analysisMoves = [];
let analysisResults = [];
let analysisPositionIndex = 0;
let analysisRunToken = 0;
let cancelStockfishAnalysisWait = null;
let puzzleBoard = null;
let puzzleSelectedSquare = null;
let puzzleCastlingRights = null;
let puzzleEnPassantTarget = null;
let puzzleCurrentIndex = 0;
let puzzleSolvedCount = 0;
let puzzleProgressKey = '';
let puzzleHighlightedMove = null;
let onlineRoom = null;
let onlinePollTimeout = null;
let onlinePollGeneration = 0;
let onlinePollInFlight = false;
let onlineMovePending = false;
let onlineFinishPending = null;
let onlineLastAppliedVersion = -1;

const dailyPuzzles = [
    {
        id: 'back-rank-mate',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        move: 'd1d8',
        comment: 'Ладья проходит по открытой линии и ставит мат по последнему ряду.'
    },
    {
        id: 'queen-capture-rook',
        fen: '6k1/8/8/8/8/8/6q1/6RK w - - 0 1',
        move: 'g1g2',
        comment: 'Король под шахом: ладья может немедленно забрать ферзя.'
    },
    {
        id: 'bishop-wins-queen',
        fen: '6k1/8/8/8/8/8/3q4/2B3K1 w - - 0 1',
        move: 'c1d2',
        comment: 'Слон берёт ферзя на соседней диагонали.'
    },
    {
        id: 'knight-fork',
        fen: '4k3/7q/8/8/4N3/8/8/6K1 w - - 0 1',
        move: 'e4f6',
        comment: 'Конь с шахом нападает на ферзя: после ухода короля ферзь будет потерян.'
    },
    {
        id: 'scholars-mate',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4',
        move: 'h5f7',
        comment: 'Ферзь берёт пешку f7 при поддержке слона — мат королю.'
    }
];

const STOCKFISH_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.js';
const STOCKFISH_WASM_URL = 'https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.wasm';

// Stockfish is loaded into a dedicated worker only when a hint, analysis, or bot move needs it.
function initStockfish() {
    if (stockfish) return Promise.resolve(stockfish);
    if (stockfishLoadingPromise) return stockfishLoadingPromise;

    stockfishLoadingPromise = new Promise((resolve, reject) => {
        if (typeof Worker !== 'function' || typeof URL.createObjectURL !== 'function') {
            reject(new Error('Этот браузер не поддерживает worker для Stockfish.'));
            return;
        }

        const workerSource = `importScripts(${JSON.stringify(STOCKFISH_SCRIPT_URL)});`;
        const workerBlob = new Blob([workerSource], { type: 'text/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        let engine;
        try {
            engine = new Worker(`${workerUrl}#${STOCKFISH_WASM_URL}`);
        } catch (error) {
            URL.revokeObjectURL(workerUrl);
            reject(new Error(`Не удалось запустить worker Stockfish: ${error.message}`));
            return;
        }
        stockfishWorkerUrl = workerUrl;
        stockfish = engine;

        let readyTimeout;
        let receivedUciOk = false;
        const cleanup = () => {
            clearTimeout(readyTimeout);
            engine.removeEventListener('message', onMessage);
            engine.removeEventListener('error', onError);
        };
        const fail = (error) => {
            cleanup();
            engine.terminate();
            URL.revokeObjectURL(workerUrl);
            if (stockfish === engine) stockfish = null;
            if (stockfishWorkerUrl === workerUrl) stockfishWorkerUrl = null;
            reject(error);
        };
        const onMessage = (event) => {
            const message = getStockfishMessage(event);
            if (message.includes('uciok') && !receivedUciOk) {
                receivedUciOk = true;
                engine.postMessage('isready');
            } else if (receivedUciOk && message.includes('readyok')) {
                cleanup();
                resolve(engine);
            }
        };
        const onError = (event) => {
            fail(new Error(`Ошибка worker Stockfish: ${event.message || 'неизвестная ошибка'}`));
        };

        readyTimeout = setTimeout(
            () => fail(new Error('Stockfish не ответил при запуске за 20 секунд.')),
            20000
        );
        engine.addEventListener('message', onMessage);
        engine.addEventListener('error', onError);
        engine.postMessage('uci');
    }).catch(error => {
        stockfishLoadingPromise = null;
        throw error;
    });

    return stockfishLoadingPromise;
}

function stopStockfish() {
    if (stockfish) {
        try {
            if (typeof stockfish.terminate === 'function') {
                stockfish.terminate();
            } else {
                stockfish.postMessage('quit');
            }
        } catch (error) {
            console.warn('Не удалось остановить Stockfish:', error);
        }
    }
    stockfish = null;
    stockfishLoadingPromise = null;
    if (stockfishWorkerUrl) {
        URL.revokeObjectURL(stockfishWorkerUrl);
        stockfishWorkerUrl = null;
    }
}

function getStockfishMessage(event) {
    return typeof event === 'string' ? event : String(event?.data || '');
}

function waitForStockfishReady(engine) {
    return new Promise((resolve, reject) => {
        const finish = (error) => {
            clearTimeout(timeout);
            engine.removeEventListener('message', onMessage);
            if (cancelStockfishAnalysisWait === cancel) cancelStockfishAnalysisWait = null;
            if (error) reject(error);
            else resolve();
        };
        const cancel = () => finish(new Error('Stockfish analysis cancelled.'));
        const onMessage = (event) => {
            if (getStockfishMessage(event).includes('readyok')) finish();
        };
        const timeout = setTimeout(() => finish(new Error('Stockfish readiness timed out.')), 10000);
        cancelStockfishAnalysisWait = cancel;
        engine.addEventListener('message', onMessage);
        engine.postMessage('isready');
    });
}

function requestStockfishEvaluation(engine, uciMoves) {
    return new Promise((resolve, reject) => {
        let evaluation = null;
        const finish = (error, value) => {
            clearTimeout(timeout);
            engine.removeEventListener('message', onMessage);
            if (cancelStockfishAnalysisWait === cancel) cancelStockfishAnalysisWait = null;
            if (error) reject(error);
            else resolve(value);
        };
        const cancel = () => finish(new Error('Stockfish analysis cancelled.'));
        const onMessage = (event) => {
            const message = getStockfishMessage(event);
            const score = message.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
            if (score) {
                const value = Number(score[2]);
                evaluation = score[1] === 'mate'
                    ? Math.sign(value || 1) * (10000 - Math.min(Math.abs(value), 99) * 100)
                    : value;
            }
            if (message.includes('bestmove')) finish(null, evaluation);
        };
        const timeout = setTimeout(() => finish(new Error('Stockfish analysis timed out.')), 15000);
        cancelStockfishAnalysisWait = cancel;
        engine.addEventListener('message', onMessage);
        engine.postMessage(`position startpos${uciMoves.length ? ` moves ${uciMoves.join(' ')}` : ''}`);
        engine.postMessage('go depth 8');
    });
}

function setGameMode(mode) {
    if (onlineRoom) {
        showNotification('Сначала выйдите из онлайн-комнаты, чтобы сменить режим игры.', 'warning');
        return;
    }
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
    const allowedLevels = [1, 5, 10, 20];
    if (!allowedLevels.includes(Number(level))) return;
    level = Number(level);
    if (level === 20 && userData.is_premium !== true) {
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
    if (gameActive && gameMode === 'pvc' && currentPlayer !== playerColor &&
        !isComputerThinking && !computerMoveTimeout) {
        computerMoveTimeout = setTimeout(makeComputerMove, 100);
    }
}

async function getStockfishMove(level = difficulty, { allowNoviceRandom = false } = {}) {
    if (allowNoviceRandom && level <= 2 && Math.random() < 0.25) {
        const legalMoves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (board[row]?.[col]?.color !== currentPlayer) continue;
                for (const move of getPossibleMoves(row, col)) {
                    legalMoves.push({ from: { row, col }, to: move });
                }
            }
        }
        if (legalMoves.length) {
            const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            return `${String.fromCharCode(97 + move.from.col)}${8 - move.from.row}` +
                `${String.fromCharCode(97 + move.to.col)}${8 - move.to.row}`;
        }
    }

    const engine = await initStockfish();
    const search = level <= 2
        ? { skill: Math.floor(Math.random() * 4), depth: 2 }
        : level <= 5
            ? { skill: 8, depth: 7 }
            : level <= 10
                ? { skill: 16, depth: 13 }
                : { skill: 20, depth: 19 };
    return new Promise((resolve, reject) => {
        const fen = boardToFEN();
        const finish = (error, move) => {
            clearTimeout(timeout);
            engine.removeEventListener('message', onMessage);
            engine.removeEventListener('error', onError);
            if (error) {
                if (stockfish === engine) stopStockfish();
                reject(error);
            } else {
                resolve(move);
            }
        };
        const timeout = setTimeout(
            () => finish(new Error(
                `Stockfish не рассчитал ход за ${level > 10 ? '60' : '20'} секунд. Нажмите уровень сложности, чтобы повторить.`
            )),
            level > 10 ? 60000 : 20000
        );
        const onMessage = (event) => {
            const message = getStockfishMessage(event);
            if (!message.includes('bestmove')) return;
            const match = message.match(/\bbestmove\s+([a-h][1-8][a-h][1-8][qrbn]?|0000)\b/);
            if (!match || match[1] === '0000') {
                finish(new Error('Stockfish не вернул легальный ход.'));
                return;
            }
            finish(null, match[1]);
        };
        const onError = (event) => finish(
            new Error(`Ошибка worker Stockfish: ${event.message || 'неизвестная ошибка'}`)
        );

        engine.addEventListener('message', onMessage);
        engine.addEventListener('error', onError);
        engine.postMessage('setoption name Skill Level value ' + search.skill);
        engine.postMessage('ucinewgame');
        engine.postMessage('position fen ' + fen);
        engine.postMessage('go depth ' + search.depth);
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

async function showHint() {
    if (!gameActive) return;
    if (hintRequestPending) return;
    if (analysisRunning) {
        showNotification('Дождитесь завершения анализа партии.', 'warning');
        return;
    }
    hintRequestPending = true;

    try {
        // 1. Проверка на ход компьютера
        if (gameMode === 'pvc' && currentPlayer !== playerColor) {
            alert('⏸️ Это ход компьютера');
            return;
        }

        // 2. Логика расхода энергии
        const userData = JSON.parse(localStorage.getItem('userData') || 'null');
        if (!userData) {
            alert('Вы не авторизованы для получения подсказок');
            return;
        }
        if (userData.is_premium !== true && hintsUsedThisGame) {
            showNotification('Обычной учётной записи доступна одна подсказка за партию.', 'warning');
            return;
        }

        let stockfishMove;
        try {
            stockfishMove = await getStockfishMove(difficulty);
        } catch (error) {
            console.error('Stockfish hint error:', error);
            showNotification(`Подсказка недоступна: ${error.message}`, 'error');
            return;
        }
        const match = stockfishMove && stockfishMove.match(/^([a-h][1-8])([a-h][1-8])/);
        if (!match) {
            showNotification('Stockfish пока не готов. Попробуйте ещё раз.', 'error');
            return;
        }
        const from = { row: 8 - Number(match[1][1]), col: match[1].charCodeAt(0) - 97 };
        const to = { row: 8 - Number(match[2][1]), col: match[2].charCodeAt(0) - 97 };
        const piece = board[from.row]?.[from.col];
        if (!piece || !getPossibleMoves(from.row, from.col).some(move => move.row === to.row && move.col === to.col)) {
            showNotification('Stockfish вернул ход, который недоступен в текущей позиции.', 'error');
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

            hintsUsedThisGame = true;
            const fromSquare = match[1];
            const toSquare = match[2];
            const pieceName = {
                pawn: 'Пешка', knight: 'Конь', bishop: 'Слон',
                rook: 'Ладья', queen: 'Ферзь', king: 'Король'
            }[piece.type];
            showNotification(`💡 Stockfish: ${pieceName} ${fromSquare} → ${toSquare}`, 'success');

        } catch (error) {
            console.error('Hint error:', error);
            alert('Ошибка подключения к серверу');
        }
    } finally {
        stopStockfish();
        hintRequestPending = false;
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
    computerMoveTimeout = null;
    if (!gameActive || gameMode !== 'pvc' || currentPlayer === playerColor || isComputerThinking) return;

    const generation = gameGeneration;
    isComputerThinking = true;
    statusElement.textContent = '🤖 Stockfish думает...';

    try {
        const uciMove = await getStockfishMove(difficulty, { allowNoviceRandom: true });
        if (!gameActive || generation !== gameGeneration) return;

        const match = uciMove.match(/^([a-h][1-8])([a-h][1-8])/);
        if (!match) throw new Error('Stockfish вернул ход в неизвестном формате.');
        const from = { row: 8 - Number(match[1][1]), col: match[1].charCodeAt(0) - 97 };
        const to = { row: 8 - Number(match[2][1]), col: match[2].charCodeAt(0) - 97 };
        const piece = board[from.row]?.[from.col];
        const legal = piece?.color === currentPlayer &&
            getPossibleMoves(from.row, from.col).some(move => move.row === to.row && move.col === to.col);
        if (!legal) throw new Error(`Stockfish вернул нелегальный ход: ${uciMove}`);

        makeMove(from, to);
    } catch (error) {
        if (gameActive && generation === gameGeneration) {
            console.error('Stockfish bot move failed:', error);
            statusElement.textContent = 'Ход бота не выполнен. Измените уровень или попробуйте ещё раз.';
            showNotification(`Бот не смог сделать ход: ${error.message}`, 'error');
        }
    } finally {
        isComputerThinking = false;
        if (!gameActive && statusElement) updateStatus();
    }
}

async function playSound(type) {
    if (!enableSounds) return;

    let audioCtx;
    try {
        audioCtx = await getAudioContext();
    } catch (error) {
        console.warn('Не удалось запустить звук:', error);
        return;
    }
    if (!audioCtx) return;
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

function createInitialBoard() {
    const initialBoard = Array(8).fill().map(() => Array(8).fill(null));
    initialBoard[0] = [
        { type: 'rook', color: 'black' }, { type: 'knight', color: 'black' },
        { type: 'bishop', color: 'black' }, { type: 'queen', color: 'black' },
        { type: 'king', color: 'black' }, { type: 'bishop', color: 'black' },
        { type: 'knight', color: 'black' }, { type: 'rook', color: 'black' }
    ];
    for (let i = 0; i < 8; i++) {
        initialBoard[1][i] = { type: 'pawn', color: 'black' };
        initialBoard[6][i] = { type: 'pawn', color: 'white' };
    }
    initialBoard[7] = [
        { type: 'rook', color: 'white' }, { type: 'knight', color: 'white' },
        { type: 'bishop', color: 'white' }, { type: 'queen', color: 'white' },
        { type: 'king', color: 'white' }, { type: 'bishop', color: 'white' },
        { type: 'knight', color: 'white' }, { type: 'rook', color: 'white' }
    ];
    return initialBoard;
}

function initBoard() {
    board = createInitialBoard();
    historyReplay = null;
}

function renderBoard() {
    if (!boardElement) return;
    boardElement.innerHTML = '';
    if (!Array.isArray(board) || board.length !== 8 || board.some(row => !Array.isArray(row) || row.length !== 8)) {
        updateMaterialBalance();
        return;
    }
    
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
            if (blindBoardActive && isSquareAttacked(row, col, 'black')) {
                square.classList.add('attacked-by-black');
            }
            if (blindBoardActive && isSquareAttacked(row, col, 'white')) {
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
    if (!Array.isArray(board) || board.length !== 8 || board.some(row => !Array.isArray(row))) return;
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
    if (onlineRoom && (currentPlayer !== playerColor || onlineMovePending)) return;
    
    // В режиме с компьютером - не позволять ходить когда не твой ход
    if (gameMode === 'pvc' && currentPlayer !== playerColor) return;
    
    if (selectedSquare) {
        if (possibleMoves.some(move => move.row === row && move.col === col)) {
            if (onlineRoom) submitOnlineMove(selectedSquare, { row, col });
            else makeMove(selectedSquare, { row, col });
        } else {
            selectSquare(row, col);
        }
    } else {
        selectSquare(row, col);
    }
}

function selectSquare(row, col) {
    if (!Array.isArray(board) || !board[row]) return;
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
    if (!Array.isArray(board) || !board[row] || !board[row][col]) return [];
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
    if (!Array.isArray(board) || !board[from.row] || !board[to.row]) return;
    const piece = board[from.row][from.col];
    if (!piece) return;
    const isEnPassantCapture = piece.type === 'pawn' && enPassantTarget &&
        to.row === enPassantTarget.row && to.col === enPassantTarget.col;
    const captured = board[to.row][to.col] || (isEnPassantCapture ? board[from.row][to.col] : null);
    moveHistory.push({
        from, to, piece, captured,
        previousBoard: board.map(row => row.map(cell => cell ? { ...cell } : null)),
        previousPlayer: currentPlayer,
        previousCastlingRights: JSON.parse(JSON.stringify(castlingRights)),
        previousEnPassantTarget: enPassantTarget ? { ...enPassantTarget } : null,
        previousGameActive: gameActive,
        previousWhiteTime: whiteTime,
        previousBlackTime: blackTime,
        side: currentPlayer
    });
    
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
    if (gameMode === 'pvc' && gameActive && currentPlayer !== playerColor && !computerMoveTimeout) {
        computerMoveTimeout = setTimeout(makeComputerMove, 500);
    }
}

function updateStatus() {
    if (!Array.isArray(board) || board.length !== 8 || board.some(row => !Array.isArray(row))) return;
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
        saveGame(currentPlayer === playerColor ? 'loss' : 'win');
    } else if (isStalemate()) {
        statusElement.textContent = '🤝 Пат! Ничья!';
        gameActive = false;
        clearInterval(timerInterval);
        saveGame('draw');
    } else if (isInCheck(currentPlayer)) {
        statusElement.textContent = `⚠️ Шах! ${stageEmoji} Ход ${currentPlayer === 'white' ? '⚪' : '⚫'}`;
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
    if (onlineRoom) {
        showNotification('Отмена хода недоступна в онлайн-комнате.', 'warning');
        return;
    }
    const last = moveHistory[moveHistory.length - 1];
    const isOwnMove = gameMode === 'pvp' || last?.side === playerColor;
    if (!last || (!gameActive && gameSaved) || !isOwnMove) {
        showNotification('Можно отменить только свой последний ход до ответа соперника.', 'warning');
        return;
    }
    clearTimeout(computerMoveTimeout);
    gameGeneration++;
    isComputerThinking = false;
    moveHistory.pop();
    gameMoves.pop();
    board = last.previousBoard;
    currentPlayer = last.previousPlayer;
    castlingRights = last.previousCastlingRights;
    enPassantTarget = last.previousEnPassantTarget;
    gameActive = last.previousGameActive;
    whiteTime = last.previousWhiteTime;
    blackTime = last.previousBlackTime;
    selectedSquare = null;
    possibleMoves = [];
    if (gameActive) startTimer();
    updateStatus();
    updateTimer();
    updateMovesPanel();
    renderBoard();
}

function resignGame() {
    if (!gameActive) return;
    const loser = onlineRoom ? playerColor : currentPlayer;
    const winner = loser === 'white' ? 'black' : 'white';
    statusElement.textContent = `🏳️ ${loser === 'white' ? 'Белые' : 'Чёрные'} сдались. ${winner === 'white' ? 'Белые ⚪' : 'Чёрные ⚫'} выигрывают!`;
    gameActive = false;
    clearInterval(timerInterval);
    const resultType = loser === playerColor ? 'loss' : (winner === playerColor ? 'win' : 'draw');
    saveGame(resultType);
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
    if (onlineRoom) {
        showNotification('В онлайн-партии используйте «Сдаться» или «Выйти из комнаты».', 'warning');
        return;
    }
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
    if (onlineRoom) {
        showNotification('Цвет фигур задаётся комнатой и не может быть изменён.', 'warning');
        return;
    }
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
    timerInterval = null;
    if (!gameActive || document.hidden) return;
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
    if (resetGamePending) return;
    cancelGameAnalysis();
    if (onlineRoom) leaveOnlineRoom(false);
    resetGamePending = true;
    clearTimeout(computerMoveTimeout);
    computerMoveTimeout = null;
    clearInterval(timerInterval);
    timerInterval = null;
    try {
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
                    } else {
                        showNotification(result.error || 'Ошибка расхода энергии', 'error');
                    }
                    return;
                }

                userData.energy = result.energy;
                localStorage.setItem('userData', JSON.stringify(userData));
                updateUI();
            } catch (error) {
                console.error('Use energy error:', error);
                showNotification('Ошибка подключения к серверу', 'error');
                return;
            }
        }

        initBoard();
        currentPlayer = 'white';
        selectedSquare = null;
        possibleMoves = [];
        moveHistory = [];
        enPassantTarget = null;
        castlingRights = { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } };
        whiteTime = selectedTime;
        blackTime = selectedTime;
        gameMoves = [];
        gameSaved = false;
        updateAnalysisControls();
        hintsUsedThisGame = false;
        activeGameMode = gameMode;
        activeGameDifficulty = difficulty;
        gameGeneration++;
        gameActive = true;
        updateAnalysisControls();
        isComputerThinking = false;
        boardFlipped = (gameMode === 'pvc' && playerColor === 'black');

        updateStatus();
        updateTimer();
        updateMovesPanel();
        renderBoard();
        startTimer();

        if (gameMode === 'pvc' && playerColor === 'black') {
            computerMoveTimeout = setTimeout(makeComputerMove, 1000);
        }
    } finally {
        resetGamePending = false;
        if (gameActive && !timerInterval) {
            startTimer();
            if (gameMode === 'pvc' && currentPlayer !== playerColor && !computerMoveTimeout) {
                computerMoveTimeout = setTimeout(makeComputerMove, 500);
            }
        }
    }
}

function saveGame(result) {
    if (gameSaved || !Array.isArray(board) || board.length !== 8) return;
    gameSaved = true;
    updateAnalysisControls();
    const game = {
        date: new Date().toISOString(),
        moves: gameMoves.slice(),
        result: result,
        fen: boardToFEN(),
        pgn: movesToPGN(),
        duration: selectedTime - (currentPlayer === 'white' ? whiteTime : blackTime)
    };
    
    const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
    history.unshift(game);
    if (history.length > 100) history.pop();
    localStorage.setItem('chessHistory', JSON.stringify(history));
    
    // Сохранить Elo историю
    localStorage.setItem('eloHistory', JSON.stringify(eloHistory));
    
    updateStatistics();
    updateLandingStats(); // Обновить статистику на landing странице после игры
    if (onlineRoom) {
        if (onlineMovePending) onlineFinishPending = result;
        else finishOnlineRoom(result);
    } else {
        saveGameResult(result);
    }
}

async function saveGameResult(resultStatus) {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData) return;

    const gameData = {
        userId: userData.id,
        result: resultStatus,
        fen: boardToFEN(),
        moves: gameMoves.join(', '),
        gameMode: activeGameMode,
        difficulty: activeGameDifficulty
    };

    try {
        const response = await fetch('/api/save-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gameData)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            const currentUser = JSON.parse(localStorage.getItem('userData') || 'null');
            if (currentUser && String(currentUser.id) === String(userData.id)) {
                currentUser.elo = Number(result.elo);
                currentUser.league = result.league;
                eloGainedInLastGame = Number(result.eloChange);
                eloHistory.push({
                    date: new Date().toLocaleString('ru-RU'),
                    result: resultStatus,
                    change: eloGainedInLastGame,
                    newElo: Number(result.elo)
                });
                if (eloHistory.length > 20) eloHistory.shift();
                localStorage.setItem('userData', JSON.stringify(currentUser));
                localStorage.setItem('eloHistory', JSON.stringify(eloHistory));
                updateUI();
                await refreshUserProfile(currentUser.id);
                await loadLeaderboard();
            } else {
                await loadLeaderboard();
            }
            if (document.getElementById('history')?.classList.contains('active')) loadHistory();
        } else {
            console.error('Не удалось сохранить партию:', response.status, result.error);
            showNotification('Не удалось сохранить партию и обновить рейтинг.', 'error');
        }
    } catch (error) {
        console.error('Связь с сервером потеряна:', error);
        showNotification('Не удалось сохранить партию и обновить Elo. Проверьте соединение и повторите позже.', 'error');
    }
}

function updateEloDisplay() {
    const eloRating = document.getElementById('elo-rating');
    const eloCategory = document.getElementById('elo-category');
    const user = JSON.parse(localStorage.getItem('userData') || 'null');
    const elo = Number(user?.elo);
    if (eloRating) eloRating.textContent = Number.isFinite(elo) ? String(elo) : '—';
    if (eloCategory) eloCategory.textContent = user?.league || 'Войдите, чтобы увидеть рейтинг';
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

async function loadHistory() {
    const historyDiv = document.getElementById('game-history');
    const noHistoryDiv = document.getElementById('no-history');
    const viewer = document.getElementById('history-viewer');
    if (!historyDiv || !noHistoryDiv) return;
    const user = JSON.parse(localStorage.getItem('userData') || 'null');
    historyDiv.replaceChildren();
    if (viewer) viewer.style.display = 'none';
    if (!user?.id) {
        noHistoryDiv.style.display = 'block';
        noHistoryDiv.textContent = 'Войдите в аккаунт, чтобы загрузить историю партий с сервера.';
        return;
    }

    noHistoryDiv.textContent = '📭 Сохранённых партий пока нет.';
    noHistoryDiv.style.display = 'block';
    try {
        const response = await fetch(`/api/history?userId=${encodeURIComponent(user.id)}`);
        if (!response.ok) throw new Error(`History request failed: ${response.status}`);
        const { games } = await response.json();
        if (!Array.isArray(games) || games.length === 0) return;

        noHistoryDiv.style.display = 'block';
        noHistoryDiv.style.display = 'none';
        games.forEach((game, index) => {
        const gameDiv = document.createElement('div');
        gameDiv.className = 'game-record';
        const heading = document.createElement('div');
        heading.className = 'game-record-header';
        const title = document.createElement('strong');
        title.className = 'game-record-title';
        title.textContent = `Партия ${games.length - index}`;
        const date = document.createElement('span');
        date.className = 'game-record-date';
        date.textContent = game.createdAt ? new Date(game.createdAt).toLocaleString('ru-RU') : '';
        heading.append(title, date);
        const result = document.createElement('p');
        const normalizedResult = String(game.result || '').toLowerCase();
        const resultKey = normalizedResult === 'win' || normalizedResult.includes('побед')
            ? 'win'
            : normalizedResult === 'loss' || normalizedResult.includes('поражен')
                ? 'loss'
                : 'draw';
        result.className = `game-record-result ${resultKey}`;
        result.textContent = resultKey === 'win' ? '✅ Победа' : resultKey === 'loss' ? '❌ Поражение' : '🤝 Ничья';
        const moves = document.createElement('p');
        moves.className = 'moves-list';
        const parsedMoves = parseHistoryMoves(game.moves);
        moves.textContent = parsedMoves.length ? `Ходов: ${parsedMoves.length}` : 'Запись ходов отсутствует';
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.textContent = 'Просмотреть партию';
        openButton.addEventListener('click', () => openHistoryGame(game.id));
        gameDiv.append(heading, result, moves, openButton);
        historyDiv.appendChild(gameDiv);
        });
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        noHistoryDiv.textContent = 'Не удалось загрузить историю партий. Попробуйте обновить вкладку.';
        noHistoryDiv.style.display = 'block';
    }
}

function parseHistoryMoves(moves) {
    const encoded = Array.isArray(moves) ? moves.join(' ') : String(moves || '');
    return encoded.match(/[a-h][1-8]-[a-h][1-8]/g) || [];
}

function createReplayBoard(moves, index) {
    const replayBoard = createInitialBoard();
    for (let moveIndex = 0; moveIndex < index; moveIndex++) {
        const match = moves[moveIndex].match(/^([a-h][1-8])-([a-h][1-8])$/);
        if (!match) continue;
        const from = { row: 8 - Number(match[1][1]), col: match[1].charCodeAt(0) - 97 };
        const to = { row: 8 - Number(match[2][1]), col: match[2].charCodeAt(0) - 97 };
        const piece = replayBoard[from.row][from.col];
        if (!piece) continue;
        if (piece.type === 'king' && Math.abs(to.col - from.col) === 2) {
            const rookFrom = to.col > from.col ? 7 : 0;
            const rookTo = to.col > from.col ? 5 : 3;
            replayBoard[to.row][rookTo] = replayBoard[to.row][rookFrom];
            replayBoard[to.row][rookFrom] = null;
        }
        if (piece.type === 'pawn' && from.col !== to.col && !replayBoard[to.row][to.col]) {
            replayBoard[from.row][to.col] = null;
        }
        replayBoard[to.row][to.col] = { ...piece, type: piece.type === 'pawn' && (to.row === 0 || to.row === 7) ? 'queen' : piece.type };
        replayBoard[from.row][from.col] = null;
    }
    return replayBoard;
}

async function openHistoryGame(gameId) {
    const user = JSON.parse(localStorage.getItem('userData') || 'null');
    if (!user?.id) return;
    try {
        const response = await fetch(`/api/history/${encodeURIComponent(gameId)}?userId=${encodeURIComponent(user.id)}`);
        if (!response.ok) throw new Error(`Game request failed: ${response.status}`);
        const { game } = await response.json();
        historyReplay = { game, moves: parseHistoryMoves(game.moves), index: 0 };
        const viewer = document.getElementById('history-viewer');
        const title = document.getElementById('history-viewer-title');
        if (title) title.textContent = `Партия от ${game.createdAt ? new Date(game.createdAt).toLocaleString('ru-RU') : '—'}`;
        if (viewer) viewer.style.display = 'block';
        renderHistoryPosition();
        viewer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Ошибка открытия партии:', error);
        showNotification('Не удалось открыть партию.', 'error');
    }
}

function stepHistory(direction) {
    if (!historyReplay) return;
    historyReplay.index = Math.max(0, Math.min(historyReplay.moves.length, historyReplay.index + direction));
    renderHistoryPosition();
}

function renderHistoryPosition() {
    if (!historyReplay) return;
    const replayBoard = createReplayBoard(historyReplay.moves, historyReplay.index);

    const boardView = document.getElementById('history-viewer-board');
    if (boardView) {
        boardView.replaceChildren();
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `history-viewer-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                const piece = replayBoard[row][col];
                if (piece) square.textContent = pieces[piece.color][piece.type];
                boardView.appendChild(square);
            }
        }
    }
    const stepLabel = document.getElementById('history-viewer-step');
    if (stepLabel) stepLabel.textContent = `${historyReplay.index} / ${historyReplay.moves.length} ходов`;
}

function closeHistoryViewer() {
    historyReplay = null;
    const viewer = document.getElementById('history-viewer');
    if (viewer) viewer.style.display = 'none';
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
        if (userData.is_premium === true) {
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
    if (!Array.isArray(board) || board.length !== 8 || board.some(row => !Array.isArray(row))) return '';
    const fenCharByType = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
    let fen = '';
    for (let row = 0; row < 8; row++) {
        let emptyCount = 0;
        for (let col = 0; col < 8; col++) {
            if (board[row][col]) {
                if (emptyCount) fen += emptyCount;
                emptyCount = 0;
                const piece = board[row][col];
                const char = fenCharByType[piece.type];
                if (!char) return '';
                fen += piece.color === 'white' ? char.toUpperCase() : char;
            } else {
                emptyCount++;
            }
        }
        if (emptyCount) fen += emptyCount;
        if (row < 7) fen += '/';
    }
    const activeColor = currentPlayer === 'white' ? 'w' : 'b';
    const castling = [
        castlingRights.white.kingSide ? 'K' : '',
        castlingRights.white.queenSide ? 'Q' : '',
        castlingRights.black.kingSide ? 'k' : '',
        castlingRights.black.queenSide ? 'q' : ''
    ].join('') || '-';
    const enPassant = enPassantTarget
        ? `${String.fromCharCode(97 + enPassantTarget.col)}${8 - enPassantTarget.row}`
        : '-';
    return `${fen} ${activeColor} ${castling} ${enPassant} 0 ${Math.floor(gameMoves.length / 2) + 1}`;
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
            Object.assign({ enableAnimations, enableSounds, enableCoordinates, enableMaterial, currentBoardStyle, currentBoardSize, currentPieceSet, blindBoardActive }, settings);
            localStorage.setItem('enableAnimations', enableAnimations);
            localStorage.setItem('enableSounds', enableSounds);
            localStorage.setItem('enableCoordinates', enableCoordinates);
            localStorage.setItem('enableMaterial', enableMaterial);
            localStorage.setItem('boardStyle', currentBoardStyle);
            localStorage.setItem('boardSize', currentBoardSize);
            localStorage.setItem('pieceSet', currentPieceSet);
            localStorage.setItem('blindBoardActive', blindBoardActive);
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
        scheduleChatRefresh();
    } else {
        clearTimeout(chatRefreshTimeout);
        chatRefreshTimeout = null;
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
    } else if (tabId === 'puzzles') {
        loadDailyPuzzleIfNeeded();
    } else if (tabId === 'online') {
        if (onlineRoom) updateOnlineRoomStatus(onlineRoom.lastState || {
            started: onlineRoom.gameStarted,
            finished: false,
            turn: currentPlayer,
            players: {}
        });
    }
}

function getCompletedGameForAnalysis() {
    if (gameActive) return null;
    if (gameSaved) return { moves: gameMoves.slice() };
    try {
        const history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
        return Array.isArray(history) ? history.find(game => Array.isArray(game.moves) || typeof game.moves === 'string') || null : null;
    } catch (error) {
        console.error('Не удалось прочитать локальную историю партий:', error);
        return null;
    }
}

function updateAnalysisControls() {
    const button = document.getElementById('analyze-game-button');
    if (!button) return;
    const game = getCompletedGameForAnalysis();
    button.disabled = analysisRunning || !game || parseHistoryMoves(game.moves).length === 0;
    button.textContent = analysisRunning ? '⏳ Анализ выполняется...' : '🔍 Анализировать завершённую партию';
}

function cancelGameAnalysis() {
    if (!analysisRunning) return;
    analysisRunToken++;
    if (cancelStockfishAnalysisWait) cancelStockfishAnalysisWait();
    stopStockfish();
    analysisRunning = false;
    const status = document.getElementById('analysis-status');
    if (status) status.textContent = 'Анализ остановлен: начата новая партия.';
    updateAnalysisControls();
}

function getWhitePerspectiveEvaluation(engineEvaluation, plyCount) {
    if (engineEvaluation === null) return null;
    return plyCount % 2 === 0 ? engineEvaluation : -engineEvaluation;
}

function classifyMoveLoss(loss) {
    if (loss >= 150) return { label: 'Блиундер', className: 'blunder' };
    if (loss >= 70) return { label: 'Ошибка', className: 'mistake' };
    if (loss >= 35) return { label: 'Неточность', className: 'inaccuracy' };
    return { label: 'Нормально', className: 'normal' };
}

async function analyzeCompletedGame() {
    if (gameActive || analysisRunning || hintRequestPending) {
        showNotification('Дождитесь окончания партии и текущего запроса Stockfish.', 'warning');
        return;
    }
    const game = getCompletedGameForAnalysis();
    const status = document.getElementById('analysis-status');
    const resultsPanel = document.getElementById('analysis-results');
    const moveList = document.getElementById('analysis-move-list');
    if (!game || !status || !resultsPanel || !moveList) return;

    analysisMoves = parseHistoryMoves(game.moves);
    if (analysisMoves.length === 0) {
        status.textContent = 'В завершённой партии нет ходов для анализа.';
        return;
    }

    const uciMoves = analysisMoves.map(move => move.replace('-', ''));
    analysisRunning = true;
    const runToken = ++analysisRunToken;
    analysisResults = [];
    analysisPositionIndex = 0;
    resultsPanel.hidden = true;
    moveList.replaceChildren();
    updateAnalysisControls();
    status.textContent = `Подготовка Stockfish... 0 / ${analysisMoves.length} ходов`;

    try {
        const engine = await initStockfish();
        if (runToken !== analysisRunToken) {
            stopStockfish();
            return;
        }
        await waitForStockfishReady(engine);
        if (runToken !== analysisRunToken) return;
        engine.postMessage('setoption name Threads value 1');
        let previousEval = getWhitePerspectiveEvaluation(
            await requestStockfishEvaluation(engine, []),
            0
        );
        if (previousEval === null) previousEval = 0;

        for (let index = 0; index < uciMoves.length; index++) {
            if (runToken !== analysisRunToken) return;
            const engineEval = await requestStockfishEvaluation(engine, uciMoves.slice(0, index + 1));
            if (runToken !== analysisRunToken) return;
            const currentEval = getWhitePerspectiveEvaluation(engineEval, index + 1);
            const fallbackEval = currentEval === null ? previousEval : currentEval;
            const loss = Math.max(0, index % 2 === 0 ? previousEval - fallbackEval : fallbackEval - previousEval);
            analysisResults.push({
                move: analysisMoves[index],
                loss,
                evaluation: fallbackEval,
                ...classifyMoveLoss(loss)
            });
            previousEval = fallbackEval;
            status.textContent = `Анализ ходов: ${index + 1} / ${analysisMoves.length}`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        renderAnalysisResults();
        status.textContent = `Анализ завершён: ${analysisResults.length} ходов.`;
    } catch (error) {
        if (runToken === analysisRunToken) {
            console.error('Ошибка анализа партии:', error);
            status.textContent = 'Не удалось завершить анализ Stockfish. Проверьте подключение к движку и попробуйте снова.';
        }
    } finally {
        if (runToken === analysisRunToken) {
            stopStockfish();
            analysisRunning = false;
            updateAnalysisControls();
        }
    }
}

function renderAnalysisResults() {
    const resultsPanel = document.getElementById('analysis-results');
    const moveList = document.getElementById('analysis-move-list');
    if (!resultsPanel || !moveList) return;
    moveList.replaceChildren();
    analysisResults.forEach((result, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `analysis-move ${result.className}`;
        button.textContent = `${index + 1}. ${result.move} — ${result.label} (${result.loss} cp)`;
        button.addEventListener('click', () => renderAnalysisPosition(index + 1));
        moveList.appendChild(button);
    });
    resultsPanel.hidden = false;
    renderAnalysisPosition(analysisMoves.length);
}

function renderAnalysisPosition(positionIndex) {
    const boardView = document.getElementById('analysis-board');
    if (!boardView) return;
    analysisPositionIndex = Math.max(0, Math.min(analysisMoves.length, positionIndex));
    const position = createReplayBoard(analysisMoves, analysisPositionIndex);
    boardView.replaceChildren();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = `analysis-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            if (position[row][col]) square.textContent = pieces[position[row][col].color][position[row][col].type];
            boardView.appendChild(square);
        }
    }
    const step = document.getElementById('analysis-step');
    const previous = document.getElementById('analysis-prev');
    const next = document.getElementById('analysis-next');
    if (step) step.textContent = `${analysisPositionIndex} / ${analysisMoves.length}`;
    if (previous) previous.disabled = analysisPositionIndex === 0;
    if (next) next.disabled = analysisPositionIndex >= analysisMoves.length;
}

function stepAnalysisPosition(direction) {
    renderAnalysisPosition(analysisPositionIndex + direction);
}

function getPuzzleDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getPuzzleProgressKey() {
    let userId = 'guest';
    try {
        const user = JSON.parse(localStorage.getItem('userData') || 'null');
        if (user?.id) userId = String(user.id);
    } catch (error) {
        console.error('Не удалось определить пользователя для задач дня:', error);
    }
    return `dailyPuzzleProgress:${getPuzzleDateKey()}:${userId}`;
}

function parsePuzzleFen(fen) {
    const fields = String(fen || '').trim().split(/\s+/);
    if (fields.length < 4 || !['w', 'b'].includes(fields[1])) throw new Error('Некорректная сторона хода в FEN.');
    const rows = fields[0].split('/');
    if (rows.length !== 8) throw new Error('Некорректная FEN-позиция задачи.');
    const typeByFen = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
    const parsedBoard = rows.map(rowText => {
        const row = [];
        for (const character of rowText) {
            if (/^[1-8]$/.test(character)) {
                for (let count = 0; count < Number(character); count++) row.push(null);
                continue;
            }
            const type = typeByFen[character.toLowerCase()];
            if (!type) throw new Error('Некорректная фигура в FEN задачи.');
            row.push({ type, color: character === character.toUpperCase() ? 'white' : 'black' });
        }
        if (row.length !== 8) throw new Error('FEN задачи должна содержать 8 клеток в каждом ряду.');
        return row;
    });
    const rights = fields[2] === '-' ? '' : fields[2];
    let target = null;
    if (fields[3] !== '-') {
        const file = fields[3].charCodeAt(0) - 97;
        const rank = Number(fields[3][1]);
        if (file < 0 || file > 7 || rank < 1 || rank > 8) throw new Error('Некорректная цель взятия на проходе в FEN.');
        target = { row: 8 - rank, col: file };
    }
    return {
        board: parsedBoard,
        currentPlayer: fields[1] === 'w' ? 'white' : 'black',
        castlingRights: {
            white: { kingSide: rights.includes('K'), queenSide: rights.includes('Q') },
            black: { kingSide: rights.includes('k'), queenSide: rights.includes('q') }
        },
        enPassantTarget: target
    };
}

function loadDailyPuzzleIfNeeded() {
    const key = getPuzzleProgressKey();
    if (key === puzzleProgressKey && puzzleBoard) return;
    puzzleProgressKey = key;
    try {
        const stored = JSON.parse(localStorage.getItem(key) || '{"solved":0}');
        puzzleSolvedCount = Math.max(0, Math.min(dailyPuzzles.length, Number(stored.solved) || 0));
    } catch (error) {
        console.error('Не удалось загрузить прогресс задач дня:', error);
        puzzleSolvedCount = 0;
    }
    puzzleCurrentIndex = Math.min(puzzleSolvedCount, dailyPuzzles.length - 1);
    renderCurrentDailyPuzzle(false);
}

function saveDailyPuzzleProgress() {
    try {
        localStorage.setItem(puzzleProgressKey, JSON.stringify({ solved: puzzleSolvedCount }));
    } catch (error) {
        console.error('Не удалось сохранить прогресс задач дня:', error);
        showNotification('Не удалось сохранить прогресс задач на этом устройстве.', 'error');
    }
}

function renderCurrentDailyPuzzle(preserveFeedback) {
    const progress = document.getElementById('puzzle-progress');
    const status = document.getElementById('puzzle-status');
    const feedback = document.getElementById('puzzle-feedback');
    const comment = document.getElementById('puzzle-comment');
    if (progress) progress.textContent = `Очки сегодня: ${puzzleSolvedCount} / ${dailyPuzzles.length}`;
    if (!preserveFeedback && feedback) feedback.textContent = '';
    puzzleSelectedSquare = null;
    puzzleHighlightedMove = null;

    const puzzle = dailyPuzzles[puzzleCurrentIndex];
    try {
        const position = parsePuzzleFen(puzzle.fen);
        if (position.currentPlayer !== 'white') throw new Error('Задача должна начинаться ходом белых.');
        puzzleBoard = position.board;
        puzzleCastlingRights = position.castlingRights;
        puzzleEnPassantTarget = position.enPassantTarget;
        if (comment) comment.textContent = puzzle.comment;
        if (puzzleSolvedCount >= dailyPuzzles.length) {
            if (status) status.textContent = 'На сегодня все задачи решены. Возвращайтесь завтра за новым прогрессом.';
        } else if (status) {
            status.textContent = `Задача ${puzzleCurrentIndex + 1} из ${dailyPuzzles.length}. Найдите лучший ход белых.`;
        }
        renderPuzzleBoard();
    } catch (error) {
        console.error(`Некорректная задача ${puzzle.id}:`, error);
        if (status) status.textContent = 'Не удалось загрузить позицию задачи.';
        if (comment) comment.textContent = '';
    }
}

function renderPuzzleBoard() {
    if (!puzzleBoardElement || !puzzleBoard) return;
    puzzleBoardElement.replaceChildren();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('button');
            square.type = 'button';
            square.className = `puzzle-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = String(row);
            square.dataset.col = String(col);
            const piece = puzzleBoard[row][col];
            if (piece) square.textContent = pieces[piece.color][piece.type];
            if (puzzleSelectedSquare?.row === row && puzzleSelectedSquare?.col === col) {
                square.classList.add('selected');
            }
            if (puzzleHighlightedMove?.from.row === row && puzzleHighlightedMove?.from.col === col) {
                square.classList.add('puzzle-correct-from');
            }
            if (puzzleHighlightedMove?.to.row === row && puzzleHighlightedMove?.to.col === col) {
                square.classList.add('puzzle-correct-to');
            }
            puzzleBoardElement.appendChild(square);
        }
    }
}

function getPuzzleLegalMoves(row, col) {
    const previousState = { board, castlingRights, enPassantTarget, currentPlayer };
    board = puzzleBoard;
    castlingRights = puzzleCastlingRights;
    enPassantTarget = puzzleEnPassantTarget;
    currentPlayer = 'white';
    try {
        return getPossibleMoves(row, col);
    } finally {
        board = previousState.board;
        castlingRights = previousState.castlingRights;
        enPassantTarget = previousState.enPassantTarget;
        currentPlayer = previousState.currentPlayer;
    }
}

function puzzleSquareName(square) {
    return `${String.fromCharCode(97 + square.col)}${8 - square.row}`;
}

function showPuzzleSolution(puzzle) {
    const feedback = document.getElementById('puzzle-feedback');
    const from = { row: 8 - Number(puzzle.move[1]), col: puzzle.move.charCodeAt(0) - 97 };
    const to = { row: 8 - Number(puzzle.move[3]), col: puzzle.move.charCodeAt(2) - 97 };
    puzzleHighlightedMove = { from, to };
    puzzleSelectedSquare = null;
    if (feedback) feedback.textContent = `Неверно. Правильный ход: ${puzzle.move.slice(0, 2)} → ${puzzle.move.slice(2, 4)}. ${puzzle.comment}`;
    renderPuzzleBoard();
}

function handlePuzzleSquareClick(row, col) {
    if (!puzzleBoard || puzzleSolvedCount >= dailyPuzzles.length) return;
    const feedback = document.getElementById('puzzle-feedback');
    const piece = puzzleBoard[row]?.[col];
    if (!puzzleSelectedSquare) {
        if (piece?.color === 'white') {
            puzzleSelectedSquare = { row, col };
            puzzleHighlightedMove = null;
            if (feedback) feedback.textContent = '';
            renderPuzzleBoard();
        }
        return;
    }

    const from = puzzleSelectedSquare;
    if (from.row === row && from.col === col) {
        puzzleSelectedSquare = null;
        renderPuzzleBoard();
        return;
    }
    if (piece?.color === 'white') {
        puzzleSelectedSquare = { row, col };
        renderPuzzleBoard();
        return;
    }

    const legal = getPuzzleLegalMoves(from.row, from.col).some(move => move.row === row && move.col === col);
    const attemptedMove = `${puzzleSquareName(from)}${puzzleSquareName({ row, col })}`;
    const puzzle = dailyPuzzles[puzzleCurrentIndex];
    if (!legal || attemptedMove !== puzzle.move) {
        showPuzzleSolution(puzzle);
        return;
    }

    puzzleSolvedCount++;
    saveDailyPuzzleProgress();
    if (feedback) feedback.textContent = `Верно! +1 очко. ${puzzle.comment}`;
    puzzleCurrentIndex = Math.min(puzzleSolvedCount, dailyPuzzles.length - 1);
    renderCurrentDailyPuzzle(true);
    if (puzzleSolvedCount >= dailyPuzzles.length && feedback) {
        feedback.textContent = 'Отличная работа! Все 5 задач дня решены.';
    }
}

function getRoomPlayer() {
    try {
        const user = JSON.parse(localStorage.getItem('userData') || 'null');
        const id = Number(user?.id);
        return {
            userId: Number.isSafeInteger(id) && id > 0 ? id : null,
            username: String(user?.username || 'Гость').slice(0, 32)
        };
    } catch (error) {
        console.error('Не удалось прочитать профиль для онлайн-комнаты:', error);
        return { userId: null, username: 'Гость' };
    }
}

function showOnlineRoomLink(joinUrl) {
    const row = document.getElementById('online-room-link-row');
    const input = document.getElementById('online-room-link');
    if (row && input) {
        input.value = new URL(joinUrl, location.origin).href;
        row.hidden = false;
    }
}

function setOnlineRoomSession(data) {
    stopOnlinePolling();
    clearInterval(timerInterval);
    timerInterval = null;
    gameActive = false;
    selectedSquare = null;
    possibleMoves = [];
    onlineRoom = {
        roomId: data.roomId,
        playerToken: data.playerToken,
        color: data.color,
        version: -1,
        gameStarted: false,
        finishRequested: false
    };
    onlineLastAppliedVersion = -1;
    playerColor = data.color;
    gameMode = 'pvp';
    activeGameMode = 'pvp';
    boardFlipped = playerColor === 'black';
    const roomInput = document.getElementById('online-room-id');
    if (roomInput) roomInput.value = data.roomId;
    const leaveButton = document.getElementById('online-leave-button');
    if (leaveButton) leaveButton.hidden = false;
    const linkRow = document.getElementById('online-room-link-row');
    if (linkRow && data.color !== 'white') linkRow.hidden = true;
    const status = document.getElementById('online-room-status');
    if (status) status.textContent = `Вы подключились за ${playerColor === 'white' ? 'белых' : 'чёрных'}. Подключаемся к комнате...`;
    if (data.state) applyOnlineRoomState(data.state);
    startOnlinePolling();
}

async function createOnlineRoom() {
    try {
        const player = getRoomPlayer();
        const response = await fetch('/api/room/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(player)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось создать комнату.');
        setOnlineRoomSession(data);
        showOnlineRoomLink(data.joinUrl);
        showTab('online');
    } catch (error) {
        console.error('Create online room error:', error);
        const status = document.getElementById('online-room-status');
        if (status) status.textContent = error.message || 'Ошибка создания комнаты.';
    }
}

function getRoomIdFromInput() {
    const input = document.getElementById('online-room-id');
    const raw = String(input?.value || new URLSearchParams(location.search).get('room') || '').trim();
    try {
        const parsed = new URL(raw, location.origin);
        const fromUrl = parsed.searchParams.get('room');
        return fromUrl || raw;
    } catch (error) {
        return raw;
    }
}

async function joinOnlineRoom() {
    const roomId = getRoomIdFromInput();
    if (!/^[a-f0-9]{12}$/i.test(roomId)) {
        const status = document.getElementById('online-room-status');
        if (status) status.textContent = 'Введите корректную ссылку или код комнаты.';
        return;
    }
    try {
        const response = await fetch(`/api/room/${encodeURIComponent(roomId)}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getRoomPlayer())
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось присоединиться к комнате.');
        setOnlineRoomSession(data);
        showTab('online');
    } catch (error) {
        console.error('Join online room error:', error);
        const status = document.getElementById('online-room-status');
        if (status) status.textContent = error.message || 'Ошибка подключения к комнате.';
    }
}

async function copyOnlineRoomLink() {
    const input = document.getElementById('online-room-link');
    if (!input?.value) return;
    try {
        await navigator.clipboard.writeText(input.value);
        showNotification('Ссылка на комнату скопирована.', 'success');
    } catch (error) {
        input.focus();
        input.select();
        showNotification('Ссылка выделена — скопируйте её вручную.', 'warning');
    }
}

function stopOnlinePolling() {
    clearTimeout(onlinePollTimeout);
    onlinePollTimeout = null;
    onlinePollGeneration++;
    onlinePollInFlight = false;
}

function startOnlinePolling() {
    clearTimeout(onlinePollTimeout);
    const generation = ++onlinePollGeneration;
    pollOnlineRoom(generation);
}

function scheduleOnlinePoll(generation, delay = 1200) {
    clearTimeout(onlinePollTimeout);
    if (!onlineRoom || document.hidden || generation !== onlinePollGeneration) return;
    onlinePollTimeout = setTimeout(() => pollOnlineRoom(generation), delay);
}

async function pollOnlineRoom(generation) {
    if (!onlineRoom || document.hidden || generation !== onlinePollGeneration || onlinePollInFlight) return;
    onlinePollInFlight = true;
    try {
        const response = await fetch(
            `/api/room/${encodeURIComponent(onlineRoom.roomId)}/state?token=${encodeURIComponent(onlineRoom.playerToken)}`
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Связь с комнатой потеряна.');
        if (generation === onlinePollGeneration) applyOnlineRoomState(data.state);
    } catch (error) {
        if (generation === onlinePollGeneration) {
            console.error('Online room poll error:', error);
            const status = document.getElementById('online-room-status');
            if (status) status.textContent = 'Нет связи с комнатой. Повторное подключение...';
        }
    } finally {
        onlinePollInFlight = false;
        if (onlineRoom) scheduleOnlinePoll(onlinePollGeneration, generation === onlinePollGeneration ? 1200 : 100);
    }
}

function updateOnlineRoomStatus(state) {
    const status = document.getElementById('online-room-status');
    if (!status || !onlineRoom) return;
    const otherColor = onlineRoom.color === 'white' ? 'black' : 'white';
    const opponent = state.players?.[otherColor];
    if (state.finished) {
        status.textContent = state.winner === 'draw'
            ? 'Партия завершена вничью.'
            : `Партия завершена. Победили ${state.winner === 'white' ? 'белые' : 'чёрные'}.`;
    } else if (!state.started) {
        status.textContent = 'Комната создана. Ожидаем второго игрока — отправьте ссылку приглашения.';
    } else if (!opponent?.connected) {
        status.textContent = 'Соперник отключился или ещё подключается. Комната остаётся доступной.';
    } else {
        status.textContent = `Вы играете за ${onlineRoom.color === 'white' ? 'белых' : 'чёрных'}. Соперник: ${opponent.username || 'Игрок'}. Ход ${state.turn === 'white' ? 'белых' : 'чёрных'}.`;
    }
}

function applyOnlineRoomState(state) {
    if (!onlineRoom || !state) return;
    onlineRoom.lastState = state;
    onlineRoom.version = Number(state.version) || 0;
    updateOnlineRoomStatus(state);
    if (!state.started || state.version <= onlineLastAppliedVersion) return;
    try {
        const position = parsePuzzleFen(state.fen);
        if (!onlineRoom.gameStarted) {
            onlineRoom.gameStarted = true;
            gameSaved = false;
            moveHistory = [];
            selectedSquare = null;
            possibleMoves = [];
            whiteTime = selectedTime;
            blackTime = selectedTime;
            activeGameMode = 'pvp';
        }
        board = position.board;
        currentPlayer = position.currentPlayer;
        castlingRights = position.castlingRights;
        enPassantTarget = position.enPassantTarget;
        gameMoves = Array.isArray(state.moves) ? state.moves.slice() : [];
        gameActive = !state.finished;
        onlineLastAppliedVersion = Number(state.version);
        if (state.finished) {
            clearInterval(timerInterval);
            timerInterval = null;
            const result = state.winner === 'draw' ? 'draw' : state.winner === onlineRoom.color ? 'win' : 'loss';
            statusElement.textContent = state.winner === 'draw'
                ? '🤝 Онлайн-партия завершилась вничью.'
                : `🏁 Онлайн-партия завершена. Победили ${state.winner === 'white' ? 'белые' : 'чёрные'}.`;
            if (!gameSaved) saveGame(result);
            const player = getRoomPlayer();
            if (player.userId) refreshUserProfile(player.userId);
        } else {
            updateStatus();
            if (!timerInterval) startTimer();
        }
        updateTimer();
        updateMovesPanel();
        renderBoard();
    } catch (error) {
        console.error('Invalid online room position:', error);
        const status = document.getElementById('online-room-status');
        if (status) status.textContent = 'Не удалось синхронизировать позицию онлайн-партии.';
    }
}

async function submitOnlineMove(from, to) {
    if (!onlineRoom || onlineMovePending) return;
    const room = onlineRoom;
    const expectedVersion = room.version;
    const move = `${puzzleSquareName(from)}${puzzleSquareName(to)}`;
    onlineMovePending = true;
    onlineFinishPending = null;
    makeMove(from, to);
    const pendingResult = onlineFinishPending;
    try {
        const response = await fetch(`/api/room/${encodeURIComponent(room.roomId)}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerToken: room.playerToken,
                expectedVersion,
                move,
                fen: boardToFEN()
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Ход не принят комнатой.');
        applyOnlineRoomState(data.state);
        if (pendingResult) await finishOnlineRoom(pendingResult);
    } catch (error) {
        console.error('Submit online move error:', error);
        const status = document.getElementById('online-room-status');
        if (status) status.textContent = error.message || 'Не удалось отправить ход.';
        gameSaved = false;
        onlineFinishPending = null;
        onlineLastAppliedVersion = expectedVersion - 1;
        await pollOnlineRoom(onlinePollGeneration);
    } finally {
        onlineMovePending = false;
    }
}

async function finishOnlineRoom(result) {
    if (!onlineRoom || onlineRoom.finishRequested) return;
    const room = onlineRoom;
    room.finishRequested = true;
    try {
        const response = await fetch(`/api/room/${encodeURIComponent(room.roomId)}/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerToken: room.playerToken, result })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось завершить онлайн-партию.');
        applyOnlineRoomState(data.state);
        if (data.profile) {
            const storedUser = JSON.parse(localStorage.getItem('userData') || 'null');
            if (storedUser && String(storedUser.id) === String(data.profile.id)) {
                localStorage.setItem('userData', JSON.stringify({ ...storedUser, ...data.profile }));
                updateUI();
                await loadLeaderboard();
            }
        }
    } catch (error) {
        room.finishRequested = false;
        console.error('Finish online room error:', error);
        const status = document.getElementById('online-room-status');
        if (status) status.textContent = error.message || 'Не удалось завершить онлайн-партию.';
    }
}

function leaveOnlineRoom(showMessage = true) {
    if (!onlineRoom) return;
    stopOnlinePolling();
    onlineRoom = null;
    onlineMovePending = false;
    onlineFinishPending = null;
    onlineLastAppliedVersion = -1;
    clearInterval(timerInterval);
    timerInterval = null;
    gameActive = false;
    const leaveButton = document.getElementById('online-leave-button');
    const linkRow = document.getElementById('online-room-link-row');
    if (leaveButton) leaveButton.hidden = true;
    if (linkRow) linkRow.hidden = true;
    const status = document.getElementById('online-room-status');
    if (showMessage && status) status.textContent = 'Вы вышли из комнаты.';
}

// Вспомогательная функция для анализа (чтобы не забивать showTab)
function runPositionAnalysis() {
    const legalMovesCount = document.getElementById('legal-moves');
    if (!legalMovesCount) return;
    if (!Array.isArray(board) || board.length !== 8 || board.some(row => !Array.isArray(row))) {
        legalMovesCount.textContent = '0';
        const stats = document.getElementById('game-stats');
        if (stats) stats.textContent = 'Начните новую игру для анализа';
        return;
    }

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
function applyThemePreference(isDark) {
    if (isDark) {
        document.body.classList.remove('light-theme');
        localStorage.setItem('chessTheme', 'dark');
    } else {
        document.body.classList.add('light-theme');
        localStorage.setItem('chessTheme', 'light');
    }
    if (themeToggle) themeToggle.checked = isDark;
    if (settingsThemeToggle) settingsThemeToggle.checked = isDark;
}

if (themeToggle) themeToggle.addEventListener('change', () => applyThemePreference(themeToggle.checked));
if (settingsThemeToggle) settingsThemeToggle.addEventListener('change', () => applyThemePreference(settingsThemeToggle.checked));

// Загрузить сохранённые настройки
if (localStorage.getItem('chessTheme') === 'light') {
    document.body.classList.add('light-theme');
    if (themeToggle) themeToggle.checked = false;
    if (settingsThemeToggle) settingsThemeToggle.checked = false;
} else {
    if (themeToggle) themeToggle.checked = true;
    if (settingsThemeToggle) settingsThemeToggle.checked = true;
}

if (localStorage.getItem('enableSounds') === 'false') enableSounds = false;
else document.getElementById('sound-toggle').checked = enableSounds;
updateSoundButton();

if (localStorage.getItem('enablePremiumSounds') === 'true') enablePremiumSounds = true;
else enablePremiumSounds = false;

if (localStorage.getItem('enableAnimations') === 'false') enableAnimations = false;
else document.getElementById('animation-toggle').checked = enableAnimations;

if (localStorage.getItem('enableCoordinates') === 'false') enableCoordinates = false;
else document.getElementById('coordinates-toggle').checked = enableCoordinates;

if (localStorage.getItem('enableMaterial') === 'false') enableMaterial = false;
else document.getElementById('material-toggle').checked = enableMaterial;

if (localStorage.getItem('eloHistory')) eloHistory = JSON.parse(localStorage.getItem('eloHistory'));

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
    updateAnalysisControls();
    
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
});

const savedDifficulty = Number(localStorage.getItem('difficulty'));
if ([1, 5, 10, 20].includes(savedDifficulty)) {
    const savedUser = JSON.parse(localStorage.getItem('userData') || 'null');
    difficulty = savedDifficulty === 20 && savedUser?.is_premium !== true ? 10 : savedDifficulty;
}

if (localStorage.getItem('playerColor')) {
    playerColor = localStorage.getItem('playerColor');
}

// Установить обработчики для настроек
document.getElementById('sound-toggle').addEventListener('change', (e) => {
    enableSounds = e.target.checked;
    localStorage.setItem('enableSounds', enableSounds);
    updateSoundButton();
});

function updateSoundButton() {
    const soundButton = document.getElementById('sound-button');
    const soundToggle = document.getElementById('sound-toggle');
    if (soundButton) soundButton.textContent = enableSounds ? '🔊 Звук включён' : '🔇 Звук выключен';
    if (soundToggle) soundToggle.checked = enableSounds;
}

function toggleSound() {
    enableSounds = !enableSounds;
    localStorage.setItem('enableSounds', String(enableSounds));
    updateSoundButton();
}

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
    const isPremium = userData.is_premium === true;
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
    const user = JSON.parse(localStorage.getItem('userData') || 'null');
    const elo = Number(user?.elo);
    
    const landingElo = document.getElementById('landing-elo');
    const landingGames = document.getElementById('landing-games');
    const landingWins = document.getElementById('landing-wins');
    const landingTip = document.getElementById('landing-tip');
    
    if (landingElo) landingElo.textContent = Number.isFinite(elo) ? String(elo) : '—';
    if (landingGames) landingGames.textContent = gameHistory.length;
    
    let wins = 0;
    gameHistory.forEach(game => {
        if (game.result === 'win') wins++;
    });
    if (landingWins) landingWins.textContent = wins;
    
    // Генерируем совет на основе рейтинга
    if (landingTip && user && Number.isFinite(elo)) {
        const tips = [
            '🏰 Совет: Рокировка помогает защитить короля.',
            '📖 Совет: В дебюте старайтесь развивать фигуры.',
            '🎯 Совет: Перед ходом проверьте, не оставляете ли фигуру под боем.'
        ];
        landingTip.textContent = tips[Math.floor(Math.random() * tips.length)];
    } else if (landingTip) {
        landingTip.textContent = 'Войдите, чтобы увидеть статистику рейтинга.';
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
            await refreshUserProfile(data.id);
            await loadLeaderboard();
            closeAuthModal();
            
            // Создаем информативное уведомление с ролью и статусом
            let welcomeMsg = `✅ Добро пожаловать, ${data.username}!`;
            if (data.role === 'admin') {
                welcomeMsg += ' 👑 [Администратор]';
            }
            if (data.is_premium === true) {
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
        if (!currentUserForUI || currentUserForUI.is_premium === true) {
            buyBtn.style.display = 'none';
        } else {
            buyBtn.style.display = 'block';
        }
    }
    // 🔥 ЖЕСТКАЯ ПРОВЕРКА localStorage
    const userProfile = document.getElementById('user-profile');
    const authButton = loginBtn;
    const vipBadge = document.getElementById('vip-badge');
    const adminNavLink = document.getElementById('admin-nav-link');

    console.log("[updateUI] 🔄 Запуск обновления интерфейса | isAuth:", !!userDataStr);

    // ===== РЕЖИМ: НЕ АВТОРИЗОВАН =====
    if (!userDataStr) {
        console.log("[updateUI] 🔓 Пользователь НЕ авторизован");
        if (userProfile) userProfile.style.display = 'none';
        if (authButton) authButton.style.display = 'block';
        if (adminNavLink) adminNavLink.style.display = 'none';
        document.body.classList.remove('premium-theme');
        if (vipBadge) vipBadge.style.display = 'none';
        updateEloDisplay();
        updateLandingStats();
        return;
    }

    // ===== РЕЖИМ: АВТОРИЗОВАН =====
    try {
        const user = JSON.parse(userDataStr);
        if (!user || !user.username) throw new Error('Invalid user data');
        const isPremium = user.is_premium === true;
        const energy = Math.max(0, Math.min(5, Number(user.energy) || 0));
        
        console.log(`[updateUI] 🟢 Авторизован: ${user.username} | Role: ${user.role} | Premium: ${user.is_premium}`);
        
        // 1️⃣ ПОКАЗЫВАЕМ ПРОФИЛЬ
        if (userProfile) userProfile.style.display = 'flex';
        if (authButton) authButton.style.display = 'none';
        
        // 2️⃣ ЗАПОЛНЯЕМ ДАННЫЕ ПРОФИЛЯ
        const nameEl = document.getElementById('user-name');
        const eloEl = document.getElementById('user-elo');
        const energyEl = document.getElementById('user-energy');
        const leagueEl = document.getElementById('user-league');
        const premiumEl = document.getElementById('user-premium');
        
        if (nameEl) nameEl.textContent = user.username || '-';
        if (eloEl) eloEl.textContent = user.elo ?? '-';
        if (leagueEl) leagueEl.textContent = user.league || '-';
        if (premiumEl) premiumEl.textContent = isPremium ? 'Да' : 'Нет';

        // 3️⃣ ПРЕМИУМ-РЕЖИМ И ЭНЕРГИЯ
        if (isPremium) {
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
                energyEl.textContent = String(energy);
                energyEl.style.color = "";
                energyEl.style.textShadow = '';
                energyEl.style.fontWeight = 'normal';
            }
            if (vipBadge) vipBadge.style.display = 'none';
        }

        // 4️⃣ АДМИНКА - ЖЕСТКАЯ ЛОГИКА (CRITICAL FIX)
        if (adminNavLink) adminNavLink.style.display = user.role === 'admin' ? '' : 'none';

        // 5️⃣ ПРЕМИУМ-ИНТЕРФЕЙС И ПРОЧИЕ КОМПОНЕНТЫ
        if (typeof checkPremiumSettings === 'function') {
            checkPremiumSettings();
        }
        if (typeof updateLandingStats === 'function') {
            updateLandingStats();
        }
        updateEloDisplay();

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
            refreshUserProfile(user.id);
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
    try {
        const storedUser = JSON.parse(localStorage.getItem('userData') || 'null');
        if (storedUser && storedUser.sessionToken) {
            fetch('/logout', {
                method: 'POST',
                headers: { Authorization: `Bearer ${storedUser.sessionToken}` }
            }).catch(error => console.warn('[logout] Не удалось отозвать серверную сессию:', error));
        }
    } catch (error) {
        console.warn('[logout] Не удалось прочитать данные сессии:', error);
    }
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
    const userRankElement = document.getElementById('leaderboard-user-rank');
    if (!content) return;
    content.innerHTML = '<div class="leaderboard-loading">Загрузка...</div>';

    try {
        const userData = JSON.parse(localStorage.getItem('userData') || 'null');
        const url = userData?.id
            ? `/leaderboard?userId=${encodeURIComponent(userData.id)}`
            : '/leaderboard';
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            content.replaceChildren();
            const list = document.createElement('div');
            list.className = 'leaderboard-list';
            (data.leaderboard || []).forEach((player, index) => {
                const row = document.createElement('div');
                row.className = `leaderboard-item${player.is_premium === true ? ' premium-player' : ''}${index < 3 ? ' top3' : ''}`;

                const rank = document.createElement('div');
                rank.className = 'leaderboard-rank';
                rank.textContent = String(player.rank || index + 1);
                const name = document.createElement('div');
                name.className = 'leaderboard-name';
                name.textContent = player.username || 'Игрок';
                if (player.is_premium === true) {
                    const badge = document.createElement('span');
                    badge.className = 'leaderboard-premium-badge';
                    badge.textContent = 'VIP';
                    name.append(' ', badge);
                }
                const league = document.createElement('div');
                league.className = 'leaderboard-league';
                league.textContent = player.league || '—';
                const elo = document.createElement('div');
                elo.className = 'leaderboard-elo';
                elo.textContent = String(player.elo ?? '-');
                row.append(rank, name, league, elo);
                list.appendChild(row);
            });
            content.appendChild(list);

            if (userRankElement) {
                if (data.userRank) {
                    userRankElement.textContent =
                        `Ваше место: #${data.userRank.rank} · ${data.userRank.elo} Elo · ${data.userRank.league}`;
                } else {
                    userRankElement.textContent = userData
                        ? 'Не удалось определить место в рейтинге.'
                        : 'Войдите, чтобы увидеть своё место.';
                }
            }
        } else {
            content.innerHTML = '<div class="leaderboard-loading">Ошибка загрузки</div>';
        }
    } catch (error) {
        console.error('Leaderboard error:', error);
        content.innerHTML = '<div class="leaderboard-loading">Ошибка сети</div>';
        if (userRankElement) userRankElement.textContent = '';
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

        if (user.is_premium === true) {
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
                energyDisplay.innerText = String(Math.max(0, Math.min(5, Number(user.energy) || 0)));
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

function scheduleChatRefresh() {
    clearTimeout(chatRefreshTimeout);
    const chatTab = document.getElementById('chat');
    if (!document.hidden && chatTab?.classList.contains('active')) {
        chatRefreshTimeout = setTimeout(async () => {
            await loadMessages();
            scheduleChatRefresh();
        }, 15000);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearInterval(timerInterval);
        timerInterval = null;
        clearTimeout(chatRefreshTimeout);
        chatRefreshTimeout = null;
        clearTimeout(onlinePollTimeout);
        onlinePollTimeout = null;
        return;
    }
    if (gameActive) startTimer();
    scheduleChatRefresh();
    if (onlineRoom) scheduleOnlinePoll(onlinePollGeneration, 0);
});

window.addEventListener('pagehide', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    clearTimeout(computerMoveTimeout);
    computerMoveTimeout = null;
    clearTimeout(chatRefreshTimeout);
    chatRefreshTimeout = null;
    if (window.energyInterval) clearInterval(window.energyInterval);
    stopOnlinePolling();
    stopStockfish();
});

// ✅ checkPremiumSettings() уже вызывается внутри updateUI() в DOMContentLoaded
// Дополнительный вызов НЕ нужен - это вызовет дублирование!

// Динамический пересчет размера доски при изменении окна
window.onresize = function() {
    if (typeof board !== 'undefined' && board && typeof board.resize === 'function') {
        board.resize();
    }
};

if (document.readyState !== 'loading') updateUI();
