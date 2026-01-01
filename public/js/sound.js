/**
 * 音效管理器
 * 使用 Web Audio API 生成音效，不需要外部音檔
 */
class SoundManager {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
    this.musicEnabled = true;
    this.volume = 0.5;
    this.musicVolume = 0.3;
    this.currentMusic = null;
    this.musicGain = null;
    
    // 嘗試初始化 AudioContext
    this.initAudioContext();
  }

  /**
   * 初始化 AudioContext
   */
  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.audioContext.createGain();
      this.musicGain.connect(this.audioContext.destination);
      this.musicGain.gain.value = this.musicVolume;
    } catch (e) {
      console.warn('無法初始化 AudioContext:', e);
    }
  }

  /**
   * 確保 AudioContext 已啟動（需要用戶互動後）
   */
  ensureAudioContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * 播放音效
   */
  playSound(type) {
    if (!this.enabled || !this.audioContext) return;
    
    this.ensureAudioContext();
    
    switch (type) {
      case 'click':
        this.playClick();
        break;
      case 'success':
        this.playSuccess();
        break;
      case 'error':
        this.playError();
        break;
      case 'correct':
        this.playCorrect();
        break;
      case 'wrong':
        this.playWrong();
        break;
      case 'bonus':
        this.playBonus();
        break;
      case 'countdown':
        this.playCountdown();
        break;
      case 'roundStart':
        this.playRoundStart();
        break;
      case 'roundEnd':
        this.playRoundEnd();
        break;
      case 'gameEnd':
        this.playGameEnd();
        break;
    }
  }

  /**
   * 創建振盪器
   */
  createOscillator(frequency, type = 'sine', duration = 0.1) {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    
    gainNode.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
    
    return oscillator;
  }

  /**
   * 按鈕點擊音效
   */
  playClick() {
    this.createOscillator(800, 'sine', 0.05);
  }

  /**
   * 成功音效
   */
  playSuccess() {
    const now = this.audioContext.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      setTimeout(() => this.createOscillator(freq, 'sine', 0.15), i * 100);
    });
  }

  /**
   * 錯誤音效
   */
  playError() {
    this.createOscillator(200, 'sawtooth', 0.15);
  }

  /**
   * 答對音效
   */
  playCorrect() {
    const now = this.audioContext.currentTime;
    this.createOscillator(523, 'sine', 0.1);
    setTimeout(() => this.createOscillator(784, 'sine', 0.2), 100);
  }

  /**
   * 答錯音效
   */
  playWrong() {
    this.createOscillator(200, 'square', 0.2);
    setTimeout(() => this.createOscillator(150, 'square', 0.3), 150);
  }

  /**
   * 獎勵音效
   */
  playBonus() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => this.createOscillator(freq, 'sine', 0.15), i * 80);
    });
  }

  /**
   * 倒數音效
   */
  playCountdown() {
    this.createOscillator(440, 'sine', 0.08);
  }

  /**
   * 回合開始音效
   */
  playRoundStart() {
    [392, 523, 659, 784].forEach((freq, i) => {
      setTimeout(() => this.createOscillator(freq, 'triangle', 0.2), i * 100);
    });
  }

  /**
   * 回合結束音效
   */
  playRoundEnd() {
    [784, 659, 523, 392].forEach((freq, i) => {
      setTimeout(() => this.createOscillator(freq, 'sine', 0.2), i * 120);
    });
  }

  /**
   * 遊戲結束音效
   */
  playGameEnd() {
    const melody = [523, 659, 784, 1047, 784, 1047];
    melody.forEach((freq, i) => {
      setTimeout(() => this.createOscillator(freq, 'sine', 0.25), i * 150);
    });
  }

  /**
   * 播放背景音樂
   */
  playMusic(phase) {
    if (!this.musicEnabled || !this.audioContext) return;
    
    this.ensureAudioContext();
    this.stopMusic();
    
    // 根據階段選擇不同的音樂模式
    switch (phase) {
      case 'lobby':
        this.playLobbyMusic();
        break;
      case 'drawing':
        this.playDrawingMusic();
        break;
      case 'guessing':
        this.playGuessingMusic();
        break;
      case 'results':
        this.playResultsMusic();
        break;
    }
  }

  /**
   * 停止背景音樂
   */
  stopMusic() {
    if (this.currentMusic) {
      try {
        this.currentMusic.stop();
      } catch (e) {}
      this.currentMusic = null;
    }
  }

  /**
   * 大廳音樂 - 平靜的氛圍
   */
  playLobbyMusic() {
    this.playAmbient([261, 329, 392, 523], 2000, 0.15);
  }

  /**
   * 繪畫階段音樂 - 輕快的節奏
   */
  playDrawingMusic() {
    this.playAmbient([392, 440, 494, 523], 1500, 0.12);
  }

  /**
   * 猜測階段音樂 - 緊張的氛圍
   */
  playGuessingMusic() {
    this.playAmbient([330, 370, 415, 466], 1000, 0.1);
  }

  /**
   * 結果音樂 - 歡快的氛圍
   */
  playResultsMusic() {
    this.playAmbient([523, 587, 659, 698], 1800, 0.15);
  }

  /**
   * 播放環境音樂
   */
  playAmbient(notes, interval, vol) {
    let noteIndex = 0;
    
    const playNote = () => {
      if (!this.musicEnabled) return;
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = notes[noteIndex];
      
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(vol * this.musicVolume, this.audioContext.currentTime + 0.3);
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + interval / 1000);
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + interval / 1000);
      
      noteIndex = (noteIndex + 1) % notes.length;
    };
    
    playNote();
    this.musicInterval = setInterval(playNote, interval);
    
    // 記錄當前音樂
    this.currentMusic = {
      stop: () => {
        if (this.musicInterval) {
          clearInterval(this.musicInterval);
          this.musicInterval = null;
        }
      }
    };
  }

  /**
   * 切換音效開關
   */
  toggleSound() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * 切換音樂開關
   */
  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) {
      this.stopMusic();
    }
    return this.musicEnabled;
  }

  /**
   * 設置音量
   */
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
  }

  /**
   * 設置音樂音量
   */
  setMusicVolume(value) {
    this.musicVolume = Math.max(0, Math.min(1, value));
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicVolume;
    }
  }
}

// 全域音效管理器
const sound = new SoundManager();
