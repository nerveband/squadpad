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
  if (centerX <= 0 || centerY <= 0) return -1;
  const rawDx = x - centerX;
  const rawDy = y - centerY;
  if (maxRadius > 0 && rawDx * rawDx + rawDy * rawDy > maxRadius * maxRadius) {
    return -1;
  }
  // Scale for the wider horizontal gap vs vertical height of the diamond.
  const dx = rawDx / 115;
  const dy = rawDy / 135;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? 0 : 3; // top -> throw, bottom -> jump
  }
  return dx < 0 ? 1 : 2; // left -> punch, right -> bomb
}
