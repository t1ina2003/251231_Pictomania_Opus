/**
 * Canvas 繪圖管理
 */
class CanvasManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.tool = 'brush';
    this.brushColor = '#000000';
    this.brushSize = 4;
    this.drawHistory = [];
    this.onDraw = null; // 繪圖回調
    
    this.init();
  }

  init() {
    // 設定畫布背景為白色
    this.clear(false);
    
    // 綁定事件
    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
    
    // 觸控支援
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
  }

  /**
   * 獲取畫布座標
   */
  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  /**
   * 處理觸控開始
   */
  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY
    };
    this.startDrawing(mouseEvent);
  }

  /**
   * 處理觸控移動
   */
  handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY
    };
    this.draw(mouseEvent);
  }

  /**
   * 開始繪圖
   */
  startDrawing(e) {
    this.isDrawing = true;
    const coords = this.getCanvasCoords(e);
    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  /**
   * 繪圖
   */
  draw(e) {
    if (!this.isDrawing) return;

    const coords = this.getCanvasCoords(e);
    
    const drawData = {
      type: 'line',
      fromX: this.lastX,
      fromY: this.lastY,
      toX: coords.x,
      toY: coords.y,
      color: this.tool === 'eraser' ? '#FFFFFF' : this.brushColor,
      size: this.tool === 'eraser' ? this.brushSize * 3 : this.brushSize
    };

    this.drawLine(drawData);
    this.drawHistory.push(drawData);

    // 發送繪圖資料到伺服器
    if (this.onDraw) {
      this.onDraw(drawData);
    }

    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  /**
   * 停止繪圖
   */
  stopDrawing() {
    this.isDrawing = false;
  }

  /**
   * 繪製線條
   */
  drawLine(data) {
    this.ctx.beginPath();
    this.ctx.moveTo(data.fromX, data.fromY);
    this.ctx.lineTo(data.toX, data.toY);
    this.ctx.strokeStyle = data.color;
    this.ctx.lineWidth = data.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
    this.ctx.closePath();
  }

  /**
   * 設定工具
   */
  setTool(tool) {
    this.tool = tool;
  }

  /**
   * 設定畫筆顏色
   */
  setBrushColor(color) {
    this.brushColor = color;
  }

  /**
   * 設定畫筆大小
   */
  setBrushSize(size) {
    this.brushSize = parseInt(size);
  }

  /**
   * 清除畫布
   */
  clear(notify = true) {
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawHistory = [];
    
    if (notify && this.onClear) {
      this.onClear();
    }
  }

  /**
   * 獲取繪圖歷史
   */
  getHistory() {
    return this.drawHistory;
  }
}

/**
 * 遠端畫布管理（顯示其他玩家的繪圖）
 */
class RemoteCanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.clear();
  }

  /**
   * 繪製遠端繪圖資料
   */
  draw(data) {
    if (data.type === 'line') {
      this.ctx.beginPath();
      this.ctx.moveTo(data.fromX, data.fromY);
      this.ctx.lineTo(data.toX, data.toY);
      this.ctx.strokeStyle = data.color;
      this.ctx.lineWidth = data.size;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.stroke();
      this.ctx.closePath();
    }
  }

  /**
   * 清除畫布
   */
  clear() {
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
