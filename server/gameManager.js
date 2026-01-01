/**
 * 遊戲管理器
 * 負責遊戲邏輯、回合流程、計分等
 */

const { getRandomWords } = require('./wordCards');

/**
 * 初始化遊戲狀態
 * @param {object} room - 房間物件
 * @returns {object} 初始遊戲狀態
 */
function initGame(room) {
  const playerCount = room.players.length;
  
  // 準備計分板塊（每人 5 個，分數遞減：5,4,3,2,1）
  const scoringTokens = [5, 4, 3, 2, 1];
  
  // 準備加分板塊（根據人數調整）
  const bonusTokens = [];
  for (let i = playerCount - 1; i >= 1; i--) {
    bonusTokens.push(i);
  }

  // 初始化每位玩家的遊戲資料
  const playerData = {};
  room.players.forEach(player => {
    playerData[player.id] = {
      scoringTokens: [...scoringTokens], // 可送出的計分板塊
      receivedTokens: [],                 // 收到的計分板塊
      bonusTokens: [],                    // 獲得的加分板塊
      assignedNumber: 0,                  // 本回合分配的題目數字
      guesses: {},                        // 對其他玩家的猜測 { playerId: number }
      hasFinished: false,                 // 是否已完成本回合
      wrongGuesses: 0,                    // 錯誤猜測次數（用於判定老鼠屎）
      totalScore: 0                       // 總分
    };
  });

  return {
    phase: 'waiting',      // waiting, playing, guessing, scoring, ended
    round: 0,
    totalRounds: 5,
    words: [],             // 本回合的 7 個題目詞彙
    playerData: playerData,
    bonusTokens: bonusTokens,
    availableBonusTokens: [],  // 本回合可領取的加分板塊
    finishOrder: [],           // 完成順序
    roundStartTime: null,
    roundDuration: 90000,      // 90 秒
    timer: null
  };
}

/**
 * 開始新回合
 * @param {object} room - 房間物件
 * @returns {object} 回合開始資訊
 */
function startRound(room) {
  const gameState = room.gameState;
  gameState.round++;
  gameState.phase = 'playing';
  
  // 選取本回合的 7 個題目詞彙
  gameState.words = getRandomWords(7, room.difficulty);
  
  // 為每位玩家分配題目數字（1-7）
  const numbers = shuffleArray([1, 2, 3, 4, 5, 6, 7]);
  room.players.forEach((player, index) => {
    const pd = gameState.playerData[player.id];
    pd.assignedNumber = numbers[index];
    pd.guesses = {};
    pd.hasFinished = false;
    pd.wrongGuesses = 0;
  });

  // 準備本回合的加分板塊
  const bonusCount = Math.min(room.players.length - 1, gameState.bonusTokens.length);
  gameState.availableBonusTokens = gameState.bonusTokens.slice(0, bonusCount);
  gameState.finishOrder = [];
  
  gameState.roundStartTime = Date.now();

  return {
    round: gameState.round,
    totalRounds: gameState.totalRounds,
    words: gameState.words,
    duration: gameState.roundDuration
  };
}

/**
 * 玩家提交猜測
 * @param {object} room - 房間物件
 * @param {string} guesserId - 猜測者 ID
 * @param {string} targetId - 被猜測者 ID
 * @param {number} guessNumber - 猜測的數字
 * @returns {object} 結果
 */
function submitGuess(room, guesserId, targetId, guessNumber) {
  const gameState = room.gameState;
  
  if (gameState.phase !== 'playing') {
    return { error: '現在不是猜測時間' };
  }
  
  if (guesserId === targetId) {
    return { error: '不能猜自己' };
  }

  const guesserData = gameState.playerData[guesserId];
  
  // 檢查是否已經猜過這個人
  if (guesserData.guesses[targetId] !== undefined) {
    return { error: '已經對這位玩家提交過猜測' };
  }

  guesserData.guesses[targetId] = guessNumber;

  return { 
    success: true,
    guesserId,
    targetId,
    // 不返回正確答案，等結算時才揭曉
  };
}

/**
 * 玩家完成繪圖和猜測
 * @param {object} room - 房間物件
 * @param {string} playerId - 玩家 ID
 * @returns {object} 結果
 */
function playerFinished(room, playerId) {
  const gameState = room.gameState;
  const playerData = gameState.playerData[playerId];
  
  if (playerData.hasFinished) {
    return { alreadyFinished: true };
  }

  playerData.hasFinished = true;
  gameState.finishOrder.push(playerId);

  // 分配加分板塊
  const finishPosition = gameState.finishOrder.length - 1;
  if (finishPosition < gameState.availableBonusTokens.length) {
    const bonus = gameState.availableBonusTokens[finishPosition];
    playerData.bonusTokens.push(bonus);
  }

  // 檢查是否所有人都完成
  const allFinished = room.players.every(p => 
    gameState.playerData[p.id].hasFinished
  );

  return {
    success: true,
    bonusAwarded: finishPosition < gameState.availableBonusTokens.length 
      ? gameState.availableBonusTokens[finishPosition] 
      : 0,
    allFinished: allFinished,
    finishOrder: gameState.finishOrder
  };
}

/**
 * 結算回合
 * @param {object} room - 房間物件
 * @returns {object} 回合結算結果
 */
function endRound(room) {
  const gameState = room.gameState;
  gameState.phase = 'scoring';

  const results = [];
  let maxWrongGuesses = 0;

  // 處理每位玩家的猜測
  room.players.forEach(player => {
    const playerData = gameState.playerData[player.id];
    const playerResult = {
      playerId: player.id,
      playerName: player.name,
      assignedWord: gameState.words[playerData.assignedNumber - 1],
      assignedNumber: playerData.assignedNumber,
      correctGuesses: [],
      wrongGuesses: [],
      tokensGiven: [],
      tokensReceived: [],
      bonusTokens: playerData.bonusTokens.slice(-1), // 本回合獲得的加分板塊
      roundScore: 0
    };

    // 檢查此玩家對其他人的猜測
    Object.entries(playerData.guesses).forEach(([targetId, guessNumber]) => {
      const targetPlayer = room.players.find(p => p.id === targetId);
      const targetData = gameState.playerData[targetId];
      
      if (guessNumber === targetData.assignedNumber) {
        // 猜對了！
        playerResult.correctGuesses.push({
          targetId,
          targetName: targetPlayer.name,
          guessedNumber: guessNumber
        });
        
        // 從被猜者那裡獲得計分板塊
        if (targetData.scoringTokens.length > 0) {
          const token = targetData.scoringTokens.shift();
          playerData.receivedTokens.push(token);
          playerResult.tokensReceived.push(token);
        }
      } else {
        // 猜錯了
        playerData.wrongGuesses++;
        playerResult.wrongGuesses.push({
          targetId,
          targetName: targetPlayer.name,
          guessedNumber: guessNumber,
          correctNumber: targetData.assignedNumber
        });
      }
    });

    maxWrongGuesses = Math.max(maxWrongGuesses, playerData.wrongGuesses);
    results.push(playerResult);
  });

  // 判定老鼠屎（猜錯最多的人）
  const poopyPlayers = room.players.filter(p => 
    gameState.playerData[p.id].wrongGuesses === maxWrongGuesses && maxWrongGuesses > 0
  );

  // 計算本回合得分
  results.forEach(result => {
    const playerData = gameState.playerData[result.playerId];
    const isPoopy = poopyPlayers.some(p => p.id === result.playerId);
    
    // 收到的計分板塊 = +分
    let score = playerData.receivedTokens.reduce((sum, t) => sum + t, 0);
    
    // 未送出的計分板塊 = -分
    score -= playerData.scoringTokens.reduce((sum, t) => sum + t, 0);
    
    // 加分板塊處理
    const latestBonus = playerData.bonusTokens[playerData.bonusTokens.length - 1] || 0;
    if (isPoopy) {
      // 老鼠屎的加分變扣分
      score -= latestBonus;
      result.isPoopy = true;
    } else if (playerData.receivedTokens.length > 0 || 
               Object.keys(playerData.guesses).length > 0) {
      // 有參與遊戲才能獲得加分
      score += latestBonus;
    }

    result.roundScore = score;
    result.isPoopy = isPoopy;
    
    // 累加總分
    playerData.totalScore += score;
    result.totalScore = playerData.totalScore;
  });

  // 排序結果（本回合得分高的在前）
  results.sort((a, b) => b.roundScore - a.roundScore);

  // 檢查遊戲是否結束
  const isGameEnd = gameState.round >= gameState.totalRounds;
  if (isGameEnd) {
    gameState.phase = 'ended';
  }

  // 重置玩家的計分板塊供下一回合使用
  if (!isGameEnd) {
    room.players.forEach(player => {
      const pd = gameState.playerData[player.id];
      pd.scoringTokens = [5, 4, 3, 2, 1];
      pd.receivedTokens = [];
    });
  }

  return {
    round: gameState.round,
    results: results,
    isGameEnd: isGameEnd,
    poopyPlayers: poopyPlayers.map(p => ({ id: p.id, name: p.name }))
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
  return {
    assignedNumber: pd.assignedNumber,
    assignedWord: gameState.words[pd.assignedNumber - 1],
    scoringTokens: pd.scoringTokens,
    guesses: pd.guesses,
    hasFinished: pd.hasFinished
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
  submitGuess,
  playerFinished,
  endRound,
  getFinalRanking,
  getPlayerPrivateInfo
};
