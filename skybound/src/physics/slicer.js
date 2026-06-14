// slicer.js — real-time plane mesh slicing. The showcase of the laser-eyes feature.
//
// Slices ONE convex triangle-soup mesh by an oriented plane into TWO closed, capped
// convex meshes. Because a convex mesh cut by a plane is still convex, pieces can be
// re-sliced indefinitely with exact molten caps every time. Multi-part objects (a
// building made of many boxes) are sliced part-by-part by destruction.js.
//
// Pure: no THREE import, so the geometry math is unit-testable under plain Node.
//
// Geometry I/O format ("mesh data"): { positions:[...], normals:[...], uvs:[...] }
// where positions is a flat triangle soup (length % 9 === 0). normals/uvs optional.
// Plane: { nx, ny, nz, d }  with the plane being  n·p + d = 0  and the POSITIVE side n·p+d>0.

const EPS = 1e-5;

// ---- tiny vec helpers on plain arrays ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function lerpVertex(a, b, t) {
  const p = [
    a.p[0] + (b.p[0] - a.p[0]) * t,
    a.p[1] + (b.p[1] - a.p[1]) * t,
    a.p[2] + (b.p[2] - a.p[2]) * t,
  ];
  const n = a.n && b.n ? norm3([
    a.n[0] + (b.n[0] - a.n[0]) * t,
    a.n[1] + (b.n[1] - a.n[1]) * t,
    a.n[2] + (b.n[2] - a.n[2]) * t,
  ]) : null;
  const uv = a.uv && b.uv ? [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t] : null;
  return { p, n, uv };
}

// Build an orthonormal basis (u,v) spanning the plane with normal n.
function planeBasis(n) {
  const a = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm3(cross(n, a));
  const v = norm3(cross(n, u));
  return [u, v];
}

// Fan-triangulate a convex polygon (array of vertex objs) appended to a side accumulator.
function fan(poly, acc) {
  for (let k = 1; k < poly.length - 1; k++) {
    acc.push(poly[0], poly[k], poly[k + 1]);
  }
}

// Cap the open cut cross-section (convex) with a centroid fan facing `outward`.
function buildCap(cutPts, planeN, outwardSign, acc) {
  // Dedup near-coincident points.
  const pts = [];
  for (const cp of cutPts) {
    let dup = false;
    for (const q of pts) {
      if (Math.abs(cp.p[0] - q.p[0]) < 1e-4 && Math.abs(cp.p[1] - q.p[1]) < 1e-4 && Math.abs(cp.p[2] - q.p[2]) < 1e-4) { dup = true; break; }
    }
    if (!dup) pts.push(cp);
  }
  if (pts.length < 3) return null;

  // Centroid.
  const c = [0, 0, 0];
  for (const q of pts) { c[0] += q.p[0]; c[1] += q.p[1]; c[2] += q.p[2]; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;

  // Sort points by angle in the plane basis (convex => angular order = boundary order).
  const [u, v] = planeBasis(planeN);
  pts.sort((p1, p2) => {
    const d1 = sub(p1.p, c), d2 = sub(p2.p, c);
    return Math.atan2(dot3(d1, v), dot3(d1, u)) - Math.atan2(dot3(d2, v), dot3(d2, u));
  });

  const outward = [planeN[0] * outwardSign, planeN[1] * outwardSign, planeN[2] * outwardSign];
  // Planar UVs from projection (scaled to keep texture sane on big slabs).
  const uvOf = (p) => [dot3(sub(p, c), u) * 0.12, dot3(sub(p, c), v) * 0.12];
  const center = { p: c, n: outward, uv: [0, 0] };

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    // Skip degenerate edges of the fan loop.
    const tri = [
      { p: center.p, n: outward, uv: center.uv },
      { p: a.p, n: outward, uv: uvOf(a.p) },
      { p: b.p, n: outward, uv: uvOf(b.p) },
    ];
    // Orient so geometric normal matches `outward`.
    const gn = cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p));
    if (dot3(gn, outward) < 0) { const t = tri[1]; tri[1] = tri[2]; tri[2] = t; }
    acc.push(tri[0], tri[1], tri[2]);
  }
  return c;
}

// Flatten an array of vertex objs into mesh data with a `capStart` marker (vertex index).
function flatten(surfaceVerts, capVerts) {
  const all = surfaceVerts.concat(capVerts);
  const n = all.length;
  const positions = new Array(n * 3);
  const normals = new Array(n * 3);
  const uvs = new Array(n * 2);
  for (let i = 0; i < n; i++) {
    const vtx = all[i];
    positions[i * 3] = vtx.p[0]; positions[i * 3 + 1] = vtx.p[1]; positions[i * 3 + 2] = vtx.p[2];
    const nn = vtx.n || [0, 1, 0];
    normals[i * 3] = nn[0]; normals[i * 3 + 1] = nn[1]; normals[i * 3 + 2] = nn[2];
    const uv = vtx.uv || [0, 0];
    uvs[i * 2] = uv[0]; uvs[i * 2 + 1] = uv[1];
  }
  return { positions, normals, uvs, capStart: surfaceVerts.length };
}

// Volume of a closed mesh via the divergence theorem (sum of signed tetra volumes).
export function meshVolume(positions) {
  let vol = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const a = [positions[i], positions[i + 1], positions[i + 2]];
    const b = [positions[i + 3], positions[i + 4], positions[i + 5]];
    const c = [positions[i + 6], positions[i + 7], positions[i + 8]];
    vol += dot3(a, cross(b, c)) / 6;
  }
  return Math.abs(vol);
}

// Centroid (average vertex) of mesh data — quick proxy for piece center of mass.
export function meshCentroid(positions) {
  const n = positions.length / 3;
  if (!n) return [0, 0, 0];
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < positions.length; i += 3) { x += positions[i]; y += positions[i + 1]; z += positions[i + 2]; }
  return [x / n, y / n, z / n];
}

/**
 * Slice convex mesh data by a plane.
 * @returns {null | { positive, negative, cut }} where positive/negative are mesh data
 *   ({positions,normals,uvs,capStart}) and `cut` = { centroid, normal, area }.
 *   Returns null if the plane misses the mesh (no real split).
 */
export function sliceConvex(mesh, plane) {
  const pos = mesh.positions;
  const nrm = mesh.normals && mesh.normals.length ? mesh.normals : null;
  const uvs = mesh.uvs && mesh.uvs.length ? mesh.uvs : null;
  const pn = [plane.nx, plane.ny, plane.nz];
  const pl = len3(pn) || 1;
  const N = [pn[0] / pl, pn[1] / pl, pn[2] / pl];
  const D = plane.d / pl;

  const posSurf = [], negSurf = [];
  const cutPts = [];
  let anyPos = false, anyNeg = false;

  const readV = (i) => ({
    p: [pos[i], pos[i + 1], pos[i + 2]],
    n: nrm ? [nrm[i], nrm[i + 1], nrm[i + 2]] : null,
    uv: uvs ? [uvs[(i / 3) * 2], uvs[(i / 3) * 2 + 1]] : null,
  });
  const sd = (v) => N[0] * v.p[0] + N[1] * v.p[1] + N[2] * v.p[2] + D;

  for (let i = 0; i < pos.length; i += 9) {
    const tri = [readV(i), readV(i + 3), readV(i + 6)];
    const s = [sd(tri[0]), sd(tri[1]), sd(tri[2])];
    const k = s.map((x) => (x > EPS ? 1 : x < -EPS ? -1 : 0));

    if (k[0] >= 0 && k[1] >= 0 && k[2] >= 0) {
      posSurf.push(tri[0], tri[1], tri[2]); anyPos = true;
      // capture on-plane vertices as cut points
      for (let j = 0; j < 3; j++) if (k[j] === 0) cutPts.push(tri[j]);
      continue;
    }
    if (k[0] <= 0 && k[1] <= 0 && k[2] <= 0) {
      negSurf.push(tri[0], tri[1], tri[2]); anyNeg = true;
      for (let j = 0; j < 3; j++) if (k[j] === 0) cutPts.push(tri[j]);
      continue;
    }

    // Straddling triangle: build positive & negative sub-polygons.
    anyPos = true; anyNeg = true;
    const posPoly = [], negPoly = [];
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      const ka = k[a], kb = k[b];
      if (ka >= 0) posPoly.push(tri[a]);
      if (ka <= 0) negPoly.push(tri[a]);
      if (ka === 0) cutPts.push(tri[a]);
      if ((ka === 1 && kb === -1) || (ka === -1 && kb === 1)) {
        const t = s[a] / (s[a] - s[b]);
        const m = lerpVertex(tri[a], tri[b], t);
        posPoly.push(m); negPoly.push(m); cutPts.push(m);
      }
    }
    if (posPoly.length >= 3) fan(posPoly, posSurf);
    if (negPoly.length >= 3) fan(negPoly, negSurf);
  }

  if (!anyPos || !anyNeg || cutPts.length < 3) return null; // plane missed / grazed

  // Build molten caps (positive piece faces -N, negative piece faces +N).
  const posCap = [], negCap = [];
  const capCentroid = buildCap(cutPts, N, -1, posCap);
  buildCap(cutPts, N, +1, negCap);
  if (!capCentroid) return null;

  const positive = flatten(posSurf, posCap);
  const negative = flatten(negSurf, negCap);

  // Cut cross-section area from the cap triangles (positive cap).
  let area = 0;
  for (let i = 0; i < posCap.length; i += 3) {
    const a = posCap[i].p, b = posCap[i + 1].p, c = posCap[i + 2].p;
    area += len3(cross(sub(b, a), sub(c, a))) * 0.5;
  }

  return { positive, negative, cut: { centroid: capCentroid, normal: N, area } };
}

// Convenience: derive a plane from a point on it and a normal.
export function planeFromPointNormal(point, normal) {
  const n = norm3([normal[0], normal[1], normal[2]]);
  return { nx: n[0], ny: n[1], nz: n[2], d: -dot3(n, point) };
}

// Convenience: derive a slicing plane from three points (eye + entry + exit of a sweep).
// The plane contains all three; its normal is the sweep's cross product.
export function planeFromThreePoints(a, b, c) {
  const n = norm3(cross(sub(b, a), sub(c, a)));
  if (len3(n) < 1e-6) return null;
  return { nx: n[0], ny: n[1], nz: n[2], d: -dot3(n, a) };
}
