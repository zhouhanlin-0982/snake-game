class SnakeController {
    constructor() {
      this.model = new SnakeModel();
      this.view = new SnakeView(this.model);
      this.lastRafTime = performance.now();
      this.lastTick = performance.now();
      this.swipePointerId = null;
      this.swipeStartX = 0;
      this.swipeStartY = 0;
      this.boostBarPointerId = null;
  
      // ========== 回放系统状态机 ==========
      this.isReplaying = false;      // 是否处于回放模式
      this.replayPaused = false;     // 回放是否暂停
      this.replayIndex = 0;          // 当前播放到第几帧
      this.replaySpeed = 1;          // 倍速
      this.replayTimeoutId = null;   // setTimeout 句柄（精确调度）
      this.expectedNextReplayTime = 0; // 期望下一帧的绝对时间戳
    }
  
    init() {
      if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
          const rr = Math.min(r, w / 2, h / 2);
          this.moveTo(x + rr, y);
          this.arcTo(x + w, y, x + w, y + h, rr);
          this.arcTo(x + w, y + h, x, y + h, rr);
          this.arcTo(x, y + h, x, y, rr);
          this.arcTo(x, y, x + w, y, rr);
          this.closePath();
        };
      }
  
      this.bindEvents();
      this.view.syncSoundButton(this.model.soundMuted);
      this.view.renderLeaderboard(this.model.loadLeaderboard());
      this.view.syncTouchHint();
      this.view.syncPauseLabels(false);
      this.resetGame();
      requestAnimationFrame((t) => this.gameLoop(t));
    }
  
    bindEvents() {
      this.view.btnRestart.addEventListener("click", () => this.resetGame());
      this.view.btnPause.addEventListener("click", () => {
        this.model.resumeAudio();
        this.togglePause();
      });
      this.view.btnOverlay.addEventListener("pointerdown", (ev) => {
        if (!this.model.paused) return;
        ev.stopPropagation();
        ev.preventDefault();
        this.togglePause();
      }, { passive: false });
      this.view.btnSound.addEventListener("click", () => {
        this.model.soundMuted = !this.model.soundMuted;
        localStorage.setItem(this.model.MUTE_KEY, this.model.soundMuted ? "1" : "0");
        this.view.syncSoundButton(this.model.soundMuted);
        if (!this.model.soundMuted) this.model.resumeAudio();
      });
      this.view.btnSaveLb.addEventListener("click", () => this.submitLeaderboard());
      this.view.btnSkipLb.addEventListener("click", () => this.skipLeaderboard());
  
      // ========== 回放按钮事件绑定 ==========
      if (this.view.btnReplay) {
        this.view.btnReplay.addEventListener("click", () => this.startReplay());
      }
      if (this.view.btnReplayPause) {
        this.view.btnReplayPause.addEventListener("click", () => this.toggleReplayPause());
      }
      if (this.view.btnReplayStop) {
        this.view.btnReplayStop.addEventListener("click", () => this.stopReplay());
      }
      if (this.view.btnReplaySlow) {
        this.view.btnReplaySlow.addEventListener("click", () => this.setReplaySpeed(0.5));
      }
      if (this.view.btnReplayFast) {
        this.view.btnReplayFast.addEventListener("click", () => this.setReplaySpeed(2.0));
      }
  
      this.view.playerName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submitLeaderboard();
        }
      });
  
      document.querySelectorAll("[data-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.model.resumeAudio();
          this.pickDifficulty(btn.getAttribute("data-diff"));
        });
      });
  
      this.bindDirButton(this.view.touchUp, { x: 0, y: -1 });
      this.bindDirButton(this.view.touchDown, { x: 0, y: 1 });
      this.bindDirButton(this.view.touchLeft, { x: -1, y: 0 });
      this.bindDirButton(this.view.touchRight, { x: 1, y: 0 });
  
      this.view.touchPause.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        ev.preventDefault();
        this.model.resumeAudio();
        this.togglePause();
      }, { passive: false });
  
      this.view.canvasWrap.addEventListener("pointerdown", (ev) => this.onWrapPointerDown(ev), { passive: false });
      this.view.canvasWrap.addEventListener("pointermove", (ev) => this.onWrapPointerMove(ev));
      this.view.canvasWrap.addEventListener("pointerup", (ev) => this.onWrapPointerUp(ev));
      this.view.canvasWrap.addEventListener("pointercancel", (ev) => this.onWrapPointerUp(ev));
      this.view.canvasWrap.addEventListener("lostpointercapture", (ev) => this.onWrapPointerUp(ev));
  
      this.view.boostBar.addEventListener("pointerdown", (ev) => this.onBoostBarDown(ev), { passive: false });
      this.view.boostBar.addEventListener("pointerup", (ev) => this.onBoostBarUp(ev));
      this.view.boostBar.addEventListener("pointercancel", (ev) => this.onBoostBarUp(ev));
      this.view.boostBar.addEventListener("lostpointercapture", (ev) => this.onBoostBarUp(ev));
  
      window.addEventListener("blur", () => {
        this.model.boostKey = false;
        this.model.boostPointer = false;
        this.model.boostBarHeld = false;
        this.boostBarPointerId = null;
        this.view.syncBoostUi(false, false);
      });
  
      window.addEventListener("keydown", (e) => this.handleKeydown(e));
      window.addEventListener("keyup", (e) => this.handleKeyup(e));
  
      window.addEventListener("resize", () => {
        this.view.applyCanvasResolution();
        this.model.setWorldSize(this.view.LOGICAL, this.view.CELL);
        this.view.syncTouchHint();
      });
  
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          this.view.applyCanvasResolution();
          this.model.setWorldSize(this.view.LOGICAL, this.view.CELL);
        });
        ro.observe(this.view.canvasWrap);
      }
  
      ["click", "touchstart"].forEach((ev) => {
        document.body.addEventListener(ev, () => this.model.resumeAudio(), { passive: true });
      });
    }
  
    bindDirButton(el, vec) {
      el.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        ev.preventDefault();
        this.model.resumeAudio();
        this.trySetDirection(vec);
      }, { passive: false });
    }
  
    gameLoop(now) {
      requestAnimationFrame((t) => this.gameLoop(t));
  
      // ========== 状态机隔离：回放模式只渲染 ==========
      if (this.isReplaying) {
        this.view.renderCanvas();
        return;
      }
  
      const dt = Math.min(40, now - this.lastRafTime);
      this.lastRafTime = now;
  
      this.model.stepParticles(dt);
      this.view.syncBoostUi(this.model.isBoosting(), this.model.boostBarHeld);
  
      if (!this.model.running) {
        this.view.renderCanvas();
        return;
      }
      if (this.model.gameOver) {
        this.view.renderCanvas();
        return;
      }
      if (this.model.paused) {
        this.view.renderCanvas();
        return;
      }
  
      this.model.expireTempObstacle();
  
      let guard = 0;
      while (guard++ < 16) {
        const stepInt = this.model.tickMs * (this.model.isBoosting() ? this.model.BOOST_TICK_MUL : 1);
        if (now - this.lastTick < stepInt) break;
        this.lastTick += stepInt;
  
        // 累积游戏时间，用于回放时间轴
        this.model.gameElapsed += stepInt;
  
        const oldFood = { ...this.model.food };
        const result = this.model.moveSnake();
  
        if (result.gameOver) {
          this.openGameOver(result.reason);
          break;
        }
  
        if (result.moved && !result.ate) {
          const teleported = this.model.tryTeleport();
          if (teleported) {
            const head = this.model.snakeHeadPos();
            const fcx = head.x * this.view.CELL + this.view.CELL * 0.5;
            const fcy = head.y * this.view.CELL + this.view.CELL * 0.5;
            this.model.spawnTeleportParticles(fcx, fcy);
            this.model.sfxTeleport();
          }
        }
  
        if (result.ate) {
          const fcx = oldFood.x * this.view.CELL + this.view.CELL * 0.5;
          const fcy = oldFood.y * this.view.CELL + this.view.CELL * 0.5;
          this.model.spawnEatParticles(fcx, fcy);
          this.view.updateScoreUI(this.model.score);
          this.model.sfxEat();
        }
      }
  
      this.view.renderCanvas();
    }
  
    handleKeydown(e) {
      const lk = e.key.toLowerCase();
      const map = {
        arrowup: { x: 0, y: -1 },
        arrowdown: { x: 0, y: 1 },
        arrowleft: { x: -1, y: 0 },
        arrowright: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
  
      if (lk === " " || lk === "spacebar") {
        if (this.model.gameOver && document.activeElement === this.view.playerName) return;
        if (!this.model.difficultyChosen || this.model.gameOver || !this.model.running) return;
        if (e.repeat) return;
        e.preventDefault();
        this.model.boostKey = true;
        this.view.syncBoostUi(this.model.isBoosting(), this.model.boostBarHeld);
        this.model.resumeAudio();
        return;
      }
  
      if (lk === "p" || e.key === "Escape") {
        if (this.model.gameOver && document.activeElement === this.view.playerName) return;
        e.preventDefault();
        if (this.model.gameOver) return;
        if (!this.model.difficultyChosen || !this.model.running) return;
        this.togglePause();
        return;
      }
  
      if (lk === "r") {
        e.preventDefault();
        this.resetGame();
        return;
      }
  
      const nd = map[lk] || map[e.key];
      if (!nd) return;
      e.preventDefault();
      this.trySetDirection(nd);
    }
  
    handleKeyup(e) {
      const lk = e.key.toLowerCase();
      if (lk === " " || lk === "spacebar") {
        this.model.boostKey = false;
        this.view.syncBoostUi(this.model.isBoosting(), this.model.boostBarHeld);
      }
    }
  
    onWrapPointerDown(ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      if (!this.model.difficultyChosen || this.model.gameOver || !this.model.running) return;
      this.model.resumeAudio();
      if (ev.pointerType === "mouse") {
        this.model.boostPointer = true;
        this.view.syncBoostUi(this.model.isBoosting(), this.model.boostBarHeld);
      }
      this.swipePointerId = ev.pointerId;
      this.swipeStartX = ev.clientX;
      this.swipeStartY = ev.clientY;
      try {
        this.view.canvasWrap.setPointerCapture(ev.pointerId);
      } catch (_) {}
    }
  
    onWrapPointerMove(ev) {
      if (this.swipePointerId !== ev.pointerId) return;
      if (!this.model.running || this.model.paused || this.model.gameOver || !this.model.difficultyChosen) return;
      const dx = ev.clientX - this.swipeStartX;
      const dy = ev.clientY - this.swipeStartY;
      const dist = Math.hypot(dx, dy);
      if (dist < this.model.SWIPE_MIN_PX) return;
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.trySetDirection({ x: dx > 0 ? 1 : -1, y: 0 });
      } else {
        this.trySetDirection({ x: 0, y: dy > 0 ? 1 : -1 });
      }
      this.swipeStartX = ev.clientX;
      this.swipeStartY = ev.clientY;
    }
  
    onWrapPointerUp(ev) {
      if (this.swipePointerId != null && ev.pointerId !== this.swipePointerId) return;
      this.model.boostPointer = false;
      this.swipePointerId = null;
      this.view.syncBoostUi(this.model.isBoosting(), this.model.boostBarHeld);
      try {
        this.view.canvasWrap.releasePointerCapture(ev.pointerId);
      } catch (_) {}
    }
  
    onBoostBarDown(ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      if (!this.model.difficultyChosen || this.model.gameOver || !this.model.running || this.model.paused) return;
      ev.preventDefault();
      this.model.resumeAudio();
      this.model.boostBarHeld = true;
      this.boostBarPointerId = ev.pointerId;
      this.view.syncBoostUi(this.model.isBoosting(), true);
      try {
        this.view.boostBar.setPointerCapture(ev.pointerId);
      } catch (_) {}
    }
  
    onBoostBarUp(ev) {
      if (this.boostBarPointerId != null && ev.pointerId !== this.boostBarPointerId) return;
      this.model.boostBarHeld = false;
      this.boostBarPointerId = null;
      this.view.syncBoostUi(this.model.isBoosting(), false);
      try {
        this.view.boostBar.releasePointerCapture(ev.pointerId);
      } catch (_) {}
    }
  
    trySetDirection(nd) {
      if (!this.model.difficultyChosen || this.model.gameOver || !this.model.running) return;
      if (this.model.paused) return;
      if (!this.model.opposite(nd, this.model.dir)) this.model.nextDir = nd;
    }
  
    togglePause() {
      if (!this.model.difficultyChosen || this.model.gameOver || !this.model.running) return;
      this.model.paused = !this.model.paused;
      if (this.model.paused) {
        this.model.notePauseForObstacles();
        this.model.boostKey = false;
        this.model.boostPointer = false;
        this.model.boostBarHeld = false;
        if (this.boostBarPointerId != null && this.view.boostBar) {
          try { this.view.boostBar.releasePointerCapture(this.boostBarPointerId); } catch (_) {}
          this.boostBarPointerId = null;
        }
        if (this.swipePointerId != null) {
          try { this.view.canvasWrap.releasePointerCapture(this.swipePointerId); } catch (_) {}
          this.swipePointerId = null;
        }
        this.view.syncBoostUi(false, false);
        this.model.sfxPause();
        this.view.showPauseScreen("已暂停", "点击继续、按 P / Esc，或使用工具栏与下方按钮");
      } else {
        this.model.resumeObstacleAfterPause();
        this.view.hideOverlay();
        this.lastTick = performance.now();
      }
      this.view.syncPauseLabels(this.model.paused);
    }
  
    pickDifficulty(key) {
      if (!this.model.DIFF[key]) return;
      this.model.currentDifficulty = key;
      this.model.difficultyChosen = true;
      this.view.updateDiffLabel(this.model.DIFF_NAMES[key]);
      this.resetGame();
    }
  
    resetGame() {
      // 重置时强制停止任何进行中的回放
      this.stopReplay();
  
      this.model.resetGameData();
      this.view.updateScoreUI(0);
      this.view.syncBoostUi(false, false);
      this.view.applyCanvasResolution();
      this.model.setWorldSize(this.view.LOGICAL, this.view.CELL);
      this.swipePointerId = null;
      this.boostBarPointerId = null;
  
      if (!this.model.difficultyChosen) {
        this.view.updateHighScoreUI(this.model.loadBest());
        this.view.showStartScreen();
        this.view.syncPauseLabels(false);
        return;
      }
  
      this.view.hideOverlay();
      this.lastTick = performance.now();
      this.lastRafTime = performance.now();
      this.view.updateHighScoreUI(this.model.loadBest());
      this.model.sfxStart();
      this.view.syncPauseLabels(false);
      this.model.startObstacleSpawner();
    }
  
    openGameOver(reason) {
      this.model.stopObstacleSpawner();
      this.model.boostKey = false;
      this.model.boostPointer = false;
      this.model.boostBarHeld = false;
      if (this.boostBarPointerId != null && this.view.boostBar) {
        try { this.view.boostBar.releasePointerCapture(this.boostBarPointerId); } catch (_) {}
        this.boostBarPointerId = null;
      }
      if (this.swipePointerId != null) {
        try { this.view.canvasWrap.releasePointerCapture(this.swipePointerId); } catch (_) {}
        this.swipePointerId = null;
      }
      this.view.syncBoostUi(false, false);
      const newBest = this.model.updateHighScore(this.model.score);
      this.view.updateHighScoreUI(newBest);
      this.model.sfxDie();
      this.model.pendingLbScore = this.model.score;
  
      // 有回放数据才显示回放按钮
      const hasReplay = this.model.replayHistory.length > 1;
      this.view.showGameOverScreen(reason, this.model.score, hasReplay);
  
      this.view.syncPauseLabels(false);
      this.view.playerName.value = localStorage.getItem("snake-last-name") || "";
      this.view.focusPlayerName();
    }
  
    submitLeaderboard() {
      if (this.model.pendingLbScore == null) return;
      const name = (this.view.playerName.value || "匿名").trim() || "匿名";
      localStorage.setItem("snake-last-name", name.slice(0, 12));
      const row = { name: name.slice(0, 12), score: this.model.pendingLbScore, ts: Date.now() };
      const rows = this.model.loadLeaderboard();
      rows.push(row);
      rows.sort((a, b) => b.score - a.score);
      this.model.saveLeaderboard(rows);
      this.view.renderLeaderboard(rows);
      this.model.pendingLbScore = null;
      this.returnToDifficultySelect();
    }
  
    skipLeaderboard() {
      this.model.pendingLbScore = null;
      this.returnToDifficultySelect();
    }
  
    returnToDifficultySelect() {
      this.model.difficultyChosen = false;
      this.view.hideDiffPill();
      this.resetGame();
    }
  
    // ==================== 回放系统（核心教学区） ====================
  
    startReplay() {
      if (!this.model.replayHistory.length) return;
  
      // 状态转换：游戏结束 → 回放中
      this.model.running = false;
      this.model.paused = false;
      this.isReplaying = true;
      this.replayPaused = false;
      this.replayIndex = 0;
      this.replaySpeed = 1;
  
      // 应用第 0 帧（初始状态）
      this.applySnapshot(0);
  
      // 显示回放 HUD
      this.view.showReplayHud(this.model.replayHistory.length);
      this.view.updateReplayProgress(1, this.model.replayHistory.length);
  
      // 启动精确调度链
      this.expectedNextReplayTime = performance.now();
      this.scheduleReplayFrame();
    }
  
    // 精确调度：基于时间戳补偿，避免 setInterval 的累积漂移
    scheduleReplayFrame() {
      if (!this.isReplaying || this.replayPaused) return;
      if (this.replayIndex >= this.model.replayHistory.length - 1) {
        // 播放到最后一帧，自动进入暂停状态
        this.pauseReplay();
        return;
      }
  
      const currentSnap = this.model.replayHistory[this.replayIndex];
      const nextSnap = this.model.replayHistory[this.replayIndex + 1];
  
      // 计算下一帧的期望间隔（基于原始游戏时间 / 倍速）
      const interval = (nextSnap.gameElapsed - currentSnap.gameElapsed) / this.replaySpeed;
  
      // 关键：维护期望时间轴，而非固定间隔
      this.expectedNextReplayTime += interval;
      const delay = Math.max(0, this.expectedNextReplayTime - performance.now());
  
      this.replayTimeoutId = setTimeout(() => {
        this.replayIndex++;
        this.applySnapshot(this.replayIndex);
        this.view.updateReplayProgress(this.replayIndex + 1, this.model.replayHistory.length);
        this.scheduleReplayFrame(); // 链式调用，形成递归调度
      }, delay);
    }
  
    // 将模型状态恢复到某一历史快照（纯内存操作，不触发录制）
    applySnapshot(idx) {
      const snap = this.model.replayHistory[idx];
      if (!snap) return;
  
      // 恢复蛇身（TypedArray.set 批量写入，性能最好）
      this.model.snakeX.set(snap.snakeX);
      this.model.snakeY.set(snap.snakeY);
      this.model.snakeHead = snap.snakeHead;
      this.model.snakeTail = snap.snakeTail;
      this.model.snakeLen = snap.snakeLen;
  
      // 恢复食物、分数、方向
      this.model.food = { ...snap.food };
      this.model.score = snap.score;
      this.model.dir = { ...snap.dir };
      this.model.nextDir = { ...snap.nextDir };
      this.model.tickMs = snap.tickMs;
      this.model.gameElapsed = snap.gameElapsed;
  
      // 恢复障碍物（使用 Infinity 避免被时间系统提前清除，由快照序列控制生命周期）
      if (snap.tempObstacle) {
        this.model.tempObstacle = {
          x: snap.tempObstacle.x,
          y: snap.tempObstacle.y,
          until: Infinity
        };
      } else {
        this.model.tempObstacle = null;
      }
  
      // 禁用传送门冷却，确保回放时传送门视觉正常
      this.model.portalCooldownUntil = 0;
  
      // 清空历史粒子，保持回放画面干净
      this.model.particles = [];
  
      // 同步 UI
      this.view.updateScoreUI(snap.score);
    }
  
    pauseReplay() {
      if (!this.isReplaying) return;
      this.replayPaused = true;
      clearTimeout(this.replayTimeoutId);
      this.view.syncReplayPauseButton(true);
    }
  
    resumeReplay() {
      if (!this.isReplaying || !this.replayPaused) return;
      this.replayPaused = false;
  
      // 时间基准偏移：从"现在"重新开始调度，跳过暂停的时长
      this.expectedNextReplayTime = performance.now();
      this.scheduleReplayFrame();
      this.view.syncReplayPauseButton(false);
    }
  
    toggleReplayPause() {
      if (this.replayPaused) this.resumeReplay();
      else this.pauseReplay();
    }
  
    stopReplay() {
      if (!this.isReplaying) return;
      this.isReplaying = false;
      this.replayPaused = false;
      clearTimeout(this.replayTimeoutId);
      this.view.hideReplayHud();
      // 回到难度选择界面
      this.returnToDifficultySelect();
    }
  
    setReplaySpeed(speed) {
      this.replaySpeed = speed;
      this.view.updateReplaySpeedLabel(speed);
  
      // 如果正在播放，重置时间基准并立即重新调度
      if (this.isReplaying && !this.replayPaused) {
        clearTimeout(this.replayTimeoutId);
        this.expectedNextReplayTime = performance.now();
        this.scheduleReplayFrame();
      }
    }
  }
  
  const app = new SnakeController();
  app.init();