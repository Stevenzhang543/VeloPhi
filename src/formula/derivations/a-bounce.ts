/**
 * Derivation of the situation "bounce": a body hits a fixed surface (manual 26.50, D28). v_n (before) and
 * v_n′ (after) are velocity components along the surface normal, positive away from the surface.
 */
import type { Derivation, SharedSteps } from './types'
import { B, st, tri } from './a-common'

/** Shared steps of the bounce situation (none: a single formula). */
export const BOUNCE_SHARED: SharedSteps[] = []

/** Derivation of the bounce formula. */
export const BOUNCE_DERIVATIONS: Derivation[] = [
  {
    formula: 'bounce.v',
    title: tri('与固定面碰撞后的法向速度', 'Normal velocity after hitting a fixed surface', 'Normalgeschwindigkeit nach dem Stoß gegen eine feste Fläche'),
    steps: [
      st("e = -\\dfrac{v_n' - 0}{v_n - 0}",
        tri('取接触面的法线（指向物体一侧）为正方向。固定面的速度为零，恢复系数等于分离速度与接近速度之比：碰前 v_n < 0（接近），碰后 v_n′ > 0（离开）。',
          'Take the surface normal, pointing towards the body, as positive. The fixed surface has zero velocity, so the coefficient of restitution is the ratio of the speed of separation to the speed of approach: v_n < 0 before (approaching), v_n′ > 0 after (separating).',
          'Die Flächennormale zeigt positiv zum Körper hin. Die feste Fläche hat die Geschwindigkeit null; die Stoßzahl ist das Verhältnis von Trennungs- zu Annäherungsgeschwindigkeit: vorher v_n < 0 (Annäherung), nachher v_n′ > 0 (Trennung).'),
        B.restitution, ['e', '-vnp/u'], { vnp: 'm/s' }),
      st("v_n' = -e\\,v_n",
        tri('解出 v_n′：法向速度反向，大小变为原来的 e 倍。e = 1 时原速率弹回，e = 0 时不反弹。',
          'Solve for v_n′: the normal velocity reverses and is scaled by e. For e = 1 the body rebounds with the same speed, for e = 0 it does not rebound.',
          'Auflösen nach v_n′: Die Normalgeschwindigkeit kehrt sich um und wird mit e multipliziert. Für e = 1 prallt der Körper mit gleichem Betrag zurück, für e = 0 gar nicht.'),
        B.solve, ['vnp', '-e*u'], { vnp: 'm/s' })
    ]
  }
]
