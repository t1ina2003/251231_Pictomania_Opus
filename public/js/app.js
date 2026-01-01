/**
 * Pictomania 線上版 - 主程式
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
  });

  // 遊戲開始
  socket.on('gameStarted', (data) => {
    game.startGame(data);
    showScreen('game-screen');
    showToast('遊戲開始！', 'success');
  });

  // 回合開始
  socket.on('roundStarted', (data) => {
    game.startNewRound(data);
    showScreen('game-screen');
    showToast(`第 ${data.round} 回合開始！`, 'success');
  });

  // 接收繪圖資料
  socket.on('draw', (data) => {
    game.handleRemoteDraw(data.playerId, data.drawData);
  });

  // 清除畫布
  socket.on('clearCanvas', (data) => {
    game.handleRemoteClear(data.playerId);
  });

  // 猜測已提交
  socket.on('guessSubmitted', (data) => {
    // 不需要特別處理，已在 submitGuess 中處理
  });

  // 有人猜了你
  socket.on('someoneGuessedYou', (data) => {
    showToast(`${data.guesserName} 猜了你的圖！`, 'info');
  });

  // 玩家完成
  socket.on('playerFinished', (data) => {
    game.playerFinished(data);
  });

  // 回合結束
  socket.on('roundEnded', (data) => {
    game.showRoundResult(data);
    showScreen('result-screen');
  });

  // 遊戲結束
  socket.on('gameEnded', (data) => {
    game.showFinalResult(data.rankings);
    showScreen('end-screen');
  });
}

// ===================================
// UI 事件處理
// ===================================

function setupUIHandlers() {
  // 難度選擇
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 建立房間
  document.getElementById('create-room-btn').addEventListener('click', () => {
    const playerName = document.getElementById('player-name').value.trim();
    const difficulty = document.querySelector('.diff-btn.active').dataset.difficulty;
    
    if (!playerName) {
      showToast('請輸入你的名字', 'warning');
      return;
    }
    
    socket.createRoom(playerName, difficulty);
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

  // 完成回合
  document.getElementById('finish-round-btn').addEventListener('click', () => {
    socket.finishRound();
  });

  // 下一回合
  document.getElementById('next-round-btn').addEventListener('click', () => {
    socket.nextRound();
  });

  // 關閉猜測視窗
  document.querySelector('.close-modal-btn').addEventListener('click', () => {
    document.getElementById('guess-modal').style.display = 'none';
  });

  // 點擊視窗外關閉
  document.getElementById('guess-modal').addEventListener('click', (e) => {
    if (e.target.id === 'guess-modal') {
      e.target.style.display = 'none';
    }
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
