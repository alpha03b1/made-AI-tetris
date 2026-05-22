// ==========================================
// 1. 定数とゲーム状態の定義
// ==========================================
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const hCtx = holdCanvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nCtx = nextCanvas.getContext('2d');

const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]]
};

const COLORS = {
    I: '#00f0f0', J: '#0000f0', L: '#f0a000',
    O: '#f0f000', S: '#00f000', T: '#a000f0', Z: '#f00000'
};

const KICK_DATA = {
    "0->1": [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]],
    "1->0": [[0,0], [1,0], [1,-1], [0,2], [1,2]],
    "1->2": [[0,0], [1,0], [1,-1], [0,2], [1,2]],
    "2->1": [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]],
    "2->3": [[0,0], [1,0], [1,1], [0,-2], [1,-2]],
    "3->2": [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]],
    "3->0": [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]],
    "0->3": [[0,0], [1,0], [1,1], [0,-2], [1,-2]]
};
const KICK_DATA_I = {
    "0->1": [[0,0], [-2,0], [1,0], [-2,-1], [1,2]],
    "1->0": [[0,0], [2,0], [-1,0], [2,1], [-1,-2]],
    "1->2": [[0,0], [-1,0], [2,0], [-1,2], [2,-1]],
    "2->1": [[0,0], [1,0], [-2,0], [1,-2], [-2,1]],
    "2->3": [[0,0], [2,0], [-1,0], [2,1], [-1,-2]],
    "3->2": [[0,0], [-2,0], [1,0], [-2,-1], [1,2]],
    "3->0": [[0,0], [1,0], [-2,0], [1,-2], [-2,1]],
    "0->3": [[0,0], [-1,0], [2,0], [-1,2], [2,-1]]
};

let keyConfig = {
    moveLeft: 'ArrowLeft',
    moveRight: 'ArrowRight',
    softDrop: 'ArrowDown',
    hardDrop: 'Space',
    rotRight: 'KeyX',
    rotLeft: 'KeyZ',
    hold: 'ShiftLeft'
};

const DAS_DELAY = 170;      
const ARR_DELAY = 30;       
const SOFT_DROP_DELAY = 40; 

const LOCK_DELAY = 500;     
const MAX_LOCK_RESETS = 15; 
let lockTimer = null;       
let lockResetCount = 0;     
let isGrounded = false;     

const keysPressed = {};
const keyActionsTriggered = { hardDrop: false, rotRight: false, rotLeft: false, hold: false };
const keyTimers = {
    moveLeft: { start: 0, lastTrigger: 0 },
    moveRight: { start: 0, lastTrigger: 0 },
    softDrop: { start: 0, lastTrigger: 0 }
};

let board = [];
let nextQueue = []; 
let holdPiece = null;
let hasHeld = false;
let currentPiece = null;

let score = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let isPaused = true;
let isClearingAnimation = false; 

let renCount = -1;
let isLastMoveRotation = false;
let clearingLinesList = [];
let clearAnimTimer = 0;

let startTime = 0;
let elapsedSeconds = 0;
let mainLoopInterval = null;
let timerInterval = null;
let lastDropTime = 0;

let currentKeyToConfig = null;

// ==========================================
// 2. IndexedDB (キー設定の保存・復元)
// ==========================================
const DB_NAME = 'TetrisConfigDB';
const STORE_NAME = 'settings';

function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (e) => {
        const db = e.target.result;
        loadConfigFromDB(db);
    };
}

function loadConfigFromDB(db) {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get('keyConfig');
    getReq.onsuccess = () => {
        if (getReq.result) {
            keyConfig = getReq.result;
            for (let action in keyConfig) {
                const btn = document.getElementById(`cfg-${action}`);
                if (btn) btn.innerText = keyConfig[action];
            }
        }
    };
}

function saveConfigToDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(keyConfig, 'keyConfig');
    };
}

// ==========================================
// 3. ゲーム初期化 ＆ 5連NEXTバッグシステム
// ==========================================
function init() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    score = 0;
    lines = 0;
    level = 1;
    gameOver = false;
    holdPiece = null;
    hasHeld = false;
    nextQueue = [];
    renCount = -1;
    clearingLinesList = [];
    clearAnimTimer = 0;
    isClearingAnimation = false;
    resetLockTimerVariables();
    
    updateLabels();
    document.getElementById('speed-val').innerText = `Lv.${level}`;
    
    for (let i = 0; i < 6; i++) {
        refillNextQueueIfNeeded();
    }
    
    spawnPiece();
    drawSideCanvases();
    draw();
}

function refillNextQueueIfNeeded() {
    if (nextQueue.length < 10) {
        let bag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        bag.forEach(type => {
            nextQueue.push({
                type: type,
                matrix: JSON.parse(JSON.stringify(SHAPES[type])),
                x: Math.floor((COLS - SHAPES[type][0].length) / 2),
                y: type === 'I' ? -1 : 0,
                rotation: 0
            });
        });
    }
}

function spawnPiece() {
    refillNextQueueIfNeeded();
    currentPiece = nextQueue.shift(); 
    hasHeld = false;
    isLastMoveRotation = false;
    resetLockTimerVariables();

    if (checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y)) {
        endGame();
    }
    checkGroundedStatus();
}

// ==========================================
// 4. 接地猶予(Lock Delay)ロジック
// ==========================================
function resetLockTimerVariables() {
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    lockResetCount = 0;
    isGrounded = false;
}

function checkGroundedStatus() {
    if (!currentPiece || isClearingAnimation) return;
    const groundedNow = checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1);
    
    if (groundedNow) {
        if (!isGrounded) {
            isGrounded = true;
            startLockTimer();
        }
    } else {
        if (isGrounded) {
            isGrounded = false;
            if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
        }
    }
}

function startLockTimer() {
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
        if (!isPaused && !gameOver && isGrounded && !isClearingAnimation) {
            lockPiece(); 
        }
    }, LOCK_DELAY);
}

function handleLockDelayReset() {
    if (isGrounded) {
        if (lockResetCount < MAX_LOCK_RESETS) {
            lockResetCount++;
            startLockTimer(); 
        }
    }
}

// ==========================================
// 5. アニメーション ＆ 特殊エフェクト生成
// ==========================================
function createEffectText(text, className) {
    const overlay = document.getElementById('effect-overlay');
    const div = document.createElement('div');
    div.className = `action-text ${className}`;
    div.innerText = text;
    overlay.appendChild(div);
    setTimeout(() => div.remove(), text.includes("ALL CLEAR") ? 1500 : 800);
}

function triggerScreenShake(isHeavy = false) {
    canvas.classList.remove('shake', 'shake-massive');
    void canvas.offsetWidth; 
    canvas.classList.add(isHeavy ? 'shake-massive' : 'shake');
}

function triggerTSpinRotationFeedback() {
    canvas.classList.remove('shake', 'tspin-flash');
    void canvas.offsetWidth;
    canvas.classList.add('shake', 'tspin-flash');
    setTimeout(() => {
        canvas.classList.remove('tspin-flash');
    }, 60);
}

function triggerAllClearFlash() {
    canvas.classList.remove('ac-flash');
    void canvas.offsetWidth;
    canvas.classList.add('ac-flash');
}

// ==========================================
// 6. メインループ ＆ 入力ポーリング
// ==========================================
function startGameLoop() {
    if (mainLoopInterval) clearInterval(mainLoopInterval);
    lastDropTime = Date.now();
    
    mainLoopInterval = setInterval(() => {
        if (!isPaused && !gameOver) {
            if (!isClearingAnimation) {
                handleInputPolling();
                handleAutomaticDrop();
            }
            draw();
        }
    }, 1000 / 60);
}

function handleInputPolling() {
    if (isClearingAnimation || !currentPiece) return;
    const now = Date.now();

    if (keysPressed[keyConfig.moveLeft]) {
        if (keyTimers.moveLeft.start === 0) {
            moveLeft(); keyTimers.moveLeft.start = now; keyTimers.moveLeft.lastTrigger = now;
        } else {
            if (now - keyTimers.moveLeft.start >= DAS_DELAY) {
                if (now - keyTimers.moveLeft.lastTrigger >= ARR_DELAY) {
                    moveLeft(); keyTimers.moveLeft.lastTrigger = now;
                }
            }
        }
    } else { keyTimers.moveLeft.start = 0; }

    if (keysPressed[keyConfig.moveRight]) {
        if (keyTimers.moveRight.start === 0) {
            moveRight(); keyTimers.moveRight.start = now; keyTimers.moveRight.lastTrigger = now;
        } else {
            if (now - keyTimers.moveRight.start >= DAS_DELAY) {
                if (now - keyTimers.moveRight.lastTrigger >= ARR_DELAY) {
                    moveRight(); keyTimers.moveRight.lastTrigger = now;
                }
            }
        }
    } else { keyTimers.moveRight.start = 0; }

    if (keysPressed[keyConfig.softDrop]) {
        if (keyTimers.softDrop.start === 0) {
            softDrop(); keyTimers.softDrop.start = now; keyTimers.softDrop.lastTrigger = now;
        } else {
            if (now - keyTimers.softDrop.lastTrigger >= SOFT_DROP_DELAY) {
                softDrop(); keyTimers.softDrop.lastTrigger = now;
            }
        }
    } else { keyTimers.softDrop.start = 0; }

    if (keysPressed[keyConfig.hardDrop] && !keyActionsTriggered.hardDrop) {
        hardDrop(); keyActionsTriggered.hardDrop = true;
    }
    if (keysPressed[keyConfig.rotRight] && !keyActionsTriggered.rotRight) {
        rotate('right'); keyActionsTriggered.rotRight = true;
    }
    if (keysPressed[keyConfig.rotLeft] && !keyActionsTriggered.rotLeft) {
        rotate('left'); keyActionsTriggered.rotLeft = true;
    }
    if (keysPressed[keyConfig.hold] && !keyActionsTriggered.hold) {
        hold(); keyActionsTriggered.hold = true;
    }
}

function handleAutomaticDrop() {
    if (isClearingAnimation || !currentPiece) return;
    const now = Date.now();
    let dropInterval = Math.max(50, 1000 - (level - 1) * 100); 
    
    if (now - lastDropTime > dropInterval) {
        if (!isGrounded) {
            moveDrop();
        }
        lastDropTime = now;
    }
}

// ==========================================
// 7. 物理・移動処理 (T-Spin/ライン消去ロジック)
// ==========================================
function checkCollision(matrix, offsetXZ, offsetY) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let newX = offsetXZ + c;
                let newY = offsetY + r;
                if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
                if (newY >= 0 && board[newY][newX]) return true;
            }
        }
    }
    return false;
}

function moveLeft() {
    if (!checkCollision(currentPiece.matrix, currentPiece.x - 1, currentPiece.y)) {
        currentPiece.x--; isLastMoveRotation = false;
        checkGroundedStatus();
        handleLockDelayReset();
    }
}

function moveRight() {
    if (!checkCollision(currentPiece.matrix, currentPiece.x + 1, currentPiece.y)) {
        currentPiece.x++; isLastMoveRotation = false;
        checkGroundedStatus();
        handleLockDelayReset();
    }
}

function moveDrop() {
    if (!checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1)) {
        currentPiece.y++; isLastMoveRotation = false;
        checkGroundedStatus();
    } else {
        checkGroundedStatus();
    }
}

function softDrop() {
    if (!checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1)) {
        currentPiece.y++; score += 1; isLastMoveRotation = false; updateLabels();
        checkGroundedStatus();
    } else {
        checkGroundedStatus();
    }
}

function hardDrop() {
    if (isClearingAnimation || !currentPiece) return;
    let dropDist = 0;
    while (!checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1)) {
        currentPiece.y++; dropDist++;
    }
    score += dropDist * 2;
    lockPiece(); 
}

function hold() {
    if (hasHeld || isClearingAnimation || !currentPiece) return;
    const currentType = currentPiece.type;
    resetLockTimerVariables();
    
    if (holdPiece === null) {
        holdPiece = currentType; spawnPiece();
    } else {
        const tmp = holdPiece; holdPiece = currentType;
        currentPiece = {
            type: tmp, matrix: JSON.parse(JSON.stringify(SHAPES[tmp])),
            x: Math.floor((COLS - SHAPES[tmp][0].length) / 2), y: tmp === 'I' ? -1 : 0, rotation: 0
        };
        checkGroundedStatus();
    }
    hasHeld = true; isLastMoveRotation = false;
    drawSideCanvases();
}

function rotate(dir) {
    if (isClearingAnimation || !currentPiece) return;
    const matrix = currentPiece.matrix;
    const N = matrix.length;
    let rotated = Array.from({length: N}, () => Array(N).fill(0));
    
    if (dir === 'right') {
        for (let r = 0; r < N; r++) { for (let c = 0; c < N; c++) { rotated[c][N - 1 - r] = matrix[r][c]; } }
    } else {
        for (let r = 0; r < N; r++) { for (let c = 0; c < N; c++) { rotated[N - 1 - c][r] = matrix[r][c]; } }
    }

    const currentRot = currentPiece.rotation;
    let nextRot = dir === 'right' ? (currentRot + 1) % 4 : (currentRot + 3) % 4;
    const key = `${currentRot}->${nextRot}`;
    const kicks = currentPiece.type === 'I' ? KICK_DATA_I[key] : KICK_DATA[key];

    if (kicks) {
        for (let i = 0; i < kicks.length; i++) {
            const [kx, ky] = kicks[i];
            if (!checkCollision(rotated, currentPiece.x + kx, currentPiece.y - ky)) {
                currentPiece.matrix = rotated;
                currentPiece.x += kx; currentPiece.y -= ky; currentPiece.rotation = nextRot;
                isLastMoveRotation = true;
                checkGroundedStatus();
                handleLockDelayReset();

                if (checkTSpin()) {
                    triggerTSpinRotationFeedback();
                }
                return;
            }
        }
    }
}

function checkTSpin() {
    if (!currentPiece || currentPiece.type !== 'T' || !isLastMoveRotation) return false;
    const cx = currentPiece.x + 1; const cy = currentPiece.y + 1;
    let cornerCount = 0;
    const corners = [{x: cx-1, y: cy-1}, {x: cx+1, y: cy-1}, {x: cx-1, y: cy+1}, {x: cx+1, y: cy+1}];
    corners.forEach(p => {
        if (p.x < 0 || p.x >= COLS || p.y >= ROWS) cornerCount++;
        else if (p.y >= 0 && board[p.y][p.x]) cornerCount++;
    });
    return cornerCount >= 3;
}

function lockPiece() {
    if (gameOver || isClearingAnimation || !currentPiece) return;
    const m = currentPiece.matrix;
    const isTSpin = checkTSpin();
    
    resetLockTimerVariables(); 

    for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
            if (m[r][c]) {
                if (currentPiece.y + r < 0) { endGame(); return; }
                board[currentPiece.y + r][currentPiece.x + c] = currentPiece.type;
            }
        }
    }

    currentPiece = null; 
    clearLines(isTSpin);
    drawSideCanvases(); 
}

function clearLines(isTSpin) {
    let clearedIndices = [];
    for (let r = 0; r < ROWS; r++) {
        if (board[r].every(val => val !== 0)) {
            clearedIndices.push(r);
        }
    }
    const cleared = clearedIndices.length;

    if (cleared > 0) {
        isClearingAnimation = true; 
        renCount++;

        // 事前に全消しが起こるかを仮計算
        let tempBoard = board.filter((row, idx) => !clearedIndices.includes(idx));
        let willBeAllClear = tempBoard.every(row => row.every(val => val === 0));

        // 主要エフェクト表示
        if (willBeAllClear) {
            // 全消し時はT-SpinやTetrisの文字すら出さず、ALL CLEAR単独に集約
            createEffectText("ALL CLEAR!", "txt-allclear");
            score += 3000 * level; 
        } else {
            if (isTSpin) {
                if (cleared === 1) { createEffectText("T-SPIN SINGLE", "txt-tspin"); score += 800 * level; }
                else if (cleared === 2) { createEffectText("T-SPIN DOUBLE", "txt-tspin"); score += 1200 * level; triggerScreenShake(); }
                else if (cleared === 3) { createEffectText("T-SPIN TRIPLE", "txt-tspin"); score += 1600 * level; triggerScreenShake(); }
            } else if (cleared === 4) {
                createEffectText("TETRIS!", "txt-tetris"); score += 800 * level; triggerScreenShake();
            } else {
                const lineScores = [0, 100, 300, 500]; score += lineScores[cleared] * level;
            }
            
            // 【重要】全消しではない時のみ、RENの文字を重ねて表示する
            if (renCount > 0) { 
                createEffectText(`${renCount} REN!`, "txt-ren"); 
                score += renCount * 50 * level; 
            }
        }

        clearingLinesList = [...clearedIndices];
        clearAnimTimer = 8;
        draw();

        setTimeout(() => {
            let filteredBoard = board.filter((row, idx) => !clearedIndices.includes(idx));
            while (filteredBoard.length < ROWS) {
                filteredBoard.unshift(Array(COLS).fill(0));
            }
            board = filteredBoard;
            
            clearingLinesList = [];
            lines += cleared;
            updateLabels(); 
            updateSpeed(); 

            if (willBeAllClear) {
                triggerScreenShake(true); 
                triggerAllClearFlash();   
                updateLabels();
                
                setTimeout(() => {
                    isClearingAnimation = false;
                    spawnPiece();
                    draw();
                }, 450); // 演出をしっかり見せるための猶予
            } else {
                isClearingAnimation = false; 
                spawnPiece();
                draw(); 
            }
        }, 130);
    } else {
        renCount = -1;
        if (isTSpin) { createEffectText("T-SPIN", "txt-tspin"); score += 400 * level; }
        isClearingAnimation = false;
        spawnPiece();
        draw();
    }
}

// ==========================================
// 8. システム制御 ＆ スピード ＆ リトライ
// ==========================================
function updateSpeed() {
    let calculatedLevel = Math.floor(elapsedSeconds / 60) + Math.floor(lines / 10) + 1;
    if (calculatedLevel > level) {
        level = calculatedLevel;
        document.getElementById('speed-val').innerText = `Lv.${level}`;
    }
}

function togglePause() {
    if (gameOver) { resetGame(); return; }
    isPaused = !isPaused;
    const btn = document.getElementById('start-btn');
    
    if (!isPaused) {
        btn.innerText = "PAUSE"; btn.style.background = "#dc3545";
        createEffectText("GO!", "txt-system");
        startTime = Date.now() - (elapsedSeconds * 1000);
        timerInterval = setInterval(() => {
            elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            let mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
            let secs = String(elapsedSeconds % 60).padStart(2, '0');
            document.getElementById('timer-val').innerText = `${mins}:${secs}`;
            updateSpeed();
        }, 1000);
        startGameLoop();
    } else {
        btn.innerText = "START"; btn.style.background = "#28a745";
        createEffectText("PAUSE", "txt-system");
        if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; } 
        clearInterval(timerInterval); clearInterval(mainLoopInterval);
        draw();
    }
}

function endGame() {
    gameOver = true; isPaused = true;
    resetLockTimerVariables();
    clearInterval(timerInterval); clearInterval(mainLoopInterval);
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-screen').style.display = 'block';
}

function resetGame() {
    clearInterval(timerInterval); 
    clearInterval(mainLoopInterval);
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }

    document.getElementById('game-over-screen').style.display = 'none';
    elapsedSeconds = 0; 
    document.getElementById('timer-val').innerText = "00:00";
    
    init(); 
    
    isPaused = true; 
    togglePause(); 
}

function updateLabels() {
    document.getElementById('score-val').innerText = score;
    document.getElementById('lines-val').innerText = lines;
}

// ==========================================
// 9. 描画処理
// ==========================================
function drawBlock(targetCtx, x, y, type) {
    targetCtx.fillStyle = COLORS[type];
    targetCtx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    targetCtx.strokeStyle = 'rgba(0,0,0,0.3)'; targetCtx.lineWidth = 2;
    targetCtx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
    for(let i=0; i<=COLS; i++) { ctx.beginPath(); ctx.moveTo(i*BLOCK_SIZE, 0); ctx.lineTo(i*BLOCK_SIZE, canvas.height); ctx.stroke(); }
    for(let j=0; j<=ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j*BLOCK_SIZE); ctx.lineTo(canvas.width, j*BLOCK_SIZE); ctx.stroke(); }

    for (let r = 0; r < ROWS; r++) {
        if (clearingLinesList.includes(r) && clearAnimTimer > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${clearAnimTimer / 8})`;
            ctx.fillRect(0, r * BLOCK_SIZE, canvas.width, BLOCK_SIZE);
            continue;
        }
        for (let c = 0; c < COLS; c++) { if (board[r][c]) drawBlock(ctx, c, r, board[r][c]); }
    }
    if (clearAnimTimer > 0) clearAnimTimer--;

    if (isPaused && !gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; 
    }
    if (!currentPiece || gameOver) return;

    if (isClearingAnimation) return;

    let ghostY = currentPiece.y;
    while (!checkCollision(currentPiece.matrix, currentPiece.x, ghostY + 1)) { ghostY++; }
    ctx.globalAlpha = 0.15;
    for (let r = 0; r < currentPiece.matrix.length; r++) {
        for (let c = 0; c < currentPiece.matrix[r].length; c++) {
            if (currentPiece.matrix[r][c]) drawBlock(ctx, currentPiece.x + c, ghostY + r, currentPiece.type);
        }
    }
    ctx.globalAlpha = 1.0;

    for (let r = 0; r < currentPiece.matrix.length; r++) {
        for (let c = 0; c < currentPiece.matrix[r].length; c++) {
            if (currentPiece.matrix[r][c] && currentPiece.y + r >= 0) {
                drawBlock(ctx, currentPiece.x + c, currentPiece.y + r, currentPiece.type);
            }
        }
    }
}

function drawSideCanvases() {
    hCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (holdPiece) {
        const m = SHAPES[holdPiece]; const offset = (4 - m.length) / 2;
        for(let r=0; r<m.length; r++) {
            for(let c=0; c<m[r].length; c++) { if(m[r][c]) drawBlock(hCtx, c + offset, r + offset, holdPiece); }
        }
    }
    
    nCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const MINI_BLOCK = 20;
    
    for (let i = 0; i < 5; i++) {
        if (!nextQueue[i]) break;
        const p = nextQueue[i];
        const m = SHAPES[p.type];
        
        const startY = i * 80 + 10;
        const offset = (4 - m.length) / 2;

        nCtx.fillStyle = COLORS[p.type];
        for(let r=0; r<m.length; r++) {
            for(let c=0; c<m[r].length; c++) {
                if(m[r][c]) {
                    const bx = (c + offset) * MINI_BLOCK + 10;
                    const by = (r + offset) * MINI_BLOCK + startY;
                    nCtx.fillRect(bx, by, MINI_BLOCK, MINI_BLOCK);
                    nCtx.strokeStyle = 'rgba(0,0,0,0.3)';
                    nCtx.lineWidth = 1;
                    nCtx.strokeRect(bx, by, MINI_BLOCK, MINI_BLOCK);
                }
            }
        }
    }
}

// ==========================================
// 10. キーボードイベント ＆ カスタム設定
// ==========================================
function changeKey(action) {
    currentKeyToConfig = action;
    const btn = document.getElementById(`cfg-${action}`);
    btn.innerText = "入力待ち..."; btn.style.background = "#ff5555";
}

window.addEventListener('keydown', (e) => {
    if (currentKeyToConfig) {
        e.preventDefault();
        keyConfig[currentKeyToConfig] = e.code;
        const btn = document.getElementById(`cfg-${currentKeyToConfig}`);
        btn.innerText = e.code; btn.style.background = "#555";
        currentKeyToConfig = null;
        saveConfigToDB(); 
        return;
    }
    if (isPaused || gameOver || isClearingAnimation) return; 
    if (Object.values(keyConfig).includes(e.code)) e.preventDefault();
    keysPressed[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    delete keysPressed[e.code];
    if (e.code === keyConfig.hardDrop) keyActionsTriggered.hardDrop = false;
    if (e.code === keyConfig.rotRight)  keyActionsTriggered.rotRight = false;
    if (e.code === keyConfig.rotLeft)   keyActionsTriggered.rotLeft = false;
    if (e.code === keyConfig.hold)      keyActionsTriggered.hold = false;
});

initDB();
init();