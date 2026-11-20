/**
 * Addresses of the nuclide pages (26.64, D276): `#n` is the chart of nuclides, `#n=U-235` the page of a nuclide
 * (`#n=Tc-99m` an isomer; `#n=92-235` by atomic and mass number), `#n=U-238;chain` its decay chain. Pure.
 */
export interface NuclideTarget {
  /** As written in the address (`U-235`, `92-235`); null: the chart alone. */
  nuclide: string | null
  chain: boolean
}

export function parseNuclideHash(hash: string): NuclideTarget | null {
  const m = /^#n(?:=([^;]*)(;chain)?)?$/.exec(hash)
  if (!m) return null
  let value = ''
  try { value = decodeURIComponent(m[1] ?? '') } catch { return null }
  if (!value) return m[2] ? null : { nuclide: null, chain: false }
  if (!/^(?:[A-Za-z]{1,2}-?\d{1,3}[mn]?|\d{1,3}-\d{1,3}[mn]?)$/.test(value)) return null
  return { nuclide: value, chain: !!m[2] }
}

export function nuclideHash(t: NuclideTarget): string {
  return t.nuclide ? `#n=${t.nuclide}${t.chain ? ';chain' : ''}` : '#n'
}
