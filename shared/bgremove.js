// Makes the background of an icon transparent. Works on RGBA pixel data (Uint8ClampedArray, 4 bytes per pixel).
// If the icon already has a transparent edge it is left alone. Otherwise the colour of the four corners is treated
// as the background, and every pixel connected to the edge that is close to that colour becomes transparent.
// Pixels just outside the tolerance get a partial alpha so the cut-out edge is soft rather than jagged.
export function removeEdgeBackground(data, width, height, tolerance = 40) {
  const at = (x, y) => (y * width + x) * 4;

  for (let x = 0; x < width; x++) {
    if (data[at(x, 0) + 3] < 200 || data[at(x, height - 1) + 3] < 200) return false;
  }
  for (let y = 0; y < height; y++) {
    if (data[at(0, y) + 3] < 200 || data[at(width - 1, y) + 3] < 200) return false;
  }

  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((sum, i) => sum + data[i + c], 0) / 4));
  const distance = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);

  const removed = new Uint8Array(width * height);
  const stack = [];
  const seed = (x, y) => {
    const p = y * width + x;
    if (!removed[p] && distance(p * 4) <= tolerance) {
      removed[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }

  const cleared = [];
  while (stack.length) {
    const p = stack.pop();
    cleared.push(p);
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }
  for (const p of cleared) data[p * 4 + 3] = 0;

  // Soft edge: pixels next to the cut-out that are only slightly different from the background fade out.
  const soft = tolerance * 1.8;
  for (const p of cleared) {
    const x = p % width;
    const y = (p - x) / width;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const q = ny * width + nx;
      if (removed[q]) continue;
      const d = distance(q * 4);
      if (d < soft) {
        const alpha = Math.round((255 * (d - tolerance)) / (soft - tolerance));
        data[q * 4 + 3] = Math.min(data[q * 4 + 3], Math.max(0, alpha));
      }
    }
  }
  return true;
}
