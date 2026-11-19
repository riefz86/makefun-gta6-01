// Solmar Heat — all sound is synthesized with WebAudio: no audio files.
// Engine hum, police siren, gunshots, punches, pickups, crashes and a slow
// ambient chord loop that plays while the city goes by.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenHigh: false,
    sirenTimer: 0,
    musicTimer: 0,
    musicStep: 0,
    ready: false,
  };

  function ensureContext() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc2 = audio.ctx.createOscillator();
    audio.engineOsc2.type = 'square';
    const engineFilter = audio.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 900;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(engineFilter);
    audio.engineOsc2.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.engineOsc2.start();
    // Siren: one triangle that alternates between two tones.
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    audio.ready = true;
  }

  audio.unlock = function unlockAudio() {
    ensureContext();
  };

  audio.setMuted = function setMuted(m) {
    audio.muted = m;
    if (audio.master) audio.master.gain.value = m ? 0 : 0.5;
  };

  // Call every frame: engine pitch from car speed, siren when police are near.
  audio.update = function updateAudio(speedKmh, inCar, policeNear) {
    if (!audio.ready) return;
    const t = audio.ctx.currentTime;
    const target = inCar ? 0.05 + Math.min(0.09, speedKmh / 1600) : 0;
    audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const freq = 55 + speedKmh * 1.6;
    audio.engineOsc.frequency.setTargetAtTime(freq, t, 0.1);
    audio.engineOsc2.frequency.setTargetAtTime(freq * 1.5 + 3, t, 0.1);
    audio.sirenTimer -= 1 / 60;
    if (policeNear) {
      if (audio.sirenTimer <= 0) {
        audio.sirenHigh = !audio.sirenHigh;
        audio.sirenTimer = 0.45;
      }
      audio.sirenOsc.frequency.setTargetAtTime(audio.sirenHigh ? 920 : 660, t, 0.05);
      audio.sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
    } else {
      audio.sirenGain.gain.setTargetAtTime(0, t, 0.3);
    }
    // Ambient music: a slow Am - F - C - G pad, one chord every 4 seconds.
    audio.musicTimer -= 1 / 60;
    if (audio.musicTimer <= 0) {
      audio.musicTimer = 4;
      const chords = [
        [220.0, 261.6, 329.6],
        [174.6, 220.0, 261.6],
        [196.0, 246.9, 293.7],
        [164.8, 196.0, 246.9],
      ];
      const chord = chords[audio.musicStep % chords.length];
      audio.musicStep += 1;
      for (const f of chord) {
        const osc = audio.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const g = audio.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.035, t + 1.2);
        g.gain.linearRampToValueAtTime(0, t + 4.2);
        osc.connect(g);
        g.connect(audio.master);
        osc.start(t);
        osc.stop(t + 4.3);
      }
    }
  };

  function noiseBurst(duration, volume, filterFreq) {
    if (!audio.ready) return;
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * duration);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = audio.ctx.createGain();
    g.gain.value = volume;
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.master);
    src.start(t);
  }

  function tone(freq, duration, volume, type = 'sine', slideTo = null) {
    if (!audio.ready) return;
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(audio.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  audio.gunshot = function playGunshot() {
    noiseBurst(0.18, 0.5, 2800);
    tone(160, 0.12, 0.25, 'square', 60);
  };
  audio.punch = function playPunch() {
    tone(120, 0.12, 0.35, 'sine', 55);
    noiseBurst(0.08, 0.2, 900);
  };
  audio.crash = function playCrash() {
    noiseBurst(0.35, 0.4, 700);
    tone(90, 0.3, 0.3, 'sine', 40);
  };
  audio.pickup = function playPickup() {
    tone(660, 0.12, 0.2, 'sine');
    setTimeout(() => tone(880, 0.18, 0.2, 'sine'), 110);
  };
  audio.missionDone = function playMissionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.22, 'triangle'), i * 130));
  };
  audio.busted = function playBusted() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.35, 0.2, 'sawtooth'), i * 200));
  };
  audio.door = function playDoor() {
    tone(300, 0.08, 0.15, 'square', 180);
  };
  return audio;
}
