/**
 * 題目卡詞彙資料庫
 * 分為三個難度等級
 */

// 簡單難度 - 常見物品和動物
const easyWords = [
  '太陽', '月亮', '星星', '雲朵', '雨滴',
  '房子', '汽車', '飛機', '火車', '船',
  '貓咪', '狗狗', '兔子', '鳥', '魚',
  '蘋果', '香蕉', '西瓜', '草莓', '葡萄',
  '花朵', '樹木', '山', '河流', '海洋',
  '書本', '鉛筆', '剪刀', '電話', '電視',
  '眼鏡', '帽子', '鞋子', '手錶', '雨傘',
  '蛋糕', '冰淇淋', '漢堡', '披薩', '麵條'
];

// 中等難度 - 需要一些創意
const mediumWords = [
  '醫生', '警察', '廚師', '老師', '農夫',
  '跳舞', '游泳', '跑步', '睡覺', '唱歌',
  '開心', '難過', '生氣', '驚訝', '害怕',
  '城堡', '橋樑', '燈塔', '風車', '帳篷',
  '恐龍', '獅子', '大象', '企鵝', '長頸鹿',
  '機器人', '火箭', '潛水艇', '直升機', '摩托車',
  '鑰匙', '鏡子', '時鐘', '蠟燭', '氣球',
  '彩虹', '閃電', '雪人', '沙灘', '森林'
];

// 困難難度 - 抽象概念或複雜場景
const hardWords = [
  '自由', '和平', '夢想', '希望', '友誼',
  '音樂', '藝術', '科學', '魔法', '冒險',
  '婚禮', '派對', '野餐', '露營', '旅行',
  '地震', '火山', '龍捲風', '海嘯', '極光',
  '外星人', '幽靈', '吸血鬼', '木乃伊', '巫師',
  '金字塔', '自由女神', '埃菲爾鐵塔', '長城', '富士山',
  '下棋', '釣魚', '攀岩', '滑雪', '衝浪',
  '發明家', '探險家', '太空人', '消防員', '魔術師'
];

/**
 * 根據難度獲取詞彙列表
 * @param {string} difficulty - 'easy', 'medium', 'hard', 'mixed'
 * @returns {string[]}
 */
function getWordsByDifficulty(difficulty) {
  switch (difficulty) {
    case 'easy':
      return [...easyWords];
    case 'medium':
      return [...mediumWords];
    case 'hard':
      return [...hardWords];
    case 'mixed':
    default:
      return [...easyWords, ...mediumWords, ...hardWords];
  }
}

/**
 * 從詞彙庫中隨機選取指定數量的詞彙
 * @param {number} count - 需要的詞彙數量
 * @param {string} difficulty - 難度等級
 * @returns {string[]}
 */
function getRandomWords(count, difficulty = 'mixed') {
  const words = getWordsByDifficulty(difficulty);
  const shuffled = words.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

module.exports = {
  easyWords,
  mediumWords,
  hardWords,
  getWordsByDifficulty,
  getRandomWords
};
