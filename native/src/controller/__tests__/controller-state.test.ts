import { ControllerState } from '../controller-state';

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
});
