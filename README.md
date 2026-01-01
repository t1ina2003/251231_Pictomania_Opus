# 妙筆神猜 Pictomania Online

線上多人繪圖猜謎遊戲，基於經典桌遊 Pictomania 的規則製作。

## 遊戲規則

- 3-6 位玩家參與
- 每位玩家根據自己的題目畫圖，同時猜測其他玩家畫的是什麼
- 猜對得分，猜錯最多的成為「老鼠屎」要扣分
- 5 回合後分數最高者獲勝

## 本地執行

```bash
# 安裝依賴
npm install

# 啟動伺服器
npm start

# 開啟瀏覽器訪問
http://localhost:3000
```

## 部署到 Render

1. 將專案推送到 GitHub

2. 前往 [Render](https://render.com) 並登入

3. 點擊「New +」→「Web Service」

4. 連結你的 GitHub 儲存庫

5. 設定：
   - **Name**: pictomania（或你喜歡的名稱）
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

6. 點擊「Create Web Service」

7. 等待部署完成，獲得類似 `https://pictomania-xxxx.onrender.com` 的網址

## 技術架構

- **後端**: Node.js + Express + WebSocket (ws)
- **前端**: HTML5 Canvas + 原生 JavaScript
- **即時通訊**: WebSocket

## 檔案結構

```
├── server/
│   ├── index.js          # 伺服器主程式
│   ├── gameManager.js    # 遊戲邏輯
│   ├── roomManager.js    # 房間管理
│   └── wordCards.js      # 題目詞彙
├── public/
│   ├── index.html        # 主頁面
│   ├── css/style.css     # 樣式表
│   └── js/
│       ├── app.js        # 主程式
│       ├── socket.js     # WebSocket 通訊
│       ├── canvas.js     # 繪圖邏輯
│       └── game.js       # 遊戲邏輯
├── package.json
└── render.yaml           # Render 部署配置
```

## 注意事項

- Render 免費方案會在閒置 15 分鐘後休眠，首次訪問需等待約 30 秒喚醒
- 遊戲進行中持續有連線則不會休眠
