/**
 * 遊戲管理器
 * 負責遊戲邏輯、回合流程、計分等
 * 
 * 新規則：
 * 1. 繪畫階段（80秒）- 每個人抽到不同題目組合，畫其中一項
 * 2. 猜測階段 - 依序展示每個人的畫作，先猜對加分多，猜錯扣分
 * 3. 5 回合後結束
 * 4. 房主可選擇作為觀察員，不參與遊戲只負責主持
 */

const { getRandomWords } = require('./wordCards');

/**
 * 獲取參與遊戲的玩家（排除觀察員）
 */
function getActivePlayers(room) {
  return room.players.filter(p => !p.isObserver);
}

/**
 * 初始化遊戲狀態
 * @param {object} room - 房間物件
 * @returns {object} 初始遊戲狀態
 */
function initGame(room) {
  const activePlayers = getActivePlayers(room);
  
  // 初始化每位參與玩家的遊戲資料
  const playerData = {};
  activePlayers.forEach(player => {
    playerData[player.id] = {
      words: [],                  // 該玩家的題目組合（7個詞）
      assignedNumber: 0,          // 玩家選擇要畫的題目編號（1-7）
      guesses: {},                // 對其他玩家的猜測 { playerId: { number, timestamp } }
      hasFinishedDrawing: false,  // 是否已完成繪圖
      roundScore: 0,              // 本回合得分
      totalScore: 0               // 總分
    };
  });

  return {
    phase: 'waiting',      // waiting, drawing, guessing, showing, scoring, ended
    round: 0,
    totalRounds: 5,
    playerData: playerData,
    activePlayers: activePlayers.map(p => p.id),  // 參與遊戲的玩家 ID
    drawingDuration: 80000,     // 繪畫階段 80 秒
    guessingDuration: 20000,    // 每個作品猜測時間 20 秒
    currentGuessingPlayer: null, // 當前被猜測的玩家
    guessingOrder: [],          // 猜測順序（玩家 ID 列表）
    guessingIndex: 0,           // 目前猜測到第幾個玩家
    guessResults: [],           // 本作品的猜測結果
    timer: null
  };
}

/**
 * 開始新回合（繪畫階段）
 * @param {object} room - 房間物件
 * @returns {object} 回合開始資訊
 */
function startRound(room) {
  const gameState = room.gameState;
  const activePlayers = getActivePlayers(room);
  gameState.round++;
  gameState.phase = 'drawing';
  
  // 為每位參與玩家分配不同的題目組合
  const allPlayerWords = {};
  activePlayers.forEach((player, index) => {
    // 每個玩家獲得獨立的 7 個題目
    const words = getRandomWords(7, room.difficulty);
    allPlayerWords[player.id] = words;
    
    const pd = gameState.playerData[player.id];
    pd.words = words;
    // 隨機分配要畫的題目編號（1-7）
    pd.assignedNumber = Math.floor(Math.random() * 7) + 1;
    pd.guesses = {};
    pd.hasFinishedDrawing = false;
    pd.roundScore = 0;
  });

  // 隨機決定猜測順序（只包含參與玩家）
  gameState.guessingOrder = shuffleArray(activePlayers.map(p => p.id));
  gameState.guessingIndex = 0;
  gameState.currentGuessingPlayer = null;
  gameState.guessResults = [];

  return {
    round: gameState.round,
    totalRounds: gameState.totalRounds,
    duration: gameState.drawingDuration,
    playerWords: allPlayerWords  // 每個玩家的題目組合
  };
}

/**
 * 玩家完成繪圖
 * @param {object} room - 房間物件
 * @param {string} playerId - 玩家 ID
 * @returns {object} 結果
 */
function playerFinishedDrawing(room, playerId) {
  const gameState = room.gameState;
  const playerData = gameState.playerData[playerId];
  
  // 觀察員不需要處理繪圖完成
  if (!playerData) {
    return { isObserver: true };
  }
  
  if (playerData.hasFinishedDrawing) {
    return { alreadyFinished: true };
  }

  playerData.hasFinishedDrawing = true;

  // 檢查是否所有參與玩家都完成繪圖
  const activePlayers = getActivePlayers(room);
  const allFinished = activePlayers.every(p => 
    gameState.playerData[p.id].hasFinishedDrawing
  );

  return {
    success: true,
    allFinished: allFinished
  };
}

/**
 * 開始猜測階段（展示下一個玩家的作品）
 * @param {object} room - 房間物件
 * @returns {object|null} 下一個被猜測的玩家資訊，或 null 表示猜測完成
 */
function startNextGuessing(room) {
  const gameState = room.gameState;
  
  // 如果已經猜完所有人
  if (gameState.guessingIndex >= gameState.guessingOrder.length) {
    return null;
  }

  gameState.phase = 'guessing';
  const targetPlayerId = gameState.guessingOrder[gameState.guessingIndex];
  gameState.currentGuessingPlayer = targetPlayerId;
  gameState.guessResults = [];

  const targetPlayer = room.players.find(p => p.id === targetPlayerId);
  const targetData = gameState.playerData[targetPlayerId];

  return {
    targetPlayerId: targetPlayerId,
    targetPlayerName: targetPlayer.name,
    targetPlayerColor: targetPlayer.color,
    words: targetData.words,  // 該玩家的題目組合
    guessingIndex: gameState.guessingIndex + 1,
    totalPlayers: gameState.guessingOrder.length,
    duration: gameState.guessingDuration
  };
}

/**
 * 玩家提交猜測
 * @param {object} room - 房間物件
 * @param {string} guesserId - 猜測者 ID
 * @param {number} guessNumber - 猜測的數字（1-7）
 * @returns {object} 結果
 */
function submitGuess(room, guesserId, guessNumber) {
  const gameState = room.gameState;
  
  if (gameState.phase !== 'guessing') {
    return { error: '現在不是猜測時間' };
  }
  
  const targetPlayerId = gameState.currentGuessingPlayer;
  
  // 檢查是否為觀察員（觀察員不能猜測）
  const guesser = room.players.find(p => p.id === guesserId);
  if (guesser && guesser.isObserver) {
    return { error: '觀察員不能參與猜測' };
  }
  
  if (guesserId === targetPlayerId) {
    return { error: '不能猜自己的作品' };
  }

  const guesserData = gameState.playerData[guesserId];
  
  // 如果沒有 playerData（觀察員），也不能猜測
  if (!guesserData) {
    return { error: '觀察員不能參與猜測' };
  }
  
  // 檢查是否已經猜過這個人
  if (guesserData.guesses[targetPlayerId] !== undefined) {
    return { error: '你已經提交過猜測了' };
  }

  const timestamp = Date.now();
  guesserData.guesses[targetPlayerId] = {
    number: guessNumber,
    timestamp: timestamp
  };

  // 檢查是否猜對
  const targetData = gameState.playerData[targetPlayerId];
  const isCorrect = guessNumber === targetData.assignedNumber;
  
  // 記錄猜測結果（用於排序）
  gameState.guessResults.push({
    guesserId: guesserId,
    guessNumber: guessNumber,
    isCorrect: isCorrect,
    timestamp: timestamp
  });

  // 檢查是否所有參與者都猜完了（排除觀察員和被猜測者）
  const activePlayers = room.players.filter(p => !p.isObserver && p.id !== targetPlayerId);
  const allGuessed = activePlayers.every(p => 
    gameState.playerData[p.id] && gameState.playerData[p.id].guesses[targetPlayerId] !== undefined
  );

  return { 
    success: true,
    isCorrect: isCorrect,
    allGuessed: allGuessed
  };
}

/**
 * 結算單個作品的猜測結果
 * @param {object} room - 房間物件
 * @returns {object} 結算結果
 */
function endCurrentGuessing(room) {
  const gameState = room.gameState;
  const targetPlayerId = gameState.currentGuessingPlayer;
  const targetPlayer = room.players.find(p => p.id === targetPlayerId);
  const targetData = gameState.playerData[targetPlayerId];
  
  const correctAnswer = targetData.assignedNumber;
  const correctWord = targetData.words[correctAnswer - 1];

  // 按時間排序猜對的人
  const correctGuesses = gameState.guessResults
    .filter(r => r.isCorrect)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  const wrongGuesses = gameState.guessResults.filter(r => !r.isCorrect);

  // 計分：先猜對的得分多
  const scoreTable = [5, 3, 2, 1]; // 第1名5分，第2名3分，第3名2分，其他1分
  const results = [];

  correctGuesses.forEach((guess, index) => {
    const guesser = room.players.find(p => p.id === guess.guesserId);
    const score = index < scoreTable.length ? scoreTable[index] : 1;
    gameState.playerData[guess.guesserId].roundScore += score;
    
    results.push({
      playerId: guess.guesserId,
      playerName: guesser.name,
      playerColor: guesser.color,
      guessNumber: guess.number,
      isCorrect: true,
      score: score,
      rank: index + 1
    });
  });

  // 猜錯扣分
  wrongGuesses.forEach(guess => {
    const guesser = room.players.find(p => p.id === guess.guesserId);
    const penalty = -2;
    gameState.playerData[guess.guesserId].roundScore += penalty;
    
    results.push({
      playerId: guess.guesserId,
      playerName: guesser.name,
      playerColor: guesser.color,
      guessNumber: guess.number,
      isCorrect: false,
      score: penalty,
      rank: null
    });
  });

  // 沒有猜的人（不計分也不扣分）
  const otherPlayers = room.players.filter(p => p.id !== targetPlayerId);
  otherPlayers.forEach(player => {
    if (!gameState.playerData[player.id].guesses[targetPlayerId]) {
      results.push({
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        guessNumber: null,
        isCorrect: false,
        score: 0,
        rank: null,
        didNotGuess: true
      });
    }
  });

  // 移動到下一個玩家
  gameState.guessingIndex++;
  gameState.phase = 'showing';

  return {
    targetPlayerId: targetPlayerId,
    targetPlayerName: targetPlayer.name,
    correctAnswer: correctAnswer,
    correctWord: correctWord,
    results: results,
    hasMorePlayers: gameState.guessingIndex < gameState.guessingOrder.length
  };
}

/**
 * 結算整個回合
 * @param {object} room - 房間物件
 * @returns {object} 回合結算結果
 */
function endRound(room) {
  const gameState = room.gameState;
  gameState.phase = 'scoring';

  const results = [];

  // 計算每位玩家的回合得分並累加到總分
  room.players.forEach(player => {
    const pd = gameState.playerData[player.id];
    pd.totalScore += pd.roundScore;
    
    results.push({
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      roundScore: pd.roundScore,
      totalScore: pd.totalScore
    });
  });

  // 按回合得分排序
  results.sort((a, b) => b.roundScore - a.roundScore);

  // 檢查遊戲是否結束
  const isGameEnd = gameState.round >= gameState.totalRounds;
  if (isGameEnd) {
    gameState.phase = 'ended';
  }

  return {
    round: gameState.round,
    results: results,
    isGameEnd: isGameEnd
  };
}

/**
 * 獲取最終排名
 * @param {object} room - 房間物件
 * @returns {array} 排名結果
 */
function getFinalRanking(room) {
  const gameState = room.gameState;
  
  const rankings = room.players.map(player => {
    const pd = gameState.playerData[player.id];
    return {
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      totalScore: pd.totalScore
    };
  });

  rankings.sort((a, b) => b.totalScore - a.totalScore);

  // 添加排名
  let rank = 1;
  rankings.forEach((r, index) => {
    if (index > 0 && r.totalScore < rankings[index - 1].totalScore) {
      rank = index + 1;
    }
    r.rank = rank;
  });

  return rankings;
}

/**
 * 獲取玩家的私人資訊（自己的題目）
 * @param {object} room - 房間物件
 * @param {string} playerId - 玩家 ID
 * @returns {object}
 */
function getPlayerPrivateInfo(room, playerId) {
  const gameState = room.gameState;
  if (!gameState || gameState.phase === 'waiting') {
    return null;
  }

  const pd = gameState.playerData[playerId];
  
  // 觀察員沒有 playerData，返回 null
  if (!pd) {
    return null;
  }

  return {
    words: pd.words,
    assignedNumber: pd.assignedNumber,
    assignedWord: pd.words[pd.assignedNumber - 1],
    hasFinishedDrawing: pd.hasFinishedDrawing
  };
}

/**
 * 洗牌函數
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = {
  initGame,
  startRound,
  playerFinishedDrawing,
  startNextGuessing,
  submitGuess,
  endCurrentGuessing,
  endRound,
  getFinalRanking,
  getPlayerPrivateInfo
};
