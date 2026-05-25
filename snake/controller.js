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
    Date.now();
    console.log(Date.now());
    requestAnimationFrame((t) => this.gameLoop(t));

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
    this.view.showGameOverScreen(reason, this.model.score);
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
}

const app = new SnakeController();
app.init();