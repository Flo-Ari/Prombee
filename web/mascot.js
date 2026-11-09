import "./brand.js";
// Code-drawn mascot: transparent at every scale, independent of editor content.
export const IDLE_DELAY = 60_000;
export const MORPH_DURATION = 300;
export const SCENES = [
  { name: "机甲除虫", duration: 16_000 },
  { name: "飞累了，睡一会", duration: 14_000 },
  { name: "机械花蕊 · Token 充能", duration: 16_000 },
  { name: "蜂针击碎屏幕", duration: 8_000 },
];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const BLUE = "#2563eb",
  INK = "#2563eb",
  LIGHT = "#b7d8ff";

export const CRACK_RADIUS = 92;
export function flightPose(now) {
  return {
    x: 0,
    y: Math.sin(now * 0.0034) * 5,
    scale: 1,
    rotation: 0,
    sleep: 0,
    energy: 0,
    sting: 0,
    alpha: 1,
  };
}
const blendPose = (a, b, t) =>
  Object.fromEntries(Object.keys(a).map((k) => [k, mix(a[k], b[k], t)]));
// One bee follows one continuous path. Scene props never draw a second bee.
export function scenePose(index, t, now, origin = flightPose(now - t)) {
  const neutral = flightPose(now),
    u = t / 1000,
    duration = SCENES[index].duration;
  if (t <= 0) return { ...origin };
  if (t >= duration) return neutral;
  let target = { ...neutral },
    entry = 2000,
    exitStart = duration - 2500;
  if (index === 0) {
    target = {
      ...neutral,
      x: -12,
      y: 4,
      scale: 0.23,
      alpha: 1 - ease(clamp((t - 2200) / 900)),
    };
    entry = 2400;
    exitStart = 13000;
    if (t >= exitStart)
      target = { ...target, alpha: ease(clamp((t - exitStart) / 650)) };
  } else if (index === 1) {
    target = { ...neutral, y: 14, sleep: ease(clamp((t - 1200) / 900)) };
    exitStart = 11500;
  } else if (index === 2) {
    target = {
      ...neutral,
      x: 38,
      y: -40 + Math.sin(u * 2) * 3,
      scale: 0.83,
      energy: u > 9 && u < 14 ? Math.sin(clamp((u - 9) / 5) * Math.PI) : 0,
    };
    exitStart = 12000;
  } else {
    entry = 850;
    exitStart = 4600;
    const turn = ease(clamp(t / 2200)),
      recover = ease(clamp((t - 2600) / 2000));
    target = {
      ...neutral,
      x: 18 * recover,
      y: -14 * recover,
      scale: 1 + 0.2 * turn,
      rotation: Math.PI * 0.86 * turn * (1 - recover),
      sting: turn * (1 - recover),
    };
  }
  let pose = blendPose(origin, target, ease(clamp(t / entry)));
  if (t >= exitStart)
    pose = blendPose(
      pose,
      neutral,
      ease(clamp((t - exitStart) / (duration - exitStart))),
    );
  return pose;
}

export function mountMascot(canvas, menu, send = () => {}) {
  const ctx = canvas.getContext("2d", { alpha: true });
  const logo = new Image();
  logo.src = "logo.svg";
  let width = 520,
    height = 420,
    dpr = 1,
    frame = 0,
    last = 0,
    destroyed = false;
  let direction = "right",
    nativeDrag = false;
  let enabled = true,
    visible = true,
    scene = -1,
    sceneStart = 0,
    nextIdle = performance.now() + IDLE_DELAY,
    lastScene = -1;
  try {
    enabled = localStorage.getItem("prombee-mascot-animations") !== "false";
    direction =
      localStorage.getItem("prombee-mascot-direction") === "left"
        ? "left"
        : "right";
  } catch {}
  let mouse = { x: 360, y: 120 },
    drag = null,
    suppressClick = false,
    morph = null;
  let currentPose = flightPose(performance.now()),
    sceneOrigin = currentPose,
    previousEnvironment = null;
  let customCenter = null;
  let center = { x: 260, y: 210 };
  function resize() {
    width = canvas.clientWidth || 520;
    height = canvas.clientHeight || 420;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    center = customCenter || { x: width / 2, y: height / 2 };
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  function path(points, fill, stroke, line = 2) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = line;
      ctx.stroke();
    }
  }
  function line(points, color = INK, lineWidth = 2) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  function ellipse(x, y, rx, ry, fill, stroke = null, lw = 2) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }
  function glow(x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function text(value, x, y, size = 14, color = INK) {
    ctx.font = `600 ${size}px "Microsoft YaHei",sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }
  function bee(
    x,
    y,
    scale,
    t,
    { sleep = false, energy = 0, sting = false, alpha = 1 } = {},
  ) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (energy) glow(0, 0, 100, `rgba(37,99,235,${energy * 0.32})`);
    if (Number(sleep) < 1) {
      ctx.save();
      ctx.globalAlpha *= (1 - Number(sleep)) * 0.45;
      for (let i = 0; i < 3; i++) {
        const drift = (t * 0.018 + i * 11) % 24;
        line(
          [
            [-86 - drift, -3 + i * 7],
            [-93 - drift, -3 + i * 7],
          ],
          LIGHT,
          1.1,
        );
      }
      ctx.restore();
    }
    // Far wing, then near wing: both attach behind the head.
    const flap = mix(Math.abs(Math.sin(t * 0.12)), 0.08, Number(sleep));
    ctx.save();
    ctx.translate(-15, -19);
    ctx.rotate(-0.55 - flap * 0.4);
    ellipse(-13, -18, 35, 8 + flap * 21, "#d6edffc9", "#8bbcec", 1.4);
    line(
      [
        [-35, -25],
        [-4, -2],
      ],
      "#ffffffb0",
      1,
    );
    ctx.restore();
    // Tail and striped abdomen remain horizontal, with a three-quarter face.
    path(
      [
        [-60, 1],
        [-84, mix(5, 18, Number(sting))],
        [-60, 14],
      ],
      INK,
    );
    path(
      [
        [-68, 7],
        [-49, -22],
        [-9, -22],
        [15, 7],
        [-9, 36],
        [-49, 36],
      ],
      "#fff",
      BLUE,
      2.5,
    );
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-68, 7);
    ctx.lineTo(-49, -22);
    ctx.lineTo(-9, -22);
    ctx.lineTo(15, 7);
    ctx.lineTo(-9, 36);
    ctx.lineTo(-49, 36);
    ctx.closePath();
    ctx.clip();
    path(
      [
        [-54, -30],
        [-41, -30],
        [-26, 42],
        [-42, 42],
      ],
      BLUE,
    );
    path(
      [
        [-27, -30],
        [-14, -30],
        [2, 42],
        [-13, 42],
      ],
      BLUE,
    );
    ctx.restore();
    ctx.save();
    ctx.translate(-6, -17);
    ctx.rotate(-0.2 + flap * 0.6);
    ellipse(-17, -23, 39, 7 + flap * 25, "#f2fbffe0", "#97c5f1", 1.5);
    line(
      [
        [-44, -30],
        [-2, -2],
      ],
      "#b3d6f1",
      1,
    );
    ctx.restore();
    line(
      [
        [-28, 29],
        [-22, 39],
        [-9, 39],
      ],
      INK,
      3,
    );
    line(
      [
        [-7, 26],
        [0, 36],
        [11, 34],
      ],
      INK,
      3,
    );
    // The logo's hexagonal shell, white antenna tips and blue dual eyes share one skin.
    path(
      [
        [0, -17],
        [11, -34],
        [38, -34],
        [55, -17],
        [55, 4],
        [39, 20],
        [12, 20],
        [0, 5],
      ],
      "#fff",
      BLUE,
      2.5,
    );
    path(
      [
        [11, -32],
        [37, -32],
        [48, -21],
        [13, -21],
        [4, -12],
        [2, -17],
      ],
      "#b7d8ff80",
    );
    path(
      [
        [39, 18],
        [53, 3],
        [53, -4],
        [47, 2],
        [36, 10],
        [12, 10],
        [15, 18],
      ],
      "#b7d8ff55",
    );
    line(
      [
        [5, -18],
        [12, -27],
        [37, -27],
      ],
      "#fff",
      1.2,
    );
    line(
      [
        [12, -29],
        [7, -45],
        [0, -48],
      ],
      BLUE,
      2.4,
    );
    ellipse(-1, -48, 3.5, 3.5, "#fff", BLUE, 1.3);
    line(
      [
        [34, -32],
        [39, -46],
        [47, -47],
      ],
      BLUE,
      2.4,
    );
    ellipse(48, -47, 3.5, 3.5, "#fff", BLUE, 1.3);
    // Two independent sensor apertures retain the logo's blue-dot eyes.
    for (const [ex, ey] of [
      [16, -12],
      [40, -13],
    ]) {
      const lid = 1 - Number(sleep),
        h = Math.max(0.8, 7 * lid);
      path(
        [
          [ex - 9, ey - h],
          [ex + 6, ey - h],
          [ex + 9, ey],
          [ex + 6, ey + h],
          [ex - 9, ey + h],
        ],
        "#eef5ff",
        LIGHT,
        1,
      );
      const dx = mouse.x - x - ex * scale,
        dy = mouse.y - y - ey * scale,
        len = Math.max(1, Math.hypot(dx, dy));
      ellipse(
        ex + (dx / len) * 3,
        ey + (dy / len) * 2 * lid,
        3.2,
        Math.max(0.4, 3.6 * lid),
        BLUE,
      );
      if (lid > 0.1)
        ellipse(
          ex + (dx / len) * 3 + 0.7,
          ey + (dy / len) * 2 * lid - 1,
          0.7,
          Math.max(0.1, 0.7 * lid),
          "#fff",
        );
    }
    // Machined vents replace the cartoon smile and cheeks.
    for (let i = 0; i < 3; i++)
      line(
        [
          [20 + i * 6, 6],
          [23 + i * 6, 3],
        ],
        BLUE,
        1.4,
      );
    for (const [jx, jy] of [
      [-27, 28],
      [-7, 26],
    ]) {
      path(
        [
          [jx - 4, jy],
          [jx - 2, jy - 3.5],
          [jx + 2, jy - 3.5],
          [jx + 4, jy],
          [jx + 2, jy + 3.5],
          [jx - 2, jy + 3.5],
        ],
        "#fff",
        BLUE,
        1.2,
      );
    }
    line(
      [
        [-61, 8],
        [-51, 23],
        [-44, 23],
      ],
      LIGHT,
      1.2,
    );
    ellipse(-50, 23, 1.8, 1.8, "#fff");
    line(
      [
        [-14, 26],
        [-2, 14],
        [-2, 4],
      ],
      LIGHT,
      1.2,
    );
    ellipse(-2, 3, 2, 2, "#fff", BLUE, 1);
    // AI circuit traces on the temple.
    line(
      [
        [47, 10],
        [53, 6],
        [53, -1],
      ],
      "#67b6e9",
      1.5,
    );
    ellipse(47, 10, 2, 2, BLUE);
    if (energy) {
      ctx.save();
      ctx.scale(1, 0.36);
      ctx.strokeStyle = `rgba(37,99,235,${energy})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 84, 60, t * 0.004, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function scenery(t) {
    // Passing petals and little grass seeds, no stationary green platform.
    for (let i = 0; i < 10; i++) {
      const p = (t * 0.00011 + i * 0.117) % 1,
        x = center.x + 180 - p * 370,
        y = center.y + Math.sin(i * 4.7) * 75 + Math.sin(p * 5 + i) * 13;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(i + p * 4);
      ctx.globalAlpha *= Math.sin(p * Math.PI) * 0.7;
      if (i % 3 === 0) {
        line(
          [
            [-5, 5],
            [0, -4],
            [4, 3],
          ],
          "#7ca9ed",
          1.5,
        );
        line(
          [
            [0, 9],
            [0, -4],
          ],
          "#b7d8ff",
          1,
        );
      } else {
        ellipse(0, 0, 4 + (i % 2) * 2, 2 + (i % 3), "#b7d8ff");
        line(
          [
            [-3, 0],
            [3, 0],
          ],
          "#7ca9ed",
          0.5,
        );
      }
      ctx.restore();
    }
  }
  function gear(x, y, r, t, color = "#91accb") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t);
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        rr = i % 4 < 2 ? r : r * 0.82;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    path(pts, color, INK, 1.5);
    ellipse(0, 0, r * 0.43, "#e5f3ff", INK, 1.5);
    ctx.restore();
  }
  function bug(x, y, s, hit = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    for (let i = -1; i <= 1; i++) {
      line(
        [
          [-9, i * 8],
          [-18, i * 11 - 4],
        ],
        "#7ca9ed",
        2,
      );
      line(
        [
          [9, i * 8],
          [18, i * 11 - 4],
        ],
        "#7ca9ed",
        2,
      );
    }
    ellipse(0, 1, 11, 16, hit ? "#fff" : "#b7d8ff", INK, 1.5);
    line(
      [
        [0, -12],
        [0, 16],
      ],
      "#7ca9ed",
      1,
    );
    ellipse(-4, -6, 2, 2, "white");
    ellipse(4, -6, 2, 2, "white");
    ctx.restore();
  }
  function mech(t) {
    const u = t / 1000,
      cx = center.x - 12,
      cy = center.y + 12,
      arrive = ease(clamp(u / 2.4)),
      combat = u > 3 && u < 12,
      fade = 1 - ease(clamp((u - 13) / 3));
    ctx.save();
    ctx.globalAlpha *= fade;
    glow(cx, cy + 64, 115, "#3f87ff16");
    ellipse(cx, cy + 103, 94, 10, "#2b548c15");
    gear(cx - 44, cy + 7, 18, u * 0.35);
    gear(cx + 44, cy + 7, 18, -u * 0.35);
    // Robot's left hand is viewer-right: rotary machine gun. Right hand: blade.
    path(
      [
        [cx - 27, cy + 37],
        [cx - 9, cy + 37],
        [cx - 15, cy + 90],
        [cx - 38, cy + 91],
      ],
      "#adc3db",
      INK,
      2,
    );
    path(
      [
        [cx + 9, cy + 37],
        [cx + 27, cy + 37],
        [cx + 38, cy + 91],
        [cx + 15, cy + 90],
      ],
      "#adc3db",
      INK,
      2,
    );
    path(
      [
        [cx - 39, cy + 89],
        [cx - 13, cy + 89],
        [cx - 10, cy + 99],
        [cx - 44, cy + 99],
      ],
      INK,
    );
    path(
      [
        [cx + 13, cy + 89],
        [cx + 38, cy + 89],
        [cx + 44, cy + 99],
        [cx + 10, cy + 99],
      ],
      INK,
    );
    path(
      [
        [cx - 38, cy - 24],
        [cx + 38, cy - 24],
        [cx + 28, cy + 43],
        [cx - 28, cy + 43],
      ],
      "#d7e5f5",
      INK,
      2.5,
    );
    path(
      [
        [cx - 23, cy - 9],
        [cx + 23, cy - 9],
        [cx + 17, cy + 22],
        [cx - 17, cy + 22],
      ],
      BLUE,
    );
    ellipse(cx, cy + 4, 10, 10, "#b7d8ff", INK, 1.5);
    path(
      [
        [cx - 25, cy - 61],
        [cx + 25, cy - 61],
        [cx + 31, cy - 29],
        [cx - 31, cy - 29],
      ],
      INK,
      "#6099c6",
      2,
    );
    ctx.fillStyle = "#b7d8ff";
    ctx.fillRect(cx - 19, cy - 49, 38, 8);
    if (u > 2.8 && u < 13.5) {
      ellipse(cx - 3, cy - 1, 4, 4, LIGHT);
      ellipse(cx + 4, cy - 2, 2, 2, "white");
    }
    ctx.save();
    ctx.translate(cx - 43, cy - 11);
    ctx.rotate(combat ? -0.35 + Math.sin(u * 3) * 0.3 : 0.2);
    path(
      [
        [-8, -9],
        [8, -9],
        [9, 35],
        [-8, 35],
      ],
      "#9db8d4",
      INK,
      2,
    );
    line(
      [
        [0, 31],
        [-14, 42],
      ],
      INK,
      7,
    );
    path(
      [
        [-18, 42],
        [-9, 42],
        [-10, 106],
        [-24, 118],
        [-28, 99],
      ],
      "#e1f9ff",
      BLUE,
      2,
    );
    line(
      [
        [-17, 48],
        [-22, 106],
      ],
      "white",
      2,
    );
    ctx.restore();
    ctx.save();
    ctx.translate(cx + 46, cy - 8);
    ctx.rotate(combat ? -0.25 : 0);
    path(
      [
        [-10, -10],
        [10, -10],
        [17, 28],
        [-10, 34],
      ],
      "#9db8d4",
      INK,
      2,
    );
    gear(6, 32, 16, u * 5, INK);
    for (let i = 0; i < 3; i++)
      line(
        [
          [8, 22 + i * 8],
          [57, 22 + i * 8],
        ],
        "#506b8c",
        5,
      );
    if (combat && Math.sin(u * 40) > 0) {
      path(
        [
          [58, 20],
          [77, 13],
          [69, 28],
          [89, 31],
          [69, 35],
          [75, 45],
          [58, 39],
        ],
        LIGHT,
      );
      glow(66, 30, 29, "#b7d8ff77");
    }
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const p = (u * 0.28 + i * 0.36) % 1,
        bx = cx + 170 - p * 77,
        by = cy - 78 + i * 62,
        hit = combat && p > 0.68;
      if (hit) {
        for (let j = 0; j < 7; j++) {
          const a = j * 0.91,
            r = (p - 0.68) * 180;
          line(
            [
              [bx + Math.cos(a) * r, by + Math.sin(a) * r],
              [bx + Math.cos(a) * (r + 5), by + Math.sin(a) * (r + 5)],
            ],
            LIGHT,
            2,
          );
        }
      } else bug(bx, by + Math.sin(u * 7 + i) * 5, 0.65);
      if (combat)
        line(
          [
            [cx + 107, cy + 20],
            [bx - 15, by],
          ],
          "#b7d8ff80",
          1.5,
        );
    }

    ctx.restore();
  }
  function sleep(t) {
    const u = t / 1000,
      land = ease(clamp(u / 2)),
      wake = ease(clamp((u - 11.5) / 2.5));
    ellipse(center.x, center.y + 56, 83, 9, "#315c8420");
    ctx.save();
    ctx.translate(center.x - 7, center.y + 46);
    ctx.rotate(-0.12);
    path(
      [
        [-78, 0],
        [-56, -12],
        [56, -12],
        [78, 0],
        [56, 12],
        [-56, 12],
      ],
      "#dceaff",
      BLUE,
      1.5,
    );
    line(
      [
        [-68, 0],
        [66, 0],
      ],
      "#7ca9ed",
      1.5,
    );
    for (let i = -2; i < 3; i++)
      line(
        [
          [i * 20, 0],
          [i * 20 + 5, -8],
        ],
        "#b7d8ff",
        1,
      );
    ctx.restore();
    if (u > 2 && u < 12)
      for (let i = 0; i < 3; i++) {
        let p = (u * 0.3 + i * 0.33) % 1;
        ctx.save();
        ctx.globalAlpha *= Math.sin(p * Math.PI);
        text(
          "z",
          center.x + 52 + p * 35,
          center.y - 30 - p * 80,
          13 + p * 12,
          "#7d9cbe",
        );
        ctx.restore();
      }
  }
  function flower(t) {
    const u = t / 1000,
      cx = center.x - 4,
      cy = center.y + 39,
      charge = clamp((u - 3) / 7),
      burst = clamp((u - 10) / 2);
    line(
      [
        [cx, cy + 9],
        [cx, cy + 98],
      ],
      "#7b9db5",
      6,
    );
    line(
      [
        [cx, cy + 67],
        [cx + 26, cy + 52],
      ],
      "#90adbb",
      4,
    );
    gear(cx, cy, 49, u * 0.13, "#c1d8e7");
    gear(cx, cy, 29, -u * 0.24, "#90b5d7");
    glow(cx, cy, 65, `rgba(37,99,235,${0.12 + charge * 0.25})`);
    ellipse(cx, cy, 14, 14, LIGHT, INK, 2);
    for (let i = 0; i < 6; i++) {
      let p = (u * 0.55 + i / 6) % 1,
        xx = cx + Math.cos(i * 2) * 39 * (1 - p),
        yy = cy - 16 - p * 44;
      ctx.save();
      ctx.globalAlpha *= (1 - p) * clamp(u - 2) * clamp(11 - u);
      text(i % 2 ? "01" : "T", xx, yy, 10, "#61a6da");
      ctx.restore();
    }
    const bx = center.x + currentPose.x,
      by = center.y + currentPose.y;
    if (u > 10 && u < 13) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.globalAlpha *=
        ease(clamp((u - 10) / 0.4)) * (1 - ease(clamp((u - 12.5) / 0.5)));
      ctx.scale(1, 0.45);
      for (let i = 0; i < 3; i++) {
        let r = 38 + ((burst + i / 3) % 1) * 110;
        ctx.strokeStyle = `rgba(37,99,235,${(1 - (r - 38) / 110) * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (u > 11 && u < 12.3) {
      let p = (u - 11) / 1.3;
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI) / 9,
          r = 30 + p * 100;
        line(
          [
            [bx + Math.cos(a) * r, by + Math.sin(a) * r],
            [bx + Math.cos(a) * (r + 12), by + Math.sin(a) * (r + 12)],
          ],
          `rgba(37,99,235,${1 - p})`,
          2,
        );
      }
    }
  }
  function sting(t) {
    const u = t / 1000,
      hit = 2.6;
    if (u >= hit) {
      const p = clamp((u - hit) / 0.24),
        fade = 1 - ease(clamp((u - 5) / 2)),
        x = center.x - 22,
        y = center.y;
      ctx.save();
      ctx.globalAlpha *= fade;
      ctx.beginPath();
      ctx.arc(x, y, CRACK_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      glow(x, y, 35 * (1 - p) + 8, "#e5f7ffbb");
      for (let i = 0; i < 17; i++) {
        const a = i * 2.399,
          reach = (40 + ((i * 17) % 52)) * p,
          pts = [[x, y]];
        for (let j = 1; j <= 5; j++) {
          let r = (reach * j) / 5,
            aa = a + Math.sin(i * 5 + j * 3) * 0.09;
          pts.push([x + Math.cos(aa) * r, y + Math.sin(aa) * r]);
        }
        line(pts, "#0d20335e", 3.2);
        line(
          pts.map(([a, b]) => [a - 1, b - 1]),
          "#f1fbffeb",
          1.2,
        );
        for (let j = 2; j < 5; j++) {
          const [xx, yy] = pts[j];
          line(
            [
              [xx, yy],
              [xx + Math.cos(a + 0.7) * 25, yy + Math.sin(a + 0.7) * 25],
              [xx + Math.cos(a + 0.85) * 49, yy + Math.sin(a + 0.85) * 49],
            ],
            "#e4f3ffe0",
            1,
          );
        }
      }
      // Faceted glass fragments catch opposing highlights.
      for (let i = 0; i < 11; i++) {
        const a = i * 0.571,
          r = 12 + i * 4,
          xx = x + Math.cos(a) * r,
          yy = y + Math.sin(a) * r;
        path(
          [
            [xx, yy],
            [xx + Math.cos(a + 0.2) * 55, yy + Math.sin(a + 0.2) * 55],
            [xx + Math.cos(a + 0.7) * 36, yy + Math.sin(a + 0.7) * 36],
          ],
          "#d7f1ff10",
          "#effbff90",
          0.6,
        );
      }
      ctx.restore();
    }
  }
  function drawMorph(now) {
    const m = morph,
      p = ease(clamp((now - m.started) / MORPH_DURATION)),
      v = m.direction === "open" ? p : 1 - p;
    const hx = mix(m.from.x, m.to.x, v),
      hy = mix(m.from.y, m.to.y, v),
      scale = mix(0.04, 1, v);
    const r = m.editor;
    ctx.save();
    ctx.globalAlpha = clamp(v * 3);
    ctx.translate(hx, hy);
    ctx.scale(scale, scale);
    ctx.translate(-m.to.x, -m.to.y);
    ctx.shadowColor = "#183b6240";
    ctx.shadowBlur = 30;
    ctx.fillStyle = m.dark ? "#111" : "#fff";
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.width, r.height, 12 * (1 - v));
    ctx.fill();
    ctx.shadowBlur = 0;
    if (m.image?.complete && m.image.naturalWidth)
      ctx.drawImage(
        m.image,
        r.x,
        r.y + (m.top || 0),
        r.width,
        r.height - (m.top || 0),
      );
    ctx.restore();
    const beeScale = mix(1, 0.18, v);
    ctx.save();
    ctx.translate(hx, hy);
    const facing = direction === "left" ? -1 : 1;
    ctx.scale(facing, 1);
    const pointer = mouse;
    mouse = { x: (mouse.x - hx) * facing, y: mouse.y - hy };
    bee(-26 * beeScale, 8 * beeScale, beeScale, now, {
      alpha: 1 - clamp((v - 0.68) / 0.32),
    });
    mouse = pointer;
    ctx.restore();
    if (p >= 1) {
      morph = null;
      send("morphDone", { direction: m.direction });
    }
  }
  function tick(now) {
    if (destroyed) return;
    frame = requestAnimationFrame(tick);
    draw(now);
  }
  function draw(now) {
    if (destroyed) return;
    if (!visible) return;
    if (!enabled && !morph && now - last < 1000 / 12) return;
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (morph) {
      drawMorph(now);
      return;
    }
    if (!enabled) {
      if (logo.complete)
        ctx.drawImage(logo, center.x - 40, center.y - 40, 80, 80);
      return;
    }
    const screenMouse = mouse;
    ctx.save();
    if (direction === "left") {
      ctx.translate(center.x * 2, 0);
      ctx.scale(-1, 1);
      mouse = { x: center.x * 2 - mouse.x, y: mouse.y };
    }
    if (scene < 0 && now >= nextIdle) {
      play((lastScene + 1) % SCENES.length, now);
    }
    const t = now - sceneStart;
    if (scene >= 0 && t >= SCENES[scene].duration) {
      scene = -1;
      previousEnvironment = null;
      nextIdle = now + IDLE_DELAY;
      send("sceneEnd");
    }
    currentPose =
      scene < 0 ? flightPose(now) : scenePose(scene, t, now, sceneOrigin);
    const environmentOpacity = (index, elapsed) =>
      ease(clamp(elapsed / 650)) *
      (1 - ease(clamp((elapsed - (SCENES[index].duration - 1800)) / 1800)));
    const strength = scene < 0 ? 0 : environmentOpacity(scene, t);
    ctx.save();
    ctx.globalAlpha = 1 - strength * 0.85;
    scenery(now);
    ctx.restore();
    if (previousEnvironment) {
      const opacity =
        previousEnvironment.opacity *
        (1 - ease(clamp((now - previousEnvironment.interrupted) / 650)));
      if (opacity > 0) {
        ctx.save();
        ctx.globalAlpha = opacity;
        [mech, sleep, flower, sting][previousEnvironment.index](
          now - previousEnvironment.started,
        );
        ctx.restore();
      } else previousEnvironment = null;
    }
    if (scene >= 0) {
      ctx.save();
      ctx.globalAlpha = strength;
      [mech, sleep, flower, sting][scene](t);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(center.x + currentPose.x, center.y + currentPose.y);
    ctx.rotate(currentPose.rotation);
    // Transform the pointer back into the bee's coordinate space as it turns.
    const originalMouse = mouse,
      dx = mouse.x - center.x - currentPose.x,
      dy = mouse.y - center.y - currentPose.y;
    mouse = {
      x:
        dx * Math.cos(-currentPose.rotation) -
        dy * Math.sin(-currentPose.rotation),
      y:
        dx * Math.sin(-currentPose.rotation) +
        dy * Math.cos(-currentPose.rotation),
    };
    bee(0, 0, currentPose.scale, now, currentPose);
    mouse = originalMouse;
    ctx.restore();
    ctx.restore();
    mouse = screenMouse;
  }
  function closeMenu() {
    const wasOpen = !menu.hidden;
    menu.hidden = true;
    if (wasOpen) send("menuClose");
  }
  function play(index, now = performance.now()) {
    if (index < 0 || index >= SCENES.length) return;
    sceneOrigin =
      scene < 0
        ? flightPose(now)
        : scenePose(scene, now - sceneStart, now, sceneOrigin);
    if (scene >= 0) {
      const elapsed = now - sceneStart;
      previousEnvironment = {
        index: scene,
        started: sceneStart,
        interrupted: now,
        opacity:
          ease(clamp(elapsed / 650)) *
          (1 - ease(clamp((elapsed - (SCENES[scene].duration - 1800)) / 1800))),
      };
    }
    if (!enabled) {
      enabled = true;
      save();
    }
    scene = index;
    lastScene = index;
    sceneStart = now;
    nextIdle = now + IDLE_DELAY;
    closeMenu();
    send("scene", { index });
  }
  function save() {
    send("settings", { enabled, direction });
    try {
      localStorage.setItem("prombee-mascot-animations", String(enabled));
      localStorage.setItem("prombee-mascot-direction", direction);
    } catch {}
  }
  function action(name) {
    closeMenu();
    nextIdle = performance.now() + IDLE_DELAY;
    if (name === "toggle") {
      enabled = !enabled;
      scene = -1;
      previousEnvironment = null;
      save();
    } else if (name === "left" || name === "right") {
      direction = name;
      save();
    } else if (name === "hide") {
      visible = false;
      send("hide");
    } else if (name.startsWith("scene")) play(Number(name.slice(5)));
    else send("open");
  }
  function showMenu(x, y) {
    nextIdle = performance.now() + IDLE_DELAY;
    menu.replaceChildren();
    for (const [label, name] of [
      ["打开编辑器", "open"],
      ["隐藏悬浮球", "hide"],
      [enabled ? "取消动画" : "开启动画", "toggle"],
      ["← 向左飞行", "left"],
      ["向右飞行 →", "right"],
      ...SCENES.map((s, i) => [
        `播放待机动画 ${i + 1} · ${s.name}`,
        `scene${i}`,
      ]),
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.role =
        name === "left" || name === "right" ? "menuitemradio" : "menuitem";
      if (b.role === "menuitemradio")
        b.setAttribute("aria-checked", String(direction === name));
      b.textContent = label;
      b.onclick = () => action(name);
      menu.append(b);
    }
    menu.hidden = false;
    send("menu");
    menu.style.left = Math.max(6, Math.min(x, width - 272)) + "px";
    menu.style.top =
      Math.max(6, Math.min(y, height - menu.offsetHeight - 6)) + "px";
    menu.querySelector("button").focus();
  }
  const events = {
    contextmenu: (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY);
    },
    pointermove: (e) => {
      mouse = { x: e.clientX, y: e.clientY };
      if (drag) {
        const dx = e.screenX - drag.x,
          dy = e.screenY - drag.y;
        if (Math.hypot(dx, dy) > 5) {
          suppressClick = true;
          if (!nativeDrag) send("drag", { dx, dy });
          drag.x = e.screenX;
          drag.y = e.screenY;
        }
      }
    },
    pointerdown: (e) => {
      if (e.button !== 0) return;
      nextIdle = performance.now() + IDLE_DELAY;
      closeMenu();
      drag = { x: e.screenX, y: e.screenY };
      suppressClick = false;
      if (!nativeDrag) canvas.setPointerCapture?.(e.pointerId);
    },
    pointercancel: () => {
      drag = null;
      suppressClick = true;
    },
    pointerup: (e) => {
      drag = null;
      canvas.releasePointerCapture?.(e.pointerId);
    },
    click: () => {
      if (suppressClick || morph) return;
      nextIdle = performance.now() + IDLE_DELAY;
      send("open");
    },
    keydown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        send("open");
      }
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        showMenu(center.x, center.y);
      }
      if (e.key === "Escape") {
        closeMenu();
        send("open");
      }
    },
  };
  for (const [name, fn] of Object.entries(events))
    canvas.addEventListener(name, fn);
  menu.addEventListener("keydown", (e) => {
    const buttons = [...menu.querySelectorAll("button")],
      i = buttons.indexOf(document.activeElement);
    if (e.key === "Escape") {
      closeMenu();
      canvas.focus();
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[
        (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
      ].focus();
    }
  });
  frame = requestAnimationFrame(tick);
  // Some transparent native WebViews stop their frame clock while being remapped.
  // A single fallback draws only when RAF has stopped, without accumulating RAF callbacks.
  const fallback = setInterval(() => {
    const now = performance.now();
    if (visible && (enabled || morph) && now - last > 40) draw(now);
  }, 16);
  const api = {
    play,
    showMenu,
    receive(command, data = {}) {
      if (command === "anchor") {
        customCenter = data.x === undefined ? null : data;
        resize();
      }
      if (command === "interaction") nextIdle = performance.now() + IDLE_DELAY;
      if (command === "cursor") mouse = data;
      if (command === "settings") {
        enabled = data.enabled !== false;
        nativeDrag = data.nativeDrag === true;
        direction = data.direction === "left" ? "left" : "right";
        scene = -1;
        previousEnvironment = null;
      }
      if (command === "show") {
        visible = true;
        scene = -1;
        previousEnvironment = null;
        nextIdle = performance.now() + IDLE_DELAY;
        closeMenu();
        resize();
      }
      if (command === "pause") {
        visible = false;
        closeMenu();
      }
      if (command === "morph") {
        visible = true;
        scene = -1;
        previousEnvironment = null;
        closeMenu();
        resize();
        morph = { ...data, started: performance.now() };
        if (data.snapshot) {
          morph.image = new Image();
          morph.image.src = data.snapshot;
        }
      }
    },
    state: () => ({
      enabled,
      direction,
      nativeDrag,
      scene,
      visible,
      morphing: !!morph,
      nextIdle,
      pose: { ...currentPose },
      frames: frame,
      last,
    }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      clearInterval(fallback);
      observer.disconnect();
      for (const [name, fn] of Object.entries(events))
        canvas.removeEventListener(name, fn);
    },
  };
  return api;
}
if (document.body.classList.contains("mascot-surface")) {
  const send = (action, data = {}) => {
    const msg = { action, ...data };
    if (window.pywebview?.api?.mascot) window.pywebview.api.mascot(msg);
    else
      window.webkit?.messageHandlers?.mascot?.postMessage(JSON.stringify(msg));
  };
  window.prombeeMascot = mountMascot(
    document.getElementById("mascotCanvas"),
    document.getElementById("mascotMenu"),
    send,
  );
  send("ready");
  window.addEventListener("pywebviewready", () => send("ready"));
}
