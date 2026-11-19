// Solmar Heat — geometry helpers: coloured boxes merged into single meshes
// so the city, cars and pedestrians render in very few draw calls.
import * as THREE from 'three';

// A box with a flat colour baked into its vertices.
export function coloredBox(w, h, d, color, x, y, z, ry = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

// A cylinder (tree trunk, lamp pole, wheel) with a flat colour.
export function coloredCylinder(rTop, rBottom, h, color, x, y, z, segments = 8) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.translate(x, y, z);
  return geo;
}

// Merge a list of BufferGeometry pieces (all non-indexed after toNonIndexed)
// into one geometry with position / normal / color attributes.
export function mergeGeometries(geos) {
  let posLen = 0;
  let normLen = 0;
  let colLen = 0;
  const parts = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    posLen += ng.attributes.position.array.length;
    normLen += ng.attributes.normal.array.length;
    colLen += ng.attributes.color ? ng.attributes.color.array.length : ng.attributes.position.array.length;
    return ng;
  });
  const positions = new Float32Array(posLen);
  const normals = new Float32Array(normLen);
  const colors = new Float32Array(colLen);
  let p = 0;
  let n = 0;
  let c = 0;
  for (const g of parts) {
    positions.set(g.attributes.position.array, p);
    p += g.attributes.position.array.length;
    normals.set(g.attributes.normal.array, n);
    n += g.attributes.normal.array.length;
    if (g.attributes.color) {
      colors.set(g.attributes.color.array, c);
      c += g.attributes.color.array.length;
    } else {
      colors.fill(1, c, c + g.attributes.position.array.length);
      c += g.attributes.position.array.length;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return out;
}

// One shared material for every merged, vertex-coloured mesh in the game.
export const flatMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

export function meshFromGeos(geos, material = flatMaterial) {
  const mesh = new THREE.Mesh(mergeGeometries(geos), material);
  return mesh;
}
