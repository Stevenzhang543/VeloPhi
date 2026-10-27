/**
 * Calculation interface (26.53, D67): the operations the front end sends exist in the Rust core, and the core's
 * operations are exactly those documented in engine/CALC.md (session and stateless tables).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** Operation names of a Rust dispatch `match op { "a" => …, "b" | "c" => … }` (top-level arms). */
function rustOps(file: string, from?: string): Set<string> {
  const out = new Set<string>()
  const text = read(file)
  // 26.55: only the dispatch function when given (helpers above it have arms of their own)
  const body = from ? text.slice(text.indexOf(from)) : text
  for (const m of body.matchAll(/^ {8}("[a-zA-Z]+"(?:\s*\|\s*"[a-zA-Z]+")*)(?:\s+if [^=]*)?\s*=>/gm)) {
    for (const n of m[1].matchAll(/"([a-zA-Z]+)"/g)) out.add(n[1])
  }
  return out
}

/** Operation names in the first column of the tables of a section of CALC.md (from `## title` to the next `## `). */
function docOps(title: string): Set<string> {
  const doc = read('engine/CALC.md')
  const start = doc.indexOf(`## ${title}`)
  const end = doc.indexOf('\n## ', start + 3)
  const part = doc.slice(start, end < 0 ? undefined : end)
  return new Set([...part.matchAll(/^\| `([a-zA-Z]+)` \|/gm)].map(m => m[1]))
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

describe('calculation operations', () => {
  const session = rustOps('engine/velophi-core/src/api.rs')
  const stateless = rustOps('engine/velophi-core/src/calc.rs')
  // 26.54 (D76): the lab operations, dispatched before the others in calc.rs
  const labs = rustOps('engine/velophi-core/src/labs/mod.rs', 'pub fn call(')
  const calc = new Set([...stateless, ...labs])

  it('the core implements what CALC.md documents', () => {
    expect([...session].sort()).toEqual([...docOps('Session operations')].sort())
    expect([...stateless].sort()).toEqual([...docOps('Stateless operations')].sort())
    expect([...labs].sort()).toEqual([...docOps('Lab operations')].sort())
    expect(labs.size).toBe(28)
  })

  it('every operation the front end sends exists', () => {
    const used = new Set<string>()
    for (const p of walk(join(root, 'src'))) for (const m of readFileSync(p, 'utf8').matchAll(/\bop: '([a-zA-Z]+)'/g)) used.add(m[1])
    expect(used.size).toBeGreaterThan(30)
    expect([...used].filter(op => !session.has(op) && !calc.has(op))).toEqual([])
  })
})
