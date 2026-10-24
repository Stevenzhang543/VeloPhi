/** CSV: separators, decimal mark, SI and display units, events table. */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/core/solver/simulation'
import { effectiveSeparator, eventsCsv, recordingCsv, tableCsv } from '../../src/export/csv'
import { presetChoice } from '../../src/units/units'

const lines = (s: string) => s.replace(/^﻿/, '').trimEnd().split('\r\n')

describe('csv', () => {
  it('formats tables with the chosen separator and decimal mark', () => {
    expect(effectiveSeparator({ separator: ',', decimal: ',' })).toBe(';')
    expect(effectiveSeparator({ separator: '\t', decimal: ',' })).toBe('\t')
    const t = tableCsv(['μ', 't [s]'], [[0.25, 1.5], ['a;b', null]], { separator: ';', decimal: ',' }, ['note'])
    expect(t.startsWith('﻿')).toBe(true)
    expect(lines(t)).toEqual(['# note', 'μ;t [s]', '0,25;1,5', '"a;b";'])
  })

  const rec = simulate(buildTemplate('board-block'))

  it('writes SI values bit-exactly with units in the headers', () => {
    const csv = recordingCsv(rec, { ids: ['block.vx', 'block.x'], stride: 100, from: 0, to: rec.frameCount - 1 })
    const l = lines(csv)
    const header = l.find(x => !x.startsWith('#'))!
    expect(header).toContain('t [s]')
    expect(header).toContain('[m/s] (block.vx)')
    expect(l.some(x => x.includes('国际单位'))).toBe(true)
    const first = l[l.indexOf(header) + 1].split(',')
    expect(Number(first[1])).toBe(4)
  })

  it('converts to display units on request', () => {
    const csv = recordingCsv(rec, { ids: ['block.vx', 'block.x'], stride: 100, from: 0, to: rec.frameCount - 1, units: 'display', unitChoice: presetChoice('lab'), separator: ',', decimal: ',' })
    const l = lines(csv)
    const header = l.find(x => !x.startsWith('#'))!
    expect(header.split(';')[1]).toContain('[cm/s]')
    expect(header.split(';')[2]).toContain('[cm]')
    const first = l[l.indexOf(header) + 1].split(';')
    expect(first[1]).toBe('400')
  })

  it('lists events', () => {
    const csv = eventsCsv(rec, { labelOf: c => c.type, whoOf: c => c.bodies.join('-') })
    const l = lines(csv)
    expect(l.some(x => /stick/.test(x) && /block/.test(x))).toBe(true)
  })
})
