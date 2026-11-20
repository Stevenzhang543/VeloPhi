/**
 * Where things went (26.64, D246 "功能一个不少"). The inventory of 26.63 — every control with a `data-ui`, every menu
 * item, every command of the global search — is the snapshot tests/fixtures/inventory-26.63.json, taken from the 26.63
 * source by scripts/ui-inventory.mjs. tests/shell/inventory2664.test.ts requires every entry of it either to exist
 * unchanged in the current source (the same id, label or title in the same component file — a file moved to another
 * folder needs no row), or to have a row here whose
 * destination exists in the current source and whose `command` is a command of the global search (Ctrl+K), so that
 * nothing a user knew how to reach is lost when the shell moves it.
 *
 * One row per moved, renamed or merged entry. Whoever moves a control adds its row in the same change:
 *   kind      which list of the snapshot the entry is in
 *   from      its `data-ui` id (or the bound expression), its menu label, or its command title — as in the snapshot
 *   fromFile  the file it was in (for `dataUi` and `menuItem`; several entries may share an id)
 *   to        where it lives now: a `data-ui` id, a menu label or a command title, and for the first two the file
 *   command   the title of the global-search command that reaches the feature (as written in CommandPalette.vue), or
 *             IS_SEARCH when the moved thing is itself an entry to the global search
 *   note      why, in a line (English)
 *
 * Menu labels and command titles are Chinese source texts quoted as data — some of them no longer exist in the
 * interface. They are written `src({ zh: '…' })`, which the text extraction (scripts/i18n-keys.mjs) leaves alone.
 */
export interface InventoryMove {
  kind: 'dataUi' | 'menuItem' | 'command'
  from: string
  fromFile?: string
  to: { dataUi?: string; menuItem?: string; command?: string; file?: string }
  command: string
  note: string
}

/** `command` of a control that opened the global search itself. */
export const IS_SEARCH = '(global search)'

/** A source text quoted as data. */
const src = (t: { zh: string }): string => t.zh
const C = 'src/app/components/'

const TALLY_ITEM = src({ zh: '先猜后看：班级预测统计…' })
const TALLY_COMMAND = src({ zh: '先猜后看：班级预测统计' })
const CLASSROOM_COMMAND = src({ zh: '课堂' })

export const INVENTORY_MOVES: InventoryMove[] = [
  // ---- 26.64 shell (D240–D241): five panels, the classroom as a section of the library, the short home page ----
  { kind: 'dataUi', from: 'classroom-tally', fromFile: `${C}ClassroomPage.vue`, to: { dataUi: 'classroom-tally', file: `${C}ClassroomSection.vue` }, command: CLASSROOM_COMMAND, note: 'the classroom page is the classroom section of the library' },
  { kind: 'dataUi', from: 'home-search', fromFile: `${C}HomePage.vue`, to: { dataUi: 'search', file: `${C}NavRail.vue` }, command: IS_SEARCH, note: 'the home page keeps title, sentence and jumps only; search is the button of the rail and Ctrl+K' },
  { kind: 'dataUi', from: 'teach', fromFile: `${C}TopBar.vue`, to: { dataUi: 'teach', file: `${C}TeachMenu.vue` }, command: TALLY_COMMAND, note: 'the Teaching menu is one component shared by the experiment panels' },
  { kind: 'dataUi', from: 'tally', fromFile: `${C}TopBar.vue`, to: { dataUi: 'tally', file: `${C}TeachMenu.vue` }, command: TALLY_COMMAND, note: 'an item of the shared Teaching menu' },
  { kind: 'menuItem', from: TALLY_ITEM, fromFile: `${C}TopBar.vue`, to: { menuItem: TALLY_ITEM, file: `${C}TeachMenu.vue` }, command: TALLY_COMMAND, note: 'an item of the shared Teaching menu' },
  { kind: 'menuItem', from: src({ zh: '课堂页：课堂实验与活动' }), fromFile: `${C}TopBar.vue`, to: { menuItem: src({ zh: '资源库的课堂分区' }), file: `${C}TeachMenu.vue` }, command: CLASSROOM_COMMAND, note: 'the classroom page is the classroom section of the library' },
  { kind: 'command', from: src({ zh: '工作台' }), to: { command: src({ zh: '运动' }) }, command: src({ zh: '运动' }), note: 'the panel is named for what is done there; the old name still finds it in the search' },
  // ---- 26.64 motion bar (D245): 题目, 视图, 教学, 计算 are the four groups of 更多; the strip keeps six tools ----
  { kind: 'dataUi', from: 'problems', fromFile: `${C}TopBar.vue`, to: { dataUi: 'problems', file: `${C}TopBar.vue` }, command: src({ zh: '题目库' }), note: 'a button of the bar became the Problems group of the More panel (same id, one level down)' },
  { kind: 'dataUi', from: 'view', fromFile: `${C}TopBar.vue`, to: { dataUi: 'view', file: `${C}TopBar.vue` }, command: src({ zh: '视图' }), note: 'the View menu became the View group of the More panel (same id, one level down)' },
  { kind: 'dataUi', from: 'compute', fromFile: `${C}TopBar.vue`, to: { dataUi: 'compute', file: `${C}TopBar.vue` }, command: src({ zh: '计算' }), note: 'the menu beside the run button became the Calculation group of the More panel (same id, one level down)' },
  { kind: 'dataUi', from: 'sidebar', fromFile: `${C}TopBar.vue`, to: { dataUi: 'sidebar', file: `${C}TopBar.vue` }, command: src({ zh: '侧栏' }), note: 'the sidebar switch is in the View group of the More panel (its shortcut is unchanged; the sidebar also folds from its own rail)' },
  { kind: 'dataUi', from: 'objects', fromFile: `${C}ToolStrip.vue`, to: { dataUi: 'objects', file: `${C}ToolStrip.vue` }, command: src({ zh: '对象列表' }), note: 'the object list opens from the All tools flyout, with its name' },
  // ---- 26.64 walkthrough (D248–D251): the welcome dialog and the six-slide tour became Help › 入门 ----
  { kind: 'menuItem', from: src({ zh: '欢迎与导览' }), fromFile: `${C}NavRail.vue`, to: { menuItem: src({ zh: '入门' }), file: `${C}NavRail.vue` }, command: src({ zh: '入门' }), note: 'the walkthrough over the real interface replaces the welcome dialog and the tour' },
  { kind: 'command', from: src({ zh: '欢迎与导览' }), to: { command: src({ zh: '入门' }) }, command: src({ zh: '入门' }), note: 'the walkthrough replaces the welcome dialog; each of its five segments is a command too' },
  { kind: 'command', from: src({ zh: '实验室' }), to: { command: src({ zh: '物理实验' }) }, command: src({ zh: '物理实验' }), note: 'physics experiments, beside the new chemistry panel; the old name still finds it in the search' },
  // ---- 26.65 (D290–D292): one bar per panel; the sidebar's views are chosen on the studio bar ----
  { kind: 'dataUi', from: '`mode-${m.id}`', fromFile: `${C}TopBar.vue`, to: { dataUi: 'studio-more', file: `${C}TopBar.vue` }, command: src({ zh: '视图' }), note: 'the three modes were layout presets; the layout follows what you do, and More › View restores the default' },
  { kind: 'dataUi', from: "`tab-${t.id === 'inspect' ? 'inspect-rail' : t.id}`", fromFile: `${C}Sidebar.vue`, to: { dataUi: 'v.ui', file: `${C}TopBar.vue` }, command: src({ zh: '侧栏' }), note: 'the folded rail of the sidebar is gone; the views are buttons at the end of the studio bar' },
  { kind: 'dataUi', from: "t.id === 'analysis' ? 'tab-analysis' : t.id === 'ai' ? 'tab-ai' : t.id === 'problem' ? 'tab-problems' : 'tab-props'", fromFile: `${C}Sidebar.vue`, to: { dataUi: 'v.ui', file: `${C}TopBar.vue` }, command: src({ zh: '侧栏' }), note: 'the sidebar has no tab row of its own; its views are chosen on the studio bar (pressing the view shown folds it)' },
  { kind: 'dataUi', from: 'copilot', fromFile: `${C}TopBar.vue`, to: { dataUi: 'v.ui', file: `${C}TopBar.vue` }, command: src({ zh: '侧栏' }), note: 'AI is one of the sidebar views on the studio bar (it was a separate button and a sidebar tab)' },
  { kind: 'dataUi', from: 'search', fromFile: `${C}TopBar.vue`, to: { dataUi: 'search', file: `${C}NavRail.vue` }, command: IS_SEARCH, note: 'the experiment panels have no title bar on the desktop; search is the rail button and Ctrl+K' }
]
