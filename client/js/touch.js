// Phone controls: an on-screen joystick and a sprint button.
// They "press" the same keys the keyboard does (W/A/S/D and Shift), so the
// player movement code (player.js) works on phones without any changes.

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function press(code, down) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));
}

export function setupTouchControls() {
  const root = document.getElementById('touch');
  if (!isTouch) return { show() {}, hide() {} };

  const stick = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  const sprint = document.getElementById('sprint-btn');
  const held = new Set();
  let pointerId = null;

  function setKeys(want) {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      if (want.has(code) && !held.has(code)) { press(code, true); held.add(code); }
      if (!want.has(code) && held.has(code)) { press(code, false); held.delete(code); }
    }
  }

  function move(e) {
    const r = stick.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const want = new Set();
    const t = max * 0.3; // dead zone
    if (dy < -t) want.add('KeyW');
    if (dy > t) want.add('KeyS');
    if (dx < -t) want.add('KeyA');
    if (dx > t) want.add('KeyD');
    setKeys(want);
  }

  function end() {
    pointerId = null;
    knob.style.transform = '';
    setKeys(new Set());
  }

  stick.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    pointerId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    move(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) { e.stopPropagation(); move(e); } });
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  sprint.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    sprint.classList.add('on');
    press('ShiftLeft', true);
  });
  const stopSprint = () => { sprint.classList.remove('on'); press('ShiftLeft', false); };
  sprint.addEventListener('pointerup', stopSprint);
  sprint.addEventListener('pointercancel', stopSprint);
  sprint.addEventListener('pointerleave', stopSprint);

  return {
    show() { root.classList.remove('hidden'); },
    hide() { root.classList.add('hidden'); end(); stopSprint(); },
  };
}
