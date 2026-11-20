/**
 * The data of the encyclopedia as the pages use them (26.64, D271): the four files are fetched once, on the first
 * visit, and indexed. The catalogue (and with it the chemistry core's data) is loaded alongside but is not required:
 * the periodic table and the element pages work without it, and a substance page then shows what the molecule file
 * alone knows.
 */
import { shallowRef } from 'vue'
import type { CrystalRecord, ElementRecord, ElementsFile, MoleculesFile } from '../data'
import { loadCrystalData, loadElementData, loadMoleculeData } from '../data'
import { catalogue, loadCatalogue } from '../catalog'
import type { CatalogueData, NuclideTable, SubstanceEntry } from './model'
import { substanceIndex } from './model'

export interface EncyData {
  elements: ElementsFile
  bySymbol: Map<string, ElementRecord>
  molecules: MoleculesFile
  crystals: CrystalRecord[]
  catalogue: CatalogueData | null
  substances: SubstanceEntry[]
  byId: Map<string, SubstanceEntry>
}

export const encyData = shallowRef<EncyData | null>(null)
export const encyError = shallowRef<string>('')
/** The nuclide table (isotope tables); null until it is loaded, and when the build has no such file. */
export const nuclides = shallowRef<NuclideTable | null>(null)

const NUCLIDES = import.meta.glob<{ default: unknown }>('../data/nuclides.json')

let loading: Promise<EncyData> | null = null

function build(elements: ElementsFile, molecules: MoleculesFile, crystals: CrystalRecord[], cat: CatalogueData | null): EncyData {
  const substances = substanceIndex(molecules.molecules, cat, crystals)
  return { elements, bySymbol: new Map(elements.elements.map(e => [e.symbol, e])), molecules, crystals, catalogue: cat, substances, byId: new Map(substances.map(s => [s.id, s])) }
}

/** Load the data of the encyclopedia (once). The pages appear with the element, molecule and crystal files; the catalogue joins when it has loaded. */
export function loadEncy(): Promise<EncyData> {
  loading ??= (async () => {
    encyError.value = ''
    const [elements, molecules, crystalFile] = await Promise.all([loadElementData(), loadMoleculeData(), loadCrystalData()])
    const first = build(elements, molecules, crystalFile.crystals, catalogue.value as CatalogueData | null)
    encyData.value = first
    if (!first.catalogue) {
      void loadCatalogue().then(cat => { encyData.value = build(elements, molecules, crystalFile.crystals, cat as CatalogueData) }).catch(() => { /* the pages stay without the catalogue's part */ })
    }
    const file = NUCLIDES['../data/nuclides.json']
    if (file) void file().then(m => { const t = m.default as NuclideTable; if (Array.isArray(t?.nuclides)) nuclides.value = t }).catch(() => { /* isotope tables fall back to the element file */ })
    return first
  })()
  loading.catch(e => { encyError.value = (e as Error).message; loading = null })
  return loading
}
