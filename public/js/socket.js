/**
 * WebSocket 連線管理
 */
class SocketManager {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.handlers = {};
  }

  /**
   * 連線到伺服器
   */
  connect() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      console.log('正在連線到:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket 連線成功');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
          
          // 連線確認時 resolve
          if (data.type === 'connected') {
            this.playerId = data.playerId;
            resolve();
          }
        } catch (error) {
          console.error('解析訊息失敗:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket 連線關閉');
        this.handleDisconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket 錯誤:', error);
        reject(error);
      };

      // 連線超時
      setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          reject(new Error('連線超時'));
        }
      }, 10000);
    });
  }

  /**
   * 處理收到的訊息
   */
  handleMessage(data) {
    console.log('收到訊息:', data.type, data);
    
    const handler = this.handlers[data.type];
    if (handler) {
      handler(data);
    }
  }

  /**
   * 註冊訊息處理器
   */
  on(type, handler) {
    this.handlers[type] = handler;
  }

  /**
   * 發送訊息
   */
  send(type, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    } else {
      console.error('WebSocket 未連線');
    }
  }

  /**
   * 處理斷線
   */
  handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`嘗試重新連線 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch(() => {
          this.handleDisconnect();
        });
      }, 2000 * this.reconnectAttempts);
    } else {
      this.triggerHandler('connectionLost', {});
    }
  }

  /**
   * 觸發處理器
   */
  triggerHandler(type, data) {
    const handler = this.handlers[type];
    if (handler) {
      handler(data);
    }
  }

  /**
   * 建立房間
   */
  createRoom(playerName, difficulty) {
    this.send('createRoom', { playerName, difficulty });
  }

  /**
   * 加入房間
   */
  joinRoom(roomCode, playerName) {
    this.send('joinRoom', { roomCode, playerName });
  }

  /**
   * 離開房間
   */
  leaveRoom() {
    this.send('leaveRoom');
  }

  /**
   * 開始遊戲
   */
  startGame() {
    this.send('startGame');
  }

  /**
   * 發送繪圖資料
   */
  sendDraw(drawData) {
    this.send('draw', { drawData });
  }

  /**
   * 清除畫布
   */
  clearCanvas() {
    this.send('clearCanvas');
  }

  /**
   * 提交猜測
   */
  submitGuess(guessNumber) {
    this.send('submitGuess', { guessNumber });
  }

  /**
   * 下一回合
   */
  nextRound() {
    this.send('nextRound');
  }

  /**
   * 發送聊天
   */
  sendChat(message) {
    this.send('chat', { message });
  }
}

// 全域 socket 管理器
const socket = new SocketManager();
