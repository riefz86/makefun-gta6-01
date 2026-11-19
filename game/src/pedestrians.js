// Solmar Heat — pedestrians: colourful walkers on the sidewalks who stroll,
// cross at corners, and run away screaming (well, fleeing) when crime happens
// nearby. Each ped is one merged mesh; walking is a bob + lean.
import * as THREE from 'three';
import { PITCH, GRID, makeRng, clamp, dist2d } from './config.js';
import { coloredBox, mergeGeometries, flatMaterial } from './util.js';
import { nearestRoadPoint } from './city.js';

const SKIN = [0xe8b890, 0xc89068, 0x8a5a3a, 0xf0c8a0];
const SHIRTS = [0xd23b2e, 0x2e6fd2, 0xe8c832, 0x2ed27a, 0x8a5fd2, 0xe8e8e8, 0xd27a2e];
const PANTS = [0x2a3542, 0x4a3a2a, 0x5a5a60, 0x3a5a3a];

function makePedMesh(rng) {
  const skin = SKIN[Math.floor(rng() * SKIN.length)];
  const shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
  const pants = PANTS[Math.floor(rng() * PANTS.length)];
  const geos = [
    coloredBox(0.62, 0.75, 0.34, shirt, 0, 1.15, 0), // torso
    coloredBox(0.4, 0.4, 0.36, skin, 0, 1.75, 0), // head
    coloredBox(0.44, 0.14, 0.4, 0x2a2a2a, 0, 1.98, 0), // hair
    coloredBox(0.24, 0.72, 0.26, pants, -0.17, 0.4, 0), // left leg
    coloredBox(0.24, 0.72, 0.26, pants, 0.17, 0.4, 0), // right leg
    coloredBox(0.16, 0.6, 0.16, skin, -0.4, 1.15, 0), // left arm
    coloredBox(0.16, 0.6, 0.16, skin, 0.4, 1.15, 0), // right arm
  ];
  const mesh = new THREE.Mesh(mergeGeometries(geos), flatMaterial);
  return mesh;
}

export function createPedestrians(scene, count, seed) {
  const rng = makeRng(seed);
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = makePedMesh(rng);
    scene.add(mesh);
    const ped = {
      mesh,
      pos: mesh.position,
      heading: rng() * Math.PI * 2,
      speed: 1.1 + rng() * 0.7,
      state: 'walk', // walk | flee | down
      downTimer: 0,
      target: null,
      retargetTimer: rng() * 4,
      bobPhase: rng() * Math.PI * 2,
    };
    // Start on a sidewalk next to a road.
    const road = (Math.floor(rng() * (GRID * 2 + 1)) - GRID) * PITCH;
    const along = (rng() * 2 - 1) * GRID * PITCH;
    if (rng() < 0.5) {
      ped.pos.set(road + (rng() < 0.5 ? 8.6 : -8.6), 0, along);
    } else {
      ped.pos.set(along, 0, road + (rng() < 0.5 ? 8.6 : -8.6));
    }
    ped.heading = rng() * Math.PI * 2;
    peds.push(ped);
  }
  return peds;
}

// Pick a new sidewalk waypoint near the ped.
function pickSidewalkTarget(ped, rng) {
  const p = nearestRoadPoint(ped.pos.x, ped.pos.z);
  const side = rng() < 0.5 ? 1 : -1;
  if (p.axis === 'z') {
    return { x: p.x + side * 8.6, z: ped.pos.z + (rng() - 0.5) * 90 };
  }
  return { x: ped.pos.x + (rng() - 0.5) * 90, z: p.z + side * 8.6 };
}

export function updatePedestrians(peds, dt, rng, danger) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      ped.mesh.rotation.x = -Math.PI / 2; // lying flat
      ped.mesh.position.y = 0.35;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        ped.mesh.rotation.x = 0;
        ped.mesh.position.y = 0;
      }
      continue;
    }
    // Flee from a nearby crime / speeding car / gunfire.
    if (danger && danger.x !== undefined) {
      const d = dist2d(ped.pos.x, ped.pos.z, danger.x, danger.z);
      if (d < danger.radius) {
        ped.state = 'flee';
        ped.fleeFrom = { x: danger.x, z: danger.z };
        ped.fleeTimer = 2.5;
      }
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const dx = ped.pos.x - ped.fleeFrom.x;
      const dz = ped.pos.z - ped.fleeFrom.z;
      const len = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
      const targetHeading = Math.atan2(dx / len, dz / len);
      ped.heading += (targetHeading - ped.heading) * Math.min(1, dt * 6);
      const speed = 4.2;
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      ped.bobPhase += dt * 14;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    } else {
      ped.retargetTimer -= dt;
      if (!ped.target || ped.retargetTimer <= 0 || dist2d(ped.pos.x, ped.pos.z, ped.target.x, ped.target.z) < 2) {
        ped.target = pickSidewalkTarget(ped, rng);
        ped.retargetTimer = 6 + rng() * 6;
      }
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
      ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.bobPhase += dt * 7;
    }
    ped.mesh.rotation.y = ped.heading;
    ped.mesh.position.y = Math.abs(Math.sin(ped.bobPhase)) * 0.07;
    ped.pos.x = clamp(ped.pos.x, -GRID * PITCH - 30, GRID * PITCH + 30);
    ped.pos.z = clamp(ped.pos.z, -GRID * PITCH - 30, GRID * PITCH + 60);
  }
}

// Knock a ped down (punch / shot / car hit). Returns the ped.
export function knockDownPed(ped, seconds = 6) {
  ped.state = 'down';
  ped.downTimer = seconds;
  return ped;
}

export function nearestPed(peds, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = dist2d(x, z, ped.pos.x, ped.pos.z);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  return best;
}
