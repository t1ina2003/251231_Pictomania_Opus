/**
 * 房間管理器
 * 負責房間的建立、加入、離開和查詢
 */

const rooms = new Map();

/**
 * 生成 6 位數房間碼
 */
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

/**
 * 建立新房間
 * @param {string} hostId - 房主的連線 ID
 * @param {string} hostName - 房主名稱
 * @param {string} difficulty - 難度設定
 * @returns {object} 房間資訊
 */
function createRoom(hostId, hostName, difficulty = 'mixed', hostIsObserver = false) {
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    hostId: hostId,
    hostIsObserver: hostIsObserver,
    difficulty: difficulty,
    players: [{
      id: hostId,
      name: hostName,
      color: getPlayerColor(0),
      isHost: true,
      isObserver: hostIsObserver,
      isReady: false,
      score: 0
    }],
    gameState: null,
    createdAt: Date.now()
  };
  rooms.set(roomCode, room);
  return room;
}

/**
 * 加入房間
 * @param {string} roomCode - 房間碼
 * @param {string} playerId - 玩家連線 ID
 * @param {string} playerName - 玩家名稱
 * @returns {object|null} 房間資訊或 null（如果加入失敗）
 */
function joinRoom(roomCode, playerId, playerName) {
  const room = rooms.get(roomCode);
  if (!room) {
    return { error: '找不到此房間' };
  }
  if (room.gameState && room.gameState.phase !== 'waiting') {
    return { error: '遊戲已經開始' };
  }
  if (room.players.length >= 6) {
    return { error: '房間已滿（最多 6 人）' };
  }
  if (room.players.some(p => p.id === playerId)) {
    return { error: '你已經在房間中' };
  }

  const playerIndex = room.players.length;
  room.players.push({
    id: playerId,
    name: playerName,
    color: getPlayerColor(playerIndex),
    isHost: false,
    isObserver: false,
    isReady: false,
    score: 0
  });

  return room;
}

/**
 * 離開房間
 * @param {string} roomCode - 房間碼
 * @param {string} playerId - 玩家連線 ID
 * @returns {object|null} 更新後的房間資訊
 */
function leaveRoom(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return null;

  const wasHost = room.players[playerIndex].isHost;
  room.players.splice(playerIndex, 1);

  // 如果房間空了，刪除房間
  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return null;
  }

  // 如果離開的是房主，指定新房主
  if (wasHost && room.players.length > 0) {
    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
  }

  return room;
}

/**
 * 獲取房間資訊
 * @param {string} roomCode - 房間碼
 * @returns {object|null}
 */
function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

/**
 * 根據玩家 ID 獲取所在房間
 * @param {string} playerId - 玩家連線 ID
 * @returns {object|null}
 */
function getRoomByPlayerId(playerId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === playerId)) {
      return room;
    }
  }
  return null;
}

/**
 * 更新房間遊戲狀態
 * @param {string} roomCode - 房間碼
 * @param {object} gameState - 遊戲狀態
 */
function updateGameState(roomCode, gameState) {
  const room = rooms.get(roomCode);
  if (room) {
    room.gameState = gameState;
  }
}

/**
 * 獲取玩家顏色
 * @param {number} index - 玩家索引
 * @returns {string} 顏色代碼
 */
function getPlayerColor(index) {
  const colors = [
    '#FF6B6B', // 紅
    '#4ECDC4', // 青
    '#45B7D1', // 藍
    '#96CEB4', // 綠
    '#FFEAA7', // 黃
    '#DDA0DD'  // 紫
  ];
  return colors[index % colors.length];
}

/**
 * 清理過期房間（超過 2 小時）
 */
function cleanupExpiredRooms() {
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > twoHours) {
      rooms.delete(code);
    }
  }
}

// 每 30 分鐘清理一次過期房間
setInterval(cleanupExpiredRooms, 30 * 60 * 1000);

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomByPlayerId,
  updateGameState,
  getPlayerColor
};
