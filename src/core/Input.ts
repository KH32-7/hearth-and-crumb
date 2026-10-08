/**
 * Desktop input: pointer-lock mouse look, WASD, buttons with per-frame edges.
 * Gameplay reads intents through this class only; `consumeFrame()` is called
 * once at the end of every update so pressed/released edges last one frame.
 */
export class Input {
  readonly keys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  mouseDown = [false, false, false];
  mousePressed = [false, false, false];
  mouseReleased = [false, false, false];
  /** Cursor position in CSS pixels (used by minigames when the pointer is unlocked). */
  cursorX = 0;
  cursorY = 0;
  locked = false;
  sensitivity = 0.0022;
  invertY = false;
  enabled = true;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('wheel', this.onWheel, { passive: true });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('blur', this.onBlur);
  }

  requestLock(): void {
    if (document.pointerLockElement === this.element) return;
    try {
      const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      // Some test environments reject pointer lock; mouse look then uses drag.
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  held(code: string): boolean {
    return this.keys.has(code);
  }

  consumeFrame(): void {
    this.pressedKeys.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
  }

  /** Synthetic hooks for bot playtests. */
  simulateKey(code: string, down: boolean): void {
    if (down) {
      if (!this.keys.has(code)) this.pressedKeys.add(code);
      this.keys.add(code);
    } else this.keys.delete(code);
  }

  simulateClick(button = 0): void {
    this.mousePressed[button] = true;
    this.mouseReleased[button] = true;
  }

  simulateLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    window.removeEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (!e.repeat) this.pressedKeys.add(e.code);
    this.keys.add(e.code);
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return;
    this.mouseDown[e.button] = true;
    this.mousePressed[e.button] = true;
  };
  private readonly onMouseUp = (e: MouseEvent) => {
    if (this.mouseDown[e.button]) this.mouseReleased[e.button] = true;
    this.mouseDown[e.button] = false;
  };
  private readonly onMouseMove = (e: MouseEvent) => {
    this.cursorX = e.clientX;
    this.cursorY = e.clientY;
    if (!this.enabled) return;
    if (this.locked) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };
  private readonly onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };
  private readonly onLockChange = () => {
    this.locked = document.pointerLockElement === this.element;
  };
  private readonly onBlur = () => {
    this.keys.clear();
    this.mouseDown = [false, false, false];
  };
}
