/**
 * Pictomania 線上版 - 伺服器主程式
 * 
 * 新規則流程：
 * 1. 繪畫階段（80秒）- 每個人抽到不同題目組合，畫其中一項
 * 2. 猜測階段 - 依序展示每個人的畫作，先猜對加分多，猜錯扣分
 * 3. 5 回合後結束
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

// 儲存玩家的繪圖資料
const playerDrawings = new Map(); // playerId -> [drawData]

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
        
      case 'finishDrawing':
        handleFinishDrawing(ws, clientInfo);
        break;
        
      case 'submitGuess':
        handleSubmitGuess(ws, clientInfo, data);
        break;
        
      case 'nextGuessing':
        handleNextGuessing(ws, clientInfo);
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
  const { playerName, difficulty, isObserver } = data;
  
  if (!playerName || playerName.trim().length === 0) {
    ws.send(JSON.stringify({ type: 'error', message: '請輸入玩家名稱' }));
    return;
  }

  const room = roomManager.createRoom(clientInfo.id, playerName.trim(), difficulty || 'mixed', isObserver || false);
  clientInfo.roomCode = room.code;
  clientInfo.playerName = playerName.trim();
  clientInfo.isObserver = isObserver || false;

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

  if (room.players.length < 2) {
    ws.send(JSON.stringify({ type: 'error', message: '至少需要 2 位玩家才能開始' }));
    return;
  }

  // 清除之前的繪圖資料
  room.players.forEach(p => playerDrawings.delete(p.id));

  // 初始化遊戲
  room.gameState = gameManager.initGame(room);
  
  // 開始第一回合（繪畫階段）
  const roundInfo = gameManager.startRound(room);

  // 通知所有玩家遊戲開始（進入繪畫階段）
  room.players.forEach(player => {
    const privateInfo = gameManager.getPlayerPrivateInfo(room, player.id);
    sendToPlayer(player.id, {
      type: 'drawingPhaseStarted',
      round: roundInfo.round,
      totalRounds: roundInfo.totalRounds,
      privateInfo: privateInfo,
      duration: roundInfo.duration,
      players: room.players
    });
  });

  // 設定繪畫階段計時器
  startDrawingTimer(room);
}

/**
 * 處理繪圖資料
 */
function handleDraw(ws, clientInfo, data) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState || room.gameState.phase !== 'drawing') return;

  // 儲存繪圖資料
  if (!playerDrawings.has(clientInfo.id)) {
    playerDrawings.set(clientInfo.id, []);
  }
  playerDrawings.get(clientInfo.id).push(data.drawData);

  // 繪畫階段不需要即時同步給其他玩家
}

/**
 * 處理清除畫布
 */
function handleClearCanvas(ws, clientInfo) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState || room.gameState.phase !== 'drawing') return;

  // 清除該玩家的繪圖資料
  playerDrawings.set(clientInfo.id, []);
}

/**
 * 處理玩家完成繪圖
 */
function handleFinishDrawing(ws, clientInfo) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState) return;

  const result = gameManager.playerFinishedDrawing(room, clientInfo.id);
  
  if (result.alreadyFinished) {
    return;
  }

  // 通知所有玩家誰完成了
  broadcastToRoom(clientInfo.roomCode, {
    type: 'playerFinishedDrawing',
    playerId: clientInfo.id,
    playerName: clientInfo.playerName
  });

  // 如果所有人都完成繪圖，進入猜測階段
  if (result.allFinished) {
    clearTimer(room);
    startGuessingPhase(room);
  }
}

/**
 * 處理提交猜測
 */
function handleSubmitGuess(ws, clientInfo, data) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room) return;

  const result = gameManager.submitGuess(room, clientInfo.id, data.guessNumber);
  
  if (result.error) {
    ws.send(JSON.stringify({ type: 'error', message: result.error }));
    return;
  }

  ws.send(JSON.stringify({
    type: 'guessSubmitted',
    isCorrect: result.isCorrect
  }));

  // 如果所有人都猜完了，結算這個作品
  if (result.allGuessed) {
    clearTimer(room);
    endCurrentGuessing(room);
  }
}

/**
 * 處理進入下一個玩家的猜測
 */
function handleNextGuessing(ws, clientInfo) {
  const room = roomManager.getRoom(clientInfo.roomCode);
  if (!room || !room.gameState) return;

  if (room.hostId !== clientInfo.id) {
    ws.send(JSON.stringify({ type: 'error', message: '只有房主可以繼續' }));
    return;
  }

  // 開始猜測下一個玩家
  const nextGuessing = gameManager.startNextGuessing(room);
  
  if (nextGuessing) {
    // 還有玩家要猜
    const targetPlayerId = nextGuessing.targetPlayerId;
    const drawings = playerDrawings.get(targetPlayerId) || [];

    broadcastToRoom(room.code, {
      type: 'guessingPhaseStarted',
      ...nextGuessing,
      drawings: drawings
    });

    startGuessingTimer(room);
  } else {
    // 所有人都猜完了，結算回合
    const roundResult = gameManager.endRound(room);
    
    broadcastToRoom(room.code, {
      type: 'roundEnded',
      ...roundResult
    });

    if (roundResult.isGameEnd) {
      const rankings = gameManager.getFinalRanking(room);
      broadcastToRoom(room.code, {
        type: 'gameEnded',
        rankings: rankings
      });
    }
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

  // 清除之前的繪圖資料
  room.players.forEach(p => playerDrawings.delete(p.id));

  // 開始新回合（繪畫階段）
  const roundInfo = gameManager.startRound(room);

  room.players.forEach(player => {
    const privateInfo = gameManager.getPlayerPrivateInfo(room, player.id);
    sendToPlayer(player.id, {
      type: 'drawingPhaseStarted',
      round: roundInfo.round,
      totalRounds: roundInfo.totalRounds,
      privateInfo: privateInfo,
      duration: roundInfo.duration
    });
  });

  startDrawingTimer(room);
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
 * 開始繪畫階段計時器
 */
function startDrawingTimer(room) {
  const gameState = room.gameState;
  
  gameState.timer = setTimeout(() => {
    // 時間到，強制結束繪畫階段
    room.players.forEach(player => {
      gameManager.playerFinishedDrawing(room, player.id);
    });
    startGuessingPhase(room);
  }, gameState.drawingDuration);
}

/**
 * 開始猜測階段
 */
function startGuessingPhase(room) {
  const nextGuessing = gameManager.startNextGuessing(room);
  
  if (nextGuessing) {
    const targetPlayerId = nextGuessing.targetPlayerId;
    const drawings = playerDrawings.get(targetPlayerId) || [];

    broadcastToRoom(room.code, {
      type: 'guessingPhaseStarted',
      ...nextGuessing,
      drawings: drawings
    });

    startGuessingTimer(room);
  }
}

/**
 * 開始猜測計時器
 */
function startGuessingTimer(room) {
  const gameState = room.gameState;
  
  gameState.timer = setTimeout(() => {
    // 時間到，結算當前猜測
    endCurrentGuessing(room);
  }, gameState.guessingDuration);
}

/**
 * 結算當前猜測
 */
function endCurrentGuessing(room) {
  const result = gameManager.endCurrentGuessing(room);

  broadcastToRoom(room.code, {
    type: 'guessingEnded',
    ...result
  });
}

/**
 * 清除計時器
 */
function clearTimer(room) {
  if (room.gameState && room.gameState.timer) {
    clearTimeout(room.gameState.timer);
    room.gameState.timer = null;
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

    // 清除繪圖資料
    if (clientInfo?.id) {
      playerDrawings.delete(clientInfo.id);
    }

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
