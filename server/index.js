/**
 * Pictomania 線上版 - 伺服器主程式
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const roomManager = require('./roomManager');
const gameManager = require('./gameManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 設定正確的 MIME types
express.static.mime.define({
  'text/css': ['css'],
  'application/javascript': ['js'],
  'text/javascript': ['js']
});

// 靜態檔案服務 - 設定正確的 MIME type
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// 健康檢查端點（供 Render 使用）
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// WebSocket 連線管理
const clients = new Map(); // ws -> { id, roomCode, playerName }

/**
 * 生成唯一連線 ID
 */
function generateClientId() {
  return 'player_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 廣播訊息給房間內所有玩家
 */
function broadcastToRoom(roomCode, message, excludeId = null) {
  clients.forEach((clientInfo, ws) => {
    if (clientInfo.roomCode === roomCode && 
        clientInfo.id !== excludeId && 
        ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

/**
 * 發送訊息給特定玩家
 */
function sendToPlayer(playerId, message) {
  clients.forEach((clientInfo, ws) => {
    if (clientInfo.id === playerId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

/**
 * 處理 WebSocket 訊息
 */
function handleMessage(ws, message) {
  const clientInfo = clients.get(ws);
  
  try {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'createRoom':
        handleCreateRoom(ws, clientInfo, data);
        break;
        
      case 'joinRoom':
        handleJoinRoom(ws, clientInfo, data);
        break;
        
      case 'leaveRoom':
        handleLeaveRoom(ws, clientInfo);
        break;
        
      case 'startGame':
        handleStartGame(ws, clientInfo);
        break;
        
      case 'draw':
        handleDraw(ws, clientInfo, data);
        break;
        
      case 'clearCanvas':
        handleClearCanvas(ws, clientInfo);
        break;
        
      case 'submitGuess':
        handleSubmitGuess(ws, clientInfo, data);
        break;
        
      case 'finishRound':
        handleFinishRound(ws, clientInfo);
        break;
        
      case 'nextRound':
        handleNextRound(ws, clientInfo);
        break;
        
      case 'chat':
        handleChat(ws, clientInfo, data);
        break;
        
      default:
        ws.send(JSON.stringify({ type: 'error', message: '未知的訊息類型' }));
    }
  } catch (error) {
    console.error('處理訊息時發生錯誤:', error);
    ws.send(JSON.stringify({ type: 'error', message: '訊息格式錯誤' }));
  }
}

/**
 * 處理建立房間
 */
function handleCreateRoom(ws, clientInfo, data) {
  const { playerName, difficulty } = data;
  
  if (!playerName || playerName.trim().length === 0) {
    ws.send(JSON.stringify({ type: 'error', message: '請輸入玩家名稱' }));
    return;
  }

  const room = roomManager.createRoom(clientInfo.id, playerName.trim(), difficulty || 'mixed');
  clientInfo.roomCode = room.code;
  clientInfo.playerName = playerName.trim();

  ws.send(JSON.stringify({
    type: 'roomCreated',
    room: sanitizeRoom(room),
    playerId: clientInfo.id
  }));
}

/**
 * 處理加入房間
 */
function handleJoinRoom(ws, clientInfo, data) {
  const { roomCode, playerName } = data;
  
  if (!playerName || playerName.trim().length === 0) {
    ws.send(JSON.stringify({ type: 'error', message: '請輸入玩家名稱' }));
    return;
  }

  if (!roomCode || roomCode.trim().length !== 6) {
    ws.send(JSON.stringify({ type: 'error', message: '請輸入有效的房間碼' }));
    return;
  }

  const result = roomManager.joinRoom(roomCode.trim(), clientInfo.id, playerName.trim());
  
  if (result.error) {
    ws.send(JSON.stringify({ type: 'error', message: result.error }));
    return;
  }

  clientInfo.roomCode = roomCode.trim();
  clientInfo.playerName = playerName.trim();

  // 通知加入者
  ws.send(JSON.stringify({
    type: 'roomJoined',
    room: sanitizeRoom(result),
    playerId: clientInfo.id
  }));

  // 通知房間內其他玩家
  broadcastToRoom(roomCode, {
    type: 'playerJoined',
    player: result.players.find(p => p.id === clientInfo.id),
    players: result.players
  }, clientInfo.id);
}

/**
 * 處理離開房間
 */
function handleLeaveRoom(ws, clientInfo) {
  if (!clientInfo.roomCode) return;

  const roomCode = clientInfo.roomCode;
  const room = roomManager.leaveRoom(roomCode, clientInfo.id);
  
  // 通知房間內其他玩家
  if (room) {
    broadcastToRoom(roomCode, {
      type: 'playerLeft',
      playerId: clientInfo.id,
      players: room.players,
      newHostId: room.hostId
    });
  }

  clientInfo.roomCode = null;
  clientInfo.playerName = null;

  ws.send(JSON.stringify({ type: 'leftRoom' }));
}

/**
 * 處理開始遊戲
 */
function handleStartGame(ws, clientInfo) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: '房間不存在' }));
    return;
  }

  if (room.hostId !== clientInfo.id) {
    ws.send(JSON.stringify({ type: 'error', message: '只有房主可以開始遊戲' }));
    return;
  }

  if (room.players.length < 3) {
    ws.send(JSON.stringify({ type: 'error', message: '至少需要 3 位玩家才能開始' }));
    return;
  }

  // 初始化遊戲
  room.gameState = gameManager.initGame(room);
  
  // 開始第一回合
  const roundInfo = gameManager.startRound(room);

  // 通知所有玩家遊戲開始
  room.players.forEach(player => {
    const privateInfo = gameManager.getPlayerPrivateInfo(room, player.id);
    sendToPlayer(player.id, {
      type: 'gameStarted',
      round: roundInfo.round,
      totalRounds: roundInfo.totalRounds,
      words: roundInfo.words,
      privateInfo: privateInfo,
      duration: roundInfo.duration,
      players: room.players
    });
  });

  // 設定回合計時器
  startRoundTimer(room);
}

/**
 * 處理繪圖資料
 */
function handleDraw(ws, clientInfo, data) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState || room.gameState.phase !== 'playing') return;

  // 廣播繪圖資料給其他玩家
  broadcastToRoom(clientInfo.roomCode, {
    type: 'draw',
    playerId: clientInfo.id,
    drawData: data.drawData
  }, clientInfo.id);
}

/**
 * 處理清除畫布
 */
function handleClearCanvas(ws, clientInfo) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState || room.gameState.phase !== 'playing') return;

  broadcastToRoom(clientInfo.roomCode, {
    type: 'clearCanvas',
    playerId: clientInfo.id
  }, clientInfo.id);
}

/**
 * 處理提交猜測
 */
function handleSubmitGuess(ws, clientInfo, data) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room) return;

  const result = gameManager.submitGuess(room, clientInfo.id, data.targetId, data.guessNumber);
  
  if (result.error) {
    ws.send(JSON.stringify({ type: 'error', message: result.error }));
    return;
  }

  ws.send(JSON.stringify({
    type: 'guessSubmitted',
    targetId: data.targetId,
    guessNumber: data.guessNumber
  }));

  // 通知被猜測的玩家（不透露猜測內容）
  sendToPlayer(data.targetId, {
    type: 'someoneGuessedYou',
    guesserId: clientInfo.id,
    guesserName: clientInfo.playerName
  });
}

/**
 * 處理玩家完成回合
 */
function handleFinishRound(ws, clientInfo) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState) return;

  const result = gameManager.playerFinished(room, clientInfo.id);
  
  if (result.alreadyFinished) {
    return;
  }

  // 通知所有玩家誰完成了
  broadcastToRoom(clientInfo.roomCode, {
    type: 'playerFinished',
    playerId: clientInfo.id,
    playerName: clientInfo.playerName,
    bonusAwarded: result.bonusAwarded,
    finishOrder: result.finishOrder
  });

  // 如果所有人都完成，結算回合
  if (result.allFinished) {
    clearRoundTimer(room);
    endCurrentRound(room);
  }
}

/**
 * 處理下一回合
 */
function handleNextRound(ws, clientInfo) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState) return;

  if (room.hostId !== clientInfo.id) {
    ws.send(JSON.stringify({ type: 'error', message: '只有房主可以開始下一回合' }));
    return;
  }

  if (room.gameState.phase === 'ended') {
    ws.send(JSON.stringify({ type: 'error', message: '遊戲已結束' }));
    return;
  }

  // 開始新回合
  const roundInfo = gameManager.startRound(room);

  room.players.forEach(player => {
    const privateInfo = gameManager.getPlayerPrivateInfo(room, player.id);
    sendToPlayer(player.id, {
      type: 'roundStarted',
      round: roundInfo.round,
      totalRounds: roundInfo.totalRounds,
      words: roundInfo.words,
      privateInfo: privateInfo,
      duration: roundInfo.duration
    });
  });

  startRoundTimer(room);
}

/**
 * 處理聊天訊息
 */
function handleChat(ws, clientInfo, data) {
  if (!clientInfo.roomCode) return;

  broadcastToRoom(clientInfo.roomCode, {
    type: 'chat',
    playerId: clientInfo.id,
    playerName: clientInfo.playerName,
    message: data.message,
    timestamp: Date.now()
  });
}

/**
 * 開始回合計時器
 */
function startRoundTimer(room) {
  const gameState = room.gameState;
  
  gameState.timer = setTimeout(() => {
    // 時間到，強制結算
    room.players.forEach(player => {
      gameManager.playerFinished(room, player.id);
    });
    endCurrentRound(room);
  }, gameState.roundDuration);
}

/**
 * 清除回合計時器
 */
function clearRoundTimer(room) {
  if (room.gameState && room.gameState.timer) {
    clearTimeout(room.gameState.timer);
    room.gameState.timer = null;
  }
}

/**
 * 結算當前回合
 */
function endCurrentRound(room) {
  const result = gameManager.endRound(room);

  // 廣播回合結果
  broadcastToRoom(room.code, {
    type: 'roundEnded',
    ...result
  });

  // 如果遊戲結束，發送最終排名
  if (result.isGameEnd) {
    const rankings = gameManager.getFinalRanking(room);
    broadcastToRoom(room.code, {
      type: 'gameEnded',
      rankings: rankings
    });
  }
}

/**
 * 清理房間資訊（移除敏感資料）
 */
function sanitizeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    difficulty: room.difficulty,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.isHost
    })),
    gameState: room.gameState ? {
      phase: room.gameState.phase,
      round: room.gameState.round,
      totalRounds: room.gameState.totalRounds
    } : null
  };
}

// WebSocket 連線處理
wss.on('connection', (ws) => {
  const clientId = generateClientId();
  clients.set(ws, { id: clientId, roomCode: null, playerName: null });

  console.log(`玩家連線: ${clientId}`);

  // 發送連線確認
  ws.send(JSON.stringify({ type: 'connected', playerId: clientId }));

  ws.on('message', (message) => {
    handleMessage(ws, message.toString());
  });

  ws.on('close', () => {
    const clientInfo = clients.get(ws);
    console.log(`玩家斷線: ${clientInfo?.id}`);

    // 處理玩家離開房間
    if (clientInfo?.roomCode) {
      const room = roomManager.leaveRoom(clientInfo.roomCode, clientInfo.id);
      if (room) {
        broadcastToRoom(clientInfo.roomCode, {
          type: 'playerLeft',
          playerId: clientInfo.id,
          players: room.players,
          newHostId: room.hostId
        });
      }
    }

    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket 錯誤:', error);
  });
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎨 Pictomania 伺服器已啟動: http://localhost:${PORT}`);
});
