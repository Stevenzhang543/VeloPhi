/**
 * 26.65 (D1, D2, D5, D6, D9, D11, D12): placing the text of a canvas so that no label covers another one, a body or a
 * line it belongs next to. Pure module (no DOM): the motion renderer and the lab canvases share it, the tests drive it
 * with plain rectangles.
 *
 *   LabelLayer   greedy placement: the callers hand the labels over in priority order; each label tries its candidate
 *                positions in order and takes the first one that covers nothing placed before it and no obstacle. A
 *                "soft" obstacle (a fixed body, the screen edge) is avoided when a candidate allows it and accepted
 *                otherwise; a label that finds no free place is left out when it is optional (tick numbers), else it
 *                goes to its least bad candidate. A label that moved far from where it was asked gets a leader line
 *                back to its anchor. Cost per label: candidates × the boxes in the grid cells the candidate touches.
 *   spreadLabels one-dimensional version for a column of labels (energy levels): keeps the order, at least `gap` apart.
 *   tickSide     which side of an axis a tick number goes to: the asked side unless something covers it there.
 *   haloText     text with a stroke in the canvas colour behind it, so lines running under it do not cut the glyphs.
 */

/** A screen rectangle (CSS px): top-left corner and size. */
export interface Box { x: number; y: number; w: number; h: number }

/** A label to place: its box at the asked position and the offsets to try. */
export interface LabelRequest extends Box {
  /** Offsets (dx, dy) of the candidate positions, tried in order (absent: only the asked position). */
  candidates?: ReadonlyArray<readonly [number, number]>
  /** The point the label belongs to (an arrow tip, a body, an event): leader line when the label moved far. */
  anchor?: readonly [number, number] | null
  /** May be left out when no candidate is free (tick numbers). */
  optional?: boolean
}

/** Where a label went. */
export interface Placement extends Box {
  shown: boolean
  /** Not at the asked position. */
  moved: boolean
  /** Moved further than `leaderAt` from the asked position and has an anchor: draw a leader line. */
  leader: boolean
  /** No free candidate: it covers something (soft obstacles only, or anything when nothing better was found). */
  crowded: boolean
}

/** Two boxes overlap (touching edges do not count). */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** The point of a box nearest to (x, y) (for the end of a leader line). */
export function nearestPoint(b: Box, x: number, y: number): [number, number] {
  return [Math.max(b.x, Math.min(x, b.x + b.w)), Math.max(b.y, Math.min(y, b.y + b.h))]
}

const CELL = 64
/** Kinds of boxes in the layer. */
const HARD = 0, SOFT = 1

/**
 * Greedy label placement over a uniform grid of cells (64 px): placing a label checks only the boxes in the cells its
 * candidate touches. Reused from frame to frame (`reset`): the arrays grow once and are then only refilled.
 */
export class LabelLayer {
  private xs: number[] = []; private ys: number[] = []; private ws: number[] = []; private hs: number[] = []; private kinds: number[] = []
  /** Query stamp per box: a box spanning several cells is counted once per query. */
  private stamp: number[] = []; private query = 0
  private n = 0
  private cells: number[][] = []
  private used: number[] = []
  private cols = 1; private rows = 1
  private width = 0; private height = 0; private left = 0
  /** Distance (px) from the asked position beyond which a moved label gets a leader line (absent: 1.2 × its height). */
  leaderAt: number | null = null

  /**
   * Start a frame on a canvas of this size (CSS px; a candidate leaving it counts as a soft collision, 0: no edge);
   * `left`: a strip at the left edge that counts as outside (a floating tool strip).
   */
  reset(width: number, height: number, left = 0) {
    for (const c of this.used) this.cells[c].length = 0
    this.used.length = 0
    this.n = 0
    this.softTest = null
    this.width = width; this.height = height; this.left = Math.max(0, left)
    this.cols = Math.max(1, Math.ceil(width / CELL) + 2)
    this.rows = Math.max(1, Math.ceil(height / CELL) + 2)
    const need = this.cols * this.rows
    while (this.cells.length < need) this.cells.push([])
  }

  /** Something labels keep off: hard (another label, a moving body) or soft (a fixed body, avoided when possible). */
  obstacle(b: Box, soft = false) {
    if (!(b.w > 0 && b.h > 0) || !Number.isFinite(b.x + b.y + b.w + b.h)) return
    this.add(b.x, b.y, b.w, b.h, soft ? SOFT : HARD)
  }

  /** Place one label (callers go in priority order: whatever was placed before wins). */
  place(req: LabelRequest): Placement {
    const cands = req.candidates && req.candidates.length ? req.candidates : ZERO
    let soft = -1, softCount = Infinity
    for (let i = 0; i < cands.length; i++) {
      const x = req.x + cands[i][0], y = req.y + cands[i][1]
      const hit = this.hits(x, y, req.w, req.h)
      if (hit === 0) return this.commit(req, x, y, false)
      // a candidate that only touches soft obstacles is kept as the fallback (the one touching the fewest)
      if (hit > 0 && hit < softCount) { soft = i; softCount = hit }
    }
    if (soft >= 0) return this.commit(req, req.x + cands[soft][0], req.y + cands[soft][1], true)
    if (req.optional) return { x: req.x, y: req.y, w: req.w, h: req.h, shown: false, moved: false, leader: false, crowded: true }
    return this.commit(req, req.x + cands[0][0], req.y + cands[0][1], true)
  }

  /** 0: free; k > 0: touches k soft obstacles (or leaves the canvas) and nothing hard; −1: touches something hard. */
  private hits(x: number, y: number, w: number, h: number): number {
    let soft = 0
    if (this.width > 0 && (x < this.left || y < 0 || x + w > this.width || y + h > this.height)) soft++
    const q = ++this.query
    const c0 = this.col(x), c1 = this.col(x + w), r0 = this.row(y), r1 = this.row(y + h)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r * this.cols + c]
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k]
          if (this.stamp[i] === q) continue
          this.stamp[i] = q
          if (x < this.xs[i] + this.ws[i] && this.xs[i] < x + w && y < this.ys[i] + this.hs[i] && this.ys[i] < y + h) {
            if (this.kinds[i] === HARD) return -1
            soft++
          }
        }
      }
    }
    if (this.softTest) {
      const s = this.scratch
      s.x = x; s.y = y; s.w = w; s.h = h
      if (this.softTest(s)) soft++
    }
    return soft
  }

  /** A soft obstacle given by a test instead of a box (the real outline of the fixed bodies); null: none. */
  softTest: ((b: Box) => boolean) | null = null
  private scratch: Box = { x: 0, y: 0, w: 0, h: 0 }

  private commit(req: LabelRequest, x: number, y: number, crowded: boolean): Placement {
    this.add(x, y, req.w, req.h, HARD)
    const moved = x !== req.x || y !== req.y
    const far = Math.hypot(x - req.x, y - req.y) > (this.leaderAt ?? 1.2 * req.h)
    return { x, y, w: req.w, h: req.h, shown: true, moved, leader: moved && far && !!req.anchor, crowded }
  }

  private add(x: number, y: number, w: number, h: number, kind: number) {
    const i = this.n++
    this.xs[i] = x; this.ys[i] = y; this.ws[i] = w; this.hs[i] = h; this.kinds[i] = kind
    const c0 = this.col(x), c1 = this.col(x + w), r0 = this.row(y), r1 = this.row(y + h)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * this.cols + c, cell = this.cells[k]
        if (cell.length === 0) this.used.push(k)
        cell.push(i)
      }
    }
  }

  // Off-canvas boxes fall into the border cells (index 0 and the last one), so nothing is ever outside the grid
  private col(x: number): number { return Math.max(0, Math.min(this.cols - 1, Math.floor(x / CELL) + 1)) }
  private row(y: number): number { return Math.max(0, Math.min(this.rows - 1, Math.floor(y / CELL) + 1)) }
}

const ZERO: ReadonlyArray<readonly [number, number]> = [[0, 0]]

/** Place a list of labels in the order given (highest priority first) around fixed obstacles; pure. */
export function placeLabels(labels: LabelRequest[], obstacles: Array<Box & { soft?: boolean }> = [], size?: { width: number; height: number }): Placement[] {
  const layer = new LabelLayer()
  layer.reset(size?.width ?? 0, size?.height ?? 0)
  for (const o of obstacles) layer.obstacle(o, !!o.soft)
  return labels.map(l => layer.place(l))
}

/**
 * Candidate offsets for a label of height h beside an anchor: as asked, one and two lines up and down, then mirrored
 * to the other side of the anchor's x (`mirrorDx`, the shift that puts the box on the other side), and the same lines.
 */
export function besideCandidates(h: number, mirrorDx: number, lines = 4): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const dx of mirrorDx ? [0, mirrorDx] : [0]) {
    out.push([dx, 0])
    for (let k = 1; k <= lines; k++) { out.push([dx, -k * (h + 1)]); out.push([dx, k * (h + 1)]) }
  }
  return out
}

/**
 * Positions of a column of labels (pure; D9): `wanted` are the asked centres (any order), the result keeps their order
 * along the axis and puts neighbours at least `gap` apart, as close to the asked places as the room [lo, hi] allows.
 */
export function spreadLabels(wanted: readonly number[], gap: number, lo = -Infinity, hi = Infinity): number[] {
  const n = wanted.length
  const order = wanted.map((_, i) => i).sort((a, b) => wanted[a] - wanted[b] || a - b)
  const pos = order.map(i => wanted[i])
  // push down (increasing) from the first, then back up from the last when the column ran past hi
  for (let k = 0; k < n; k++) pos[k] = Math.max(pos[k], k ? pos[k - 1] + gap : lo)
  if (n && pos[n - 1] > hi) {
    pos[n - 1] = hi
    for (let k = n - 2; k >= 0; k--) pos[k] = Math.min(pos[k], pos[k + 1] - gap)
  }
  // a column taller than the room keeps its spacing and starts at lo
  if (n && pos[0] < lo) { pos[0] = lo; for (let k = 1; k < n; k++) pos[k] = Math.max(pos[k], pos[k - 1] + gap) }
  const out = new Array<number>(n)
  order.forEach((i, k) => { out[i] = pos[k] })
  return out
}

/**
 * Side of an axis for a tick number (pure; D1, D6): the asked box unless it is covered (by a ground, the surface of a
 * liquid …) and the box on the other side is not.
 */
export function tickSide(asked: Box, other: Box, covered: (b: Box) => boolean): 'asked' | 'other' {
  return covered(asked) && !covered(other) ? 'other' : 'asked'
}

/** Text with a halo in `halo` (the canvas colour) behind it; (x, y) as for fillText. */
export function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, halo: string, width = 3) {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.strokeStyle = halo
  ctx.lineWidth = width
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** A rounded backing in `bg` behind a box (text labels that lines must not cross, D11). */
export function backing(ctx: CanvasRenderingContext2D, b: Box, bg: string, radius = 4) {
  ctx.save()
  ctx.fillStyle = bg
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x, b.y, b.w, b.h, radius); else ctx.rect(b.x, b.y, b.w, b.h)
  ctx.fill()
  ctx.restore()
}

// ---- Colour helpers (D7) ----

/** Parse #rgb, #rrggbb or rgb()/rgba() to [r, g, b, a]; null when not readable. */
export function parseColour(text: string): [number, number, number, number] | null {
  const s = text.trim().toLowerCase()
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
  if (m) {
    const h = m[1]
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1]
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(s)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  return null
}

function luminance(r: number, g: number, b: number): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast of `fg` drawn with opacity `alpha` over the opaque `bg`. */
export function contrastOver(fg: string, bg: string, alpha = 1): number {
  const f = parseColour(fg), b = parseColour(bg)
  // nothing to measure against a ground that is not opaque (a transparent export): taken as enough
  if (!f || !b || b[3] < 1) return 21
  const a = alpha * f[3]
  const c = [0, 1, 2].map(i => f[i] * a + b[i] * (1 - a))
  const l1 = luminance(c[0], c[1], c[2]), l2 = luminance(b[0], b[1], b[2])
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const liftCache = new Map<string, string>()
/**
 * `colour` mixed towards `ink` in tenths until, drawn with opacity `alpha` over `bg`, it reaches `min` : 1 (pure,
 * cached; D7: a dark red trajectory on the dark canvas). A colour that already reaches it is returned unchanged.
 */
export function liftContrast(colour: string, bg: string, ink: string, min: number, alpha = 1): string {
  const key = `${colour}|${bg}|${ink}|${min}|${alpha}`
  const hit = liftCache.get(key)
  if (hit) return hit
  let out = colour
  const c = parseColour(colour), k = parseColour(ink)
  if (c && k && contrastOver(colour, bg, alpha) < min) {
    for (let t = 1; t <= 10; t++) {
      const u = t / 10
      const mix = `rgb(${Math.round(c[0] + (k[0] - c[0]) * u)}, ${Math.round(c[1] + (k[1] - c[1]) * u)}, ${Math.round(c[2] + (k[2] - c[2]) * u)})`
      out = mix
      if (contrastOver(mix, bg, alpha) >= min) break
    }
  }
  if (liftCache.size > 256) liftCache.clear()
  liftCache.set(key, out)
  return out
}
