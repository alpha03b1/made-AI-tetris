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

// テトリミノの形状定義
const SHAPES = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
    ],
    O: [
        [1, 1],
        [1, 1]
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
    ]
};

// テトリミノのカラー定義
const COLORS = {
    I: '#00f0f0',
    J: '#0000f0',
    L: '#f0a000',
    O: '#f0f000',
    S: '#00f000',
    T: '#a000f0',
    Z: '#f00000'
};

// SRS (Super Rotation System) 壁蹴りデータ
const KICK_DATA = {
    "0->1": [[0, 0], [-1, 0], [-1,  1], [0, -2], [-1, -2]],
    "1->0": [[0, 0], [ 1, 0], [ 1, -1], [0,  2], [ 1,  2]],
    "1->2": [[0, 0], [ 1, 0], [ 1, -1], [0,  2], [ 1,  2]],
    "2->1": [[0, 0], [-1, 0], [-1,  1], [0, -2], [-1, -2]],
    "2->3": [[0, 0], [ 1, 0], [ 1,  1], [0, -2], [ 1, -2]],
    "3->2": [[0, 0], [-1, 0], [-1, -1], [0,  2], [-1,  2]],
    "3->0": [[0, 0], [-1, 0], [-1, -1], [0,  2], [-1,  2]],
    "0->3": [[0, 0], [ 1, 0], [ 1,  1], [0, -2], [ 1, -2]]
};

const KICK_DATA_I = {
    "0->1": [[0, 0], [-2, 0], [ 1, 0], [-2, -1], [ 1,  2]],
    "1->0": [[0, 0], [ 2, 0], [-1, 0], [ 2,  1], [-1, -2]],
    "1->2": [[0, 0], [-1, 0], [ 2, 0], [-1,  2], [ 2, -1]],
    "2->1": [[0, 0], [ 1, 0], [-2, 0], [ 1, -2], [-2,  1]],
    "2->3": [[0, 0], [ 2, 0], [-1, 0], [ 2,  1], [-1, -2]],
    "3->2": [[0, 0], [-2, 0], [ 1, 0], [-2, -1], [ 1,  2]],
    "3->0": [[0, 0], [ 1, 0], [-2, 0], [ 1, -2], [-2,  1]],
    "0->3": [[0, 0], [-1, 0], [-2, 0], [-1,  2], [-2, -1]]
};

// キーコンフィグ変数
let DEFAULT_KB_CONFIG = {};
let DEFAULT_GP_CONFIG = {};
let kbConfig = {};
let gpConfig = {};

const CANCEL_KEY = 'Escape';
const CANCEL_GP_BUTTON = 'B8';

// 操作ディレイ設定 (DAS / ARR)
const DAS_DELAY = 170;      
const ARR_DELAY = 30;       
const SOFT_DROP_DELAY = 40; 

// 固定ディレイ (Lock Delay)
const LOCK_DELAY = 500;     
const MAX_LOCK_RESETS = 15; 
let lockTimer = null;       
let lockResetCount = 0;     
let isGrounded = false;     

// 入力状態管理
const keysPressed = {};
const gpButtonsPressed = {};

// 単発入力フラグとリピートタイマー
const actionsTriggered = { hardDrop: false, rotRight: false, rotLeft: false, hold: false };
const actionTimers = {
    moveLeft: { start: 0, lastTrigger: 0 },
    moveRight: { start: 0, lastTrigger: 0 },
    softDrop: { start: 0, lastTrigger: 0 }
};

let gpPauseTriggered = false;

// ゲームフィールド・変数
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
let isCountingDown = false; // カウントダウン中フラグ
let isClearingAnimation = false; 

// 特殊役判定用変数
let renCount = -1;
let isLastMoveRotation = false;
let clearingLinesList = [];
let clearAnimTimer = 0;

// タイマー用変数
let startTime = 0;
let elapsedSeconds = 0;
let mainLoopInterval = null;
let timerInterval = null;
let lastDropTime = 0;

// キーコンフィグ設定状態
let configState = {
    active: false,
    action: null,   
    type: null,     
    timer: null,
    timeLeft: 10
};

// 特殊演出用変数
let hardDropEffectTimer = 0;
let hardDropColumns = [];

const STICK_THRESHOLD = 0.5;
const DB_NAME = 'TetrisConfigDB_v3';
const STORE_NAME = 'settings';

// ==========================================
// 2. config.json の読み込み & DB初期化
// ==========================================
async function loadExternalConfigAndInit() {
    try {
        const response = await fetch('config.json');
        const configData = await response.json();
        DEFAULT_KB_CONFIG = configData.DEFAULT_KB_CONFIG;
        DEFAULT_GP_CONFIG = configData.DEFAULT_GP_CONFIG;
    } catch (error) {
        console.warn("config.json 読込失敗。標準設定を内部生成します。");
        DEFAULT_KB_CONFIG = { 
            moveLeft: ['ArrowLeft'], 
            moveRight: ['ArrowRight'], 
            softDrop: ['ArrowDown'], 
            hardDrop: ['ArrowUp'], 
            rotRight: ['KeyX'], 
            rotLeft: ['KeyZ'], 
            hold: ['KeyC'] 
        };
        DEFAULT_GP_CONFIG = { 
            moveLeft: ['B14', 'LX-'], 
            moveRight: ['B15', 'LX+'], 
            softDrop: ['B13', 'LY+'], 
            hardDrop: ['B12'], 
            rotRight: ['B1'], 
            rotLeft: ['B0'], 
            hold: ['B4', 'B5'] 
        };
    }

    kbConfig = JSON.parse(JSON.stringify(DEFAULT_KB_CONFIG));
    gpConfig = JSON.parse(JSON.stringify(DEFAULT_GP_CONFIG));

    initDB();
}

function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => { 
        e.target.result.createObjectStore(STORE_NAME); 
    };
    request.onsuccess = (e) => { 
        loadConfigFromDB(e.target.result); 
    };
}

function loadConfigFromDB(db) {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getKb = store.get('kbConfig');
    const getGp = store.get('gpConfig');

    let loaded = 0;
    const checkRender = () => {
        loaded++;
        if (loaded === 2) { 
            renderConfigUI(); 
            init(); 
            startGameLoop(); 
        }
    };
    getKb.onsuccess = () => { if (getKb.result) kbConfig = getKb.result; checkRender(); };
    getGp.onsuccess = () => { if (getGp.result) gpConfig = getGp.result; checkRender(); };
}

function saveConfigToDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = (e) => {
        const tx = e.target.result.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(kbConfig, 'kbConfig'); 
        store.put(gpConfig, 'gpConfig');
    };
}

window.clearAllKeyConfigs = function() {
    if (configState.active) cancelConfig();
    kbConfig = JSON.parse(JSON.stringify(DEFAULT_KB_CONFIG));
    gpConfig = JSON.parse(JSON.stringify(DEFAULT_GP_CONFIG));
    saveConfigToDB(); 
    renderConfigUI();
    createEffectText("RESET KEYS", "txt-system");
};

function renderConfigUI() {
    const actions = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotRight', 'rotLeft', 'hold'];
    
    actions.forEach(action => {
        const kbBtn = document.getElementById(`cfg-kb-${action}`);
        if (kbBtn) { 
            kbBtn.innerText = kbConfig[action].join(', ') || 'なし'; 
            kbBtn.className = "key-btn text-left"; 
        }
        const gpBtn = document.getElementById(`cfg-gp-${action}`);
        if (gpBtn) { 
            gpBtn.innerText = gpConfig[action].join(', ') || 'なし'; 
            gpBtn.className = "key-btn"; 
        }
    });
}

// ==========================================
// 3. ゲーム初期化＆ミノ生成
// ==========================================
function init() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    score = 0; 
    lines = 0; 
    level = 1; 
    gameOver = false; 
    holdPiece = null; 
    hasHeld = false; 
    currentPiece = null;
    nextQueue = []; 
    renCount = -1; 
    clearingLinesList = []; 
    clearAnimTimer = 0; 
    isClearingAnimation = false; 
    hardDropEffectTimer = 0; 
    hardDropColumns = [];
    isCountingDown = false;
    
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
    
    const holdCanvasEl = document.getElementById('hold-canvas');
    if (holdCanvasEl) { 
        holdCanvasEl.classList.remove('disabled'); 
    }
    if (checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y)) { 
        endGame(); 
    }
    checkGroundedStatus();
}

function resetLockTimerVariables() { 
    if (lockTimer) { 
        clearTimeout(lockTimer); 
        lockTimer = null; 
    } 
    lockResetCount = 0; 
    isGrounded = false; 
}

function checkGroundedStatus() {
    if (!currentPiece || isClearingAnimation || isCountingDown) return;
    const groundedNow = checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1);
    if (groundedNow) { 
        if (!isGrounded) { 
            isGrounded = true; 
            startLockTimer(); 
        } 
    } else { 
        if (isGrounded) { 
            isGrounded = false; 
            if (lockTimer) { 
                clearTimeout(lockTimer); 
                lockTimer = null; 
            } 
        } 
    }
}

function startLockTimer() {
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { 
        if (!isPaused && !gameOver && isGrounded && !isClearingAnimation && !isCountingDown) { 
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
    setTimeout(() => { canvas.classList.remove('tspin-flash'); }, 60);
}

function triggerAllClearFlash() { 
    canvas.classList.remove('ac-flash'); 
    void canvas.offsetWidth; 
    canvas.classList.add('ac-flash'); 
}

// ==========================================
// 4. メインループ & 入力ポーリング
// ==========================================
function startGameLoop() {
    if (mainLoopInterval) clearInterval(mainLoopInterval);
    lastDropTime = Date.now();
    mainLoopInterval = setInterval(() => {
        pollGamepadInput(); 
        if (!isPaused && !gameOver && !isClearingAnimation && !isCountingDown) { 
            handleInputPolling(); 
            handleAutomaticDrop(); 
        }
        draw();
    }, 1000 / 60);
}

function pollGamepadInput() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < gamepads.length; i++) { if (gamepads[i]) { gp = gamepads[i]; break; } }
    if (!gp) return;

    const currentFrameInputs = {};
    for (let i = 0; i < gp.buttons.length; i++) { 
        if (gp.buttons[i].pressed) { 
            currentFrameInputs[`B${i}`] = true; 
        } 
    }

    if (gp.axes && gp.axes.length >= 2) {
        const lx = gp.axes[0]; 
        const ly = gp.axes[1];
        if (lx < -STICK_THRESHOLD) currentFrameInputs['LX-'] = true;
        if (lx > STICK_THRESHOLD)  currentFrameInputs['LX+'] = true;
        if (ly > STICK_THRESHOLD)  currentFrameInputs['LY+'] = true;
        if (ly < -STICK_THRESHOLD) currentFrameInputs['LY-'] = true;
    }

    if (configState.active && configState.type === 'gp') {
        const pressedKeys = Object.keys(currentFrameInputs);
        if (pressedKeys.length > 0) {
            const firstInput = pressedKeys[0];
            if (firstInput === CANCEL_GP_BUTTON) { 
                cancelConfig(); 
            } else { 
                assignGamepadConfig(firstInput); 
            }
            return; 
        }
        return;
    }

    if (isCountingDown) return;

    if (gameOver && !configState.active) {
        if (currentFrameInputs['B0']) { 
            resetGame(); 
            return; 
        }
    }

    if (isPaused && !gameOver && !configState.active) {
        if (currentFrameInputs['B3']) { 
            resetGame(); 
            return; 
        }
    }

    for (let btnId in gpButtonsPressed) { delete gpButtonsPressed[btnId]; }
    for (let inputId in currentFrameInputs) { gpButtonsPressed[inputId] = true; }

    if (gp.buttons[9] && gp.buttons[9].pressed) {
        if (!gpPauseTriggered) { 
            togglePause(); 
            gpPauseTriggered = true; 
        }
    } else { 
        gpPauseTriggered = false; 
    }
}

function isActionPressed(action) {
    const kbs = kbConfig[action] || [];
    for (let key of kbs) { if (keysPressed[key]) return true; }
    const gps = gpConfig[action] || [];
    for (let btn of gps) { if (gpButtonsPressed[btn]) return true; }
    return false;
}

function handleInputPolling() {
    if (isClearingAnimation || !currentPiece || isCountingDown) return;
    const now = Date.now();

    if (isActionPressed('moveLeft')) {
        if (actionTimers.moveLeft.start === 0) { 
            moveLeft(); 
            actionTimers.moveLeft.start = now; 
            actionTimers.moveLeft.lastTrigger = now; 
        } else if (now - actionTimers.moveLeft.start >= DAS_DELAY && now - actionTimers.moveLeft.lastTrigger >= ARR_DELAY) { 
            moveLeft(); 
            actionTimers.moveLeft.lastTrigger = now; 
        }
    } else { 
        actionTimers.moveLeft.start = 0; 
    }

    if (isActionPressed('moveRight')) {
        if (actionTimers.moveRight.start === 0) { 
            moveRight(); 
            actionTimers.moveRight.start = now; 
            actionTimers.moveRight.lastTrigger = now; 
        } else if (now - actionTimers.moveRight.start >= DAS_DELAY && now - actionTimers.moveRight.lastTrigger >= ARR_DELAY) { 
            moveRight(); 
            actionTimers.moveRight.lastTrigger = now; 
        }
    } else { 
        actionTimers.moveRight.start = 0; 
    }

    if (isActionPressed('softDrop')) {
        if (actionTimers.softDrop.start === 0) { 
            softDrop(); 
            actionTimers.softDrop.start = now; 
            actionTimers.softDrop.lastTrigger = now; 
        } else if (now - actionTimers.softDrop.lastTrigger >= SOFT_DROP_DELAY) { 
            softDrop(); 
            actionTimers.softDrop.lastTrigger = now; 
        }
    } else { 
        actionTimers.softDrop.start = 0; 
    }

    if (isActionPressed('hardDrop')) { 
        if (!actionsTriggered.hardDrop) { 
            hardDrop(); 
            actionsTriggered.hardDrop = true; 
        } 
    } else { 
        actionsTriggered.hardDrop = false; 
    }

    if (isActionPressed('rotRight')) { 
        if (!actionsTriggered.rotRight) { 
            rotate('right'); 
            actionsTriggered.rotRight = true; 
        } 
    } else { 
        actionsTriggered.rotRight = false; 
    }

    if (isActionPressed('rotLeft')) { 
        if (!actionsTriggered.rotLeft) { 
            rotate('left'); 
            actionsTriggered.rotLeft = true; 
        } 
    } else { 
        actionsTriggered.rotLeft = false; 
    }

    if (isActionPressed('hold')) { 
        if (!actionsTriggered.hold) { 
            hold(); 
            actionsTriggered.hold = true; 
        } 
    } else { 
        actionsTriggered.hold = false; 
    }
}

function handleAutomaticDrop() {
    if (isClearingAnimation || !currentPiece || isCountingDown) return;
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
// 5. 物理・ゲームロジック
// ==========================================
function checkCollision(matrix, offsetX, offsetY) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let newX = offsetX + c; 
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
        currentPiece.x--; 
        isLastMoveRotation = false; 
        checkGroundedStatus(); 
        handleLockDelayReset(); 
    } 
}

function moveRight() { 
    if (!checkCollision(currentPiece.matrix, currentPiece.x + 1, currentPiece.y)) { 
        currentPiece.x++; 
        isLastMoveRotation = false; 
        checkGroundedStatus(); 
        handleLockDelayReset(); 
    } 
}

function moveDrop() { 
    if (!checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1)) { 
        currentPiece.y++; 
        isLastMoveRotation = false; 
        checkGroundedStatus(); 
    } else { 
        checkGroundedStatus(); 
    } 
}

function softDrop() { 
    if (!checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1)) { 
        currentPiece.y++; 
        score += 1; 
        isLastMoveRotation = false; 
        updateLabels(); 
        checkGroundedStatus(); 
    } else { 
        checkGroundedStatus(); 
    } 
}

function hardDrop() { 
    if (isClearingAnimation || !currentPiece || isCountingDown) return; 
    hardDropColumns = [];
    for (let r = 0; r < currentPiece.matrix.length; r++) {
        for (let c = 0; c < currentPiece.matrix[r].length; c++) { 
            if (currentPiece.matrix[r][c]) { 
                const colX = currentPiece.x + c; 
                if (!hardDropColumns.includes(colX)) { 
                    hardDropColumns.push(colX); 
                } 
            } 
        }
    }
    hardDropEffectTimer = 6;
    let dropDist = 0; 
    while (!checkCollision(currentPiece.matrix, currentPiece.x, currentPiece.y + 1)) { 
        currentPiece.y++; 
        dropDist++; 
    } 
    score += dropDist * 2; 
    lockPiece(); 
}

function hold() {
    if (hasHeld || isClearingAnimation || !currentPiece || isCountingDown) return;
    const currentType = currentPiece.type; 
    resetLockTimerVariables();
    const holdCanvasEl = document.getElementById('hold-canvas');
    if (holdCanvasEl) { 
        holdCanvasEl.classList.add('disabled'); 
    }

    if (holdPiece === null) { 
        holdPiece = currentType; 
        spawnPiece(); 
    } else {
        const tmp = holdPiece; 
        holdPiece = currentType;
        currentPiece = { 
            type: tmp, 
            matrix: JSON.parse(JSON.stringify(SHAPES[tmp])), 
            x: Math.floor((COLS - SHAPES[tmp][0].length) / 2), 
            y: tmp === 'I' ? -1 : 0, 
            rotation: 0 
        };
        checkGroundedStatus();
    }
    hasHeld = true; 
    isLastMoveRotation = false; 
    drawSideCanvases();
}

function rotate(dir) {
    if (isClearingAnimation || !currentPiece || isCountingDown) return;
    const matrix = currentPiece.matrix; 
    const N = matrix.length;
    let rotated = Array.from({length: N}, () => Array(N).fill(0));
    
    if (dir === 'right') { 
        for (let r = 0; r < N; r++) { 
            for (let c = 0; c < N; c++) { rotated[c][N - 1 - r] = matrix[r][c]; } 
        } 
    } else { 
        for (let r = 0; r < N; r++) { 
            for (let c = 0; c < N; c++) { rotated[N - 1 - c][r] = matrix[r][c]; } 
        } 
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
                currentPiece.x += kx; 
                currentPiece.y -= ky; 
                currentPiece.rotation = nextRot;
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
    const cx = currentPiece.x + 1; 
    const cy = currentPiece.y + 1;
    let cornerCount = 0;
    const corners = [
        {x: cx - 1, y: cy - 1}, 
        {x: cx + 1, y: cy - 1}, 
        {x: cx - 1, y: cy + 1}, 
        {x: cx + 1, y: cy + 1}
    ];
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
                if (currentPiece.y + r < 0) { 
                    endGame(); 
                    return; 
                } 
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
        let tempBoard = board.filter((row, idx) => !clearedIndices.includes(idx));
        let willBeAllClear = tempBoard.every(row => row.every(val => val === 0));

        if (willBeAllClear) { 
            createEffectText("ALL CLEAR!", "txt-allclear"); 
            score += 3000 * level; 
        } else {
            if (isTSpin) {
                if (cleared === 1) { createEffectText("T-SPIN SINGLE", "txt-tspin"); score += 800 * level; }
                else if (cleared === 2) { createEffectText("T-SPIN DOUBLE", "txt-tspin"); score += 1200 * level; triggerScreenShake(); }
                else if (cleared === 3) { createEffectText("T-SPIN TRIPLE", "txt-tspin"); score += 1600 * level; triggerScreenShake(); }
            } else if (cleared === 4) { 
                createEffectText("TETRIS!", "txt-tetris"); 
                score += 800 * level; 
                triggerScreenShake(); 
            } else { 
                const lineScores = [0, 100, 300, 500]; 
                score += lineScores[cleared] * level; 
            }
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
            while (filteredBoard.length < ROWS) { filteredBoard.unshift(Array(COLS).fill(0)); }
            board = filteredBoard; 
            clearingLinesList = []; 
            lines += cleared; 
            updateLabels(); 
            updateSpeed(); 

            if (willBeAllClear) {
                triggerScreenShake(true); 
                triggerAllClearFlash(); 
                updateLabels();
                setTimeout(() => { isClearingAnimation = false; spawnPiece(); draw(); }, 450);
            } else { 
                isClearingAnimation = false; 
                spawnPiece(); 
                draw(); 
            }
        }, 130);
    } else { 
        renCount = -1; 
        if (isTSpin) { 
            createEffectText("T-SPIN", "txt-tspin"); 
            score += 400 * level; 
        } 
        isClearingAnimation = false; 
        spawnPiece(); 
        draw(); 
    }
}

// ==========================================
// 6. システム制御 ＆ ポーズ ＆ 全画面
// ==========================================
function updateSpeed() {
    let calculatedLevel = Math.floor(elapsedSeconds / 60) + Math.floor(lines / 10) + 1;
    if (calculatedLevel > level) { 
        level = calculatedLevel; 
        document.getElementById('speed-val').innerText = `Lv.${level}`; 
    }
}

window.togglePause = function() {
    if (gameOver || isCountingDown) return; 
    isPaused = !isPaused;
    const btn = document.getElementById('start-btn');
    const pauseModal = document.getElementById('pause-screen');
    
    if (!isPaused) {
        btn.innerText = "PAUSE"; 
        btn.style.background = "#dc3545"; 
        pauseModal.style.display = "none";
        
        runStartCountdown();
    } else {
        btn.innerText = "START"; 
        btn.style.background = "#28a745"; 
        pauseModal.style.display = "flex";
        createEffectText("PAUSE", "txt-system"); 
        if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; } 
        clearInterval(timerInterval);
        drawSideCanvases(); // ポーズ中にNEXT/HOLDを隠す
    }
};

// 3, 2, 1 カウントダウン制御関数
function runStartCountdown() {
    isCountingDown = true;
    let count = 3;
    
    // カウントダウンが始まった瞬間にNEXT/HOLDを描画して見えるようにする！
    drawSideCanvases();

    const intervalTime = 500; // 0.5秒間隔
    createEffectText(String(count), "txt-system");
    
    const countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
            createEffectText(String(count), "txt-system");
        } else {
            clearInterval(countdownTimer);
            createEffectText("GO!", "txt-system");
            
            isCountingDown = false;
            lastDropTime = Date.now();
            startTime = Date.now() - (elapsedSeconds * 1000);
            
            timerInterval = setInterval(() => {
                elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
                let mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0'); 
                let secs = String(elapsedSeconds % 60).padStart(2, '0');
                document.getElementById('timer-val').innerText = `${mins}:${secs}`; 
                updateSpeed();
            }, 1000);

            drawSideCanvases();
        }
    }, intervalTime);
}

function endGame() {
    gameOver = true; 
    isPaused = true; 
    isCountingDown = false;
    resetLockTimerVariables(); 
    clearInterval(timerInterval);
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-screen').style.display = 'flex';
}

window.resetGame = function() {
    clearInterval(timerInterval); 
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'none';
    elapsedSeconds = 0; 
    document.getElementById('timer-val').innerText = "00:00";
    
    init(); 
    isPaused = false; 
    
    const btn = document.getElementById('start-btn');
    btn.innerText = "PAUSE"; 
    btn.style.background = "#dc3545"; 

    runStartCountdown();
};

function updateLabels() { 
    document.getElementById('score-val').innerText = score; 
    document.getElementById('lines-val').innerText = lines; 
}

window.toggleFullscreen = function() {
    const gameArea = document.body;
    if (!document.fullscreenElement) { 
        gameArea.requestFullscreen().catch(err => { console.error(`全画面エラー: ${err.message}`); }); 
    } else { 
        document.exitFullscreen(); 
    }
};

// ==========================================
// 7. Canvas 描画システム
// ==========================================
function drawBlock(targetCtx, x, y, type) {
    targetCtx.fillStyle = COLORS[type]; 
    targetCtx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    targetCtx.strokeStyle = 'rgba(0,0,0,0.3)'; 
    targetCtx.lineWidth = 2; 
    targetCtx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#222'; 
    ctx.lineWidth = 1;
    
    for(let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * BLOCK_SIZE, 0); ctx.lineTo(i * BLOCK_SIZE, canvas.height); ctx.stroke(); }
    for(let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * BLOCK_SIZE); ctx.lineTo(canvas.width, j * BLOCK_SIZE); ctx.stroke(); }

    if (hardDropEffectTimer > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(hardDropEffectTimer / 6) * 0.35})`;
        hardDropColumns.forEach(c => { ctx.fillRect(c * BLOCK_SIZE, 0, BLOCK_SIZE, canvas.height); }); 
        hardDropEffectTimer--;
    }

    for (let r = 0; r < ROWS; r++) {
        if (clearingLinesList.includes(r) && clearAnimTimer > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${clearAnimTimer / 8})`; 
            ctx.fillRect(0, r * BLOCK_SIZE, canvas.width, BLOCK_SIZE); 
            continue;
        }
        for (let c = 0; c < COLS; c++) { 
            if (board[r][c]) drawBlock(ctx, c, r, board[r][c]); 
        }
    }
    
    if (clearAnimTimer > 0) clearAnimTimer--;
    
    // カウントダウン中（isCountingDown）はフィールドだけを薄暗くし、NEXTは見せる
    if ((isPaused || isCountingDown) && !gameOver) { 
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height); 
        return; 
    }
    if (!currentPiece || gameOver || isClearingAnimation) return;

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
    nCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height); 

    // 「純粋なポーズ中（かつカウントダウンでもない状態）」または「ゲームオーバー」の時だけサイドを隠す
    if ((isPaused && !isCountingDown) || gameOver) {
        return; 
    }

    // HOLDの描画
    if (holdPiece) {
        const m = SHAPES[holdPiece]; 
        const offset = (4 - m.length) / 2;
        for(let r = 0; r < m.length; r++) { 
            for(let c = 0; c < m[r].length; c++) { 
                if(m[r][c]) drawBlock(hCtx, c + offset, r + offset, holdPiece); 
            } 
        }
    }
    
    // NEXTの描画
    const MINI_BLOCK = 20;
    for (let i = 0; i < 5; i++) {
        if (!nextQueue[i]) break;
        const p = nextQueue[i]; 
        const m = SHAPES[p.type]; 
        const startY = i * 80 + 10; 
        const offset = (4 - m.length) / 2;
        
        nCtx.fillStyle = COLORS[p.type];
        for(let r = 0; r < m.length; r++) {
            for(let c = 0; c < m[r].length; c++) {
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
// 8. カスタムキー割り当てシステム
// ==========================================
window.startConfig = function(action, type) {
    if (configState.active) cancelConfig();
    configState.active = true; 
    configState.action = action; 
    configState.type = type; 
    configState.timeLeft = 10;
    
    const btn = document.getElementById(`cfg-${type}-${action}`);
    if(btn) { 
        btn.className = "key-btn config-waiting"; 
        btn.innerText = `入力待ち... (${configState.timeLeft}s)`; 
    }

    configState.timer = setInterval(() => {
        configState.timeLeft--;
        if (configState.timeLeft <= 0) { 
            cancelConfig(); 
        } else { 
            if(btn) btn.innerText = `入力待ち... (${configState.timeLeft}s)`; 
        }
    }, 1000);
};

function cancelConfig() {
    if (!configState.active) return; 
    clearInterval(configState.timer);
    const prevAction = configState.action; 
    const prevType = configState.type;
    configState.active = false; 
    configState.action = null; 
    configState.type = null;
    const btn = document.getElementById(`cfg-${prevType}-${prevAction}`);
    if (btn) { 
        btn.className = prevType === 'kb' ? "key-btn text-left" : "key-btn"; 
        renderConfigUI(); 
    }
}

function assignGamepadConfig(btnId) {
    clearInterval(configState.timer); 
    const targetAction = configState.action;
    
    if (btnId === 'B7') { 
        gpConfig[targetAction] = []; 
        createEffectText("CLEARED", "txt-system"); 
    } else {
        for (let a in gpConfig) { gpConfig[a] = gpConfig[a].filter(b => b !== btnId); }
        if (!gpConfig[targetAction].includes(btnId)) { 
            gpConfig[targetAction].push(btnId); 
        }
    }
    configState.active = false; 
    configState.action = null; 
    configState.type = null;
    saveConfigToDB(); 
    renderConfigUI();
}

// ==========================================
// 9. イベントリスナー（キーボード＆Ctrl+F監視）
// ==========================================
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { 
        e.preventDefault(); 
        if (!configState.active) toggleFullscreen(); 
        return; 
    }

    if (configState.active && configState.type === 'kb') {
        e.preventDefault();
        if (e.code === CANCEL_KEY) { 
            cancelConfig(); 
        } else if (e.code === 'Backspace' || e.code === 'Delete') {
            clearInterval(configState.timer); 
            kbConfig[configState.action] = []; 
            configState.active = false; 
            configState.action = null; 
            configState.type = null; 
            saveConfigToDB(); 
            renderConfigUI(); 
            createEffectText("CLEARED", "txt-system");
        } else {
            clearInterval(configState.timer);
            if (!kbConfig[configState.action].includes(e.code)) {
                for(let a in kbConfig) { kbConfig[a] = kbConfig[a].filter(k => k !== e.code); } 
                kbConfig[configState.action].push(e.code);
            }
            configState.active = false; 
            configState.action = null; 
            configState.type = null; 
            saveConfigToDB(); 
            renderConfigUI();
        }
        return;
    }

    if (e.code === CANCEL_KEY) { 
        e.preventDefault(); 
        if (!isCountingDown) togglePause(); 
        return; 
    }
    
    if (!isPaused && !gameOver && !isClearingAnimation && !isCountingDown) { 
        for (let action in kbConfig) { 
            if (kbConfig[action].includes(e.code)) { e.preventDefault(); break; } 
        } 
    }
    keysPressed[e.code] = true;
});

window.addEventListener('keyup', (e) => { delete keysPressed[e.code]; });
window.addEventListener("gamepadconnected", (e) => { 
    createEffectText("PAD CONNECTED", "txt-system"); 
    renderConfigUI(); 
});

// ゲームシステム起動
loadExternalConfigAndInit();