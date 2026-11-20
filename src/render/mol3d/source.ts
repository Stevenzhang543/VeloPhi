/**
 * From what a page hands the 3D viewer — a molecule record, a crystal with its expansion, the quantum numbers of an
 * orbital — to what the viewer draws: one request to the core each (`molShape`, `crystalBuild`, `orbitalSample`), and
 * the camera a picture starts from. Shared by the live viewer and the thumbnails.
 */
import type { CrystalBuild, CrystalSpec, ElementOverrides, MolShape, OrbitalSample } from '../../engine/mol'
import { crystalBuild, molShape, orbitalSample } from '../../engine/mol'
import type { Camera, Viewport } from './camera'
import { FOV, fitDistance, orientationFromAxes } from './camera'
import type { Scene, SceneInput } from './scene'

/** A molecule as the data file gives it (only the geometry is needed here). */
export interface MoleculeSource { atoms: string[]; xyz: ArrayLike<number>; bonds: ArrayLike<number>; charges?: ArrayLike<number> | null; formal?: ArrayLike<number> | null }
export interface OrbitalSource { n: number; l: number; m: number; Z?: number; count?: number; seed?: number }

export type Mol3DSource =
  | { kind: 'molecule'; molecule: MoleculeSource }
  | { kind: 'crystal'; crystal: CrystalSpec; expand?: [number, number, number]; polyhedron?: number | 'auto' | null }
  | { kind: 'orbital'; orbital: OrbitalSource }

/** The core could not build what was asked for (an unknown structure type): `code` is the diagnostic to show. */
export class SourceError extends Error {
  constructor(readonly code: string, readonly params: Record<string, unknown> = {}) { super(code) }
}

/** What the core computed for a source (the viewer shows its numbers; pages may read them too). */
export type SourceResult = { kind: 'molecule'; shape: MolShape } | { kind: 'crystal'; build: CrystalBuild } | { kind: 'orbital'; sample: OrbitalSample }

/** Ask the core for everything the picture of a source needs. Throws `SourceError`, or the core's own error. */
export function resolveSource(src: Mol3DSource, elements?: ElementOverrides): { input: SceneInput; result: SourceResult } {
  if (src.kind === 'molecule') {
    const m = src.molecule
    const shape = molShape(m, elements)
    return { input: { kind: 'molecule', atoms: m.atoms, xyz: m.xyz, bonds: m.bonds, shape }, result: { kind: 'molecule', shape } }
  }
  if (src.kind === 'crystal') {
    const build = crystalBuild(src.crystal, { n: src.expand ?? [1, 1, 1], polyhedron: src.polyhedron ?? null, elements })
    if (!build.ok) throw new SourceError(build.diagnostics[0]?.code ?? 'crystal.structureUnknown', { structure: build.structure })
    return { input: { kind: 'crystal', build }, result: { kind: 'crystal', build } }
  }
  const o = src.orbital
  const sample = orbitalSample(o.n, o.l, o.m, { Z: o.Z, count: o.count, seed: o.seed })
  return { input: { kind: 'orbital', sample }, result: { kind: 'orbital', sample } }
}

/** The camera a picture of a scene starts from: the scene's own orientation, fitted to the view. */
export function homeCamera(scene: Scene, vp: Viewport, ortho = false): Camera {
  const aspect = vp.width / Math.max(1, vp.height)
  return { q: orientationFromAxes(scene.axes), target: [...scene.centre], distance: fitDistance(scene.radius, FOV, aspect, ortho), fov: FOV, ortho }
}
