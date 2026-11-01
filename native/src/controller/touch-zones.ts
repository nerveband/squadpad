/**
 * Determine which diamond quadrant a touch falls in relative to the diamond
 * cluster center (`centerX`, `centerY`).
 *
 *         0 (throw)
 *       /   \
 *   1 (punch) 2 (bomb)
 *       \   /
 *         3 (jump)
 *
 * When `maxRadius > 0`, touches outside `maxRadius` (such as stray touches near
 * a foldable screen's center crease) return `-1`.
 */
export function getZone(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  maxRadius = 0,
): number {
  'worklet';
  if (centerX <= 0 || centerY <= 0) return -1;
  const rawDx = x - centerX;
  const rawDy = y - centerY;
  if (maxRadius > 0 && rawDx * rawDx + rawDy * rawDy > maxRadius * maxRadius) {
    return -1;
  }
  const dx = rawDx / 115;
  const dy = rawDy / 135;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? 0 : 3; // top -> throw, bottom -> jump
  }
  return dx < 0 ? 1 : 2; // left -> punch, right -> bomb
}

/**
 * Compute the 4-bit button mask for a touch at `(x, y)` relative to the diamond
 * center `(centerX, centerY)` with button center offsets `(sepX, sepY)`.
 *
 * Bit 0 (1): throw (top)
 * Bit 1 (2): punch (left)
 * Bit 2 (4): bomb  (right)
 * Bit 3 (8): jump  (bottom)
 *
 * Matches official BombSquad Remote (`updateButtonsForTouches`):
 * - A touch near the overlap between two adjacent buttons (within `chordThreshold`
 *   of both centers in normalized diamond space) activates both buttons so players
 *   can chord Jump+Punch or Jump+Bomb with one thumb.
 * - Any other touch within `maxRadius` activates the closest button center.
 */
export function getButtonMask(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  sepX: number,
  sepY: number,
  maxRadius = 0,
): number {
  'worklet';
  if (centerX <= 0 || centerY <= 0 || sepX <= 0 || sepY <= 0) return 0;
  const rawDx = x - centerX;
  const rawDy = y - centerY;
  if (maxRadius > 0 && rawDx * rawDx + rawDy * rawDy > maxRadius * maxRadius) {
    return 0;
  }

  const nx = rawDx / sepX;
  const ny = rawDy / sepY;

  const d0 = Math.sqrt(nx * nx + (ny + 1) * (ny + 1)); // throw (top)
  const d1 = Math.sqrt((nx + 1) * (nx + 1) + ny * ny); // punch (left)
  const d2 = Math.sqrt((nx - 1) * (nx - 1) + ny * ny); // bomb  (right)
  const d3 = Math.sqrt(nx * nx + (ny - 1) * (ny - 1)); // jump  (bottom)

  // Midpoint between two adjacent buttons is at normalized distance ~0.707
  // from both, while center of the diamond is at 1.0 from all four.
  const chordThreshold = 0.82;
  let mask = 0;
  if (d0 <= chordThreshold) mask |= 1 << 0;
  if (d1 <= chordThreshold) mask |= 1 << 1;
  if (d2 <= chordThreshold) mask |= 1 << 2;
  if (d3 <= chordThreshold) mask |= 1 << 3;
  if (mask !== 0) return mask;

  if (d0 <= d1 && d0 <= d2 && d0 <= d3) return 1 << 0;
  if (d1 <= d0 && d1 <= d2 && d1 <= d3) return 1 << 1;
  if (d2 <= d0 && d2 <= d1 && d2 <= d3) return 1 << 2;
  return 1 << 3;
}
