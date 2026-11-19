// Solmar Heat — screenshot scenes behind ?shot=cover|drive|chase|mission.
// Each scene sets up a real game state (player, cars, traffic, police,
// mission) and steps the simulation forward a few seconds, so the frame is
// what a short session of play really looks like — never a fake picture.
import { PITCH, BEACH_Z, CITY_HALF } from './config.js';
import { startMission } from './missions.js';
import { spawnPatrolCar, addWanted } from './police.js';

// Step the world forward without rendering, so traffic and peds spread out.
function settle(G, seconds) {
  const dt = 1 / 30;
  const steps = Math.floor(seconds / dt);
  for (let i = 0; i < steps; i += 1) G.stepWorld(dt, true);
}

// Dismiss the intro dialog so it does not cover the car in driving shots.
function clearDialog(G) {
  G.hud.dialogQueue = [];
  G.hud.dialogTimer = 0;
  document.getElementById('dialog').style.display = 'none';
}

// Park a few traffic cars and pedestrians in front of the camera so the
// cover frame shows the living city, not an empty street.
function dressStreet(G, roadX, zFrom, zTo) {
  const cars = G.traffic.filter((c) => c.driver === 'traffic');
  const spots = [
    { x: roadX - 3.4, z: zFrom, heading: Math.PI, dir: -1, vertical: true },
    { x: roadX + 3.4, z: (zFrom + zTo) / 2, heading: 0, dir: 1, vertical: true },
    { x: roadX - 3.4, z: zTo, heading: Math.PI, dir: -1, vertical: true },
  ];
  spots.forEach((s, i) => {
    const car = cars[i];
    if (!car) return;
    car.pos.set(s.x, 0, s.z);
    car.heading = s.heading;
    car.dir = s.dir;
    car.vertical = s.vertical;
    car.speed = car.cruiseSpeed;
  });
  const peds = G.peds.slice(0, 4);
  const pedSpots = [
    { x: roadX - 8.6, z: zFrom - 6 },
    { x: roadX + 8.6, z: zFrom - 18 },
    { x: roadX - 8.6, z: zFrom - 30 },
    { x: roadX + 8.6, z: zFrom - 42 },
  ];
  peds.forEach((ped, i) => {
    ped.pos.set(pedSpots[i].x, 0, pedSpots[i].z);
    ped.heading = Math.PI * (0.5 + i * 0.25);
  });
}

export function stageShot(name, G) {
  G.startNewGame(true); // silent start: no start screen, no save wipe
  G.hud.hideStart();
  G.hud.show();
  if (name === 'drive') {
    // Leo in a car, rolling down the central avenue with traffic ahead.
    G.player.pos.set(PITCH, 0, PITCH * 2);
    G.player.heading = Math.PI;
    const car = G.parkedCars[0];
    car.pos.set(PITCH, 0, PITCH * 2 + 6);
    car.heading = Math.PI;
    car.driver = 'player';
    car.occupied = true;
    G.player.car = car;
    G.player.mesh.visible = false;
    car.speed = 16;
    G.cameraYaw = Math.PI;
    G.cameraPitch = 0.32;
    dressStreet(G, PITCH, PITCH * 2 - 40, PITCH * 2 - 110);
    settle(G, 1.2);
    clearDialog(G);
    return;
  }
  if (name === 'chase') {
    // Three stars, two patrol cars on Leo's tail, sirens up.
    G.player.pos.set(-PITCH, 0, PITCH);
    const car = G.parkedCars[1];
    car.pos.set(-PITCH, 0, PITCH + 6);
    car.heading = 0;
    car.driver = 'player';
    car.occupied = true;
    G.player.car = car;
    G.player.mesh.visible = false;
    car.speed = 20;
    addWanted(G.wanted, 320);
    for (let i = 0; i < 2; i += 1) {
      const cop = spawnPatrolCar(G.scene, -PITCH + (i === 0 ? 4 : -4), PITCH - 18 - i * 10, 0);
      cop.speed = 24;
      G.copCars.push(cop);
    }
    G.cameraYaw = 0;
    G.cameraPitch = 0.35;
    settle(G, 1.0);
    // Park the patrol cars ahead of Leo's bumper, light bars flashing, so
    // the chase reads in the frozen frame (they end up behind the camera
    // if left where the pursuit drops them).
    const px = G.player.pos.x;
    const pz = G.player.pos.z;
    G.copCars[0].pos.set(px - 4.5, 0, pz + 20);
    G.copCars[0].heading = 0;
    G.copCars[0].speed = 24;
    if (G.copCars[1]) {
      G.copCars[1].pos.set(px + 5, 0, pz + 34);
      G.copCars[1].heading = 0;
      G.copCars[1].speed = 24;
    }
    clearDialog(G);
    return;
  }
  if (name === 'mission') {
    // Mission 2 in progress: Leo on foot by the pier, the package beacon up
    // ahead of him with the ocean behind it.
    G.mission.index = 1;
    startMission(G);
    G.player.pos.set(-CITY_HALF + 40, 0, BEACH_Z - 8);
    G.player.heading = 0;
    G.cameraYaw = 0;
    G.cameraPitch = 0.3;
    settle(G, 1.0);
    clearDialog(G);
    return;
  }
  // Default: cover — Leo on foot on the east sidewalk, traffic and peds
  // around him, mission 1 active, the city stretching down the avenue.
  // (The plaza fountain sits between the old spot and the road, so Leo
  // stands clear of it here and the traffic reads in the frame.)
  startMission(G);
  G.player.pos.set(0, 0, 58);
  G.player.heading = Math.PI;
  G.cameraYaw = Math.PI;
  G.cameraPitch = 0.34;
  dressStreet(G, 0, 30, -10);
  settle(G, 0.8);
  // Show Rico's first line over the frozen frame (the loop that would
  // normally advance the dialog does not run in shot mode).
  G.hud.updateDialog(10);
}
