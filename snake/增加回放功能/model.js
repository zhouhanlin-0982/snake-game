class SnakeModel {
    constructor() {
      this.COLS = 20;
      this.ROWS = 20;
      this.SNAKE_CAP = this.COLS * this.ROWS;
      this.snakeX = new Int16Array(this.SNAKE_CAP);
      this.snakeY = new Int16Array(this.SNAKE_CAP);
      this.snakeHead = 0;
      this.snakeTail = 0;
      this.snakeLen = 0;
  
      this.LOGICAL = 360;
      this.CELL = this.LOGICAL / this.COLS;
  
      this.BOOST_TICK_MUL = 0.52;
      this.SWIPE_MIN_PX = 28;
  
      this.boostKey = false;
      this.boostPointer = false;
      this.boostBarHeld = false;
  
      this.particles = [];
  
      this.FIXED_OBSTACLES = [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 5 },
        { x: 14, y: 14 },
        { x: 14, y: 15 },
        { x: 15, y: 14 },
        { x: 10, y: 3 },
        { x: 10, y: 4 },
        { x: 9, y: 16 },
        { x: 10, y: 16 },
      ];
      this.fixedObstacleSet = new Set(this.FIXED_OBSTACLES.map((o) => o.x + "," + o.y));
  
      this.PORTAL_POSITIONS = [
        { x: 0, y: Math.floor(this.ROWS / 2) },
        { x: this.COLS - 1, y: Math.floor(this.ROWS / 2) },
        { x: Math.floor(this.COLS / 2), y: 0 },
        { x: Math.floor(this.COLS / 2), y: this.ROWS - 1 },
      ];
      this.portalCooldownUntil = 0;
      this.portalCooldownMs = 1000;
  
      this.BEST_KEY = "snake-best-score";
      this.LB_KEY = "snake-leaderboard-v2";
      this.MUTE_KEY = "snake-sound-muted";
  
      this.DIFF = {
        easy: { start: 200, min: 105, step: 1 },
        normal: { start: 130, min: 72, step: 2 },
        hard: { start: 82, min: 42, step: 3 },
      };
      this.DIFF_NAMES = { easy: "简单", normal: "普通", hard: "困难" };
  
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.food = { x: 0, y: 0 };
      this.score = 0;
      this.tickMs = 130;
  
      this.running = false;
      this.paused = false;
      this.gameOver = false;
      this.difficultyChosen = false;
      this.currentDifficulty = "normal";
      this.soundMuted = localStorage.getItem(this.MUTE_KEY) === "1";
      this.audioCtx = null;
      this.pendingLbScore = null;
  
      this.obstacleIntervalId = null;
      this.tempObstacle = null;
      this.pauseObstacleAnchor = null;
  
      // ========== 回放系统：状态录制 ==========
      this.replayHistory = [];   // 每一帧的快照数组
      this.isRecording = false; // 是否正在录制
      this.gameElapsed = 0;     // 游戏进行时间（ms），用于回放时间轴
    }
  
    setWorldSize(logical, cell) {
      this.LOGICAL = logical;
      this.CELL = cell;
    }
  
    isBoosting() {
      return (this.boostKey || this.boostPointer || this.boostBarHeld) && this.running && !this.paused && !this.gameOver && this.difficultyChosen;
    }
  
    snakeHeadPos() {
      return { x: this.snakeX[this.snakeHead], y: this.snakeY[this.snakeHead] };
    }
  
    iterateSnakeSegments(cb) {
      if (this.snakeLen <= 0) return;
      let i = this.snakeTail;
      for (let k = 0; k < this.snakeLen; k++) {
        const isHead = k === this.snakeLen - 1;
        cb(this.snakeX[i], this.snakeY[i], isHead);
        if (i === this.snakeHead) break;
        i = (i + 1) % this.SNAKE_CAP;
      }
    }
  
    addSnakeCellsToOccSet(occ) {
      this.iterateSnakeSegments((x, y) => {
        occ.add(x + "," + y);
      });
    }
  
    stopObstacleSpawner() {
      if (this.obstacleIntervalId != null) {
        clearInterval(this.obstacleIntervalId);
        this.obstacleIntervalId = null;
      }
      this.tempObstacle = null;
      this.pauseObstacleAnchor = null;
    }
  
    startObstacleSpawner() {
      this.stopObstacleSpawner();
      this.obstacleIntervalId = setInterval(() => this.spawnTempObstacle(), 5000);
    }
  
    notePauseForObstacles() {
      this.pauseObstacleAnchor = performance.now();
    }
  
    resumeObstacleAfterPause() {
      if (this.pauseObstacleAnchor == null) return;
      const dt = performance.now() - this.pauseObstacleAnchor;
      if (this.tempObstacle) this.tempObstacle.until += dt;
      this.pauseObstacleAnchor = null;
    }
  
    spawnTempObstacle() {
      if (!this.running || this.paused || this.gameOver || !this.difficultyChosen) return;
      const occ = new Set();
      this.addSnakeCellsToOccSet(occ);
      occ.add(this.food.x + "," + this.food.y);
      for (const k of this.fixedObstacleSet) occ.add(k);
      if (this.tempObstacle) occ.add(this.tempObstacle.x + "," + this.tempObstacle.y);
      for (const p of this.PORTAL_POSITIONS) occ.add(p.x + "," + p.y);
      const free = [];
      for (let x = 0; x < this.COLS; x++) {
        for (let y = 0; y < this.ROWS; y++) {
          const key = x + "," + y;
          if (!occ.has(key)) free.push({ x, y });
        }
      }
      if (!free.length) return;
      const pick = free[this.randInt(free.length)];
      this.tempObstacle = { x: pick.x, y: pick.y, until: performance.now() + 3000 };
    }
  
    tempObstacleActive() {
      if (!this.tempObstacle) return false;
      if (this.paused) return true;
      return performance.now() < this.tempObstacle.until;
    }
  
    expireTempObstacle() {
      if (this.tempObstacle && performance.now() >= this.tempObstacle.until) {
        this.tempObstacle = null;
      }
    }
  
    blockedByObstacle(nh) {
      if (this.fixedObstacleSet.has(nh.x + "," + nh.y)) return true;
      if (this.tempObstacle && performance.now() < this.tempObstacle.until && nh.x === this.tempObstacle.x && nh.y === this.tempObstacle.y) return true;
      return false;
    }
  
    isPortalBlocked(p) {
      if (this.fixedObstacleSet.has(p.x + "," + p.y)) return true;
      if (this.tempObstacle && this.tempObstacleActive() && this.tempObstacle.x === p.x && this.tempObstacle.y === p.y) return true;
      return false;
    }
  
    getActivePortals() {
      return this.PORTAL_POSITIONS.filter(p => !this.isPortalBlocked(p));
    }
  
    tryTeleport() {
      const now = performance.now();
      if (now < this.portalCooldownUntil) return false;
  
      const head = this.snakeHeadPos();
      const activePortals = this.getActivePortals();
      const onPortal = activePortals.find(p => p.x === head.x && p.y === head.y);
      if (!onPortal) return false;
  
      const exits = activePortals.filter(p => p.x !== head.x || p.y !== head.y);
      if (!exits.length) return false;
  
      for (let i = exits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [exits[i], exits[j]] = [exits[j], exits[i]];
      }
  
      const bodySet = new Set();
      if (this.snakeLen > 1) {
        let i = this.snakeTail;
        for (let k = 0; k < this.snakeLen - 1; k++) {
          bodySet.add(this.snakeX[i] + "," + this.snakeY[i]);
          i = (i + 1) % this.SNAKE_CAP;
        }
      }
  
      for (const exit of exits) {
        if (!bodySet.has(exit.x + "," + exit.y)) {
          this.snakeX[this.snakeHead] = exit.x;
          this.snakeY[this.snakeHead] = exit.y;
          if (exit.x === 0) this.nextDir = { x: 1, y: 0 };
          else if (exit.x === this.COLS - 1) this.nextDir = { x: -1, y: 0 };
          else if (exit.y === 0) this.nextDir = { x: 0, y: 1 };
          else if (exit.y === this.ROWS - 1) this.nextDir = { x: 0, y: -1 };
          this.portalCooldownUntil = now + this.portalCooldownMs;
  
          // 录制传送事件
          if (this.isRecording) this.recordSnapshot(['teleport']);
          return true;
        }
      }
      return false;
    }
  
    getAudio() {
      if (!this.audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.audioCtx = new AC();
      }
      return this.audioCtx;
    }
  
    resumeAudio() {
      const ctx = this.getAudio();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    }
  
    playTone(freq, dur, vol, type) {
      if (this.soundMuted) return;
      const ctx = this.getAudio();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
  
    sfxEat() {
      this.resumeAudio();
      this.playTone(520, 0.05, 0.06, "triangle");
      setTimeout(() => this.playTone(784, 0.07, 0.06, "triangle"), 45);
    }
  
    sfxDie() {
      this.resumeAudio();
      this.playTone(185, 0.12, 0.09, "sawtooth");
      setTimeout(() => this.playTone(95, 0.22, 0.1, "sawtooth"), 90);
    }
  
    sfxPause() {
      this.resumeAudio();
      this.playTone(330, 0.06, 0.04, "sine");
    }
  
    sfxStart() {
      this.resumeAudio();
      this.playTone(440, 0.06, 0.045, "sine");
      setTimeout(() => this.playTone(554, 0.08, 0.045, "sine"), 70);
    }
  
    sfxTeleport() {
      this.resumeAudio();
      this.playTone(660, 0.08, 0.05, "sine");
      setTimeout(() => this.playTone(880, 0.1, 0.04, "sine"), 60);
    }
  
    loadLeaderboard() {
      try {
        const raw = localStorage.getItem(this.LB_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }
  
    saveLeaderboard(rows) {
      localStorage.setItem(this.LB_KEY, JSON.stringify(rows.slice(0, 10)));
    }
  
    loadBest() {
      const v = parseInt(localStorage.getItem(this.BEST_KEY) || "0", 10);
      return Number.isFinite(v) ? v : 0;
    }
  
    updateHighScore(currentScore) {
      const best = this.loadBest();
      if (currentScore > best) {
        localStorage.setItem(this.BEST_KEY, String(currentScore));
        return currentScore;
      }
      return best;
    }
  
    randInt(n) {
      return Math.floor(Math.random() * n);
    }
  
    spawnEatParticles(cx, cy) {
      const n = 22 + this.randInt(14);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = this.LOGICAL * 0.0055 * (1.1 + Math.random() * 2.4);
        const roll = Math.random();
        const rgb = roll < 0.38 ? "167,139,250" : roll < 0.72 ? "52,211,153" : "251,113,133";
        this.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          rgb,
        });
      }
    }
  
    spawnTeleportParticles(cx, cy) {
      const n = 16 + this.randInt(10);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = this.LOGICAL * 0.004 * (1.2 + Math.random() * 2.0);
        this.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          rgb: "139,92,246",
        });
      }
    }
  
    stepParticles(dt) {
      if (!this.particles.length) return;
      const decay = dt * 0.0011;
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.965;
        p.vy *= 0.965;
        p.life -= decay;
      }
      this.particles = this.particles.filter((p) => p.life > 0.03);
    }
  
    emptyCell() {
      const occupied = new Set();
      this.addSnakeCellsToOccSet(occupied);
      for (const k of this.fixedObstacleSet) occupied.add(k);
      if (this.tempObstacleActive()) occupied.add(this.tempObstacle.x + "," + this.tempObstacle.y);
      for (const p of this.PORTAL_POSITIONS) occupied.add(p.x + "," + p.y);
      let x, y, guard = 0;
      do {
        x = this.randInt(this.COLS);
        y = this.randInt(this.ROWS);
        guard++;
      } while (occupied.has(x + "," + y) && guard < this.COLS * this.ROWS * 3);
      return { x, y };
    }
  
    tickCfg() {
      return this.DIFF[this.currentDifficulty] || this.DIFF.normal;
    }
  
    opposite(a, b) {
      return a.x === -b.x && a.y === -b.y;
    }
  
    // ========== 回放：录制快照 ==========
    recordSnapshot(events = []) {
      if (!this.isRecording) return;
  
      // 深拷贝教学：
      // 1) this.snakeX 是 Int16Array，直接赋值是引用拷贝。
      //    .slice() 会返回一个全新的 TypedArray，元素值全量复制。
      // 2) { ...this.food } 是对象浅拷贝，本项目 food 只有 x/y 一层，足够。
      // 3) [...events] 复制事件标签数组（元素是字符串原始值，无引用问题）。
  
      const snap = {
        snakeX: this.snakeX.slice(),          // Int16Array → 新 Int16Array
        snakeY: this.snakeY.slice(),
        snakeHead: this.snakeHead,
        snakeTail: this.snakeTail,
        snakeLen: this.snakeLen,
        food: { ...this.food },               // 对象浅拷贝
        score: this.score,
        dir: { ...this.dir },
        nextDir: { ...this.nextDir },
        tickMs: this.tickMs,
        gameElapsed: this.gameElapsed,        // 原始值，直接复制
        events: [...events],                   // 数组浅拷贝（此处等价于深拷贝）
        tempObstacle: this.tempObstacle ? {
          x: this.tempObstacle.x,
          y: this.tempObstacle.y
        } : null,
        portalCooldownUntil: this.portalCooldownUntil
      };
  
      this.replayHistory.push(snap);
    }
  
    moveSnake() {
      if (!this.running || this.paused || this.gameOver) {
        return { moved: false, ate: false };
      }
  
      this.dir = { ...this.nextDir };
      const head = this.snakeHeadPos();
      const nh = { x: head.x + this.dir.x, y: head.y + this.dir.y };
  
      if (nh.x < 0 || nh.x >= this.COLS || nh.y < 0 || nh.y >= this.ROWS) {
        this.gameOver = true;
        this.isRecording = false;
        this.recordSnapshot(['die', 'wall']);
        return { moved: false, ate: false, gameOver: true, reason: "撞墙" };
      }
  
      if (this.blockedByObstacle(nh)) {
        this.gameOver = true;
        this.isRecording = false;
        this.recordSnapshot(['die', 'obstacle']);
        return { moved: false, ate: false, gameOver: true, reason: "撞到障碍" };
      }
  
      const eating = nh.x === this.food.x && nh.y === this.food.y;
  
      let i = eating ? this.snakeTail : (this.snakeTail + 1) % this.SNAKE_CAP;
      while (true) {
        if (this.snakeX[i] === nh.x && this.snakeY[i] === nh.y) {
          this.gameOver = true;
          this.isRecording = false;
          this.recordSnapshot(['die', 'self']);
          return { moved: false, ate: false, gameOver: true, reason: "咬到自己" };
        }
        if (i === this.snakeHead) break;
        i = (i + 1) % this.SNAKE_CAP;
      }
  
      if (eating && this.snakeLen >= this.SNAKE_CAP) {
        this.gameOver = true;
        this.isRecording = false;
        this.recordSnapshot(['die', 'full']);
        return { moved: false, ate: false, gameOver: true, reason: "蛇身占满棋盘" };
      }
  
      const newHeadIdx = (this.snakeHead + 1) % this.SNAKE_CAP;
      this.snakeX[newHeadIdx] = nh.x;
      this.snakeY[newHeadIdx] = nh.y;
      this.snakeHead = newHeadIdx;
  
      if (eating) {
        this.score += 10;
        this.snakeLen++;
        this.food = this.emptyCell();
        const cfg = this.tickCfg();
        this.tickMs = Math.max(cfg.min, this.tickMs - cfg.step);
        this.recordSnapshot(['ate']);
        return { moved: true, ate: true, gameOver: false };
      } else {
        this.snakeTail = (this.snakeTail + 1) % this.SNAKE_CAP;
        this.recordSnapshot(['move']);
        return { moved: true, ate: false, gameOver: false };
      }
    }
  
    resetGameData() {
      this.stopObstacleSpawner();
      this.particles = [];
      this.boostKey = false;
      this.boostPointer = false;
      this.boostBarHeld = false;
      this.portalCooldownUntil = 0;
  
      // 重置回放数据
      this.replayHistory = [];
      this.isRecording = false;
      this.gameElapsed = 0;
  
      this.snakeLen = 3;
      this.snakeTail = 0;
      this.snakeHead = 2;
      this.snakeX[0] = 6;
      this.snakeY[0] = 10;
      this.snakeX[1] = 7;
      this.snakeY[1] = 10;
      this.snakeX[2] = 8;
      this.snakeY[2] = 10;
      this.dir = { x: 1, y: 0 };
      this.nextDir = { ...this.dir };
      this.score = 0;
      this.paused = false;
      this.gameOver = false;
      this.food = this.emptyCell();
  
      if (!this.difficultyChosen) {
        this.tickMs = this.DIFF.normal.start;
        this.running = false;
        return;
      }
  
      const cfg = this.tickCfg();
      this.tickMs = cfg.start;
      this.running = true;
  
      // 开始录制初始帧
      this.isRecording = true;
      this.recordSnapshot(['start']);
    }
  }