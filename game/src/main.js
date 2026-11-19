// Solmar Heat — bootstrap and game loop. Builds the world, owns the shared
// game state G, and wires every system together: city, player, cars, traffic,
// pedestrians, police, missions, HUD, audio and saving.
import * as THREE from 'three';
import { makeRng, clamp, dist2d } from './config.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { buildCity, collideBuildings, clampToCity } from './city.js';
import { spawnParkedCars } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPedestrians, updatePedestrians, knockDownPed, nearestPed } from './pedestrians.js';
import {
  createWanted, addWanted, clearWanted, updateWanted,
  spawnFootCop, updateFootCops, spawnPatrolCar, updatePatrolCars,
  desiredPoliceCounts, spawnPointNearPlayer, policeCanSeePlayer,
} from './police.js';
import {
  createMissionState, currentMission, currentStep, createMarker,
  updateMarker, startMission, updateMission,
} from './missions.js';
import {
  createPlayer, updatePlayerOnFoot, damagePlayer, playerPunch,
  playerShoot, toggleCar,
} from './player.js';
import { createHud } from './hud.js';
import { saveGame, loadSave, hasSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
const raycaster = new THREE.Raycaster();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Shared game state -------------------------------------------------------
const G = {
  scene,
  camera,
  renderer,
  state: 'menu', // menu | playing | paused | over
  time: 0,
  clockMinutes: 14 * 60,
  money: 100,
  wanted: createWanted(),
  mission: createMissionState(),
  missionsDone: [],
  missionIndex: 0,
  cameraYaw: Math.PI,
  cameraPitch: 0.3,
  cameraDistance: 7.5,
  nextMissionTimer: 0,
  policeSpawnTimer: 0,
  saveTimer: 0,
  danger: null,
  seed: 20261119,
};

G.audio = createAudio();
G.input = createInput(canvas);
G.city = buildCity(scene, G.seed);
G.player = createPlayer(scene);
G.marker = createMarker(scene);
G.hud = createHud(G);
G.rng = makeRng(G.seed);
window.SOLMAR = G; // debug handle for playtesting (read-only inspection)

// Dynamic entities, rebuilt on a new game.
function buildDynamicEntities() {
  G.traffic = createTraffic(scene, 12, G.seed + 1);
  G.parkedCars = spawnParkedCars(scene, G.city, makeRng(G.seed + 2), 8);
  G.peds = createPedestrians(scene, 16, G.seed + 3);
  G.cops = [];
  G.copCars = [];
}
buildDynamicEntities();

// --- State helpers used by other modules -------------------------------------

G.save = function saveNow() {
  saveGame(G);
};

G.markerTarget = function markerTarget() {
  if (!G.mission.active) return null;
  const step = currentStep(G.mission);
  if (!step || !step.marker) return null;
  return G.city.spots[step.marker];
};

G.addCrime = function addCrime(amount, danger) {
  addWanted(G.wanted, amount);
  G.danger = danger;
  setTimeout(() => { G.danger = null; }, 2500);
};

G.ejectDriver = function ejectDriver(car) {
  // The driver becomes a fleeing pedestrian.
  const ped = G.peds.find((p) => p.state === 'walk');
  if (ped) {
    ped.pos.set(car.pos.x + 2, 0, car.pos.z);
    ped.state = 'flee';
    ped.fleeFrom = { x: car.pos.x, z: car.pos.z };
    ped.fleeTimer = 4;
  }
};

G.nearestStealableCar = function nearestStealableCar() {
  const p = G.player.pos;
  let best = null;
  let bestD = 4.6;
  const consider = (car) => {
    if (car.driver === 'player' || car.driver === 'police') return;
    const d = dist2d(p.x, p.z, car.pos.x, car.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  };
  for (const car of G.parkedCars) consider(car);
  for (const car of G.traffic) consider(car);
  return best;
};

G.knockDownPed = function knockDownPedG(ped, seconds) {
  knockDownPed(ped, seconds);
};

G.knockDownCop = function knockDownCop(cop) {
  const i = G.cops.indexOf(cop);
  if (i >= 0) G.cops.splice(i, 1);
  scene.remove(cop.mesh);
};

// --- Game flow ---------------------------------------------------------------

function resetPlayerToSpawn() {
  const p = G.player;
  p.pos.set(6, 0, 26);
  p.heading = Math.PI;
  p.health = 100;
  p.car = null;
  p.mesh.visible = true;
  p.gunEquipped = false;
  p.ammo = 30;
  G.cameraYaw = Math.PI;
  G.cameraPitch = 0.3;
}

G.startNewGame = function startNewGame(silent = false) {
  if (!silent) clearSave();
  // Remove old dynamic entities and rebuild them fresh.
  for (const car of G.traffic) car.remove(scene);
  for (const car of G.parkedCars) car.remove(scene);
  for (const car of G.copCars) car.remove(scene);
  for (const ped of G.peds) scene.remove(ped.mesh);
  for (const cop of G.cops) scene.remove(cop.mesh);
  buildDynamicEntities();
  G.money = 100;
  G.missionsDone = [];
  G.mission = createMissionState();
  G.missionIndex = 0;
  G.wanted = createWanted();
  G.clockMinutes = 14 * 60;
  G.time = 0;
  resetPlayerToSpawn();
  G.state = 'playing';
  G.hud.hideStart();
  G.hud.hideEnd();
  G.hud.hidePause();
  G.hud.show();
  G.hud.setMoney(G.money);
  G.hud.setHealth(G.player.health);
  G.hud.setStars(0);
  startMission(G);
  G.audio.unlock();
};

G.startContinue = function startContinue() {
  const save = loadSave();
  if (!save) {
    G.startNewGame();
    return;
  }
  G.startNewGame(true);
  G.money = save.money;
  G.missionsDone = save.missionsDone || [];
  G.mission.index = save.missionIndex || 0;
  G.mission.doneCount = G.missionsDone.length;
  G.player.health = save.health ?? 100;
  G.player.pos.set(save.x ?? 6, 0, save.z ?? 26);
  G.clockMinutes = save.clockMinutes ?? 14 * 60;
  G.hud.setMoney(G.money);
  if (currentMission(G.mission)) startMission(G);
  else G.hud.setObjective('All missions done — Solmar is yours. Free roam!');
};

G.togglePause = function togglePause(force) {
  if (G.state === 'playing' && force !== false) {
    G.state = 'paused';
    G.hud.showPause();
    G.save();
  } else if (G.state === 'paused' && force !== true) {
    G.state = 'playing';
    G.hud.hidePause();
  }
};

G.quitToMenu = function quitToMenu() {
  G.save();
  G.state = 'menu';
  G.hud.hidePause();
  G.hud.hideEnd();
  G.hud.hide();
  G.hud.showStart(hasSave());
};

G.respawn = function respawn() {
  const hospital = G.city.spots.hospital;
  G.player.pos.set(hospital.x, 0, hospital.z);
  G.player.health = 100;
  G.player.car = null;
  G.player.mesh.visible = true;
  clearWanted(G.wanted);
  for (const car of G.copCars) car.remove(scene);
  for (const cop of G.cops) scene.remove(cop.mesh);
  G.copCars = [];
  G.cops = [];
  G.state = 'playing';
  G.hud.hideEnd();
  G.hud.show();
  G.hud.setHealth(100);
  G.hud.setStars(0);
};

function gameOver(kind) {
  if (G.state !== 'playing') return;
  G.state = 'over';
  const fine = kind === 'busted' ? 250 : 200;
  G.money = Math.max(0, G.money - fine);
  G.audio.busted();
  G.save();
  G.hud.showEnd(
    kind === 'busted' ? 'BUSTED' : 'WASTED',
    kind === 'busted'
      ? `The Solmar police took you in. You lost $${fine} in fines and bail.`
      : `Leo went down in the streets of Solmar. The hospital patched him up — for $${fine}.`,
  );
}

// --- Police management ---------------------------------------------------------

function managePolice(dt) {
  const want = desiredPoliceCounts(G.wanted.stars);
  G.policeSpawnTimer -= dt;
  if (G.copCars.length < want.cars && G.policeSpawnTimer <= 0) {
    G.policeSpawnTimer = 2.5;
    const sp = spawnPointNearPlayer(G.rng, G.player.pos);
    const heading = Math.atan2(G.player.pos.x - sp.x, G.player.pos.z - sp.z);
    G.copCars.push(spawnPatrolCar(scene, sp.x, sp.z, heading));
  }
  if (G.cops.length < want.foot && G.policeSpawnTimer <= 0) {
    G.policeSpawnTimer = 2.5;
    const sp = spawnPointNearPlayer(G.rng, G.player.pos);
    G.cops.push(spawnFootCop(scene, sp.x, sp.z));
  }
  // When the heat drops, extra units drive off.
  while (G.copCars.length > want.cars) {
    const car = G.copCars.pop();
    car.remove(scene);
  }
  while (G.cops.length > want.foot) {
    const cop = G.cops.pop();
    scene.remove(cop.mesh);
  }
}

// --- One simulation step -------------------------------------------------------

G.stepWorld = function stepWorld(dt, silent = false) {
  G.time += dt;
  G.clockMinutes += dt * 0.5;

  // Player car keeps rolling during staged screenshot scenes.
  const playerCar = G.player.car;
  if (playerCar) {
    playerCar.drive(dt, silent ? 0.25 : 0, 0);
    collideBuildings(G.city, playerCar.pos, 2.2);
    clampToCity(playerCar.pos);
    G.player.pos.copy(playerCar.pos);
  }

  updateTraffic(G.traffic, dt, G.rng, playerCar, G.copCars);
  updatePedestrians(G.peds, dt, G.rng, G.danger);

  // Collisions: player car vs traffic, peds and cop cars.
  if (playerCar) {
    for (const other of G.traffic.concat(G.copCars)) {
      if (other === playerCar || other.driver === 'player') continue;
      const d = dist2d(playerCar.pos.x, playerCar.pos.z, other.pos.x, other.pos.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const nx = (playerCar.pos.x - other.pos.x) / d;
        const nz = (playerCar.pos.z - other.pos.z) / d;
        playerCar.pos.x += nx * push;
        playerCar.pos.z += nz * push;
        other.pos.x -= nx * push;
        other.pos.z -= nz * push;
        if (Math.abs(playerCar.speed) > 8 && playerCar.crashCooldown <= 0) {
          G.audio.crash();
          playerCar.crash(Math.abs(playerCar.speed));
          other.speed = Math.max(0, other.speed - 4);
        }
      }
    }
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      const d = dist2d(playerCar.pos.x, playerCar.pos.z, ped.pos.x, ped.pos.z);
      if (d < 2.2 && Math.abs(playerCar.speed) > 3) {
        knockDownPed(ped, 8);
        G.addCrime(60, { x: playerCar.pos.x, z: playerCar.pos.z, radius: 30 });
        G.audio.crash();
        playerCar.speed *= 0.6;
      }
    }
  }

  // Police.
  managePolice(dt);
  updatePatrolCars(G.copCars, dt, G.player.pos, playerCar ? playerCar.speed : 0, (pos, r) => collideBuildings(G.city, pos, r));
  // Cop cars ramming the player's car slow it and hurt Leo a little.
  if (playerCar) {
    for (const copCar of G.copCars) {
      const d = dist2d(copCar.pos.x, copCar.pos.z, playerCar.pos.x, playerCar.pos.z);
      if (d < 3.6) {
        playerCar.speed *= 0.94;
        if (copCar.crashCooldown <= 0) {
          copCar.crashCooldown = 0.8;
          G.audio.crash();
          if (damagePlayer(G, 4)) gameOver('wasted');
        }
      }
    }
  }
  updateFootCops(G.cops, dt, G.player.pos, (heldDt) => {
    if (G.player.car) return;
    G.wanted.bustedTimer += heldDt;
    if (G.wanted.bustedTimer > 2) gameOver('busted');
  }, (dmg) => {
    if (G.player.car) return;
    if (damagePlayer(G, dmg)) gameOver('wasted');
  });
  if (G.cops.length === 0 || G.player.car) G.wanted.bustedTimer = 0;
  const canSee = policeCanSeePlayer(G.cops, G.copCars, G.player.pos);
  updateWanted(G.wanted, dt, canSee);

  // Missions + marker.
  const missionResult = updateMission(G, dt);
  if (missionResult === 'done' && currentMission(G.mission)) {
    G.nextMissionTimer = 5;
  }
  if (G.nextMissionTimer > 0) {
    G.nextMissionTimer -= dt;
    if (G.nextMissionTimer <= 0 && currentMission(G.mission)) startMission(G);
    else if (G.nextMissionTimer <= 0) G.hud.setObjective('All missions done — Solmar is yours. Free roam!');
  }
  const target = G.markerTarget();
  if (target) {
    G.marker.visible = true;
    G.marker.position.set(target.x, 0, target.z);
    updateMarker(G.marker, dt, G.time);
  } else {
    G.marker.visible = false;
  }

  // Autosave every 20 seconds of play.
  if (!silent) {
    G.saveTimer += dt;
    if (G.saveTimer > 20) {
      G.saveTimer = 0;
      G.save();
    }
  }
};

// --- Camera ----------------------------------------------------------------------

function updateCamera(dt) {
  const p = G.player;
  let dist = G.cameraDistance;
  if (p.car) {
    // Chase cam: settle behind the car's heading (camera yaw = car heading).
    const targetYaw = p.car.heading;
    let diff = targetYaw - G.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    G.cameraYaw += diff * Math.min(1, dt * 2.2);
    dist = 11;
  }
  const yaw = G.cameraYaw;
  const pitch = G.cameraPitch;
  const cx = p.pos.x - Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = p.pos.z - Math.cos(yaw) * Math.cos(pitch) * dist;
  const cy = Math.sin(pitch) * dist + 1.6;
  camera.position.set(cx, cy + 1.2, cz);
  camera.lookAt(p.pos.x, p.pos.y + 1.7, p.pos.z);
}

// --- HUD refresh -------------------------------------------------------------------

function refreshHud() {
  G.hud.setStars(G.wanted.stars);
  G.hud.setMoney(G.money);
  G.hud.setHealth(G.player.health);
  G.hud.setClock(G.clockMinutes);
  G.hud.setSpeed(G.player.car ? G.player.car.speedKmh : 0, !!G.player.car);
  G.hud.setAmmo(G.player.gunEquipped, G.player.ammo, G.player.reloadTimer > 0);
  G.hud.drawMinimap();
  const step = currentStep(G.mission);
  if (G.mission.active && step) {
    let obj = step.objective;
    if (step.timer) obj += `  —  ${Math.max(0, Math.ceil(G.mission.stepTimer))}s`;
    G.hud.setObjective(`${currentMission(G.mission).title}: ${obj}`);
  }
  // Context prompt.
  if (G.state === 'playing') {
    if (!G.player.car) {
      const car = G.nearestStealableCar();
      G.hud.setPrompt(car ? 'Press E — steal car' : (G.player.gunEquipped ? 'Click — shoot   •   R — reload   •   2 — holster' : 'F — punch   •   2 — draw pistol   •   E — enter car'));
    } else {
      G.hud.setPrompt('E — leave car   •   W/S — drive   •   A/D — steer');
    }
  }
}

// --- Main loop -----------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const input = G.input;
  const mouse = input.consumeMouse();
  G.cameraYaw -= mouse.dx * 0.0032;
  G.cameraPitch = clamp(G.cameraPitch + mouse.dy * 0.0024, 0.08, 0.9);

  if (input.wasPressed('Escape')) {
    if (G.state === 'playing' || G.state === 'paused') G.togglePause();
  }
  if (input.wasPressed('KeyM')) {
    G.audio.setMuted(!G.audio.muted);
  }

  if (G.state === 'playing') {
    // Enter / leave car.
    if (input.wasPressed('KeyE')) toggleCar(G);
    // Combat on foot.
    if (!G.player.car) {
      if (input.wasPressed('KeyF') || input.wasPressed('Mouse0')) playerPunch(G);
      if (input.wasPressed('Digit2')) {
        G.player.gunEquipped = !G.player.gunEquipped;
        G.audio.pickup();
      }
      if (input.wasPressed('KeyR')) G.player.reloadTimer = 1.6;
      if (input.mouseDown && G.player.gunEquipped) playerShoot(G, raycaster);
      updatePlayerOnFoot(G, dt);
      collideBuildings(G.city, G.player.pos, 0.6);
      clampToCity(G.player.pos);
    } else {
      // Driving.
      const car = G.player.car;
      const throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
        + (input.isDown('KeyS') || input.isDown('ArrowDown') ? -1 : 0);
      const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0)
        + (input.isDown('KeyD') || input.isDown('ArrowRight') ? -1 : 0);
      const speedBefore = car.speed;
      car.drive(dt, throttle, steer);
      if (collideBuildings(G.city, car.pos, 2.2)) {
        if (car.crash(Math.abs(speedBefore))) G.audio.crash();
      }
      clampToCity(car.pos);
      G.player.pos.copy(car.pos);
    }
    G.stepWorld(dt);
    // Audio follows the action.
    const policeNear = G.copCars.some((c) => dist2d(c.pos.x, c.pos.z, G.player.pos.x, G.player.pos.z) < 70)
      || G.cops.some((c) => dist2d(c.pos.x, c.pos.z, G.player.pos.x, G.player.pos.z) < 40);
    G.audio.update(G.player.car ? G.player.car.speedKmh : 0, !!G.player.car, policeNear);
    G.hud.updateDialog(dt);
    G.hud.updateBanner(dt);
    refreshHud();
  }
  if (G.state === 'menu') {
    // Idle menu camera: slow orbit over the plaza while the title is up.
    const a = now * 0.00006;
    camera.position.set(Math.sin(a) * 95, 52, Math.cos(a) * 95);
    camera.lookAt(0, 4, 20);
  } else {
    // Playing, paused, over and frozen (staged screenshot): the camera
    // follows the player; in frozen mode everything else simply stands still.
    updateCamera(dt);
  }
  renderer.render(scene, camera);
  input.endFrame();
}

// --- Boot ----------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  stageShot(shot, G);
  // Freeze the staged frame: the render loop keeps presenting it, but the
  // simulation no longer advances, so the screenshot shows the staged scene.
  G.state = 'frozen';
  G.hud.show();
  refreshHud();
} else {
  G.hud.showStart(hasSave());
  // Idle menu camera: slow orbit over the plaza.
  G.player.pos.set(0, 0, 0);
  G.player.mesh.visible = false;
  camera.position.set(60, 45, 90);
  camera.lookAt(0, 0, 0);
}
requestAnimationFrame(frame);
