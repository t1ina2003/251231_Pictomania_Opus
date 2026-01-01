/**
 * 遊戲邏輯管理
 * 新流程：繪畫階段 → 依序猜測階段
 */
class GameManager {
  constructor() {
    this.room = null;
    this.playerId = null;
    this.gameState = null;
    this.myCanvas = null;
    this.displayCanvas = null;
    this.timer = null;
    this.timeRemaining = 0;
    this.hasGuessed = false;
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
   * 開始繪畫階段
   */
  startDrawingPhase(data) {
    this.gameState = {
      phase: 'drawing',
      round: data.round,
      totalRounds: data.totalRounds,
      privateInfo: data.privateInfo,
      duration: data.duration,
      players: data.players || this.room.players
    };
    
    this.initDrawingUI();
    this.startTimer(data.duration);
  }

  /**
   * 初始化繪畫 UI
   */
  initDrawingUI() {
    // 更新標題
    document.getElementById('game-phase-title').textContent = '✏️ 繪畫階段';
    document.getElementById('game-phase-subtitle').textContent = '畫出你的題目，讓其他人猜！';

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

    // 更新題目板（顯示自己的題目組合）
    this.updateWordBoard();

    // 顯示繪畫區域，隱藏猜測區域
    document.getElementById('drawing-section').style.display = 'block';
    document.getElementById('guessing-section').style.display = 'none';

    // 重置完成按鈕
    const finishBtn = document.getElementById('finish-drawing-btn');
    finishBtn.disabled = false;
    finishBtn.textContent = '完成繪圖！';

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
    wordsList.innerHTML = info.words.map((word, index) => {
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
   * 玩家完成繪圖
   */
  playerFinishedDrawing(data) {
    showToast(`${data.playerName} 完成繪圖了！`, 'info');
    
    // 如果是自己
    if (data.playerId === this.playerId) {
      const finishBtn = document.getElementById('finish-drawing-btn');
      finishBtn.disabled = true;
      finishBtn.textContent = '已完成';
    }
  }

  /**
   * 開始猜測階段
   */
  startGuessingPhase(data) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.gameState.phase = 'guessing';
    this.gameState.currentTarget = {
      playerId: data.targetPlayerId,
      playerName: data.targetPlayerName,
      playerColor: data.targetPlayerColor,
      words: data.words
    };
    this.hasGuessed = false;

    // 更新 UI
    document.getElementById('game-phase-title').textContent = '🔍 猜測階段';
    document.getElementById('game-phase-subtitle').textContent = 
      `猜猜 ${data.targetPlayerName} 畫的是什麼？ (${data.guessingIndex}/${data.totalPlayers})`;

    // 顯示猜測區域，隱藏繪畫區域
    document.getElementById('drawing-section').style.display = 'none';
    document.getElementById('guessing-section').style.display = 'block';

    // 如果是自己的作品，顯示等待訊息
    if (data.targetPlayerId === this.playerId) {
      document.getElementById('guess-content').innerHTML = `
        <div class="waiting-message">
          <p>這是你的作品！</p>
          <p>等待其他玩家猜測...</p>
        </div>
      `;
    } else {
      // 顯示題目選項讓玩家猜測
      this.showGuessingOptions(data);
    }

    // 重播繪圖
    this.replayDrawing(data.drawings);

    this.startTimer(data.duration);
  }

  /**
   * 顯示猜測選項
   */
  showGuessingOptions(data) {
    const container = document.getElementById('guess-content');
    container.innerHTML = `
      <p class="guess-prompt">選擇你認為 ${data.targetPlayerName} 畫的題目：</p>
      <div class="guess-options">
        ${data.words.map((word, index) => {
          const number = index + 1;
          return `
            <button class="guess-option-btn" data-number="${number}">
              <span class="guess-number">${number}</span>
              <span class="guess-word">${word}</span>
            </button>
          `;
        }).join('')}
      </div>
      <div id="guess-feedback" class="guess-feedback"></div>
    `;

    // 綁定猜測按鈕事件
    container.querySelectorAll('.guess-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.hasGuessed) return;
        
        const guessNumber = parseInt(btn.dataset.number);
        socket.submitGuess(guessNumber);
        
        // 禁用所有按鈕
        container.querySelectorAll('.guess-option-btn').forEach(b => {
          b.disabled = true;
        });
        btn.classList.add('selected');
      });
    });
  }

  /**
   * 重播繪圖
   */
  replayDrawing(drawings) {
    const canvas = document.getElementById('display-canvas');
    const ctx = canvas.getContext('2d');
    
    // 清除畫布
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!drawings || drawings.length === 0) return;

    // 快速重播繪圖
    let index = 0;
    const replaySpeed = 5; // 每幀繪製的筆畫數
    
    const replay = () => {
      for (let i = 0; i < replaySpeed && index < drawings.length; i++, index++) {
        const data = drawings[index];
        if (data.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(data.fromX, data.fromY);
          ctx.lineTo(data.toX, data.toY);
          ctx.strokeStyle = data.color;
          ctx.lineWidth = data.size;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.closePath();
        }
      }
      
      if (index < drawings.length) {
        requestAnimationFrame(replay);
      }
    };
    
    replay();
  }

  /**
   * 猜測提交回饋
   */
  guessSubmitted(isCorrect) {
    this.hasGuessed = true;
    const feedback = document.getElementById('guess-feedback');
    if (feedback) {
      if (isCorrect) {
        feedback.innerHTML = '<span class="correct">✓ 答對了！等待其他玩家...</span>';
      } else {
        feedback.innerHTML = '<span class="wrong">✗ 答錯了！等待結算...</span>';
      }
    }
  }

  /**
   * 顯示猜測結果
   */
  showGuessingResult(data) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.gameState.phase = 'showing';

    document.getElementById('game-phase-title').textContent = '📊 結果揭曉';
    document.getElementById('game-phase-subtitle').textContent = 
      `${data.targetPlayerName} 畫的是「${data.correctWord}」(#${data.correctAnswer})`;

    const container = document.getElementById('guess-content');
    
    // 排序結果（正確的在前）
    const sortedResults = [...data.results].sort((a, b) => {
      if (a.isCorrect && !b.isCorrect) return -1;
      if (!a.isCorrect && b.isCorrect) return 1;
      if (a.rank && b.rank) return a.rank - b.rank;
      return 0;
    });

    container.innerHTML = `
      <div class="guessing-results">
        <div class="correct-answer">
          正確答案：<strong>#${data.correctAnswer} ${data.correctWord}</strong>
        </div>
        <div class="results-list">
          ${sortedResults.map(r => {
            let statusIcon = '';
            let statusClass = '';
            let scoreText = '';
            
            if (r.didNotGuess) {
              statusIcon = '⏭️';
              statusClass = 'skipped';
              scoreText = '未猜測';
            } else if (r.isCorrect) {
              statusIcon = '✓';
              statusClass = 'correct';
              scoreText = `+${r.score} 分 (第 ${r.rank} 名)`;
            } else {
              statusIcon = '✗';
              statusClass = 'wrong';
              scoreText = `${r.score} 分`;
            }
            
            return `
              <div class="result-item ${statusClass}">
                <div class="result-player">
                  <span class="result-avatar" style="background-color: ${r.playerColor}">
                    ${r.playerName.charAt(0)}
                  </span>
                  <span class="result-name">${r.playerName}</span>
                </div>
                <div class="result-guess">
                  ${r.didNotGuess ? '' : `猜 #${r.guessNumber}`}
                </div>
                <div class="result-status">
                  <span class="status-icon">${statusIcon}</span>
                  <span class="status-text">${scoreText}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ${data.hasMorePlayers ? `
        <button id="next-guessing-btn" class="btn btn-primary" ${this.room.hostId !== this.playerId ? 'disabled' : ''}>
          ${this.room.hostId === this.playerId ? '下一位玩家' : '等待房主'}
        </button>
      ` : `
        <button id="show-round-result-btn" class="btn btn-primary" ${this.room.hostId !== this.playerId ? 'disabled' : ''}>
          ${this.room.hostId === this.playerId ? '查看回合結果' : '等待房主'}
        </button>
      `}
    `;

    // 綁定按鈕事件
    const nextBtn = document.getElementById('next-guessing-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        socket.send('nextGuessing', {});
      });
    }

    const resultBtn = document.getElementById('show-round-result-btn');
    if (resultBtn) {
      resultBtn.addEventListener('click', () => {
        socket.send('nextGuessing', {});
      });
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
    
    // 生成結果表格
    const resultsTable = document.getElementById('results-table');
    resultsTable.innerHTML = data.results.map((result, index) => {
      const scoreClass = result.roundScore >= 0 ? 'positive' : 'negative';
      const scorePrefix = result.roundScore >= 0 ? '+' : '';
      
      return `
        <div class="result-row">
          <div class="result-rank">${index + 1}</div>
          <div class="result-player">
            <div class="result-player-avatar" style="background-color: ${result.playerColor}">
              ${result.playerName.charAt(0).toUpperCase()}
            </div>
            <div class="result-player-info">
              <div class="result-player-name">${result.playerName}</div>
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

    showScreen('result-screen');
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

    showScreen('end-screen');
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
    
    if (!timerText || !timerProgress) return;
    
    timerText.textContent = Math.max(0, this.timeRemaining);
    
    const totalDuration = this.gameState.phase === 'drawing' ? 
      (this.gameState.duration / 1000) : 20;
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
   * 重置遊戲
   */
  reset() {
    this.room = null;
    this.gameState = null;
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.myCanvas) {
      this.myCanvas.clear(false);
    }
  }
}

// 全域遊戲管理器
const game = new GameManager();
