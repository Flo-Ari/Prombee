import "./brand.js";
// Code-drawn mascot: transparent at every scale, independent of editor content.
export const IDLE_DELAY = 60_000;
export const MORPH_DURATION = 300;
export const SCENES = [
  { name: "机甲除虫", duration: 16_000 },
  { name: "低功耗休眠", duration: 14_000 },
  { name: "机械花蕊 · Token 充能", duration: 16_000 },
  { name: "蜂针击碎屏幕", duration: 8_000 },
];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const BLUE = "#2563eb",
  INK = "#15243a",
  LIGHT = "#b7d8ff";

export const CRACK_RADIUS = 92;
export function flightPose(now) {
  return {
    x: Math.sin(now * 0.00085) * 2.2,
    y: Math.sin(now * 0.0034) * 2.7 + Math.sin(now * 0.0012) * 1.2,
    scale: 1,
    rotation: Math.sin(now * 0.0017) * 0.018,
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
  // One articulated reconnaissance unit. Logo DNA: hexagonal shell, dual blue
  // sensors, two blue bands, twin antennae and a circuit trace at the temple.
  function metal(points, bright = false) {
    const g = ctx.createLinearGradient(-70, -70, 60, 65);
    g.addColorStop(0, bright ? "#f5faff" : "#33435b");
    g.addColorStop(0.42, bright ? "#d1dfed" : "#152237");
    g.addColorStop(0.48, bright ? "#f8fcff" : "#233650");
    g.addColorStop(1, bright ? "#7c94af" : "#080f1d");
    path(points, g, bright ? "#a2b7ce" : "#536b87", 0.9);
  }
  function bolt(x, y, r = 1.65) {
    ellipse(x, y, r + 0.8, r + 0.8, "#070f1e", "#7892ae", 0.65);
    line(
      [
        [x - r * 0.5, y],
        [x + r * 0.5, y],
      ],
      "#a6bfd8",
      0.65,
    );
  }
  function circuit(points, color = "#79baff", power = 1) {
    ctx.save();
    ctx.shadowColor = "#2563eb";
    ctx.shadowBlur = 5 * power;
    line(points, color, 1.1);
    ctx.restore();
  }
  function wing(t, near, sleep) {
    const stroke = Math.sin(t * 0.105 + (near ? 0 : 1.1));
    ctx.save();
    ctx.translate(near ? -14 : -21, -22);
    ctx.rotate((near ? -0.04 : -0.36) + stroke * 0.11 * (1 - sleep));
    ctx.scale(1, mix(0.65 + Math.abs(stroke) * 0.32, 0.24, sleep));
    const outline = [
      [0, 0],
      [-18, -35],
      [-69, -79],
      [-61, -41],
      [-21, -6],
    ];
    // Two offset, translucent motion silhouettes, then the rigid carbon spars.
    if (sleep < 0.5) {
      for (let i = 1; i <= 2; i++) {
        ctx.save();
        ctx.rotate(-i * 0.07);
        ctx.globalAlpha *= 0.1 / i;
        path(outline, "#a6d4ff");
        ctx.restore();
      }
    }
    path(outline, near ? "#c8e8ff45" : "#7797c52b", "#9ec6ecaa", 0.8);
    path(
      [
        [0, 0],
        [-17, -9],
        [-57, -48],
        [-69, -79],
        [-15, -31],
      ],
      "#11243b80",
      "#7595b4",
      0.7,
    );
    path(
      [
        [-20, -32],
        [-61, -72],
        [-53, -43],
      ],
      "#c8e5ff39",
    );
    line(
      [
        [-64, -70],
        [-43, -26],
        [-20, -8],
      ],
      "#effbffb0",
      1,
    );
    line(
      [
        [-17, -12],
        [-22, -32],
        [-53, -56],
      ],
      "#497aab",
      0.8,
    );
    circuit(
      [
        [-5, -5],
        [-22, -28],
        [-61, -68],
      ],
      "#9fcfff",
      0.6,
    );
    for (let i = 0; i < 4; i++)
      line(
        [
          [-31 - i * 6, -26 - i * 7],
          [-27 - i * 7, -15 - i * 7],
        ],
        "#d9efff6b",
        0.55,
      );
    metal([
      [-8, -6],
      [1, -4],
      [4, 3],
      [-3, 7],
      [-10, 1],
    ]);
    bolt(-3, 0, 2.4);
    ctx.restore();
  }
  function sensor(x, y, radius, t, sleep, target) {
    ctx.save();
    ctx.translate(x, y);
    const points = Array.from({ length: 6 }, (_, i) => [
      Math.cos((i * Math.PI) / 3) * radius,
      Math.sin((i * Math.PI) / 3) * radius,
    ]);
    path(points, "#030b18", "#829bb9", 0.8);
    ctx.save();
    ctx.scale(1, Math.max(0.06, 1 - sleep));
    ellipse(0, 0, radius * 0.73, radius * 0.73, "#163756", "#366eae", 0.8);
    const dx = target.x - x,
      dy = target.y - y,
      length = Math.max(1, Math.hypot(dx, dy));
    const px = (dx / length) * 2.3,
      py = (dy / length) * 2.0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(t * 0.00008);
    ctx.shadowColor = "#53a5ff";
    ctx.shadowBlur = 6;
    ellipse(0, 0, radius * 0.36, radius * 0.36, "#64bbff", "#d6f4ff", 0.7);
    ctx.shadowBlur = 0;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      line(
        [
          [Math.cos(a) * radius * 0.48, Math.sin(a) * radius * 0.48],
          [
            Math.cos(a + 0.3) * radius * 0.67,
            Math.sin(a + 0.3) * radius * 0.67,
          ],
        ],
        "#b7e0ff",
        0.6,
      );
    }
    ellipse(-1, -1, radius * 0.1, radius * 0.1, "#fff");
    ctx.restore();
    ctx.restore();
    if (sleep > 0.2)
      line(
        [
          [-radius * 0.6, 0],
          [radius * 0.6, 0],
        ],
        "#6695c5",
        1.1,
      );
    ctx.restore();
  }
  function bee(
    x,
    y,
    scale,
    t,
    { sleep = 0, energy = 0, sting = 0, alpha = 1 } = {},
  ) {
    sleep = Number(sleep);
    sting = Number(sting);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const target = { x: (mouse.x - x) / scale, y: (mouse.y - y) / scale };
    if (energy > 0) glow(-14, 0, 105, `rgba(64,135,255,${energy * 0.22})`);
    // Rear propulsion rails. Light appears inside hardware, not as a neon blob.
    ctx.save();
    ctx.globalAlpha *= (1 - sleep) * 0.6;
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.001 + i / 3) % 1;
      circuit(
        [
          [-70 - p * 12, 11 + i * 4],
          [-86 - p * 15, 11 + i * 4],
        ],
        `rgba(113,182,255,${(1 - p) * 0.6})`,
        0.5,
      );
    }
    ctx.restore();
    wing(t, false, sleep);
    // Retractable tungsten stinger and its armoured iris.
    metal([
      [-63, -1],
      [-80, 4],
      [-89 - sting * 23, 10 + sting * 4],
      [-76, 13],
      [-62, 20],
    ]);
    path(
      [
        [-81, 7],
        [-89 - sting * 23, 10 + sting * 4],
        [-76, 11],
      ],
      "#e7f1fc",
    );
    circuit(
      [
        [-69, 5],
        [-78, 8],
      ],
      "#8fcaff",
    );
    // Hydraulic legs tuck under the body during flight, land with damped joints.
    for (const [lx, ly, side] of [
      [-47, 25, 0],
      [-24, 28, 1],
      [-3, 22, 2],
    ]) {
      const flex = Math.sin(t * 0.003 + side) * 1.5 * (1 - sleep) + sleep * 7;
      line(
        [
          [lx, ly],
          [lx - 6, ly + 9],
          [lx + 7 + flex, ly + 16],
          [lx + 18 + flex, ly + 14],
        ],
        "#060f1d",
        5,
      );
      line(
        [
          [lx, ly],
          [lx - 6, ly + 9],
          [lx + 7 + flex, ly + 16],
        ],
        "#738eaa",
        2,
      );
      circuit(
        [
          [lx - 5, ly + 10],
          [lx + 6 + flex, ly + 15],
        ],
        "#739fc9",
        0.4,
      );
      bolt(lx - 6, ly + 9, 1.5);
      path(
        [
          [lx + 8 + flex, ly + 13],
          [lx + 23 + flex, ly + 12],
          [lx + 17 + flex, ly + 17],
        ],
        "#b4c8dc",
        "#273e59",
        0.8,
      );
    }
    // Hexagonal abdomen with layered ceramic armour and the logo's two bands.
    const shell = [
      [-72, 7],
      [-51, -22],
      [-13, -22],
      [12, 6],
      [-11, 34],
      [-50, 34],
    ];
    metal(shell, true);
    path(
      [
        [-68, 7],
        [-49, -18],
        [-15, -18],
        [6, 6],
        [-13, 28],
        [-48, 28],
      ],
      "#0b192c",
      "#567793",
      0.9,
    );
    path(
      [
        [-64, 6],
        [-48, -16],
        [-17, -16],
        [4, 6],
        [-15, 25],
        [-47, 25],
      ],
      "#dce9f4",
    );
    path(
      [
        [-55, -5],
        [-44, -18],
        [-33, -18],
        [-22, 28],
        [-34, 28],
      ],
      BLUE,
      "#518bee",
      0.6,
    );
    path(
      [
        [-30, -18],
        [-18, -18],
        [3, 5],
        [-15, 27],
      ],
      BLUE,
      "#5d9dfb",
      0.6,
    );
    // Panel bevels, ventilation and a small AI data bus.
    line(
      [
        [-50, -20],
        [-14, -20],
        [9, 6],
      ],
      "#f6fcff",
      1.1,
    );
    line(
      [
        [-67, 9],
        [-49, 31],
        [-12, 31],
      ],
      "#5a718f",
      1.5,
    );
    for (let i = 0; i < 5; i++)
      line(
        [
          [-53 + i * 3, 17],
          [-50 + i * 3, 21],
        ],
        "#263d58",
        1.2,
      );
    circuit(
      [
        [-59, 8],
        [-53, 2],
        [-53, -3],
      ],
      "#9ad1ff",
      0.6,
    );
    bolt(-50, -13);
    bolt(-49, 25);
    bolt(-13, 23);
    // Dorsal hub and near wing sit in front of the rear plates.
    metal([
      [-28, -22],
      [-17, -30],
      [-2, -25],
      [5, -12],
      [-8, -5],
      [-24, -9],
    ]);
    wing(t, true, sleep);
    metal([
      [-10, -15],
      [7, -24],
      [20, -9],
      [17, 12],
      [1, 19],
      [-12, 7],
    ]);
    for (let i = 0; i < 3; i++)
      line(
        [
          [-5 + i * 4, -8],
          [-5 + i * 4, 7],
        ],
        "#7b92ac",
        1,
      );
    // Three-quarter head: faceted white helmet around two recessed camera eyes.
    const helmet = [
      [0, -18],
      [13, -34],
      [38, -33],
      [56, -17],
      [58, 3],
      [41, 21],
      [13, 20],
      [-1, 6],
    ];
    metal(helmet, true);
    path(
      [
        [1, -16],
        [15, -30],
        [36, -30],
        [49, -18],
        [30, -21],
        [12, -18],
        [1, -6],
      ],
      "#f9fcff",
    );
    path(
      [
        [4, -9],
        [13, -20],
        [45, -19],
        [54, -10],
        [51, 4],
        [39, 11],
        [13, 8],
        [3, 1],
      ],
      "#071322",
      "#5d7794",
      1,
    );
    path(
      [
        [4, -9],
        [16, -18],
        [47, -17],
        [51, -12],
        [16, -12],
        [5, -3],
      ],
      "#233a53",
    );
    sensor(19, -8, 7.3, t, sleep, target);
    sensor(42, -6, 8.7, t, sleep, target);
    // A hard brow, jaw heatsink and temple circuitry replace facial expressions.
    path(
      [
        [8, -22],
        [16, -27],
        [36, -27],
        [47, -20],
        [42, -17],
        [17, -21],
      ],
      "#dceaf5",
      "#6e86a0",
      0.65,
    );
    path(
      [
        [12, 12],
        [39, 14],
        [51, 3],
        [55, 4],
        [41, 19],
        [15, 17],
      ],
      "#e4eef8",
    );
    for (let i = 0; i < 4; i++)
      line(
        [
          [20 + i * 4, 12],
          [22 + i * 4, 9],
        ],
        "#374d68",
        1.15,
      );
    circuit(
      [
        [46, 12],
        [52, 6],
        [52, -1],
      ],
      "#66adff",
      1 - sleep * 0.8,
    );
    ellipse(46, 12, 1.6, 1.6, "#b9e5ff");
    bolt(6, -15, 1.3);
    bolt(42, 17, 1.3);
    // LOGO antennae: hinged probes, white tips and blue telemetry nodes.
    for (const [ax, ay, bx, by] of [
      [12, -28, 0, -47],
      [34, -31, 46, -47],
    ]) {
      line(
        [
          [ax, ay],
          [ax + (bx - ax) * 0.3, ay - 11],
          [bx, by],
        ],
        "#0b1729",
        3.2,
      );
      line(
        [
          [ax, ay],
          [ax + (bx - ax) * 0.3, ay - 11],
          [bx, by],
        ],
        "#b4c9dd",
        1.3,
      );
      ellipse(bx, by, 3.5, 3.5, "#e4f4ff", "#357de8", 1.1);
      ellipse(bx, by, 1.3, 1.3, sleep > 0.5 ? "#52718e" : "#5badff");
    }
    // Airflow fins and discreet registration marks, visible at desktop scale.
    path(
      [
        [-46, 31],
        [-38, 40],
        [-24, 40],
        [-29, 33],
      ],
      "#0b1729",
      "#6989aa",
      0.8,
    );
    circuit(
      [
        [-38, 36],
        [-29, 36],
      ],
      "#73b8ff",
      0.6,
    );
    if (energy > 0) {
      ctx.save();
      ctx.globalAlpha *= energy;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.strokeStyle = i ? "#a6d9ff" : "#367ff0";
        ctx.lineWidth = 1.2;
        ctx.ellipse(
          -12,
          0,
          84 + i * 11,
          27 + i * 5,
          t * 0.002 + i * 0.9,
          0.25,
          Math.PI * 1.8,
        );
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function scenery(t) {
    // Windborne silicon petals / grass-like circuit shards, with sparse trails.
    for (let i = 0; i < 7; i++) {
      const p = (t * 0.00008 + i * 0.147) % 1,
        x = center.x + 195 - p * 390,
        y = center.y + Math.sin(i * 7.3) * 73;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(i + p * 0.9);
      ctx.globalAlpha *= Math.sin(p * Math.PI) * 0.42;
      if (i % 3 === 0) {
        path(
          [
            [-5, 1],
            [3, -4],
            [8, -3],
            [0, 4],
          ],
          "#b7d8ff65",
          "#83a7cd",
          0.6,
        );
        line(
          [
            [-3, 2],
            [5, -2],
          ],
          "#dceaff",
          0.6,
        );
      } else {
        line(
          [
            [-7, 3],
            [0, 0],
            [3, -7],
          ],
          "#83a7cd",
          0.8,
        );
        line(
          [
            [0, 0],
            [8, 0],
          ],
          "#b7d8ff",
          0.6,
        );
      }
      ctx.restore();
    }
  }
  function bug(x, y, s, hit = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    for (let i = -1; i <= 1; i++)
      for (const side of [-1, 1]) {
        line(
          [
            [side * 7, i * 7],
            [side * 15, i * 10 - 5],
            [side * 22, i * 10 + 2],
          ],
          "#12243b",
          3,
        );
        line(
          [
            [side * 7, i * 7],
            [side * 15, i * 10 - 5],
            [side * 22, i * 10 + 2],
          ],
          "#90abc8",
          1,
        );
      }
    metal([
      [0, -17],
      [10, -8],
      [11, 9],
      [0, 18],
      [-11, 9],
      [-10, -8],
    ]);
    path(
      [
        [-7, -7],
        [0, -13],
        [7, -7],
        [5, 9],
        [0, 15],
        [-5, 9],
      ],
      "#355e91",
      "#658cb5",
      0.7,
    );
    circuit(
      [
        [0, -9],
        [0, 10],
      ],
      "#81c5ff",
      0.7,
    );
    line(
      [
        [-5, -12],
        [-9, -21],
      ],
      "#abcce9",
      1,
    );
    line(
      [
        [5, -12],
        [9, -21],
      ],
      "#abcce9",
      1,
    );
    ctx.restore();
  }
  function mech(t) {
    const u = t / 1000,
      deploy = ease(clamp(u / 2.4)),
      combat = u > 3 && u < 12,
      spread = (1 - deploy) * 64;
    ctx.save();
    ctx.translate(center.x - 12, center.y + 9);
    ctx.globalAlpha *= 1 - ease(clamp((u - 13) / 3));
    ellipse(0, 101, 108, 7, "#08183120");
    // Four reverse-jointed outriggers: a low, insect-like tactical exoskeleton.
    for (const rear of [true, false])
      for (const side of [-1, 1]) {
        ctx.save();
        const z = rear ? 0.69 : 1;
        ctx.translate(side * spread, spread * 0.2);
        ctx.scale(z, z);
        if (rear) ctx.translate(side * 20, -27);
        const recoil = combat ? Math.sin(u * 6 + side) * 1.2 : 0;
        const hip = [side * 25, 15],
          knee = [side * 64, 47 + recoil],
          foot = [side * 87, 94];
        line([hip, knee, foot], "#07101d", 12);
        line([hip, knee, foot], "#69849e", 4);
        metal(
          [
            [side * 24, 7],
            [side * 44, 11],
            [side * 74, 39],
            [side * 64, 53],
            [side * 49, 34],
            [side * 26, 25],
          ],
          true,
        );
        path(
          [
            [side * 34, 16],
            [side * 43, 19],
            [side * 61, 37],
            [side * 58, 40],
          ],
          BLUE,
        );
        metal([
          [side * 58, 48],
          [side * 69, 45],
          [side * 90, 86],
          [side * 81, 94],
          [side * 72, 69],
        ]);
        // Exposed piston inside a carbon lower leg.
        line(
          [
            [side * 59, 49],
            [side * 76, 82],
          ],
          "#b1c8db",
          3.3,
        );
        line(
          [
            [side * 59, 49],
            [side * 68, 65],
          ],
          "#17263b",
          5.5,
        );
        metal(
          [
            [side * 80, 86],
            [side * 91, 85],
            [side * 104, 98],
            [side * 73, 99],
          ],
          true,
        );
        path(
          [
            [side * 80, 94],
            [side * 98, 95],
            [side * 101, 98],
            [side * 74, 98],
          ],
          "#0a192b",
        );
        circuit(
          [
            [side * 66, 54],
            [side * 79, 80],
          ],
          "#71b5ff",
          0.7,
        );
        bolt(side * 64, 47 + recoil, 4);
        bolt(side * 29, 16, 4);
        ctx.restore();
      }
    // Armature / blue gaskets are visible beneath independent ceramic plates.
    metal([
      [-43, -21],
      [-25, -42],
      [23, -42],
      [44, -22],
      [42, 17],
      [19, 38],
      [-22, 37],
      [-45, 12],
    ]);
    path(
      [
        [-31, -19],
        [-15, -33],
        [17, -33],
        [32, -18],
        [29, 17],
        [14, 28],
        [-17, 27],
        [-32, 12],
      ],
      "#122c4c",
      "#8baec9",
      1,
    );
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * spread, -spread * 0.25);
      metal(
        [
          [side * 5, -38],
          [side * 24, -38],
          [side * 41, -21],
          [side * 33, -10],
          [side * 11, -19],
        ],
        true,
      );
      path(
        [
          [side * 13, -32],
          [side * 22, -32],
          [side * 33, -22],
          [side * 27, -20],
        ],
        BLUE,
        "#86baff",
        0.5,
      );
      metal(
        [
          [side * 35, -6],
          [side * 44, -12],
          [side * 42, 12],
          [side * 23, 32],
          [side * 10, 29],
          [side * 17, 15],
        ],
        true,
      );
      line(
        [
          [side * 37, 1],
          [side * 34, 10],
          [side * 23, 21],
        ],
        "#f5fcff",
        1,
      );
      circuit(
        [
          [side * 31, 4],
          [side * 27, 12],
          [side * 20, 16],
        ],
        "#6fb8ff",
      );
      for (let i = 0; i < 4; i++)
        line(
          [
            [side * (25 + i * 3), -12 + i * 2],
            [side * (29 + i * 3), -9 + i * 2],
          ],
          "#263d56",
          1.7,
        );
      bolt(side * 34, -16, 2);
      bolt(side * 33, 15, 2);
      ctx.restore();
    }
    // Central hatch closes around the single bee as it reaches the cockpit.
    const bay = 1 - ease(clamp((u - 2.6) / 0.9));
    path(
      [
        [0, -24],
        [19, -12],
        [19, 9],
        [0, 21],
        [-19, 9],
        [-19, -12],
      ],
      "#050e1c",
      "#89a7c1",
      1,
    );
    for (const side of [-1, 1]) {
      metal(
        [
          [side * (1 + bay * 13), -22],
          [side * (17 + bay * 8), -11],
          [side * (17 + bay * 8), 8],
          [side * (1 + bay * 13), 19],
        ],
        true,
      );
      circuit(
        [
          [side * (5 + bay * 13), -12],
          [side * (12 + bay * 8), -7],
          [side * (12 + bay * 8), 5],
        ],
        "#77beff",
      );
    }
    // Recessed panoramic lidar. The body is a machine, not a humanoid toy.
    metal(
      [
        [-29, -41],
        [-19, -51],
        [17, -51],
        [30, -41],
        [22, -28],
        [-23, -28],
      ],
      true,
    );
    path(
      [
        [-21, -41],
        [19, -41],
        [22, -35],
        [16, -31],
        [-17, -31],
        [-23, -35],
      ],
      "#06101e",
      "#8eabc8",
      0.8,
    );
    circuit(
      [
        [-16, -36],
        [14, -36],
      ],
      "#7ccaff",
    );
    for (const side of [-1, 1]) {
      line(
        [
          [side * 21, -47],
          [side * 25, -62],
          [side * 32, -67],
        ],
        "#15273e",
        2.8,
      );
      line(
        [
          [side * 21, -47],
          [side * 25, -62],
          [side * 32, -67],
        ],
        "#b6cfdf",
        1,
      );
      ellipse(side * 32, -67, 2, 2, "#91c9ff");
    }
    // Left hand / viewer right: multi-barrel cannon with a real breech and recoil slide.
    ctx.save();
    ctx.translate(46 + spread, -5 - spread * 0.35);
    ctx.rotate(-0.16);
    metal(
      [
        [-11, -17],
        [9, -23],
        [25, -11],
        [17, 9],
        [-9, 9],
      ],
      true,
    );
    bolt(5, -6, 6);
    line(
      [
        [8, 4],
        [22, 18],
      ],
      "#0b192c",
      10,
    );
    line(
      [
        [8, 4],
        [22, 18],
      ],
      "#93b0c7",
      3,
    );
    const recoil = combat ? Math.max(0, Math.sin(u * 25)) * 2 : 0;
    ctx.translate(-recoil, 0);
    metal([
      [8, 12],
      [39, 6],
      [48, 16],
      [45, 36],
      [12, 39],
    ]);
    metal(
      [
        [12, 12],
        [35, 9],
        [38, 15],
        [17, 19],
      ],
      true,
    );
    for (let i = 0; i < 3; i++) {
      line(
        [
          [35, 14 + i * 8],
          [82, 14 + i * 8],
        ],
        "#07101c",
        5.8,
      );
      line(
        [
          [36, 13 + i * 8],
          [82, 13 + i * 8],
        ],
        "#8daac2",
        1.3,
      );
    }
    metal(
      [
        [65, 10],
        [72, 9],
        [74, 34],
        [67, 37],
      ],
      true,
    );
    ellipse(19, 25, 7, 7, "#0b182a", "#819fba", 1);
    bolt(19, 25, 3.4);
    circuit(
      [
        [25, 28],
        [35, 26],
      ],
      "#76baff",
    );
    if (combat) {
      const burst = Math.max(0, Math.sin(u * 27));
      ctx.save();
      ctx.globalAlpha *= burst;
      path(
        [
          [83, 14],
          [99, 10],
          [93, 20],
          [114, 23],
          [94, 27],
          [101, 37],
          [83, 32],
        ],
        "#d1edff",
      );
      circuit(
        [
          [86, 23],
          [119, 23],
        ],
        "#89bcff",
      );
      ctx.restore();
    }
    ctx.restore();
    // Right hand / viewer left: articulated monomolecular blade.
    ctx.save();
    ctx.translate(-47 - spread, -6 - spread * 0.35);
    ctx.rotate(combat ? -0.12 + Math.sin(u * 3) * 0.16 : 0.1);
    metal(
      [
        [-18, -13],
        [-3, -22],
        [11, -12],
        [10, 9],
        [-10, 14],
      ],
      true,
    );
    bolt(-2, -4, 5);
    line(
      [
        [-5, 9],
        [-20, 27],
      ],
      "#081324",
      11,
    );
    line(
      [
        [-5, 9],
        [-20, 27],
      ],
      "#93aec6",
      3,
    );
    metal([
      [-30, 20],
      [-17, 17],
      [-8, 32],
      [-18, 42],
      [-34, 34],
    ]);
    ctx.translate(-23, 32);
    ctx.rotate(combat ? Math.sin(u * 3) * 0.2 : 0);
    path(
      [
        [-4, -1],
        [5, -2],
        [7, 55],
        [-7, 88],
        [-14, 64],
      ],
      "#d9ebfc",
      "#72b9ff",
      1,
    );
    path(
      [
        [0, 4],
        [3, 54],
        [-6, 75],
        [-6, 55],
      ],
      "#6283a8",
    );
    circuit(
      [
        [-7, 9],
        [-10, 59],
        [-7, 78],
      ],
      "#c1eaff",
    );
    ctx.restore();
    // Targets are lean mechanical parasites; impacts dissolve into angular shards.
    if (combat)
      for (let i = 0; i < 3; i++) {
        const p = (u * 0.28 + i * 0.36) % 1,
          bx = 191 - p * 59,
          by = -80 + i * 63,
          hit = p > 0.68;
        if (!hit) {
          bug(bx, by + Math.sin(u * 6 + i) * 3, 0.52);
          ctx.save();
          ctx.globalAlpha *= 0.55;
          for (const side of [-1, 1])
            for (const vertical of [-1, 1])
              line(
                [
                  [bx + side * 19, by + vertical * 8],
                  [bx + side * 19, by + vertical * 18],
                  [bx + side * 9, by + vertical * 18],
                ],
                "#72aff7",
                0.8,
              );
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha *= 1 - (p - 0.68) / 0.32;
          for (let j = 0; j < 8; j++) {
            const a = j * 2.399,
              r = (p - 0.68) * 160;
            path(
              [
                [bx + Math.cos(a) * r, by + Math.sin(a) * r],
                [bx + Math.cos(a) * (r + 8), by + Math.sin(a) * (r + 8)],
                [
                  bx + Math.cos(a + 0.2) * (r + 3),
                  by + Math.sin(a + 0.2) * (r + 3),
                ],
              ],
              j % 2 ? "#a6d3ff" : "#1c3a63",
            );
          }
          ctx.restore();
        }
        line(
          [
            [137, 11],
            [bx - 10, by],
          ],
          "#8dc8ff50",
          0.7,
        );
      }
    ctx.restore();
  }
  function sleep(t) {
    const u = t / 1000;
    ctx.save();
    ctx.translate(center.x - 7, center.y + 58);
    // A folded maintenance cradle, not a cartoon bed / floating Z glyphs.
    metal([
      [-66, -5],
      [-49, -13],
      [45, -13],
      [64, -5],
      [49, 3],
      [-51, 3],
    ]);
    line(
      [
        [-50, -6],
        [49, -6],
      ],
      "#8cacc8",
      1,
    );
    for (const side of [-1, 1]) {
      metal(
        [
          [side * 53, -6],
          [side * 66, -18],
          [side * 72, -16],
          [side * 61, 1],
        ],
        true,
      );
      circuit(
        [
          [side * 55, -3],
          [side * 64, -13],
        ],
        "#6faaf3",
        0.5,
      );
    }
    for (let i = 0; i < 5; i++)
      ellipse(
        -15 + i * 7,
        -1,
        1,
        1,
        i === Math.floor(u * 0.5) % 5 ? "#a6d7ff" : "#385575",
      );
    ctx.restore();
  }
  function flower(t) {
    const u = t / 1000,
      cx = center.x - 4,
      cy = center.y + 39,
      charge = clamp((u - 3) / 7);
    ctx.save();
    ctx.translate(cx, cy);
    // Mechanical iris petals fold open around a token transfer core.
    line(
      [
        [0, 12],
        [0, 87],
      ],
      "#0b1729",
      8,
    );
    line(
      [
        [-2, 18],
        [-2, 86],
      ],
      "#9bb7d2",
      2,
    );
    circuit(
      [
        [1, 28],
        [1, 71],
        [13, 80],
      ],
      "#7bb8ff",
      0.6,
    );
    metal([
      [-24, 84],
      [24, 84],
      [37, 94],
      [-37, 94],
    ]);
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3 + u * 0.06);
      metal(
        [
          [9, -6],
          [32, -14],
          [52, -9],
          [44, 6],
          [25, 14],
          [9, 6],
        ],
        i % 2 === 0,
      );
      circuit(
        [
          [18, 0],
          [36, -6],
          [44, -5],
        ],
        "#82c5ff",
        0.6,
      );
      bolt(24, 0, 2);
      ctx.restore();
    }
    ellipse(0, 0, 16, 16, "#081628", "#81a7ce", 1.4);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
    g.addColorStop(0, "#edfaff");
    g.addColorStop(0.4, "#69b6ff");
    g.addColorStop(1, "#1e4980");
    ellipse(0, 0, 11, 11, g);
    if (u > 2 && u < 11) {
      ctx.save();
      ctx.globalAlpha *= clamp(u - 2) * clamp(11 - u);
      const bx = currentPose.x + 4,
        by = currentPose.y - 39;
      line(
        [
          [0, -8],
          [bx, by + 20],
        ],
        "#70b8ff40",
        6,
      );
      circuit(
        [
          [0, -8],
          [bx, by + 20],
        ],
        "#a8ddff",
        0.8,
      );
      for (let i = 0; i < 6; i++) {
        const p = (u * 0.6 + i / 6) % 1,
          x = bx * p,
          y = -8 + (by + 28) * p;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p * 3);
        path(
          [
            [-2, -4],
            [3, -4],
            [4, 2],
            [-2, 4],
          ],
          "#bce6ff",
        );
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
    const bx = center.x + currentPose.x,
      by = center.y + currentPose.y;
    if (u > 10 && u < 13) {
      const p = clamp((u - 10) / 3),
        fade = Math.sin(p * Math.PI);
      ctx.save();
      ctx.translate(bx, by);
      ctx.globalAlpha *= fade;
      for (let i = 0; i < 3; i++) {
        const radius = 45 + ((p + i / 3) % 1) * 85;
        ctx.beginPath();
        ctx.strokeStyle = i % 2 ? "#a6dfff" : "#468cf0";
        ctx.lineWidth = 1.2;
        ctx.ellipse(
          0,
          0,
          radius,
          radius * 0.38,
          u * 0.7 + i,
          0.2,
          Math.PI * 1.85,
        );
        ctx.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const a = i * 2.399,
          r = 30 + p * 105;
        line(
          [
            [Math.cos(a) * r, Math.sin(a) * r],
            [Math.cos(a) * (r + 8), Math.sin(a) * (r + 8)],
          ],
          "#88c2ff",
          1,
        );
      }
      ctx.restore();
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
