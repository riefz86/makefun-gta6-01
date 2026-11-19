// Solmar Heat — save / load through localStorage.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      money: state.money,
      missionsDone: state.missionsDone.slice(),
      missionIndex: state.mission.index,
      health: state.player.health,
      x: state.player.pos.x,
      z: state.player.pos.z,
      clockMinutes: state.clockMinutes,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // storage unavailable: a fresh game is the fallback
  }
}
