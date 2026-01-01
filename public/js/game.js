/**
 * 遊戲邏輯管理
 */
class GameManager {
  constructor() {
    this.room = null;
    this.playerId = null;
    this.gameState = null;
    this.myCanvas = null;
    this.remoteCanvases = {};
    this.guesses = {};
    this.timer = null;
    this.timeRemaining = 0;
  }

  /**
   * 設定房間資訊
   */
  setRoom(room, playerId) {
    this.room = room;
    this.playerId = playerId;
    this.updateRoomUI();
  }

  /**
   * 更新房間 UI
   */
  updateRoomUI() {
    if (!this.room) return;

    // 房間碼
    const codeDisplay = document.getElementById('room-code-display');
    if (codeDisplay) {
      codeDisplay.textContent = this.room.code;
    }

    // 難度
    const difficultyDisplay = document.getElementById('room-difficulty');
    if (difficultyDisplay) {
      const diffMap = {
        'easy': '簡單',
        'medium': '中等',
        'hard': '困難',
        'mixed': '混合'
      };
      difficultyDisplay.textContent = diffMap[this.room.difficulty] || '混合';
    }

    // 玩家列表
    this.updatePlayersList();

    // 開始按鈕狀態
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      const isHost = this.room.hostId === this.playerId;
      const hasEnoughPlayers = this.room.players.length >= 3;
      startBtn.disabled = !isHost || !hasEnoughPlayers;
      startBtn.textContent = isHost ? 
        (hasEnoughPlayers ? '開始遊戲' : `等待玩家 (${this.room.players.length}/3)`) : 
        '等待房主開始';
    }
  }

  /**
   * 更新玩家列表
   */
  updatePlayersList() {
    const container = document.getElementById('players-list');
    if (!container || !this.room) return;

    container.innerHTML = this.room.players.map(player => {
      const isMe = player.id === this.playerId;
      const isHost = player.isHost;
      
      return `
        <div class="player-card ${isHost ? 'is-host' : ''} ${isMe ? 'is-me' : ''}">
          <div class="player-avatar" style="background-color: ${player.color}">
            ${player.name.charAt(0).toUpperCase()}
          </div>
          <div class="player-info">
            <div class="player-name">${player.name}</div>
            <div class="player-badge">
              ${isHost ? '👑 房主' : ''}
              ${isMe ? '(你)' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * 開始遊戲
   */
  startGame(data) {
    this.gameState = {
      round: data.round,
      totalRounds: data.totalRounds,
      words: data.words,
      privateInfo: data.privateInfo,
      duration: data.duration,
      players: data.players
    };
    
    this.guesses = {};
    this.initGameUI();
    this.startTimer(data.duration);
  }

  /**
   * 初始化遊戲 UI
   */
  initGameUI() {
    // 初始化自己的畫布
    if (!this.myCanvas) {
      this.myCanvas = new CanvasManager('my-canvas');
      this.myCanvas.onDraw = (drawData) => {
        socket.sendDraw(drawData);
      };
      this.myCanvas.onClear = () => {
        socket.clearCanvas();
      };
    } else {
      this.myCanvas.clear(false);
    }

    // 更新回合資訊
    document.getElementById('current-round').textContent = this.gameState.round;
    document.getElementById('total-rounds').textContent = this.gameState.totalRounds;

    // 更新題目板
    this.updateWordBoard();

    // 建立其他玩家的畫布
    this.createOtherCanvases();

    // 重置完成按鈕
    const finishBtn = document.getElementById('finish-round-btn');
    finishBtn.disabled = false;
    finishBtn.textContent = '完成！';

    // 綁定工具事件
    this.bindToolEvents();
  }

  /**
   * 更新題目板
   */
  updateWordBoard() {
    const info = this.gameState.privateInfo;
    
    // 自己的題目
    document.getElementById('your-word').textContent = info.assignedWord;
    document.getElementById('your-number').textContent = `#${info.assignedNumber}`;

    // 題目列表
    const wordsList = document.getElementById('words-list');
    wordsList.innerHTML = this.gameState.words.map((word, index) => {
      const number = index + 1;
      const isMyWord = number === info.assignedNumber;
      
      return `
        <div class="word-item ${isMyWord ? 'highlighted' : ''}">
          <span class="word-number">${number}.</span>
          <span class="word-text">${word}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * 建立其他玩家的畫布
   */
  createOtherCanvases() {
    const container = document.getElementById('others-canvases');
    container.innerHTML = '';
    this.remoteCanvases = {};

    const otherPlayers = this.gameState.players.filter(p => p.id !== this.playerId);
    
    otherPlayers.forEach(player => {
      const div = document.createElement('div');
      div.className = 'other-player-canvas';
      div.id = `player-canvas-${player.id}`;
      
      div.innerHTML = `
        <div class="other-player-header">
          <div class="other-player-name">
            <span class="other-player-color" style="background-color: ${player.color}"></span>
            <span>${player.name}</span>
          </div>
          <button class="guess-btn" data-player-id="${player.id}" data-player-name="${player.name}">
            猜測
          </button>
        </div>
        <div class="other-canvas-wrapper">
          <canvas width="400" height="400"></canvas>
        </div>
      `;
      
      container.appendChild(div);
      
      const canvas = div.querySelector('canvas');
      this.remoteCanvases[player.id] = new RemoteCanvasManager(canvas);
    });

    // 綁定猜測按鈕事件
    container.querySelectorAll('.guess-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openGuessModal(btn.dataset.playerId, btn.dataset.playerName);
      });
    });
  }

  /**
   * 綁定繪圖工具事件
   */
  bindToolEvents() {
    // 工具按鈕
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tool = btn.dataset.tool;
        if (tool === 'clear') {
          this.myCanvas.clear(true);
        } else {
          this.myCanvas.setTool(tool);
        }
      });
    });

    // 顏色選擇
    document.getElementById('brush-color').addEventListener('input', (e) => {
      this.myCanvas.setBrushColor(e.target.value);
    });

    // 筆刷大小
    document.getElementById('brush-size').addEventListener('input', (e) => {
      this.myCanvas.setBrushSize(e.target.value);
    });
  }

  /**
   * 處理遠端繪圖
   */
  handleRemoteDraw(playerId, drawData) {
    const remoteCanvas = this.remoteCanvases[playerId];
    if (remoteCanvas) {
      remoteCanvas.draw(drawData);
    }
  }

  /**
   * 處理遠端清除畫布
   */
  handleRemoteClear(playerId) {
    const remoteCanvas = this.remoteCanvases[playerId];
    if (remoteCanvas) {
      remoteCanvas.clear();
    }
  }

  /**
   * 開啟猜測視窗
   */
  openGuessModal(targetId, targetName) {
    // 檢查是否已猜過
    if (this.guesses[targetId] !== undefined) {
      showToast('你已經猜過這位玩家了', 'warning');
      return;
    }

    const modal = document.getElementById('guess-modal');
    document.getElementById('guess-target-name').textContent = targetName;
    
    // 生成 1-7 選項
    const optionsContainer = document.getElementById('guess-options');
    optionsContainer.innerHTML = this.gameState.words.map((word, index) => {
      const number = index + 1;
      return `
        <button class="guess-option-btn" data-number="${number}">
          ${number}
        </button>
      `;
    }).join('');

    // 綁定選項點擊事件
    optionsContainer.querySelectorAll('.guess-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const guessNumber = parseInt(btn.dataset.number);
        this.submitGuess(targetId, guessNumber);
        modal.style.display = 'none';
      });
    });

    modal.style.display = 'flex';
  }

  /**
   * 提交猜測
   */
  submitGuess(targetId, guessNumber) {
    socket.submitGuess(targetId, guessNumber);
    this.guesses[targetId] = guessNumber;
    
    // 更新猜測按鈕狀態
    const guessBtn = document.querySelector(`[data-player-id="${targetId}"]`);
    if (guessBtn) {
      guessBtn.disabled = true;
      guessBtn.textContent = `已猜 #${guessNumber}`;
    }
    
    showToast(`已提交猜測: #${guessNumber}`, 'success');
  }

  /**
   * 開始計時器
   */
  startTimer(duration) {
    this.timeRemaining = duration / 1000;
    this.updateTimerDisplay();
    
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    this.timer = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();
      
      if (this.timeRemaining <= 0) {
        clearInterval(this.timer);
      }
    }, 1000);
  }

  /**
   * 更新計時器顯示
   */
  updateTimerDisplay() {
    const timerText = document.getElementById('timer-text');
    const timerProgress = document.getElementById('timer-progress');
    
    timerText.textContent = Math.max(0, this.timeRemaining);
    
    const totalDuration = this.gameState.duration / 1000;
    const percentage = (this.timeRemaining / totalDuration) * 100;
    timerProgress.style.width = `${percentage}%`;
    
    // 時間少於 10 秒時變紅
    if (this.timeRemaining <= 10) {
      timerText.style.color = '#ef4444';
    } else {
      timerText.style.color = '';
    }
  }

  /**
   * 玩家完成回合
   */
  playerFinished(data) {
    showToast(`${data.playerName} 完成了！${data.bonusAwarded ? ` +${data.bonusAwarded} 加分` : ''}`, 'info');
    
    // 如果是自己
    if (data.playerId === this.playerId) {
      const finishBtn = document.getElementById('finish-round-btn');
      finishBtn.disabled = true;
      finishBtn.textContent = '已完成';
    }
  }

  /**
   * 顯示回合結果
   */
  showRoundResult(data) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    // 更新結果畫面
    document.getElementById('result-round').textContent = data.round;
    
    // 顯示老鼠屎
    const poopyAnnouncement = document.getElementById('poopy-announcement');
    if (data.poopyPlayers && data.poopyPlayers.length > 0) {
      poopyAnnouncement.style.display = 'flex';
      document.getElementById('poopy-names').textContent = 
        data.poopyPlayers.map(p => p.name).join(', ');
    } else {
      poopyAnnouncement.style.display = 'none';
    }

    // 生成結果表格
    const resultsTable = document.getElementById('results-table');
    resultsTable.innerHTML = data.results.map((result, index) => {
      const scoreClass = result.roundScore >= 0 ? 'positive' : 'negative';
      const scorePrefix = result.roundScore >= 0 ? '+' : '';
      
      return `
        <div class="result-row">
          <div class="result-rank">${index + 1}</div>
          <div class="result-player">
            <div class="result-player-avatar" style="background-color: ${this.getPlayerColor(result.playerId)}">
              ${result.playerName.charAt(0).toUpperCase()}
            </div>
            <div class="result-player-info">
              <div class="result-player-name">
                ${result.playerName}
                ${result.isPoopy ? ' 🐭' : ''}
              </div>
              <div class="result-player-word">畫的是: ${result.assignedWord}</div>
            </div>
          </div>
          <div class="result-score-info">
            <div class="result-score ${scoreClass}">${scorePrefix}${result.roundScore}</div>
            <div class="result-round-score">總分: ${result.totalScore}</div>
          </div>
        </div>
      `;
    }).join('');

    // 下一回合按鈕
    const nextRoundBtn = document.getElementById('next-round-btn');
    if (data.isGameEnd) {
      nextRoundBtn.style.display = 'none';
    } else {
      nextRoundBtn.style.display = 'block';
      const isHost = this.room.hostId === this.playerId;
      nextRoundBtn.disabled = !isHost;
      nextRoundBtn.textContent = isHost ? '下一回合' : '等待房主';
    }
  }

  /**
   * 開始新回合
   */
  startNewRound(data) {
    this.gameState.round = data.round;
    this.gameState.totalRounds = data.totalRounds;
    this.gameState.words = data.words;
    this.gameState.privateInfo = data.privateInfo;
    this.gameState.duration = data.duration;
    
    this.guesses = {};
    this.initGameUI();
    this.startTimer(data.duration);
  }

  /**
   * 顯示最終結果
   */
  showFinalResult(rankings) {
    const container = document.getElementById('final-rankings');
    
    container.innerHTML = rankings.map((player, index) => {
      const positionClass = index === 0 ? 'gold' : (index === 1 ? 'silver' : (index === 2 ? 'bronze' : ''));
      const positionIcon = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `${player.rank}`));
      
      return `
        <div class="ranking-item ${index === 0 ? 'first' : ''}">
          <div class="ranking-position ${positionClass}">${positionIcon}</div>
          <div class="ranking-player">
            <div class="ranking-avatar" style="background-color: ${player.color}">
              ${player.playerName.charAt(0).toUpperCase()}
            </div>
            <div class="ranking-name">${player.playerName}</div>
          </div>
          <div class="ranking-score">${player.totalScore} 分</div>
        </div>
      `;
    }).join('');
  }

  /**
   * 獲取玩家顏色
   */
  getPlayerColor(playerId) {
    const player = this.room?.players.find(p => p.id === playerId);
    return player?.color || '#6366f1';
  }

  /**
   * 重置遊戲
   */
  reset() {
    this.room = null;
    this.gameState = null;
    this.guesses = {};
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.myCanvas) {
      this.myCanvas.clear(false);
    }
    this.remoteCanvases = {};
  }
}

// 全域遊戲管理器
const game = new GameManager();
