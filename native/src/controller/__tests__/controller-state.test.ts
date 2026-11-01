import { ControllerState } from '../controller-state';
import { getZone, getButtonMask } from '../touch-zones';
import { BTN } from '../../protocol/constants';

describe('ControllerState', () => {
  test('initial state is centered with no buttons', () => {
    const c = new ControllerState();
    const s = c.getState();
    expect(s.buttons).toBe(0);
    expect(s.h).toBe(128);
    expect(s.v).toBe(128);
  });

  test('setJoystick clamps to -1..1 and maps to 0..255', () => {
    const c = new ControllerState();
    c.setJoystick(-1, -1);
    const s = c.getState();
    expect(s.h).toBe(0);
    expect(s.v).toBe(0);
  });

  test('setJoystick full right down', () => {
    const c = new ControllerState();
    c.setJoystick(1, 1);
    const s = c.getState();
    expect(s.h).toBe(255);
    expect(s.v).toBe(255);
  });

  test('setJoystick clamps beyond range', () => {
    const c = new ControllerState();
    c.setJoystick(-5, 5);
    const s = c.getState();
    expect(s.h).toBe(0);
    expect(s.v).toBe(255);
  });

  test('pressButton sets flag, releaseButton clears it', () => {
    const c = new ControllerState();
    c.pressButton('punch');
    expect(c.getState().buttons & 0x04).toBe(0x04);
    c.releaseButton('punch');
    expect(c.getState().buttons & 0x04).toBe(0);
  });

  test('multiple buttons can be pressed simultaneously', () => {
    const c = new ControllerState();
    c.pressButton('jump');
    c.pressButton('bomb');
    const s = c.getState();
    expect(s.buttons & 0x02).toBe(0x02); // jump
    expect(s.buttons & 0x10).toBe(0x10); // bomb
  });

  test('pressing same button twice does not double-fire onChange', () => {
    const c = new ControllerState();
    let callCount = 0;
    c.onChange = () => { callCount++; };
    c.pressButton('punch');
    c.pressButton('punch');
    expect(callCount).toBe(1);
  });

  test('onChange fires on state change', () => {
    const c = new ControllerState();
    const states: { buttons: number; h: number; v: number }[] = [];
    c.onChange = (s) => states.push(s);
    c.pressButton('jump');
    c.setJoystick(0.5, -0.5);
    expect(states.length).toBe(2);
    expect(states[0].buttons).toBe(0x02);
    expect(states[1].h).toBe(191); // (0.5+1)*127.5 = 191.25, rounds to 191
    expect(states[1].v).toBe(64);
  });

  test('joystick moves within one wire step emit once; a real change emits again', () => {
    const c = new ControllerState();
    const states: { h: number; v: number }[] = [];
    c.onChange = (s) => states.push(s);
    c.setJoystick(1, 0);
    c.setJoystick(1.4, 0);   // pinned at the rim: clamps to the same value
    c.setJoystick(0.999, 0); // rounds to the same h (255)
    expect(states).toHaveLength(1);
    c.setJoystick(0.5, 0);
    expect(states).toHaveLength(2);
    expect(states[1].h).toBe(191);
  });

  test('reset clears all state', () => {
    const c = new ControllerState();
    c.pressButton('punch');
    c.pressButton('bomb');
    c.setJoystick(0.5, -0.5);
    c.reset();
    const s = c.getState();
    expect(s.buttons).toBe(0);
    expect(s.h).toBe(128);
    expect(s.v).toBe(128);
  });

  test('setActionMask atomically updates chorded buttons and holdRun in a single emission', () => {
    const c = new ControllerState();
    const states: { buttons: number; h: number; v: number }[] = [];
    c.onChange = (s) => states.push(s);

    // Press Punch (bit 1) + Jump (bit 3) + holdRun in one call
    c.setActionMask((1 << 1) | (1 << 3), true);
    expect(states).toHaveLength(1);
    expect(states[0].buttons).toBe(BTN.PUNCH | BTN.JUMP | BTN.RUN);

    // Release all action buttons -> clears action buttons and holdRun together
    c.setActionMask(0, true);
    expect(states).toHaveLength(2);
    expect(states[1].buttons).toBe(0);
  });

  test('setJoystick combines analog move and stickEdge rimRun in a single emission', () => {
    const c = new ControllerState();
    const states: { buttons: number; h: number; v: number }[] = [];
    c.onChange = (s) => states.push(s);

    c.setJoystick(1, 0, true);
    expect(states).toHaveLength(1);
    expect(states[0].h).toBe(255);
    expect(states[0].buttons).toBe(BTN.RUN);

    c.setJoystick(0, 0, false);
    expect(states).toHaveLength(2);
    expect(states[1].h).toBe(128);
    expect(states[1].buttons).toBe(0);
  });
});

describe('getZone diamond quadrant & foldable crease filter', () => {
  const cx = 300;
  const cy = 220;
  const radius = 200;

  test('maps top, left, right, bottom around cluster center to throw(0), punch(1), bomb(2), jump(3)', () => {
    expect(getZone(cx, cy - 80, cx, cy, radius)).toBe(0); // throw
    expect(getZone(cx - 80, cy, cx, cy, radius)).toBe(1); // punch
    expect(getZone(cx + 80, cy, cx, cy, radius)).toBe(2); // bomb
    expect(getZone(cx, cy + 80, cx, cy, radius)).toBe(3); // jump
  });

  test('rejects stray touches near the foldable center crease outside maxRadius', () => {
    expect(getZone(cx - 240, cy, cx, cy, radius)).toBe(-1);
    expect(getZone(cx, cy - 250, cx, cy, radius)).toBe(-1);
  });

  test('returns -1 when cluster center is unmeasured', () => {
    expect(getZone(100, 100, 0, 0, radius)).toBe(-1);
  });
});

describe('getButtonMask single-thumb chording & closest button', () => {
  const cx = 200;
  const cy = 200;
  const sepX = 60;
  const sepY = 90;
  const maxR = 240;

  test('activates single button when touching directly on it', () => {
    expect(getButtonMask(cx, cy - sepY, cx, cy, sepX, sepY, maxR)).toBe(1 << 0); // throw
    expect(getButtonMask(cx - sepX, cy, cx, cy, sepX, sepY, maxR)).toBe(1 << 1); // punch
    expect(getButtonMask(cx + sepX, cy, cx, cy, sepX, sepY, maxR)).toBe(1 << 2); // bomb
    expect(getButtonMask(cx, cy + sepY, cx, cy, sepX, sepY, maxR)).toBe(1 << 3); // jump
  });

  test('activates both Jump and Punch when thumb bridges the gap between them', () => {
    const midX = cx - sepX * 0.5;
    const midY = cy + sepY * 0.5;
    const mask = getButtonMask(midX, midY, cx, cy, sepX, sepY, maxR);
    expect(mask & (1 << 1)).toBeTruthy(); // punch
    expect(mask & (1 << 3)).toBeTruthy(); // jump
  });
});
