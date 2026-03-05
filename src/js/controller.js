// Handles all input: touch joystick, touch buttons, keyboard, mouse.
// Outputs a state object: { buttons, h, v } where h/v are 0-255.

export const BTN = {
  MENU:  0x01,
  JUMP:  0x02,
  PUNCH: 0x04,
  THROW: 0x08,
  BOMB:  0x10,
  RUN:   0x20,
};

const BUTTON_MAP = {
  menu:  BTN.MENU,
  jump:  BTN.JUMP,
  punch: BTN.PUNCH,
  throw: BTN.THROW,
  bomb:  BTN.BOMB,
  run:   BTN.RUN,
};

const DEFAULT_KEYS = {
  KeyW: 'up',    ArrowUp: 'up',
  KeyS: 'down',  ArrowDown: 'down',
  KeyA: 'left',  ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyK: 'jump',     Space: 'jump',
  KeyJ: 'punch',
  KeyL: 'throw',
  KeyI: 'bomb',
  ShiftLeft: 'run',  ShiftRight: 'run',
  Escape: 'menu',    Backquote: 'menu',
};

export class Controller {
  constructor() {
    this.buttons = 0;
    this.joyX = 0;
    this.joyY = 0;
    this.onChange = null;
    this.keyBindings = { ...DEFAULT_KEYS };
    this._dirs = { up: false, down: false, left: false, right: false };
  }

  getState() {
    return {
      buttons: this.buttons,
      h: Math.round((this.joyX + 1) * 127.5),
      v: Math.round((this.joyY + 1) * 127.5),
    };
  }

  setJoystick(x, y) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
    this._notify();
  }

  pressButton(name) {
    const flag = BUTTON_MAP[name];
    if (flag && !(this.buttons & flag)) {
      this.buttons |= flag;
      this._notify();
    }
  }

  releaseButton(name) {
    const flag = BUTTON_MAP[name];
    if (flag && (this.buttons & flag)) {
      this.buttons &= ~flag;
      this._notify();
    }
  }

  handleKeyDown(code) {
    const action = this.keyBindings[code];
    if (!action) return;
    if (['up', 'down', 'left', 'right'].includes(action)) {
      this._dirs[action] = true;
      this._updateJoystickFromKeys();
    } else {
      this.pressButton(action);
    }
  }

  handleKeyUp(code) {
    const action = this.keyBindings[code];
    if (!action) return;
    if (['up', 'down', 'left', 'right'].includes(action)) {
      this._dirs[action] = false;
      this._updateJoystickFromKeys();
    } else {
      this.releaseButton(action);
    }
  }

  _updateJoystickFromKeys() {
    let x = 0, y = 0;
    if (this._dirs.left) x -= 1;
    if (this._dirs.right) x += 1;
    if (this._dirs.up) y -= 1;
    if (this._dirs.down) y += 1;
    this.setJoystick(x, y);
  }

  _notify() {
    if (this.onChange) this.onChange(this.getState());
  }
}
