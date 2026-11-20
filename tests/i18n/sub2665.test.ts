/**
 * 26.65 (D294): subscripts written with an underscore in interface texts become real subscripts, and the interface
 * templates no longer print such a text as it is.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hasSub, subParts, subPlain } from '../../src/i18n/sub'

describe('subscripts in interface texts', () => {
  it('splits symbols with subscripts and leaves file names alone', () => {
    expect(subParts('初速度 v_y')).toEqual([{ t: '初速度 ' }, { t: 'v' }, { t: 'y', sub: true }])
    expect(subParts('电势差 U_AB = φ_A − φ_B').filter(p => p.sub).map(p => p.t)).toEqual(['AB', 'A', 'B'])
    expect(subParts('qU_AB')).toEqual([{ t: 'qU' }, { t: 'AB', sub: true }])
    expect(subParts('x_{12} + s_min')).toEqual([{ t: 'x' }, { t: '12', sub: true }, { t: ' + ' }, { t: 's' }, { t: 'min', sub: true }])
    expect(hasSub('docs/chem/DATA_SOURCES.md')).toBe(false)
    expect(hasSub('THIRD_PARTY_NOTICES.md')).toBe(false)
    expect(hasSub('E_k')).toBe(true)
  })

  it('writes Unicode subscripts where they exist', () => {
    expect(subPlain('下限 s_min')).toBe('下限 sₘᵢₙ')
    expect(subPlain('滚动阻力 C_rr')).toBe('滚动阻力 Cᵣᵣ')
    expect(subPlain('E_k')).toBe('Eₖ')
    // no Unicode subscript y: the text stays readable as written
    expect(subPlain('初速度 v_y')).toBe('初速度 v_y')
  })

  it('no interface template interpolates such a text directly', () => {
    const bad: string[] = []
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (n.endsWith('.vue')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/\{\{ ?tl\('([^']*)'/g)) if (hasSub(m[1])) bad.push(`${p}: ${m[1]}`)
        }
      }
    }
    walk(join(__dirname, '..', '..', 'src'))
    expect(bad).toEqual([])
  })
})
