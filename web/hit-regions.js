// Coalesce opaque pixel runs into rectangles, using a small alpha-only sampling canvas.
export function alphaRegions(data, width, height, step = 3) {
  const rectangles = [],
    previous = new Map();
  for (let y = 0; y < height; y++) {
    const current = new Map();
    for (let x = 0; x < width; ) {
      if (data[(y * width + x) * 4 + 3] < 24) {
        x++;
        continue;
      }
      const start = x++;
      while (x < width && data[(y * width + x) * 4 + 3] >= 24) x++;
      const key = `${start}:${x}`,
        rect = previous.get(key);
      if (rect) rect[3] += step;
      else {
        const next = [start * step, y * step, (x - start) * step, step];
        rectangles.push(next);
        current.set(key, next);
      }
      if (rect) current.set(key, rect);
    }
    previous.clear();
    for (const [key, rect] of current) previous.set(key, rect);
  }
  return rectangles;
}
