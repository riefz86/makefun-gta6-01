// Solmar Heat — HUD: wanted stars, money, health, speed, clock, objective,
// dialog subtitles, banners, and the 2D canvas minimap. Also the start /
// pause / game-over screens, wired to the game's callbacks.
import { CITY_HALF, PITCH, GRID } from './config.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    els: {
      hud: $('hud'),
      stars: $('stars'),
      money: $('money'),
      healthFill: $('health-fill'),
      speed: $('speed'),
      speedValue: $('speed-value'),
      clock: $('clock'),
      objective: $('objective'),
      banner: $('banner'),
      dialog: $('dialog'),
      dialogName: $('dialog-name'),
      dialogText: $('dialog-text'),
      minimap: $('minimap'),
      startScreen: $('start-screen'),
      pauseScreen: $('pause-screen'),
      endScreen: $('end-screen'),
      endTitle: $('end-title'),
      endText: $('end-text'),
      prompt: $('prompt'),
      tracer: $('tracer'),
      damageFlash: $('damage-flash'),
      ammo: $('ammo'),
    },
    dialogQueue: [],
    dialogTimer: 0,
    bannerTimer: 0,
    minimapCtx: $('minimap').getContext('2d'),
  };

  hud.show = function showHud() {
    hud.els.hud.style.display = 'block';
  };
  hud.hide = function hideHud() {
    hud.els.hud.style.display = 'none';
  };

  hud.setStars = function setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    hud.els.stars.textContent = s;
    hud.els.stars.classList.toggle('hot', n > 0);
  };

  hud.setMoney = function setMoney(v) {
    hud.els.money.textContent = `$${Math.floor(v).toLocaleString('en-US')}`;
  };

  hud.setHealth = function setHealth(v) {
    hud.els.healthFill.style.width = `${Math.max(0, Math.min(100, v))}%`;
    hud.els.healthFill.classList.toggle('low', v < 30);
  };

  hud.setSpeed = function setSpeed(kmh, inCar) {
    hud.els.speed.style.display = inCar ? 'block' : 'none';
    hud.els.speedValue.textContent = `${Math.round(kmh)}`;
  };

  hud.setClock = function setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    hud.els.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  hud.setObjective = function setObjective(text) {
    hud.els.objective.textContent = text;
  };

  hud.setPrompt = function setPrompt(text) {
    hud.els.prompt.textContent = text || '';
    hud.els.prompt.style.display = text ? 'block' : 'none';
  };

  hud.setAmmo = function setAmmo(equipped, ammo, reloading) {
    hud.els.ammo.style.display = equipped ? 'block' : 'none';
    hud.els.ammo.textContent = reloading ? 'RELOADING…' : `PISTOL  ${ammo} / 30`;
  };

  hud.showBanner = function showBanner(text, seconds = 3) {
    hud.els.banner.textContent = text;
    hud.els.banner.style.opacity = '1';
    hud.bannerTimer = seconds;
  };

  hud.showDialog = function showDialog(lines) {
    hud.dialogQueue = lines.slice();
    hud.dialogTimer = 0;
  };

  hud.updateDialog = function updateDialog(dt) {
    if (hud.dialogQueue.length === 0) {
      hud.els.dialog.style.display = 'none';
      return;
    }
    hud.dialogTimer -= dt;
    if (hud.dialogTimer <= 0) {
      const [name, text] = hud.dialogQueue.shift();
      hud.els.dialogName.textContent = name;
      hud.els.dialogText.textContent = text;
      hud.els.dialog.style.display = 'block';
      hud.dialogTimer = 3.6;
    }
  };

  hud.updateBanner = function updateBanner(dt) {
    if (hud.bannerTimer > 0) {
      hud.bannerTimer -= dt;
      if (hud.bannerTimer <= 0) hud.els.banner.style.opacity = '0';
    }
  };

  hud.flashDamage = function flashDamage() {
    hud.els.damageFlash.style.opacity = '0.45';
    setTimeout(() => { hud.els.damageFlash.style.opacity = '0'; }, 140);
  };

  hud.showTracer = function showTracer() {
    hud.els.tracer.style.opacity = '0.9';
    setTimeout(() => { hud.els.tracer.style.opacity = '0'; }, 70);
  };

  // --- Minimap ---------------------------------------------------------------
  hud.drawMinimap = function drawMinimap() {
    const ctx = hud.minimapCtx;
    const S = 180;
    const scale = S / (CITY_HALF * 2 + 80);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#1d2b1a';
    ctx.fillRect(0, 0, S, S);
    // Beach + sea at the bottom (south).
    ctx.fillStyle = '#e8d8a0';
    ctx.fillRect(0, S - 16, S, 8);
    ctx.fillStyle = '#2a7fc8';
    ctx.fillRect(0, S - 8, S, 8);
    // Roads.
    ctx.strokeStyle = '#3a3d44';
    ctx.lineWidth = 5;
    for (let i = -GRID; i <= GRID; i += 1) {
      const [x1, y1] = toMap(i * PITCH, -CITY_HALF);
      const [x2, y2] = toMap(i * PITCH, CITY_HALF);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [hx1, hy1] = toMap(-CITY_HALF, i * PITCH);
      const [hx2, hy2] = toMap(CITY_HALF, i * PITCH);
      ctx.beginPath(); ctx.moveTo(hx1, hy1); ctx.lineTo(hx2, hy2); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    // Mission marker.
    const marker = G.markerTarget();
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      ctx.fillStyle = '#ffd23a';
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    // Traffic (white), police (blue/red), player (green arrow).
    for (const car of G.traffic) {
      if (car.driver === 'traffic') dot(car.pos.x, car.pos.z, '#dddddd', 2);
    }
    for (const car of G.copCars) dot(car.pos.x, car.pos.z, '#3a7bff', 3);
    for (const cop of G.cops) dot(cop.pos.x, cop.pos.z, '#3a7bff', 2);
    const [px, py] = toMap(G.player.pos.x, G.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(G.player.car ? G.player.car.heading : G.player.heading);
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  // --- Screens ---------------------------------------------------------------
  hud.showStart = function showStart(hasSave) {
    hud.els.startScreen.style.display = 'flex';
    $('btn-continue').style.display = hasSave ? 'inline-block' : 'none';
  };
  hud.hideStart = function hideStart() {
    hud.els.startScreen.style.display = 'none';
  };
  hud.showPause = function showPause() {
    hud.els.pauseScreen.style.display = 'flex';
  };
  hud.hidePause = function hidePause() {
    hud.els.pauseScreen.style.display = 'none';
  };
  hud.showEnd = function showEnd(title, text) {
    hud.els.endTitle.textContent = title;
    hud.els.endText.textContent = text;
    hud.els.endScreen.style.display = 'flex';
  };
  hud.hideEnd = function hideEnd() {
    hud.els.endScreen.style.display = 'none';
  };

  $('btn-new').addEventListener('click', () => G.startNewGame());
  $('btn-continue').addEventListener('click', () => G.startContinue());
  $('btn-resume').addEventListener('click', () => G.togglePause(false));
  $('btn-quit').addEventListener('click', () => G.quitToMenu());
  $('btn-respawn').addEventListener('click', () => G.respawn());
  $('btn-mute').addEventListener('click', () => {
    G.audio.setMuted(!G.audio.muted);
    $('btn-mute').textContent = G.audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
  });

  return hud;
}
