// Solmar Heat — story and missions. Leo Marín is new in Solmar, a sunny
// coastal city where everybody owes somebody. Rico the mechanic, Mara the
// fixer and Tito the cab dispatcher pull him into four jobs that pay.
// A mission is a list of steps; each step has an objective line, a marker
// position, and a check that runs every frame.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'rico-wheels',
    title: 'Wheels for Rico',
    giver: 'Rico',
    reward: 300,
    intro: [
      ['Rico', 'Leo! You made it to Solmar. Listen — I need wheels, fast.'],
      ['Rico', 'Borrow any car on the street. Press E next to one. Then bring it to my garage.'],
    ],
    steps: [
      {
        objective: 'Steal a car (press E next to any car)',
        marker: null,
        check: (G) => (G.player.car ? 'next' : null),
      },
      {
        objective: 'Drive the car to Rico\u2019s garage',
        marker: 'ricoGarage',
        check: (G) => {
          const m = G.city.spots.ricoGarage;
          return G.player.car && Math.hypot(G.player.pos.x - m.x, G.player.pos.z - m.z) < 9 ? 'done' : null;
        },
      },
    ],
    outro: [
      ['Rico', 'Clean work. That ride is mine now — and this cash is yours.'],
    ],
  },
  {
    id: 'the-package',
    title: 'The Package',
    giver: 'Mara',
    reward: 500,
    intro: [
      ['Mara', 'Rico says you can drive. Good. I have a package on the pier.'],
      ['Mara', 'Pick it up, then run it to the docks. Two minutes, no cops.'],
    ],
    steps: [
      {
        objective: 'Pick up the package on the pier',
        marker: 'pierPickup',
        check: (G) => {
          const m = G.city.spots.pierPickup;
          return Math.hypot(G.player.pos.x - m.x, G.player.pos.z - m.z) < 5 ? 'next' : null;
        },
      },
      {
        objective: 'Deliver the package to the docks',
        marker: 'docks',
        timer: 120,
        check: (G) => {
          const m = G.city.spots.docks;
          return Math.hypot(G.player.pos.x - m.x, G.player.pos.z - m.z) < 7 ? 'done' : null;
        },
      },
    ],
    outro: [
      ['Mara', 'Delivered, on time. Solmar runs on people like you, Leo.'],
    ],
  },
  {
    id: 'cab-hustle',
    title: 'Cab Hustle',
    giver: 'Tito',
    reward: 400,
    intro: [
      ['Tito', 'My best cabbie called in sick. You have a car, yes?'],
      ['Tito', 'Pick up the guest at the Solmar Hotel, drive them to the airport. Easy money.'],
    ],
    steps: [
      {
        objective: 'Pick up the guest at the Solmar Hotel',
        marker: 'hotel',
        check: (G) => {
          const m = G.city.spots.hotel;
          return Math.hypot(G.player.pos.x - m.x, G.player.pos.z - m.z) < 7 ? 'next' : null;
        },
      },
      {
        objective: 'Drive the guest to the airport',
        marker: 'airport',
        check: (G) => {
          const m = G.city.spots.airport;
          return Math.hypot(G.player.pos.x - m.x, G.player.pos.z - m.z) < 9 ? 'done' : null;
        },
      },
    ],
    outro: [
      ['Tito', 'Five stars from the guest! You are hired whenever you want, Leo.'],
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    giver: 'Mara',
    reward: 800,
    intro: [
      ['Mara', 'Last job, and it is loud. The Solmar police need a lesson.'],
      ['Mara', 'Get them to three stars, then vanish. Lose the heat and the money is yours.'],
    ],
    steps: [
      {
        objective: 'Raise your wanted level to 3 stars (steal cars, cause chaos)',
        marker: null,
        check: (G) => (G.wanted.stars >= 3 ? 'next' : null),
      },
      {
        objective: 'Lose the heat — hide until the stars are gone',
        marker: null,
        check: (G) => (G.wanted.stars === 0 ? 'done' : null),
      },
    ],
    outro: [
      ['Mara', 'Ghost. The whole city is talking about you, Leo. Solmar is yours now.'],
    ],
  },
];

export function createMissionState() {
  return {
    index: 0, // which mission of MISSIONS is active
    step: 0,
    active: false,
    stepTimer: 0, // counts down when the step has a timer
    failed: false,
    doneCount: 0,
  };
}

export function currentMission(missionState) {
  return MISSIONS[missionState.index] || null;
}

export function currentStep(missionState) {
  const m = currentMission(missionState);
  return m ? m.steps[missionState.step] : null;
}

// A glowing beacon cylinder + floating diamond marking the objective.
export function createMarker(scene) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd23a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beamMat);
  beam.position.y = 30;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.25, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23a }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffe97a }),
  );
  diamond.position.y = 6;
  group.add(diamond);
  group.visible = false;
  group.userData.diamond = diamond;
  scene.add(group);
  return group;
}

export function updateMarker(marker, dt, time) {
  if (!marker.visible) return;
  marker.userData.diamond.rotation.y += dt * 2;
  marker.userData.diamond.position.y = 6 + Math.sin(time * 2) * 0.6;
}

// Start the next mission: show its intro lines, arm step 0.
export function startMission(G) {
  const m = currentMission(G.mission);
  if (!m) return false;
  G.mission.active = true;
  G.mission.step = 0;
  G.mission.failed = false;
  const step = currentStep(G.mission);
  G.mission.stepTimer = step && step.timer ? step.timer : 0;
  G.hud.showDialog(m.intro);
  G.hud.setObjective(`${m.title}: ${step.objective}`);
  return true;
}

// Advance the mission state each frame; returns 'done' | 'failed' | null.
export function updateMission(G, dt) {
  const ms = G.mission;
  if (!ms.active) return null;
  const m = currentMission(ms);
  if (!m) return null;
  const step = currentStep(ms);
  if (!step) return null;
  if (step.timer) {
    ms.stepTimer -= dt;
    if (ms.stepTimer <= 0) {
      ms.active = false;
      ms.failed = true;
      G.hud.showBanner('MISSION FAILED — out of time');
      G.hud.showDialog([['Mara', 'Too slow, Leo. Come back when you are ready — the job is still open.']]);
      return 'failed';
    }
  }
  const result = step.check(G);
  if (result === 'next') {
    ms.step += 1;
    const next = currentStep(ms);
    if (next) {
      ms.stepTimer = next.timer || 0;
      G.hud.setObjective(`${m.title}: ${next.objective}`);
      G.audio.pickup();
    }
    return null;
  }
  if (result === 'done') {
    ms.active = false;
    ms.doneCount += 1;
    G.money += m.reward;
    G.missionsDone.push(m.id);
    G.hud.showBanner(`MISSION COMPLETE — $${m.reward}`);
    G.hud.setObjective('Mission complete! Your next job is coming up…');
    G.hud.showDialog(m.outro);
    G.audio.missionDone();
    G.mission.index += 1;
    G.save();
    return 'done';
  }
  return null;
}
