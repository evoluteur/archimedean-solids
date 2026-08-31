/*!
 * Archimedean Solids - viewer, nets, and UI
 * https://github.com/evoluteur/archimedean-solids
 * (c) 2026 Olivier Giulieri - MIT license
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = 100; // viewBox is "-50 -50 100 100"
const PAD = 0.88;
const CAMERA = 3.6; // eye distance, with the vertices on the unit sphere
const LIGHT = [0.35, 0.62, 0.7];

// one colour per kind of polygon: the whole point of these solids is that
// more than one kind meets at every vertex
const FACE_COLOURS = {
  3: "#ffb454",
  4: "#e2604f",
  5: "#4bb3a0",
  6: "#4f86c6",
  8: "#9b7fd4",
  10: "#d1749a",
};

const PALETTES = [
  { id: "faces", name: "By face", stroke: null, guide: "#ffd77a" },
  { id: "gold", name: "Gold", stroke: "#d4af37", guide: "#ffd77a" },
  { id: "moon", name: "Moonlight", stroke: "#eef1ff", guide: "#aab4e8" },
  { id: "jade", name: "Jade", stroke: "#7fd6b5", guide: "#5fae95" },
  { id: "rose", name: "Rose Quartz", stroke: "#f3a7bd", guide: "#c98aa5" },
  { id: "ink", name: "Ink", stroke: "#1b1b2f", guide: "#7a6a3a" },
];

const BACKGROUNDS = [
  { id: "midnight", name: "Midnight", fill: "#12122a" },
  { id: "void", name: "Void", fill: "#000000" },
  { id: "parchment", name: "Parchment", fill: "#f4ecd8" },
  { id: "none", name: "Transparent", fill: null },
];

const byId = (list, id) => list.find((x) => x.id === id) || list[0];
const n2 = (n) => Math.round(n * 100) / 100;

const svgEl = (tag, attrs) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) {
    if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
  }
  return node;
};

/* --------------------------------------------------------------- geometry */

// the hull is O(n^3) and the relaxation takes a moment: build each solid once
const cache = {};
const solidData = (id) => {
  if (!cache[id]) {
    const s = build(id);
    const facesOfEdge = {};
    s.faces.forEach((f, fi) => {
      f.forEach((a, i) => {
        const b = f[(i + 1) % f.length];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        (facesOfEdge[key] = facesOfEdge[key] || []).push(fi);
      });
    });
    // the true polar reciprocal pokes out through the faces; draw a copy
    // scaled to sit just inside, which is the same shape at a smaller size
    const inradius = Math.min(
      ...s.faces.map((f) => dot(normalOf(s.verts, f), s.verts[f[0]]))
    );
    const reach = Math.max(...s.dualVerts.map(len));
    const k = inradius / reach;
    cache[id] = {
      ...s,
      facesOfEdge,
      dualFaces: hullFaces(s.dualVerts),
      dualInside: s.dualVerts.map((v) => mul(v, k)),
    };
  }
  return cache[id];
};

const spin = (p, yaw, pitch) => {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const x = p[0] * cy - p[2] * sy;
  const z1 = p[0] * sy + p[2] * cy;
  return [x, p[1] * cx - z1 * sx, p[1] * sx + z1 * cx];
};

const projectAll = (pts, yaw, pitch, scale) =>
  pts.map((p) => {
    const r = spin(p, yaw, pitch);
    const f = CAMERA / (CAMERA - r[2]);
    return { x: r[0] * f * scale, y: -r[1] * f * scale, z: r[2], f };
  });

/* ---------------------------------------------------------------- drawing */

const colourOf = (pal, face, i, total) =>
  pal.id === "faces" ? FACE_COLOURS[face.length] || "#9aa4b2" : pal.stroke;

const buildSvg = (id, o) => {
  const pal = byId(PALETTES, o.palette);
  const bg = byId(BACKGROUNDS, o.bg);
  const s = solidData(id);
  // the vertices sit on a sphere of radius 1 only for the seeds; scale to fit
  const reach = Math.max(...s.verts.map(len));
  const scale = ((VIEW / 2) * PAD) / reach;
  const yaw = (o.yaw * Math.PI) / 180;
  const pitch = (o.pitch * Math.PI) / 180;
  const p2 = projectAll(s.verts, yaw, pitch, scale);

  const svg = svgEl("svg", { viewBox: `${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}` });
  if (bg.fill) {
    svg.appendChild(
      svgEl("rect", { x: -VIEW / 2, y: -VIEW / 2, width: VIEW, height: VIEW, fill: bg.fill })
    );
  }
  const g = svgEl("g", {
    fill: "none",
    "stroke-width": o.stroke,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  svg.appendChild(g);

  const facing = s.faces.map((f) => {
    const n = spin(normalOf(s.verts, f), yaw, pitch);
    const c = spin(mean(f.map((i) => s.verts[i])), yaw, pitch);
    return dot(n, [0, 0, CAMERA - c[2]]) > 0;
  });

  const pointsOf = (face) => face.map((i) => `${n2(p2[i].x)},${n2(p2[i].y)}`).join(" ");

  if (o.mode === "shaded") {
    const order = s.faces
      .map((f, i) => ({ i, z: mean(f.map((v) => spin(s.verts[v], yaw, pitch)))[2] }))
      .sort((a, b) => a.z - b.z);
    order.forEach(({ i }) => {
      if (!facing[i]) return; // convex, so a back face is never seen
      const f = s.faces[i];
      const n = spin(normalOf(s.verts, f), yaw, pitch);
      const light = Math.max(0, dot(n, unit(LIGHT)));
      const colour = colourOf(pal, f, i, s.faces.length);
      g.appendChild(
        svgEl("polygon", {
          points: pointsOf(f),
          fill: colour,
          "fill-opacity": n2(0.24 + 0.68 * light),
          stroke: colour,
          "stroke-opacity": 0.95,
        })
      );
    });
  } else {
    Object.keys(s.facesOfEdge).forEach((key) => {
      const [a, b] = key.split("-").map(Number);
      const hidden = s.facesOfEdge[key].every((fi) => !facing[fi]);
      g.appendChild(
        svgEl("line", {
          x1: n2(p2[a].x),
          y1: n2(p2[a].y),
          x2: n2(p2[b].x),
          y2: n2(p2[b].y),
          stroke: pal.stroke || "#8fd3ff",
          "stroke-opacity": hidden ? 0.22 : 1,
          "stroke-dasharray": hidden ? "1.4 1.8" : null,
        })
      );
    });
  }

  if (o.dual) {
    const dp = projectAll(s.dualInside, yaw, pitch, scale);
    const drawn = new Set();
    s.dualFaces.forEach((f) => {
      f.forEach((a, i) => {
        const b = f[(i + 1) % f.length];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (drawn.has(key)) return;
        drawn.add(key);
        g.appendChild(
          svgEl("line", {
            x1: n2(dp[a].x),
            y1: n2(dp[a].y),
            x2: n2(dp[b].x),
            y2: n2(dp[b].y),
            stroke: pal.guide,
            "stroke-opacity": 0.75,
            "stroke-width": n2(o.stroke * 0.7),
          })
        );
      });
    });
  }

  if (o.vertices) {
    p2.forEach((p) => {
      g.appendChild(
        svgEl("circle", {
          cx: n2(p.x),
          cy: n2(p.y),
          r: n2(o.stroke * 1.5 * p.f),
          fill: pal.stroke || "#ffd77a",
          stroke: "none",
        })
      );
    });
  }
  return svg;
};

/* ----------------------------------------------------------------- export */

const svgMarkup = (node, size = 1024) => {
  const clone = node.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", size);
  clone.setAttribute("height", size);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
};

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const savePng = (svgNode, filename, size = 2048) => {
  const url = URL.createObjectURL(
    new Blob([svgMarkup(svgNode, size)], { type: "image/svg+xml;charset=utf-8" })
  );
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d").drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => saveBlob(blob, filename));
  };
  img.src = url;
};

/* -------------------------------------------------------------- the nets */

const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

// a trapezoid glue tab hanging off the edge A-B, away from "inside"
const tabPolygon = (A, B, inside) => {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const l = Math.hypot(dx, dy);
  const dir = [dx / l, dy / l];
  let out = [-dir[1], dir[0]];
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  if (
    (mid[0] + out[0] - inside[0]) ** 2 + (mid[1] + out[1] - inside[1]) ** 2 <
    (mid[0] - inside[0]) ** 2 + (mid[1] - inside[1]) ** 2
  ) {
    out = [dir[1], -dir[0]];
  }
  const h = l * 0.22;
  const inset = l * 0.2;
  return [
    A,
    [A[0] + dir[0] * inset + out[0] * h, A[1] + dir[1] * inset + out[1] * h],
    [B[0] - dir[0] * inset + out[0] * h, B[1] - dir[1] * inset + out[1] * h],
    B,
  ];
};

const netSvg = (id, o = {}) => {
  const s = solidData(id);
  const polys = unfold(s.verts, s.faces, s.net.root, s.net.seed);
  const pal = byId(PALETTES, o.palette || "gold");
  const at = (fi, v) => polys[fi][s.faces[fi].indexOf(v)];

  const folds = [];
  const cuts = [];
  const tabs = [];
  Object.keys(s.facesOfEdge).forEach((key) => {
    const [a, b] = key.split("-").map(Number);
    const [fi, gi] = s.facesOfEdge[key];
    const A1 = at(fi, a);
    const B1 = at(fi, b);
    const A2 = at(gi, a);
    const B2 = at(gi, b);
    if (same(A1, A2) && same(B1, B2)) {
      folds.push([A1, B1]);
    } else {
      cuts.push([A1, B1], [A2, B2]);
      const centre = polys[fi].reduce(
        (m, p, i, arr) => [m[0] + p[0] / arr.length, m[1] + p[1] / arr.length],
        [0, 0]
      );
      tabs.push(tabPolygon(A1, B1, centre));
    }
  });

  const all = polys.flat().concat(tabs.flat());
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const pad = Math.max(w, h) * 0.04;
  const svg = svgEl("svg", {
    viewBox: `${n2(minX - pad)} ${n2(minY - pad)} ${n2(w + 2 * pad)} ${n2(h + 2 * pad)}`,
  });
  const sw = Math.max(w, h) / 260;
  const pts = (poly) => poly.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");

  const g = svgEl("g", {
    fill: "none",
    "stroke-width": n2(sw),
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
  });
  tabs.forEach((t) =>
    g.appendChild(
      svgEl("polygon", {
        points: pts(t),
        stroke: pal.stroke || "#d4af37",
        "stroke-opacity": 0.55,
        fill: pal.stroke || "#d4af37",
        "fill-opacity": 0.05,
      })
    )
  );
  polys.forEach((p, i) =>
    g.appendChild(
      svgEl("polygon", {
        points: pts(p),
        fill: o.colour === false ? pal.stroke || "#d4af37" : FACE_COLOURS[s.faces[i].length],
        "fill-opacity": o.colour === false ? 0.07 : 0.3,
        stroke: "none",
      })
    )
  );
  folds.forEach(([a, b]) =>
    g.appendChild(
      svgEl("line", {
        x1: n2(a[0]),
        y1: n2(a[1]),
        x2: n2(b[0]),
        y2: n2(b[1]),
        stroke: pal.stroke || "#d4af37",
        "stroke-opacity": 0.45,
        "stroke-dasharray": `${n2(sw * 3)} ${n2(sw * 3)}`,
      })
    )
  );
  cuts.forEach(([a, b]) =>
    g.appendChild(
      svgEl("line", {
        x1: n2(a[0]),
        y1: n2(a[1]),
        x2: n2(b[0]),
        y2: n2(b[1]),
        stroke: pal.stroke || "#d4af37",
      })
    )
  );
  svg.appendChild(g);
  return svg;
};

/* ------------------------------------------------------------------- app */

const $ = (id) => document.getElementById(id);

const state = {
  id: "truncated-tetrahedron",
  yaw: 25,
  pitch: -20,
  mode: "shaded",
  dual: false,
  vertices: false,
  spinning: true,
  palette: "faces",
  bg: "midnight",
  stroke: 0.5,
};

const render = () => {
  $("stage").replaceChildren(buildSvg(state.id, state));
};

const fact = (label, value) => {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  const td = document.createElement("td");
  th.textContent = label;
  td.textContent = value;
  tr.append(th, td);
  return tr;
};

const facesSentence = (counts) =>
  Object.keys(counts)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => `${counts[n]} ${POLYGON[n]}`)
    .join(", ");

const dihedralSentence = (dihedrals) =>
  Object.keys(dihedrals)
    .map((k) => {
      const [a, b] = k.split("-").map(Number);
      return `${dihedrals[k].toFixed(2)}° (${POLYGON[a].slice(0, -1)}–${POLYGON[b].slice(0, -1)})`;
    })
    .join("  ·  ");

const legend = (counts) => {
  const box = $("legend");
  if (!box) return;
  box.replaceChildren(
    ...Object.keys(counts)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => {
        const span = document.createElement("span");
        const dot = document.createElement("i");
        dot.style.background = FACE_COLOURS[n];
        span.append(dot, document.createTextNode(`${counts[n]} ${POLYGON[n]}`));
        return span;
      })
  );
};

const showSolid = (id) => {
  const s = solidData(id);
  state.id = id;
  $("pname").textContent = s.name;
  $("tagline").textContent = `${s.config} · dual: ${s.dual}`;
  $("blurb").textContent = s.blurb;
  document.title = `${s.name} - Archimedean Solids`;
  const st = s.stats;
  $("facts").replaceChildren(
    fact("Faces", `${st.F}: ${facesSentence(st.counts)}`),
    fact("Vertices", st.V),
    fact("Edges", st.E),
    fact("Vertex configuration", s.config),
    fact("Made from", s.recipe),
    fact("Dihedral angles", dihedralSentence(st.dihedrals)),
    fact("Symmetry", s.symmetry),
    fact("Dual (Catalan)", s.dual),
    fact("Circumradius / edge", st.circumradius.toFixed(4)),
    fact("Midradius / edge", st.midradius.toFixed(4)),
    fact("Surface area / edge²", st.area.toFixed(4)),
    fact("Volume / edge³", st.volume.toFixed(4)),
    fact("Sphericity", st.sphericity.toFixed(4))
  );
  const euler = fact("Euler characteristic", `${st.V} − ${st.E} + ${st.F} = 2`);
  euler.className = "euler";
  $("facts").appendChild(euler);
  legend(st.counts);
  document.querySelectorAll(".nav > a").forEach((a) => a.classList.toggle("on", a.dataset.id === id));
  render();
};

// four of the thirteen are relaxed into shape, which takes a moment
const setSolid = (id, skipHash) => {
  if (!skipHash) location.hash = id;
  const solid = solidById(id);
  if (cache[id] || solid.operation !== "relax") return showSolid(id);
  $("pname").textContent = solid.name;
  $("tagline").textContent = "relaxing the shape…";
  $("blurb").textContent = solid.blurb;
  setTimeout(() => showSolid(id), 30);
};

const onSelect = (input, key) => {
  state[key] = input.value;
  render();
};
const onCheck = (input, key) => {
  state[key] = input.checked;
  render();
};
const onStroke = (input) => {
  state.stroke = +input.value;
  $("strokeVal").textContent = (+input.value).toFixed(1);
  render();
};

const downloadSvg = () =>
  saveBlob(
    new Blob([svgMarkup($("stage").firstElementChild)], { type: "image/svg+xml" }),
    `archimedean-${state.id}.svg`
  );

const downloadPng = () => savePng($("stage").firstElementChild, `archimedean-${state.id}.png`);

const dragging = { on: false, x: 0, y: 0 };
const startDrag = (e) => {
  dragging.on = true;
  dragging.x = e.clientX;
  dragging.y = e.clientY;
  $("stage").classList.add("dragging");
  $("stage").setPointerCapture(e.pointerId);
};
const moveDrag = (e) => {
  if (!dragging.on) return;
  state.yaw += (e.clientX - dragging.x) * 0.55;
  state.pitch = Math.max(-85, Math.min(85, state.pitch - (e.clientY - dragging.y) * 0.55));
  dragging.x = e.clientX;
  dragging.y = e.clientY;
  render();
};
const endDrag = () => {
  dragging.on = false;
  $("stage").classList.remove("dragging");
};

const fillSelect = (id, list) => {
  $(id).replaceChildren(...list.map((x) => new Option(x.name, x.id, false, x.id === state[id])));
};

let last = 0;
const frame = (now) => {
  if (state.spinning && !dragging.on && last) {
    state.yaw += ((now - last) / 1000) * 20;
    render();
  }
  last = now;
  requestAnimationFrame(frame);
};

const init = () => {
  document.querySelector(".nav").replaceChildren(
    ...SOLIDS.map((s) => {
      const a = document.createElement("a");
      a.href = `#${s.id}`;
      a.dataset.id = s.id;
      a.textContent = s.name.replace(/^Truncated /, "Trunc. ");
      a.title = s.name;
      return a;
    })
  );
  fillSelect("palette", PALETTES);
  fillSelect("bg", BACKGROUNDS);
  const stage = $("stage");
  stage.addEventListener("pointerdown", startDrag);
  stage.addEventListener("pointermove", moveDrag);
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  addEventListener("hashchange", () => setSolid(location.hash.slice(1), true));
  setSolid(location.hash.slice(1) || SOLIDS[0].id, true);
  requestAnimationFrame(frame);
};

const initNets = () => {
  const holder = document.querySelector(".nets");
  holder.replaceChildren();
  // build them one at a time so the page appears before the big ones are ready
  const queue = SOLIDS.slice();
  const step = () => {
    const s = queue.shift();
    if (!s) return;
    const d = solidData(s.id);
    const card = document.createElement("div");
    card.className = "net";
    const h2 = document.createElement("h2");
    h2.textContent = s.name;
    const p = document.createElement("p");
    p.textContent = `${facesSentence(d.stats.counts)} · ${d.stats.F - 1} fold lines`;
    const svg = netSvg(s.id);
    const buttons = document.createElement("div");
    buttons.className = "buttons";
    const btn = document.createElement("button");
    btn.textContent = "Save SVG";
    btn.onclick = () =>
      saveBlob(
        new Blob([svgMarkup(svg)], { type: "image/svg+xml" }),
        `archimedean-net-${s.id}.svg`
      );
    buttons.appendChild(btn);
    card.append(h2, p, svg, buttons);
    holder.appendChild(card);
    setTimeout(step, 0);
  };
  step();
};
