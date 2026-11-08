/**
 * Syllabus chapters ↔ topics (26.62, D222): the topic table holds one candidate-mapping cell per course system
 * ("相关 2.2/3.2", "相关 必修1/2；选必1", "扩展候选：3.2-3.4", "相关 A.1/A.2", "基础衔接：2-6,12-13"); the chapter index
 * holds the official codes. `chapterCodes` reads the codes out of a cell; `chapterMatches` says whether a chapter is
 * among them (a module or area code covers its chapters: 必修1 (B1) covers 必修1.2, IGCSE 4 covers 4.3). IB MYP has
 * assessment criteria, not chapters, and the university column names course areas — both have no chapter mapping.
 */
import type { SystemId } from './index'

const expand = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)

/** The Chinese senior-high modules as ASCII letters: 必修 B, 选择性必修 (选必) X, 选修 O. */
function senior(s: string): string { return /^(选择性必修|选必)/.test(s) ? 'X' : /^必修/.test(s) ? 'B' : /^选修/.test(s) ? 'O' : '' }

/** A chapter code of the index in the form chapterCodes uses (必修1.2 → B1.2). */
export function chapterKey(system: SystemId, code: string): string {
  if (system !== 'cnSenior') return code
  const m = code.match(/^(选择性必修|必修|选修)(.*)$/)
  return m ? senior(m[1]) + m[2] : code
}

/** The chapter codes a candidate-mapping cell names for a system (empty: none or not mappable). */
export function chapterCodes(system: SystemId, cell: string): string[] {
  const c = cell.trim()
  if (!c || c.startsWith('—')) return []
  const out = new Set<string>()
  switch (system) {
    case 'cnJunior':
      for (const m of c.matchAll(/(\d)\.(\d)/g)) out.add(`${m[1]}.${m[2]}`)
      break
    case 'cnSenior':
      // "必修1/2；选必1", "必修2/选修1", "必修1/3·实验", "选必3；选修3" → module codes B1, B2, X1, O1 (senior())
      for (const part of c.replace(/·实验/g, '').split(/[；;]/)) {
        let prefix = ''
        for (const tok of part.replace(/^.*?(必修|选必|选修)/, '$1').split('/')) {
          const m = tok.match(/(必修|选必|选修)?\s*(\d)/)
          if (!m) continue
          if (m[1]) prefix = senior(m[1])
          if (!prefix) continue
          out.add(`${prefix}${m[2]}`)
        }
      }
      break
    case 'igcse': {
      const body = c.replace(/^.*?：/, '')
      for (const m of body.matchAll(/(\d)\.(\d)\s*-\s*(\d)\.(\d)/g)) for (const k of expand(Number(m[2]), Number(m[4]))) out.add(`${m[1]}.${k}`)
      const rest = body.replace(/(\d)\.(\d)\s*-\s*(\d)\.(\d)/g, ' ')
      for (const m of rest.matchAll(/(\d)\.(\d)/g)) out.add(`${m[1]}.${m[2]}`)
      for (const m of rest.replace(/\d\.\d/g, ' ').matchAll(/(?:^|\s)([1-6])(?=\s|$)/g)) out.add(m[1])
      break
    }
    case 'ibdp':
      for (const m of c.matchAll(/([A-E])\.(\d)/g)) out.add(`${m[1]}.${m[2]}`)
      break
    case 'a9702': {
      if (/^大学/.test(c)) break
      const body = c.replace(/^.*?(?:相关|基础衔接：|基础衔接)\s*/, '').replace(/·实验技能/, '')
      for (const part of body.split(',')) {
        const r = part.match(/^\s*(\d+)\s*-\s*(\d+)/)
        if (r) for (const k of expand(Number(r[1]), Number(r[2]))) out.add(String(k))
        else { const m = part.match(/^\s*(\d+)/); if (m) out.add(m[1]) }
      }
      break
    }
    default:
      break
  }
  return [...out]
}

/** Whether a chapter code is named by the codes (equal, or a module/area code that contains it). */
export function chapterMatches(system: SystemId, code: string, codes: string[]): boolean {
  const chapter = chapterKey(system, code)
  for (const k of codes) {
    if (k === chapter) return true
    if (system === 'cnSenior' && chapter.startsWith(`${k}.`)) return true
    if (system === 'igcse' && !k.includes('.') && chapter.startsWith(`${k}.`)) return true
  }
  return false
}

/** Whether a system's chapters can be mapped to topics. */
export const MAPPABLE: Record<SystemId, boolean> = { cnJunior: true, cnSenior: true, igcse: true, myp: false, ibdp: true, a9702: true, university: false }

/**
 * VeloPhi's own additions where the blueprint's candidate cells name no topic for a chapter (shown as a supplement,
 * not as the blueprint's mapping): `${system}:${code}` → topic ids.
 */
export const SUPPLEMENT: Record<string, string[]> = {
  'cnJunior:2.1': ['T02-001', 'T02-002', 'T02-003', 'T05-009'],
  'cnJunior:3.1': ['T02-019', 'T02-020', 'T05-003', 'T08-006'],
  'cnJunior:3.5': ['T02-020', 'T05-014', 'T02-021'],
  'cnJunior:3.6': ['T14-009', 'T05-016', 'T11-008']
}
