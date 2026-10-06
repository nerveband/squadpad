// tests/controller.test.js
import { describe, it, expect } from 'vitest';
import { Controller, BTN } from '../src/js/controller.js';

describe('Controller', () => {
  it('starts with neutral state', () => {
    const c = new Controller();
    const state = c.getState();
    expect(state.buttons).toBe(0);
    expect(state.h).toBe(128);
    expect(state.v).toBe(128);
  });

  it('sets joystick values from -1..1 to 0..255', () => {
    const c = new Controller();
    c.setJoystick(-1, -1);
    expect(c.getState().h).toBe(0);
    expect(c.getState().v).toBe(0);
    c.setJoystick(1, 1);
    expect(c.getState().h).toBe(255);
    expect(c.getState().v).toBe(255);
    c.setJoystick(0, 0);
    expect(c.getState().h).toBe(128);
    expect(c.getState().v).toBe(128);
  });

  it('tracks button presses and releases', () => {
    const c = new Controller();
    c.pressButton('jump');
    expect(c.getState().buttons & BTN.JUMP).toBeTruthy();
    c.releaseButton('jump');
    expect(c.getState().buttons & BTN.JUMP).toBe(0);
  });

  it('tracks multiple buttons simultaneously', () => {
    const c = new Controller();
    c.pressButton('jump');
    c.pressButton('punch');
    const state = c.getState();
    expect(state.buttons & BTN.JUMP).toBeTruthy();
    expect(state.buttons & BTN.PUNCH).toBeTruthy();
  });

  it('calls onChange when state changes', () => {
    const c = new Controller();
    let called = false;
    c.onChange = () => { called = true; };
    c.pressButton('jump');
    expect(called).toBe(true);
  });

  it('emits joystick moves within one wire step once, and real changes again', () => {
    const c = new Controller();
    const states = [];
    c.onChange = (s) => states.push(s);
    c.setJoystick(1, 0);
    c.setJoystick(1.4, 0);   // pinned at the rim: clamps to the same value
    c.setJoystick(0.999, 0); // rounds to the same h (255)
    expect(states).toHaveLength(1);
    c.setJoystick(0.5, 0);
    expect(states).toHaveLength(2);
    expect(states[1].h).toBe(191);
  });

  it('maps keyboard keys to actions', () => {
    const c = new Controller();
    c.handleKeyDown('KeyW');
    expect(c.getState().v).toBeLessThan(128);
    c.handleKeyUp('KeyW');
    expect(c.getState().v).toBe(128);
  });

  it('handles diagonal keyboard input', () => {
    const c = new Controller();
    c.handleKeyDown('KeyW');
    c.handleKeyDown('KeyD');
    const state = c.getState();
    expect(state.v).toBeLessThan(128);
    expect(state.h).toBeGreaterThan(128);
  });

  it('clamps joystick to -1..1 range', () => {
    const c = new Controller();
    c.setJoystick(5, -5);
    expect(c.getState().h).toBe(255);
    expect(c.getState().v).toBe(0);
  });
});
