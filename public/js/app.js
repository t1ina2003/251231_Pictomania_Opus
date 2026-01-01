/**
 * Pictomania 線上版 - 主程式
 * 新流程：繪畫階段 → 依序猜測階段
 */

// ===================================
// 畫面管理
// ===================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

// ===================================
// Toast 通知
// ===================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===================================
// 初始化
// ===================================

async function init() {
  try {
    await socket.connect();
    console.log('已連線，玩家 ID:', socket.playerId);
    showScreen('lobby-screen');
    
    // 設定 socket 事件處理
    setupSocketHandlers();
    
    // 設定 UI 事件處理
    setupUIHandlers();
    
  } catch (error) {
    console.error('連線失敗:', error);
    document.querySelector('.loading-text').textContent = '連線失敗，請重新整理頁面';
  }
}

// ===================================
// Socket 事件處理
// ===================================

function setupSocketHandlers() {
  // 錯誤處理
  socket.on('error', (data) => {
    showToast(data.message, 'error');
  });

  // 連線遺失
  socket.on('connectionLost', () => {
    showToast('連線已斷開，請重新整理頁面', 'error');
    showScreen('loading-screen');
    document.querySelector('.loading-text').textContent = '連線已斷開';
  });

  // 房間已建立
  socket.on('roomCreated', (data) => {
    game.setRoom(data.room, data.playerId);
    showScreen('room-screen');
    showToast('房間已建立！', 'success');
  });

  // 已加入房間
  socket.on('roomJoined', (data) => {
    game.setRoom(data.room, data.playerId);
    showScreen('room-screen');
    showToast('已加入房間！', 'success');
  });

  // 玩家加入
  socket.on('playerJoined', (data) => {
    if (game.room) {
      game.room.players = data.players;
      game.updateRoomUI();
      showToast(`${data.player.name} 加入了房間`, 'info');
    }
  });

  // 玩家離開
  socket.on('playerLeft', (data) => {
    if (game.room) {
      game.room.players = data.players;
      game.room.hostId = data.newHostId;
      game.updateRoomUI();
      showToast('有玩家離開了房間', 'warning');
    }
  });

  // 已離開房間
  socket.on('leftRoom', () => {
    game.reset();
    showScreen('lobby-screen');
    sound.playMusic('lobby');
  });

  // 繪畫階段開始
  socket.on('drawingPhaseStarted', (data) => {
    game.startDrawingPhase(data);
    showScreen('game-screen');
    showToast(`第 ${data.round} 回合 - 開始繪畫！(80秒)`, 'success');
    sound.playSound('roundStart');
    sound.playMusic('drawing');
  });

  // 玩家完成繪圖
  socket.on('playerFinishedDrawing', (data) => {
    game.playerFinishedDrawing(data);
    sound.playSound('success');
  });

  // 猜測階段開始
  socket.on('guessingPhaseStarted', (data) => {
    game.startGuessingPhase(data);
    showToast(`現在猜測 ${data.targetPlayerName} 的作品！`, 'info');
    sound.playMusic('guessing');
  });

  // 猜測已提交
  socket.on('guessSubmitted', (data) => {
    game.guessSubmitted(data.isCorrect);
    if (data.isCorrect) {
      sound.playSound('correct');
    } else {
      sound.playSound('wrong');
    }
  });

  // 猜測狀態更新（供觀察員更新顯示）
  socket.on('guessStatusUpdate', (data) => {
    game.updateGuessStatus(data);
  });

  // 猜測結束（顯示結果）
  socket.on('guessingEnded', (data) => {
    game.showGuessingResult(data);
    sound.playMusic('results');
  });

  // 回合結束
  socket.on('roundEnded', (data) => {
    game.showRoundResult(data);
    sound.playSound('roundEnd');
    sound.playMusic('results');
  });

  // 遊戲結束
  socket.on('gameEnded', (data) => {
    game.showFinalResult(data.rankings);
    sound.playSound('gameEnd');
    sound.stopMusic();
  });
}

// ===================================
// UI 事件處理
// ===================================

function setupUIHandlers() {
  // 音效控制按鈕
  document.getElementById('toggle-sound-btn').addEventListener('click', () => {
    const enabled = sound.toggleSound();
    document.getElementById('toggle-sound-btn').textContent = enabled ? '🔊' : '🔇';
    sound.playSound('click');
  });

  document.getElementById('toggle-music-btn').addEventListener('click', () => {
    const enabled = sound.toggleMusic();
    document.getElementById('toggle-music-btn').textContent = enabled ? '🎵' : '🎵❌';
    if (enabled) {
      sound.playMusic('lobby');
    }
  });

  // 為所有按鈕添加點擊音效
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sound.playSound('click');
    });
  });

  // 難度選擇
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sound.playSound('click');
    });
  });

  // 建立房間
  document.getElementById('create-room-btn').addEventListener('click', () => {
    const playerName = document.getElementById('player-name').value.trim();
    const difficulty = document.querySelector('.diff-btn.active').dataset.difficulty;
    const isObserver = document.getElementById('observer-mode').checked;
    
    if (!playerName) {
      showToast('請輸入你的名字', 'warning');
      return;
    }
    
    socket.createRoom(playerName, difficulty, isObserver);
  });

  // 加入房間
  document.getElementById('join-room-btn').addEventListener('click', () => {
    const playerName = document.getElementById('player-name').value.trim();
    const roomCode = document.getElementById('room-code').value.trim();
    
    if (!playerName) {
      showToast('請輸入你的名字', 'warning');
      return;
    }
    
    if (!roomCode || roomCode.length !== 6) {
      showToast('請輸入有效的房間碼', 'warning');
      return;
    }
    
    socket.joinRoom(roomCode, playerName);
  });

  // 複製房間碼
  document.getElementById('copy-code-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-display').textContent;
    navigator.clipboard.writeText(code).then(() => {
      showToast('房間碼已複製！', 'success');
    }).catch(() => {
      showToast('複製失敗', 'error');
    });
  });

  // 開始遊戲
  document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.startGame();
  });

  // 離開房間
  document.getElementById('leave-room-btn').addEventListener('click', () => {
    socket.leaveRoom();
  });

  // 完成繪圖
  document.getElementById('finish-drawing-btn').addEventListener('click', () => {
    socket.send('finishDrawing', {});
  });

  // 下一回合
  document.getElementById('next-round-btn').addEventListener('click', () => {
    socket.nextRound();
  });

  // 再玩一次
  document.getElementById('play-again-btn').addEventListener('click', () => {
    // 回到房間但保留玩家
    if (game.room) {
      game.room.gameState = null;
      game.updateRoomUI();
      showScreen('room-screen');
    }
  });

  // 回到大廳
  document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
    socket.leaveRoom();
  });

  // Enter 鍵提交
  document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('create-room-btn').click();
    }
  });

  document.getElementById('room-code').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('join-room-btn').click();
    }
  });
}

// 啟動
init();
