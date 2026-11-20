/**
 * The forty guided experiments of D270 (26.64): the source of src/chem/experiments/data.ts and of the interface
 * table src/i18n/texts/v2664exp.ts. Every text is written once here in three languages — `t(zh, en, de)` — so the
 * definition and its translations cannot drift apart; the titles come from scripts/chem/catalog/experiments_map.json.
 *
 *   node scripts/chem/build_experiments.mjs          writes both files (same input, same bytes)
 *
 * Vessels are named by their letter (A, B …: the order of `vessels`). A step is done when its `check` holds on the
 * numbers the core reports (src/chem/experiments/check.ts); `demo` is what "show me" and the tests perform, `wrong`
 * what the tests perform to see that the check does not pass by a wrong action. Texts of the runner's interface
 * that are not part of a definition are in ./experiments_ui.mjs.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { UI_TEXTS } from './experiments_ui.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const map = JSON.parse(readFileSync(join(here, 'catalog', 'experiments_map.json'), 'utf8'))

const texts = new Map()
/** A text in three languages; the definition holds the Chinese source text. */
function t(zh, en, de) {
  const had = texts.get(zh)
  if (had && (had[0] !== en || had[1] !== de)) throw new Error(`two translations of: ${zh}`)
  texts.set(zh, [en, de])
  return zh
}

// ---- small words for writing definitions ----
const V = (kind, capacity_mL, extra = {}) => ({ kind, ...(capacity_mL ? { capacity_mL } : {}), ...extra })
const add = (to, reagent, value, unit = 'mL') => ({ act: 'add', to, reagent, amount: { value, unit } })
const drops = (to, reagent, n) => add(to, reagent, n, 'drop')
const pour = (from, to, value, unit = 'mL') => (value === undefined ? { act: 'pour', from, to } : { act: 'pour', from, to, amount: { value, unit } })
/** Let time pass in `times` equal steps (written once; `expandActions` of the runner performs it step by step). */
const wait = (seconds, times = 1) => [times > 1 ? { act: 'wait', seconds, times } : { act: 'wait', seconds }]
const stopper = (vessel, on = true) => ({ act: 'stopper', vessel, on })
const collect = (vessel, mode) => ({ act: 'collector', vessel, mode })
const connect = (from, to) => ({ act: 'connect', from, to })
const disconnect = from => ({ act: 'disconnect', from })
const heat = (vessel, power = 150) => ({ act: 'heat', vessel, power })
const bath = (vessel, T) => ({ act: 'bath', vessel, T })
const ignite = (vessel, on = true) => ({ act: 'ignite', vessel, on })
const attach = (vessel, part) => ({ act: 'attach', vessel, part })
const circuit = (a, ea, b, eb, extra = {}) => ({ act: 'circuit', id: 'c1', a: { vessel: a, electrode: ea }, b: { vessel: b, electrode: eb }, load: 10, ...extra })

const is = (q, min, max, since) => ({ is: q, ...(min !== undefined && min !== null ? { min } : {}), ...(max !== undefined && max !== null ? { max } : {}), ...(since ? { since: 'step' } : {}) })
const all = (...c) => ({ all: c })
const pH = v => ({ q: 'pH', v })
const temp = v => ({ q: 'T', v })
const vol = v => ({ q: 'volume', v })
const mass = v => ({ q: 'mass', v })
const water = v => ({ q: 'water', v })
const pressure = v => ({ q: 'pressure', v })
const solid = (v, id, unit) => ({ q: 'solid', v, id, ...(unit ? { unit } : {}) })
const gas = (v, id, unit) => ({ q: 'gas', v, id, ...(unit ? { unit } : {}) })
const sp = (v, id, unit) => ({ q: 'species', v, id, ...(unit ? { unit } : {}) })
const solute = (v, id) => ({ q: 'solute', v, id })
const liquid = (v, id) => ({ q: 'liquid', v, id })
const released = (v, id) => ({ q: 'released', v, id })
const colour = (v, ch, g) => ({ q: 'colour', v, ch, ...(g ? { gas: true } : {}) })
const flame = (v, ch) => ({ q: 'flame', v, ch })
const event = (v, code, id) => ({ q: 'event', v, code, ...(id ? { id } : {}) })
const cell = (v, field, electrode) => ({ q: 'circuit', v, field, ...(electrode ? { electrode } : {}) })
const time = { q: 'time' }
const flag = (f, v, extra = {}) => ({ flag: f, v, ...extra })
const part = (v, p) => ({ part: p, v })
const wired = (v, on) => ({ wired: v, ...(on === false ? { on: false } : {}) })
const PHPH = ['Phph-2', 'H(Phph)-', 'H2(Phph)']
const LITMUS = ['Litmus-', 'H(Litmus)']
const FESCN = ['Fe(Thiocyanate)+2', 'Fe(Thiocyanate)2+']
const eq = (reactants, products) => ({ reactants, products })

const GOGGLES = t('戴护目镜。', 'Wear safety goggles.', 'Schutzbrille tragen.')

const list = []
function experiment(id, def) {
  const m = map.experiments.find(e => e.id === id)
  if (!m) throw new Error(`not in experiments_map.json: ${id}`)
  list.push({ id, group: m.group, title: t(m.name.zh, m.name.en, m.name.de), ...def })
}
const unavailable = (id, goal, reason) => experiment(id, { goal, principle: '', equations: [], safety: '', unavailable: reason, vessels: [], reagents: [], steps: [] })

// =====================================================================================================================
// 初中 8 个
// =====================================================================================================================

experiment('j1_crude_salt', {
  goal: t('用溶解、过滤、蒸发除去粗盐里的泥沙，得到食盐晶体。', 'Remove the sand from crude salt by dissolving, filtering and evaporating, and obtain salt crystals.', 'Den Sand aus Rohsalz durch Lösen, Filtrieren und Eindampfen entfernen und Salzkristalle gewinnen.'),
  principle: t('氯化钠溶于水，泥沙不溶：过滤把两者分开，蒸发把水赶走。没有化学反应。', 'Sodium chloride dissolves in water, sand does not: filtering separates them, evaporation drives off the water. No chemical reaction takes place.', 'Natriumchlorid löst sich in Wasser, Sand nicht: Filtrieren trennt beide, Eindampfen vertreibt das Wasser. Es läuft keine chemische Reaktion ab.'),
  equations: [],
  safety: t('蒸发时液滴会飞溅：戴护目镜，用玻璃棒搅拌，出现较多固体时停止加热。', 'The liquid spits while evaporating: wear goggles, stir with a glass rod and stop heating when much solid has appeared.', 'Beim Eindampfen spritzt die Lösung: Schutzbrille tragen, mit dem Glasstab rühren und das Erhitzen beenden, sobald viel Feststoff ausgefallen ist.'),
  limits: t('模型里倒出与过滤都不留残液，产率因此比真实实验高。', 'In the model pouring and filtering leave no liquid behind, so the yield is higher than in a real experiment.', 'Im Modell bleibt beim Umgießen und Filtrieren keine Flüssigkeit zurück; die Ausbeute ist deshalb höher als im echten Versuch.'),
  vessels: [V('beaker', 100), V('beaker', 100, { parts: ['funnel'] }), V('evaporatingDish', 100, { parts: ['alcoholBurner'] })],
  reagents: ['crude_salt', 'water'],
  steps: [
    { text: t('在烧杯 A 中用 20 mL 水溶解 5 g 粗盐。', 'Dissolve 5 g of crude salt in 20 mL of water in beaker A.', 'In Becherglas A 5 g Rohsalz in 20 mL Wasser lösen.'),
      hint: t('泥沙留在杯底，溶液里是钠离子和氯离子。', 'The sand stays at the bottom; the solution holds sodium and chloride ions.', 'Der Sand bleibt am Boden; in der Lösung sind Natrium- und Chloridionen.'),
      check: all(is(sp('A', 'Na+'), 0.06), is(solid('A', 'Quartz'), 0.001)),
      demo: [add('A', 'water', 20), add('A', 'crude_salt', 5, 'g')],
      wrong: [add('A', 'water', 20), add('A', 'SiO2_sand', 5, 'g')] },
    { text: t('把 A 中的混合物经漏斗过滤到烧杯 B。', 'Filter the mixture of A through the funnel into beaker B.', 'Das Gemisch aus A durch den Trichter in Becherglas B filtrieren.'),
      hint: t('把 A 倒向 B，在数量对话框里勾选“经漏斗过滤”。', 'Pour A into B and tick “through the filter funnel” in the amount dialog.', 'A in B gießen und im Mengendialog „durch den Filtertrichter“ ankreuzen.'),
      check: all(is(sp('B', 'Na+'), 0.06), is(solid('B', 'Quartz'), null, 1e-9), is(solid('A', 'Quartz'), 0.001)),
      demo: [{ act: 'filter', from: 'A', to: 'B' }],
      wrong: [{ act: 'empty', vessel: 'A' }] },
    { text: t('把滤液倒入蒸发皿 C，加热蒸发，析出较多晶体时停止加热。', 'Pour the filtrate into evaporating dish C, heat it, and stop heating when many crystals have formed.', 'Das Filtrat in die Abdampfschale C gießen, erhitzen und das Erhitzen beenden, sobald viele Kristalle ausgefallen sind.'),
      hint: t('让时间流逝；留一点水，用余热蒸干。', 'Let time pass; leave a little water and let the remaining heat dry the salt.', 'Zeit laufen lassen; etwas Wasser übrig lassen, die Restwärme trocknet das Salz.'),
      check: all(is(solid('C', 'Halite', 'g'), 2.5), is(solid('C', 'Quartz'), null, 1e-9), flag('heating', 'C', { on: false })),
      mistakes: [{ when: all(is(water('C'), null, 2.5), is(solid('C', 'Halite', 'g'), 1), flag('heating', 'C')), text: t('快蒸干了还在加热：晶体会迸溅。应在析出较多固体时就熄灭酒精灯。', 'Nearly dry and still being heated: the crystals will spit. Put the burner out as soon as much solid has formed.', 'Fast trocken und weiter erhitzt: Die Kristalle spritzen. Den Brenner löschen, sobald viel Feststoff ausgefallen ist.') }],
      demo: [pour('B', 'C'), heat('C'), ...wait(10, 44), heat('C', 0)],
      wrong: [pour('B', 'C'), ...wait(10, 3)] }
  ]
})

experiment('j2_oxygen', {
  goal: t('用过氧化氢和二氧化锰制取氧气，用排水法收集，并观察铁丝在氧气中燃烧。', 'Prepare oxygen from hydrogen peroxide and manganese(IV) oxide, collect it over water, and watch iron wire burn in oxygen.', 'Sauerstoff aus Wasserstoffperoxid und Mangan(IV)-oxid darstellen, über Wasser auffangen und Eisendraht in Sauerstoff verbrennen.'),
  principle: t('二氧化锰催化过氧化氢分解，自身的质量不变；氧气不易溶于水，可以用排水法收集。铁丝在空气里不燃烧，在氧气足够浓时剧烈燃烧。', 'Manganese(IV) oxide catalyses the decomposition of hydrogen peroxide and keeps its mass; oxygen is hardly soluble in water and can be collected over it. Iron wire does not burn in air but burns vigorously when the oxygen is concentrated enough.', 'Mangan(IV)-oxid katalysiert den Zerfall von Wasserstoffperoxid und behält seine Masse; Sauerstoff löst sich kaum in Wasser und lässt sich darüber auffangen. Eisendraht brennt an der Luft nicht, in genügend konzentriertem Sauerstoff aber heftig.'),
  equations: [eq(['H2O2'], ['H2O', 'O2']), eq(['Fe', 'O2'], ['Fe3O4'])],
  safety: t('铁丝燃烧时集气瓶底要留少量水或铺细沙，防止熔融物炸裂瓶底。', 'Leave a little water or sand at the bottom of the jar when burning iron wire, or the molten drops crack the glass.', 'Beim Verbrennen von Eisendraht etwas Wasser oder Sand im Zylinder lassen, sonst sprengen die Schmelztropfen den Boden.'),
  limits: t('敞口容器里的燃烧取用的是室内空气，所以铁丝放在充入氧气的密闭集气瓶 C 里燃烧；瓶内压强与温度因此比真实实验高。', 'Burning in an open vessel uses the air of the room, so the iron wire burns in the stoppered jar C filled with oxygen; pressure and temperature in it are therefore higher than in the real experiment.', 'Eine Verbrennung im offenen Gefäß nimmt die Raumluft; der Eisendraht brennt deshalb im verschlossenen, mit Sauerstoff gefüllten Zylinder C, in dem Druck und Temperatur höher sind als im echten Versuch.'),
  vessels: [V('testTube', 50, { parts: ['stopper', 'tube'] }), V('gasJar', 125), V('gasJar', 250, { parts: ['stopper', 'burningSplint'], closed: true })],
  reagents: ['MnO2_powder', 'H2O2_5pct', 'O2_gas', 'Fe_wire'],
  steps: [
    { text: t('在试管 A 中放 0.2 g 二氧化锰，塞上塞子，导管通到集气瓶 B，B 设为排水集气。', 'Put 0.2 g of manganese(IV) oxide into test tube A, stopper it, lead its tube to gas jar B and set B to collect over water.', '0,2 g Mangan(IV)-oxid in Reagenzglas A geben, verschließen, das Rohr zu Zylinder B führen und B auf Auffangen über Wasser stellen.'),
      check: all(is(solid('A', 'MnO2(s)', 'g'), 0.15), flag('closed', 'A'), flag('collecting', 'B'), flag('connected', 'A', { to: 'B' })),
      demo: [add('A', 'MnO2_powder', 0.2, 'g'), stopper('A'), collect('B', 'water'), connect('A', 'B')] },
    { text: t('向 A 加入 10 mL 5 % 过氧化氢溶液，等氧气充满 B。', 'Add 10 mL of 5 % hydrogen peroxide solution to A and wait until oxygen fills B.', '10 mL 5%ige Wasserstoffperoxidlösung in A geben und warten, bis Sauerstoff B füllt.'),
      hint: t('最先进入 B 的是试管里原有的空气。', 'The first gas to reach B is the air that was in the test tube.', 'Zuerst gelangt die Luft aus dem Reagenzglas nach B.'),
      check: all(is(gas('B', 'O2(g)', 'mL'), 80), is(solid('A', 'MnO2(s)', 'g'), 0.19, 0.21)),
      demo: [add('A', 'H2O2_5pct', 10), ...wait(10, 12)],
      wrong: [add('A', 'water', 10), ...wait(10, 3)] },
    { text: t('向塞紧的集气瓶 C 通入 400 mL 氧气，放入 0.3 g 铁丝，用燃着的木条引燃。', 'Lead 400 mL of oxygen into the stoppered jar C, put in 0.3 g of iron wire and light it with the burning splint.', '400 mL Sauerstoff in den verschlossenen Zylinder C leiten, 0,3 g Eisendraht hineingeben und mit dem brennenden Holzspan entzünden.'),
      check: is(solid('C', 'Fe3O4(s)'), 1e-4),
      demo: [add('C', 'O2_gas', 400), add('C', 'Fe_wire', 0.3, 'g'), ignite('C'), ...wait(2, 5)],
      wrong: [add('C', 'Fe_wire', 0.3, 'g'), ignite('C'), ...wait(2, 5)] }
  ]
})

experiment('j3_carbon_dioxide', {
  goal: t('用大理石和稀盐酸制取二氧化碳，用向上排空气法收集，并检验它与石灰水、与水的反应。', 'Prepare carbon dioxide from marble and dilute hydrochloric acid, collect it by upward displacement of air, and test its reactions with limewater and with water.', 'Kohlenstoffdioxid aus Marmor und verdünnter Salzsäure darstellen, durch Luftverdrängung nach oben auffangen und seine Reaktion mit Kalkwasser und mit Wasser prüfen.'),
  principle: t('碳酸钙与酸反应放出二氧化碳；它比空气重，用向上排空气法收集。通入澄清石灰水生成碳酸钙沉淀，溶于水生成碳酸，使石蕊变红。', 'Calcium carbonate reacts with acid and gives off carbon dioxide; it is denser than air and is collected by upward displacement. In limewater it precipitates calcium carbonate; in water it forms carbonic acid, which turns litmus red.', 'Calciumcarbonat reagiert mit Säure unter Abgabe von Kohlenstoffdioxid; es ist dichter als Luft und wird durch Luftverdrängung nach oben aufgefangen. In Kalkwasser fällt Calciumcarbonat aus; in Wasser bildet es Kohlensäure, die Lackmus rötet.'),
  equations: [eq(['CaCO3', 'HCl'], ['CaCl2', 'H2O', 'CO2']), eq(['CO2', 'Ca(OH)2'], ['CaCO3', 'H2O'])],
  safety: GOGGLES,
  limits: t('二氧化碳使蜡烛熄灭属于火焰的模型，这里没有。', 'That carbon dioxide puts out a candle is a matter of the flame, which is not modelled here.', 'Dass Kohlenstoffdioxid eine Kerze löscht, ist Sache der Flamme, die hier nicht modelliert ist.'),
  vessels: [V('testTube', 50, { parts: ['stopper', 'tube'] }), V('gasJar', 125), V('beaker', 100), V('beaker', 100, { parts: ['phMeter'] })],
  reagents: ['CaCO3_chip', 'HCl_1M', 'limewater', 'water', 'litmus'],
  steps: [
    { text: t('在试管 A 中放 3 g 大理石，塞上塞子，导管通到集气瓶 B，B 设为向上排空气。', 'Put 3 g of marble chips into test tube A, stopper it, lead its tube to gas jar B and set B to upward displacement of air.', '3 g Marmorstücke in Reagenzglas A geben, verschließen, das Rohr zu Zylinder B führen und B auf Luftverdrängung nach oben stellen.'),
      check: all(is(solid('A', 'Calcite'), 0.02), flag('closed', 'A'), flag('collecting', 'B'), flag('connected', 'A', { to: 'B' })),
      demo: [add('A', 'CaCO3_chip', 3, 'g'), stopper('A'), collect('B', 'up'), connect('A', 'B')] },
    { text: t('向 A 加入 20 mL 1 mol/L 盐酸，收集一瓶二氧化碳。', 'Add 20 mL of 1 mol/L hydrochloric acid to A and collect a jar of carbon dioxide.', '20 mL Salzsäure (1 mol/L) in A geben und einen Zylinder Kohlenstoffdioxid auffangen.'),
      check: is(gas('B', 'CO2(g)', 'mL'), 100),
      demo: [add('A', 'HCl_1M', 20), ...wait(10, 12)],
      wrong: [collect('B', 'down'), add('A', 'HCl_1M', 20), ...wait(10, 12)] },
    { text: t('在烧杯 C 中加 30 mL 澄清石灰水，把 A 的导管改通到 C，再向 A 补加 10 mL 盐酸。', 'Put 30 mL of limewater into beaker C, lead the tube of A into C and add another 10 mL of acid to A.', '30 mL Kalkwasser in Becherglas C geben, das Rohr von A nach C führen und weitere 10 mL Säure in A geben.'),
      hint: t('石灰水变浑浊；通得太久沉淀又会溶解。', 'The limewater turns cloudy; led in for too long, the precipitate dissolves again.', 'Das Kalkwasser wird trüb; leitet man zu lange ein, löst sich der Niederschlag wieder.'),
      check: is(event('C', 'precipitate', 'Calcite'), 5e-5),
      demo: [add('C', 'limewater', 30), disconnect('A'), connect('A', 'C'), add('A', 'HCl_1M', 10), ...wait(10, 6)],
      wrong: [add('C', 'water', 30), disconnect('A'), connect('A', 'C'), add('A', 'HCl_1M', 10), ...wait(10, 6)] },
    { text: t('在烧杯 D 中加 30 mL 水和 1 滴石蕊试液，把 A 的导管改通到 D。', 'Put 30 mL of water and 1 drop of litmus into beaker D and lead the tube of A into D.', '30 mL Wasser und 1 Tropfen Lackmus in Becherglas D geben und das Rohr von A nach D führen.'),
      check: all(is(pH('D'), 3.3, 5.5), is(sp('D', LITMUS), 1e-8)),
      demo: [add('D', 'water', 30), drops('D', 'litmus', 1), disconnect('A'), connect('A', 'D'), add('A', 'HCl_1M', 10), ...wait(10, 6)],
      wrong: [add('D', 'water', 30), drops('D', 'litmus', 1), ...wait(10, 3)] }
  ]
})

experiment('j4_metals', {
  goal: t('比较镁、锌、铜与稀盐酸的反应，并用置换反应排出铁、铜、银的活动性顺序。', 'Compare how magnesium, zinc and copper react with dilute hydrochloric acid, and order iron, copper and silver by displacement reactions.', 'Die Reaktionen von Magnesium, Zink und Kupfer mit verdünnter Salzsäure vergleichen und Eisen, Kupfer und Silber durch Verdrängungsreaktionen ordnen.'),
  principle: t('排在氢前面的金属能从酸里置换出氢气，越活泼越快；较活泼的金属能把较不活泼的金属从它的盐溶液里置换出来。', 'Metals above hydrogen displace hydrogen from acids, the more reactive the faster; a more reactive metal displaces a less reactive one from the solution of its salt.', 'Metalle, die unedler als Wasserstoff sind, setzen aus Säuren Wasserstoff frei, je unedler, desto schneller; ein unedleres Metall verdrängt ein edleres aus dessen Salzlösung.'),
  equations: [eq(['Mg', 'HCl'], ['MgCl2', 'H2']), eq(['Zn', 'HCl'], ['ZnCl2', 'H2']), eq(['Fe', 'CuSO4'], ['FeSO4', 'Cu']), eq(['Cu', 'AgNO3'], ['Cu(NO3)2', 'Ag'])],
  safety: t('氢气易燃，远离明火；硝酸银会在皮肤上留下黑斑。', 'Hydrogen is flammable: keep flames away; silver nitrate leaves black stains on the skin.', 'Wasserstoff ist brennbar: offene Flammen fernhalten; Silbernitrat hinterlässt schwarze Flecken auf der Haut.'),
  vessels: [V('testTube', 20), V('testTube', 20), V('testTube', 20), V('testTube', 20), V('testTube', 20)],
  reagents: ['HCl_1M', 'Mg_ribbon', 'Zn_granule', 'Cu_sheet', 'CuSO4_0.1M', 'Fe_powder', 'AgNO3_0.1M', 'Cu_wire'],
  steps: [
    { text: t('试管 A：5 mL 1 mol/L 盐酸中放入 0.1 g 镁条。', 'Test tube A: put 0.1 g of magnesium ribbon into 5 mL of 1 mol/L hydrochloric acid.', 'Reagenzglas A: 0,1 g Magnesiumband in 5 mL Salzsäure (1 mol/L) geben.'),
      check: is(released('A', 'H2(g)'), 5e-4),
      demo: [add('A', 'HCl_1M', 5), add('A', 'Mg_ribbon', 0.1, 'g'), ...wait(5, 6)],
      wrong: [add('A', 'water', 5), add('A', 'Mg_ribbon', 0.1, 'g'), ...wait(5, 6)] },
    { text: t('试管 B：5 mL 盐酸中放入 0.5 g 锌粒，与镁比较快慢。', 'Test tube B: put 0.5 g of zinc granules into 5 mL of the acid and compare the rate with magnesium.', 'Reagenzglas B: 0,5 g Zinkgranalien in 5 mL der Säure geben und die Geschwindigkeit mit Magnesium vergleichen.'),
      check: all(is(released('B', 'H2(g)'), 1e-5), { ratio: [released('A', 'H2(g)'), released('B', 'H2(g)')], min: 3 }),
      demo: [add('B', 'HCl_1M', 5), add('B', 'Zn_granule', 0.5, 'g'), ...wait(10, 6)] },
    { text: t('试管 C：5 mL 盐酸中放入 0.3 g 铜片，观察半分钟。', 'Test tube C: put 0.3 g of copper sheet into 5 mL of the acid and watch for half a minute.', 'Reagenzglas C: 0,3 g Kupferblech in 5 mL der Säure geben und eine halbe Minute beobachten.'),
      hint: t('铜排在氢后面：没有气体。', 'Copper stands below hydrogen: no gas.', 'Kupfer ist edler als Wasserstoff: kein Gas.'),
      check: all(is(solid('C', 'Cu(s)'), 0.004), is(sp('C', 'H+'), 0.003), is(released('C', 'H2(g)'), null, 1e-9), is(time, 30, null, true)),
      demo: [add('C', 'HCl_1M', 5), add('C', 'Cu_sheet', 0.3, 'g'), ...wait(10, 4)],
      wrong: [add('C', 'HCl_1M', 5), add('C', 'Zn_powder', 0.3, 'g'), ...wait(10, 4)] },
    { text: t('试管 D：5 mL 0.1 mol/L 硫酸铜溶液中加入 0.5 g 铁粉。', 'Test tube D: add 0.5 g of iron powder to 5 mL of 0.1 mol/L copper(II) sulfate solution.', 'Reagenzglas D: 0,5 g Eisenpulver in 5 mL Kupfer(II)-sulfat-Lösung (0,1 mol/L) geben.'),
      check: is(solid('D', 'Cu(s)'), 2e-5),
      demo: [add('D', 'CuSO4_0.1M', 5), add('D', 'Fe_powder', 0.5, 'g'), ...wait(10, 6)],
      wrong: [add('D', 'CuSO4_0.1M', 5), add('D', 'SiO2_sand', 0.5, 'g'), ...wait(10, 6)] },
    { text: t('试管 E：5 mL 0.1 mol/L 硝酸银溶液中放入 0.5 g 铜丝，等几分钟。', 'Test tube E: put 0.5 g of copper wire into 5 mL of 0.1 mol/L silver nitrate solution and wait a few minutes.', 'Reagenzglas E: 0,5 g Kupferdraht in 5 mL Silbernitratlösung (0,1 mol/L) geben und einige Minuten warten.'),
      check: is(solid('E', 'Ag(s)'), 3e-5),
      demo: [add('E', 'AgNO3_0.1M', 5), add('E', 'Cu_wire', 0.5, 'g'), ...wait(30, 10)] }
  ]
})

experiment('j5_acids_bases', {
  goal: t('认识酸和碱的通性：使指示剂变色、中和、酸溶解金属氧化物、碱与盐生成沉淀。', 'Get to know what acids and bases have in common: they change indicators, neutralise each other, acids dissolve metal oxides, bases precipitate with salts.', 'Gemeinsame Eigenschaften von Säuren und Basen kennenlernen: Indikatoren umfärben, Neutralisation, Säuren lösen Metalloxide, Basen fällen mit Salzen.'),
  principle: t('酸溶液里有氢离子，碱溶液里有氢氧根离子；两者相遇生成水。', 'Acid solutions hold hydrogen ions, alkaline solutions hydroxide ions; where they meet, water forms.', 'Saure Lösungen enthalten Wasserstoffionen, alkalische Hydroxidionen; treffen sie zusammen, entsteht Wasser.'),
  equations: [eq(['NaOH', 'HCl'], ['NaCl', 'H2O']), eq(['Fe2O3', 'HCl'], ['FeCl3', 'H2O']), eq(['CuSO4', 'NaOH'], ['Cu(OH)2', 'Na2SO4'])],
  safety: t('酸和碱有腐蚀性：戴护目镜，沾到皮肤立即用大量水冲洗。', 'Acids and alkalis are corrosive: wear goggles and rinse the skin at once with plenty of water.', 'Säuren und Laugen ätzen: Schutzbrille tragen, Haut sofort mit viel Wasser spülen.'),
  vessels: [V('testTube', 20), V('testTube', 20, { parts: ['phMeter'] }), V('testTube', 20), V('testTube', 20)],
  reagents: ['HCl_1M', 'NaOH_1M', 'litmus', 'phenolphthalein', 'Fe2O3_powder', 'CuSO4_0.1M'],
  steps: [
    { text: t('试管 A：3 mL 1 mol/L 盐酸中滴 2 滴石蕊试液。', 'Test tube A: add 2 drops of litmus to 3 mL of 1 mol/L hydrochloric acid.', 'Reagenzglas A: 2 Tropfen Lackmus zu 3 mL Salzsäure (1 mol/L) geben.'),
      check: all(is(pH('A'), null, 2), is(sp('A', LITMUS), 1e-7)),
      demo: [add('A', 'HCl_1M', 3), drops('A', 'litmus', 2)],
      wrong: [add('A', 'water', 3), drops('A', 'litmus', 2)] },
    { text: t('试管 B：3 mL 1 mol/L 氢氧化钠溶液中滴 2 滴酚酞试液。', 'Test tube B: add 2 drops of phenolphthalein to 3 mL of 1 mol/L sodium hydroxide solution.', 'Reagenzglas B: 2 Tropfen Phenolphthalein zu 3 mL Natronlauge (1 mol/L) geben.'),
      check: all(is(pH('B'), 12), is(sp('B', PHPH), 1e-8)),
      demo: [add('B', 'NaOH_1M', 3), drops('B', 'phenolphthalein', 2)] },
    { text: t('向 B 中滴加盐酸，直到红色刚好褪去。', 'Add hydrochloric acid to B until the red colour has just gone.', 'Salzsäure zu B geben, bis die rote Farbe eben verschwunden ist.'),
      check: all(is(pH('B'), null, 8.2), is(sp('B', 'Na+'), 0.002)),
      demo: [add('B', 'HCl_1M', 3.05)],
      wrong: [add('B', 'water', 5)] },
    { text: t('试管 C：0.1 g 氧化铁粉末中加入 8 mL 盐酸。', 'Test tube C: add 8 mL of the acid to 0.1 g of iron(III) oxide powder.', 'Reagenzglas C: 8 mL der Säure zu 0,1 g Eisen(III)-oxid-Pulver geben.'),
      hint: t('铁锈的主要成分就是氧化铁；溶液变黄。', 'Rust is mainly iron(III) oxide; the solution turns yellow.', 'Rost besteht hauptsächlich aus Eisen(III)-oxid; die Lösung wird gelb.'),
      check: all(is(sp('C', ['Fe+3', 'FeCl+2', 'FeCl2+', 'FeOH+2']), 3e-4), is(sp('C', 'Cl-'), 0.004)),
      demo: [add('C', 'Fe2O3_powder', 0.1, 'g'), add('C', 'HCl_1M', 8), ...wait(10, 3)],
      wrong: [add('C', 'Fe2O3_powder', 0.1, 'g'), add('C', 'NaOH_1M', 8), ...wait(10, 3)] },
    { text: t('试管 D：3 mL 0.1 mol/L 硫酸铜溶液中加入 1 mL 氢氧化钠溶液。', 'Test tube D: add 1 mL of sodium hydroxide solution to 3 mL of 0.1 mol/L copper(II) sulfate solution.', 'Reagenzglas D: 1 mL Natronlauge zu 3 mL Kupfer(II)-sulfat-Lösung (0,1 mol/L) geben.'),
      check: is(solid('D', 'Cu(OH)2(s)'), 2e-4),
      demo: [add('D', 'CuSO4_0.1M', 3), add('D', 'NaOH_1M', 1)],
      wrong: [add('D', 'CuSO4_0.1M', 3), add('D', 'HCl_1M', 1)] }
  ]
})

experiment('j6_nacl_solution', {
  goal: t('配制 50 g 溶质质量分数为 6 % 的氯化钠溶液。', 'Make 50 g of a sodium chloride solution with a mass fraction of 6 %.', '50 g einer Natriumchloridlösung mit dem Massenanteil 6 % herstellen.'),
  principle: t('溶质质量分数 = 溶质质量 ÷ 溶液质量：50 g × 6 % = 3 g 氯化钠，47 g（约 47 mL）水。', 'Mass fraction = mass of solute ÷ mass of solution: 50 g × 6 % = 3 g of sodium chloride and 47 g (about 47 mL) of water.', 'Massenanteil = Masse des gelösten Stoffs ÷ Masse der Lösung: 50 g × 6 % = 3 g Natriumchlorid und 47 g (etwa 47 mL) Wasser.'),
  equations: [],
  safety: t('没有危险药品；称量时药品不直接放在托盘上。', 'No hazardous reagents; never put a reagent straight onto the balance pan.', 'Keine gefährlichen Stoffe; Stoffe nie direkt auf die Waagschale geben.'),
  vessels: [V('beaker', 100, { parts: ['eBalance'] }), V('measuringCylinder', 50)],
  reagents: ['NaCl_solid', 'water'],
  steps: [
    { text: t('在烧杯 A 中称取 3.0 g 氯化钠。', 'Weigh 3.0 g of sodium chloride into beaker A.', '3,0 g Natriumchlorid in Becherglas A einwiegen.'),
      check: is(solid('A', 'Halite', 'g'), 2.95, 3.05),
      mistakes: [{ when: is(solid('A', 'Halite', 'g'), 3.05), text: t('称多了：溶质超过 3 g，质量分数会偏大。清空烧杯重新称。', 'Too much: more than 3 g of solute makes the mass fraction too high. Empty the beaker and weigh again.', 'Zu viel: mehr als 3 g gelöster Stoff machen den Massenanteil zu groß. Das Becherglas leeren und neu einwiegen.') }],
      demo: [add('A', 'NaCl_solid', 3, 'g')],
      wrong: [add('A', 'NaCl_solid', 6, 'g')] },
    { text: t('用量筒 B 量取 47 mL 水。', 'Measure 47 mL of water in cylinder B.', '47 mL Wasser im Messzylinder B abmessen.'),
      check: is(vol('B'), 46.5, 47.5),
      demo: [add('B', 'water', 47)],
      wrong: [add('B', 'water', 50)] },
    { text: t('把水倒入 A，溶解。', 'Pour the water into A and dissolve the salt.', 'Das Wasser in A gießen und das Salz lösen.'),
      check: all(is(mass('A'), 49.5, 50.5), is(sp('A', 'Na+'), 0.0505, 0.0522), is(solid('A', 'Halite'), null, 1e-9)),
      mistakes: [{ when: is(mass('A'), 50.5), text: t('溶液超过 50 g：水加多了，质量分数偏小。', 'The solution weighs more than 50 g: too much water, the mass fraction is too low.', 'Die Lösung wiegt mehr als 50 g: zu viel Wasser, der Massenanteil ist zu klein.') }],
      demo: [pour('B', 'A')],
      wrong: [pour('B', 'A', 20)] }
  ]
})

experiment('j7_water', {
  goal: t('通过电解水和氢气的燃烧，认识水由氢、氧两种元素组成。', 'See from the electrolysis of water and from hydrogen burning that water is made of the elements hydrogen and oxygen.', 'An der Elektrolyse von Wasser und an der Verbrennung von Wasserstoff erkennen, dass Wasser aus den Elementen Wasserstoff und Sauerstoff besteht.'),
  principle: t('通电使水分解成氢气和氧气，物质的量之比（也是体积比）为 2 : 1；氢气燃烧又只生成水。两个方向都说明水里只有氢和氧两种元素。', 'An electric current splits water into hydrogen and oxygen in the ratio 2 : 1 by amount (and by volume); hydrogen in turn burns to water only. Both directions show that water holds the elements hydrogen and oxygen and nothing else.', 'Elektrischer Strom zerlegt Wasser in Wasserstoff und Sauerstoff im Stoffmengen- (und Volumen-)Verhältnis 2 : 1; Wasserstoff wiederum verbrennt nur zu Wasser. Beide Richtungen zeigen, dass Wasser nur die Elemente Wasserstoff und Sauerstoff enthält.'),
  equations: [eq(['H2O'], ['H2', 'O2']), eq(['H2', 'O2'], ['H2O'])],
  safety: t('氢气与空气的混合气遇火会爆炸：点燃前必须验纯，真实实验只用很小的量。', 'Mixtures of hydrogen and air explode when lit: always test the purity first, and use very small amounts in the real experiment.', 'Gemische aus Wasserstoff und Luft explodieren beim Entzünden: vorher stets die Knallgasprobe machen und im echten Versuch nur sehr kleine Mengen verwenden.'),
  limits: t('两极的气体从敞口烧杯里一起逸出，它们的量由引擎的“放出”读数给出，不能分开收集（分开集气的电解槽还不在仪器表里）。纯水几乎不导电，所以加了硫酸钠。', 'The gases of the two poles leave the open beaker together; their amounts are the engine’s “given off” readings and they cannot be collected separately (the cell that collects them apart is not in the apparatus table yet). Pure water hardly conducts, hence the sodium sulfate.', 'Die Gase der beiden Pole entweichen gemeinsam aus dem offenen Becherglas; ihre Mengen sind die „abgegeben“-Werte der Engine, getrennt auffangen lassen sie sich nicht (die Zelle dafür fehlt noch in der Gerätetabelle). Reines Wasser leitet kaum, daher das Natriumsulfat.'),
  vessels: [V('beaker', 250, { parts: ['inertElectrode', 'powerSupply', 'ammeter'] }), V('gasJar', 250, { parts: ['stopper', 'burningSplint'], closed: true })],
  reagents: ['Na2SO4_0.1M', 'H2_gas'],
  steps: [
    { text: t('向烧杯 A 加入 150 mL 0.1 mol/L 硫酸钠溶液。', 'Put 150 mL of 0.1 mol/L sodium sulfate solution into beaker A.', '150 mL Natriumsulfatlösung (0,1 mol/L) in Becherglas A geben.'),
      check: all(is(vol('A'), 140, 160), is(sp('A', 'Na+'), 0.02)),
      demo: [add('A', 'Na2SO4_0.1M', 150)],
      wrong: [add('A', 'water', 150)] },
    { text: t('插入两个铂电极，接上 6 V 直流电源，通电两分钟。', 'Dip in two platinum electrodes, connect the 6 V d.c. supply and let the current flow for two minutes.', 'Zwei Platinelektroden eintauchen, die 6-V-Gleichspannungsquelle anschließen und zwei Minuten Strom fließen lassen.'),
      hint: t('负极放出的氢气是正极放出的氧气的两倍。', 'Twice as much hydrogen leaves at the negative pole as oxygen at the positive pole.', 'Am Minuspol entweicht doppelt so viel Wasserstoff wie Sauerstoff am Pluspol.'),
      check: all(wired('A'), is(released('A', 'H2(g)'), 1e-5), { ratio: [released('A', 'H2(g)'), released('A', 'O2(g)')], min: 1.9, max: 2.1 }),
      demo: [circuit('A', 'Pt(s)', 'A', 'Pt(s)', { source: 6 }), ...wait(10, 12)],
      wrong: [circuit('A', 'Pt(s)', 'A', 'Pt(s)'), ...wait(10, 3)] },
    { text: t('向塞紧的集气瓶 B（瓶里是空气）通入 60 mL 氢气。', 'Lead 60 mL of hydrogen into the stoppered jar B (it holds air).', '60 mL Wasserstoff in den verschlossenen Zylinder B leiten (er enthält Luft).'),
      check: is(gas('B', 'H2(g)'), 0.002),
      demo: [add('B', 'H2_gas', 60)],
      wrong: [add('B', 'N2_gas', 60)] },
    { text: t('把燃着的木条伸入 B，点燃。', 'Hold the burning splint into B and light the gas.', 'Den brennenden Holzspan in B halten und das Gas entzünden.'),
      hint: t('瓶里出现水蒸气，氢气用完了。', 'Water vapour appears in the jar and the hydrogen is used up.', 'Im Zylinder entsteht Wasserdampf, der Wasserstoff ist verbraucht.'),
      check: all(is(gas('B', 'H2O(g)'), 0.002), is(gas('B', 'H2(g)'), null, 1e-6)),
      demo: [ignite('B'), ...wait(1, 2)],
      wrong: [...wait(1, 3)] }
  ]
})

experiment('j8_combustion', {
  goal: t('探究燃烧的条件：要有可燃物，要有氧气。', 'Find the conditions of burning: there must be something that burns, and there must be oxygen.', 'Die Bedingungen der Verbrennung finden: Es braucht einen brennbaren Stoff und Sauerstoff.'),
  principle: t('石蜡能燃烧，沙子不能；在密闭的瓶里，蜡烛把氧气用尽就熄灭。', 'Paraffin wax burns, sand does not; in a closed jar the candle goes out once it has used up the oxygen.', 'Paraffin brennt, Sand nicht; im verschlossenen Zylinder erlischt die Kerze, wenn der Sauerstoff verbraucht ist.'),
  equations: [eq(['C25H52', 'O2'], ['CO2', 'H2O'])],
  safety: t('明火旁不放易燃物；真实实验用白磷时必须在通风橱里、由教师演示。', 'Keep flammable things away from flames; with white phosphorus the real experiment is a teacher demonstration in a fume cupboard.', 'Brennbares von Flammen fernhalten; mit weißem Phosphor ist der echte Versuch eine Lehrerdemonstration im Abzug.'),
  reduced: t('“温度达到着火点”这个条件没有提供：目录里的燃烧反应只看是否点燃和有没有氧气，不比较温度与着火点；无水乙醇在台上被当成溶质，点不着。', 'The condition “the temperature reaches the ignition point” is not offered: the combustion reactions of the catalogue look only at ignition and oxygen and do not compare the temperature with an ignition point; absolute ethanol is treated as a solute on the bench and cannot be lit.', 'Die Bedingung „Die Temperatur erreicht die Zündtemperatur“ wird nicht angeboten: Die Verbrennungsreaktionen des Katalogs prüfen nur Zündung und Sauerstoff und vergleichen keine Temperatur mit einer Zündtemperatur; absolutes Ethanol gilt auf dem Tisch als gelöster Stoff und lässt sich nicht entzünden.'),
  vessels: [V('crucible', 30, { parts: ['burningSplint'] }), V('crucible', 30, { parts: ['burningSplint'] }), V('gasJar', 250, { parts: ['stopper', 'burningSplint'] })],
  reagents: ['paraffin_wax', 'SiO2_sand'],
  steps: [
    { text: t('坩埚 A 放 1 g 石蜡，坩埚 B 放 1 g 沙子，分别用燃着的木条去点。', 'Put 1 g of paraffin wax into crucible A and 1 g of sand into crucible B, and try to light each with the burning splint.', '1 g Paraffin in Tiegel A und 1 g Sand in Tiegel B geben und beides mit dem brennenden Holzspan zu entzünden versuchen.'),
      check: all(is(released('A', 'CO2(g)'), 1e-5), flag('ignited', 'B'), is(solid('B', 'Quartz'), 0.016), is(released('B', 'CO2(g)'), null, 1e-12)),
      demo: [add('A', 'paraffin_wax', 1, 'g'), add('B', 'SiO2_sand', 1, 'g'), ignite('A'), ignite('B'), ...wait(5, 4)],
      wrong: [add('A', 'SiO2_sand', 1, 'g'), add('B', 'SiO2_sand', 1, 'g'), ignite('A'), ignite('B'), ...wait(5, 4)] },
    { text: t('集气瓶 C 中放 2 g 石蜡，点燃后塞上塞子，等到瓶里的氧气降到原来的四分之一以下。', 'Put 2 g of paraffin wax into jar C, light it, stopper the jar and wait until the oxygen in it has fallen below a quarter.', '2 g Paraffin in Zylinder C geben, entzünden, den Zylinder verschließen und warten, bis der Sauerstoff darin unter ein Viertel gefallen ist.'),
      hint: t('先点燃再塞：塞上时瓶里是空气。', 'Light first, then stopper: the jar is closed with air in it.', 'Erst entzünden, dann verschließen: Der Zylinder wird mit Luft darin verschlossen.'),
      check: all(flag('closed', 'C'), is(gas('C', 'O2(g)'), null, 5e-4), is(gas('C', 'CO2(g)'), 5e-4)),
      demo: [add('C', 'paraffin_wax', 2, 'g'), ignite('C'), stopper('C'), ...wait(30, 24)],
      wrong: [add('C', 'paraffin_wax', 2, 'g'), stopper('C'), ...wait(30, 6)] }
  ]
})

// =====================================================================================================================
// 高中必修 9 个
// =====================================================================================================================

experiment('c1_molar_solution', {
  goal: t('配制 100 mL 1.00 mol/L 的氯化钠溶液。', 'Make 100 mL of a 1.00 mol/L sodium chloride solution.', '100 mL einer Natriumchloridlösung mit 1,00 mol/L herstellen.'),
  principle: t('c = n ÷ V：0.100 mol 氯化钠（5.85 g）溶解后定容到 100 mL。体积由容量瓶的刻度线决定，不由加了多少水决定。', 'c = n ÷ V: 0.100 mol of sodium chloride (5.85 g) is dissolved and made up to 100 mL. The volume is fixed by the mark of the volumetric flask, not by how much water was added.', 'c = n ÷ V: 0,100 mol Natriumchlorid (5,85 g) werden gelöst und auf 100 mL aufgefüllt. Das Volumen bestimmt die Marke des Messkolbens, nicht die zugegebene Wassermenge.'),
  equations: [],
  safety: t('没有危险药品；容量瓶不能加热，也不能在瓶里溶解固体。', 'No hazardous reagents; a volumetric flask must not be heated, and solids are not dissolved in it.', 'Keine gefährlichen Stoffe; ein Messkolben darf nicht erhitzt werden, und Feststoffe werden nicht darin gelöst.'),
  limits: t('模型里倒出不留残液，所以洗涤烧杯不改变结果；读数也没有仰视、俯视的误差。', 'In the model pouring leaves nothing behind, so rinsing the beaker changes nothing; readings have no parallax error either.', 'Im Modell bleibt beim Umgießen nichts zurück, das Nachspülen ändert also nichts; auch Ablesefehler durch schrägen Blick gibt es nicht.'),
  vessels: [V('beaker', 100, { parts: ['eBalance'] }), V('volumetricFlask', 100)],
  reagents: ['NaCl_solid', 'water'],
  steps: [
    { text: t('在烧杯 A 中称取 5.85 g 氯化钠。', 'Weigh 5.85 g of sodium chloride into beaker A.', '5,85 g Natriumchlorid in Becherglas A einwiegen.'),
      check: is(solid('A', 'Halite', 'g'), 5.8, 5.9),
      demo: [add('A', 'NaCl_solid', 5.85, 'g')],
      wrong: [add('A', 'NaCl_solid', 58.5, 'mg')] },
    { text: t('加约 40 mL 水，使它全部溶解。', 'Add about 40 mL of water and dissolve all of it.', 'Etwa 40 mL Wasser zugeben und alles lösen.'),
      check: all(is(vol('A'), 20, 60), is(solid('A', 'Halite'), null, 1e-9), is(sp('A', 'Na+'), 0.099)),
      demo: [add('A', 'water', 40)],
      wrong: [add('A', 'water', 5)] },
    { text: t('把溶液转移到容量瓶 B，再用约 20 mL 水洗涤烧杯，洗涤液也转入 B。', 'Transfer the solution to volumetric flask B, rinse the beaker with about 20 mL of water and add the rinsings to B.', 'Die Lösung in den Messkolben B überführen, das Becherglas mit etwa 20 mL Wasser nachspülen und die Spüllösung ebenfalls in B geben.'),
      check: all(is(sp('B', 'Na+'), 0.0995), is(vol('B'), 50, 95)),
      demo: [pour('A', 'B'), add('A', 'water', 20), pour('A', 'B')],
      wrong: [pour('A', 'B', 20)] },
    { text: t('向 B 加水到刻度线（100.0 mL）。', 'Add water to B up to the mark (100.0 mL).', 'B mit Wasser bis zur Marke (100,0 mL) auffüllen.'),
      hint: t('接近刻度线时改用滴加（单位选“滴”）。', 'Close to the mark, go on by drops (choose the unit “drop”).', 'Kurz vor der Marke tropfenweise weiter (Einheit „Tropfen“ wählen).'),
      check: all(is(vol('B'), 99.5, 100.5), is(sp('B', 'Na+', 'M'), 0.99, 1.01)),
      mistakes: [{ when: is(vol('B'), 100.5), text: t('超过刻度线：浓度偏低，吸出多余的液体也无济于事，只能重新配制。', 'Above the mark: the concentration is too low, and taking liquid out does not help — the solution has to be made again.', 'Über der Marke: Die Konzentration ist zu klein, und Absaugen hilft nicht – die Lösung muss neu angesetzt werden.') }],
      demo: [add('B', 'water', 39), add('B', 'water', 1)],
      wrong: [add('B', 'water', 30)] }
  ]
})

experiment('c2_iron', {
  goal: t('检验 Fe³⁺，实现 Fe³⁺ 与 Fe²⁺ 的相互转化，观察氢氧化亚铁在空气中的变化。', 'Detect Fe³⁺, convert Fe³⁺ and Fe²⁺ into each other, and watch iron(II) hydroxide change in air.', 'Fe³⁺ nachweisen, Fe³⁺ und Fe²⁺ ineinander umwandeln und die Veränderung von Eisen(II)-hydroxid an der Luft beobachten.'),
  principle: t('Fe³⁺ 遇硫氰根显红色，Fe²⁺ 不显色。铁粉把 Fe³⁺ 还原成 Fe²⁺，氯水把 Fe²⁺ 氧化成 Fe³⁺；白色的氢氧化亚铁被空气中的氧气氧化成红褐色的氢氧化铁。', 'Fe³⁺ turns red with thiocyanate, Fe²⁺ does not. Iron powder reduces Fe³⁺ to Fe²⁺, chlorine water oxidises Fe²⁺ to Fe³⁺; white iron(II) hydroxide is oxidised by the oxygen of the air to red-brown iron(III) hydroxide.', 'Fe³⁺ färbt sich mit Thiocyanat rot, Fe²⁺ nicht. Eisenpulver reduziert Fe³⁺ zu Fe²⁺, Chlorwasser oxidiert Fe²⁺ zu Fe³⁺; weißes Eisen(II)-hydroxid wird vom Luftsauerstoff zu rotbraunem Eisen(III)-hydroxid oxidiert.'),
  equations: [eq(['Fe+3', 'Thiocyanate-'], ['Fe(Thiocyanate)+2']), eq(['Fe+3', 'Fe'], ['Fe+2']), eq(['Fe+2', 'Cl2'], ['Fe+3', 'Cl-']), eq(['Fe(OH)2', 'O2', 'H2O'], ['Fe(OH)3'])],
  safety: t('氯水放出有毒的氯气，在通风处取用。', 'Chlorine water gives off toxic chlorine: handle it where the air is drawn off.', 'Chlorwasser gibt giftiges Chlor ab: nur bei guter Lüftung verwenden.'),
  limits: t('氢氧化亚铁变色途中的灰绿色中间物没有对应的物种：模型里它直接变成氢氧化铁。', 'The grey-green intermediate of iron(II) hydroxide has no species: in the model it turns straight into iron(III) hydroxide.', 'Die graugrüne Zwischenstufe des Eisen(II)-hydroxids hat keine Spezies: Im Modell wird es direkt zu Eisen(III)-hydroxid.'),
  vessels: [V('testTube', 20), V('testTube', 20), V('testTube', 20)],
  reagents: ['FeCl3_0.1M', 'KSCN_0.1M', 'Fe_powder', 'FeCl2_0.1M', 'chlorine_water', 'FeSO4_0.1M', 'NaOH_1M'],
  steps: [
    { text: t('试管 A：3 mL 0.1 mol/L 氯化铁溶液中滴 2 滴硫氰化钾溶液。', 'Test tube A: add 2 drops of potassium thiocyanate solution to 3 mL of 0.1 mol/L iron(III) chloride solution.', 'Reagenzglas A: 2 Tropfen Kaliumthiocyanatlösung zu 3 mL Eisen(III)-chlorid-Lösung (0,1 mol/L) geben.'),
      check: is(sp('A', FESCN), 5e-6),
      demo: [add('A', 'FeCl3_0.1M', 3), drops('A', 'KSCN_0.1M', 2)],
      wrong: [add('A', 'FeCl2_0.1M', 3), drops('A', 'KSCN_0.1M', 2)] },
    { text: t('向 A 中加入 0.2 g 铁粉，等几分钟。', 'Add 0.2 g of iron powder to A and wait a few minutes.', '0,2 g Eisenpulver zu A geben und einige Minuten warten.'),
      check: is(sp('A', ['Fe+2', 'FeCl+']), 1e-5),
      demo: [add('A', 'Fe_powder', 0.2, 'g'), ...wait(10, 18)],
      wrong: [add('A', 'Cu_sheet', 0.2, 'g'), ...wait(10, 2)] },
    { text: t('试管 B：3 mL 0.1 mol/L 氯化亚铁溶液中滴 2 滴硫氰化钾溶液——不变红。', 'Test tube B: add 2 drops of potassium thiocyanate solution to 3 mL of 0.1 mol/L iron(II) chloride solution — it does not turn red.', 'Reagenzglas B: 2 Tropfen Kaliumthiocyanatlösung zu 3 mL Eisen(II)-chlorid-Lösung (0,1 mol/L) geben – keine Rotfärbung.'),
      check: all(is(sp('B', 'Thiocyanate-'), 5e-6), is(sp('B', FESCN), null, 1e-6), is(sp('B', ['Fe+2', 'FeCl+']), 2e-4)),
      demo: [add('B', 'FeCl2_0.1M', 3), drops('B', 'KSCN_0.1M', 2)] },
    { text: t('向 B 中加入 2 mL 氯水。', 'Add 2 mL of chlorine water to B.', '2 mL Chlorwasser zu B geben.'),
      check: is(sp('B', FESCN), 5e-6),
      demo: [add('B', 'chlorine_water', 2)],
      wrong: [add('B', 'water', 2)] },
    { text: t('试管 C：3 mL 0.1 mol/L 硫酸亚铁溶液中加入 1 mL 氢氧化钠溶液。', 'Test tube C: add 1 mL of sodium hydroxide solution to 3 mL of 0.1 mol/L iron(II) sulfate solution.', 'Reagenzglas C: 1 mL Natronlauge zu 3 mL Eisen(II)-sulfat-Lösung (0,1 mol/L) geben.'),
      check: is(event('C', 'precipitate', 'Fe(OH)2(s)'), 2e-4),
      demo: [add('C', 'FeSO4_0.1M', 3), add('C', 'NaOH_1M', 1)] },
    { text: t('让 C 在空气中放置约十二分钟。', 'Leave C in the air for about twelve minutes.', 'C etwa zwölf Minuten an der Luft stehen lassen.'),
      check: is(solid('C', 'Fe(OH)3(a)'), 1e-4),
      demo: [...wait(30, 24)] }
  ]
})

experiment('c3_sulfur', {
  goal: t('用氧化剂和还原剂实现硫的不同价态之间的转化（−2、0、+4、+6）。', 'Use oxidising and reducing agents to convert sulfur between its oxidation states (−2, 0, +4, +6).', 'Schwefel mit Oxidations- und Reduktionsmitteln zwischen seinen Oxidationsstufen (−2, 0, +4, +6) umwandeln.'),
  principle: t('+4 价的硫既能被氧化又能被还原：遇硫化氢生成单质硫，遇高锰酸钾或过氧化氢被氧化成硫酸根，硫酸根用钡离子检验。', 'Sulfur(+4) can be both oxidised and reduced: with hydrogen sulfide it gives sulfur, permanganate or hydrogen peroxide oxidise it to sulfate, and sulfate is detected with barium ions.', 'Schwefel(+4) lässt sich oxidieren und reduzieren: Mit Schwefelwasserstoff entsteht Schwefel, Permanganat oder Wasserstoffperoxid oxidieren ihn zu Sulfat, und Sulfat wird mit Bariumionen nachgewiesen.'),
  equations: [eq(['SO2', 'H2S'], ['S', 'H2O']), eq(['MnO4-', 'SO2', 'H2O'], ['Mn+2', 'SO4-2', 'H+']), eq(['SO2', 'H2O2'], ['H2SO4'])],
  safety: t('二氧化硫和硫化氢有毒：真实实验在通风橱里做，尾气用碱液吸收。', 'Sulfur dioxide and hydrogen sulfide are toxic: do the real experiment in a fume cupboard and absorb the waste gas in alkali.', 'Schwefeldioxid und Schwefelwasserstoff sind giftig: den echten Versuch im Abzug durchführen und das Abgas in Lauge auffangen.'),
  reduced: t('铜与浓硫酸共热（+6 → +4）没有提供：浓硫酸超出活度模型，加热时平衡求解失败。', 'Heating copper with concentrated sulfuric acid (+6 → +4) is not offered: concentrated sulfuric acid lies outside the activity model, and on heating the equilibrium cannot be solved.', 'Das Erhitzen von Kupfer mit konzentrierter Schwefelsäure (+6 → +4) wird nicht angeboten: Konzentrierte Schwefelsäure liegt außerhalb des Aktivitätsmodells, beim Erhitzen ist das Gleichgewicht nicht lösbar.'),
  vessels: [V('testTube', 20), V('testTube', 20), V('testTube', 20)],
  reagents: ['H2S_water', 'SO2_water', 'KMnO4_0.01M', 'BaCl2_0.1M', 'H2O2_3pct'],
  steps: [
    { text: t('试管 A：3 mL 氢硫酸中加入 3 mL 二氧化硫水溶液。', 'Test tube A: add 3 mL of sulfur dioxide solution to 3 mL of hydrogen sulfide water.', 'Reagenzglas A: 3 mL Schwefeldioxidlösung zu 3 mL Schwefelwasserstoffwasser geben.'),
      hint: t('出现淡黄色浑浊：硫。', 'A pale yellow cloudiness appears: sulfur.', 'Eine blassgelbe Trübung erscheint: Schwefel.'),
      check: is(solid('A', 'S(s)'), 2e-4),
      demo: [add('A', 'H2S_water', 3), add('A', 'SO2_water', 3), ...wait(5, 2)],
      wrong: [add('A', 'H2S_water', 3), add('A', 'water', 3), ...wait(5, 2)] },
    { text: t('试管 B：3 mL 二氧化硫水溶液中滴 5 滴 0.01 mol/L 高锰酸钾溶液。', 'Test tube B: add 5 drops of 0.01 mol/L potassium permanganate solution to 3 mL of sulfur dioxide solution.', 'Reagenzglas B: 5 Tropfen Kaliumpermanganatlösung (0,01 mol/L) zu 3 mL Schwefeldioxidlösung geben.'),
      check: all(is(sp('B', 'Mn+2'), 1e-6), is(sp('B', 'MnO4-'), null, 1e-9)),
      demo: [add('B', 'SO2_water', 3), drops('B', 'KMnO4_0.01M', 5)],
      wrong: [add('B', 'water', 3), drops('B', 'KMnO4_0.01M', 5)] },
    { text: t('试管 C：3 mL 二氧化硫水溶液中加入 1 mL 氯化钡溶液，再加入 1 mL 3 % 过氧化氢溶液。', 'Test tube C: add 1 mL of barium chloride solution to 3 mL of sulfur dioxide solution, then 1 mL of 3 % hydrogen peroxide.', 'Reagenzglas C: 1 mL Bariumchloridlösung zu 3 mL Schwefeldioxidlösung geben, dann 1 mL 3%iges Wasserstoffperoxid.'),
      check: is(solid('C', 'Barite'), 5e-5),
      demo: [add('C', 'SO2_water', 3), add('C', 'BaCl2_0.1M', 1), add('C', 'H2O2_3pct', 1), ...wait(5, 6)],
      wrong: [add('C', 'SO2_water', 3), add('C', 'BaCl2_0.1M', 1), ...wait(5, 2)] }
  ]
})

experiment('c4_salt_purification', {
  goal: t('用沉淀法依次除去粗盐溶液里的硫酸根、镁离子和钙离子，再中和、蒸发得到氯化钠。', 'Remove sulfate, magnesium and calcium ions from a crude salt solution one after the other by precipitation, then neutralise and evaporate to obtain sodium chloride.', 'Sulfat-, Magnesium- und Calciumionen nacheinander durch Fällung aus einer Rohsalzlösung entfernen, dann neutralisieren und eindampfen, um Natriumchlorid zu gewinnen.'),
  principle: t('氯化钡沉淀硫酸根，氢氧化钠沉淀镁离子，碳酸钠沉淀钙离子和过量的钡离子——所以碳酸钠必须在氯化钡之后加。过滤后用盐酸除去过量的碳酸根和氢氧根。', 'Barium chloride precipitates sulfate, sodium hydroxide magnesium, sodium carbonate calcium and the excess of barium — which is why the carbonate must follow the barium chloride. After filtering, hydrochloric acid removes the excess of carbonate and hydroxide.', 'Bariumchlorid fällt Sulfat, Natronlauge Magnesium, Natriumcarbonat Calcium und das überschüssige Barium – deshalb muss das Carbonat nach dem Bariumchlorid kommen. Nach dem Filtrieren entfernt Salzsäure überschüssiges Carbonat und Hydroxid.'),
  equations: [eq(['Ba+2', 'SO4-2'], ['BaSO4']), eq(['Mg+2', 'OH-'], ['Mg(OH)2']), eq(['Ca+2', 'CO3-2'], ['CaCO3']), eq(['Ba+2', 'CO3-2'], ['BaCO3']), eq(['CO3-2', 'H+'], ['CO2', 'H2O'])],
  safety: t('氯化钡有毒，废液单独回收；蒸发时戴护目镜。', 'Barium chloride is toxic: collect the waste separately; wear goggles when evaporating.', 'Bariumchlorid ist giftig: Abfälle getrennt sammeln; beim Eindampfen Schutzbrille tragen.'),
  vessels: [V('beaker', 250), V('beaker', 250, { parts: ['funnel', 'phMeter'] }), V('evaporatingDish', 100, { parts: ['alcoholBurner'] })],
  reagents: ['crude_salt', 'water', 'BaCl2_0.1M', 'NaOH_1M', 'Na2CO3_1M', 'HCl_1M'],
  steps: [
    { text: t('在烧杯 A 中用 50 mL 水溶解 10 g 粗盐。', 'Dissolve 10 g of crude salt in 50 mL of water in beaker A.', 'In Becherglas A 10 g Rohsalz in 50 mL Wasser lösen.'),
      check: is(sp('A', 'Na+'), 0.15),
      demo: [add('A', 'water', 50), add('A', 'crude_salt', 10, 'g')] },
    { text: t('加入 20 mL 0.1 mol/L 氯化钡溶液（过量）。', 'Add 20 mL of 0.1 mol/L barium chloride solution (an excess).', '20 mL Bariumchloridlösung (0,1 mol/L) zugeben (Überschuss).'),
      check: is(solid('A', 'Barite'), 1.2e-3),
      demo: [add('A', 'BaCl2_0.1M', 20)],
      wrong: [add('A', 'NaCl_0.1M', 20)] },
    { text: t('加入 5 mL 1 mol/L 氢氧化钠溶液。', 'Add 5 mL of 1 mol/L sodium hydroxide solution.', '5 mL Natronlauge (1 mol/L) zugeben.'),
      check: is(solid('A', 'Brucite'), 1e-3),
      demo: [add('A', 'NaOH_1M', 5)] },
    { text: t('加入 5 mL 1 mol/L 碳酸钠溶液。', 'Add 5 mL of 1 mol/L sodium carbonate solution.', '5 mL Natriumcarbonatlösung (1 mol/L) zugeben.'),
      check: all(is(solid('A', 'Calcite'), 8e-4), is(solid('A', 'Witherite'), 3e-4)),
      demo: [add('A', 'Na2CO3_1M', 5)],
      wrong: [add('A', 'NaOH_1M', 5)] },
    { text: t('把 A 经漏斗过滤到烧杯 B。', 'Filter A through the funnel into beaker B.', 'A durch den Trichter in Becherglas B filtrieren.'),
      check: all(is(sp('B', 'Na+'), 0.15), is(solid('B', ['Barite', 'Brucite', 'Calcite', 'Witherite', 'Quartz']), null, 1e-5)),
      demo: [{ act: 'filter', from: 'A', to: 'B' }] },
    { text: t('向滤液中滴加 1 mol/L 盐酸，到 pH 在 3 与 7.5 之间。', 'Add 1 mol/L hydrochloric acid to the filtrate until the pH lies between 3 and 7.5.', 'Salzsäure (1 mol/L) zum Filtrat geben, bis der pH-Wert zwischen 3 und 7,5 liegt.'),
      hint: t('有气泡：碳酸根变成了二氧化碳。稍过量的盐酸在蒸发时挥发。', 'Bubbles: the carbonate becomes carbon dioxide. A small excess of the acid leaves on evaporation.', 'Es perlt: Aus Carbonat wird Kohlenstoffdioxid. Ein kleiner Säureüberschuss entweicht beim Eindampfen.'),
      check: all(is(pH('B'), 3, 7.5), is(sp('B', 'Na+'), 0.15)),
      mistakes: [{ when: is(pH('B'), null, 3), text: t('盐酸加多了：pH 已低于 3。', 'Too much acid: the pH is below 3 already.', 'Zu viel Säure: Der pH-Wert liegt schon unter 3.') }],
      demo: [add('B', 'HCl_1M', 9)],
      wrong: [add('B', 'HCl_1M', 1)] },
    { text: t('取 30 mL 滤液到蒸发皿 C，加热蒸发，析出较多晶体时停止加热。', 'Take 30 mL of the filtrate into evaporating dish C, heat it, and stop heating when many crystals have formed.', '30 mL des Filtrats in die Abdampfschale C geben, erhitzen und das Erhitzen beenden, sobald viele Kristalle ausgefallen sind.'),
      check: all(is(solid('C', 'Halite', 'g'), 1.5), flag('heating', 'C', { on: false })),
      demo: [pour('B', 'C', 30), heat('C'), ...wait(10, 66), heat('C', 0)],
      wrong: [pour('B', 'C', 30), ...wait(10, 3)] }
  ]
})

experiment('c5_periodicity', {
  goal: t('比较钠与钾、镁与铝的金属性，以及氯、溴、碘的非金属性。', 'Compare the metallic character of sodium and potassium, of magnesium and aluminium, and the non-metallic character of chlorine, bromine and iodine.', 'Den Metallcharakter von Natrium und Kalium, von Magnesium und Aluminium sowie den Nichtmetallcharakter von Chlor, Brom und Iod vergleichen.'),
  principle: t('同主族从上到下金属性增强、非金属性减弱；同周期从左到右金属性减弱。活泼的卤素单质能把较不活泼的卤素从它的盐里置换出来。', 'Down a group the metallic character grows and the non-metallic character falls; across a period the metallic character falls. A more reactive halogen displaces a less reactive one from its salt.', 'In einer Hauptgruppe nimmt der Metallcharakter nach unten zu und der Nichtmetallcharakter ab; in einer Periode nimmt der Metallcharakter nach rechts ab. Ein reaktiveres Halogen verdrängt ein weniger reaktives aus dessen Salz.'),
  equations: [eq(['Na', 'H2O'], ['NaOH', 'H2']), eq(['K', 'H2O'], ['KOH', 'H2']), eq(['Mg', 'H+'], ['Mg+2', 'H2']), eq(['Al', 'H+'], ['Al+3', 'H2']), eq(['Cl2', 'Br-'], ['Cl-', 'Br2']), eq(['Br2', 'I-'], ['Br-', 'I2'])],
  safety: t('钠、钾只取绿豆大的一粒，钾与水反应会燃烧并迸溅：隔着防护屏做。氯水、溴水在通风处取用。', 'Take only a pea-sized piece of sodium or potassium; potassium catches fire and spits on water: work behind a safety screen. Handle chlorine and bromine water where the air is drawn off.', 'Von Natrium und Kalium nur ein erbsengroßes Stück nehmen; Kalium entzündet sich auf Wasser und spritzt: hinter einer Schutzscheibe arbeiten. Chlor- und Bromwasser nur bei guter Lüftung verwenden.'),
  vessels: [V('beaker', 250), V('beaker', 250), V('testTube', 20), V('testTube', 20), V('testTube', 20), V('testTube', 20)],
  reagents: ['water', 'phenolphthalein', 'Na_lump', 'K_lump', 'HCl_1M', 'Mg_ribbon', 'Al_sheet', 'NaBr_0.1M', 'chlorine_water', 'KI_0.1M', 'bromine_water'],
  steps: [
    { text: t('烧杯 A：100 mL 水中滴 2 滴酚酞，放入 0.2 g 钠。', 'Beaker A: 2 drops of phenolphthalein in 100 mL of water, then 0.2 g of sodium.', 'Becherglas A: 2 Tropfen Phenolphthalein in 100 mL Wasser, dann 0,2 g Natrium.'),
      check: all(is(pH('A'), 11), is(released('A', 'H2(g)'), 5e-4), is(sp('A', PHPH), 1e-8)),
      demo: [add('A', 'water', 100), drops('A', 'phenolphthalein', 2), add('A', 'Na_lump', 0.2, 'g'), ...wait(2, 10)] },
    { text: t('烧杯 B：同样的水和酚酞，放入 0.2 g 钾。', 'Beaker B: the same water and phenolphthalein, then 0.2 g of potassium.', 'Becherglas B: das gleiche Wasser mit Phenolphthalein, dann 0,2 g Kalium.'),
      check: all(is(pH('B'), 11), is(released('B', 'H2(g)'), 5e-4)),
      demo: [add('B', 'water', 100), drops('B', 'phenolphthalein', 2), add('B', 'K_lump', 0.2, 'g'), ...wait(2, 10)],
      wrong: [add('B', 'water', 100), drops('B', 'phenolphthalein', 2), add('B', 'Mg_ribbon', 0.2, 'g'), ...wait(2, 10)] },
    { text: t('试管 C、D 各加 5 mL 1 mol/L 盐酸；C 放 0.1 g 镁条，D 放 0.1 g 铝片，比较半分钟内放出的氢气。', 'Put 5 mL of 1 mol/L hydrochloric acid into each of test tubes C and D; add 0.1 g of magnesium ribbon to C and 0.1 g of aluminium sheet to D and compare the hydrogen given off in half a minute.', 'Je 5 mL Salzsäure (1 mol/L) in die Reagenzgläser C und D geben; 0,1 g Magnesiumband zu C und 0,1 g Aluminiumblech zu D und den in einer halben Minute entstandenen Wasserstoff vergleichen.'),
      check: all(is(released('C', 'H2(g)'), 5e-4), is(released('D', 'H2(g)'), 1e-6), { ratio: [released('C', 'H2(g)'), released('D', 'H2(g)')], min: 5 }),
      demo: [add('C', 'HCl_1M', 5), add('D', 'HCl_1M', 5), add('C', 'Mg_ribbon', 0.1, 'g'), add('D', 'Al_sheet', 0.1, 'g'), ...wait(5, 6)] },
    { text: t('试管 E：3 mL 0.1 mol/L 溴化钠溶液中加入 1 mL 氯水。', 'Test tube E: add 1 mL of chlorine water to 3 mL of 0.1 mol/L sodium bromide solution.', 'Reagenzglas E: 1 mL Chlorwasser zu 3 mL Natriumbromidlösung (0,1 mol/L) geben.'),
      check: is(sp('E', 'Br2'), 5e-5),
      demo: [add('E', 'NaBr_0.1M', 3), add('E', 'chlorine_water', 1)],
      wrong: [add('E', 'NaCl_0.1M', 3), add('E', 'chlorine_water', 1)] },
    { text: t('试管 F：3 mL 0.1 mol/L 碘化钾溶液中加入 1 mL 溴水。', 'Test tube F: add 1 mL of bromine water to 3 mL of 0.1 mol/L potassium iodide solution.', 'Reagenzglas F: 1 mL Bromwasser zu 3 mL Kaliumiodidlösung (0,1 mol/L) geben.'),
      check: is(sp('F', ['I3-', 'I2']), 1e-5),
      demo: [add('F', 'KI_0.1M', 3), add('F', 'bromine_water', 1)] }
  ]
})

experiment('c6_rates', {
  goal: t('探究温度和催化剂对化学反应速率的影响。', 'Find out how temperature and a catalyst change the rate of a reaction.', 'Untersuchen, wie Temperatur und Katalysator die Reaktionsgeschwindigkeit ändern.'),
  principle: t('硫代硫酸钠遇酸析出硫：同样的时间里，温度高的那份析出得多。过氧化氢自己分解极慢，有二氧化锰时很快。', 'Thiosulfate with acid deposits sulfur: in the same time the warmer portion deposits more. Hydrogen peroxide decomposes very slowly by itself and quickly with manganese(IV) oxide.', 'Thiosulfat scheidet mit Säure Schwefel ab: In gleicher Zeit scheidet die wärmere Probe mehr ab. Wasserstoffperoxid zerfällt allein sehr langsam, mit Mangan(IV)-oxid schnell.'),
  equations: [eq(['S2O3-2', 'H+'], ['S', 'SO2', 'H2O']), eq(['H2O2'], ['H2O', 'O2'])],
  safety: t('反应放出少量二氧化硫，保持通风。', 'A little sulfur dioxide is given off: keep the room aired.', 'Es entsteht etwas Schwefeldioxid: gut lüften.'),
  limits: t('速率常数是课堂量级的数值（目录里标为“教学值”），不是这套药品的实测值。', 'The rate constants are classroom orders of magnitude (marked “teaching value” in the catalogue), not measurements of these reagents.', 'Die Geschwindigkeitskonstanten sind Größenordnungen für den Unterricht (im Katalog als „Unterrichtswert“ markiert), keine Messwerte dieser Reagenzien.'),
  vessels: [V('beaker', 100), V('beaker', 100, { parts: ['waterBath'] }), V('testTube', 20), V('testTube', 20)],
  reagents: ['Na2S2O3_0.1M', 'H2SO4_0.1M', 'H2O2_5pct', 'MnO2_powder'],
  steps: [
    { text: t('烧杯 A（室温）：10 mL 0.1 mol/L 硫代硫酸钠溶液中加入 10 mL 0.1 mol/L 硫酸，等一分钟。', 'Beaker A (room temperature): add 10 mL of 0.1 mol/L sulfuric acid to 10 mL of 0.1 mol/L sodium thiosulfate solution and wait a minute.', 'Becherglas A (Raumtemperatur): 10 mL Schwefelsäure (0,1 mol/L) zu 10 mL Natriumthiosulfatlösung (0,1 mol/L) geben und eine Minute warten.'),
      check: is(solid('A', 'S(s)'), 4e-6),
      demo: [add('A', 'Na2S2O3_0.1M', 10), add('A', 'H2SO4_0.1M', 10), ...wait(10, 6)],
      wrong: [add('A', 'Na2S2O3_0.1M', 10), add('A', 'water', 10), ...wait(10, 6)] },
    { text: t('烧杯 B 放入 60 °C 水浴，加入同样的两种溶液，等一分钟，与 A 比较。', 'Put beaker B into the 60 °C water bath, add the same two solutions, wait a minute and compare with A.', 'Becherglas B ins 60-°C-Wasserbad stellen, die gleichen zwei Lösungen zugeben, eine Minute warten und mit A vergleichen.'),
      check: all(flag('bath', 'B'), { ratio: [solid('B', 'S(s)'), solid('A', 'S(s)')], min: 2 }),
      demo: [bath('B', 333.15), add('B', 'Na2S2O3_0.1M', 10), add('B', 'H2SO4_0.1M', 10), ...wait(10, 6)],
      wrong: [add('B', 'Na2S2O3_0.1M', 10), add('B', 'H2SO4_0.1M', 10), ...wait(10, 6)] },
    { text: t('试管 C、D 各加 5 mL 5 % 过氧化氢溶液；只向 D 加入 0.1 g 二氧化锰。', 'Put 5 mL of 5 % hydrogen peroxide into each of test tubes C and D; add 0.1 g of manganese(IV) oxide to D only.', 'Je 5 mL 5%iges Wasserstoffperoxid in die Reagenzgläser C und D geben; nur zu D 0,1 g Mangan(IV)-oxid geben.'),
      check: all(is(released('D', 'O2(g)'), 1e-3), is(released('C', 'O2(g)'), null, 1e-5), is(sp('C', 'H2O2'), 0.005)),
      demo: [add('C', 'H2O2_5pct', 5), add('D', 'H2O2_5pct', 5), add('D', 'MnO2_powder', 0.1, 'g'), ...wait(10, 3)],
      wrong: [add('C', 'H2O2_5pct', 5), add('D', 'H2O2_5pct', 5), add('D', 'SiO2_sand', 0.1, 'g'), ...wait(10, 3)] }
  ]
})

experiment('c7_galvanic', {
  goal: t('用锌片、铜片和稀硫酸组成原电池，把化学能转化成电能。', 'Build a cell from zinc, copper and dilute sulfuric acid and turn chemical energy into electrical energy.', 'Aus Zink, Kupfer und verdünnter Schwefelsäure eine galvanische Zelle bauen und chemische in elektrische Energie umwandeln.'),
  principle: t('锌比铜活泼：锌片失去电子溶解（负极），电子经导线流到铜片，氢离子在铜片上得到电子变成氢气（正极）。', 'Zinc is more reactive than copper: the zinc gives up electrons and dissolves (negative pole), the electrons flow through the wire to the copper, where hydrogen ions take them up and become hydrogen (positive pole).', 'Zink ist unedler als Kupfer: Das Zink gibt Elektronen ab und löst sich (Minuspol), die Elektronen fließen durch den Draht zum Kupfer, wo Wasserstoffionen sie aufnehmen und zu Wasserstoff werden (Pluspol).'),
  equations: [eq(['Zn', 'H+'], ['Zn+2', 'H2'])],
  safety: t('稀硫酸有腐蚀性，戴护目镜。', 'Dilute sulfuric acid is corrosive: wear goggles.', 'Verdünnte Schwefelsäure ätzt: Schutzbrille tragen.'),
  limits: t('电动势按能斯特方程加上铜上析氢的过电位估算，内阻由离子强度估计：都是写明的近似。', 'The e.m.f. follows Nernst’s equation with an overpotential for hydrogen on copper, the internal resistance is estimated from the ionic strength: both are stated approximations.', 'Die Zellspannung folgt der Nernst-Gleichung mit einer Überspannung für Wasserstoff an Kupfer, der Innenwiderstand wird aus der Ionenstärke geschätzt: beides sind ausgewiesene Näherungen.'),
  vessels: [V('beaker', 250, { parts: ['activeElectrode', 'voltmeter', 'ammeter'] })],
  reagents: ['H2SO4_1M'],
  steps: [
    { text: t('向烧杯 A 加入 150 mL 1 mol/L 硫酸，插入锌电极和铜电极（负载 10 Ω）。', 'Put 150 mL of 1 mol/L sulfuric acid into beaker A and dip in a zinc and a copper electrode (load 10 Ω).', '150 mL Schwefelsäure (1 mol/L) in Becherglas A geben und eine Zink- und eine Kupferelektrode eintauchen (Last 10 Ω).'),
      hint: t('从仪器架拿“活性电极”两次：先选锌，再选铜。', 'Take “active electrode” from the apparatus shelf twice: choose zinc first, then copper.', '„Aktive Elektrode“ zweimal vom Geräteregal nehmen: erst Zink, dann Kupfer wählen.'),
      check: all(wired('A'), is(cell('A', 'emf'), 0.3), is(cell('A', 'I'), 0.005), is(sp('A', 'H+'), 0.05)),
      demo: [add('A', 'H2SO4_1M', 150), circuit('A', 'Zn(s)', 'A', 'Cu(s)')],
      wrong: [add('A', 'H2SO4_1M', 150), circuit('A', 'Cu(s)', 'A', 'Cu(s)')] },
    { text: t('让电池工作三分钟。', 'Let the cell work for three minutes.', 'Die Zelle drei Minuten arbeiten lassen.'),
      hint: t('锌片变轻，铜片上放出氢气。', 'The zinc loses mass; hydrogen leaves at the copper.', 'Das Zink wird leichter; am Kupfer entweicht Wasserstoff.'),
      check: all(is(cell('A', 'mass', 'Zn(s)'), null, -5e-4), is(cell('A', 'charge'), 1.5), is(released('A', 'H2(g)'), 5e-6)),
      demo: [...wait(10, 18)] },
    { text: t('把负载换成 100 Ω，看电流怎样变。', 'Change the load to 100 Ω and see what the current does.', 'Die Last auf 100 Ω ändern und beobachten, was der Strom tut.'),
      check: all(wired('A'), is(cell('A', 'I'), 1e-4, 0.006)),
      demo: [{ act: 'circuitSet', id: 'c1', load: 100 }],
      wrong: [{ act: 'circuitSet', id: 'c1', load: 1 }] }
  ]
})

unavailable('c8_models',
  t('搭建甲烷、乙烯、乙醇等分子的球棍模型，认识有机物分子的结构特点。', 'Build ball-and-stick models of methane, ethene, ethanol and others, and see what is typical of the structure of organic molecules.', 'Kugel-Stab-Modelle von Methan, Ethen, Ethanol und anderen bauen und das Typische am Bau organischer Moleküle erkennen.'),
  t('这个实验在物质页的三维查看器里做，实验台上没有可以检查的状态；查看器属于另一个工作包，目前没有“搭建模型并检查”的接口。', 'This experiment belongs in the three-dimensional viewer of the substance pages; the bench has no state to check. The viewer is another work package and has no interface yet for building a model and checking it.', 'Dieser Versuch gehört in den 3D-Betrachter der Stoffseiten; der Labortisch hat keinen Zustand, der sich prüfen ließe. Der Betrachter ist ein anderes Arbeitspaket und hat noch keine Schnittstelle zum Bauen und Prüfen eines Modells.'))

experiment('c9_ethanol_acetic', {
  goal: t('认识乙酸的酸性，以及乙醇被酸性高锰酸钾氧化。', 'Get to know the acidity of acetic acid and the oxidation of ethanol by acidified permanganate.', 'Die Säurestärke von Essigsäure und die Oxidation von Ethanol durch angesäuertes Permanganat kennenlernen.'),
  principle: t('乙酸是弱酸，但比碳酸强，能与碳酸氢钠反应放出二氧化碳。乙醇能被酸性高锰酸钾溶液氧化成乙酸，紫色褪去。', 'Acetic acid is a weak acid but stronger than carbonic acid: with sodium hydrogencarbonate it gives off carbon dioxide. Acidified permanganate oxidises ethanol to acetic acid and loses its purple colour.', 'Essigsäure ist eine schwache Säure, aber stärker als Kohlensäure: Mit Natriumhydrogencarbonat entsteht Kohlenstoffdioxid. Angesäuertes Permanganat oxidiert Ethanol zu Essigsäure und verliert seine violette Farbe.'),
  equations: [eq(['CH3COOH', 'NaHCO3'], ['CH3COONa', 'H2O', 'CO2']), eq(['MnO4-', 'C2H5OH', 'H+'], ['Mn+2', 'CH3COOH', 'H2O'])],
  safety: t('乙醇易燃，远离明火；高锰酸钾会染色。', 'Ethanol is flammable: keep flames away; permanganate stains.', 'Ethanol ist brennbar: offene Flammen fernhalten; Permanganat färbt ab.'),
  reduced: t('乙醇与钠、乙醇的燃烧与催化氧化、酯化反应没有提供：无水乙醇进入容器后被当成溶质 C₂H₅OH(aq)，而这些反应要的是液态乙醇；酯化还要液态硫酸 H₂SO₄(l)，药品架上的浓硫酸进入容器后是离子。', 'Ethanol with sodium, burning and catalytic oxidation of ethanol, and the esterification are not offered: absolute ethanol becomes the solute C₂H₅OH(aq) in a vessel, while these reactions need liquid ethanol; the esterification also needs liquid sulfuric acid H₂SO₄(l), and the concentrated acid of the shelf becomes ions in a vessel.', 'Ethanol mit Natrium, Verbrennung und katalytische Oxidation von Ethanol sowie die Veresterung werden nicht angeboten: Absolutes Ethanol wird im Gefäß zum gelösten Stoff C₂H₅OH(aq), diese Reaktionen brauchen aber flüssiges Ethanol; die Veresterung braucht zudem flüssige Schwefelsäure H₂SO₄(l), und die konzentrierte Säure des Regals wird im Gefäß zu Ionen.'),
  vessels: [V('testTube', 20, { parts: ['phMeter'] }), V('testTube', 20)],
  reagents: ['CH3COOH_1M', 'litmus', 'NaHCO3_solid', 'ethanol', 'H2SO4_1M', 'KMnO4_0.01M'],
  steps: [
    { text: t('试管 A：5 mL 1 mol/L 乙酸溶液中滴 1 滴石蕊试液，读出 pH。', 'Test tube A: add 1 drop of litmus to 5 mL of 1 mol/L acetic acid and read the pH.', 'Reagenzglas A: 1 Tropfen Lackmus zu 5 mL Essigsäure (1 mol/L) geben und den pH-Wert ablesen.'),
      hint: t('1 mol/L 的盐酸 pH 约为 0；乙酸只有约 2.4：它只有一小部分电离。', 'Hydrochloric acid of 1 mol/L has a pH of about 0; acetic acid only about 2.4: only a small part of it is ionised.', 'Salzsäure mit 1 mol/L hat etwa pH 0; Essigsäure nur etwa 2,4: Nur ein kleiner Teil ist dissoziiert.'),
      check: all(is(pH('A'), 2, 3), is(sp('A', 'H(Acetate)'), 0.004), is(sp('A', LITMUS), 1e-8)),
      demo: [add('A', 'CH3COOH_1M', 5), drops('A', 'litmus', 1)],
      wrong: [add('A', 'HCl_1M', 5), drops('A', 'litmus', 1)] },
    { text: t('向 A 中加入 0.5 g 碳酸氢钠。', 'Add 0.5 g of sodium hydrogencarbonate to A.', '0,5 g Natriumhydrogencarbonat zu A geben.'),
      check: is(released('A', 'CO2(g)'), 5e-4),
      demo: [add('A', 'NaHCO3_solid', 0.5, 'g'), ...wait(2, 3)],
      wrong: [add('A', 'NaCl_solid', 0.5, 'g'), ...wait(2, 3)] },
    { text: t('试管 B：2 mL 乙醇、1 mL 1 mol/L 硫酸、1 mL 0.01 mol/L 高锰酸钾溶液，等五分钟。', 'Test tube B: 2 mL of ethanol, 1 mL of 1 mol/L sulfuric acid and 1 mL of 0.01 mol/L potassium permanganate solution; wait five minutes.', 'Reagenzglas B: 2 mL Ethanol, 1 mL Schwefelsäure (1 mol/L) und 1 mL Kaliumpermanganatlösung (0,01 mol/L); fünf Minuten warten.'),
      check: all(is(sp('B', 'MnO4-'), null, 1e-7), is(sp('B', 'H(Acetate)'), 8e-6)),
      demo: [add('B', 'ethanol', 2), add('B', 'H2SO4_1M', 1), add('B', 'KMnO4_0.01M', 1), ...wait(30, 10)],
      wrong: [add('B', 'water', 2), add('B', 'H2SO4_1M', 1), add('B', 'KMnO4_0.01M', 1), ...wait(30, 2)] }
  ]
})

// =====================================================================================================================
// 高中选择性必修 9 个
// =====================================================================================================================

experiment('e1_electroplating', {
  goal: t('在铁制镀件上镀铜。', 'Plate an iron object with copper.', 'Einen Gegenstand aus Eisen verkupfern.'),
  principle: t('镀件接电源负极（阴极），铜离子在它上面得到电子析出；镀层金属铜接正极（阳极），溶解下来补充溶液里的铜离子。', 'The object is connected to the negative pole (cathode), where copper ions take up electrons and deposit; the plating metal copper is connected to the positive pole (anode) and dissolves, replacing the copper ions of the bath.', 'Der Gegenstand liegt am Minuspol (Kathode), wo Kupferionen Elektronen aufnehmen und sich abscheiden; das Überzugsmetall Kupfer liegt am Pluspol (Anode) und löst sich auf, sodass die Kupferionen des Bades ersetzt werden.'),
  equations: [eq(['Cu+2', 'e-'], ['Cu'])],
  safety: t('硫酸铜对水生生物有害，镀液回收；只用低压直流电源。', 'Copper sulfate harms aquatic life: collect the bath; use a low-voltage d.c. supply only.', 'Kupfersulfat schädigt Wasserorganismen: das Bad sammeln; nur eine Niedervolt-Gleichspannungsquelle verwenden.'),
  limits: t('镀层的光亮与附着不在模型里；模型给出的是两个电极质量的变化。', 'Brightness and adhesion of the coating are not modelled; the model gives the change of mass of the two electrodes.', 'Glanz und Haftung des Überzugs sind nicht modelliert; das Modell liefert die Massenänderung der beiden Elektroden.'),
  vessels: [V('beaker', 250, { parts: ['activeElectrode', 'powerSupply', 'ammeter'] })],
  reagents: ['CuSO4_1M'],
  steps: [
    { text: t('镀液：向烧杯 A 加入 150 mL 1 mol/L 硫酸铜溶液。', 'The bath: put 150 mL of 1 mol/L copper(II) sulfate solution into beaker A.', 'Das Bad: 150 mL Kupfer(II)-sulfat-Lösung (1 mol/L) in Becherglas A geben.'),
      check: is(sp('A', ['Cu+2', 'CuSO4']), 0.13),
      demo: [add('A', 'CuSO4_1M', 150)],
      wrong: [add('A', 'Na2SO4_1M', 150)] },
    { text: t('铜电极接电源正极，铁电极（镀件）接负极，电压 1.5 V，通电五分钟。', 'Connect the copper electrode to the positive pole and the iron electrode (the object) to the negative pole, 1.5 V, and let the current flow for five minutes.', 'Die Kupferelektrode an den Pluspol und die Eisenelektrode (den Gegenstand) an den Minuspol legen, 1,5 V, und fünf Minuten Strom fließen lassen.'),
      hint: t('先放进去的电极接正极：先选铜，再选铁，然后加上直流电源。', 'The electrode put in first is on the positive pole: choose copper first, then iron, then add the d.c. supply.', 'Die zuerst eingesetzte Elektrode liegt am Pluspol: erst Kupfer, dann Eisen wählen, dann die Gleichspannungsquelle hinzufügen.'),
      check: all(wired('A'), is(cell('A', 'mass', 'Fe(s)'), 0.003), is(cell('A', 'mass', 'Cu(s)'), null, -0.003)),
      mistakes: [{ when: is(cell('A', 'mass', 'Fe(s)'), null, -0.001), text: t('铁电极在变轻：它接在了正极，自己溶解了。镀件要接负极。', 'The iron electrode is losing mass: it is on the positive pole and dissolves. The object belongs on the negative pole.', 'Die Eisenelektrode verliert Masse: Sie liegt am Pluspol und löst sich auf. Der Gegenstand gehört an den Minuspol.') }],
      demo: [circuit('A', 'Cu(s)', 'A', 'Fe(s)', { source: 1.5 }), ...wait(30, 10)],
      wrong: [circuit('A', 'Fe(s)', 'A', 'Cu(s)', { source: 1.5 }), ...wait(30, 4)] }
  ]
})

experiment('e2_fuel_cell', {
  goal: t('先电解得到氢气和氧气，再撤去电源，让它们在两根碳棒上组成氢氧燃料电池。', 'First make hydrogen and oxygen by electrolysis, then take the supply away and let them form a hydrogen–oxygen fuel cell at two carbon rods.', 'Erst durch Elektrolyse Wasserstoff und Sauerstoff erzeugen, dann die Spannungsquelle entfernen und beide an zwei Kohlestäben eine Wasserstoff-Sauerstoff-Brennstoffzelle bilden lassen.'),
  principle: t('电解时电能变成化学能，水分解成氢气和氧气；撤去电源后反过来：氢气在负极失去电子，氧气在正极得到电子，总反应是氢气和氧气生成水，电子走外电路。', 'During electrolysis electrical energy becomes chemical energy and water is split into hydrogen and oxygen; without the supply it runs backwards: hydrogen gives up electrons at the negative pole, oxygen takes them up at the positive pole, overall hydrogen and oxygen form water, and the electrons travel through the outer circuit.', 'Bei der Elektrolyse wird elektrische in chemische Energie umgewandelt und Wasser in Wasserstoff und Sauerstoff zerlegt; ohne Spannungsquelle läuft es umgekehrt: Wasserstoff gibt am Minuspol Elektronen ab, Sauerstoff nimmt sie am Pluspol auf, insgesamt entsteht aus Wasserstoff und Sauerstoff Wasser, und die Elektronen fließen durch den äußeren Stromkreis.'),
  equations: [eq(['H2O'], ['H2', 'O2']), eq(['H2', 'O2'], ['H2O'])],
  safety: t('氢气易燃易爆，远离明火；只用低压直流电源。', 'Hydrogen is flammable and explosive: keep flames away; use a low-voltage d.c. supply only.', 'Wasserstoff ist brennbar und explosiv: offene Flammen fernhalten; nur eine Niedervolt-Gleichspannungsquelle verwenden.'),
  limits: t('气体在电极上的吸附不在模型里：两种气体都在瓶内的气相里，电极电位取它们的分压；哪根碳棒是负极，模型不按电解时的极性区分。', 'Adsorption of the gases on the electrodes is not modelled: both gases are in the gas space of the bottle and the electrode potentials use their partial pressures; which rod is the negative pole is not told apart by the polarity of the electrolysis.', 'Die Adsorption der Gase an den Elektroden ist nicht modelliert: Beide Gase sind im Gasraum der Flasche, die Elektrodenpotenziale verwenden ihre Partialdrücke; welcher Stab der Minuspol ist, unterscheidet das Modell nicht nach der Polung der Elektrolyse.'),
  vessels: [V('wideBottle', 250, { parts: ['stopper', 'inertElectrode', 'powerSupply', 'resistor', 'voltmeter', 'ammeter'] })],
  reagents: ['Na2SO4_1M'],
  steps: [
    { text: t('向广口瓶 A 加入 150 mL 1 mol/L 硫酸钠溶液，塞上塞子。', 'Put 150 mL of 1 mol/L sodium sulfate solution into bottle A and stopper it.', '150 mL Natriumsulfatlösung (1 mol/L) in Flasche A geben und verschließen.'),
      check: all(is(vol('A'), 140, 160), is(sp('A', 'Na+'), 0.2), flag('closed', 'A')),
      demo: [add('A', 'Na2SO4_1M', 150), stopper('A')],
      wrong: [add('A', 'water', 150), stopper('A')] },
    { text: t('插入两根石墨电极，接 6 V 直流电源，电解两分钟。', 'Dip in two graphite electrodes, connect the 6 V d.c. supply and electrolyse for two minutes.', 'Zwei Graphitelektroden eintauchen, die 6-V-Gleichspannungsquelle anschließen und zwei Minuten elektrolysieren.'),
      check: all(wired('A'), is(gas('A', 'H2(g)'), 5e-5), is(cell('A', 'charge'), 10)),
      demo: [circuit('A', 'C(s)', 'A', 'C(s)', { source: 6 }), ...wait(10, 12)],
      wrong: [circuit('A', 'C(s)', 'A', 'C(s)'), ...wait(10, 3)] },
    { text: t('撤去电源，把负载换成 100 Ω：读电动势。', 'Take the supply away and change the load to 100 Ω: read the e.m.f.', 'Die Spannungsquelle entfernen und die Last auf 100 Ω ändern: die Spannung ablesen.'),
      hint: t('在容器菜单里选“撤去电源”。约 1.2 V：现在是氢气和氧气在供电。', 'Choose “remove the supply” in the vessel’s menu. About 1.2 V: now hydrogen and oxygen deliver the current.', 'Im Gefäßmenü „Spannungsquelle entfernen“ wählen. Etwa 1,2 V: Jetzt liefern Wasserstoff und Sauerstoff den Strom.'),
      check: all(wired('A'), is(cell('A', 'emf'), 0.9, 1.5), is(cell('A', 'I'), 0.005, 0.02)),
      demo: [{ act: 'circuitSet', id: 'c1', source: 0, load: 100 }],
      wrong: [{ act: 'circuitSet', id: 'c1', load: 100 }] },
    { text: t('让电池工作两分钟：氢气在减少。', 'Let the cell work for two minutes: the hydrogen is used up.', 'Die Zelle zwei Minuten arbeiten lassen: Der Wasserstoff wird verbraucht.'),
      check: all(is(cell('A', 'charge'), 0.8, null, true), is(gas('A', 'H2(g)'), null, -3e-6, true)),
      demo: [...wait(10, 12)] }
  ]
})

const NO2_STEPS = j => [
  { text: t(`向塞紧的集气瓶 ${j} 通入 60 mL 二氧化氮，等它回到室温。`, `Lead 60 mL of nitrogen dioxide into the stoppered jar ${j} and wait until it is back at room temperature.`, `60 mL Stickstoffdioxid in den verschlossenen Zylinder ${j} leiten und warten, bis er wieder Raumtemperatur hat.`),
    check: all(is(gas(j, ['NO2(g)', 'N2O4(g)']), 1e-3), is(temp(j), null, 30)),
    demo: [add(j, 'NO2_gas', 60), ...wait(30, 4)],
    wrong: [add(j, 'N2_gas', 60), ...wait(30, 4)] },
  { text: t(`把 ${j} 放入冰水浴：颜色变浅。`, `Put ${j} into the ice bath: the colour fades.`, `${j} ins Eisbad stellen: Die Farbe wird heller.`),
    hint: t('平衡移向无色的四氧化二氮（放热方向）。', 'The equilibrium moves towards colourless dinitrogen tetroxide (the exothermic direction).', 'Das Gleichgewicht verschiebt sich zum farblosen Distickstofftetroxid (exotherme Richtung).'),
    check: all(flag('bath', j), is(temp(j), null, 3), { ratio: [gas(j, 'N2O4(g)'), gas(j, 'NO2(g)')], min: 2 }),
    demo: [bath(j, 273.15), ...wait(30, 4)],
    wrong: [...wait(30, 4)] },
  { text: t(`取下冰水浴，把 ${j} 换到 60 °C 水浴：颜色变深。`, `Take the ice bath away and move ${j} into the 60 °C water bath: the colour deepens.`, `Das Eisbad entfernen und ${j} ins 60-°C-Wasserbad stellen: Die Farbe wird tiefer.`),
    hint: t('从仪器架装上“60 °C 水浴”，原来的冰水浴自动取下。', 'Put the “60 °C water bath” from the apparatus shelf on the jar; the ice bath comes off by itself.', 'Das „60-°C-Wasserbad“ vom Geräteregal an den Zylinder setzen; das Eisbad wird dabei von selbst entfernt.'),
    check: all(flag('bath', j), is(temp(j), 55), { ratio: [gas(j, 'N2O4(g)'), gas(j, 'NO2(g)')], min: 1e-6, max: 0.6 }),
    demo: [attach(j, 'waterBath'), bath(j, 333.15), ...wait(30, 4)],
    wrong: [bath(j, null), ...wait(30, 4)] }
]

experiment('e3_equilibrium', {
  goal: t('探究浓度、酸碱性和温度怎样使化学平衡移动。', 'Find out how concentration, acidity and temperature shift a chemical equilibrium.', 'Untersuchen, wie Konzentration, Säuregrad und Temperatur ein chemisches Gleichgewicht verschieben.'),
  principle: t('改变一个条件，平衡向减弱这种改变的方向移动（勒夏特列原理）。溶液的颜色由各物种的量按比尔定律算出，所以平衡移动看得见。', 'When a condition is changed, the equilibrium moves in the direction that lessens the change (Le Chatelier). The colour of a solution is computed from the amounts of its species by Beer’s law, so the shift can be seen.', 'Ändert man eine Bedingung, verschiebt sich das Gleichgewicht so, dass die Änderung abgeschwächt wird (Le Chatelier). Die Farbe einer Lösung wird aus den Mengen ihrer Spezies nach dem Lambert-Beer-Gesetz berechnet; die Verschiebung ist also sichtbar.'),
  equations: [eq(['Fe+3', 'Thiocyanate-'], ['Fe(Thiocyanate)+2']), eq(['CrO4-2', 'H+'], ['Cr2O7-2', 'H2O']), eq(['NO2'], ['N2O4'])],
  safety: t('铬酸盐与重铬酸盐有毒并致癌，二氧化氮有毒：真实实验戴手套、在通风橱里做，废液回收。', 'Chromates and dichromates are toxic and carcinogenic, nitrogen dioxide is toxic: in the real experiment wear gloves, work in a fume cupboard and collect the waste.', 'Chromate und Dichromate sind giftig und krebserzeugend, Stickstoffdioxid ist giftig: im echten Versuch Handschuhe tragen, im Abzug arbeiten und die Abfälle sammeln.'),
  vessels: [V('testTube', 20), V('testTube', 20), V('gasJar', 125, { parts: ['stopper', 'iceBath'], closed: true })],
  reagents: ['FeCl3_0.01M', 'KSCN_0.01M', 'KSCN_1M', 'NaOH_0.1M', 'K2CrO4_0.1M', 'H2SO4_3M', 'NaOH_6M', 'NO2_gas'],
  steps: [
    { text: t('试管 A：5 mL 0.01 mol/L 氯化铁溶液与 5 mL 0.01 mol/L 硫氰化钾溶液混合。', 'Test tube A: mix 5 mL of 0.01 mol/L iron(III) chloride solution with 5 mL of 0.01 mol/L potassium thiocyanate solution.', 'Reagenzglas A: 5 mL Eisen(III)-chlorid-Lösung (0,01 mol/L) mit 5 mL Kaliumthiocyanatlösung (0,01 mol/L) mischen.'),
      check: is(sp('A', FESCN), 1e-5),
      demo: [add('A', 'FeCl3_0.01M', 5), add('A', 'KSCN_0.01M', 5)] },
    { text: t('向 A 中滴 4 滴 1 mol/L 硫氰化钾溶液：增大反应物的浓度。', 'Add 4 drops of 1 mol/L potassium thiocyanate solution to A: more of a reactant.', '4 Tropfen Kaliumthiocyanatlösung (1 mol/L) zu A geben: mehr von einem Edukt.'),
      hint: t('红色加深：平衡向生成配离子的方向移动。', 'The red deepens: the equilibrium moves towards the complex ion.', 'Das Rot wird tiefer: Das Gleichgewicht verschiebt sich zum Komplexion.'),
      check: is(sp('A', FESCN), 8e-6, null, true),
      demo: [drops('A', 'KSCN_1M', 4)],
      wrong: [add('A', 'water', 0.2)] },
    { text: t('向 A 中加入 3 mL 0.1 mol/L 氢氧化钠溶液：把 Fe³⁺ 沉淀掉。', 'Add 3 mL of 0.1 mol/L sodium hydroxide solution to A: Fe³⁺ is precipitated.', '3 mL Natronlauge (0,1 mol/L) zu A geben: Fe³⁺ wird ausgefällt.'),
      check: all(is(sp('A', FESCN), null, 1e-6), is(solid('A', 'Fe(OH)3(a)'), 3e-5)),
      demo: [add('A', 'NaOH_0.1M', 3)] },
    { text: t('试管 B：3 mL 0.1 mol/L 铬酸钾溶液中滴 5 滴 3 mol/L 硫酸。', 'Test tube B: add 5 drops of 3 mol/L sulfuric acid to 3 mL of 0.1 mol/L potassium chromate solution.', 'Reagenzglas B: 5 Tropfen Schwefelsäure (3 mol/L) zu 3 mL Kaliumchromatlösung (0,1 mol/L) geben.'),
      hint: t('黄色变橙色：铬酸根变成重铬酸根。', 'Yellow turns orange: chromate becomes dichromate.', 'Gelb wird orange: Aus Chromat wird Dichromat.'),
      check: is(sp('B', 'Cr2O7-2'), 5e-5),
      demo: [add('B', 'K2CrO4_0.1M', 3), drops('B', 'H2SO4_3M', 5)],
      wrong: [add('B', 'K2CrO4_0.1M', 3), drops('B', 'water', 5)] },
    { text: t('再向 B 中滴 10 滴 6 mol/L 氢氧化钠溶液。', 'Now add 10 drops of 6 mol/L sodium hydroxide solution to B.', 'Nun 10 Tropfen Natronlauge (6 mol/L) zu B geben.'),
      check: all(is(sp('B', 'Cr2O7-2'), null, 1e-6), is(sp('B', ['CrO4-2', 'NaCrO4-', 'KCrO4-']), 2.5e-4)),
      demo: [drops('B', 'NaOH_6M', 10)] },
    ...NO2_STEPS('C')
  ]
})

experiment('e4_titration', {
  goal: t('用 0.1000 mol/L 氢氧化钠溶液滴定 20.00 mL 盐酸，以酚酞指示终点。', 'Titrate 20.00 mL of hydrochloric acid with 0.1000 mol/L sodium hydroxide solution, with phenolphthalein showing the end point.', '20,00 mL Salzsäure mit Natronlauge (0,1000 mol/L) titrieren; Phenolphthalein zeigt den Endpunkt.'),
  principle: t('恰好中和时 n(H⁺) = n(OH⁻)；接近终点时半滴碱就使 pH 跳过好几个单位，酚酞由无色变为浅红。', 'At the equivalence point n(H⁺) = n(OH⁻); close to it half a drop of alkali makes the pH jump by several units, and phenolphthalein turns from colourless to pale red.', 'Am Äquivalenzpunkt gilt n(H⁺) = n(OH⁻); kurz davor lässt ein halber Tropfen Lauge den pH-Wert um mehrere Einheiten springen, und Phenolphthalein schlägt von farblos nach blassrot um.'),
  equations: [eq(['H+', 'OH-'], ['H2O'])],
  safety: t('氢氧化钠溶液有腐蚀性，戴护目镜；碱液不用玻璃塞的酸式滴定管装。', 'Sodium hydroxide solution is corrosive: wear goggles; alkali is not filled into a burette with a glass tap.', 'Natronlauge ätzt: Schutzbrille tragen; Lauge kommt nicht in eine Bürette mit Glashahn.'),
  limits: t('一滴是 0.05 mL；酚酞自己也消耗一点碱，所以终点比 20.00 mL 略偏。', 'A drop is 0.05 mL; phenolphthalein itself uses a little alkali, so the end point lies slightly off 20.00 mL.', 'Ein Tropfen sind 0,05 mL; Phenolphthalein verbraucht selbst etwas Lauge, der Endpunkt liegt daher leicht neben 20,00 mL.'),
  vessels: [V('erlenmeyer', 250, { parts: ['phMeter'] }), V('buretteBase', 50, { above: 'A' })],
  reagents: ['HCl_0.1M', 'phenolphthalein', 'NaOH_0.1M'],
  steps: [
    { text: t('向锥形瓶 A 加入 20.00 mL 0.1 mol/L 盐酸和 2 滴酚酞。', 'Put 20.00 mL of 0.1 mol/L hydrochloric acid and 2 drops of phenolphthalein into flask A.', '20,00 mL Salzsäure (0,1 mol/L) und 2 Tropfen Phenolphthalein in Kolben A geben.'),
      check: all(is(sp('A', 'Cl-'), 0.0019, 0.0021), is(sp('A', PHPH), 1e-8), is(pH('A'), null, 3)),
      demo: [add('A', 'HCl_0.1M', 20), drops('A', 'phenolphthalein', 2)],
      wrong: [add('A', 'HCl_0.1M', 25), drops('A', 'phenolphthalein', 2)] },
    { text: t('向碱式滴定管 B 装 0.1 mol/L 氢氧化钠溶液到 0 刻度（50.00 mL）。', 'Fill burette B with 0.1 mol/L sodium hydroxide solution to the zero mark (50.00 mL).', 'Bürette B mit Natronlauge (0,1 mol/L) bis zur Nullmarke füllen (50,00 mL).'),
      check: all(is(vol('B'), 49.95, 50.05), is(pH('B'), 12)),
      demo: [add('B', 'NaOH_0.1M', 50)],
      wrong: [add('B', 'HCl_0.1M', 50)] },
    { text: t('滴定：先快后慢，到溶液刚好变为浅红色（pH 8–10）为止。', 'Titrate: quickly at first, then slowly, until the solution has just turned pale red (pH 8–10).', 'Titrieren: erst zügig, dann langsam, bis die Lösung eben blassrot geworden ist (pH 8–10).'),
      hint: t('接近 20 mL 时一滴一滴地加。', 'Near 20 mL go on drop by drop.', 'Bei etwa 20 mL tropfenweise weitergehen.'),
      check: all(is(pH('A'), 8, 10), is(vol('B'), 29.8, 30.2)),
      mistakes: [{ when: is(pH('A'), 10), text: t('滴过了终点：pH 已超过 10，这次的读数偏大，需要重做。', 'Past the end point: the pH is above 10, this reading is too high and the titration has to be repeated.', 'Über den Endpunkt hinaus: Der pH-Wert liegt über 10, der Verbrauch ist zu groß, die Titration muss wiederholt werden.') }],
      demo: [pour('B', 'A', 19.9), pour('B', 'A', 1, 'drop'), pour('B', 'A', 1, 'drop'), pour('B', 'A', 1, 'drop')],
      wrong: [pour('B', 'A', 25)] }
  ]
})

experiment('e5_hydrolysis', {
  goal: t('测几种盐溶液的 pH，并看两个利用水解的例子：氯化铁滴入沸水，硫酸铝与碳酸氢钠混合。', 'Measure the pH of several salt solutions and look at two uses of hydrolysis: iron(III) chloride dropped into boiling water, and aluminium sulfate mixed with sodium hydrogencarbonate.', 'Den pH-Wert einiger Salzlösungen messen und zwei Anwendungen der Hydrolyse ansehen: Eisen(III)-chlorid in siedendem Wasser sowie Aluminiumsulfat mit Natriumhydrogencarbonat.'),
  principle: t('弱酸的酸根结合水里的氢离子，溶液显碱性；弱碱的阳离子结合氢氧根，溶液显酸性；强酸强碱盐不水解。铝离子与碳酸氢根的水解互相促进，生成氢氧化铝和二氧化碳——泡沫灭火器的原理。', 'The anion of a weak acid takes hydrogen ions from water and the solution is alkaline; the cation of a weak base takes hydroxide and the solution is acidic; the salt of a strong acid and a strong base does not hydrolyse. The hydrolyses of aluminium ions and hydrogencarbonate drive each other and give aluminium hydroxide and carbon dioxide — the principle of the foam extinguisher.', 'Das Anion einer schwachen Säure nimmt Wasserstoffionen aus dem Wasser auf, die Lösung ist alkalisch; das Kation einer schwachen Base bindet Hydroxid, die Lösung ist sauer; das Salz aus starker Säure und starker Base hydrolysiert nicht. Die Hydrolysen von Aluminiumionen und Hydrogencarbonat verstärken einander und liefern Aluminiumhydroxid und Kohlenstoffdioxid – das Prinzip des Schaumlöschers.'),
  equations: [eq(['Acetate-', 'H2O'], ['H(Acetate)', 'OH-']), eq(['NH4+'], ['NH3', 'H+']), eq(['Al+3', 'HCO3-'], ['Al(OH)3', 'CO2'])],
  safety: t('加热液体时试管口、烧杯口不对着人。', 'Never point the mouth of a vessel with hot liquid at anyone.', 'Die Öffnung eines Gefäßes mit heißer Flüssigkeit nie auf jemanden richten.'),
  limits: t('氯化铁滴入沸水得到的氢氧化铁胶体和它的丁达尔效应没有模型：这里看到的是溶液变酸、颜色变深。', 'The iron(III) hydroxide colloid from iron(III) chloride in boiling water and its Tyndall effect have no model: what is shown is the solution turning acidic and darker.', 'Das Eisen(III)-hydroxid-Kolloid aus Eisen(III)-chlorid in siedendem Wasser und sein Tyndall-Effekt haben kein Modell: Gezeigt wird, dass die Lösung sauer und dunkler wird.'),
  vessels: [V('testTube', 20, { parts: ['phMeter'] }), V('testTube', 20, { parts: ['phMeter'] }), V('testTube', 20, { parts: ['phMeter'] }), V('testTube', 20, { parts: ['phMeter'] }), V('beaker', 100, { parts: ['hotPlate', 'thermometer', 'phMeter'] }), V('beaker', 100)],
  reagents: ['CH3COONa_0.1M', 'NH4Cl_0.1M', 'Na2CO3_0.1M', 'NaCl_0.1M', 'water', 'FeCl3_sat', 'Al2SO43_0.1M', 'NaHCO3_sat'],
  steps: [
    { text: t('试管 A–D 各加 5 mL 0.1 mol/L 溶液：A 乙酸钠，B 氯化铵，C 碳酸钠，D 氯化钠，读出 pH。', 'Put 5 mL of a 0.1 mol/L solution into each of test tubes A–D: A sodium acetate, B ammonium chloride, C sodium carbonate, D sodium chloride, and read the pH.', 'Je 5 mL einer Lösung mit 0,1 mol/L in die Reagenzgläser A–D geben: A Natriumacetat, B Ammoniumchlorid, C Natriumcarbonat, D Natriumchlorid, und den pH-Wert ablesen.'),
      check: all(is(pH('A'), 8, 9.5), is(pH('B'), 4.5, 6), is(pH('C'), 10.5, 12), is(pH('D'), 6.5, 7.5), is(sp('D', 'Na+'), 4e-4)),
      demo: [add('A', 'CH3COONa_0.1M', 5), add('B', 'NH4Cl_0.1M', 5), add('C', 'Na2CO3_0.1M', 5), add('D', 'NaCl_0.1M', 5)],
      wrong: [add('A', 'NaCl_0.1M', 5), add('B', 'NH4Cl_0.1M', 5), add('C', 'Na2CO3_0.1M', 5), add('D', 'NaCl_0.1M', 5)] },
    { text: t('烧杯 E：40 mL 水加热到沸腾，滴入 5 滴饱和氯化铁溶液。', 'Beaker E: heat 40 mL of water to boiling and add 5 drops of saturated iron(III) chloride solution.', 'Becherglas E: 40 mL Wasser zum Sieden erhitzen und 5 Tropfen gesättigte Eisen(III)-chlorid-Lösung zugeben.'),
      check: all(is(temp('E'), 95), is(pH('E'), null, 2.5), is(colour('E', 'b'), null, 120)),
      demo: [add('E', 'water', 40), heat('E', 300), ...wait(10, 9), drops('E', 'FeCl3_sat', 5), heat('E', 0)],
      wrong: [add('E', 'water', 40), drops('E', 'FeCl3_sat', 5)] },
    { text: t('烧杯 F：10 mL 0.1 mol/L 硫酸铝溶液中加入 10 mL 饱和碳酸氢钠溶液。', 'Beaker F: add 10 mL of saturated sodium hydrogencarbonate solution to 10 mL of 0.1 mol/L aluminium sulfate solution.', 'Becherglas F: 10 mL gesättigte Natriumhydrogencarbonatlösung zu 10 mL Aluminiumsulfatlösung (0,1 mol/L) geben.'),
      check: all(is(solid('F', 'Al(OH)3(a)'), 1.5e-3), is(released('F', 'CO2(g)'), 3e-3)),
      demo: [add('F', 'Al2SO43_0.1M', 10), add('F', 'NaHCO3_sat', 10), ...wait(2, 2)],
      wrong: [add('F', 'Al2SO43_0.1M', 10), add('F', 'NaCl_0.1M', 10)] }
  ]
})

experiment('e6_complexes', {
  goal: t('制备铜氨配离子和银氨配离子，并比较简单离子与配离子的性质。', 'Prepare the tetraamminecopper(II) and the diamminesilver ion, and compare a simple ion with a complex ion.', 'Das Tetraamminkupfer(II)- und das Diamminsilber-Ion herstellen und ein einfaches Ion mit einem Komplexion vergleichen.'),
  principle: t('氨分子与铜离子、银离子形成配离子，使氢氧化铜、氯化银这些难溶物溶解。铁氰化钾里的铁被氰根牢牢配位，不再与硫氰根显色。', 'Ammonia molecules form complex ions with copper and silver ions, which dissolves sparingly soluble copper hydroxide and silver chloride. The iron of hexacyanoferrate(III) is held so firmly by cyanide that it no longer gives the colour with thiocyanate.', 'Ammoniakmoleküle bilden mit Kupfer- und Silberionen Komplexionen; dadurch lösen sich schwerlösliches Kupferhydroxid und Silberchlorid. Das Eisen im Hexacyanoferrat(III) ist so fest an Cyanid gebunden, dass es mit Thiocyanat keine Färbung mehr gibt.'),
  equations: [eq(['Cu+2', 'NH3'], ['Cu(NH3)4+2']), eq(['AgCl', 'NH3'], ['Ag(NH3)2+', 'Cl-'])],
  safety: t('浓氨水有刺激性，在通风处取用；银氨溶液现配现用，不能久置。', 'Concentrated ammonia is irritating: handle it where the air is drawn off; ammoniacal silver solution is made fresh and never kept.', 'Konzentrierte Ammoniaklösung reizt: nur bei guter Lüftung verwenden; ammoniakalische Silberlösung frisch ansetzen und nie aufbewahren.'),
  limits: t('Fe²⁺ 与铁氰化钾生成的蓝色沉淀组成不固定，不在物种库里。', 'The blue precipitate of Fe²⁺ with hexacyanoferrate(III) has no fixed composition and is not in the species database.', 'Der blaue Niederschlag aus Fe²⁺ und Hexacyanoferrat(III) hat keine feste Zusammensetzung und fehlt in der Speziesdatenbank.'),
  vessels: [V('testTube', 20), V('testTube', 20), V('testTube', 20), V('testTube', 20)],
  reagents: ['CuSO4_0.1M', 'NH3_1M', 'NH3_6M', 'AgNO3_0.1M', 'NaCl_0.1M', 'FeCl3_0.1M', 'KSCN_0.1M', 'K3FeCN6_0.1M'],
  steps: [
    { text: t('试管 A：3 mL 0.1 mol/L 硫酸铜溶液中滴 3 滴 1 mol/L 氨水。', 'Test tube A: add 3 drops of 1 mol/L ammonia solution to 3 mL of 0.1 mol/L copper(II) sulfate solution.', 'Reagenzglas A: 3 Tropfen Ammoniaklösung (1 mol/L) zu 3 mL Kupfer(II)-sulfat-Lösung (0,1 mol/L) geben.'),
      check: is(solid('A', 'Cu(OH)2(s)'), 5e-5),
      demo: [add('A', 'CuSO4_0.1M', 3), drops('A', 'NH3_1M', 3)] },
    { text: t('继续向 A 中加入 2 mL 6 mol/L 氨水，直到沉淀溶解。', 'Go on and add 2 mL of 6 mol/L ammonia solution to A until the precipitate has dissolved.', 'Weiter 2 mL Ammoniaklösung (6 mol/L) zu A geben, bis sich der Niederschlag gelöst hat.'),
      hint: t('溶液变成深蓝色。', 'The solution turns deep blue.', 'Die Lösung wird tiefblau.'),
      check: all(is(sp('A', 'Cu(NH3)4+2'), 2e-4), is(solid('A', 'Cu(OH)2(s)'), null, 2e-5)),
      demo: [add('A', 'NH3_6M', 2)],
      wrong: [add('A', 'NaOH_1M', 2)] },
    { text: t('试管 B：2 mL 0.1 mol/L 硝酸银溶液中加入 2 mL 0.1 mol/L 氯化钠溶液。', 'Test tube B: add 2 mL of 0.1 mol/L sodium chloride solution to 2 mL of 0.1 mol/L silver nitrate solution.', 'Reagenzglas B: 2 mL Natriumchloridlösung (0,1 mol/L) zu 2 mL Silbernitratlösung (0,1 mol/L) geben.'),
      check: is(solid('B', 'Cerargyrite'), 1.5e-4),
      demo: [add('B', 'AgNO3_0.1M', 2), add('B', 'NaCl_0.1M', 2)] },
    { text: t('向 B 中加入 2 mL 6 mol/L 氨水。', 'Add 2 mL of 6 mol/L ammonia solution to B.', '2 mL Ammoniaklösung (6 mol/L) zu B geben.'),
      check: all(is(sp('B', 'Ag(NH3)2+'), 1.5e-4), is(solid('B', 'Cerargyrite'), null, 1e-6)),
      demo: [add('B', 'NH3_6M', 2)],
      wrong: [add('B', 'water', 2)] },
    { text: t('试管 C：2 mL 氯化铁溶液加 2 滴硫氰化钾溶液；试管 D：2 mL 铁氰化钾溶液加 2 滴硫氰化钾溶液。', 'Test tube C: 2 mL of iron(III) chloride solution with 2 drops of potassium thiocyanate; test tube D: 2 mL of potassium hexacyanoferrate(III) solution with 2 drops of potassium thiocyanate.', 'Reagenzglas C: 2 mL Eisen(III)-chlorid-Lösung mit 2 Tropfen Kaliumthiocyanat; Reagenzglas D: 2 mL Kaliumhexacyanoferrat(III)-Lösung mit 2 Tropfen Kaliumthiocyanat.'),
      check: all(is(sp('C', FESCN), 5e-6), is(sp('D', 'Ferricyanide-3'), 1.5e-4), is(sp('D', 'Thiocyanate-'), 5e-6), is(sp('D', FESCN), null, 1e-9)),
      demo: [add('C', 'FeCl3_0.1M', 2), drops('C', 'KSCN_0.1M', 2), add('D', 'K3FeCN6_0.1M', 2), drops('D', 'KSCN_0.1M', 2)],
      wrong: [add('C', 'FeCl3_0.1M', 2), drops('C', 'KSCN_0.1M', 2), add('D', 'FeCl3_0.1M', 2), drops('D', 'KSCN_0.1M', 2)] }
  ]
})

experiment('e7_ethyl_acetate', {
  goal: t('比较乙酸乙酯在酸性和碱性条件下的水解。', 'Compare the hydrolysis of ethyl acetate in acid and in alkali.', 'Die Hydrolyse von Essigsäureethylester in saurer und in alkalischer Lösung vergleichen.'),
  principle: t('酯的水解在酸里是可逆的，停在平衡；在碱里生成的乙酸被中和成乙酸根，水解进行到底（直到碱用完）。', 'In acid the hydrolysis of an ester is reversible and stops at equilibrium; in alkali the acetic acid formed is neutralised to acetate and the hydrolysis runs to completion (until the alkali is used up).', 'In Säure ist die Esterhydrolyse umkehrbar und endet im Gleichgewicht; in Lauge wird die entstehende Essigsäure zu Acetat neutralisiert, und die Hydrolyse läuft vollständig ab (bis die Lauge verbraucht ist).'),
  equations: [eq(['CH3COOC2H5', 'H2O'], ['CH3COOH', 'C2H5OH']), eq(['CH3COOC2H5', 'OH-'], ['CH3COO-', 'C2H5OH'])],
  safety: t('乙酸乙酯易燃，用水浴加热，不用明火。', 'Ethyl acetate is flammable: heat with a water bath, never with a flame.', 'Essigsäureethylester ist brennbar: im Wasserbad erwärmen, nie mit offener Flamme.'),
  limits: t('乙酸乙酯在模型里完全溶在水里，没有分层。', 'In the model ethyl acetate dissolves completely in water; there are no two layers.', 'Im Modell löst sich Essigsäureethylester vollständig in Wasser; es gibt keine zwei Schichten.'),
  reduced: t('制备（酯化）没有提供：目录里的酯化反应要求液态硫酸 H₂SO₄(l) 作催化剂，而药品架上的浓硫酸进入容器后是离子；无水乙醇也被当成溶质。', 'The preparation (esterification) is not offered: the esterification of the catalogue needs liquid sulfuric acid H₂SO₄(l) as the catalyst, while the concentrated acid of the shelf becomes ions in a vessel; absolute ethanol, too, is treated as a solute.', 'Die Darstellung (Veresterung) wird nicht angeboten: Die Veresterung des Katalogs verlangt flüssige Schwefelsäure H₂SO₄(l) als Katalysator, die konzentrierte Säure des Regals wird im Gefäß aber zu Ionen; auch absolutes Ethanol gilt als gelöster Stoff.'),
  vessels: [V('testTube', 20, { parts: ['waterBath'] }), V('testTube', 20, { parts: ['waterBath', 'phMeter'] })],
  reagents: ['ethyl_acetate', 'H2SO4_1M', 'NaOH_1M'],
  steps: [
    { text: t('试管 A：5 mL 1 mol/L 硫酸加 1 mL 乙酸乙酯；试管 B：5 mL 1 mol/L 氢氧化钠溶液加 1 mL 乙酸乙酯。', 'Test tube A: 5 mL of 1 mol/L sulfuric acid with 1 mL of ethyl acetate; test tube B: 5 mL of 1 mol/L sodium hydroxide solution with 1 mL of ethyl acetate.', 'Reagenzglas A: 5 mL Schwefelsäure (1 mol/L) mit 1 mL Essigsäureethylester; Reagenzglas B: 5 mL Natronlauge (1 mol/L) mit 1 mL Essigsäureethylester.'),
      check: all(is(solute('A', ['CH3COOC2H5(aq)', 'C2H5OH(aq)']), 0.009), is(pH('A'), null, 1), is(solute('B', ['CH3COOC2H5(aq)', 'C2H5OH(aq)']), 0.009), is(sp('B', 'Na+'), 0.004)),
      demo: [add('A', 'H2SO4_1M', 5), add('A', 'ethyl_acetate', 1), add('B', 'NaOH_1M', 5), add('B', 'ethyl_acetate', 1)] },
    { text: t('把两支试管放入 60 °C 水浴，等五分钟。', 'Put both test tubes into the 60 °C water bath and wait five minutes.', 'Beide Reagenzgläser ins 60-°C-Wasserbad stellen und fünf Minuten warten.'),
      hint: t('看 B 的 pH：碱被水解消耗掉了，酸却没有少。', 'Look at the pH of B: the hydrolysis has used up the alkali, while the acid is not used up.', 'Den pH-Wert von B ansehen: Die Hydrolyse hat die Lauge verbraucht, die Säure dagegen nicht.'),
      check: all(flag('bath', 'A'), flag('bath', 'B'), is(solute('A', 'C2H5OH(aq)'), 0.002), is(solute('B', 'C2H5OH(aq)'), 0.004), is(pH('B'), null, 12)),
      demo: [bath('A', 333.15), bath('B', 333.15), ...wait(30, 10)],
      wrong: [...wait(30, 1)] }
  ]
})

experiment('e8_functional_groups', {
  goal: t('用特征反应检验碳碳双键、酚羟基、醛基和碳溴键。', 'Detect the carbon–carbon double bond, the phenolic hydroxyl group, the aldehyde group and the carbon–bromine bond by their characteristic reactions.', 'Die C=C-Doppelbindung, die phenolische Hydroxygruppe, die Aldehydgruppe und die C–Br-Bindung an ihren typischen Reaktionen erkennen.'),
  principle: t('双键使溴水和酸性高锰酸钾褪色；苯酚与浓溴水生成白色的三溴苯酚；醛基把银氨溶液还原出银；溴乙烷在碱里水解出溴离子，酸化后用硝酸银检出。', 'A double bond decolourises bromine water and acidified permanganate; phenol gives white tribromophenol with bromine water; the aldehyde group reduces ammoniacal silver to silver; bromoethane is hydrolysed in alkali to bromide, which silver nitrate detects after acidifying.', 'Eine Doppelbindung entfärbt Bromwasser und angesäuertes Permanganat; Phenol gibt mit Bromwasser weißes Tribromphenol; die Aldehydgruppe reduziert ammoniakalische Silberlösung zu Silber; Bromethan wird in Lauge zu Bromid hydrolysiert, das nach dem Ansäuern mit Silbernitrat nachgewiesen wird.'),
  equations: [eq(['C2H4', 'Br2'], ['C2H4Br2']), eq(['C6H5OH', 'Br2'], ['C6H2Br3OH', 'HBr']), eq(['C2H5Br', 'OH-'], ['C2H5OH', 'Br-'])],
  safety: t('溴水、苯酚有毒并腐蚀皮肤，乙醛易挥发：真实实验戴手套、在通风橱里做。', 'Bromine water and phenol are toxic and attack the skin, acetaldehyde is volatile: in the real experiment wear gloves and work in a fume cupboard.', 'Bromwasser und Phenol sind giftig und greifen die Haut an, Acetaldehyd ist flüchtig: im echten Versuch Handschuhe tragen und im Abzug arbeiten.'),
  reduced: t('斐林反应（新制氢氧化铜检验醛基）没有提供：加热时引擎的平衡求解失败。苯酚遇氯化铁显紫色也没有：物种库里没有这个配合物。', 'Fehling’s test (freshly made copper hydroxide for the aldehyde group) is not offered: on heating the engine cannot solve the equilibrium. The violet colour of phenol with iron(III) chloride is missing too: the species database has no such complex.', 'Die Fehling-Probe (frisch gefälltes Kupferhydroxid für die Aldehydgruppe) wird nicht angeboten: Beim Erhitzen kann die Engine das Gleichgewicht nicht lösen. Auch die Violettfärbung von Phenol mit Eisen(III)-chlorid fehlt: Die Speziesdatenbank kennt diesen Komplex nicht.'),
  vessels: [V('testTube', 20), V('testTube', 20), V('testTube', 20), V('testTube', 20, { parts: ['waterBath'] }), V('testTube', 20, { parts: ['waterBath', 'phMeter'] })],
  reagents: ['bromine_water', 'C2H4_gas', 'KMnO4_0.01M', 'H2SO4_1M', 'phenol_5pct', 'bromine_water_sat', 'AgNO3_2pct', 'NH3_2pct', 'acetaldehyde_10pct', 'bromoethane', 'NaOH_1M', 'HNO3_2M', 'AgNO3_0.1M'],
  steps: [
    { text: t('试管 A：5 mL 溴水中通入 20 mL 乙烯。', 'Test tube A: lead 20 mL of ethene into 5 mL of bromine water.', 'Reagenzglas A: 20 mL Ethen in 5 mL Bromwasser leiten.'),
      check: all(is(liquid('A', 'C2H4Br2(l)'), 5e-5), is(sp('A', 'Br2'), null, 1e-7)),
      demo: [add('A', 'bromine_water', 5), add('A', 'C2H4_gas', 20)],
      wrong: [add('A', 'bromine_water', 5), add('A', 'N2_gas', 20)] },
    { text: t('试管 B：2 mL 0.01 mol/L 高锰酸钾溶液加 1 mL 1 mol/L 硫酸，通入 20 mL 乙烯。', 'Test tube B: 2 mL of 0.01 mol/L potassium permanganate solution with 1 mL of 1 mol/L sulfuric acid; lead in 20 mL of ethene.', 'Reagenzglas B: 2 mL Kaliumpermanganatlösung (0,01 mol/L) mit 1 mL Schwefelsäure (1 mol/L); 20 mL Ethen einleiten.'),
      check: all(is(sp('B', 'Mn+2'), 1e-5), is(sp('B', 'MnO4-'), null, 1e-8)),
      demo: [add('B', 'KMnO4_0.01M', 2), add('B', 'H2SO4_1M', 1), add('B', 'C2H4_gas', 20)] },
    { text: t('试管 C：2 mL 5 % 苯酚溶液中加入 3 mL 饱和溴水。', 'Test tube C: add 3 mL of saturated bromine water to 2 mL of 5 % phenol solution.', 'Reagenzglas C: 3 mL gesättigtes Bromwasser zu 2 mL 5%iger Phenollösung geben.'),
      check: is(solid('C', 'C6H2Br3OH(s)'), 1e-4),
      demo: [add('C', 'phenol_5pct', 2), add('C', 'bromine_water_sat', 3)],
      wrong: [add('C', 'water', 2), add('C', 'bromine_water_sat', 3)] },
    { text: t('试管 D：2 mL 2 % 硝酸银溶液中加 1 mL 2 % 氨水配成银氨溶液，滴 3 滴乙醛溶液，放入 60 °C 水浴三分钟。', 'Test tube D: make ammoniacal silver solution from 2 mL of 2 % silver nitrate and 1 mL of 2 % ammonia, add 3 drops of acetaldehyde solution and keep it in the 60 °C water bath for three minutes.', 'Reagenzglas D: aus 2 mL 2%iger Silbernitratlösung und 1 mL 2%iger Ammoniaklösung ammoniakalische Silberlösung herstellen, 3 Tropfen Acetaldehydlösung zugeben und drei Minuten ins 60-°C-Wasserbad stellen.'),
      check: is(solid('D', 'Ag(s)'), 5e-5),
      demo: [add('D', 'AgNO3_2pct', 2), add('D', 'NH3_2pct', 1), drops('D', 'acetaldehyde_10pct', 3), bath('D', 333.15), ...wait(30, 6)],
      wrong: [add('D', 'AgNO3_2pct', 2), add('D', 'NH3_2pct', 1), drops('D', 'acetaldehyde_10pct', 3), ...wait(30, 2)] },
    { text: t('试管 E：1 mL 溴乙烷加 3 mL 1 mol/L 氢氧化钠溶液，放入 60 °C 水浴五分钟。', 'Test tube E: 1 mL of bromoethane with 3 mL of 1 mol/L sodium hydroxide solution, five minutes in the 60 °C water bath.', 'Reagenzglas E: 1 mL Bromethan mit 3 mL Natronlauge (1 mol/L), fünf Minuten im 60-°C-Wasserbad.'),
      check: is(sp('E', 'Br-'), 1e-3),
      demo: [add('E', 'bromoethane', 1), add('E', 'NaOH_1M', 3), bath('E', 333.15), ...wait(30, 10)] },
    { text: t('先向 E 加 3 mL 2 mol/L 硝酸酸化，再滴 5 滴硝酸银溶液。', 'First acidify E with 3 mL of 2 mol/L nitric acid, then add 5 drops of silver nitrate solution.', 'E zuerst mit 3 mL Salpetersäure (2 mol/L) ansäuern, dann 5 Tropfen Silbernitratlösung zugeben.'),
      hint: t('不酸化的话，银离子会先与氢氧根生成氧化银。', 'Without acidifying, the silver ions would first give silver oxide with the hydroxide.', 'Ohne Ansäuern würden die Silberionen mit dem Hydroxid zuerst Silberoxid bilden.'),
      check: all(is(pH('E'), null, 2), is(solid('E', 'Bromyrite'), 5e-6)),
      demo: [add('E', 'HNO3_2M', 3), drops('E', 'AgNO3_0.1M', 5)],
      wrong: [drops('E', 'AgNO3_0.1M', 5)] }
  ]
})

experiment('e9_sugars', {
  goal: t('用银镜反应区分葡萄糖和蔗糖，并证明蔗糖水解后生成还原糖。', 'Tell glucose from sucrose with the silver-mirror reaction, and show that sucrose gives a reducing sugar when hydrolysed.', 'Glucose und Saccharose mit der Silberspiegelprobe unterscheiden und zeigen, dass aus Saccharose bei der Hydrolyse ein reduzierender Zucker entsteht.'),
  principle: t('葡萄糖有醛基，能还原银氨溶液；蔗糖没有。蔗糖在酸里水解成葡萄糖和果糖；检验前要先用碱中和酸，因为银镜反应要在碱性条件下进行。', 'Glucose has an aldehyde group and reduces ammoniacal silver; sucrose has none. In acid sucrose is hydrolysed to glucose and fructose; the acid must be neutralised with alkali before the test, because the silver mirror needs an alkaline solution.', 'Glucose hat eine Aldehydgruppe und reduziert ammoniakalische Silberlösung; Saccharose hat keine. In Säure wird Saccharose zu Glucose und Fructose hydrolysiert; vor der Probe muss die Säure mit Lauge neutralisiert werden, weil der Silberspiegel eine alkalische Lösung braucht.'),
  equations: [eq(['C12H22O11', 'H2O'], ['C6H12O6'])],
  safety: t('银氨溶液现配现用，实验后立即用稀硝酸处理，不能久置。', 'Make ammoniacal silver solution fresh, treat it with dilute nitric acid right after the experiment and never keep it.', 'Ammoniakalische Silberlösung frisch ansetzen, nach dem Versuch sofort mit verdünnter Salpetersäure behandeln und nie aufbewahren.'),
  reduced: t('斐林反应没有提供（加热时引擎的平衡求解失败）；淀粉遇碘变蓝也没有：物种库里没有淀粉–碘这个物种。', 'Fehling’s test is not offered (on heating the engine cannot solve the equilibrium); the blue of starch with iodine is missing too: the species database has no starch–iodine species.', 'Die Fehling-Probe wird nicht angeboten (beim Erhitzen kann die Engine das Gleichgewicht nicht lösen); auch das Blau von Stärke mit Iod fehlt: Die Speziesdatenbank kennt keine Stärke-Iod-Spezies.'),
  vessels: [V('testTube', 20, { parts: ['waterBath'] }), V('testTube', 20, { parts: ['waterBath'] }), V('testTube', 20, { parts: ['waterBath', 'phMeter'] })],
  reagents: ['AgNO3_2pct', 'NH3_2pct', 'glucose_10pct', 'sucrose_10pct', 'H2SO4_3M', 'NaOH_1M'],
  steps: [
    { text: t('试管 A：2 mL 2 % 硝酸银溶液加 1.2 mL 2 % 氨水，再加 1 mL 10 % 葡萄糖溶液，放入 60 °C 水浴三分钟。', 'Test tube A: 2 mL of 2 % silver nitrate with 1.2 mL of 2 % ammonia, then 1 mL of 10 % glucose solution; three minutes in the 60 °C water bath.', 'Reagenzglas A: 2 mL 2%ige Silbernitratlösung mit 1,2 mL 2%iger Ammoniaklösung, dann 1 mL 10%ige Glucoselösung; drei Minuten im 60-°C-Wasserbad.'),
      check: is(solid('A', 'Ag(s)'), 1e-4),
      demo: [add('A', 'AgNO3_2pct', 2), add('A', 'NH3_2pct', 1.2), add('A', 'glucose_10pct', 1), bath('A', 333.15), ...wait(30, 6)] },
    { text: t('试管 B：同样的银氨溶液，加 1 mL 10 % 蔗糖溶液，同样水浴三分钟——没有银镜。', 'Test tube B: the same ammoniacal silver solution with 1 mL of 10 % sucrose solution, the same three minutes in the bath — no mirror.', 'Reagenzglas B: die gleiche ammoniakalische Silberlösung mit 1 mL 10%iger Saccharoselösung, ebenso drei Minuten im Bad – kein Spiegel.'),
      check: all(flag('bath', 'B'), is(solute('B', 'Sucrose(aq)'), 2e-4), is(solid('B', 'Ag(s)'), null, 1e-8), is(sp('B', ['Ag(NH3)2+', 'AgNH3+', 'Ag+']), 1e-5), is(time, 150, null, true)),
      demo: [add('B', 'AgNO3_2pct', 2), add('B', 'NH3_2pct', 1.2), add('B', 'sucrose_10pct', 1), bath('B', 333.15), ...wait(30, 6)],
      wrong: [add('B', 'AgNO3_2pct', 2), add('B', 'NH3_2pct', 1.2), add('B', 'glucose_10pct', 1), bath('B', 333.15), ...wait(30, 6)] },
    { text: t('试管 C：3 mL 10 % 蔗糖溶液加 5 滴 3 mol/L 硫酸，放入 60 °C 水浴十分钟。', 'Test tube C: 3 mL of 10 % sucrose solution with 5 drops of 3 mol/L sulfuric acid; ten minutes in the 60 °C water bath.', 'Reagenzglas C: 3 mL 10%ige Saccharoselösung mit 5 Tropfen Schwefelsäure (3 mol/L); zehn Minuten im 60-°C-Wasserbad.'),
      check: is(solute('C', 'Glucose(aq)'), 4e-4),
      demo: [add('C', 'sucrose_10pct', 3), drops('C', 'H2SO4_3M', 5), bath('C', 333.15), ...wait(60, 10)],
      wrong: [add('C', 'sucrose_10pct', 3), drops('C', 'water', 5), bath('C', 333.15), ...wait(60, 3)] },
    { text: t('向 C 加 1.6 mL 1 mol/L 氢氧化钠溶液中和，再加 2 mL 硝酸银溶液和 2 mL 氨水，水浴三分钟。', 'Neutralise C with 1.6 mL of 1 mol/L sodium hydroxide solution, then add 2 mL of silver nitrate solution and 2 mL of ammonia; three minutes in the bath.', 'C mit 1,6 mL Natronlauge (1 mol/L) neutralisieren, dann 2 mL Silbernitratlösung und 2 mL Ammoniaklösung zugeben; drei Minuten im Bad.'),
      check: is(solid('C', 'Ag(s)'), 3e-5),
      demo: [add('C', 'NaOH_1M', 1.6), add('C', 'AgNO3_2pct', 2), add('C', 'NH3_2pct', 2), ...wait(30, 6)],
      wrong: [add('C', 'NaOH_1M', 1.6), add('C', 'water', 4), ...wait(30, 2)] }
  ]
})

// =====================================================================================================================
// 经典演示 14 个
// =====================================================================================================================

experiment('d1_sodium_water', {
  goal: t('观察钠与水的反应，判断生成物。', 'Watch sodium react with water and work out the products.', 'Die Reaktion von Natrium mit Wasser beobachten und die Produkte bestimmen.'),
  principle: t('钠与水剧烈反应，生成氢氧化钠和氢气并放热：酚酞变红说明有碱生成。', 'Sodium reacts vigorously with water to sodium hydroxide and hydrogen and gives off heat: phenolphthalein turning red shows that an alkali has formed.', 'Natrium reagiert heftig mit Wasser zu Natriumhydroxid und Wasserstoff und gibt Wärme ab: Die Rotfärbung von Phenolphthalein zeigt, dass eine Lauge entstanden ist.'),
  equations: [eq(['Na', 'H2O'], ['NaOH', 'H2'])],
  safety: t('只取绿豆大的一粒钠，用镊子夹取、滤纸吸干煤油；戴护目镜，不要俯视烧杯。', 'Take a pea-sized piece of sodium only, with tweezers, and blot off the paraffin oil; wear goggles and do not lean over the beaker.', 'Nur ein erbsengroßes Stück Natrium mit der Pinzette nehmen und das Paraffinöl abtupfen; Schutzbrille tragen und sich nicht über das Becherglas beugen.'),
  limits: t('浮、熔、游、响这些现象由反应的效果标记给出，钠球的运动只是示意。', 'Floating, melting, darting and hissing come from the effect marks of the reaction; the motion of the sodium bead is only a sketch.', 'Schwimmen, Schmelzen, Umherflitzen und Zischen stammen aus den Effektmarken der Reaktion; die Bewegung der Natriumkugel ist nur angedeutet.'),
  vessels: [V('beaker', 250, { parts: ['thermometer', 'phMeter'] })],
  reagents: ['water', 'phenolphthalein', 'Na_lump'],
  steps: [
    { text: t('向烧杯 A 加入 100 mL 水和 2 滴酚酞。', 'Put 100 mL of water and 2 drops of phenolphthalein into beaker A.', '100 mL Wasser und 2 Tropfen Phenolphthalein in Becherglas A geben.'),
      check: all(is(vol('A'), 80, 150), is(sp('A', PHPH), 1e-8), is(pH('A'), null, 8)),
      demo: [add('A', 'water', 100), drops('A', 'phenolphthalein', 2)] },
    { text: t('放入 0.2 g 钠。', 'Put in 0.2 g of sodium.', '0,2 g Natrium hineingeben.'),
      check: all(is(pH('A'), 11), is(released('A', 'H2(g)'), 5e-4), is(temp('A'), 0.3, null, true)),
      demo: [add('A', 'Na_lump', 0.2, 'g'), ...wait(2, 10)],
      wrong: [add('A', 'NaCl_solid', 0.2, 'g'), ...wait(2, 3)] },
    { text: t('等到钠全部反应完。', 'Wait until all the sodium has reacted.', 'Warten, bis alles Natrium reagiert hat.'),
      check: all(is(solid('A', 'Na(s)'), null, 1e-4), is(sp('A', 'Na+'), 0.008)),
      demo: [...wait(30, 20)] }
  ]
})

experiment('d2_copper_nitric', {
  goal: t('比较铜与浓硝酸、与稀硝酸反应的产物。', 'Compare what copper gives with concentrated and with dilute nitric acid.', 'Vergleichen, was Kupfer mit konzentrierter und mit verdünnter Salpetersäure ergibt.'),
  principle: t('浓硝酸被铜还原成红棕色的二氧化氮，稀硝酸被还原成无色的一氧化氮；一氧化氮一遇到氧气就变成二氧化氮。硝酸越稀，氮的价态降得越低。', 'Copper reduces concentrated nitric acid to red-brown nitrogen dioxide and dilute nitric acid to colourless nitrogen monoxide, which turns into nitrogen dioxide as soon as it meets oxygen. The more dilute the acid, the lower the oxidation state the nitrogen reaches.', 'Kupfer reduziert konzentrierte Salpetersäure zu rotbraunem Stickstoffdioxid und verdünnte zu farblosem Stickstoffmonoxid, das mit Sauerstoff sofort zu Stickstoffdioxid wird. Je verdünnter die Säure, desto niedriger die erreichte Oxidationsstufe des Stickstoffs.'),
  equations: [eq(['Cu', 'HNO3'], ['Cu(NO3)2', 'NO2', 'H2O']), eq(['Cu', 'HNO3'], ['Cu(NO3)2', 'NO', 'H2O']), eq(['NO', 'O2'], ['NO2'])],
  safety: t('氮的氧化物有毒：真实实验必须在通风橱里做，尾气用氢氧化钠溶液吸收；浓硝酸强腐蚀。', 'The oxides of nitrogen are toxic: the real experiment belongs in a fume cupboard with the waste gas absorbed in sodium hydroxide solution; concentrated nitric acid is strongly corrosive.', 'Stickoxide sind giftig: Der echte Versuch gehört in den Abzug, das Abgas wird in Natronlauge aufgefangen; konzentrierte Salpetersäure ätzt stark.'),
  limits: t('瓶 B 塞上时带着空气，所以稀硝酸放出的一氧化氮立刻被瓶内的氧气氧化：瓶里看到的是少量二氧化氮，而不是先无色、到瓶口才变色。', 'Flask B is stoppered with air in it, so the nitrogen monoxide from the dilute acid is oxidised at once by the oxygen inside: what the flask shows is a little nitrogen dioxide, not a colourless gas that turns brown only at the mouth.', 'Kolben B wird mit Luft darin verschlossen; das Stickstoffmonoxid aus der verdünnten Säure wird daher sofort vom Sauerstoff im Kolben oxidiert: Man sieht etwas Stickstoffdioxid und kein farbloses Gas, das erst an der Mündung braun wird.'),
  vessels: [V('erlenmeyer', 250, { parts: ['stopper'] }), V('erlenmeyer', 250, { parts: ['stopper'] })],
  reagents: ['HNO3_conc', 'Cu_sheet', 'HNO3_2M', 'Cu_wire'],
  steps: [
    { text: t('锥形瓶 A：10 mL 浓硝酸中放入 1 g 铜片，塞上塞子，等半分钟。', 'Flask A: put 1 g of copper sheet into 10 mL of concentrated nitric acid, stopper it and wait half a minute.', 'Kolben A: 1 g Kupferblech in 10 mL konzentrierte Salpetersäure geben, verschließen und eine halbe Minute warten.'),
      hint: t('瓶内气体变成红棕色。', 'The gas in the flask turns red-brown.', 'Das Gas im Kolben wird rotbraun.'),
      check: all(flag('closed', 'A'), is(gas('A', ['NO2(g)', 'N2O4(g)']), 1e-4), is(sp('A', ['CuNO3+', 'Cu+2', 'Cu(NO3)2']), 1e-4)),
      demo: [add('A', 'HNO3_conc', 10), add('A', 'Cu_sheet', 1, 'g'), stopper('A'), ...wait(5, 6)],
      wrong: [add('A', 'HCl_conc', 10), add('A', 'Cu_sheet', 1, 'g'), stopper('A'), ...wait(5, 3)] },
    { text: t('锥形瓶 B：30 mL 2 mol/L 硝酸中放入 3 g 铜丝，塞上塞子，等两分钟。', 'Flask B: put 3 g of copper wire into 30 mL of 2 mol/L nitric acid, stopper it and wait two minutes.', 'Kolben B: 3 g Kupferdraht in 30 mL Salpetersäure (2 mol/L) geben, verschließen und zwei Minuten warten.'),
      hint: t('反应慢得多；生成的一氧化氮遇到瓶内的氧气变成二氧化氮，比 A 瓶少得多。', 'The reaction is much slower; the nitrogen monoxide formed meets the oxygen in the flask and becomes nitrogen dioxide, far less of it than in flask A.', 'Die Reaktion ist viel langsamer; das entstehende Stickstoffmonoxid trifft auf den Sauerstoff im Kolben und wird zu Stickstoffdioxid, viel weniger als in Kolben A.'),
      check: all(flag('closed', 'B'), is(sp('B', ['CuNO3+', 'Cu+2', 'Cu(NO3)2']), 1e-4), is(gas('B', ['NO2(g)', 'N2O4(g)']), 1e-5), { ratio: [gas('A', ['NO2(g)', 'N2O4(g)']), gas('B', ['NO2(g)', 'N2O4(g)'])], min: 3 }),
      demo: [add('B', 'HNO3_2M', 30), add('B', 'Cu_wire', 3, 'g'), stopper('B'), ...wait(10, 12)],
      wrong: [add('B', 'HCl_1M', 30), add('B', 'Cu_wire', 3, 'g'), stopper('B'), ...wait(10, 3)] }
  ]
})

experiment('d3_chlorine', {
  goal: t('制取氯气，用向上排空气法收集，检验它的氧化性，并用碱液吸收尾气。', 'Prepare chlorine, collect it by upward displacement of air, test its oxidising power and absorb the waste gas in alkali.', 'Chlor darstellen, durch Luftverdrängung nach oben auffangen, seine Oxidationswirkung prüfen und das Abgas in Lauge auffangen.'),
  principle: t('高锰酸钾在常温下就能把浓盐酸氧化成氯气。氯气把碘离子氧化成碘；通入氢氧化钠溶液生成氯化钠和次氯酸钠。', 'Potassium permanganate oxidises concentrated hydrochloric acid to chlorine even at room temperature. Chlorine oxidises iodide to iodine; in sodium hydroxide solution it gives sodium chloride and sodium hypochlorite.', 'Kaliumpermanganat oxidiert konzentrierte Salzsäure schon bei Raumtemperatur zu Chlor. Chlor oxidiert Iodid zu Iod; in Natronlauge entstehen Natriumchlorid und Natriumhypochlorit.'),
  equations: [eq(['KMnO4', 'HCl'], ['KCl', 'MnCl2', 'Cl2', 'H2O']), eq(['Cl2', 'KI'], ['KCl', 'I2']), eq(['Cl2', 'NaOH'], ['NaCl', 'NaClO', 'H2O'])],
  safety: t('氯气剧毒：真实实验只能在通风橱里做，装置必须气密，尾气全部通入氢氧化钠溶液。', 'Chlorine is very toxic: the real experiment is done in a fume cupboard only, the apparatus must be gas-tight and all waste gas goes into sodium hydroxide solution.', 'Chlor ist sehr giftig: Der echte Versuch findet nur im Abzug statt, die Apparatur muss gasdicht sein, und alles Abgas wird in Natronlauge geleitet.'),
  limits: t('氯气使有色物质褪色（次氯酸的漂白）没有模型：染料不是物种。课本的二氧化锰加热法在这里很慢，改用高锰酸钾。', 'Bleaching by chlorine (by hypochlorous acid) has no model: a dye is not a species. The textbook method with manganese(IV) oxide and heat is very slow here; permanganate is used instead.', 'Das Bleichen durch Chlor (durch hypochlorige Säure) hat kein Modell: Ein Farbstoff ist keine Spezies. Das Schulbuchverfahren mit Mangan(IV)-oxid und Wärme ist hier sehr langsam; stattdessen wird Permanganat verwendet.'),
  vessels: [V('erlenmeyer', 250, { parts: ['stopper', 'tube'] }), V('gasJar', 250), V('testTube', 20), V('beaker', 100)],
  reagents: ['KMnO4_solid', 'HCl_conc', 'KI_0.1M', 'NaOH_1M'],
  steps: [
    { text: t('锥形瓶 A 中放 2 g 高锰酸钾，塞上塞子，导管通到集气瓶 B，B 设为向上排空气。', 'Put 2 g of potassium permanganate into flask A, stopper it, lead its tube to gas jar B and set B to upward displacement of air.', '2 g Kaliumpermanganat in Kolben A geben, verschließen, das Rohr zu Zylinder B führen und B auf Luftverdrängung nach oben stellen.'),
      check: all(is(solid('A', 'KMnO4(s)'), 0.01), flag('closed', 'A'), flag('collecting', 'B'), flag('connected', 'A', { to: 'B' })),
      demo: [add('A', 'KMnO4_solid', 2, 'g'), stopper('A'), collect('B', 'up'), connect('A', 'B')] },
    { text: t('向 A 加入 20 mL 浓盐酸，收集氯气。', 'Add 20 mL of concentrated hydrochloric acid to A and collect the chlorine.', '20 mL konzentrierte Salzsäure in A geben und das Chlor auffangen.'),
      check: is(gas('B', 'Cl2(g)', 'mL'), 150),
      demo: [add('A', 'HCl_conc', 20), ...wait(5, 6)],
      wrong: [collect('B', 'down'), add('A', 'HCl_conc', 20), ...wait(5, 6)] },
    { text: t('试管 C 中加 5 mL 0.1 mol/L 碘化钾溶液，把 A 的导管改通到 C，再向 A 补加 5 mL 浓盐酸。', 'Put 5 mL of 0.1 mol/L potassium iodide solution into test tube C, lead the tube of A into C and add another 5 mL of concentrated acid to A.', '5 mL Kaliumiodidlösung (0,1 mol/L) in Reagenzglas C geben, das Rohr von A nach C führen und weitere 5 mL konzentrierte Säure in A geben.'),
      check: { any: [is(solid('C', 'I2(s)'), 5e-5), is(sp('C', ['I3-', 'I2']), 5e-5)] },
      demo: [add('C', 'KI_0.1M', 5), disconnect('A'), connect('A', 'C'), add('A', 'HCl_conc', 5), ...wait(5, 3)],
      wrong: [add('C', 'KI_0.1M', 5), ...wait(5, 2)] },
    { text: t('烧杯 D 中加 50 mL 1 mol/L 氢氧化钠溶液，把 A 的导管改通到 D 吸收尾气。', 'Put 50 mL of 1 mol/L sodium hydroxide solution into beaker D and lead the tube of A into D to absorb the waste gas.', '50 mL Natronlauge (1 mol/L) in Becherglas D geben und das Rohr von A nach D führen, um das Abgas aufzufangen.'),
      check: all(flag('connected', 'A', { to: 'D' }), is(sp('D', 'ClO-'), 1e-5)),
      demo: [add('D', 'NaOH_1M', 50), disconnect('A'), connect('A', 'D'), add('A', 'HCl_conc', 5), ...wait(5, 4)],
      wrong: [add('D', 'water', 50), disconnect('A'), connect('A', 'D'), ...wait(5, 2)] }
  ]
})

experiment('d4_ammonia_fountain', {
  goal: t('制取氨气，用向下排空气法收集，并认识喷泉实验的原因：氨极易溶于水，溶液显碱性。', 'Prepare ammonia, collect it by downward displacement of air, and see the reason for the fountain: ammonia is extremely soluble in water, and its solution is alkaline.', 'Ammoniak darstellen, durch Luftverdrängung nach unten auffangen und die Ursache des Springbrunnens erkennen: Ammoniak löst sich äußerst gut in Wasser, und die Lösung ist alkalisch.'),
  principle: t('氯化铵与氢氧化钙共热放出氨气，它比空气轻。少量水就能溶解烧瓶里几乎全部的氨，瓶内压强骤降——这就是喷泉的动力。', 'Ammonium chloride heated with calcium hydroxide gives off ammonia, which is lighter than air. A little water dissolves nearly all the ammonia in a flask, and the pressure inside falls sharply — this drives the fountain.', 'Ammoniumchlorid gibt beim Erhitzen mit Calciumhydroxid Ammoniak ab, das leichter als Luft ist. Wenig Wasser löst fast alles Ammoniak in einem Kolben, und der Druck darin fällt stark – das treibt den Springbrunnen.'),
  equations: [eq(['NH4Cl', 'Ca(OH)2'], ['CaCl2', 'NH3', 'H2O']), eq(['NH3', 'H2O'], ['NH4+', 'OH-'])],
  safety: t('氨气有强烈刺激性：在通风处做；加热固体时试管口略向下倾斜。', 'Ammonia is strongly irritating: work where the air is drawn off; when heating the solids, tilt the mouth of the test tube slightly downwards.', 'Ammoniak reizt stark: bei guter Lüftung arbeiten; beim Erhitzen der Feststoffe die Öffnung des Reagenzglases leicht nach unten neigen.'),
  limits: t('导出的水蒸气在集气瓶里不凝结，所以收集到的气体里有一半是水蒸气。', 'The water vapour led over does not condense in the jar, so half of the gas collected is water vapour.', 'Der mitgeführte Wasserdampf kondensiert im Zylinder nicht; die Hälfte des aufgefangenen Gases ist daher Wasserdampf.'),
  reduced: t('“喷泉”本身——水被压强差压进烧瓶——没有模型：容器之间没有由压强驱动的液体流动。这里给出的是它的原因：密闭烧瓶 C 里注入少量水后压强的下降和溶液的碱性。烧瓶 C 塞上时带着空气，所以压强不会低于大气压。', 'The fountain itself — water pushed into the flask by the pressure difference — is not modelled: no liquid flows between vessels because of pressure. What is shown is its cause: the fall of the pressure in the stoppered flask C after a little water is injected, and the alkaline solution. Flask C is stoppered with air in it, so the pressure does not fall below that of the room.', 'Der Springbrunnen selbst – Wasser, das der Druckunterschied in den Kolben drückt – ist nicht modelliert: Zwischen Gefäßen fließt keine Flüssigkeit durch Druck. Gezeigt wird die Ursache: der Druckabfall im verschlossenen Kolben C nach dem Einspritzen von wenig Wasser und die alkalische Lösung. Kolben C wird mit Luft darin verschlossen, der Druck fällt daher nicht unter den Raumdruck.'),
  vessels: [V('testTube', 50, { parts: ['stopper', 'tube', 'alcoholBurner'] }), V('gasJar', 250), V('roundFlask', 250, { parts: ['stopper', 'phMeter'], closed: true })],
  reagents: ['NH4Cl_solid', 'CaOH2_powder', 'NH3_gas', 'water', 'phenolphthalein'],
  steps: [
    { text: t('试管 A 中放 2 g 氯化铵和 2 g 氢氧化钙，塞上塞子，导管通到集气瓶 B，B 设为向下排空气。', 'Put 2 g of ammonium chloride and 2 g of calcium hydroxide into test tube A, stopper it, lead its tube to gas jar B and set B to downward displacement of air.', '2 g Ammoniumchlorid und 2 g Calciumhydroxid in Reagenzglas A geben, verschließen, das Rohr zu Zylinder B führen und B auf Luftverdrängung nach unten stellen.'),
      check: all(is(solid('A', 'NH4Cl(s)'), 0.03), is(solid('A', 'Portlandite'), 0.02), flag('closed', 'A'), flag('collecting', 'B'), flag('connected', 'A', { to: 'B' })),
      demo: [add('A', 'NH4Cl_solid', 2, 'g'), add('A', 'CaOH2_powder', 2, 'g'), stopper('A'), collect('B', 'down'), connect('A', 'B')] },
    { text: t('加热 A 约 45 秒，然后熄灭酒精灯。', 'Heat A for about 45 seconds, then put out the burner.', 'A etwa 45 Sekunden erhitzen, dann den Brenner löschen.'),
      check: all(is(gas('B', 'NH3(g)', 'mL'), 80), flag('heating', 'A', { on: false })),
      demo: [heat('A'), ...wait(5, 9), heat('A', 0)],
      wrong: [collect('B', 'up'), heat('A'), ...wait(5, 9), heat('A', 0)] },
    { text: t('向塞紧的烧瓶 C 通入 200 mL 氨气。', 'Lead 200 mL of ammonia into the stoppered flask C.', '200 mL Ammoniak in den verschlossenen Kolben C leiten.'),
      check: is(gas('C', 'NH3(g)'), 0.007),
      demo: [add('C', 'NH3_gas', 200)] },
    { text: t('向 C 注入 5 mL 水和 2 滴酚酞，看压强和颜色。', 'Inject 5 mL of water and 2 drops of phenolphthalein into C and watch the pressure and the colour.', '5 mL Wasser und 2 Tropfen Phenolphthalein in C einspritzen und Druck und Farbe beobachten.'),
      check: all(is(pressure('C'), null, -40, true), is(pH('C'), 10.5), is(sp('C', PHPH), 1e-9)),
      demo: [add('C', 'water', 5), drops('C', 'phenolphthalein', 2)],
      wrong: [add('C', 'CCl4', 5)] }
  ]
})

experiment('d5_thermite', {
  goal: t('观察铝热反应：铝把氧化铁还原成铁。', 'Watch the thermite reaction: aluminium reduces iron(III) oxide to iron.', 'Die Thermitreaktion beobachten: Aluminium reduziert Eisen(III)-oxid zu Eisen.'),
  principle: t('铝比铁活泼得多，与氧结合时放出的热足以使生成的铁熔化；工业上用它焊接钢轨。', 'Aluminium is far more reactive than iron, and the heat set free when it binds oxygen is enough to melt the iron formed; rails are welded this way.', 'Aluminium ist viel unedler als Eisen; die bei der Bindung des Sauerstoffs frei werdende Wärme reicht, um das entstehende Eisen zu schmelzen – so werden Schienen geschweißt.'),
  equations: [eq(['Al', 'Fe2O3'], ['Al2O3', 'Fe'])],
  safety: t('只能由教师在室外或防火台上演示，观看者距离 3 米以上并戴护目镜；下方放盛沙的容器，现场不能有水。', 'A teacher demonstration only, outdoors or on a fireproof bench, the audience at least 3 m away and wearing goggles; a tray of sand underneath, and no water anywhere near.', 'Nur als Lehrerdemonstration im Freien oder auf feuerfester Unterlage, Zuschauer mindestens 3 m entfernt und mit Schutzbrille; darunter eine Schale mit Sand, kein Wasser in der Nähe.'),
  limits: t('模型没有熔化和汽化的潜热，也不向外辐射：给出的温度远高于真实的约 2500 °C。镁条和氯酸钾引燃这一步用“点燃”代替。', 'The model has no latent heat of melting or boiling and no radiation: the temperature it gives is far above the real 2500 °C or so. The fuse of magnesium ribbon and potassium chlorate is replaced by “ignite”.', 'Das Modell kennt keine Schmelz- und Verdampfungswärme und keine Abstrahlung: Die angegebene Temperatur liegt weit über den realen etwa 2500 °C. Die Zündung mit Magnesiumband und Kaliumchlorat wird durch „Entzünden“ ersetzt.'),
  vessels: [V('crucible', 30, { parts: ['burningSplint'] })],
  reagents: ['thermite'],
  steps: [
    { text: t('向坩埚 A 中放入 10 g 铝热剂。', 'Put 10 g of thermite mixture into crucible A.', '10 g Thermitgemisch in Tiegel A geben.'),
      check: all(is(solid('A', 'Al(s)'), 0.05), is(solid('A', 'Hematite'), 0.03)),
      demo: [add('A', 'thermite', 10, 'g')],
      wrong: [add('A', 'Fe2O3_powder', 10, 'g')] },
    { text: t('点燃。', 'Ignite it.', 'Entzünden.'),
      check: all(is(solid('A', 'Fe(s)'), 0.08), is(solid('A', 'Al2O3'), 0.04), is(temp('A'), 500)),
      demo: [ignite('A'), ...wait(1, 10)],
      wrong: [...wait(1, 5)] }
  ]
})

experiment('d6_silver_mirror', {
  goal: t('配制银氨溶液，用乙醛做银镜反应。', 'Make ammoniacal silver solution and carry out the silver-mirror reaction with acetaldehyde.', 'Ammoniakalische Silberlösung herstellen und mit Acetaldehyd die Silberspiegelprobe durchführen.'),
  principle: t('向硝酸银溶液里滴氨水，先生成氧化银沉淀，继续滴加沉淀溶解成银氨配离子。醛基在温热的碱性条件下把它还原成银。', 'Ammonia dropped into silver nitrate solution first precipitates silver oxide, which more ammonia dissolves as the diamminesilver ion. In a warm alkaline solution the aldehyde group reduces it to silver.', 'Ammoniak fällt aus Silbernitratlösung zuerst Silberoxid, das sich mit mehr Ammoniak als Diamminsilber-Ion löst. In warmer alkalischer Lösung reduziert die Aldehydgruppe es zu Silber.'),
  equations: [eq(['Ag+', 'NH3'], ['Ag(NH3)2+'])],
  safety: t('银氨溶液现配现用，久置会生成易爆物；实验后立即用稀硝酸洗去银镜。只用水浴加热。', 'Make ammoniacal silver solution fresh — on standing it forms explosive compounds; wash the mirror away with dilute nitric acid right after the experiment. Heat with a water bath only.', 'Ammoniakalische Silberlösung frisch ansetzen – beim Stehen bilden sich explosive Verbindungen; den Spiegel gleich nach dem Versuch mit verdünnter Salpetersäure entfernen. Nur im Wasserbad erwärmen.'),
  limits: t('银是镀在管壁上还是成为黑色粉末，模型不区分：反应带有“银镜”的效果标记。', 'Whether the silver coats the wall or falls as a black powder is not distinguished: the reaction carries the effect mark “mirror”.', 'Ob das Silber die Wand überzieht oder als schwarzes Pulver ausfällt, unterscheidet das Modell nicht: Die Reaktion trägt die Effektmarke „Spiegel“.'),
  vessels: [V('testTube', 20, { parts: ['waterBath'] })],
  reagents: ['AgNO3_2pct', 'NH3_2pct', 'acetaldehyde_10pct'],
  steps: [
    { text: t('向试管 A 加入 2 mL 2 % 硝酸银溶液，滴 2 滴 2 % 氨水。', 'Put 2 mL of 2 % silver nitrate solution into test tube A and add 2 drops of 2 % ammonia.', '2 mL 2%ige Silbernitratlösung in Reagenzglas A geben und 2 Tropfen 2%ige Ammoniaklösung zugeben.'),
      check: is(solid('A', 'Ag2O'), 5e-6),
      demo: [add('A', 'AgNO3_2pct', 2), drops('A', 'NH3_2pct', 2)] },
    { text: t('继续加氨水（约 1 mL），直到沉淀刚好溶解。', 'Go on adding ammonia (about 1 mL) until the precipitate has just dissolved.', 'Weiter Ammoniaklösung zugeben (etwa 1 mL), bis sich der Niederschlag eben gelöst hat.'),
      check: all(is(solid('A', 'Ag2O'), null, 1e-9), is(sp('A', 'Ag(NH3)2+'), 2e-4)),
      demo: [add('A', 'NH3_2pct', 1)],
      wrong: [add('A', 'water', 1)] },
    { text: t('滴 3 滴乙醛溶液，放入 60 °C 水浴三分钟。', 'Add 3 drops of acetaldehyde solution and keep the tube in the 60 °C water bath for three minutes.', '3 Tropfen Acetaldehydlösung zugeben und das Glas drei Minuten ins 60-°C-Wasserbad stellen.'),
      check: is(solid('A', 'Ag(s)'), 1e-4),
      demo: [drops('A', 'acetaldehyde_10pct', 3), bath('A', 333.15), ...wait(30, 6)],
      wrong: [drops('A', 'acetaldehyde_10pct', 3), ...wait(30, 3)] }
  ]
})

experiment('d7_flame_test', {
  goal: t('用焰色试验辨认钠和钾，并学会透过蓝色钴玻璃看钾的焰色。', 'Recognise sodium and potassium by their flame colours, and learn to see the potassium flame through blue cobalt glass.', 'Natrium und Kalium an ihrer Flammenfärbung erkennen und die Kaliumflamme durch blaues Cobaltglas sehen lernen.'),
  principle: t('金属元素的原子在火焰里发出特定波长的光：钠是黄色，钾是紫色。钠的黄光很强，会盖住钾的紫色；蓝色钴玻璃滤掉黄光。', 'In a flame the atoms of a metal emit light of particular wavelengths: sodium yellow, potassium violet. The yellow of sodium is strong and hides the violet of potassium; blue cobalt glass filters the yellow out.', 'In der Flamme senden die Atome eines Metalls Licht bestimmter Wellenlängen aus: Natrium gelb, Kalium violett. Das starke Gelb des Natriums überdeckt das Violett des Kaliums; blaues Cobaltglas filtert das Gelb heraus.'),
  equations: [],
  safety: t('铂丝每次用前在盐酸里蘸洗并灼烧到无色；注意明火。', 'Dip the platinum wire in hydrochloric acid and heat it until the flame is colourless before each use; mind the flame.', 'Den Platindraht vor jedem Gebrauch in Salzsäure tauchen und ausglühen, bis die Flamme farblos ist; auf die offene Flamme achten.'),
  limits: t('焰色由元素的发射谱线合成；钴玻璃按“滤去钠的谱线”处理。', 'The flame colour is put together from the emission lines of the elements; cobalt glass is treated as “takes out the sodium lines”.', 'Die Flammenfarbe wird aus den Emissionslinien der Elemente zusammengesetzt; Cobaltglas wird als „filtert die Natriumlinien heraus“ behandelt.'),
  vessels: [V('watchGlass', 20, { parts: ['platinumWire'] }), V('watchGlass', 20, { parts: ['platinumWire'] }), V('watchGlass', 20, { parts: ['platinumWire'] })],
  reagents: ['NaCl_solid', 'KCl_solid'],
  steps: [
    { text: t('表面皿 A 上放 0.5 g 氯化钠，用铂丝做焰色试验。', 'Put 0.5 g of sodium chloride on watch glass A and do a flame test with the platinum wire.', '0,5 g Natriumchlorid auf Uhrglas A geben und mit dem Platindraht die Flammenfärbung prüfen.'),
      hint: t('点选容器，在菜单里选“焰色铂丝：焰色试验”。', 'Select the vessel and choose “platinum wire: flame test” in its menu.', 'Das Gefäß wählen und im Menü „Platindraht: Flammenfärbung“ wählen.'),
      check: all(part('A', 'platinumWire'), is(flame('A', 'r'), 200), is(flame('A', 'b'), null, 60)),
      demo: [add('A', 'NaCl_solid', 0.5, 'g')],
      wrong: [add('A', 'NH4Cl_solid', 0.5, 'g')] },
    { text: t('表面皿 B 上放 0.5 g 氯化钾，做焰色试验。', 'Put 0.5 g of potassium chloride on watch glass B and do a flame test.', '0,5 g Kaliumchlorid auf Uhrglas B geben und die Flammenfärbung prüfen.'),
      check: all(part('B', 'platinumWire'), is(flame('B', 'b'), 200)),
      demo: [add('B', 'KCl_solid', 0.5, 'g')],
      wrong: [add('B', 'NaCl_solid', 0.5, 'g')] },
    { text: t('表面皿 C 上放氯化钠和氯化钾各 0.5 g：焰色是黄色，钾被盖住了。', 'Put 0.5 g each of sodium chloride and potassium chloride on watch glass C: the flame is yellow, the potassium is hidden.', 'Je 0,5 g Natriumchlorid und Kaliumchlorid auf Uhrglas C geben: Die Flamme ist gelb, das Kalium bleibt verdeckt.'),
      check: all(is(solid('C', 'Halite'), 0.005), is(solid('C', 'Sylvite'), 0.005), is(flame('C', 'b'), null, 60), is(flame('C', 'r'), 200)),
      demo: [add('C', 'NaCl_solid', 0.5, 'g'), add('C', 'KCl_solid', 0.5, 'g')] },
    { text: t('给 C 加上蓝色钴玻璃再看。', 'Put the blue cobalt glass on C and look again.', 'Das blaue Cobaltglas vor C setzen und erneut hinsehen.'),
      check: all(part('C', 'cobaltGlass'), is(flame('C', 'b'), 200)),
      demo: [attach('C', 'cobaltGlass')],
      wrong: [attach('C', 'thermometer')] }
  ]
})

experiment('d8_zinc_copper_cell', {
  goal: t('用盐桥把锌半电池和铜半电池连成原电池，测它的电动势。', 'Join a zinc and a copper half-cell with a salt bridge to a galvanic cell and measure its e.m.f.', 'Eine Zink- und eine Kupferhalbzelle mit einer Salzbrücke zur galvanischen Zelle verbinden und ihre Spannung messen.'),
  principle: t('锌在自己的盐溶液里失去电子，铜离子在铜片上得到电子；盐桥让离子流动、使电路闭合，两种溶液却不混合。标准电动势约 1.10 V。', 'Zinc gives up electrons in the solution of its own salt, copper ions take them up at the copper; the salt bridge lets ions move and closes the circuit without the solutions mixing. The standard e.m.f. is about 1.10 V.', 'Zink gibt in seiner eigenen Salzlösung Elektronen ab, Kupferionen nehmen sie am Kupfer auf; die Salzbrücke lässt Ionen wandern und schließt den Stromkreis, ohne dass sich die Lösungen mischen. Die Standardspannung beträgt etwa 1,10 V.'),
  equations: [eq(['Zn', 'Cu+2'], ['Zn+2', 'Cu'])],
  safety: t('硫酸铜、硫酸锌对水生生物有害，废液回收。', 'Copper and zinc sulfate harm aquatic life: collect the waste.', 'Kupfer- und Zinksulfat schädigen Wasserorganismen: Abfälle sammeln.'),
  vessels: [V('beaker', 250, { parts: ['activeElectrode', 'voltmeter', 'ammeter'] }), V('beaker', 250, { parts: ['saltBridge'] })],
  reagents: ['ZnSO4_1M', 'CuSO4_1M'],
  steps: [
    { text: t('烧杯 A 加 100 mL 1 mol/L 硫酸锌溶液，烧杯 B 加 100 mL 1 mol/L 硫酸铜溶液。', 'Put 100 mL of 1 mol/L zinc sulfate solution into beaker A and 100 mL of 1 mol/L copper(II) sulfate solution into beaker B.', '100 mL Zinksulfatlösung (1 mol/L) in Becherglas A und 100 mL Kupfer(II)-sulfat-Lösung (1 mol/L) in Becherglas B geben.'),
      check: all(is(sp('A', ['Zn+2', 'ZnSO4', 'Zn(SO4)2-2']), 0.09), is(sp('B', ['Cu+2', 'CuSO4']), 0.09)),
      demo: [add('A', 'ZnSO4_1M', 100), add('B', 'CuSO4_1M', 100)] },
    { text: t('A 中插锌电极，B 中插铜电极——没有盐桥时没有电流。', 'Dip a zinc electrode into A and a copper electrode into B — without a salt bridge no current flows.', 'Eine Zinkelektrode in A und eine Kupferelektrode in B tauchen – ohne Salzbrücke fließt kein Strom.'),
      check: all(wired('A', false), is(cell('A', 'charge'), 0, 1e-9), is(cell('A', 'mass', 'Zn(s)'), -1e-9, 1e-9), is(cell('B', 'mass', 'Cu(s)'), -1e-9, 1e-9)),
      demo: [circuit('A', 'Zn(s)', 'B', 'Cu(s)')],
      wrong: [circuit('A', 'Zn(s)', 'A', 'Zn(s)')] },
    { text: t('架上盐桥，读电动势。', 'Set the salt bridge and read the e.m.f.', 'Die Salzbrücke auflegen und die Spannung ablesen.'),
      check: all(wired('A'), is(cell('A', 'emf'), 1.0, 1.3), is(cell('A', 'I'), 0.01)),
      demo: [{ act: 'circuitSet', id: 'c1', bridge: true }],
      wrong: [{ act: 'circuitSet', id: 'c1', load: 1 }] },
    { text: t('让电池工作五分钟：锌片变轻，铜片变重。', 'Let the cell work for five minutes: the zinc loses mass, the copper gains mass.', 'Die Zelle fünf Minuten arbeiten lassen: Das Zink wird leichter, das Kupfer schwerer.'),
      check: all(is(cell('A', 'mass', 'Zn(s)'), null, -0.003), is(cell('B', 'mass', 'Cu(s)'), 0.002), is(cell('A', 'charge'), 8)),
      demo: [...wait(30, 10)] }
  ]
})

experiment('d9_electrolysis', {
  goal: t('电解水，比较两极气体的量；电解饱和食盐水，认识氯碱工业的三种产物。', 'Electrolyse water and compare the amounts of gas at the two poles; electrolyse saturated brine and get to know the three products of the chlor-alkali process.', 'Wasser elektrolysieren und die Gasmengen an den beiden Polen vergleichen; gesättigte Kochsalzlösung elektrolysieren und die drei Produkte der Chloralkali-Elektrolyse kennenlernen.'),
  principle: t('电解水：阴极放出氢气，阳极放出氧气，2 : 1。电解饱和食盐水：氯离子浓度很大，在石墨阳极上放电的是氯离子，生成氯气；阴极放出氢气，留下氢氧根，溶液变成碱性。', 'Water: hydrogen at the cathode, oxygen at the anode, 2 : 1. Saturated brine: with so much chloride it is the chloride ion that is discharged at the graphite anode, giving chlorine; hydrogen leaves at the cathode and hydroxide stays behind, so the solution turns alkaline.', 'Wasser: Wasserstoff an der Kathode, Sauerstoff an der Anode, 2 : 1. Gesättigte Kochsalzlösung: Bei so viel Chlorid wird an der Graphitanode das Chloridion entladen, es entsteht Chlor; an der Kathode entweicht Wasserstoff, Hydroxid bleibt zurück, die Lösung wird alkalisch.'),
  equations: [eq(['H2O'], ['H2', 'O2']), eq(['NaCl', 'H2O'], ['NaOH', 'H2', 'Cl2'])],
  safety: t('氯气有毒，氢气易燃：真实实验在通风处做，用湿润的淀粉碘化钾试纸检验氯气，只用低压直流电源。', 'Chlorine is toxic and hydrogen flammable: do the real experiment where the air is drawn off, detect chlorine with moist starch–iodide paper and use a low-voltage d.c. supply only.', 'Chlor ist giftig, Wasserstoff brennbar: den echten Versuch bei guter Lüftung durchführen, Chlor mit feuchtem Iodstärkepapier nachweisen und nur eine Niedervolt-Gleichspannungsquelle verwenden.'),
  limits: t('氯离子在阳极放电按目录里的课堂规则判断（浓度高于 0.5 mol/kg 时放出氯气）；过电位是写明的近似值。', 'Whether chloride is discharged at the anode follows the classroom rule of the catalogue (chlorine above 0.5 mol/kg); the overpotentials are stated approximations.', 'Ob Chlorid an der Anode entladen wird, folgt der Unterrichtsregel des Katalogs (Chlor oberhalb von 0,5 mol/kg); die Überspannungen sind ausgewiesene Näherungen.'),
  reduced: t('两极的气体不能分开收集和检验（点燃氢气、用带火星的木条或试纸检验）：它们从敞口烧杯里一起逸出，量由引擎的“放出”读数给出；分开集气的电解槽还不在仪器表里。', 'The gases of the two poles cannot be collected and tested separately (lighting the hydrogen, a glowing splint, test paper): they leave the open beaker together and their amounts are the engine’s “given off” readings; the cell that collects them apart is not in the apparatus table yet.', 'Die Gase der beiden Pole lassen sich nicht getrennt auffangen und prüfen (Wasserstoff entzünden, Glimmspan, Testpapier): Sie entweichen gemeinsam aus dem offenen Becherglas, ihre Mengen sind die „abgegeben“-Werte der Engine; die Zelle zum getrennten Auffangen fehlt noch in der Gerätetabelle.'),
  vessels: [V('beaker', 250, { parts: ['inertElectrode', 'powerSupply', 'ammeter'] }), V('beaker', 250, { parts: ['inertElectrode', 'activeElectrode', 'powerSupply', 'phMeter'] })],
  reagents: ['H2SO4_0.5M', 'NaCl_sat', 'phenolphthalein'],
  steps: [
    { text: t('烧杯 A：加入 150 mL 0.5 mol/L 硫酸（增强导电性），插入两个铂电极，接 6 V 直流电源，通电两分钟。', 'Beaker A: put in 150 mL of 0.5 mol/L sulfuric acid (to make it conduct), dip in two platinum electrodes, connect the 6 V d.c. supply and let the current flow for two minutes.', 'Becherglas A: 150 mL Schwefelsäure (0,5 mol/L) einfüllen (damit es leitet), zwei Platinelektroden eintauchen, die 6-V-Gleichspannungsquelle anschließen und zwei Minuten Strom fließen lassen.'),
      check: all(wired('A'), is(released('A', 'H2(g)'), 2e-5), { ratio: [released('A', 'H2(g)'), released('A', 'O2(g)')], min: 1.9, max: 2.1 }),
      demo: [add('A', 'H2SO4_0.5M', 150), circuit('A', 'Pt(s)', 'A', 'Pt(s)', { source: 6 }), ...wait(10, 12)],
      wrong: [add('A', 'water', 150), circuit('A', 'Pt(s)', 'A', 'Pt(s)', { source: 6 }), ...wait(10, 12)] },
    { text: t('烧杯 B：加入 150 mL 饱和食盐水和 3 滴酚酞。', 'Beaker B: put in 150 mL of saturated brine and 3 drops of phenolphthalein.', 'Becherglas B: 150 mL gesättigte Kochsalzlösung und 3 Tropfen Phenolphthalein einfüllen.'),
      check: all(is(sp('B', 'Cl-'), 0.7), is(sp('B', PHPH), 1e-8), is(pH('B'), null, 8.5)),
      demo: [add('B', 'NaCl_sat', 150), drops('B', 'phenolphthalein', 3)] },
    { text: t('B 中石墨电极接电源正极，铁电极接负极，6 V，通电两分钟。', 'In B connect the graphite electrode to the positive pole and the iron electrode to the negative pole, 6 V, and let the current flow for two minutes.', 'In B die Graphitelektrode an den Pluspol und die Eisenelektrode an den Minuspol legen, 6 V, und zwei Minuten Strom fließen lassen.'),
      hint: t('先放进去的电极接正极：先选石墨，再选铁。溶液变红，说明阴极附近生成了碱。', 'The electrode put in first is on the positive pole: choose graphite first, then iron. The solution turns red: alkali has formed at the cathode.', 'Die zuerst eingesetzte Elektrode liegt am Pluspol: erst Graphit, dann Eisen wählen. Die Lösung wird rot: An der Kathode ist Lauge entstanden.'),
      check: all(wired('B'), is(released('B', 'Cl2(g)'), 1e-4), { ratio: [released('B', 'H2(g)'), released('B', 'Cl2(g)')], min: 0.9, max: 1.1 }, is(pH('B'), 10.5)),
      mistakes: [{ when: is(cell('B', 'mass', 'Fe(s)'), null, -0.001), text: t('铁电极在变轻：它接在了正极，自己溶解了，得不到氯气。铁接负极。', 'The iron electrode is losing mass: it is on the positive pole and dissolves, so no chlorine forms. Iron belongs on the negative pole.', 'Die Eisenelektrode verliert Masse: Sie liegt am Pluspol und löst sich auf, es entsteht kein Chlor. Eisen gehört an den Minuspol.') }],
      demo: [circuit('B', 'C(s)', 'B', 'Fe(s)', { id: 'c2', source: 6 }), ...wait(10, 12)],
      wrong: [circuit('B', 'Fe(s)', 'B', 'C(s)', { id: 'c2', source: 6 }), ...wait(10, 6)] }
  ]
})

experiment('d10_neutralisation_heat', {
  goal: t('用简易量热计测定盐酸与氢氧化钠溶液中和时的温度升高，由此求中和热。', 'Measure the rise of temperature when hydrochloric acid and sodium hydroxide solution neutralise each other in a simple calorimeter, and work out the heat of neutralisation from it.', 'Im einfachen Kalorimeter den Temperaturanstieg bei der Neutralisation von Salzsäure mit Natronlauge messen und daraus die Neutralisationswärme bestimmen.'),
  principle: t('放出的热 Q = c·m·Δt，中和热 = Q ÷ 生成水的物质的量（这里 0.025 mol）。碱稍过量，保证酸完全反应。', 'The heat set free is Q = c·m·Δt, and the heat of neutralisation is Q ÷ the amount of water formed (0.025 mol here). The alkali is in slight excess so that all the acid reacts.', 'Die frei werdende Wärme ist Q = c·m·Δt, die Neutralisationswärme Q ÷ Stoffmenge des gebildeten Wassers (hier 0,025 mol). Die Lauge ist im leichten Überschuss, damit die Säure vollständig reagiert.'),
  equations: [eq(['H+', 'OH-'], ['H2O'])],
  safety: t('酸和碱有腐蚀性，戴护目镜。', 'Acid and alkali are corrosive: wear goggles.', 'Säure und Lauge ätzen: Schutzbrille tragen.'),
  limits: t('量热计的热容和向外的散热取自仪器表；溶解的离子不计入热容（稀溶液的近似）。', 'The heat capacity of the calorimeter and its loss to the room come from the apparatus table; dissolved ions do not count towards the heat capacity (the dilute approximation).', 'Wärmekapazität und Wärmeverlust des Kalorimeters stammen aus der Gerätetabelle; gelöste Ionen zählen nicht zur Wärmekapazität (Näherung für verdünnte Lösungen).'),
  vessels: [V('calorimeter', 150, { parts: ['thermometer'] }), V('measuringCylinder', 100)],
  reagents: ['HCl_0.5M', 'NaOH_0.55M'],
  steps: [
    { text: t('向量热计 A 加入 50 mL 0.5 mol/L 盐酸，记下温度。', 'Put 50 mL of 0.5 mol/L hydrochloric acid into calorimeter A and note the temperature.', '50 mL Salzsäure (0,5 mol/L) ins Kalorimeter A geben und die Temperatur notieren.'),
      check: all(is(vol('A'), 49.5, 50.5), is(sp('A', 'Cl-'), 0.023, 0.026), part('A', 'thermometer')),
      demo: [add('A', 'HCl_0.5M', 50)],
      wrong: [add('A', 'HCl_0.1M', 50)] },
    { text: t('用量筒 B 量取 50 mL 0.55 mol/L 氢氧化钠溶液。', 'Measure 50 mL of 0.55 mol/L sodium hydroxide solution in cylinder B.', '50 mL Natronlauge (0,55 mol/L) im Messzylinder B abmessen.'),
      check: all(is(vol('B'), 49.5, 50.5), is(pH('B'), 13)),
      demo: [add('B', 'NaOH_0.55M', 50)] },
    { text: t('把 B 一次全部倒入 A，读出最高温度。', 'Pour all of B into A in one go and read the highest temperature.', 'B in einem Zug ganz in A gießen und die höchste Temperatur ablesen.'),
      hint: t('温度升高约 3.3 °C。', 'The temperature rises by about 3.3 °C.', 'Die Temperatur steigt um etwa 3,3 °C.'),
      check: all(is(temp('A'), 3.0, 3.6, true), is(vol('A'), 99, 101)),
      mistakes: [{ when: all(is(vol('A'), 55, 95), is(temp('A'), 0.3, null, true)), text: t('碱要一次倒完：分几次加，热量在中途散失，测得的温升偏小。', 'The alkali goes in all at once: added in portions, heat is lost on the way and the rise measured is too small.', 'Die Lauge muss auf einmal hinein: In Portionen zugegeben geht unterwegs Wärme verloren, und der gemessene Anstieg ist zu klein.') }],
      demo: [pour('B', 'A')],
      wrong: [pour('B', 'A', 25)] }
  ]
})

experiment('d11_titration_curves', {
  goal: t('用 pH 计跟踪弱酸（乙酸）和多元酸（磷酸）被氢氧化钠滴定的过程，找出半中和点和各个突跃。', 'Follow with a pH meter how a weak acid (acetic acid) and a polyprotic acid (phosphoric acid) are titrated with sodium hydroxide, and find the half-equivalence point and each jump.', 'Mit dem pH-Meter verfolgen, wie eine schwache Säure (Essigsäure) und eine mehrprotonige Säure (Phosphorsäure) mit Natronlauge titriert werden, und Halbäquivalenzpunkt und Sprünge finden.'),
  principle: t('弱酸被中和一半时 pH = pKa；它的突跃落在碱性范围，所以用酚酞而不用甲基橙。磷酸有两个分得开的突跃，分别在 pH 4.7 和 9.7 附近。强酸强碱的曲线见“强酸与强碱的中和滴定”。', 'When half of a weak acid is neutralised, pH = pKa; its jump lies in the alkaline range, which is why phenolphthalein is used and not methyl orange. Phosphoric acid has two separate jumps, near pH 4.7 and 9.7. For the strong acid–strong base curve see the titration experiment.', 'Ist eine schwache Säure zur Hälfte neutralisiert, gilt pH = pKs; ihr Sprung liegt im Alkalischen, deshalb nimmt man Phenolphthalein und nicht Methylorange. Phosphorsäure hat zwei getrennte Sprünge bei etwa pH 4,7 und 9,7. Die Kurve starke Säure – starke Base zeigt der Titrationsversuch.'),
  equations: [eq(['H(Acetate)', 'OH-'], ['Acetate-', 'H2O']), eq(['H3PO4', 'OH-'], ['H2PO4-', 'H2O']), eq(['H2PO4-', 'OH-'], ['HPO4-2', 'H2O'])],
  safety: t('氢氧化钠溶液有腐蚀性，戴护目镜。', 'Sodium hydroxide solution is corrosive: wear goggles.', 'Natronlauge ätzt: Schutzbrille tragen.'),
  limits: t('这里没有自动画出的 pH–体积曲线：每加一次读一次 pH 计，自己描点。', 'No pH–volume curve is drawn automatically here: read the pH meter after each addition and plot the points yourself.', 'Eine pH-Volumen-Kurve wird hier nicht automatisch gezeichnet: nach jeder Zugabe das pH-Meter ablesen und die Punkte selbst eintragen.'),
  vessels: [V('erlenmeyer', 250, { parts: ['phMeter'] }), V('buretteBase', 50, { above: 'A' }), V('erlenmeyer', 250, { parts: ['phMeter'] }), V('buretteBase', 50, { above: 'C' })],
  reagents: ['CH3COOH_0.1M', 'H3PO4_0.1M', 'NaOH_0.1M'],
  steps: [
    { text: t('锥形瓶 A 加 20.00 mL 0.1 mol/L 乙酸溶液；滴定管 B 装氢氧化钠溶液到 50.00 mL。', 'Put 20.00 mL of 0.1 mol/L acetic acid into flask A; fill burette B with sodium hydroxide solution to 50.00 mL.', '20,00 mL Essigsäure (0,1 mol/L) in Kolben A geben; Bürette B mit Natronlauge auf 50,00 mL füllen.'),
      check: all(is(pH('A'), 2.7, 3.1), is(vol('A'), 19.9, 20.1), is(vol('B'), 49.95, 50.05), is(pH('B'), 12)),
      demo: [add('A', 'CH3COOH_0.1M', 20), add('B', 'NaOH_0.1M', 50)] },
    { text: t('滴入 10.00 mL：半中和点。', 'Run in 10.00 mL: the half-equivalence point.', '10,00 mL zulaufen lassen: der Halbäquivalenzpunkt.'),
      hint: t('这时 pH 等于乙酸的 pKa，约 4.7。', 'The pH now equals the pKa of acetic acid, about 4.7.', 'Der pH-Wert entspricht jetzt dem pKs der Essigsäure, etwa 4,7.'),
      check: all(is(vol('B'), 39.9, 40.1), is(pH('A'), 4.5, 4.9)),
      demo: [pour('B', 'A', 10)],
      wrong: [pour('B', 'A', 15)] },
    { text: t('继续滴到突跃（共约 20 mL，pH 8–10）。', 'Go on to the jump (about 20 mL in all, pH 8–10).', 'Weiter bis zum Sprung (insgesamt etwa 20 mL, pH 8–10).'),
      check: all(is(vol('B'), 29.8, 30.2), is(pH('A'), 8, 10)),
      mistakes: [{ when: is(pH('A'), 10.5), text: t('滴过了突跃：pH 已超过 10.5。', 'Past the jump: the pH is above 10.5.', 'Über den Sprung hinaus: Der pH-Wert liegt über 10,5.') }],
      demo: [pour('B', 'A', 9.9), pour('B', 'A', 0.05), pour('B', 'A', 0.05)],
      wrong: [pour('B', 'A', 5)] },
    { text: t('锥形瓶 C 加 10.00 mL 0.1 mol/L 磷酸；滴定管 D 装氢氧化钠溶液到 50.00 mL，滴到第一个突跃（约 10 mL，pH 4.2–5.2）。', 'Put 10.00 mL of 0.1 mol/L phosphoric acid into flask C; fill burette D with sodium hydroxide solution to 50.00 mL and titrate to the first jump (about 10 mL, pH 4.2–5.2).', '10,00 mL Phosphorsäure (0,1 mol/L) in Kolben C geben; Bürette D mit Natronlauge auf 50,00 mL füllen und bis zum ersten Sprung titrieren (etwa 10 mL, pH 4,2–5,2).'),
      check: all(is(vol('D'), 39.8, 40.2), is(pH('C'), 4.2, 5.2), is(sp('C', ['H2PO4-', 'NaH2PO4']), 8e-4)),
      demo: [add('C', 'H3PO4_0.1M', 10), add('D', 'NaOH_0.1M', 50), pour('D', 'C', 10)],
      wrong: [add('C', 'H3PO4_0.1M', 10), add('D', 'NaOH_0.1M', 50), pour('D', 'C', 5)] },
    { text: t('继续滴到第二个突跃（共约 20 mL，pH 8.8–10.2）。', 'Go on to the second jump (about 20 mL in all, pH 8.8–10.2).', 'Weiter bis zum zweiten Sprung (insgesamt etwa 20 mL, pH 8,8–10,2).'),
      check: all(is(vol('D'), 29.8, 30.2), is(pH('C'), 8.8, 10.2)),
      demo: [pour('D', 'C', 10)],
      wrong: [pour('D', 'C', 5)] }
  ]
})

experiment('d12_precipitate_conversion', {
  goal: t('观察沉淀的转化：氯化银 → 碘化银 → 硫化银，氢氧化镁 → 氢氧化铁。', 'Watch precipitates being converted: silver chloride → silver iodide → silver sulfide, magnesium hydroxide → iron(III) hydroxide.', 'Die Umwandlung von Niederschlägen beobachten: Silberchlorid → Silberiodid → Silbersulfid, Magnesiumhydroxid → Eisen(III)-hydroxid.'),
  principle: t('溶解度小的沉淀能转化成溶解度更小的沉淀：加入的离子把溶液里极少的银离子（或氢氧根）不断拿走，原来的沉淀就不断溶解。', 'A sparingly soluble precipitate turns into an even less soluble one: the ion added keeps taking the few silver ions (or hydroxide ions) out of the solution, and the first precipitate keeps dissolving.', 'Ein schwerlöslicher Niederschlag wandelt sich in einen noch schwerer löslichen um: Das zugegebene Ion entzieht der Lösung fortwährend die wenigen Silberionen (oder Hydroxidionen), und der erste Niederschlag löst sich weiter.'),
  equations: [eq(['AgCl', 'I-'], ['AgI', 'Cl-']), eq(['AgI', 'S-2'], ['Ag2S', 'I-']), eq(['Mg(OH)2', 'Fe+3'], ['Fe(OH)3', 'Mg+2'])],
  safety: t('硫化钠遇酸放出有毒的硫化氢：不要与酸混合；硝酸银会染黑皮肤。', 'Sodium sulfide gives toxic hydrogen sulfide with acids: never mix it with acid; silver nitrate blackens the skin.', 'Natriumsulfid gibt mit Säuren giftigen Schwefelwasserstoff ab: nie mit Säure mischen; Silbernitrat schwärzt die Haut.'),
  vessels: [V('testTube', 20), V('testTube', 20)],
  reagents: ['NaCl_0.1M', 'AgNO3_0.1M', 'KI_0.1M', 'Na2S_0.1M', 'MgCl2_0.1M', 'NaOH_1M', 'FeCl3_0.1M'],
  steps: [
    { text: t('试管 A：3 mL 0.1 mol/L 氯化钠溶液中加入 1 mL 0.1 mol/L 硝酸银溶液。', 'Test tube A: add 1 mL of 0.1 mol/L silver nitrate solution to 3 mL of 0.1 mol/L sodium chloride solution.', 'Reagenzglas A: 1 mL Silbernitratlösung (0,1 mol/L) zu 3 mL Natriumchloridlösung (0,1 mol/L) geben.'),
      check: is(solid('A', 'Cerargyrite'), 8e-5),
      demo: [add('A', 'NaCl_0.1M', 3), add('A', 'AgNO3_0.1M', 1)] },
    { text: t('加入 2 mL 0.1 mol/L 碘化钾溶液：白色变黄色。', 'Add 2 mL of 0.1 mol/L potassium iodide solution: white turns yellow.', '2 mL Kaliumiodidlösung (0,1 mol/L) zugeben: Weiß wird gelb.'),
      check: all(is(solid('A', 'Iodyrite'), 8e-5), is(solid('A', 'Cerargyrite'), null, 1e-6)),
      demo: [add('A', 'KI_0.1M', 2)],
      wrong: [add('A', 'NaCl_0.1M', 2)] },
    { text: t('再加入 2 mL 0.1 mol/L 硫化钠溶液：黄色变黑色。', 'Then add 2 mL of 0.1 mol/L sodium sulfide solution: yellow turns black.', 'Dann 2 mL Natriumsulfidlösung (0,1 mol/L) zugeben: Gelb wird schwarz.'),
      check: all(is(solid('A', 'Acanthite'), 4e-5), is(solid('A', 'Iodyrite'), null, 1e-6)),
      demo: [add('A', 'Na2S_0.1M', 2)],
      wrong: [add('A', 'KI_0.1M', 2)] },
    { text: t('试管 B：3 mL 0.1 mol/L 氯化镁溶液中滴 3 滴 1 mol/L 氢氧化钠溶液。', 'Test tube B: add 3 drops of 1 mol/L sodium hydroxide solution to 3 mL of 0.1 mol/L magnesium chloride solution.', 'Reagenzglas B: 3 Tropfen Natronlauge (1 mol/L) zu 3 mL Magnesiumchloridlösung (0,1 mol/L) geben.'),
      check: is(solid('B', 'Brucite'), 5e-5),
      demo: [add('B', 'MgCl2_0.1M', 3), drops('B', 'NaOH_1M', 3)] },
    { text: t('向 B 加入 1 mL 0.1 mol/L 氯化铁溶液：白色变红褐色。', 'Add 1 mL of 0.1 mol/L iron(III) chloride solution to B: white turns red-brown.', '1 mL Eisen(III)-chlorid-Lösung (0,1 mol/L) zu B geben: Weiß wird rotbraun.'),
      check: all(is(solid('B', 'Fe(OH)3(a)'), 2e-5), is(solid('B', 'Brucite'), null, 1e-6)),
      demo: [add('B', 'FeCl3_0.1M', 1)],
      wrong: [add('B', 'NaCl_0.1M', 1)] }
  ]
})

experiment('d13_equilibrium_shift', {
  goal: t('看两个平衡怎样移动：Fe³⁺ 与 SCN⁻（浓度），NO₂ 与 N₂O₄（温度）。', 'See two equilibria shift: Fe³⁺ with SCN⁻ (concentration), NO₂ with N₂O₄ (temperature).', 'Zwei Gleichgewichte sich verschieben sehen: Fe³⁺ mit SCN⁻ (Konzentration), NO₂ mit N₂O₄ (Temperatur).'),
  principle: t('增大反应物的浓度，平衡向生成物方向移动；减小它，平衡向回移动。二氧化氮聚合成四氧化二氮是放热的：降温时颜色变浅，升温时变深。', 'More of a reactant moves the equilibrium towards the products; less of it moves it back. Nitrogen dioxide combining to dinitrogen tetroxide gives off heat: the colour fades on cooling and deepens on warming.', 'Mehr von einem Edukt verschiebt das Gleichgewicht zu den Produkten, weniger verschiebt es zurück. Die Dimerisierung von Stickstoffdioxid zu Distickstofftetroxid ist exotherm: Beim Abkühlen wird die Farbe heller, beim Erwärmen tiefer.'),
  equations: [eq(['Fe+3', 'Thiocyanate-'], ['Fe(Thiocyanate)+2']), eq(['NO2'], ['N2O4'])],
  safety: t('二氧化氮有毒：真实实验用封好的玻璃球，不打开。', 'Nitrogen dioxide is toxic: the real experiment uses sealed glass bulbs that are never opened.', 'Stickstoffdioxid ist giftig: Der echte Versuch verwendet zugeschmolzene Glaskugeln, die nie geöffnet werden.'),
  vessels: [V('testTube', 20), V('gasJar', 125, { parts: ['stopper', 'iceBath'], closed: true })],
  reagents: ['FeCl3_0.01M', 'KSCN_0.01M', 'FeCl3_sat', 'NaOH_1M', 'NO2_gas'],
  steps: [
    { text: t('试管 A：5 mL 0.01 mol/L 氯化铁溶液与 5 mL 0.01 mol/L 硫氰化钾溶液混合。', 'Test tube A: mix 5 mL of 0.01 mol/L iron(III) chloride solution with 5 mL of 0.01 mol/L potassium thiocyanate solution.', 'Reagenzglas A: 5 mL Eisen(III)-chlorid-Lösung (0,01 mol/L) mit 5 mL Kaliumthiocyanatlösung (0,01 mol/L) mischen.'),
      check: is(sp('A', FESCN), 1e-5),
      demo: [add('A', 'FeCl3_0.01M', 5), add('A', 'KSCN_0.01M', 5)] },
    { text: t('滴 2 滴饱和氯化铁溶液：红色加深。', 'Add 2 drops of saturated iron(III) chloride solution: the red deepens.', '2 Tropfen gesättigte Eisen(III)-chlorid-Lösung zugeben: Das Rot wird tiefer.'),
      check: is(sp('A', FESCN), 5e-6, null, true),
      demo: [drops('A', 'FeCl3_sat', 2)],
      wrong: [drops('A', 'water', 2)] },
    { text: t('加入 1 mL 1 mol/L 氢氧化钠溶液：Fe³⁺ 被沉淀，红色褪去。', 'Add 1 mL of 1 mol/L sodium hydroxide solution: Fe³⁺ is precipitated and the red goes.', '1 mL Natronlauge (1 mol/L) zugeben: Fe³⁺ wird ausgefällt, das Rot verschwindet.'),
      check: all(is(sp('A', FESCN), null, -5e-6, true), is(solid('A', 'Fe(OH)3(a)'), 1e-4)),
      demo: [add('A', 'NaOH_1M', 1)],
      wrong: [add('A', 'NaCl_0.1M', 1)] },
    ...NO2_STEPS('B')
  ]
})

experiment('d14_iodine_clock', {
  goal: t('做一个“碘钟”：溶液先保持无色，过一会儿突然显色。', 'Run an “iodine clock”: the solution stays colourless at first and suddenly shows colour after a while.', 'Eine „Ioduhr“ laufen lassen: Die Lösung bleibt zunächst farblos und zeigt nach einer Weile plötzlich Farbe.'),
  principle: t('过氧化氢慢慢把碘离子氧化成碘，硫代硫酸根立刻又把碘还原回去；等硫代硫酸根用完，碘才留得下来。显色前的时间由慢反应的速率和硫代硫酸钠的量决定。', 'Hydrogen peroxide slowly oxidises iodide to iodine, and thiosulfate at once reduces the iodine back; only when the thiosulfate is used up does iodine stay. The time before the colour is set by the rate of the slow reaction and the amount of thiosulfate.', 'Wasserstoffperoxid oxidiert Iodid langsam zu Iod, und Thiosulfat reduziert das Iod sofort zurück; erst wenn das Thiosulfat verbraucht ist, bleibt Iod übrig. Die Zeit bis zur Färbung bestimmen die Geschwindigkeit der langsamen Reaktion und die Thiosulfatmenge.'),
  equations: [eq(['H2O2', 'I-', 'H+'], ['I2', 'H2O']), eq(['I2', 'S2O3-2'], ['I-', 'S4O6-2'])],
  safety: GOGGLES,
  limits: t('淀粉遇碘的蓝色没有对应的物种：这里的钟以三碘离子的黄褐色结束，而不是突然变蓝。', 'The blue of starch with iodine has no species: this clock ends in the yellow-brown of triiodide instead of a sudden blue.', 'Das Blau von Stärke mit Iod hat keine Spezies: Diese Uhr endet im Gelbbraun des Triiodids statt in einem plötzlichen Blau.'),
  vessels: [V('beaker', 100)],
  reagents: ['KI_0.1M', 'Na2S2O3_0.01M', 'H2SO4_0.1M', 'starch_1pct', 'H2O2_3pct'],
  steps: [
    { text: t('烧杯 A 中依次加入 10 mL 0.1 mol/L 碘化钾、5 mL 0.01 mol/L 硫代硫酸钠、5 mL 0.1 mol/L 硫酸和 1 mL 淀粉溶液。', 'Put into beaker A, one after the other, 10 mL of 0.1 mol/L potassium iodide, 5 mL of 0.01 mol/L sodium thiosulfate, 5 mL of 0.1 mol/L sulfuric acid and 1 mL of starch solution.', 'Nacheinander 10 mL Kaliumiodid (0,1 mol/L), 5 mL Natriumthiosulfat (0,01 mol/L), 5 mL Schwefelsäure (0,1 mol/L) und 1 mL Stärkelösung in Becherglas A geben.'),
      check: all(is(sp('A', 'I-'), 9e-4), is(sp('A', ['S2O3-2', 'HS2O3-', 'NaS2O3-', 'KS2O3-']), 4e-5), is(pH('A'), null, 2.5)),
      demo: [add('A', 'KI_0.1M', 10), add('A', 'Na2S2O3_0.01M', 5), add('A', 'H2SO4_0.1M', 5), add('A', 'starch_1pct', 1)] },
    { text: t('加入 5 mL 3 % 过氧化氢溶液，让时间流逝，等溶液显色。', 'Add 5 mL of 3 % hydrogen peroxide, let time pass and wait for the colour.', '5 mL 3%iges Wasserstoffperoxid zugeben, Zeit laufen lassen und auf die Färbung warten.'),
      hint: t('显色之前，生成的碘都被硫代硫酸根消耗掉了。', 'Before the colour appears, all the iodine formed is used up by the thiosulfate.', 'Bevor die Farbe erscheint, wird alles entstandene Iod vom Thiosulfat verbraucht.'),
      check: all(is(sp('A', 'I3-'), 5e-6), is(sp('A', 'S4O6-2'), 2e-5), is(time, 5, null, true)),
      demo: [add('A', 'H2O2_3pct', 5), ...wait(5, 6)],
      wrong: [add('A', 'water', 5), ...wait(5, 6)] }
  ]
})

// =====================================================================================================================
// Output
// =====================================================================================================================

if (list.length !== 40) throw new Error(`expected 40 experiments, have ${list.length}`)
const order = map.experiments.map(e => e.id)
list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
for (const [zh, en, de] of UI_TEXTS) t(zh, en, de)

/** One experiment as source text: a line per field, a line per field of a step. */
function ser(e) {
  const fields = o => Object.keys(o).map(k => `${JSON.stringify(k)}: ${JSON.stringify(o[k])}`)
  const NL = String.fromCharCode(10)
  const steps = e.steps.map(s => ['   {', fields(s).map(l => '    ' + l).join(',' + NL), '   }'].join(NL)).join(',' + NL)
  const { steps: _steps, ...rest } = e
  return [' {', fields(rest).map(l => '  ' + l).join(',' + NL) + ',', steps ? ['  "steps": [', steps, '  ]'].join(NL) : '  "steps": []', ' }'].join(NL)
}

const data = `/**
 * The forty guided experiments of D270 (26.64). GENERATED by scripts/chem/build_experiments.mjs — edit that file
 * (it holds every text in three languages) and run it again; the texts here are the Chinese source texts of
 * src/i18n/texts/v2664exp.ts. Vessels are named by their letter (A, B …: the order of \`vessels\`).
 */
import type { Experiment } from './types'

export const EXPERIMENTS: Experiment[] = [
${list.map(ser).join(',' + String.fromCharCode(10))}
]
`
writeFileSync(join(repo, 'src', 'chem', 'experiments', 'data.ts'), data)

// texts that another table of the interface already holds are not written a second time
const dir = join(repo, 'src', 'i18n', 'texts')
const taken = new Set()
for (const f of readdirSync(dir)) {
  if (f === 'v2664exp.ts' || !f.endsWith('.ts')) continue
  const src = readFileSync(join(dir, f), 'utf8')
  for (const m of src.matchAll(/^\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*:\s*\[/gm)) {
    const raw = m[1]
    try { taken.add(raw[0] === '"' ? JSON.parse(raw) : JSON.parse('"' + raw.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"')) } catch { /* not a plain key */ }
  }
}
const lines = [...texts].filter(([zh]) => !taken.has(zh) && /[一-鿿]/.test(zh)).map(([zh, [en, de]]) => `  ${JSON.stringify(zh)}: [${JSON.stringify(en)}, ${JSON.stringify(de)}],`)
const table = `/**
 * Interface texts of 26.64: the guided experiments of the chemistry bench (D270) — their goals, steps, hints,
 * explanations and safety notes, and the runner's own texts. GENERATED by scripts/chem/build_experiments.mjs.
 * One entry per Chinese source text: \`'中文': ['English', 'Deutsch']\` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2664_EXP: Record<string, readonly [string, string]> = {
${lines.join('\n')}
}
`
writeFileSync(join(dir, 'v2664exp.ts'), table)
console.log(`${list.length} experiments (${list.filter(e => e.unavailable).length} unavailable, ${list.filter(e => e.reduced).length} reduced), ${list.reduce((n, e) => n + e.steps.length, 0)} steps, ${lines.length} texts (${texts.size - lines.length} already in other tables)`)
