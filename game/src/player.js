// Solmar Heat — Leo Marín on foot: third-person walking / running, punching,
// the pistol, entering and leaving cars, and taking damage.
import * as THREE from 'three';
import {
  PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, PLAYER_HEALTH_MAX,
  clamp, angleLerp, dist2d,
} from './config.js';
import { coloredBox, mergeGeometries, flatMaterial } from './util.js';

export function createPlayer(scene) {
  const group = new THREE.Group();
  // Torso + head + limbs as separate meshes so the walk can swing them.
  const torso = new THREE.Mesh(
    mergeGeometries([
      coloredBox(0.62, 0.72, 0.34, 0x2e6fd2, 0, 1.16, 0),
      coloredBox(0.64, 0.1, 0.36, 0xd2b83a, 0, 1.34, 0),
    ]),
    flatMaterial,
  );
  const head = new THREE.Mesh(
    mergeGeometries([
      coloredBox(0.4, 0.4, 0.36, 0xe8b890, 0, 1.76, 0),
      coloredBox(0.44, 0.14, 0.4, 0x2a2018, 0, 1.99, 0),
    ]),
    flatMaterial,
  );
  const legL = new THREE.Mesh(mergeGeometries([coloredBox(0.24, 0.74, 0.26, 0x2a3542, 0, -0.37, 0)]), flatMaterial);
  const legR = new THREE.Mesh(mergeGeometries([coloredBox(0.24, 0.74, 0.26, 0x2a3542, 0, -0.37, 0)]), flatMaterial);
  const armL = new THREE.Mesh(mergeGeometries([coloredBox(0.16, 0.62, 0.16, 0xe8b890, 0, -0.31, 0)]), flatMaterial);
  const armR = new THREE.Mesh(mergeGeometries([coloredBox(0.16, 0.62, 0.16, 0xe8b890, 0, -0.31, 0)]), flatMaterial);
  legL.position.set(-0.17, 0.78, 0);
  legR.position.set(0.17, 0.78, 0);
  armL.position.set(-0.4, 1.46, 0);
  armR.position.set(0.4, 1.46, 0);
  group.add(torso, head, legL, legR, armL, armR);
  scene.add(group);
  return {
    mesh: group,
    parts: { torso, head, legL, legR, armL, armR },
    pos: group.position,
    heading: 0,
    health: PLAYER_HEALTH_MAX,
    car: null, // the Car Leo is driving, or null
    walkPhase: 0,
    moving: false,
    punchCooldown: 0,
    gunCooldown: 0,
    gunEquipped: false,
    ammo: 30,
    reloadTimer: 0,
    hurtTimer: 0, // seconds since last damage (for health regen)
    punchAnim: 0,
  };
}

// On-foot movement: WASD relative to the camera yaw.
export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const camYaw = G.cameraYaw;
  let fx = 0;
  let fz = 0;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) fz -= 1;
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) fz += 1;
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) fx -= 1;
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) fx += 1;
  const len = Math.hypot(fx, fz);
  p.moving = len > 0;
  if (len > 0) {
    fx /= len;
    fz /= len;
    // Rotate the input vector by the camera yaw: W moves away from the
    // camera, D moves to the camera's right.
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const wx = -fz * sin - fx * cos;
    const wz = -fz * cos + fx * sin;
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = run ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
    p.pos.x += wx * speed * dt;
    p.pos.z += wz * speed * dt;
    const targetHeading = Math.atan2(wx, wz);
    p.heading = angleLerp(p.heading, targetHeading, Math.min(1, dt * 12));
    p.walkPhase += dt * (run ? 13 : 9);
  } else {
    p.walkPhase += dt * 2;
  }
  // Walk swing.
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  p.parts.legL.rotation.x = swing;
  p.parts.legR.rotation.x = -swing;
  p.parts.armL.rotation.x = -swing * 0.8;
  p.parts.armR.rotation.x = swing * 0.8;
  if (p.punchAnim > 0) {
    p.punchAnim -= dt;
    p.parts.armR.rotation.x = -1.4;
  }
  p.mesh.rotation.y = p.heading;
  p.mesh.position.y = p.moving ? Math.abs(Math.sin(p.walkPhase)) * 0.06 : 0;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.gunCooldown > 0) p.gunCooldown -= dt;
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) p.ammo = 30;
  }
  // Health regen after 10 calm seconds.
  p.hurtTimer += dt;
  if (p.hurtTimer > 10 && p.health < PLAYER_HEALTH_MAX) {
    p.health = Math.min(PLAYER_HEALTH_MAX, p.health + 4 * dt);
  }
}

export function damagePlayer(G, amount) {
  const p = G.player;
  p.health = Math.max(0, p.health - amount);
  p.hurtTimer = 0;
  G.hud.flashDamage();
  return p.health <= 0;
}

// Punch: hits the nearest ped / cop in front of Leo.
export function playerPunch(G) {
  const p = G.player;
  if (p.punchCooldown > 0 || p.car) return;
  p.punchCooldown = 0.45;
  p.punchAnim = 0.3;
  G.audio.punch();
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const targets = [];
  for (const ped of G.peds) {
    if (ped.state !== 'down') targets.push({ obj: ped, kind: 'ped' });
  }
  for (const cop of G.cops) targets.push({ obj: cop, kind: 'cop' });
  for (const t of targets) {
    const dx = t.obj.pos.x - p.pos.x;
    const dz = t.obj.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.3 && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.3) {
      if (t.kind === 'ped') {
        G.knockDownPed(t.obj, 8);
        G.addCrime(100, { x: p.pos.x, z: p.pos.z, radius: 30 });
      } else {
        G.knockDownCop(t.obj);
        G.addCrime(100, { x: p.pos.x, z: p.pos.z, radius: 40 });
      }
      return;
    }
  }
}

// Shoot the pistol toward the camera aim point.
export function playerShoot(G, raycaster) {
  const p = G.player;
  if (p.gunCooldown > 0 || p.car || !p.gunEquipped || p.reloadTimer > 0) return;
  if (p.ammo <= 0) {
    p.reloadTimer = 1.6;
    return;
  }
  p.ammo -= 1;
  p.gunCooldown = 0.22;
  G.audio.gunshot();
  G.addCrime(45, { x: p.pos.x, z: p.pos.z, radius: 55 });
  raycaster.setFromCamera({ x: 0, y: 0 }, G.camera);
  const meshes = [];
  for (const ped of G.peds) if (ped.state !== 'down') meshes.push(ped.mesh);
  for (const cop of G.cops) meshes.push(cop.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length > 0 && hits[0].distance < 60) {
    const hitMesh = hits[0].object;
    let hitObj = null;
    let kind = null;
    for (const ped of G.peds) if (ped.mesh === hitMesh || ped.mesh.children.includes(hitMesh)) { hitObj = ped; kind = 'ped'; }
    for (const cop of G.cops) if (cop.mesh === hitMesh) { hitObj = cop; kind = 'cop'; }
    if (hitObj) {
      if (kind === 'ped') G.knockDownPed(hitObj, 30);
      else G.knockDownCop(hitObj);
      G.addCrime(80, { x: p.pos.x, z: p.pos.z, radius: 60 });
    }
  }
  G.hud.showTracer();
}

// Step into a car (steal it if occupied) or step out of one.
export function toggleCar(G) {
  const p = G.player;
  if (p.car) {
    // Step out on the left side of the car.
    const car = p.car;
    car.driver = null;
    car.occupied = false;
    p.car = null;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    p.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
    p.mesh.visible = true;
    p.heading = car.heading;
    G.audio.door();
    return 'out';
  }
  const car = G.nearestStealableCar();
  if (!car) return null;
  if (car.driver === 'traffic') {
    // The driver bails and runs; stealing in public is a crime.
    G.ejectDriver(car);
    G.addCrime(100, { x: car.pos.x, z: car.pos.z, radius: 40 });
    G.hud.showBanner('CAR STOLEN — the driver ran off!');
  }
  car.driver = 'player';
  car.occupied = true;
  p.car = car;
  p.mesh.visible = false;
  G.audio.door();
  return 'in';
}

export function nearestPedDistance(peds, x, z) {
  let best = Infinity;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    best = Math.min(best, dist2d(x, z, ped.pos.x, ped.pos.z));
  }
  return best;
}

export function clampPlayerHealth(p) {
  p.health = clamp(p.health, 0, PLAYER_HEALTH_MAX);
}
