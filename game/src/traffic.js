// Solmar Heat — traffic: AI cars that cruise the road grid on the right-hand
// lane, turn at intersections, and slow down for the car ahead.
import { PITCH, GRID, makeRng, dist2d } from './config.js';
import { Car, makeRandomCarColor } from './vehicles.js';

export function createTraffic(scene, count, seed) {
  const rng = makeRng(seed);
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng() < 0.5;
    const road = (Math.floor(rng() * (GRID * 2 + 1)) - GRID) * PITCH;
    const along = (rng() * 2 - 1) * GRID * PITCH;
    const dir = rng() < 0.5 ? 1 : -1;
    const lane = 3.4; // right-hand lane offset
    const x = vertical ? road + (dir > 0 ? lane : -lane) : along;
    const z = vertical ? along : road + (dir > 0 ? -lane : lane);
    const heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new Car(scene, x, z, heading, makeRandomCarColor(rng));
    car.driver = 'traffic';
    car.occupied = true;
    car.cruiseSpeed = 8 + rng() * 5;
    car.vertical = vertical;
    car.dir = dir;
    car.speed = car.cruiseSpeed;
    cars.push(car);
  }
  return cars;
}

// Snap a traffic car back onto its lane after a turn.
function snapToLane(car) {
  if (car.vertical) {
    const road = Math.round(car.pos.x / PITCH) * PITCH;
    const lane = car.dir > 0 ? 3.4 : -3.4;
    car.pos.x += (road + lane - car.pos.x) * 0.2;
  } else {
    const road = Math.round(car.pos.z / PITCH) * PITCH;
    const lane = car.dir > 0 ? -3.4 : 3.4;
    car.pos.z += (road + lane - car.pos.z) * 0.2;
  }
}

export function updateTraffic(cars, dt, rng, playerCar, policeCars) {
  for (const car of cars) {
    if (car.driver !== 'traffic') continue; // stolen: the player drives it now
    // Look ahead: slow down for any car directly in front.
    let target = car.cruiseSpeed;
    const f = car.forwardVector();
    const all = cars.concat(playerCar ? [playerCar] : [], policeCars || []);
    for (const other of all) {
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 12 && side < 2.6) {
        target = Math.min(target, Math.max(0, other.speed * 0.9));
      }
    }
    // Ease toward the target speed, then roll forward.
    car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
    car.pos.x += f.x * car.speed * dt;
    car.pos.z += f.z * car.speed * dt;
    snapToLane(car);
    car.mesh.rotation.y = car.heading;

    // At an intersection (near a crossing road line), maybe turn.
    const along = car.vertical ? car.pos.z : car.pos.x;
    const nearestCross = Math.round(along / PITCH) * PITCH;
    if (Math.abs(along - nearestCross) < 1.2 && !car.turnedAt) {
      car.turnedAt = nearestCross;
      if (rng() < 0.4) {
        const left = rng() < 0.5;
        car.vertical = !car.vertical;
        car.dir = left ? -car.dir : car.dir;
        if (car.vertical) {
          car.heading = car.dir > 0 ? 0 : Math.PI;
          car.pos.x = nearestCross + (car.dir > 0 ? 3.4 : -3.4);
        } else {
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.pos.z = nearestCross + (car.dir > 0 ? -3.4 : 3.4);
        }
      }
    }
    if (Math.abs(along - nearestCross) > 4) car.turnedAt = null;

    // Wrap around the city edge: loop back on the opposite side.
    const limit = GRID * PITCH + 20;
    if (car.vertical && Math.abs(car.pos.z) > limit) car.pos.z = -Math.sign(car.pos.z) * limit;
    if (!car.vertical && Math.abs(car.pos.x) > limit) car.pos.x = -Math.sign(car.pos.x) * limit;
  }
}

// A traffic car the player is close to, for the "press E to steal" prompt.
export function nearestTrafficCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = dist2d(x, z, car.pos.x, car.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function countTraffic(cars) {
  return cars.filter((c) => c.driver === 'traffic').length;
}
