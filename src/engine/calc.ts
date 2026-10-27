/**
 * Stateless calculations of the core for the editor, the inspector and scene validation (26.53, D65): mass
 * properties and outlines of shapes, polygon checks and force-expression checks (engine/velophi-core/src/calc.rs).
 */
import type { Message } from '../i18n/message'
import { msgText } from '../i18n/locale'
import type { ShapeDef } from '../core/scene/types'
import type { Vec2 } from '../core/math/vec'
import { calc } from './core'
import type { ShapePiece } from './model'

/** Outline of a shape as the solver places it in body coordinates (dynamic bodies about their centre of mass). */
export function shapeOutline(shape: ShapeDef, dynamic: boolean): ShapePiece[] {
  return calc<{ outline: ShapePiece[] }>({ op: 'shapeOutline', shape, dynamic }).outline
}

/** Area, area centroid and moment of inertia about the centroid of a (compound) shape of mass `mass`. */
export function compoundMass(shape: ShapeDef, mass: number): { area: number; centroid: Vec2; inertia: number } {
  return calc<{ area: number; centroid: Vec2; inertia: number }>({ op: 'compoundMass', shape, mass })
}

/** Moment of inertia (kg·m²) of a uniform body of the shape about its centre of mass. */
export function shapeInertia(shape: ShapeDef, mass: number): number {
  return calc<{ inertia: number }>({ op: 'shapeInertia', shape, mass }).inertia
}

/** Whether a polygon is simple (no crossing edges, non-zero area). */
export function polygonIsSimple(points: Vec2[]): boolean {
  return calc<{ simple: boolean }>({ op: 'polygonIsSimple', points }).simple
}

/** Area centroid of a polygon. */
export function polygonCentroid(points: Vec2[]): Vec2 {
  return calc<{ centroid: Vec2 }>({ op: 'polygonCentroid', points }).centroid
}

/** Result of checkForceExpr. */
export interface ForceExprCheck { ok: boolean; message?: string }

/** Check one force component expression: syntax, known variables and functions, dimension of force (N). */
export function checkForceExpr(src: string): ForceExprCheck {
  const r = calc<{ ok: boolean; message?: Message }>({ op: 'checkForceExpr', src })
  return r.ok ? { ok: true } : { ok: false, message: r.message ? msgText(r.message) : '' }
}
