/** 26.46 joint servos: a revolute or prismatic Joint2D with a servo drives its motor towards a target angle
 * (degrees) or translation (units along the axis). Each fixed step the motor speed is set proportional to
 * the remaining error (gain, 1/s), limited to the servo's maximum speed; the joint's maximum motor force or
 * torque still limits how hard it pushes, so a heavy load lags and a blocked arm holds instead of exploding.
 * The target is measured like the joint's limits: the connected body relative to the body holding the joint
 * (put the joint on the base and connect the moving part for the usual sense). Runs before the physics step;
 * the solver itself is unchanged. */
import type { Entity } from '../world/Entity'
import type { Joint2D } from '../world/components'
import { worldTransform } from '../world/hierarchy'

const SERVO_KINDS = new Set(['RevoluteJoint2D', 'PrismaticJoint2D'])

/** Angle difference wrapped to (−π, π]. */
export function wrapAngle(value: number): number {
  const turn = Math.PI * 2
  let result = (value + Math.PI) % turn
  if (result < 0) result += turn
  return result - Math.PI
}

/** The joint's current coordinate, measured exactly like the solver's limits and motor: the connected
 * (target) body relative to the body that holds the joint. Revolute: radians from the reference angle, wrapped
 * to (−π, π]. Prismatic: distance between the two anchors along the axis (the axis turns with the owner). */
export function jointCoordinate(joint: Joint2D, owner: Entity, target: Entity, entities: readonly Entity[]): number {
  const a = worldTransform(owner, entities as Entity[]), b = worldTransform(target, entities as Entity[])
  if (joint.kind === 'RevoluteJoint2D') return wrapAngle(b.rotation - a.rotation - joint.referenceAngle)
  const turn = (point: { x: number; y: number }, angle: number) => ({ x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) })
  const anchorA = turn(joint.anchor, a.rotation), anchorB = turn(joint.connectedAnchor, b.rotation), axis = turn(joint.axis, a.rotation)
  const length = Math.hypot(axis.x, axis.y) || 1
  const dx = b.position.x + anchorB.x - a.position.x - anchorA.x, dy = b.position.y + anchorB.y - a.position.y - anchorA.y
  return (dx * axis.x + dy * axis.y) / length
}

/** Sets the motor of every servo joint for the coming step; returns how many servos ran. */
export function applyJointServos(entities: readonly Entity[]): number {
  let count = 0
  const byUuid = new Map<string, Entity>()
  for (const entity of entities) byUuid.set(entity.uuid, entity)
  for (const entity of entities) {
    if (!entity.enabled) continue
    for (const component of entity.componentMap.values()) {
      if (!SERVO_KINDS.has(component.kind) || !component.enabled) continue
      const joint = component as Joint2D
      if (!joint.servoEnabled) continue
      // Without a connected body the solver builds no joint, so there is nothing to drive.
      const target = joint.targetEntityUuid ? byUuid.get(joint.targetEntityUuid) : undefined
      if (!target || target === entity || !target.enabled) continue
      const current = jointCoordinate(joint, entity, target, entities)
      const goal = joint.kind === 'RevoluteJoint2D' ? joint.servoTarget * Math.PI / 180 : joint.servoTarget
      const error = joint.kind === 'RevoluteJoint2D' ? wrapAngle(goal - current) : goal - current
      const limit = Math.max(0, Number.isFinite(joint.servoMaxSpeed) ? joint.servoMaxSpeed : 0)
      joint.motorEnabled = true
      joint.motorSpeed = Math.max(-limit, Math.min(limit, error * Math.max(0, joint.servoGain)))
      count++
    }
  }
  return count
}
