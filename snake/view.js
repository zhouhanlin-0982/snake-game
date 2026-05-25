class SnakeView {
  constructor(model) {
    this.model = model;
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.canvasWrap = document.getElementById("canvasWrap");
    this.boostBar = document.getElementById("boostBar");

    this.scoreEl = document.getElementById("score");
    this.bestEl = document.getElementById("best");
    this.overlay = document.getElementById("overlay");
    this.overlayTitle = document.getElementById("overlayTitle");
    this.overlayMsg = document.getElementById("overlayMsg");
    this.overlayDefaultActions = document.getElementById("overlayDefaultActions");
    this.btnOverlay = document.getElementById("btnOverlay");
    this.btnRestart = document.getElementById("btnRestart");
    this.btnPause = document.getElementById("btnPause");
    this.btnSound = document.getElementById("btnSound");
    this.pageDifficulty = document.getElementById("pageDifficulty");
    this.pageStandard = document.getElementById("pageStandard");
    this.pillDifficulty = document.getElementById("pillDifficulty");
    this.diffLabel = document.getElementById("diffLabel");
    this.controlsHintTouch = document.getElementById("controlsHintTouch");
    this.touchUp = document.getElementById("touchUp");
    this.touchDown = document.getElementById("touchDown");
    this.touchLeft = document.getElementById("touchLeft");
    this.touchRight = document.getElementById("touchRight");
    this.touchPause = document.getElementById("touchPause");
    this.lbBody = document.getElementById("lbBody");
    this.lbEmpty = document.getElementById("lbEmpty");
    this.lbTable = document.getElementById("lbTable");
    this.overlayGameOver = document.getElementById("overlayGameOver");
    this.goScoreLine = document.getElementById("goScoreLine");
    this.playerName = document.getElementById("playerName");
    this.btnSaveLb = document.getElementById("btnSaveLb");
    this.btnSkipLb = document.getElementById("btnSkipLb");

    this.LOGICAL = 360;
    this.CELL = this.LOGICAL / this.model.COLS;
    this.applyCanvasResolution();
  }

  applyCanvasResolution() {
    const rect = this.canvasWrap.getBoundingClientRect();
    let w = Math.floor(rect.width);
    if (!w || w < 200) w = 280;
    w = Math.min(w, 560);
    this.LOGICAL = w;
    this.CELL = this.LOGICAL / this.model.COLS;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.LOGICAL * dpr);
    this.canvas.height = Math.round(this.LOGICAL * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  updateScoreUI(score) {
    this.scoreEl.textContent = String(score);
  }

  updateHighScoreUI(best) {
    this.bestEl.textContent = String(best);
  }

  updateDiffLabel(name) {
    this.diffLabel.textContent = name;
    this.pillDifficulty.hidden = false;
  }

  hideDiffPill() {
    this.pillDifficulty.hidden = true;
  }

  renderLeaderboard(rows) {
    rows = rows
      .filter((r) => r && typeof r.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    this.lbBody.textContent = "";
    if (!rows.length) {
      this.lbTable.style.display = "none";
      this.lbEmpty.style.display = "block";
      return;
    }
    this.lbTable.style.display = "table";
    this.lbEmpty.style.display = "none";

    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      const rankTd = document.createElement("td");
      rankTd.className = "rank" + (i < 3 ? " top" : "");
      rankTd.textContent = String(i + 1);
      const nameTd = document.createElement("td");
      nameTd.className = "player";
      nameTd.textContent = String(r.name || "匿名").slice(0, 12);
      const scTd = document.createElement("td");
      scTd.className = "pts";
      scTd.textContent = String(r.score);
      tr.append(rankTd, nameTd, scTd);
      this.lbBody.appendChild(tr);
    });
  }

  showStartScreen() {
    this.pageDifficulty.hidden = false;
    this.pageStandard.hidden = true;
    this.overlayGameOver.hidden = true;
    this.overlay.classList.add("visible");
  }

  showPauseScreen(title, msg) {
    this.overlayTitle.textContent = title;
    this.overlayMsg.textContent = msg;
    this.btnOverlay.style.display = "inline-flex";
    this.pageDifficulty.hidden = true;
    this.overlayGameOver.hidden = true;
    this.pageStandard.hidden = false;
    this.overlay.classList.add("visible");
  }

  showGameOverScreen(reason, score) {
    this.pageDifficulty.hidden = true;
    this.pageStandard.hidden = true;
    this.overlayGameOver.hidden = false;
    this.goScoreLine.textContent = reason + " · 本局 " + score + " 分";
    this.overlay.classList.add("visible");
  }

  hideOverlay() {
    this.overlay.classList.remove("visible");
    this.pageDifficulty.hidden = true;
    this.pageStandard.hidden = true;
    this.overlayGameOver.hidden = true;
    this.overlayMsg.style.display = "block";
    this.overlayDefaultActions.style.display = "flex";
  }

  syncBoostUi(isBoosting, isBarHeld) {
    this.canvasWrap.classList.toggle("boost-hold", isBoosting);
    if (this.boostBar) this.boostBar.classList.toggle("is-pressing", isBarHeld);
  }

  syncPauseLabels(isPaused) {
    const t = isPaused ? "继续" : "暂停";
    this.btnPause.textContent = t;
    this.touchPause.textContent = t;
    this.touchPause.setAttribute("aria-label", isPaused ? "继续游戏" : "暂停游戏");
  }

  syncSoundButton(isMuted) {
    this.btnSound.textContent = isMuted ? "音效：关" : "音效：开";
    this.btnSound.setAttribute("aria-pressed", isMuted ? "true" : "false");
  }

  syncTouchHint() {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 720px)");
    this.controlsHintTouch.hidden = !mq.matches;
  }

  focusPlayerName() {
    try {
      this.playerName.focus({ preventScroll: true });
    } catch {
      this.playerName.focus();
    }
  }

  roundCellRect(x, y, pad, rMul) {
    const px = x * this.CELL + pad;
    const py = y * this.CELL + pad;
    const s = this.CELL - pad * 2;
    const r = Math.min(this.CELL * 0.32, s * (rMul || 0.28));
    return { px, py, s, r };
  }

  drawBoard() {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg").trim() || "#0c0e14";
    const g = this.ctx.createRadialGradient(
      this.LOGICAL * 0.35,
      this.LOGICAL * 0.25,
      0,
      this.LOGICAL * 0.5,
      this.LOGICAL * 0.5,
      this.LOGICAL * 0.85
    );
    g.addColorStop(0, "rgba(167, 139, 250, 0.09)");
    g.addColorStop(0.45, bg);
    g.addColorStop(1, "#05060a");
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.LOGICAL, this.LOGICAL);

    const t0 = (x, y) => ((x + y) & 1) === 0;
    for (let x = 0; x < this.model.COLS; x++) {
      for (let y = 0; y < this.model.ROWS; y++) {
        if (t0(x, y)) {
          this.ctx.fillStyle = "rgba(255,255,255,0.018)";
          this.ctx.fillRect(x * this.CELL, y * this.CELL, this.CELL, this.CELL);
        }
      }
    }

    this.ctx.strokeStyle = "rgba(255,255,255,0.04)";
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= this.model.COLS; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * this.CELL + 0.5, 0);
      this.ctx.lineTo(x * this.CELL + 0.5, this.LOGICAL);
      this.ctx.stroke();
    }
    for (let y = 0; y <= this.model.ROWS; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * this.CELL + 0.5);
      this.ctx.lineTo(this.LOGICAL, y * this.CELL + 0.5);
      this.ctx.stroke();
    }

    this.ctx.strokeStyle = "rgba(255,255,255,0.14)";
    this.ctx.strokeRect(0.5, 0.5, this.LOGICAL - 1, this.LOGICAL - 1);
  }

  drawFixedObstacles() {
    for (const o of this.model.FIXED_OBSTACLES) {
      const { px, py, s, r } = this.roundCellRect(o.x, o.y, this.CELL * 0.12, 0.22);
      const grd = this.ctx.createLinearGradient(px, py, px + s, py + s);
      grd.addColorStop(0, "#4b5563");
      grd.addColorStop(1, "#1f2937");
      this.ctx.fillStyle = grd;
      this.ctx.beginPath();
      this.ctx.roundRect(px, py, s, s, r);
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(255,255,255,0.12)";
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }

  drawTempObstacle() {
    if (!this.model.tempObstacleActive()) return;
    const o = this.model.tempObstacle;
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 220);
    const { px, py, s, r } = this.roundCellRect(o.x, o.y, this.CELL * 0.1, 0.26);
    const grd = this.ctx.createRadialGradient(px + s * 0.35, py + s * 0.35, 0, px + s * 0.5, py + s * 0.5, s * 0.75);
    grd.addColorStop(0, `rgba(251, 191, 36, ${0.55 * pulse})`);
    grd.addColorStop(0.6, `rgba(249, 115, 22, ${0.85 * pulse})`);
    grd.addColorStop(1, "rgba(185, 28, 28, 0.95)");
    this.ctx.fillStyle = grd;
    this.ctx.beginPath();
    this.ctx.roundRect(px, py, s, s, r);
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255,255,255,0.35)";
    this.ctx.lineWidth = 1.25;
    this.ctx.stroke();
  }

  drawFood() {
    const { px, py, s, r } = this.roundCellRect(this.model.food.x, this.model.food.y, this.CELL * 0.14, 0.3);
    const breathe = 1 + 0.04 * Math.sin(performance.now() / 350);
    const cx = px + s / 2;
    const cy = py + s / 2;
    const rs = (s / 2) * breathe;
    this.ctx.save();
    this.ctx.shadowBlur = this.CELL * 0.55;
    this.ctx.shadowColor = "rgba(251, 113, 133, 0.75)";
    const rg = this.ctx.createRadialGradient(cx - rs * 0.25, cy - rs * 0.25, 0, cx, cy, rs * 1.2);
    rg.addColorStop(0, "#ffe4e6");
    rg.addColorStop(0.4, "#fb7185");
    rg.addColorStop(1, "#9f1239");
    this.ctx.fillStyle = rg;
    this.ctx.beginPath();
    this.ctx.roundRect(px, py, s, s, r);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = "rgba(255,255,255,0.35)";
    this.ctx.lineWidth = 1.15;
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawSnakeEyes(px, py, s, face) {
    const ex = s * 0.22;
    const ey = s * 0.28;
    const er = Math.max(1.8, s * 0.11);
    let ox = 0;
    let oy = 0;
    if (face.x === 1) ox = s * 0.12;
    if (face.x === -1) ox = -s * 0.12;
    if (face.y === 1) oy = s * 0.12;
    if (face.y === -1) oy = -s * 0.12;
    const bx = px + s * 0.5 + ox;
    const by = py + s * 0.42 + oy;
    this.ctx.fillStyle = "#f8fafc";
    this.ctx.beginPath();
    this.ctx.arc(bx - ex, by, er, 0, Math.PI * 2);
    this.ctx.arc(bx + ex, by, er, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#0f172a";
    const pup = s * 0.045;
    this.ctx.beginPath();
    this.ctx.arc(bx - ex + face.x * pup * 0.5, by + face.y * pup * 0.5, er * 0.45, 0, Math.PI * 2);
    this.ctx.arc(bx + ex + face.x * pup * 0.5, by + face.y * pup * 0.5, er * 0.45, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawSnake() {
    const face = this.model.nextDir.x || this.model.nextDir.y ? this.model.nextDir : this.model.dir;
    const n = this.model.snakeLen;
    if (n <= 0) return;
    this.ctx.save();
    const glowLayers = [
      { blur: this.CELL * 0.95, col: "rgba(167, 139, 250, 0.28)" },
      { blur: this.CELL * 0.42, col: "rgba(52, 211, 153, 0.42)" },
    ];
    for (const gl of glowLayers) {
      this.ctx.shadowBlur = gl.blur;
      this.ctx.shadowColor = gl.col;
      for (let k = 0; k < n; k++) {
        const idx = (this.model.snakeTail + k) % this.model.SNAKE_CAP;
        const sx = this.model.snakeX[idx];
        const sy = this.model.snakeY[idx];
        const isHead = k === n - 1;
        const pad = isHead ? this.CELL * 0.11 : this.CELL * 0.13;
        const { px, py, s, r } = this.roundCellRect(sx, sy, pad, isHead ? 0.3 : 0.26);
        const t = n <= 1 ? 0 : (n - 1 - k) / (n - 1);
        const lg = this.ctx.createLinearGradient(px - s * 0.15, py, px + s * 1.1, py + s * 1.05);
        lg.addColorStop(0, `rgba(196, 181, 253, ${0.45 + t * 0.35})`);
        lg.addColorStop(0.5, `rgba(45, 212, 191, ${0.4 + t * 0.38})`);
        lg.addColorStop(1, `rgba(244, 114, 182, ${0.35 + t * 0.4})`);
        this.ctx.fillStyle = lg;
        this.ctx.beginPath();
        this.ctx.roundRect(px, py, s, s, r);
        this.ctx.fill();
      }
    }
    this.ctx.shadowBlur = 0;
    for (let k = 0; k < n; k++) {
      const idx = (this.model.snakeTail + k) % this.model.SNAKE_CAP;
      const sx = this.model.snakeX[idx];
      const sy = this.model.snakeY[idx];
      const isHead = k === n - 1;
      const pad = isHead ? this.CELL * 0.11 : this.CELL * 0.13;
      const { px, py, s, r } = this.roundCellRect(sx, sy, pad, isHead ? 0.3 : 0.26);
      const t = n <= 1 ? 0 : (n - 1 - k) / (n - 1);
      const lg = this.ctx.createLinearGradient(px - s * 0.25, py - s * 0.2, px + s * 1.05, py + s * 1.15);
      if (isHead) {
        lg.addColorStop(0, "#f5d0fe");
        lg.addColorStop(0.42, "#34d399");
        lg.addColorStop(1, "#059669");
      } else {
        lg.addColorStop(0, `rgba(167, 139, 250, ${0.82 - t * 0.28})`);
        lg.addColorStop(0.48, `rgba(52, 211, 153, ${0.55 + t * 0.32})`);
        lg.addColorStop(1, `rgba(244, 114, 182, ${0.62 - t * 0.18})`);
      }
      this.ctx.fillStyle = lg;
      this.ctx.beginPath();
      this.ctx.roundRect(px, py, s, s, r);
      this.ctx.fill();
      this.ctx.strokeStyle = isHead ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.16)";
      this.ctx.lineWidth = isHead ? 1.65 : 1.05;
      this.ctx.stroke();
      if (isHead) this.drawSnakeEyes(px, py, s, face);
    }
    this.ctx.restore();
  }

  drawPortals() {
    const now = performance.now();
    const active = this.model.getActivePortals();
    const cooldownRemaining = Math.max(0, this.model.portalCooldownUntil - now);

    for (const p of active) {
      const cx = p.x * this.CELL + this.CELL * 0.5;
      const cy = p.y * this.CELL + this.CELL * 0.5;
      const baseR = this.CELL * 0.38;
      const pulse = 1 + 0.12 * Math.sin(now / 300 + p.x * 0.5 + p.y * 0.3);
      const r = baseR * pulse;
      const alpha = cooldownRemaining > 0 ? 0.25 : 0.55;

      this.ctx.save();
      this.ctx.globalCompositeOperation = "lighter";

      const outer = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
      outer.addColorStop(0, `rgba(139, 92, 246, ${alpha * 0.6})`);
      outer.addColorStop(0.5, `rgba(59, 130, 246, ${alpha * 0.35})`);
      outer.addColorStop(1, "rgba(139, 92, 246, 0)");
      this.ctx.fillStyle = outer;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
      this.ctx.fill();

      const inner = this.ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
      inner.addColorStop(0, `rgba(167, 139, 250, ${alpha * 0.9})`);
      inner.addColorStop(0.6, `rgba(99, 102, 241, ${alpha * 0.7})`);
      inner.addColorStop(1, `rgba(79, 70, 229, ${alpha * 0.4})`);
      this.ctx.fillStyle = inner;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
      this.ctx.fill();

      const ringR = r * 1.25;
      this.ctx.strokeStyle = `rgba(139, 92, 246, ${alpha * 0.5})`;
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([this.CELL * 0.25, this.CELL * 0.15]);
      this.ctx.lineDashOffset = -(now / 20) % (this.CELL * 0.8);
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.restore();
    }
  }

  drawParticles() {
    if (!this.model.particles.length) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";
    for (const p of this.model.particles) {
      const rad = this.CELL * 0.14 * Math.sqrt(p.life);
      const g = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 4);
      g.addColorStop(0, `rgba(${p.rgb},${0.7 * p.life})`);
      g.addColorStop(0.35, `rgba(${p.rgb},${0.35 * p.life})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      this.ctx.fillStyle = g;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, rad * 4, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  renderCanvas() {
    this.drawBoard();
    this.drawFixedObstacles();
    this.drawTempObstacle();
    this.drawPortals();
    this.drawFood();
    this.drawSnake();
    this.drawParticles();
  }
}