// Identity-preserving animation rig. Every visible surface comes from bee-source.png.
// bee-alpha.png supplies transparency only; none of its generated RGB is displayed.
export const BEE_SOURCE = "bee-source.png";
export const BEE_ALPHA = "bee-alpha.png";
export const SOURCE_SCALE = 0.18;
export const SOURCE_ORIGIN = {
  x: 350 + 31 / SOURCE_SCALE,
  y: 560 + 6 / SOURCE_SCALE,
};
export const sourcePoint = (x, y) => ({
  x: (SOURCE_ORIGIN.x - x) * SOURCE_SCALE,
  y: (y - SOURCE_ORIGIN.y) * SOURCE_SCALE,
});
export const MOUTH_HINGE = sourcePoint(268, 653);
export const MOUTH_TIP = sourcePoint(203, 852);
export const STINGER_TIP = sourcePoint(1318, 781);
const FAR_WING = [
  [587, 501],
  [666, 375],
  [870, 204],
  [1060, 81],
  [1210, 11],
  [1311, 0],
  [1284, 88],
  [1133, 308],
  [941, 444],
  [758, 512],
  [669, 558],
];
const NEAR_WING = [
  [666, 554],
  [750, 447],
  [966, 298],
  [1217, 171],
  [1444, 81],
  [1536, 64],
  [1536, 140],
  [1432, 316],
  [1326, 438],
  [1110, 509],
  [874, 533],
  [718, 580],
];
const MOUTH = [
  [278, 644],
  [308, 664],
  [277, 718],
  [233, 800],
  [211, 870],
  [182, 872],
  [181, 802],
  [207, 735],
  [246, 676],
];
const EYES = [
  {
    center: [363, 586],
    outline: [
      [288, 611],
      [327, 573],
      [407, 536],
      [419, 560],
      [385, 607],
      [326, 629],
    ],
  },
  {
    center: [224, 605],
    outline: [
      [207, 553],
      [221, 567],
      [245, 617],
      [244, 638],
      [224, 625],
      [213, 601],
    ],
  },
];
const polygon = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};
export function articulatedMouth(feeding = 0) {
  const a = feeding * 0.08,
    dx = MOUTH_TIP.x - MOUTH_HINGE.x,
    dy = MOUTH_TIP.y - MOUTH_HINGE.y;
  return {
    x: MOUTH_HINGE.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: MOUTH_HINGE.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
export function createBeeArt() {
  const source = new Image(),
    alpha = new Image();
  let texture = null,
    body = null;
  const pieces = new Map();
  const ready = Promise.all(
    [source, alpha].map(
      (image) =>
        new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("机械蜂原图素材无法加载"));
        }),
    ),
  ).then(() => {
    if (
      source.naturalWidth !== 1536 ||
      source.naturalHeight !== 1024 ||
      alpha.naturalWidth !== 1536 ||
      alpha.naturalHeight !== 1024
    )
      throw new Error("机械蜂素材尺寸不匹配");
    const make = () => {
      const c = document.createElement("canvas");
      c.width = 1536;
      c.height = 1024;
      return c;
    };
    texture = make();
    const tc = texture.getContext("2d", { willReadFrequently: true });
    tc.drawImage(source, 0, 0);
    const mask = make(),
      mc = mask.getContext("2d", { willReadFrequently: true });
    mc.drawImage(alpha, 0, 0);
    const pixels = tc.getImageData(0, 0, 1536, 1024),
      matte = mc.getImageData(0, 0, 1536, 1024);
    // Copy only alpha. Interior RGB stays byte-for-byte identical to the user's original.
    for (let i = 3; i < pixels.data.length; i += 4) {
      const a = matte.data[i];
      pixels.data[i] = a >= 250 ? 255 : a < 8 ? 0 : a;
    }
    tc.putImageData(pixels, 0, 0);
    body = make();
    const bc = body.getContext("2d");
    bc.drawImage(texture, 0, 0);
    bc.globalCompositeOperation = "destination-out";
    for (const outline of [FAR_WING, NEAR_WING, MOUTH]) {
      polygon(bc, outline);
      bc.fill();
    }
    for (const outline of [
      FAR_WING,
      NEAR_WING,
      MOUTH,
      ...EYES.map((e) => e.outline),
    ]) {
      const x = Math.max(
          0,
          Math.floor(Math.min(...outline.map((p) => p[0]))) - 6,
        ),
        y = Math.max(0, Math.floor(Math.min(...outline.map((p) => p[1]))) - 6),
        right = Math.min(
          1536,
          Math.ceil(Math.max(...outline.map((p) => p[0]))) + 6,
        ),
        bottom = Math.min(
          1024,
          Math.ceil(Math.max(...outline.map((p) => p[1]))) + 6,
        );
      const canvas = document.createElement("canvas");
      canvas.width = right - x;
      canvas.height = bottom - y;
      const pc = canvas.getContext("2d");
      pc.translate(-x, -y);
      polygon(pc, outline);
      pc.clip();
      pc.drawImage(texture, 0, 0);
      pieces.set(outline, { canvas, x, y });
    }
    return true;
  });
  source.src = BEE_SOURCE;
  alpha.src = BEE_ALPHA;
  const piece = (ctx, outline, pivot, angle = 0, yscale = 1) => {
    ctx.save();
    ctx.translate(...pivot);
    ctx.rotate(angle);
    ctx.scale(1, yscale);
    ctx.translate(-pivot[0], -pivot[1]);
    const part = pieces.get(outline);
    ctx.drawImage(part.canvas, part.x, part.y);
    ctx.restore();
  };
  function draw(
    ctx,
    x,
    y,
    scale,
    now,
    { sleep = 0, energy = 0, alpha = 1, feeding = 0 } = {},
    mouse = { x: 0, y: 0 },
  ) {
    if (!texture || !body) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // Mirror the left-facing original into the existing right-facing model space.
    // The outer flight-direction transform reverses this for left flight.
    ctx.scale(-SOURCE_SCALE, SOURCE_SCALE);
    ctx.translate(-SOURCE_ORIGIN.x, -SOURCE_ORIGIN.y);
    const beat = Math.sin(now * 0.13),
      fold = 1 - sleep;
    for (const [outline, phase] of [
      [FAR_WING, 0.6],
      [NEAR_WING, 0],
    ]) {
      const angle = Math.sin(now * 0.13 + phase) * 0.022 * fold + sleep * 0.28;
      // Translucent samples are copies of the original wing, never replacement drawings.
      if (fold > 0.15) {
        ctx.save();
        ctx.globalAlpha *= 0.1 * fold;
        piece(ctx, outline, [675, 550], angle + 0.026, 1);
        ctx.restore();
      }
      piece(ctx, outline, [675, 550], angle, 1 - Math.abs(beat) * 0.025 * fold);
    }
    ctx.drawImage(body, 0, 0);
    piece(ctx, MOUTH, [268, 653], -feeding * 0.08);
    const tx = SOURCE_ORIGIN.x - (mouse.x - x) / (scale * SOURCE_SCALE),
      ty = SOURCE_ORIGIN.y + (mouse.y - y) / (scale * SOURCE_SCALE);
    for (const eye of EYES) {
      const dx = tx - eye.center[0],
        dy = ty - eye.center[1],
        length = Math.sqrt(dx * dx + dy * dy + 40000);
      ctx.save();
      polygon(ctx, eye.outline);
      ctx.clip();
      if (sleep > 0.01) {
        ctx.fillStyle = `rgba(4,15,30,${sleep * 0.96})`;
        ctx.fill();
      }
      if (sleep < 0.999) {
        ctx.globalAlpha *= 1 - sleep;
        ctx.translate((dx / length) * 5, (dy / length) * 4);
        // Bounded source reads avoid compositing the entire 1536×1024 texture.
        const part = pieces.get(eye.outline);
        ctx.drawImage(
          texture,
          part.x,
          part.y,
          part.canvas.width,
          part.canvas.height,
          part.x,
          part.y,
          part.canvas.width,
          part.canvas.height,
        );
      }
      ctx.restore();
    }
    // Blush belongs only to the explicitly requested sleep animation.
    if (sleep > 0.1) {
      ctx.save();
      ctx.globalAlpha *= sleep * 0.65;
      ctx.fillStyle = "#f59bb5";
      for (const [cx, cy] of [
        [310, 651],
        [228, 645],
      ]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, 21, 9, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  return {
    ready,
    draw,
    loaded: () => !!texture,
    inspectPixel(x, y) {
      return texture?.getContext("2d").getImageData(x, y, 1, 1).data;
    },
  };
}
