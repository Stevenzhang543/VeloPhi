<script setup lang="ts">
/**
 * Home page (26.64, D241). Three things and nothing else: the title (mark, wordmark, version), one sentence, and the
 * five panels to jump to — each with its icon, its name and one line. Below them one row of small entries: continue
 * the work of this session (when there is any), open a file, the walkthrough's checklist (入门 n/5). On a first run,
 * and after an update that has a list of changes, one more row offers the walkthrough or that list (D248).
 *
 * Everything the 26.63 home page also carried lives somewhere else now (src/app/inventoryMap.ts has the table): the
 * search box is the rail's search and Ctrl+K; a pasted problem goes to Copilot or the library's problems; a share link
 * is pasted anywhere on this page (Ctrl+V) or opened with "从链接打开"; the role cards are gone (asked once in the
 * walkthrough); the predict-first cases are in the library's classroom section; the start-page choice is a setting.
 *
 * The band above the title holds the page's one decoration, the pendulum wave solved by the engine (D257). The page
 * does not scroll at 1280 × 720.
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { tl } from '../../i18n'
import { state, showToast, sceneLoads } from '../store'
import { settings } from '../settings'
import { openScene } from '../files'
import { ENGINE_VERSION } from '../../core/scene/types'
import { isShareLink, openShared } from '../shareOpen'
import { setCopilotOpen, phone } from '../layout'
import { panels } from '../panels'
import AppLogo from './AppLogo.vue'
import Wordmark from './Wordmark.vue'
import Icon from './Icon.vue'
import PendulumWave from './decor/PendulumWave.vue'
import { beginNews, beginOnboarding, dismissOffer, offered, openGuide } from '../onboarding/engine'
import { onboarding } from '../onboarding/state'
import { NEWEST } from '../onboarding/news'

const active = computed(() => state.page === 'home')
const PANELS = computed(() => panels())
const version = ENGINE_VERSION.replace(/\.0$/, '')
/** Segments of the walkthrough finished on this device (the entry shows n/5; D249). */
const segmentsDone = computed(() => Object.values(onboarding.record.segments).filter(s => s.done).length)

/** There is work to go back to: a file, unsaved edits, or a scene opened in this session (not the start-up example). */
const hasWork = computed(() => { void state.scene; return !!state.fileName || state.dirty || sceneLoads.n > 0 })
const workName = computed(() => state.fileName ?? state.scene.name)

/**
 * Ctrl+V anywhere on the page (D241): a share link opens its scene. Other text is not thrown away — the message offers
 * to hand it to Copilot as a problem, which is where pasted problems go now.
 */
async function onPaste(e: ClipboardEvent) {
  if (!active.value || state.showPalette) return
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  const text = (e.clipboardData?.getData('text/plain') ?? '').trim()
  if (!text) return
  e.preventDefault()
  if (isShareLink(text)) { await openShared(text); return }
  if (!settings.ai.copilot) { showToast(tl('粘贴的不是分享链接')); return }
  showToast(tl('粘贴的不是分享链接'), false, { label: tl('交给 Copilot'), run: () => { state.page = 'studio'; setCopilotOpen(true); state.copilotDraft = text } })
}
onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <div class="home" :class="{ phone }">
    <div class="band"><PendulumWave :active="active" /></div>
    <main class="body">
      <header class="title">
        <AppLogo :size="phone ? 44 : 56" />
        <div class="names">
          <h1><Wordmark :size="phone ? 32 : 44" /><span class="ver num" :title="tl('版本')">{{ version }}</span></h1>
          <p class="lead">{{ tl('每个数都可以核对的物理与化学实验台。') }}</p>
        </div>
      </header>
      <!-- 26.65 (D296): the decorative scale ticks are gone; a hairline separates the title from the panels -->
      <hr class="rule" />
      <nav class="jumps" :aria-label="tl('面板')">
        <button v-for="p in PANELS" :key="p.page" type="button" class="jump" :class="`panel-${p.tone}`" :data-ui="`home-jump-${p.page}`" :title="phone ? undefined : `Alt+${p.digit}`" @click="state.page = p.page">
          <span class="jhead"><Icon :name="p.icon" :size="24" /></span>
          <span class="jname">{{ p.label }}</span>
          <span class="jline">{{ p.line }}</span>
        </button>
      </nav>
      <!-- 26.64 (D248): the offer of the walkthrough (first run) or of the list of changes (after an update). It is a
           row of the page, not a dialog, and it is the page's only primary button while it shows. -->
      <div v-if="offered.kind === 'first'" class="offer" data-ui="home-offer">
        <button type="button" class="btn primary" data-ui="home-start" @click="beginOnboarding"><Icon name="play" :size="14" />{{ tl('开始') }}</button>
        <span class="otext">{{ tl('入门：五段，在真实的界面上做，约 8 分钟') }}</span>
        <button type="button" class="btn ghost small" data-ui="home-later" @click="dismissOffer">{{ tl('以后再说') }}</button>
      </div>
      <div v-else-if="offered.kind === 'new'" class="offer" data-ui="home-offer">
        <button type="button" class="btn primary" data-ui="home-whatsnew" @click="beginNews">{{ tl('{0} 的新变化', [NEWEST]) }}</button>
        <span class="otext">{{ tl('五个面板、化学实验台、更短的操作条') }}</span>
        <button type="button" class="btn ghost small" data-ui="home-later" @click="dismissOffer">{{ tl('以后再说') }}</button>
      </div>
      <div class="entries">
        <button v-if="hasWork" type="button" class="btn ghost entry" data-ui="home-continue" @click="state.page = 'studio'"><Icon name="arrowRight" :size="15" /><span class="clip">{{ tl('继续：{0}', [workName]) }}</span></button>
        <button type="button" class="btn ghost entry" data-ui="home-open" @click="openScene()"><Icon name="open" :size="15" />{{ tl('打开文件…') }}</button>
        <button type="button" class="btn ghost entry" data-ui="home-tour" :title="tl('入门清单：五段各自完成了没有')" @click="openGuide('list')"><Icon name="graduation" :size="15" />{{ tl('入门') }}<span class="num muted">{{ segmentsDone }}/5</span></button>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Two rows: the decoration's band takes what the content leaves, so the wave never sits behind text */
/* 26.65 (D296): the wave's band is at most a third of the page; the content comes up */
.home { height: 100%; min-height: 0; min-width: 0; display: grid; grid-template-rows: minmax(96px, 34vh) auto; overflow: auto; background: var(--bg); }
.band { position: relative; min-height: 0; }
.body { width: 100%; max-width: 1088px; margin: 0 auto; padding: var(--space-2) var(--space-6) var(--space-10); display: flex; flex-direction: column; gap: var(--space-5); }
.title { display: flex; align-items: center; gap: var(--space-5); }
.title > :deep(svg) { flex: 0 0 auto; }
.names { min-width: 0; }
h1 { margin: 0; display: flex; align-items: baseline; gap: var(--space-3); line-height: 1; }
/* the wordmark takes the hero size of the scale (it follows the interface zoom and projection, unlike its px prop) */
h1 :deep(.wordmark) { font-size: var(--type-hero) !important; }
.phone h1 :deep(.wordmark) { font-size: var(--type-page) !important; }
.ver { font-size: var(--type-subtitle); font-weight: var(--weight-medium); color: var(--text-3); letter-spacing: 0.01em; }
.lead { margin: var(--space-2) 0 0; font-size: calc(17px * var(--zoom)); line-height: 1.4; color: var(--text-2); }
.rule { margin: var(--space-1) 0 0; border: 0; height: 1px; background: var(--separator); }

/* The five panels: sections of one front panel divided by hairlines — not five cards */
.jumps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: calc(-1 * var(--space-5)); }
.jump { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; min-height: calc(132px * var(--zoom)); padding: var(--space-4) var(--space-4) var(--space-4); border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; border-radius: 0; transition: background var(--dur-fast) ease; }
.jump + .jump { box-shadow: -1px 0 0 var(--separator); }
.jump:hover { background: var(--hover); }
.jump:active { background: var(--fill); }
.jump:focus-visible { outline-offset: -2px; border-radius: var(--radius-control); }
.jhead { display: flex; align-items: center; justify-content: space-between; width: 100%; color: var(--text-2); margin-bottom: var(--space-3); }
.jump:hover .jhead :deep(.icon), .jump:focus-visible .jhead :deep(.icon) { color: var(--text); }
.jname { font-size: var(--type-panel); font-weight: var(--weight-title); line-height: var(--line-tight); letter-spacing: var(--track-display); overflow-wrap: break-word; }
.jline { font-size: var(--type-small); line-height: 1.4; color: var(--text-2); overflow-wrap: break-word; }

.offer { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-top: calc(-1 * var(--space-2)); }
.otext { color: var(--text-2); font-size: var(--type-body); flex: 1 1 auto; min-width: 0; }
.entries { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); margin: calc(-1 * var(--space-2)) 0 0 calc(-1 * var(--space-2)); }
.entry { color: var(--text-2); font-weight: var(--weight-medium); max-width: 100%; }
.entry:hover { color: var(--text); }
.clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Narrow windows: the panels become a list, the band a strip */
@media (max-width: 900px) {
  .home { grid-template-rows: minmax(96px, 1fr) auto; }
  .body { padding: var(--space-2) var(--space-4) var(--space-6); gap: var(--space-4); }
  .jumps { grid-template-columns: 1fr; margin-top: calc(-1 * var(--space-4)); }
  .jump { display: grid; grid-template-columns: 28px minmax(0, 1fr); grid-template-rows: auto auto; align-items: center; gap: 0 var(--space-3); min-height: var(--touch-min); padding: var(--space-2) var(--space-2); }
  .jump + .jump { box-shadow: 0 -1px 0 var(--separator); }
  .jhead { grid-row: 1 / span 2; width: auto; margin: 0; }
  .jhead kbd { display: none; }
  .jname { font-size: var(--type-subtitle); }
  .title { gap: var(--space-3); }
}
</style>
