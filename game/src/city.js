// Solmar Heat — the procedural city of Solmar: a sun-soaked coastal grid.
// Roads on every PITCH line, pastel buildings inside the blocks, sidewalks,
// street lamps, palm trees, a plaza, a beach and the ocean to the south.
// Also owns the collision boxes and the road-network queries traffic uses.
import * as THREE from 'three';
import {
  PITCH, ROAD_W, GRID, CITY_HALF, BEACH_Z, SEA_Z,
  BUILDING_COLORS, makeRng, clamp,
} from './config.js';
import { coloredBox, coloredCylinder, mergeGeometries, flatMaterial } from './util.js';

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const city = {
    // {minX, maxX, minZ, maxZ} per building, for circle-vs-box collision.
    colliders: [],
    // Named spots missions and spawns use.
    spots: {},
  };

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd8ff, 0.9));
  scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x8a7a5a, 0.7));
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 320, 900);

  // Ground: grass-green base for the whole island.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 260, CITY_HALF * 2 + 260),
    new THREE.MeshLambertMaterial({ color: 0x7fae62 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  scene.add(ground);

  // Roads: dark strips along every grid line, with a lighter sidewalk border.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363c });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  const roadLen = GRID * 2 * PITCH + PITCH;
  for (let i = -GRID; i <= GRID; i += 1) {
    const c = i * PITCH;
    const vWalk = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 6, roadLen), walkMat);
    vWalk.rotation.x = -Math.PI / 2;
    vWalk.position.set(c, 0.01, 0);
    scene.add(vWalk);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, roadLen), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(c, 0.03, 0);
    scene.add(vRoad);
    const hWalk = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, ROAD_W + 6), walkMat);
    hWalk.rotation.x = -Math.PI / 2;
    hWalk.position.set(0, 0.01, c);
    scene.add(hWalk);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, ROAD_W), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.03, c);
    scene.add(hRoad);
  }
  // Dashed centre lines: small pale boxes, cheap and readable from above.
  const dashGeos = [];
  for (let i = -GRID; i <= GRID; i += 1) {
    for (let d = -roadLen / 2 + 8; d < roadLen / 2 - 4; d += 12) {
      dashGeos.push(coloredBox(0.5, 0.06, 4, 0xe8e0c0, i * PITCH, 0.05, d));
      dashGeos.push(coloredBox(4, 0.06, 0.5, 0xe8e0c0, d, 0.05, i * PITCH));
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(dashGeos), flatMaterial));

  // Buildings: one InstancedMesh, pastel boxes of varied height; taller downtown.
  const buildingGeos = [];
  const plaza = { bx: 0, bz: 0 }; // central plaza block stays open
  for (let bx = -GRID; bx < GRID; bx += 1) {
    for (let bz = -GRID; bz < GRID; bz += 1) {
      if (bx === plaza.bx && bz === plaza.bz) continue;
      if (rng() < 0.08) continue; // occasional empty lot / car park
      const cx = (bx + 0.5) * PITCH;
      const cz = (bz + 0.5) * PITCH;
      const distCentre = Math.abs(cx) + Math.abs(cz);
      const tall = distCentre < 120 ? 0.55 : 0.15;
      const h = 9 + rng() * (rng() < tall ? 42 : 16);
      const w = 18 + rng() * 14;
      const d = 18 + rng() * 14;
      const color = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
      const ox = (rng() - 0.5) * 6;
      const oz = (rng() - 0.5) * 6;
      buildingGeos.push(coloredBox(w, h, d, color, cx + ox, h / 2, cz + oz));
      // Dark window bands wrapped around each floor, so the slab reads as a building.
      const floors = Math.min(6, Math.floor(h / 4.5));
      for (let f = 0; f < floors; f += 1) {
        buildingGeos.push(coloredBox(w + 0.18, 0.9, d + 0.18, 0x2a3542, cx + ox, 3.4 + f * 4.5, cz + oz));
      }
      // Rooftop box + windows band: a darker cap so roofs read from above.
      buildingGeos.push(coloredBox(w * 0.55, 1.6, d * 0.55, 0x5a5a60, cx + ox, h + 0.8, cz + oz));
      city.colliders.push({
        minX: cx + ox - w / 2, maxX: cx + ox + w / 2,
        minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2,
      });
      if (rng() < 0.45) {
        // A second smaller tower on the same block, kept inside the block
        // so it can never spill onto a road or an intersection.
        const w2 = 12 + rng() * 8;
        const d2 = 12 + rng() * 8;
        const h2 = 7 + rng() * 14;
        const x2 = cx + (rng() < 0.5 ? -1 : 1) * (6 + rng() * 6);
        const z2 = cz + (rng() < 0.5 ? -1 : 1) * (6 + rng() * 6);
        if (Math.abs(x2 - cx) + w2 / 2 < 21 && Math.abs(z2 - cz) + d2 / 2 < 21) {
          const c2 = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
          buildingGeos.push(coloredBox(w2, h2, d2, c2, x2, h2 / 2, z2));
          const floors2 = Math.min(3, Math.floor(h2 / 4.5));
          for (let f = 0; f < floors2; f += 1) {
            buildingGeos.push(coloredBox(w2 + 0.18, 0.9, d2 + 0.18, 0x2a3542, x2, 3.4 + f * 4.5, z2));
          }
          city.colliders.push({
            minX: x2 - w2 / 2, maxX: x2 + w2 / 2,
            minZ: z2 - d2 / 2, maxZ: z2 + d2 / 2,
          });
        }
      }
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(buildingGeos), flatMaterial));

  // Central plaza: fountain disc + benches in the open block.
  const plazaGeos = [
    coloredCylinder(7, 7, 0.6, 0x9fb8c8, 0, 0.3, 0, 20),
    coloredCylinder(4.5, 4.5, 1.1, 0x6fb8d8, 0, 0.6, 0, 20),
    coloredBox(10, 0.8, 2, 0x8a6a4a, -14, 0.4, 10),
    coloredBox(10, 0.8, 2, 0x8a6a4a, 14, 0.4, -10),
  ];
  scene.add(new THREE.Mesh(mergeGeometries(plazaGeos), flatMaterial));

  // Palm trees along the sidewalks and the beach.
  const treeGeos = [];
  for (let i = -GRID; i <= GRID; i += 1) {
    for (let j = -GRID; j < GRID; j += 1) {
      if (rng() < 0.55) continue;
      const x = i * PITCH + (ROAD_W / 2 + 3.5) * (rng() < 0.5 ? 1 : -1);
      const z = (j + 0.5) * PITCH + (rng() - 0.5) * 30;
      treeGeos.push(coloredCylinder(0.25, 0.4, 5, 0x8a6a42, x, 2.5, z, 6));
      treeGeos.push(coloredCylinder(0.1, 2.6, 2.2, 0x3a9e4a, x, 5.6, z, 8));
    }
  }
  for (let x = -CITY_HALF; x <= CITY_HALF; x += 26) {
    if (rng() < 0.3) continue;
    treeGeos.push(coloredCylinder(0.25, 0.4, 5, 0x8a6a42, x, 2.5, BEACH_Z + 8, 6));
    treeGeos.push(coloredCylinder(0.1, 2.8, 2.4, 0x3a9e4a, x, 5.7, BEACH_Z + 8, 8));
  }
  scene.add(new THREE.Mesh(mergeGeometries(treeGeos), flatMaterial));

  // Street lamps at intersections: pole + glowing head.
  const lampGeos = [];
  const lampHeadGeos = [];
  for (let i = -GRID; i <= GRID; i += 1) {
    for (let j = -GRID; j <= GRID; j += 1) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * PITCH + ROAD_W / 2 + 1.2;
      const z = j * PITCH + ROAD_W / 2 + 1.2;
      lampGeos.push(coloredCylinder(0.12, 0.16, 7, 0x3a3a40, x, 3.5, z, 6));
      lampHeadGeos.push(coloredBox(1.1, 0.35, 0.5, 0xffe9a8, x, 7.1, z));
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(lampGeos), flatMaterial));
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  scene.add(new THREE.Mesh(mergeGeometries(lampHeadGeos), lampHeadMat));

  // Beach sand + ocean to the south, with a pier at the west end.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 260, 60),
    new THREE.MeshLambertMaterial({ color: 0xe8d8a0 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, BEACH_Z + 14);
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 600, 400),
    new THREE.MeshLambertMaterial({ color: 0x2a7fc8 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.3, SEA_Z + 170);
  scene.add(ocean);
  const pierGeos = [
    coloredBox(8, 0.8, 60, 0x9a7a52, -CITY_HALF + 40, 0.6, BEACH_Z + 30),
  ];
  for (let k = 0; k < 5; k += 1) {
    pierGeos.push(coloredCylinder(0.3, 0.3, 2.4, 0x6a4a2a, -CITY_HALF + 36.5, 0.4, BEACH_Z + 8 + k * 12, 6));
    pierGeos.push(coloredCylinder(0.3, 0.3, 2.4, 0x6a4a2a, -CITY_HALF + 43.5, 0.4, BEACH_Z + 8 + k * 12, 6));
  }
  scene.add(new THREE.Mesh(mergeGeometries(pierGeos), flatMaterial));

  // Named spots for missions and spawns.
  city.spots = {
    plaza: { x: 0, z: 0 },
    ricoGarage: { x: -PITCH * 2, z: PITCH * 2 },
    pierPickup: { x: -CITY_HALF + 40, z: BEACH_Z + 52 },
    docks: { x: PITCH * 4, z: -PITCH * 4 },
    hotel: { x: PITCH * 3, z: PITCH },
    airport: { x: -PITCH * 4, z: -PITCH * 4 },
    hospital: { x: PITCH, z: -PITCH * 2 },
    policeStation: { x: -PITCH, z: PITCH * 3 },
    beach: { x: 40, z: BEACH_Z + 10 },
  };

  return city;
}

// --- Road network queries -------------------------------------------------

// Nearest point on any road centreline to (x, z), plus which axis it runs on.
export function nearestRoadPoint(x, z) {
  const rx = clamp(Math.round(x / PITCH) * PITCH, -GRID * PITCH, GRID * PITCH);
  const rz = clamp(Math.round(z / PITCH) * PITCH, -GRID * PITCH, GRID * PITCH);
  const dx = Math.abs(x - rx);
  const dz = Math.abs(z - rz);
  if (dx < dz) return { x: rx, z, axis: 'z', road: rx };
  return { x, z: rz, axis: 'x', road: rz };
}

export function isOnRoad(x, z) {
  const p = nearestRoadPoint(x, z);
  return p.axis === 'z' ? Math.abs(x - p.x) < ROAD_W / 2 + 1 : Math.abs(z - p.z) < ROAD_W / 2 + 1;
}

// Push a circle (x, z, radius) out of every building box it overlaps.
// Returns true when a collision happened (for crash feedback).
export function collideBuildings(city, pos, radius) {
  let hit = false;
  for (const b of city.colliders) {
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        pos.x = b.maxX + radius;
      }
    }
  }
  return hit;
}

export function clampToCity(pos, margin = 4) {
  pos.x = clamp(pos.x, -CITY_HALF - margin, CITY_HALF + margin);
  pos.z = clamp(pos.z, -CITY_HALF - margin, SEA_Z - 6);
}
