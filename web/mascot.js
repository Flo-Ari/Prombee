import "./brand.js";
// Code-drawn mascot: transparent at every scale, independent of editor content.
export const IDLE_DELAY = 60_000;
export const MORPH_DURATION = 300;
export const SCENES = [
  { name: "机甲除虫", duration: 16_000 },
  { name: "低功耗休眠", duration: 14_000 },
  { name: "机械花蕊 · Token 充能", duration: 16_000 },
  { name: "蜂针击碎屏幕", duration: 5_200 },
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
      x: -4 - mouthPoint({ ...neutral, x: 0, y: 0, scale: 0.83 }, 1).x,
      y: 31 - mouthPoint({ ...neutral, x: 0, y: 0, scale: 0.83 }, 1).y,
      scale: 0.83,
      energy: u > 9 && u < 14 ? Math.sin(clamp((u - 9) / 5) * Math.PI) : 0,
    };
    exitStart = 12000;
  } else {
    entry = 520;
    exitStart = 2400;
    const turn = ease(clamp(t / 700)),
      windup = ease(clamp((t - 520) / 320)),
      punch = ease(clamp((t - 900) / 150)),
      recover = ease(clamp((t - 1230) / 1100)),
      shake =
        t > 1050
          ? Math.sin((t - 1050) * 0.09) * Math.exp(-(t - 1050) / 110) * 5
          : 0;
    target = {
      ...neutral,
      x: -33 * windup + 33 * punch * (1 - recover) + shake,
      y: 6 * windup - 14 * punch * (1 - recover),
      scale: 1 + 0.06 * turn + 0.14 * punch * (1 - recover),
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

// Shared kinematics: rendering and collision effects use the same contact points.
export function combatPose(t) {
  const u = t / 1000,
    phase = ((((u - 3) % 2.4) + 2.4) % 2.4) / 2.4;
  const target = {
    x: 174 + Math.sin(u * 1.7) * 8,
    y: -52 + Math.sin(u * 2.1) * 24,
  };
  const pivot = { x: 46, y: -5 },
    dx = target.x - pivot.x,
    dy = target.y - pivot.y;
  const angle = Math.atan2(dy, dx) - Math.asin(23 / Math.hypot(dx, dy));
  const muzzle = {
    x: pivot.x + 83 * Math.cos(angle) - 23 * Math.sin(angle),
    y: pivot.y + 83 * Math.sin(angle) + 23 * Math.cos(angle),
  };
  const wrist = { x: -77, y: 7 },
    contactAngle = 2.65,
    bladeTarget = {
      x: wrist.x + 80 * Math.cos(contactAngle),
      y: wrist.y + 80 * Math.sin(contactAngle),
    };
  const bladePhase = ((((u - 3) % 2.7) + 2.7) % 2.7) / 2.7;
  let bladeAngle;
  if (bladePhase < 0.3) bladeAngle = contactAngle - 1.2;
  else if (bladePhase < 0.52)
    bladeAngle = mix(
      contactAngle - 1.2,
      contactAngle,
      ease((bladePhase - 0.3) / 0.22),
    );
  else if (bladePhase < 0.65)
    bladeAngle = mix(
      contactAngle,
      contactAngle + 0.65,
      ease((bladePhase - 0.52) / 0.13),
    );
  else
    bladeAngle = mix(
      contactAngle + 0.65,
      contactAngle - 1.2,
      ease(clamp((bladePhase - 0.65) / 0.3)),
    );
  return {
    target,
    pivot,
    angle,
    muzzle,
    phase,
    firing: u > 3 && u < 12 && phase > 0.1 && phase < 0.68,
    alive: phase < 0.7,
    wrist,
    bladeAngle,
    bladeTarget,
    bladePhase,
    bladeAlive: bladePhase < 0.52,
    bladeTip: {
      x: wrist.x + 80 * Math.cos(bladeAngle),
      y: wrist.y + 80 * Math.sin(bladeAngle),
    },
  };
}
export function mouthPoint(pose, feeding = 1) {
  const a = feeding * 0.25,
    tip = {
      x: 47 + 22 * Math.cos(a) - (31 + feeding * 12) * Math.sin(a),
      y: 19 + 22 * Math.sin(a) + (31 + feeding * 12) * Math.cos(a),
    };
  return {
    x:
      pose.x +
      pose.scale *
        (tip.x * Math.cos(pose.rotation) - tip.y * Math.sin(pose.rotation)),
    y:
      pose.y +
      pose.scale *
        (tip.x * Math.sin(pose.rotation) + tip.y * Math.cos(pose.rotation)),
  };
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
    nativeDrag = false,
    globalCursor = false;
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
    const beat = Math.sin(t * 0.125 + (near ? 0 : 0.65)),
      fold = 1 - sleep;
    ctx.save();
    ctx.translate(near ? -14 : -23, -24);
    ctx.rotate((near ? -0.02 : -0.28) + beat * 0.19 * fold);
    ctx.scale(1, mix(0.74 + Math.abs(beat) * 0.24, 0.18, sleep));
    const outline = [
      [0, 0],
      [-35, -48],
      [-109, -111],
      [-138, -117],
      [-115, -64],
      [-62, -18],
      [-12, 5],
    ];
    if (fold > 0.2)
      for (let i = 1; i <= 3; i++) {
        ctx.save();
        ctx.globalAlpha *= (0.075 / i) * fold;
        ctx.rotate(-i * 0.11);
        path(outline, "#83ceff");
        ctx.restore();
      }
    const g = ctx.createLinearGradient(-130, -110, -15, 0);
    g.addColorStop(0, "#d6f6ffb8");
    g.addColorStop(0.4, "#267debb0");
    g.addColorStop(0.7, "#0c254de0");
    g.addColorStop(1, "#071120");
    path(outline, g, "#75caff", 1.2);
    path(
      [
        [0, 0],
        [-41, -47],
        [-138, -117],
        [-123, -91],
        [-57, -26],
      ],
      "#0a1427",
      "#a9c4e5",
      0.8,
    );
    ctx.save();
    ctx.beginPath();
    outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    // Fine honeycomb structure is lit by the load-bearing wing spars.
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 12; col++) {
        const hx = -130 + col * 11 + (row % 2) * 5.5,
          hy = -113 + row * 9;
        path(
          Array.from({ length: 6 }, (_, i) => [
            hx + 6 * Math.cos((i * Math.PI) / 3),
            hy + 6 * Math.sin((i * Math.PI) / 3),
          ]),
          null,
          "#9ad5ff35",
          0.5,
        );
      }
    ctx.restore();
    circuit(
      [
        [-6, -2],
        [-42, -21],
        [-72, -53],
        [-94, -65],
        [-130, -110],
      ],
      "#57d6ff",
      1.6,
    );
    circuit(
      [
        [-22, -14],
        [-64, -39],
        [-94, -45],
        [-120, -66],
      ],
      "#b5f0ff",
      0.8,
    );
    line(
      [
        [-5, 2],
        [-59, -15],
        [-113, -62],
        [-136, -115],
      ],
      "#d6f4ff",
      1.2,
    );
    bolt(-2, 0, 5);
    ellipse(-2, 0, 3, 3, "#175bb5", "#9cffff", 1);
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
      length = Math.sqrt(dx * dx + dy * dy + 1200);
    const px = (dx / length) * radius * 0.45,
      py = (dy / length) * radius * 0.38;
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
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const target = { x: (mouse.x - x) / scale, y: (mouse.y - y) / scale };
    if (energy > 0) glow(-15, 0, 110, `rgba(55,151,255,${energy * 0.28})`);
    wing(t, false, sleep);
    // Carbon skeleton, articulated landing claws, and a telescoping tungsten needle.
    metal([
      [-80, -4],
      [-101, 4],
      [-108 - sting * 34, 11 + sting * 6],
      [-87, 17],
      [-70, 16],
    ]);
    path(
      [
        [-90, 7],
        [-108 - sting * 34, 11 + sting * 6],
        [-87, 11],
      ],
      "#eff9ff",
    );
    for (let i = 0; i < 3; i++) {
      const lx = -63 + i * 23,
        flex = Math.sin(t * 0.004 + i * 0.8) * 2 * (1 - sleep) + sleep * 6;
      const joints = [
        [lx, 16],
        [lx - 11, 29],
        [lx + 3 + flex, 42],
        [lx + 14 + flex, 36],
      ];
      line(joints, "#040b16", 7);
      line(joints, "#7189a9", 3);
      metal(
        [
          [lx - 7, 24],
          [lx - 16, 32],
          [lx - 2 + flex, 45],
          [lx + 7 + flex, 40],
        ],
        true,
      );
      path(
        [
          [lx + 4 + flex, 39],
          [lx + 23 + flex, 30],
          [lx + 16 + flex, 43],
        ],
        "#b7d1ee",
        "#2c517a",
        0.8,
      );
      circuit(
        [
          [lx - 12, 29],
          [lx + 1 + flex, 41],
        ],
        "#42bfff",
        0.8,
      );
      bolt(lx - 10, 29, 2.2);
    }
    // Elongated abdomen: blue enamel inserts framed by overlapping silver facets.
    metal(
      [
        [-86, 2],
        [-65, -25],
        [-24, -28],
        [2, -9],
        [5, 17],
        [-23, 36],
        [-62, 29],
      ],
      true,
    );
    path(
      [
        [-82, 3],
        [-62, -20],
        [-27, -22],
        [-3, -7],
        [-1, 15],
        [-26, 30],
        [-60, 23],
      ],
      "#07101f",
      "#547aa1",
      1,
    );
    path(
      [
        [-67, -16],
        [-42, -23],
        [-21, -13],
        [-24, 6],
        [-49, 17],
        [-72, 10],
      ],
      "#084fe5",
      "#389dff",
      1.3,
    );
    circuit(
      [
        [-63, -17],
        [-43, -20],
        [-22, -12],
      ],
      "#47d9ff",
      1.2,
    );
    metal(
      [
        [-39, -25],
        [-24, -27],
        [3, -8],
        [-5, 5],
        [-22, -6],
      ],
      true,
    );
    metal(
      [
        [-79, 13],
        [-51, 23],
        [-28, 12],
        [-15, 15],
        [-28, 32],
        [-61, 27],
      ],
      true,
    );
    path(
      [
        [-22, 6],
        [-3, -5],
        [2, 12],
        [-24, 29],
        [-31, 27],
      ],
      "#094ad1",
    );
    circuit(
      [
        [-21, 10],
        [-4, 0],
        [-1, 10],
        [-23, 26],
      ],
      "#39c4ff",
      1.4,
    );
    for (let i = 0; i < 4; i++)
      line(
        [
          [-59 + i * 5, 17],
          [-55 + i * 5, 22],
        ],
        "#10213b",
        1.8,
      );
    for (const [bx, by] of [
      [-68, -10],
      [-53, 25],
      [-18, 23],
    ])
      bolt(bx, by, 1.5);
    metal([
      [-25, -23],
      [-12, -32],
      [4, -20],
      [7, -4],
      [-13, 5],
      [-29, -9],
    ]);
    wing(t, true, sleep);
    metal(
      [
        [-9, -15],
        [5, -23],
        [18, -9],
        [14, 15],
        [-4, 22],
        [-16, 4],
      ],
      true,
    );
    ellipse(1, 1, 9, 11, "#06111f", "#728eac", 2);
    ellipse(1, 1, 5, 7, "#164990", "#60ceff", 1);
    // Predator-like three-quarter helmet: two independent recessed optical eyes.
    metal(
      [
        [0, -19],
        [12, -36],
        [32, -40],
        [53, -30],
        [65, -9],
        [59, 9],
        [41, 26],
        [17, 23],
        [3, 8],
      ],
      true,
    );
    path(
      [
        [3, -17],
        [15, -32],
        [31, -35],
        [24, -18],
        [7, -4],
      ],
      "#f4f8ff",
    );
    path(
      [
        [32, -36],
        [52, -27],
        [62, -9],
        [44, -13],
        [29, -23],
      ],
      "#a8bddb",
      "#e1efff",
      0.7,
    );
    path(
      [
        [7, -8],
        [25, -22],
        [45, -20],
        [59, -6],
        [50, 12],
        [27, 15],
        [10, 4],
      ],
      "#030c1b",
      "#5782ab",
      0.9,
    );
    // Angular eye sockets preserve visible pupils for full-screen gaze tracking.
    path(
      [
        [8, -9],
        [24, -18],
        [27, -3],
        [12, 5],
      ],
      "#137af4",
      "#a4edff",
      0.9,
    );
    path(
      [
        [31, -16],
        [51, -13],
        [56, -5],
        [40, 8],
        [30, 3],
      ],
      "#197ff6",
      "#b5f2ff",
      1,
    );
    sensor(19, -7, 6.2, t, sleep, target);
    sensor(43, -5, 7.4, t, sleep, target);
    path(
      [
        [6, -17],
        [19, -25],
        [30, -27],
        [26, -18],
        [11, -8],
      ],
      "#eff6ff",
      "#819cb9",
      0.8,
    );
    path(
      [
        [29, -27],
        [51, -23],
        [61, -12],
        [48, -15],
        [31, -18],
      ],
      "#edf4ff",
      "#708cad",
      0.8,
    );
    path(
      [
        [10, 9],
        [27, 12],
        [42, 7],
        [55, -1],
        [56, 9],
        [40, 23],
        [21, 21],
      ],
      "#b4cbe6",
      "#eaf5ff",
      0.9,
    );
    path(
      [
        [23, 16],
        [37, 15],
        [47, 9],
        [44, 19],
        [34, 25],
        [24, 23],
      ],
      "#09172b",
    );
    circuit(
      [
        [11, -25],
        [24, -32],
        [30, -28],
      ],
      "#4fceff",
      1.2,
    );
    circuit(
      [
        [50, 14],
        [56, 7],
        [58, 0],
      ],
      "#36bdff",
      1.1,
    );
    for (let i = 0; i < 3; i++)
      line(
        [
          [16 + i * 5, 17],
          [19 + i * 5, 13],
        ],
        "#213b5b",
        1.5,
      );
    // Curved mouthparts extend from the jaw, not from the abdomen or a chest emitter.
    const feeding =
      scene === 2
        ? ease(clamp((t - sceneStart - 1700) / 800)) *
          ease(clamp((11000 - (t - sceneStart)) / 700))
        : 0;
    ctx.save();
    ctx.translate(47, 19);
    ctx.rotate(feeding * 0.25);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(19, 9, 20, 21, 22, 31 + feeding * 12);
    ctx.strokeStyle = "#06101e";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(16, 6, 17, 20, 22, 31 + feeding * 12);
    ctx.strokeStyle = "#aac6e8";
    ctx.lineWidth = 3;
    ctx.stroke();
    circuit(
      [
        [17, 24 + feeding * 6],
        [22, 31 + feeding * 12],
      ],
      "#42cbff",
      0.9,
    );
    ctx.restore();
    // Segmented antennae gently lag the body's hover motion.
    for (const [ax, ay, bx, by] of [
      [15, -31, 8, -57],
      [37, -32, 49, -55],
    ]) {
      const sway = Math.sin(t * 0.003 + ax) * 1.5 * (1 - sleep);
      const joint = [
        [ax, ay],
        [ax + (bx - ax) * 0.3, ay - 14],
        [bx + sway, by],
      ];
      line(joint, "#030b15", 4.5);
      line(joint, "#95b0d3", 1.7);
      for (let i = 1; i < 4; i++) {
        const f = i / 4;
        bolt(mix(ax, bx + sway, f), mix(ay, by, f), 0.8);
      }
      ellipse(bx + sway, by, 4, 4, "#0d4aac", "#83eaff", 1.3);
      ellipse(bx + sway, by, 1.7, 1.7, "#e7ffff");
    }
    if (sleep > 0.15) {
      ctx.save();
      ctx.globalAlpha *= sleep * 0.68;
      ellipse(13, 5, 5, 2.8, "#f79bb6");
      ellipse(47, 10, 5.5, 3, "#f79bb6");
      ctx.restore();
    }
    if (energy > 0) {
      ctx.save();
      ctx.globalAlpha *= energy;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.strokeStyle = i ? "#b8ecff" : "#398cff";
        ctx.lineWidth = 1.4;
        ctx.ellipse(
          -16,
          0,
          95 + i * 10,
          30 + i * 6,
          t * 0.002 + i,
          0.2,
          Math.PI * 1.85,
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
      spread = (1 - deploy) * 64,
      action = combatPose(t);
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
    ctx.rotate(combat ? action.angle : -0.16);
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
    const recoil = action.firing ? Math.max(0, Math.sin(u * 25)) * 2 : 0;
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
    if (action.firing) {
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
    // The firing line starts at the rotating muzzle and terminates on the live target.
    if (combat) {
      if (action.alive) bug(action.target.x, action.target.y, 0.52);
      else
        impactShards(
          action.target.x,
          action.target.y,
          (action.phase - 0.7) / 0.3,
        );
      if (action.firing) {
        const p = (u * 17) % 1;
        line(
          [
            [
              mix(action.muzzle.x, action.target.x, p),
              mix(action.muzzle.y, action.target.y, p),
            ],
            [
              mix(action.muzzle.x, action.target.x, Math.min(1, p + 0.21)),
              mix(action.muzzle.y, action.target.y, Math.min(1, p + 0.21)),
            ],
          ],
          "#bcf1ff",
          1.8,
        );
      }
    }
    // The blade arc physically crosses the second bug before its impact effects start.
    line(
      [
        [-47, -6],
        [-66, 17],
        [action.wrist.x, action.wrist.y],
      ],
      "#081426",
      13,
    );
    line(
      [
        [-47, -6],
        [-66, 17],
        [action.wrist.x, action.wrist.y],
      ],
      "#a6c1de",
      4,
    );
    metal(
      [
        [-59, 10],
        [-66, 5],
        [-83, -1],
        [-87, 10],
        [-76, 20],
        [-64, 24],
      ],
      true,
    );
    bolt(-66, 17, 4);
    bolt(action.wrist.x, action.wrist.y, 4);
    ctx.save();
    ctx.translate(action.wrist.x, action.wrist.y);
    ctx.rotate(combat ? action.bladeAngle : 1.45);
    path(
      [
        [-7, -9],
        [10, -7],
        [80, 0],
        [27, 8],
        [8, 7],
      ],
      "#e8f7ff",
      "#679dca",
      1,
    );
    path(
      [
        [8, 1],
        [78, 0],
        [27, 8],
      ],
      "#6e92b6",
    );
    circuit(
      [
        [9, -5],
        [78, 0],
      ],
      "#8eeaff",
      1.5,
    );
    ctx.restore();
    if (combat) {
      if (action.bladeAlive)
        bug(action.bladeTarget.x, action.bladeTarget.y, 0.55);
      else
        impactShards(
          action.bladeTarget.x,
          action.bladeTarget.y,
          (action.bladePhase - 0.52) / 0.48,
        );
      if (action.bladePhase > 0.35 && action.bladePhase < 0.68) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "#b7eaff80";
        ctx.lineWidth = 7;
        ctx.arc(
          action.wrist.x,
          action.wrist.y,
          76,
          action.bladeAngle - 0.35,
          action.bladeAngle,
        );
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function impactShards(x, y, p) {
    ctx.save();
    ctx.globalAlpha *= 1 - clamp(p);
    glow(x, y, 14 * (1 - clamp(p)), "#b4eaff90");
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399,
        r = clamp(p) * 65;
      path(
        [
          [x + Math.cos(a) * r, y + Math.sin(a) * r],
          [x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9)],
          [x + Math.cos(a + 0.2) * (r + 5), y + Math.sin(a + 0.2) * (r + 5)],
        ],
        i % 2 ? "#c1e9ff" : "#203e65",
      );
    }
    ctx.restore();
  }
  function sleep(t) {
    const u = t / 1000;
    if (u > 1.5 && u < 12) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const p = (u * 0.32 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(p * Math.PI) * ease(clamp((u - 1.5) / 1));
        text(
          "Z",
          center.x + 51 + p * 32,
          center.y - 12 - p * 61,
          11 + p * 9,
          "#83a7d1",
        );
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(center.x - 7, center.y + 58);
    // A low maintenance cradle under the sleeping bee.
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
      const feeding =
        ease(clamp((t - 1700) / 800)) * ease(clamp((11000 - t) / 700));
      const mouth = mouthPoint(currentPose, feeding),
        bx = mouth.x + center.x - cx,
        by = mouth.y + center.y - cy;
      line(
        [
          [0, -8],
          [bx, by],
        ],
        "#70b8ff40",
        6,
      );
      circuit(
        [
          [0, -8],
          [bx, by],
        ],
        "#a8ddff",
        0.8,
      );
      for (let i = 0; i < 6; i++) {
        const p = (u * 0.6 + i / 6) % 1,
          x = bx * p,
          y = mix(-8, by, p);
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
      hit = 1.05;
    if (u >= hit) {
      const p = clamp((u - hit) / 0.24),
        fade = 1 - ease(clamp((u - 2.8) / 1.5)),
        // Freeze the fracture at the stinger's actual contact point. It must
        // not drift with the recovering body or appear behind the opposite end.
        impact = scenePose(3, hit * 1000, sceneStart + hit * 1000, sceneOrigin),
        tipX = (-108 - impact.sting * 34) * impact.scale,
        tipY = (11 + impact.sting * 6) * impact.scale,
        x =
          center.x +
          impact.x +
          tipX * Math.cos(impact.rotation) -
          tipY * Math.sin(impact.rotation),
        y =
          center.y +
          impact.y +
          tipX * Math.sin(impact.rotation) +
          tipY * Math.cos(impact.rotation);
      ctx.save();
      ctx.globalAlpha *= fade;
      ctx.beginPath();
      ctx.arc(x, y, CRACK_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      glow(x, y, 45 * (1 - p) + 8, "#e5f7ffdd");
      if (u - hit < 0.23) {
        ctx.save();
        ctx.globalAlpha *= 1 - p;
        ctx.beginPath();
        ctx.strokeStyle = "#d5f7ff";
        ctx.lineWidth = 7 * (1 - p) + 0.5;
        ctx.arc(x, y, 12 + p * 75, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
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
    bee(-31 * beeScale, 6 * beeScale, beeScale, now, {
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
      direction === "right" ? ["← 向左飞行", "left"] : ["向右飞行 →", "right"],
      ...SCENES.map((s, i) => [`播放待机动画 ${i + 1}`, `scene${i}`]),
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
      if (!nativeDrag && !globalCursor) mouse = { x: e.clientX, y: e.clientY };
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
      if (
        command === "cursor" &&
        Number.isFinite(data.x) &&
        Number.isFinite(data.y)
      ) {
        globalCursor = true;
        mouse = { x: data.x, y: data.y };
      }
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
      cursor: { ...mouse },
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
