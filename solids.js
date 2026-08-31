/*!
 * Archimedean Solids - geometry engine
 * https://github.com/evoluteur/archimedean-solids
 * (c) 2026 Olivier Giulieri - MIT license
 *
 * Nothing is written down but the five Platonic seeds. Each of the thirteen
 * solids is made from one of them by truncating, rectifying, expanding or
 * snubbing, and the four that those operations only approximate are relaxed
 * until every edge touches one sphere - the canonical form, which is unique,
 * so the relaxation can only land on the Archimedean solid itself.
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS = 1e-6;

/* ------------------------------------------------------------ vector math */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / len(a));
const mean = (pts) =>
  mul(
    pts.reduce((s, p) => add(s, p), [0, 0, 0]),
    1 / pts.length
  );

const dedupe = (pts, eps = 1e-7) => {
  const out = [];
  pts.forEach((p) => {
    if (!out.some((q) => len(sub(p, q)) < eps)) out.push(p);
  });
  return out;
};

/* -------------------------------------------------------- the five seeds */

const cyclicSigns = (a, b, c) => {
  const out = [];
  [
    [a, b, c],
    [c, a, b],
    [b, c, a],
  ].forEach(([x, y, z]) => {
    const signs = (v) => (v === 0 ? [0] : [v, -v]);
    signs(x).forEach((sx) =>
      signs(y).forEach((sy) => signs(z).forEach((sz) => out.push([sx, sy, sz])))
    );
  });
  return out;
};

const cubeCorners = () => {
  const out = [];
  [-1, 1].forEach((x) =>
    [-1, 1].forEach((y) => [-1, 1].forEach((z) => out.push([x, y, z])))
  );
  return out;
};

const SEEDS = {
  tetrahedron: () => [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ],
  cube: () => cubeCorners(),
  octahedron: () => cyclicSigns(1, 0, 0),
  dodecahedron: () => cubeCorners().concat(cyclicSigns(0, 1 / PHI, PHI)),
  icosahedron: () => cyclicSigns(0, 1, PHI),
};

/* ---------------------------------------------------------- convex hull */

// Every plane through three vertices that leaves all the others on one side
// is a face. O(n^3), which at 120 vertices is still a fraction of a second,
// and it means the same code builds the solids and their duals.
const hullFaces = (verts) => {
  const faces = [];
  const planes = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const normal = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
        if (len(normal) < EPS) continue;
        let nrm = unit(normal);
        let d = dot(nrm, verts[i]);
        if (d < 0) {
          nrm = mul(nrm, -1);
          d = -d;
        }
        if (d < EPS) continue; // a plane through the centre is not a face
        if (verts.some((v) => dot(nrm, v) > d + EPS)) continue;
        if (planes.some((p) => Math.abs(p.d - d) < EPS && len(sub(p.n, nrm)) < EPS))
          continue;
        planes.push({ n: nrm, d });
        const idx = [];
        verts.forEach((v, vi) => {
          if (Math.abs(dot(nrm, v) - d) < EPS) idx.push(vi);
        });
        // wind them counter-clockwise as seen from outside
        const c = mean(idx.map((vi) => verts[vi]));
        const u = unit(sub(verts[idx[0]], c));
        const w = cross(nrm, u);
        idx.sort((p, q) => {
          const ap = sub(verts[p], c);
          const aq = sub(verts[q], c);
          return (
            Math.atan2(dot(ap, w), dot(ap, u)) - Math.atan2(dot(aq, w), dot(aq, u))
          );
        });
        faces.push(idx);
      }
    }
  }
  return faces;
};

const edgesOf = (faces) => {
  const seen = new Set();
  const out = [];
  faces.forEach((f) => {
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push([a, b]);
      }
    });
  });
  return out;
};

const normalOf = (verts, face) =>
  unit(cross(sub(verts[face[1]], verts[face[0]]), sub(verts[face[2]], verts[face[0]])));

const seedOf = (id) => {
  const verts = dedupe(SEEDS[id]()).map(unit);
  return { verts, faces: hullFaces(verts) };
};

const edgeLength = ({ verts, faces }) => {
  const [a, b] = edgesOf(faces)[0];
  return len(sub(verts[a], verts[b]));
};

/* ------------------------------------------------------------- operators */

// truncate: cut every vertex off at a fraction t along each edge that meets it
const truncate = ({ verts, faces }, t) => {
  const pts = [];
  edgesOf(faces).forEach(([a, b]) => {
    pts.push(add(verts[a], mul(sub(verts[b], verts[a]), t)));
    pts.push(add(verts[b], mul(sub(verts[a], verts[b]), t)));
  });
  return dedupe(pts);
};

// the fraction that leaves the truncated face regular, for a seed with p-gons
const regularCut = (p) => {
  const interior = (Math.PI * (p - 2)) / p;
  return 1 / (2 + 2 * Math.sin(interior / 2));
};

// rectify: keep only the edge midpoints
const rectify = ({ verts, faces }) =>
  dedupe(edgesOf(faces).map(([a, b]) => mean([verts[a], verts[b]])));

// expand: slide every face out along its own normal, keeping its size
const expand = ({ verts, faces }, d) => {
  const pts = [];
  faces.forEach((f) => {
    const n = normalOf(verts, f);
    f.forEach((i) => pts.push(add(verts[i], mul(n, d))));
  });
  return dedupe(pts);
};

// snub: slide every face out and twist it about its own normal
const snub = ({ verts, faces }, d, angle) => {
  const pts = [];
  const c1 = Math.cos(angle);
  const s1 = Math.sin(angle);
  faces.forEach((f) => {
    const n = normalOf(verts, f);
    const c = mean(f.map((i) => verts[i]));
    f.forEach((i) => {
      const r = sub(verts[i], c);
      const rot = add(
        add(mul(r, c1), mul(cross(n, r), s1)),
        mul(n, dot(n, r) * (1 - c1))
      );
      pts.push(add(add(c, rot), mul(n, d)));
    });
  });
  return dedupe(pts);
};

/* ------------------------------------------------------ canonicalisation */

// Nudge the vertices until every edge just touches one sphere and every face
// is flat. A polyhedron has exactly one such form, so wherever the relaxation
// starts, it can only end at the Archimedean solid.
const canonicalise = (verts, faces, tolerance = 1e-9, maxRounds = 20000) => {
  let V = verts.map((p) => p.slice());
  const edges = edgesOf(faces);
  for (let r = 0; r < maxRounds; r++) {
    // 1. pull the closest point of every edge onto the unit sphere
    const move = V.map(() => [0, 0, 0]);
    const hits = V.map(() => 0);
    edges.forEach(([a, b]) => {
      const A = V[a];
      const d = sub(V[b], A);
      const t = Math.max(0, Math.min(1, -dot(A, d) / dot(d, d)));
      const closest = add(A, mul(d, t));
      const l = len(closest) || 1;
      const push = mul(closest, (1 - l) / l);
      move[a] = add(move[a], push);
      move[b] = add(move[b], push);
      hits[a]++;
      hits[b]++;
    });
    V = V.map((p, i) => (hits[i] ? add(p, mul(move[i], 0.5 / hits[i])) : p));

    // 2. drop every face onto its own best-fit plane
    const flat = V.map(() => [0, 0, 0]);
    const seen = V.map(() => 0);
    faces.forEach((f) => {
      const c = mean(f.map((i) => V[i]));
      let n = [0, 0, 0];
      f.forEach((vi, k) => {
        n = add(n, cross(sub(V[vi], c), sub(V[f[(k + 1) % f.length]], c)));
      });
      n = unit(n);
      f.forEach((vi) => {
        flat[vi] = add(flat[vi], mul(n, -dot(sub(V[vi], c), n)));
        seen[vi]++;
      });
    });
    V = V.map((p, i) => (seen[i] ? add(p, mul(flat[i], 1 / seen[i])) : p));

    // 3. recentre
    const c = mean(V);
    V = V.map((p) => sub(p, c));

    if (r % 100 === 99) {
      const l = edges.map(([a, b]) => len(sub(V[a], V[b])));
      const hi = Math.max(...l);
      if ((hi - Math.min(...l)) / hi < tolerance) break;
    }
  }
  return V;
};

/* ------------------------------------------------------------ the duals */

// The Catalan solid is the polar reciprocal about the midsphere: every face
// of the Archimedean solid becomes a vertex, at the point where the sphere
// reflects its plane.
const midradiusOf = (verts, faces) => {
  const l = edgesOf(faces).map(([a, b]) => {
    const A = verts[a];
    const d = sub(verts[b], A);
    return len(add(A, mul(d, -dot(A, d) / dot(d, d))));
  });
  return l.reduce((s, x) => s + x, 0) / l.length;
};

const polarDual = (verts, faces, radius) =>
  faces.map((f) => {
    const n = normalOf(verts, f);
    return mul(n, (radius * radius) / dot(n, verts[f[0]]));
  });

/* ------------------------------------------------------------ unfolding */

const flatten = (verts, face) => {
  const pts = face.map((i) => verts[i]);
  const nrm = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  const u = unit(sub(pts[1], pts[0]));
  const w = cross(nrm, u);
  return pts.map((p) => [dot(sub(p, pts[0]), u), dot(sub(p, pts[0]), w)]);
};

const side = (a, b, p) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

// a tiny generator, so a net is reproduced exactly from its seed number
const seededRandom = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const faceAdjacency = (faces) => {
  const adjacency = faces.map(() => []);
  const byEdge = new Map();
  faces.forEach((f, fi) => {
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!byEdge.has(key)) byEdge.set(key, []);
      byEdge.get(key).push({ fi, a, b });
    });
  });
  byEdge.forEach((list) => {
    if (list.length !== 2) return;
    const [x, y] = list;
    adjacency[x.fi].push({ gi: y.fi, a: x.a, b: x.b });
    adjacency[y.fi].push({ gi: x.fi, a: x.a, b: x.b });
  });
  return adjacency;
};

// Walk a spanning tree of the face-adjacency graph, hinging each face into the
// plane about the edge it shares with its parent. The seed reshuffles the
// visit order, which is how a net that folds without overlapping is found.
const unfold = (verts, faces, root = 0, seed = 1) => {
  const adjacency = faceAdjacency(faces);
  const placed = new Array(faces.length).fill(null);
  const local = faces.map((f) => flatten(verts, f));
  placed[root] = local[root].slice();
  const random = seededRandom(seed);

  const queue = [root];
  while (queue.length) {
    const fi = queue.shift();
    const neighbours = adjacency[fi]
      .map((n) => ({ n, k: random() }))
      .sort((x, y) => x.k - y.k)
      .map((x) => x.n);
    neighbours.forEach(({ gi, a, b }) => {
      if (placed[gi]) return;
      const A = placed[fi][faces[fi].indexOf(a)];
      const B = placed[fi][faces[fi].indexOf(b)];
      const la = local[gi][faces[gi].indexOf(a)];
      const lb = local[gi][faces[gi].indexOf(b)];
      const ang =
        Math.atan2(B[1] - A[1], B[0] - A[0]) - Math.atan2(lb[1] - la[1], lb[0] - la[0]);
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      let pts = local[gi].map((p) => {
        const x = p[0] - la[0];
        const y = p[1] - la[1];
        return [A[0] + x * cosA - y * sinA, A[1] + x * sinA + y * cosA];
      });
      // the child must land on the far side of the hinge from its parent
      const parentAway = placed[fi].find((p) => Math.abs(side(A, B, p)) > 1e-9);
      const childAway = pts.find((p) => Math.abs(side(A, B, p)) > 1e-9);
      if (side(A, B, parentAway) * side(A, B, childAway) > 0) {
        pts = pts.map((p) => {
          const dx = B[0] - A[0];
          const dy = B[1] - A[1];
          const t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / (dx * dx + dy * dy);
          return [2 * (A[0] + t * dx) - p[0], 2 * (A[1] + t * dy) - p[1]];
        });
      }
      placed[gi] = pts;
      queue.push(gi);
    });
  }
  return placed;
};

/* --------------------------------------------------- the thirteen solids */

const POLYGON = {
  3: "triangles",
  4: "squares",
  5: "pentagons",
  6: "hexagons",
  8: "octagons",
  10: "decagons",
};

// "from" is the recipe. "net" is the unfolding that no face overlaps in,
// found by searching roots and visit orders once, offline.
const SOLIDS = [
  {
    id: "truncated-tetrahedron",
    name: "Truncated Tetrahedron",
    config: "3.6.6",
    seed: "tetrahedron",
    operation: "truncate",
    recipe: "the tetrahedron, with each corner cut a third of the way along every edge",
    dual: "Triakis tetrahedron",
    symmetry: "Tetrahedral (Td), order 24",
    net: { root: 0, seed: 1 },
    blurb:
      "The first and simplest of the thirteen: cut the four corners off a tetrahedron at exactly one third of each edge and the four triangular faces open into hexagons, while the corners leave four new triangles behind.",
  },
  {
    id: "cuboctahedron",
    name: "Cuboctahedron",
    config: "3.4.3.4",
    seed: "cube",
    operation: "rectify",
    recipe: "the midpoints of the cube's twelve edges",
    dual: "Rhombic dodecahedron",
    symmetry: "Octahedral (Oh), order 48",
    net: { root: 0, seed: 1 },
    blurb:
      "Halfway between the cube and the octahedron, and the only Archimedean solid whose vertices lie on a sphere at the same distance as its edge length. Its twelve vertices are how oranges stack: it is the shape of the closest packing of equal spheres.",
  },
  {
    id: "truncated-cube",
    name: "Truncated Cube",
    config: "3.8.8",
    seed: "cube",
    operation: "truncate",
    recipe: "the cube, with each corner cut back by (2 − √2) / 2 of every edge",
    dual: "Triakis octahedron",
    symmetry: "Octahedral (Oh), order 48",
    net: { root: 0, seed: 1 },
    blurb:
      "Six octagons and eight triangles. The cut is deeper than a third here: the three edges at a cube corner meet at right angles, so the corner has to be taken back further before the octagon comes out regular.",
  },
  {
    id: "truncated-octahedron",
    name: "Truncated Octahedron",
    config: "4.6.6",
    seed: "octahedron",
    operation: "truncate",
    recipe: "the octahedron, with each corner cut a third of the way along every edge",
    dual: "Tetrakis hexahedron",
    symmetry: "Octahedral (Oh), order 48",
    net: { root: 0, seed: 1 },
    blurb:
      "The only Archimedean solid that tiles space on its own, stacking without a gap - which is why it is the shape of a soap-froth cell in Kelvin's answer to the problem of dividing space into equal volumes with the least surface.",
  },
  {
    id: "rhombicuboctahedron",
    name: "Rhombicuboctahedron",
    config: "3.4.4.4",
    seed: "cube",
    operation: "expand",
    recipe: "the cube, with its six faces slid outward until the gaps close into squares",
    dual: "Deltoidal icositetrahedron",
    symmetry: "Octahedral (Oh), order 48",
    net: { root: 0, seed: 1 },
    blurb:
      "Push the six faces of a cube apart and the gaps fill with twelve more squares and eight triangles. Leonardo drew it for Pacioli's Divina Proportione in 1509, and it appears again, filled with water, in Jacopo de' Barbari's portrait of Pacioli.",
  },
  {
    id: "truncated-cuboctahedron",
    name: "Truncated Cuboctahedron",
    config: "4.6.8",
    seed: "cube",
    operation: "relax",
    recipe: "the cuboctahedron truncated, then relaxed until every edge touches one sphere",
    dual: "Disdyakis dodecahedron",
    symmetry: "Octahedral (Oh), order 48",
    net: { root: 0, seed: 1 },
    blurb:
      "Squares, hexagons and octagons, one of each at every vertex. Truncating a cuboctahedron gets the faces in the right places but leaves the squares as rectangles: only the relaxation makes them square. Also called the great rhombicuboctahedron.",
  },
  {
    id: "snub-cube",
    name: "Snub Cube",
    config: "3.3.3.3.4",
    seed: "cube",
    operation: "relax",
    recipe: "the cube, with its faces slid out and twisted, then relaxed",
    dual: "Pentagonal icositetrahedron",
    symmetry: "Chiral octahedral (O), order 24",
    net: { root: 0, seed: 1 },
    blurb:
      "Twist each face of a cube as you pull it out and the gaps tear into triangles instead of squares. The result is chiral: it comes in a left and a right form that no rotation will bring together. Its exact coordinates need the tribonacci constant, but a relaxation finds them without ever naming it.",
  },
  {
    id: "icosidodecahedron",
    name: "Icosidodecahedron",
    config: "3.5.3.5",
    seed: "dodecahedron",
    operation: "rectify",
    recipe: "the midpoints of the dodecahedron's thirty edges",
    dual: "Rhombic triacontahedron",
    symmetry: "Icosahedral (Ih), order 120",
    net: { root: 0, seed: 1 },
    blurb:
      "Halfway between the dodecahedron and the icosahedron, with twenty triangles and twelve pentagons. Its thirty vertices sit in six flat decagons, six great circles slicing the sphere - a fact easier to see when you turn it than to believe when you read it.",
  },
  {
    id: "truncated-dodecahedron",
    name: "Truncated Dodecahedron",
    config: "3.10.10",
    seed: "dodecahedron",
    operation: "truncate",
    recipe: "the dodecahedron, with each corner cut back by (3 − √5) / 2 of every edge",
    dual: "Triakis icosahedron",
    symmetry: "Icosahedral (Ih), order 120",
    net: { root: 0, seed: 1 },
    blurb:
      "Twelve decagons and twenty small triangles. Of the thirteen it is the one that stays closest to its parent: the pentagons only open into ten-sided faces, and the corners barely leave a mark.",
  },
  {
    id: "truncated-icosahedron",
    name: "Truncated Icosahedron",
    config: "5.6.6",
    seed: "icosahedron",
    operation: "truncate",
    recipe: "the icosahedron, with each corner cut a third of the way along every edge",
    dual: "Pentakis dodecahedron",
    symmetry: "Icosahedral (Ih), order 120",
    net: { root: 0, seed: 1 },
    blurb:
      "The football, and the carbon molecule C60 that was named buckminsterfullerene after the architect whose domes it resembles. Twelve pentagons and twenty hexagons: exactly twelve pentagons, always, because that is what it costs to close a hexagonal sheet into a ball.",
  },
  {
    id: "rhombicosidodecahedron",
    name: "Rhombicosidodecahedron",
    config: "3.4.5.4",
    seed: "dodecahedron",
    operation: "expand",
    recipe: "the dodecahedron, with its twelve faces slid outward until the gaps close into squares",
    dual: "Deltoidal hexecontahedron",
    symmetry: "Icosahedral (Ih), order 120",
    net: { root: 0, seed: 1 },
    blurb:
      "Sixty-two faces of three kinds: twenty triangles, thirty squares and twelve pentagons. Pull the faces of a dodecahedron apart and every edge becomes a square, every vertex a triangle. Kepler named it, and it is the roundest of the thirteen after the football.",
  },
  {
    id: "truncated-icosidodecahedron",
    name: "Truncated Icosidodecahedron",
    config: "4.6.10",
    seed: "dodecahedron",
    operation: "relax",
    recipe: "the icosidodecahedron truncated, then relaxed until every edge touches one sphere",
    dual: "Disdyakis triacontahedron",
    symmetry: "Icosahedral (Ih), order 120",
    net: { root: 0, seed: 1 },
    blurb:
      "The largest of the thirteen: 120 vertices, 180 edges, 62 faces, and a square, a hexagon and a decagon meeting at every one of its corners. No Archimedean solid has more of anything.",
  },
  {
    id: "snub-dodecahedron",
    name: "Snub Dodecahedron",
    config: "3.3.3.3.5",
    seed: "dodecahedron",
    operation: "relax",
    recipe: "the dodecahedron, with its faces slid out and twisted, then relaxed",
    dual: "Pentagonal hexecontahedron",
    symmetry: "Chiral icosahedral (I), order 60",
    net: { root: 0, seed: 1 },
    blurb:
      "Eighty triangles and twelve pentagons, and the second of the two chiral solids. It is the most nearly spherical of the thirteen, and the hardest to describe in closed form: its coordinates are roots of a cubic that has no pretty name.",
  },
];

const solidById = (id) => SOLIDS.find((s) => s.id === id) || SOLIDS[0];

/* ---------------------------------------------------------- construction */

// the parameters that make each operation land on regular faces
const EXPANSION = { cube: 1 / Math.SQRT2, dodecahedron: Math.sin((72 * Math.PI) / 180) };
const SNUB = { slide: 0.4, twist: (28 * Math.PI) / 180 };
const ROUGH_CUT = 0.2; // any cut gets the faces in the right places before relaxing

const rawVertices = (solid) => {
  const parent = seedOf(solid.seed);
  const parentEdge = edgeLength(parent);
  switch (solid.id) {
    case "truncated-tetrahedron":
    case "truncated-octahedron":
    case "truncated-icosahedron":
      return truncate(parent, regularCut(3));
    case "truncated-cube":
      return truncate(parent, regularCut(4));
    case "truncated-dodecahedron":
      return truncate(parent, regularCut(5));
    case "cuboctahedron":
    case "icosidodecahedron":
      return rectify(parent);
    case "rhombicuboctahedron":
    case "rhombicosidodecahedron":
      return expand(parent, parentEdge * EXPANSION[solid.seed]);
    case "snub-cube":
    case "snub-dodecahedron":
      return snub(parent, parentEdge * SNUB.slide, SNUB.twist);
    case "truncated-cuboctahedron":
    case "truncated-icosidodecahedron": {
      const mid = rectify(parent);
      return truncate({ verts: mid, faces: hullFaces(mid) }, ROUGH_CUT);
    }
    default:
      return parent.verts;
  }
};

/* ------------------------------------------------------------ measuring */

const polygonArea = (n, a) => (n * a * a) / (4 * Math.tan(Math.PI / n));

const measure = (verts, faces) => {
  const edges = edgesOf(faces);
  const a = len(sub(verts[edges[0][0]], verts[edges[0][1]]));
  const counts = {};
  faces.forEach((f) => (counts[f.length] = (counts[f.length] || 0) + 1));

  // one dihedral angle for each kind of edge, named by the faces it joins
  const byPair = {};
  edges.forEach(([p, q]) => {
    const touching = faces.filter((f) => {
      const i = f.indexOf(p);
      return i >= 0 && (f[(i + 1) % f.length] === q || f[(i + f.length - 1) % f.length] === q);
    });
    if (touching.length !== 2) return;
    const cosine = Math.max(
      -1,
      Math.min(1, dot(normalOf(verts, touching[0]), normalOf(verts, touching[1])))
    );
    const angle = 180 - (Math.acos(cosine) * 180) / Math.PI;
    const key = [touching[0].length, touching[1].length].sort((x, y) => x - y).join("-");
    byPair[key] = angle;
  });

  let volume = 0;
  let area = 0;
  faces.forEach((f) => {
    const n = normalOf(verts, f);
    const d = dot(n, verts[f[0]]);
    const faceArea = polygonArea(f.length, a);
    area += faceArea;
    volume += (faceArea * d) / 3;
  });

  const circum = len(verts[0]);
  return {
    V: verts.length,
    E: edges.length,
    F: faces.length,
    counts,
    dihedrals: byPair,
    circumradius: circum / a,
    midradius: midradiusOf(verts, faces) / a,
    volume: volume / (a * a * a),
    area: area / (a * a),
    sphericity: (Math.cbrt(36 * Math.PI * volume * volume) / area) || 0,
  };
};

/* ----------------------------------------------------------------- build */

const build = (id) => {
  const solid = solidById(id);
  let verts = rawVertices(solid);
  const faces = hullFaces(verts);
  if (solid.operation === "relax") verts = canonicalise(verts, faces);
  const radius = midradiusOf(verts, faces);
  return {
    ...solid,
    verts,
    faces,
    edges: edgesOf(faces),
    dualVerts: polarDual(verts, faces, radius),
    stats: measure(verts, faces),
  };
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PHI, EPS, sub, add, mul, dot, cross, len, unit, mean, dedupe,
    SEEDS, seedOf, hullFaces, edgesOf, normalOf, edgeLength,
    truncate, regularCut, rectify, expand, snub, canonicalise,
    midradiusOf, polarDual, unfold, flatten, faceAdjacency,
    SOLIDS, solidById, POLYGON, rawVertices, measure, build,
  };
}
