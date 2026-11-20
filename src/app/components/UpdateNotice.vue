<script setup lang="ts">
/**
 * The update notice (26.64): a quiet card in a corner — never a dialog — that says a newer version exists, shows the
 * first lines of its notes and carries the update through: download with progress, verification, installation.
 * Mounted only in the desktop and Android apps (App.vue); mounting it schedules the one check per start.
 *
 * Release notes and error details are remote or technical text: they are shown through text interpolation only.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../i18n'
import { phone } from '../layout'
import Icon from './Icon.vue'
import { beside, canInstall, cancelUpdate, checkForUpdates, installUpdate, isoDate, later, manualReasonText, megabytes, noticeVisible, notesPreview, openReleasePage, scheduleStartupCheck, showUpdateFile, skipVersion, startUpdate, update, updateErrorText, viaPackageTool } from '../update'

onMounted(() => { scheduleStartupCheck() })

const show = computed(() => noticeVisible())
const notes = computed(() => notesPreview(update.info?.notes ?? ''))
const released = computed(() => isoDate(update.info?.published ?? ''))
const installable = computed(() => canInstall(update.info))
const fraction = computed(() => (update.total > 0 ? Math.min(1, update.received / update.total) : 0))
const reason = computed(() => (update.error ? updateErrorText(update.error.code) : ''))
const readyText = computed(() => {
  const d = update.downloaded
  if (beside(d?.kind)) return tl('新版本已保存为 {0}。启动它之后，旧文件 {1} 可以删除。', [d?.path ?? d?.name ?? '', d?.old ?? ''])
  if (d?.kind === 'android') return tl('已下载并通过校验。请在系统的安装提示中确认。')
  if (viaPackageTool(d?.kind)) return tl('已下载并通过校验。安装需要系统管理员授权，装好后 VeloΦ 会自动重新打开。')
  return tl('已下载并通过校验。安装时 VeloΦ 会关闭，装好后自动重新打开。')
})
const manualReason = computed(() => (update.manualInstall ? manualReasonText(update.manualInstall) : ''))

// Linux: the command to install by hand goes to the clipboard (the text stays selectable when that is not possible)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
async function copyCommand() {
  const text = update.manualInstall?.command ?? ''
  try { await navigator.clipboard.writeText(text) } catch { return }
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 2000)
}

// "You have the latest version" needs no answer: it leaves by itself
let timer: ReturnType<typeof setTimeout> | null = null
watch(() => update.phase, p => {
  if (timer) { clearTimeout(timer); timer = null }
  if (p === 'uptodate') timer = setTimeout(() => { if (update.phase === 'uptodate') later() }, 6000)
})
onBeforeUnmount(() => { if (timer) clearTimeout(timer); if (copiedTimer) clearTimeout(copiedTimer) })
</script>

<template>
  <aside v-if="show" class="update-notice glass-float enter" :class="{ phone }" role="status" aria-live="polite" :aria-label="tl('软件更新')" data-ui="update-notice" :data-phase="update.phase">
    <div v-if="update.phase === 'checking'" class="line"><span class="spin" aria-hidden="true" /><span class="grow">{{ tl('正在检查更新…') }}</span></div>

    <div v-else-if="update.phase === 'uptodate'" class="line">
      <span class="ico ok"><Icon name="check" :size="13" /></span><span class="grow">{{ tl('已是最新版本（{0}）', [update.info?.current ?? '']) }}</span>
      <button type="button" class="btn small ghost" @click="later">{{ tl('关闭') }}</button>
    </div>

    <template v-else-if="update.phase === 'failed'">
      <div class="head"><span class="ico warn"><Icon name="alert" :size="13" /></span><b>{{ tl('检查更新失败') }}</b></div>
      <p class="body">{{ reason }}</p>
      <p v-if="update.error?.detail" class="detail mono tiny">{{ update.error.detail }}</p>
      <div class="acts">
        <button type="button" class="btn small" @click="checkForUpdates(true)">{{ tl('重试') }}</button>
        <button type="button" class="btn small ghost" @click="later">{{ tl('关闭') }}</button>
        <span class="spacer" /><button type="button" class="linkish" @click="openReleasePage">{{ tl('在浏览器中查看') }}</button>
      </div>
    </template>

    <template v-else-if="update.phase === 'available' && update.info">
      <div class="head">
        <span class="ico"><Icon name="download" :size="13" /></span><b>{{ tl('新版本 {0}', [update.info.latest]) }}</b>
        <span class="tiny muted">{{ tl('当前 {0}', [update.info.current]) }}<template v-if="released"> · {{ released }}</template></span>
      </div>
      <div v-if="notes.lines.length" class="notes"><p v-for="(l, i) in notes.lines" :key="i">{{ l }}</p><p v-if="notes.more" class="muted">…</p></div>
      <p v-if="!installable" class="body">{{ tl('这个版本没有可以自动安装的文件，请在浏览器中下载。') }}</p>
      <div class="acts">
        <button v-if="installable" type="button" class="btn small tonal" data-ui="update-go" @click="startUpdate">{{ tl('更新') }}</button>
        <button type="button" class="btn small" @click="later">{{ tl('稍后') }}</button>
        <button type="button" class="btn small ghost" :title="tl('这个版本不再提醒')" @click="skipVersion">{{ tl('跳过此版') }}</button>
        <span class="spacer" /><button type="button" class="linkish" @click="openReleasePage">{{ tl('在浏览器中查看') }}</button>
      </div>
    </template>

    <template v-else-if="update.phase === 'downloading'">
      <div class="head"><span class="ico"><Icon name="download" :size="13" /></span><b>{{ tl('正在下载 {0}', [update.info?.latest ?? '']) }}</b></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(fraction * 100)"><i :style="{ transform: `scaleX(${fraction})` }" /></div>
      <div class="acts">
        <span class="mono tiny muted">{{ megabytes(update.received) }} / {{ megabytes(update.total) }}</span>
        <span class="spacer" /><button type="button" class="btn small" @click="cancelUpdate">{{ tl('取消') }}</button>
      </div>
    </template>

    <div v-else-if="update.phase === 'verifying'" class="line"><span class="spin" aria-hidden="true" /><span class="grow">{{ tl('正在校验…') }}</span></div>

    <template v-else-if="update.phase === 'ready'">
      <div class="head"><span class="ico ok"><Icon name="check" :size="13" /></span><b>{{ tl('新版本 {0}', [update.info?.latest ?? '']) }}</b></div>
      <p class="body">{{ readyText }}</p>
      <div class="acts">
        <button type="button" class="btn small tonal" data-ui="update-install" @click="installUpdate">{{ beside(update.downloaded?.kind) ? tl('启动新版') : tl('安装') }}</button>
        <button type="button" class="btn small" @click="later">{{ tl('稍后') }}</button>
      </div>
    </template>

    <div v-else-if="update.phase === 'installing'" class="line"><span class="spin" aria-hidden="true" /><span class="grow">{{ viaPackageTool(update.downloaded?.kind) ? tl('正在等待系统授权并安装…') : tl('正在启动…') }}</span></div>

    <template v-else-if="update.phase === 'manual' && update.manualInstall">
      <div class="head"><span class="ico warn"><Icon name="alert" :size="13" /></span><b>{{ tl('需要手动安装') }}</b></div>
      <p class="body">{{ manualReason }}</p>
      <p v-if="update.manualInstall.detail" class="detail mono tiny">{{ update.manualInstall.detail }}</p>
      <p class="body">{{ tl('新版本已保存为 {0}。在终端里运行下面的命令即可安装：', [update.manualInstall.path]) }}</p>
      <p class="command mono tiny" data-ui="update-command">{{ update.manualInstall.command }}</p>
      <div class="acts">
        <button type="button" class="btn small tonal" data-ui="update-copy" @click="copyCommand">{{ copied ? tl('已复制') : tl('复制命令') }}</button>
        <button type="button" class="btn small" @click="showUpdateFile">{{ tl('显示文件') }}</button>
        <button type="button" class="btn small ghost" @click="installUpdate">{{ tl('重试') }}</button>
        <span class="spacer" /><button type="button" class="linkish" @click="later">{{ tl('关闭') }}</button>
      </div>
    </template>

    <template v-else-if="update.phase === 'error'">
      <div class="head"><span class="ico warn"><Icon name="alert" :size="13" /></span><b>{{ tl('更新没有完成') }}</b></div>
      <p class="body">{{ reason }}</p>
      <p v-if="update.error?.detail" class="detail mono tiny">{{ update.error.detail }}</p>
      <div class="acts">
        <button v-if="installable" type="button" class="btn small" @click="startUpdate">{{ tl('重试') }}</button>
        <button type="button" class="btn small ghost" @click="later">{{ tl('关闭') }}</button>
        <span class="spacer" /><button type="button" class="linkish" @click="openReleasePage">{{ tl('在浏览器中查看') }}</button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
/* Above the page and its menus, below dialogs: a dialog that opens covers the notice */
.update-notice { position: fixed; right: 14px; bottom: calc(var(--status-h) + 14px); z-index: 8500; width: min(calc(360px * var(--zoom)), calc(100vw - 28px)); padding: 12px 14px; border-radius: var(--radius-float); display: flex; flex-direction: column; gap: 8px; color: var(--text); font-size: var(--type-small); }
.update-notice.phone { left: 10px; right: 10px; bottom: auto; top: calc(var(--bar-h) + 8px + env(safe-area-inset-top, 0px)); width: auto; }
.line { display: flex; align-items: center; gap: 8px; min-height: var(--control-sm); }
.grow { flex: 1; min-width: 0; }
.head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.head b { font-size: var(--type-body); font-weight: var(--weight-strong); }
.ico { flex: 0 0 auto; width: 22px; height: 22px; border-radius: var(--radius-round); display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.ico.ok { background: var(--success-soft); color: var(--success); }
.ico.warn { background: var(--warning-soft); color: var(--warning); }
.notes { color: var(--text-2); line-height: 1.45; max-height: 10.5em; overflow: hidden; }
.notes p, .body, .detail { margin: 0; overflow-wrap: break-word; }
.notes p { white-space: pre-wrap; }
.body { color: var(--text-2); line-height: 1.45; }
.detail { color: var(--text-3); max-height: 4.2em; overflow: hidden; }
.command { margin: 0; padding: 6px 8px; border-radius: var(--radius-control); background: var(--fill); color: var(--text); overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
.acts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.linkish { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; font-size: var(--type-tiny); cursor: pointer; }
.linkish:hover { text-decoration: underline; }
.spin { flex: 0 0 auto; width: 14px; height: 14px; border-radius: var(--radius-round); border: 2px solid var(--fill-strong); border-top-color: var(--accent); animation: update-spin 0.8s linear infinite; }
@keyframes update-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 3s; } }
</style>
