// Solmar Heat — cars: one merged, vertex-coloured mesh per car, plus the
// arcade driving model the player and the police share. A car is 4.4 m long,
// 2 m wide; forward is +Z in local space, heading is the yaw around Y.
import * as THREE from 'three';
import { coloredBox, coloredCylinder, mergeGeometries, flatMaterial } from './util.js';
import { clamp, CAR_COLORS, makeRng } from './config.js';

export function makeCarMesh(color, isPolice = false) {
  const body = isPolice ? 0x1a1a22 : color;
  const accent = isPolice ? 0xffffff : color;
  const geos = [
    // lower body
    coloredBox(2.0, 0.62, 4.4, body, 0, 0.55, 0),
    // cabin
    coloredBox(1.7, 0.55, 2.2, isPolice ? 0x222228 : 0x2a3542, 0, 1.12, -0.25),
    // windows band
    coloredBox(1.74, 0.3, 2.0, 0x9fc8e8, 0, 1.08, -0.25),
    // wheels
    coloredCylinder(0.38, 0.38, 0.3, 0x141414, -0.95, 0.38, 1.45, 10),
    coloredCylinder(0.38, 0.38, 0.3, 0x141414, 0.95, 0.38, 1.45, 10),
    coloredCylinder(0.38, 0.38, 0.3, 0x141414, -0.95, 0.38, -1.45, 10),
    coloredCylinder(0.38, 0.38, 0.3, 0x141414, 0.95, 0.38, -1.45, 10),
    // headlights + taillights
    coloredBox(0.4, 0.14, 0.06, 0xfff2b0, -0.6, 0.62, 2.21),
    coloredBox(0.4, 0.14, 0.06, 0xfff2b0, 0.6, 0.62, 2.21),
    coloredBox(0.4, 0.14, 0.06, 0xd21f1f, -0.6, 0.62, -2.21),
    coloredBox(0.4, 0.14, 0.06, 0xd21f1f, 0.6, 0.62, -2.21),
  ];
  if (isPolice) {
    geos.push(coloredBox(1.9, 0.08, 0.7, 0xffffff, 0, 0.88, 0.2)); // door stripe
    geos.push(coloredBox(0.5, 0.14, 0.3, 0xd21f1f, -0.35, 1.44, -0.25)); // light bar
    geos.push(coloredBox(0.5, 0.14, 0.3, 0x2050d2, 0.35, 1.44, -0.25));
  } else {
    geos.push(coloredBox(1.8, 0.06, 0.5, accent, 0, 0.88, 1.4)); // hood stripe
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), flatMaterial);
  mesh.castShadow = false;
  return mesh;
}

export function makeRandomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}

export class Car {
  constructor(scene, x, z, heading, color, isPolice = false) {
    this.mesh = makeCarMesh(color, isPolice);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position; // THREE.Vector3, y stays 0
    this.heading = heading;
    this.speed = 0; // m/s, forward positive
    this.steer = 0;
    this.isPolice = isPolice;
    this.color = color;
    this.occupied = false; // a driver (player or traffic AI) is inside
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.crashCooldown = 0;
    this.lightBarOn = false;
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  forwardVector() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Arcade drive step: throttle in [-1, 1], steer in [-1, 1].
  drive(dt, throttle, steerInput) {
    const maxSpeed = this.isPolice ? 34 : 30;
    const accel = 13;
    const brake = 26;
    if (throttle > 0) this.speed += accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= brake * dt;
      else this.speed -= accel * 0.55 * dt; // reverse
    } else {
      this.speed -= this.speed * 0.9 * dt; // drag
    }
    this.speed = clamp(this.speed, -11, maxSpeed);
    // Steering bites harder at low speed, less at high speed.
    const steerTarget = clamp(steerInput, -1, 1) * (this.speed >= 0 ? 1 : -1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const turnRate = this.steer * 1.9 * clamp(Math.abs(this.speed) / 9, 0, 1);
    this.heading += turnRate * dt * (this.speed >= 0 ? 1 : -1);
    const f = this.forwardVector();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
  }

  // Called after a building hit: kill speed, keep the car outside the wall.
  crash(speedBefore) {
    if (this.crashCooldown > 0) return false;
    this.crashCooldown = 0.5;
    this.speed *= -0.25;
    return Math.abs(speedBefore) > 6;
  }

  remove(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}

// A parked car the player can steal: sits by a roadside, driverless.
export function spawnParkedCars(scene, city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const road = (Math.floor(rng() * 9) - 4) * 58;
    const along = (rng() - 0.5) * 420;
    const vertical = rng() < 0.5;
    const side = rng() < 0.5 ? 1 : -1;
    const x = vertical ? road + side * 5.2 : along;
    const z = vertical ? along : road + side * 5.2;
    const heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new Car(scene, x, z, heading, makeRandomCarColor(rng));
    cars.push(car);
  }
  return cars;
}

export function randomCarColor(rng) {
  return makeRandomCarColor(rng || makeRng(1));
}
