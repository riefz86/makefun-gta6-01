// Solmar Heat — the wanted system and the Solmar police.
// Stars rise with crimes the law sees, fall when the player hides; patrol cars
// and foot officers chase, ram and try to bust the player.
import * as THREE from 'three';
import { PITCH, GRID, WANTED_MAX, makeRng, clamp, dist2d } from './config.js';
import { Car } from './vehicles.js';
import { coloredBox, mergeGeometries, flatMaterial } from './util.js';

export function createWanted() {
  return {
    stars: 0,
    heat: 0, // 0..100 within the current star level
    coolTimer: 0, // seconds since the last crime / police sighting
    bustedTimer: 0, // seconds a foot cop has held the player
  };
}

// A crime adds heat; every 100 heat is another star, up to 5.
export function addWanted(wanted, amount) {
  wanted.heat += amount;
  wanted.coolTimer = 0;
  while (wanted.heat >= 100 && wanted.stars < WANTED_MAX) {
    wanted.heat -= 100;
    wanted.stars += 1;
  }
  if (wanted.stars >= WANTED_MAX) wanted.heat = Math.min(wanted.heat, 99);
}

export function clearWanted(wanted) {
  wanted.stars = 0;
  wanted.heat = 0;
  wanted.coolTimer = 0;
  wanted.bustedTimer = 0;
}

// Stars cool down when no cop can see the player for a while.
export function updateWanted(wanted, dt, policeCanSee) {
  if (wanted.stars === 0) return;
  if (policeCanSee) {
    wanted.coolTimer = 0;
  } else {
    wanted.coolTimer += dt;
    if (wanted.coolTimer > 9) {
      wanted.coolTimer = 0;
      wanted.stars -= 1;
      wanted.heat = 0;
    }
  }
}

// --- Foot officers ----------------------------------------------------------

function makeCopMesh() {
  const geos = [
    coloredBox(0.66, 0.78, 0.36, 0x1a2a4a, 0, 1.15, 0), // navy torso
    coloredBox(0.4, 0.4, 0.36, 0xe8b890, 0, 1.75, 0), // head
    coloredBox(0.44, 0.16, 0.4, 0x101418, 0, 1.98, 0), // cap
    coloredBox(0.24, 0.72, 0.26, 0x1a2a4a, -0.17, 0.4, 0),
    coloredBox(0.24, 0.72, 0.26, 0x1a2a4a, 0.17, 0.4, 0),
    coloredBox(0.16, 0.6, 0.16, 0xe8b890, -0.4, 1.15, 0),
    coloredBox(0.16, 0.6, 0.16, 0xe8b890, 0.4, 1.15, 0),
    coloredBox(0.68, 0.1, 0.38, 0xd2b83a, 0, 1.32, 0), // badge belt
  ];
  return new THREE.Mesh(mergeGeometries(geos), flatMaterial);
}

export function spawnFootCop(scene, x, z) {
  const mesh = makeCopMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh,
    pos: mesh.position,
    heading: 0,
    speed: 4.6,
    bobPhase: 0,
    punchCooldown: 0,
  };
}

export function updateFootCops(cops, dt, playerPos, onCatch, onPunch) {
  for (const cop of cops) {
    const dx = playerPos.x - cop.pos.x;
    const dz = playerPos.z - cop.pos.z;
    const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
    const targetHeading = Math.atan2(dx / d, dz / d);
    let diff = targetHeading - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.heading += clamp(diff, -5 * dt, 5 * dt);
    const runSpeed = d > 8 ? cop.speed : d > 2 ? cop.speed * 0.7 : 0;
    if (runSpeed > 0) {
      cop.pos.x += Math.sin(cop.heading) * runSpeed * dt;
      cop.pos.z += Math.cos(cop.heading) * runSpeed * dt;
      cop.bobPhase += dt * 11;
    }
    cop.mesh.rotation.y = cop.heading;
    cop.mesh.position.y = Math.abs(Math.sin(cop.bobPhase)) * 0.08;
    if (cop.punchCooldown > 0) cop.punchCooldown -= dt;
    if (d < 1.7) {
      // The officer has a hold of the player: no more running through,
      // just the grab timer and the punches.
      onCatch(dt);
      if (cop.punchCooldown <= 0) {
        cop.punchCooldown = 1.1;
        onPunch(8);
      }
    }
  }
}

// --- Patrol cars ------------------------------------------------------------

export function spawnPatrolCar(scene, x, z, heading) {
  const car = new Car(scene, x, z, heading, 0x1a1a22, true);
  car.driver = 'police';
  car.occupied = true;
  car.lightPhase = 0;
  return car;
}

// Chase the player: steer toward them, ram to slow them down.
export function updatePatrolCars(cars, dt, playerPos, playerSpeed, collideBuildingsFn) {
  for (const car of cars) {
    const dx = playerPos.x - car.pos.x;
    const dz = playerPos.z - car.pos.z;
    const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.4, -1, 1);
    // Ease off the gas when right on the player's bumper, so the ram is a nudge.
    const throttle = d > 7 ? 1 : 0.45;
    car.drive(dt, throttle, steer);
    if (collideBuildingsFn) collideBuildingsFn(car.pos, 2.2);
    car.lightPhase = (car.lightPhase || 0) + dt * 6;
    // Flashing light bar: alternate red / blue emissive boxes above the roof.
    if (!car.beacon) {
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
      car.beacon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), beaconMat);
      car.beacon.position.set(0, 1.56, -0.25);
      car.mesh.add(car.beacon);
    }
    car.beacon.material.color.setHex(Math.sin(car.lightPhase) > 0 ? 0xd21f1f : 0x2050d2);
  }
}

// How many cops the current wanted level fields.
export function desiredPoliceCounts(stars) {
  if (stars <= 0) return { cars: 0, foot: 0 };
  if (stars === 1) return { cars: 0, foot: 1 };
  if (stars === 2) return { cars: 1, foot: 1 };
  if (stars === 3) return { cars: 2, foot: 2 };
  if (stars === 4) return { cars: 3, foot: 2 };
  return { cars: 4, foot: 3 };
}

// Spawn a police unit on a road near (but not on top of) the player.
export function spawnPointNearPlayer(rng, playerPos) {
  const road = (Math.floor(rng() * (GRID * 2 + 1)) - GRID) * PITCH;
  const vertical = rng() < 0.5;
  const offset = 40 + rng() * 40;
  const sign = rng() < 0.5 ? 1 : -1;
  if (vertical) return { x: road, z: playerPos.z + sign * offset };
  return { x: playerPos.x + sign * offset, z: road };
}

export function policeCanSeePlayer(cops, copCars, playerPos) {
  for (const cop of cops) {
    if (dist2d(cop.pos.x, cop.pos.z, playerPos.x, playerPos.z) < 55) return true;
  }
  for (const car of copCars) {
    if (dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z) < 70) return true;
  }
  return false;
}
