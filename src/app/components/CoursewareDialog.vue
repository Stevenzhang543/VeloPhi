<script setup lang="ts">
/**
 * Courseware package dialog (decision D15): choose the key moments (events, stage starts, start/end, own
 * times) and the contents — video, screenshots, formula cards, CSV, PPTX — then export one ZIP or the
 * individual files. Everything is generated offline with the screen's renderer.
 *
 * Mounted by App.vue while `state.showCourseware` is true (and a recording exists); closes itself by setting
 * the flag to false. No props, no emits.
 */
import { computed, reactive, ref } from 'vue'
import { state, showToast, viewCamera } from '../store'
import { settings, toDisp, unitLabel } from '../settings'
import { listQuantities } from '../../core/observe/quantities'
import { DARK, LIGHT, computeTrajectories, vectorScales } from '../../render/renderer'
import { PROJECTOR_STYLE } from '../../render/frame'
import { defaultCsvIds } from '../../export/csv'
import type { KeyMoment } from '../../export/moments'
import { cardsForMoment, defaultReadoutIds, keyMoments, momentTolerance, reducedNotice } from '../../export/moments'
import { shownCards } from '../../export/formulaImage'
import { buildCourseware, coursewareZip, safeName } from '../../export/courseware'
import type { CoursewareFile } from '../../export/courseware'
import type { ImageBackground } from '../../export/still'
import { timeLabel } from '../../export/video'
import { saveFile } from '../../platform/files'
import type { FileFilter } from '../../platform/files'
import { logEvent } from '../trialLog'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const rec = computed(() => (state.stale ? null : state.recording))
const tMax = computed(() => (rec.value ? (rec.value.frameCount - 1) * rec.value.dt : 0))
const tScale = computed(() => toDisp(1, 's'))
const tLabel = (t: number) => timeLabel(t, settings.units)

// ---- Key moments ----
const pick = reactive({ events: true, segments: false, ends: true })
const userTimes = ref<number[]>([])
const newTime = ref(0)
const excluded = ref<number[]>([])
const allMoments = computed<KeyMoment[]>(() => (rec.value ? keyMoments(rec.value, { ...pick, user: userTimes.value }) : []))
const tol = computed(() => (rec.value ? momentTolerance(rec.value) : 1e-9))
const isExcluded = (t: number) => excluded.value.some(x => Math.abs(x - t) <= tol.value)
const moments = computed(() => allMoments.value.filter(m => !isExcluded(m.t)))
function toggleMoment(m: KeyMoment) {
  if (isExcluded(m.t)) excluded.value = excluded.value.filter(x => Math.abs(x - m.t) > tol.value)
  else excluded.value = [...excluded.value, m.t]
}
function addTime(t: number) {
  const tc = Math.max(0, Math.min(tMax.value, t))
  if (!userTimes.value.some(x => Math.abs(x - tc) <= tol.value)) userTimes.value = [...userTimes.value, tc].sort((a, b) => a - b)
  excluded.value = excluded.value.filter(x => Math.abs(x - tc) > tol.value)
}
function removeUser(m: KeyMoment) { userTimes.value = userTimes.value.filter(x => Math.abs(x - m.t) > tol.value) }
const KIND_TEXT: Record<string, string> = { start: '起点', event: '事件', segment: '阶段', user: '自选', end: '终点' }

// ---- Contents ----
const opt = reactive({
  video: true, res: '1080' as '720' | '1080', fps: settings.export.fps === 30 ? 30 : 60, speed: 1,
  shots: true, shotSize: 'view' as 'view' | '720' | '1080', shotBg: settings.export.imageBackground as ImageBackground,
  cardsPng: true, cardsSvg: false, cardBg: settings.export.imageBackground as ImageBackground,
  csv: true, csvUnits: 'si' as 'si' | 'display',
  pptx: true,
  output: 'zip' as 'zip' | 'files'
})
const readoutChoices = computed(() => {
  const r = rec.value
  if (!r) return []
  const defs = new Map(listQuantities(r.system).map(q => [q.id, q]))
  const ids = [...new Set([...r.scene.watch, ...defaultReadoutIds(r), ...r.system.model.dynamic.flatMap(b => [`${b.id}.v`, `${b.id}.a`, `${b.id}.ek`]), ...r.system.model.forces.flatMap(f => [`${f.id}.F`, `${f.id}.P`])])]
  return ids.filter(id => defs.has(id)).map(id => defs.get(id)!)
})
const readouts = ref<string[]>(rec.value ? defaultReadoutIds(rec.value) : [])
function toggle(list: string[], id: string) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id) }

const shotSize = computed(() => {
  if (opt.shotSize === '720') return { width: 1280, height: 720 }
  if (opt.shotSize === '1080') return { width: 1920, height: 1080 }
  const k = settings.export.scale || 1
  return { width: Math.max(320, Math.round(viewCamera.width * k)), height: Math.max(240, Math.round(viewCamera.height * k)) }
})

const cardCount = computed(() => {
  if (!rec.value || !(opt.cardsPng || opt.cardsSvg || opt.pptx)) return 0
  return moments.value.reduce((n, m) => n + new Set(shownCards(cardsForMoment(state.situations, m.t, state.digits)).map(c => c.key)).size, 0)
})
const summary = computed(() => {
  const parts: string[] = []
  if (opt.video) parts.push('视频 1 个')
  if (opt.shots) parts.push(`截图 ${moments.value.length} 张`)
  if (opt.cardsPng || opt.cardsSvg) parts.push(`公式卡片 ${cardCount.value} 张${opt.cardsPng && opt.cardsSvg ? '（PNG + SVG）' : opt.cardsSvg ? '（SVG）' : '（PNG）'}`)
  if (opt.csv) parts.push('CSV 数据')
  if (opt.pptx) parts.push(`PPTX（${moments.value.length + 1 + (opt.video ? 1 : 0)} 页起）`)
  return parts.join('、')
})
const notice = computed(() => (rec.value ? reducedNotice(rec.value, settings.units) : null))
const nothing = computed(() => !(opt.video || opt.shots || opt.cardsPng || opt.cardsSvg || opt.csv || opt.pptx))

// ---- Export ----
const busy = ref(false)
const progress = ref(0)
const stepText = ref('')
let cancel = false

function close() { if (!busy.value) state.showCourseware = false }

/** Trial-log summary of the chosen formats (identifiers only). */
function logExport(ok: boolean, extra: Record<string, unknown> = {}) {
  logEvent('courseware.export', {
    ok, video: opt.video, shots: opt.shots, png: opt.cardsPng, svg: opt.cardsSvg, csv: opt.csv, pptx: opt.pptx, output: opt.output,
    moments: moments.value.length, ...extra
  })
}

const MIME_FILTERS: Record<string, FileFilter> = {
  zip: { name: 'ZIP 压缩包', extensions: ['zip'] }, pptx: { name: 'PowerPoint 演示文稿', extensions: ['pptx'] },
  mp4: { name: 'MP4 视频', extensions: ['mp4'] }, webm: { name: 'WebM 视频', extensions: ['webm'] },
  png: { name: 'PNG 图片', extensions: ['png'] }, svg: { name: 'SVG 图片', extensions: ['svg'] },
  csv: { name: 'CSV 表格', extensions: ['csv'] }, txt: { name: '文本', extensions: ['txt'] }
}
const filterFor = (name: string) => { const ext = name.split('.').pop()!.toLowerCase(); return [MIME_FILTERS[ext] ?? { name: '文件', extensions: [ext] }] }

async function saveIndividually(files: CoursewareFile[], prefix: string): Promise<number> {
  let saved = 0
  for (const f of files) {
    // Keep the folder in the name so files from different folders stay apart: "<folder>_01_t=0s_….png"
    const name = `${prefix}_${f.path.replace(/\//g, '_')}`
    const path = await saveFile(f.data, name, filterFor(name))
    if (!path) break
    saved++
  }
  return saved
}

async function run() {
  const r = rec.value
  if (!r || busy.value) return
  busy.value = true
  cancel = false
  progress.value = 0
  stepText.value = '准备中'
  const started = performance.now()
  try {
    const palette = state.theme === 'dark' ? DARK : LIGHT
    const style = settings.projector ? PROJECTOR_STYLE : null
    const view = { cx: viewCamera.cx, cy: viewCamera.cy, ppmAtHeight: viewCamera.ppm, viewHeight: viewCamera.height }
    const [vw, vh] = opt.res === '1080' ? [1920, 1080] : [1280, 720]
    const name = safeName(state.scene.name)
    const result = await buildCourseware(r, state.situations, {
      title: state.scene.name, description: state.scene.description, moments: moments.value,
      units: settings.units, digits: state.digits, theme: state.theme,
      still: { view, options: { ...state.display }, palette, digits: state.digits, selectedId: state.selection?.id ?? null, effects: null, annotations: state.scene.annotations, units: settings.units, style, trajectories: computeTrajectories(r), scales: vectorScales(r, r.system) },
      screenshots: opt.shots ? { ...shotSize.value, background: opt.shotBg } : null,
      formulas: opt.cardsPng || opt.cardsSvg ? { png: opt.cardsPng, svg: opt.cardsSvg, background: opt.cardBg } : null,
      csv: opt.csv ? { ids: defaultCsvIds(r), stride: Math.max(1, Math.ceil(r.frameCount / 5000)), units: opt.csvUnits, separator: settings.export.csvSeparator, decimal: settings.export.csvDecimal } : null,
      video: opt.video ? {
        width: vw, height: vh, fps: opt.fps, speed: opt.speed, t0: 0, t1: tMax.value, view, options: { ...state.display }, palette,
        selectedId: state.selection?.id ?? null, digits: state.digits, overlayIds: state.scene.watch.slice(0, 4), title: state.scene.name,
        units: settings.units, effects: null, annotations: state.scene.annotations, style, bitrate: settings.export.bitrate
      } : null,
      pptx: opt.pptx,
      readoutIds: readouts.value
    }, (p, s) => { progress.value = p; stepText.value = s }, () => cancel)
    let where: string | null = null
    if (opt.output === 'zip') {
      stepText.value = '正在打包'
      const zip = coursewareZip(result.files, `${name}_课件包`)
      where = await saveFile(zip, `${name}_课件包.zip`, filterFor('a.zip'))
    } else {
      const n = await saveIndividually(result.files, name)
      where = n ? `${n} 个文件` : null
    }
    if (where) {
      showToast(`课件已导出：${where}${result.warnings.length ? `（${result.warnings[0]}）` : ''}`, false)
      logExport(true, { files: result.files.length, format: result.video?.extension ?? 'none', seconds: Math.round((performance.now() - started) / 100) / 10 })
      state.showCourseware = false
    }
  } catch (e) {
    const msg = (e as Error).message
    if (msg !== '已取消') showToast(`课件导出失败：${msg}`, true)
    else showToast('已取消课件导出')
    logExport(false, { cancelled: msg === '已取消' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div class="dialog courseware">
      <div class="dialog-header"><Icon name="template" :size="18" />导出课件包<span class="spacer" /><button class="btn icon ghost" :disabled="busy" title="关闭" @click="close"><Icon name="close" /></button></div>
      <div v-if="!rec" class="dialog-body"><div class="empty">请先运行仿真（结果需与当前场景一致）。</div></div>
      <div v-else class="dialog-body">
        <div class="cols2">
          <section>
            <div class="group-title">关键时刻</div>
            <div class="group">
              <label class="check small"><input v-model="pick.events" type="checkbox" />事件（碰撞、共速、松弛…）</label>
              <label class="check small"><input v-model="pick.segments" type="checkbox" />每个运动阶段的开始</label>
              <label class="check small"><input v-model="pick.ends" type="checkbox" />起点与终点</label>
              <div class="row add">
                <NumField :model-value="newTime" :unit="unitLabel('s')" :scale="tScale" :min="0" :max="tMax" width="130px" @update:model-value="v => (newTime = v)" />
                <button class="btn small" @click="addTime(newTime)"><Icon name="plus" />添加时刻</button>
                <button class="btn small ghost" title="当前播放位置" @click="addTime(state.time)">当前时刻</button>
              </div>
            </div>
            <div class="moments">
              <div v-if="!allMoments.length" class="tiny muted pad">没有关键时刻：勾选上面的选项或添加时刻。</div>
              <label v-for="m in allMoments" :key="m.t" class="moment small" :class="{ off: isExcluded(m.t) }">
                <input type="checkbox" :checked="!isExcluded(m.t)" @change="toggleMoment(m)" />
                <span class="mono t">{{ tLabel(m.t).replace('t = ', '') }}</span>
                <span class="lbl" :title="m.label">{{ m.label }}</span>
                <span class="badge">{{ m.kinds.map(k => KIND_TEXT[k]).join('·') }}</span>
                <button v-if="m.kinds.includes('user')" class="btn icon ghost tiny-btn" title="移除自选时刻" @click.prevent="removeUser(m)"><Icon name="close" :size="12" /></button>
              </label>
            </div>
          </section>
          <section>
            <div class="group-title">内容</div>
            <div class="group">
              <div class="row"><label class="check"><input v-model="opt.video" type="checkbox" />视频</label>
                <select v-model="opt.res" class="field grow" :disabled="!opt.video"><option value="1080">1920 × 1080</option><option value="720">1280 × 720</option></select>
                <select v-model.number="opt.fps" class="field" :disabled="!opt.video"><option :value="30">30 帧/秒</option><option :value="60">60 帧/秒</option></select>
                <select v-model.number="opt.speed" class="field" :disabled="!opt.video"><option :value="0.25">0.25×</option><option :value="0.5">0.5×</option><option :value="1">1×</option><option :value="2">2×</option></select>
              </div>
              <div class="row"><label class="check"><input v-model="opt.shots" type="checkbox" />截图 PNG</label>
                <select v-model="opt.shotSize" class="field grow" :disabled="!opt.shots"><option value="view">与视图相同 × {{ settings.export.scale }}</option><option value="1080">1920 × 1080</option><option value="720">1280 × 720</option></select>
                <select v-model="opt.shotBg" class="field" :disabled="!opt.shots" title="背景"><option value="theme">主题背景</option><option value="white">白底</option><option value="transparent">透明</option></select>
              </div>
              <div class="row"><label class="check"><input v-model="opt.cardsPng" type="checkbox" />公式卡片 PNG</label>
                <label class="check small"><input v-model="opt.cardsSvg" type="checkbox" />另存 SVG</label>
                <span class="spacer" />
                <select v-model="opt.cardBg" class="field" :disabled="!opt.cardsPng && !opt.cardsSvg" title="背景"><option value="theme">主题背景</option><option value="white">白底</option><option value="transparent">透明</option></select>
              </div>
              <div class="row"><label class="check"><input v-model="opt.csv" type="checkbox" />CSV 数据</label>
                <select v-model="opt.csvUnits" class="field grow" :disabled="!opt.csv"><option value="si">国际单位（逐位一致）</option><option value="display">显示单位</option></select>
              </div>
              <div class="row"><label class="check"><input v-model="opt.pptx" type="checkbox" />PPTX 演示文稿</label><span class="tiny muted">每个关键时刻一页：截图 + 读数 + 公式{{ opt.video ? '；末页嵌入视频' : '' }}</span></div>
            </div>
            <div class="group-title">幻灯片读数</div>
            <div class="chips">
              <label v-for="q in readoutChoices" :key="q.id" class="check small chip"><input type="checkbox" :checked="readouts.includes(q.id)" @change="toggle(readouts, q.id)" />{{ q.owner }} · {{ q.label }}</label>
            </div>
            <div class="group-title">保存方式</div>
            <div class="group">
              <label class="check small"><input v-model="opt.output" type="radio" value="zip" />一个 ZIP 课件包（推荐）</label>
              <label class="check small"><input v-model="opt.output" type="radio" value="files" />逐个保存文件<span class="muted">（桌面版每个文件弹出一次保存对话框）</span></label>
            </div>
          </section>
        </div>
        <div v-if="notice" class="notice small"><span class="badge warn">精度降级</span>{{ notice.replace(/^精度降级：/, '') }} 导出的说明、截图、公式卡片与幻灯片会标注这一点。</div>
        <div class="tiny muted note">将生成：{{ summary || '（未选择任何内容）' }}。数值按当前显示单位（{{ unitLabel('m/s') }}、{{ unitLabel('m') }} …）；公式卡片 SVG 内含 HTML，只能在浏览器中正确显示，插入 PPT / WPS 请用 PNG。</div>
        <div v-if="busy" class="progress-wrap">
          <div class="progress"><div class="bar" :style="{ width: `${(progress * 100).toFixed(1)}%` }" /></div>
          <div class="tiny muted">{{ stepText }} · {{ (progress * 100).toFixed(0) }}%</div>
        </div>
      </div>
      <div class="dialog-footer">
        <button v-if="busy" class="btn" @click="cancel = true">取消</button>
        <button v-else class="btn" @click="close">关闭</button>
        <button class="btn primary" :disabled="busy || !rec || nothing || !moments.length && (opt.shots || opt.pptx)" @click="run">{{ busy ? '正在生成…' : '导出课件' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.courseware { width: min(1040px, calc(100vw - 48px)); }
.cols2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 16px; }
.group .check { min-height: 26px; }
.row > label.check { width: 128px; flex: 0 0 auto; color: var(--text); font-size: var(--type-small); }
.row .field:not(.grow) { width: auto; }
.add { gap: 6px; }
.moments { max-height: 330px; overflow: auto; background: var(--group); border-radius: var(--radius-group); padding: 4px; }
.moment { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 6px; cursor: pointer; }
.moment:hover { background: var(--hover); }
.moment.off { opacity: 0.5; }
.moment .t { flex: 0 0 auto; min-width: 74px; }
.moment .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tiny-btn { width: 20px; height: 20px; }
.pad { padding: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px 12px; background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; max-height: 120px; overflow: auto; }
.note { margin-top: 10px; line-height: 1.5; }
.notice { margin-top: 10px; display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; color: var(--text-2); }
.notice .badge { flex: 0 0 auto; }
.progress-wrap { margin-top: 10px; }
.progress { height: 6px; background: var(--fill); border-radius: 6px; overflow: hidden; margin-bottom: 4px; }
.bar { height: 100%; background: var(--accent); transition: width 0.2s; }
@media (max-width: 760px) { .cols2 { grid-template-columns: 1fr; } }
</style>
