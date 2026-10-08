import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merge every static mesh under `root` into one mesh per (material, layer,
 * shadow flags). Interactive or animated subtrees are passed in `exclude` and
 * left untouched. Turns ~800 dressing meshes into a few dozen draw calls.
 */
export function batchStatic(root: THREE.Object3D, exclude: Iterable<THREE.Object3D>): { before: number; after: number } {
  const skip = new Set(exclude);
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { material: THREE.Material; layers: number; cast: boolean; receive: boolean; order: number; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;
  const vcMaterials = new Map<string, THREE.MeshToonMaterial>();

  const visit = (o: THREE.Object3D) => {
    if (skip.has(o)) return;
    for (const c of o.children.slice()) visit(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(m.material) || !m.visible || m.userData.noBatch) return;
    let mat = m.material as THREE.Material;
    if (mat.visible === false) return;
    before++;
    // Plain single-colour toon materials collapse into one vertex-coloured material.
    let bakeColor: THREE.Color | null = null;
    const toon = mat as THREE.MeshToonMaterial;
    if (toon.isMeshToonMaterial && !toon.map && !toon.transparent && !toon.vertexColors && !toon.onBeforeCompile.toString().includes('uSpec') && toon.emissive.getHex() === 0) {
      const vk = `${toon.side}|${toon.gradientMap?.uuid}`;
      let shared = vcMaterials.get(vk);
      if (!shared) {
        shared = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toon.gradientMap, side: toon.side, vertexColors: true });
        shared.name = 'vertex-colour-toon';
        vcMaterials.set(vk, shared);
      }
      bakeColor = toon.color;
      mat = shared;
    }
    const key = `${mat.uuid}|${m.layers.mask}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
    let gEntry = groups.get(key);
    if (!gEntry) {
      gEntry = { material: mat, layers: m.layers.mask, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, geos: [], meshes: [] };
      groups.set(key, gEntry);
    }
    const g = normalise(m.geometry);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = bakeColor ?? new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
    gEntry.geos.push(g);
    gEntry.meshes.push(m);
  };
  visit(root);

  let after = 0;
  for (const entry of groups.values()) {
    if (entry.meshes.length < 2 && !(entry.material as THREE.MeshToonMaterial).vertexColors) {
      for (const g of entry.geos) g.dispose();
      after += entry.meshes.length;
      continue;
    }
    const merged = mergeGeometries(entry.geos, false);
    for (const g of entry.geos) g.dispose();
    if (!merged) {
      after += entry.meshes.length;
      continue;
    }
    for (const m of entry.meshes) m.removeFromParent();
    const mesh = new THREE.Mesh(merged, entry.material);
    mesh.layers.mask = entry.layers;
    mesh.castShadow = entry.cast;
    mesh.receiveShadow = entry.receive;
    mesh.renderOrder = entry.order;
    mesh.name = `batch:${entry.material.name || entry.material.type}`;
    root.add(mesh);
    after++;
  }
  return { before, after };
}

/** Non-indexed clone with exactly position / normal / uv so everything can merge. */
function normalise(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
