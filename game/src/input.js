// Solmar Heat — keyboard + mouse input. Tracks held keys, edge-triggered
// presses, and mouse look (pointer lock, with a drag fallback).
export function createInput(canvas) {
  const input = {
    keys: {},
    pressed: {},
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    pointerLocked: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    input.pressed[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    input.keys = {};
  });

  canvas.addEventListener('click', () => {
    if (!input.pointerLocked && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (input.pointerLocked) {
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    } else if (input.dragging) {
      input.mouseDX += e.clientX - input.lastX;
      input.mouseDY += e.clientY - input.lastY;
      input.lastX = e.clientX;
      input.lastY = e.clientY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    input.mouseDown = true;
    input.pressed.Mouse0 = true;
    if (!input.pointerLocked) {
      input.dragging = true;
      input.lastX = e.clientX;
      input.lastY = e.clientY;
    }
  });
  window.addEventListener('mouseup', () => {
    input.mouseDown = false;
    input.dragging = false;
  });

  input.isDown = function isDown(code) {
    return !!input.keys[code];
  };
  // True once, on the frame the key went down.
  input.wasPressed = function wasPressed(code) {
    return !!input.pressed[code];
  };
  input.consumeMouse = function consumeMouse() {
    const dx = input.mouseDX;
    const dy = input.mouseDY;
    input.mouseDX = 0;
    input.mouseDY = 0;
    return { dx, dy };
  };
  // Call at the end of each frame so edge presses fire exactly once.
  input.endFrame = function endFrameInput() {
    input.pressed = {};
  };
  return input;
}
