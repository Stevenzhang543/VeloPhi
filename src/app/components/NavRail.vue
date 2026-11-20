<script setup lang="ts">
/**
 * Navigation rail (26.64, D240): the five panels top to bottom — 运动 · 物理实验 · 化学实验 · 资源库 · 监视 — and below
 * them search, help and the settings. The mark at the top opens the home page, which has no place of its own in the
 * list. The selected panel is marked by a short bar in the panel's own colour (one of the three places that colour
 * appears, design file §2.4); icons and labels stay in the text colours.
 *
 * On a phone the same list opens as a drawer from the top bar (`drawer`), with the home page as its first row and each
 * panel's one-line description beside its name.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { tl, paren } from '../../i18n'
import { state } from '../store'
import type { ShownPage } from '../store'
import { settings } from '../settings'
import { MOD } from '../shortcuts'
import { shell } from '../layout'
import { panels } from '../panels'
import AppLogo from './AppLogo.vue'
import Wordmark from './Wordmark.vue'
import Icon from './Icon.vue'
import { offered, openGuide } from '../onboarding/engine'

const props = withDefaults(defineProps<{ drawer?: boolean }>(), { drawer: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const PAGES = computed(() => panels().map(p => ({ id: p.page, label: p.label, icon: p.icon, tone: p.tone, line: p.line, tip: `${p.line}${paren(`Alt+${p.digit}`)}` })))

function go(p: ShownPage) { state.page = p; emit('close') }
function search() { state.showPalette = true; emit('close') }

const help = ref(false)
function closeHelp(e: PointerEvent) { if (help.value && !(e.target as Element).closest('.rail-help')) help.value = false }
function esc(e: KeyboardEvent) { if (e.key === 'Escape') help.value = false }
onMounted(() => { window.addEventListener('pointerdown', closeHelp); window.addEventListener('keydown', esc) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', closeHelp); window.removeEventListener('keydown', esc) })
function act(fn: () => void) { help.value = false; fn(); emit('close') }
</script>

<template>
  <nav class="rail" :class="{ drawer: props.drawer, labels: settings.ui.railLabels || props.drawer }" :aria-label="tl('页面')">
    <button v-if="!props.drawer" type="button" class="logo" data-ui="page-home" :class="{ on: state.page === 'home' }" :aria-current="state.page === 'home' ? 'page' : undefined" :title="`${tl('首页')}${paren('Alt+0')}`" :aria-label="tl('首页')" @click="go('home')"><AppLogo :size="30" /></button>
    <div v-else class="brand"><AppLogo :size="26" /><Wordmark :size="17" /><span class="spacer" /><button type="button" class="btn icon ghost" :aria-label="tl('关闭')" @click="emit('close')"><Icon name="close" /></button></div>
    <div class="items">
      <button v-if="props.drawer" type="button" class="item" :class="{ on: state.page === 'home' }" :aria-current="state.page === 'home' ? 'page' : undefined" @click="go('home')">
        <span class="ico"><Icon name="home" :size="22" /></span><span class="lbl">{{ tl('首页') }}</span>
      </button>
      <button v-for="p in PAGES" :key="p.id" type="button" class="item" :data-ui="`page-${p.id}`" :class="[`panel-${p.tone}`, { on: state.page === p.id }]" :aria-current="state.page === p.id ? 'page' : undefined" :title="props.drawer ? undefined : p.tip" @click="go(p.id)">
        <span class="ico"><Icon :name="p.icon" :size="22" /></span><span class="lbl">{{ p.label }}</span>
        <span v-if="props.drawer" class="line small">{{ p.line }}</span>
      </button>
    </div>
    <span class="spacer" />
    <div class="items foot">
      <button type="button" class="item" data-ui="search" :title="props.drawer ? undefined : tl('全局搜索（{0}+K）', [MOD])" @click="search"><span class="ico"><Icon name="search" :size="20" /></span><span class="lbl">{{ tl('搜索') }}</span></button>
      <div class="rail-help">
        <button type="button" class="item" data-ui="help" :class="{ open: help }" :aria-expanded="help" :title="props.drawer ? undefined : tl('帮助：入门、新变化、快捷键')" @click="help = !help"><span class="ico"><Icon name="help" :size="20" /><i v-if="offered.kind !== 'none'" class="dot at" data-ui="help-dot" /></span><span class="lbl">{{ tl('帮助') }}</span></button>
        <div v-if="help" class="menu help-menu" role="menu">
          <button role="menuitem" data-ui="help-guide" @click="act(() => openGuide('list'))"><Icon name="graduation" />{{ tl('入门') }}</button>
          <button role="menuitem" data-ui="help-news" @click="act(() => openGuide('news'))"><Icon name="list" />{{ tl('新变化') }}<span class="spacer" /><i v-if="offered.kind === 'new'" class="dot" /></button>
          <button role="menuitem" @click="act(() => { shell.shortcuts = true })"><Icon name="keyboard" />{{ tl('快捷键一览') }}<span class="spacer" /><kbd>?</kbd></button>
          <button role="menuitem" @click="act(() => { state.page = 'library'; state.librarySection = 'handbook' })"><Icon name="book" />{{ tl('学习手册') }}</button>
          <button role="menuitem" @click="act(() => { state.showAbout = true })"><Icon name="info" />{{ tl('关于 VeloΦ') }}</button>
        </div>
      </div>
      <button type="button" class="item" data-ui="page-settings" :class="{ on: state.page === 'settings' }" :aria-current="state.page === 'settings' ? 'page' : undefined" :title="props.drawer ? undefined : tl('设置（{0}+,）', [MOD])" @click="go('settings')"><span class="ico"><Icon name="settings" :size="20" /></span><span class="lbl">{{ tl('设置') }}</span></button>
    </div>
  </nav>
</template>

<style scoped>
.rail { flex: 0 0 var(--rail-w); width: var(--rail-w); display: flex; flex-direction: column; align-items: stretch; gap: var(--space-1); padding: var(--space-2) 4px; background: var(--chrome); border-right: 1px solid var(--border); position: relative; z-index: 60; min-height: 0; overflow: visible; }
.logo { position: relative; align-self: center; width: var(--touch-min); height: var(--touch-min); border: 0; background: none; border-radius: var(--radius-control); display: grid; place-items: center; cursor: pointer; transition: transform var(--dur-release) var(--ease-out), background var(--dur-fast) ease; }
.logo:hover { background: var(--hover); }
.logo:active { transform: scale(var(--press-scale)); transition-duration: var(--dur-press); }
.items { display: flex; flex-direction: column; gap: 2px; }
.item { position: relative; border: 0; background: none; color: var(--text-2); font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 5px 0; border-radius: var(--radius-control); min-height: var(--touch-min); -webkit-tap-highlight-color: transparent; transition: background var(--dur-fast) ease, color var(--dur-fast) ease; }
.ico { display: grid; place-items: center; height: 24px; transition: transform var(--dur-release) var(--ease-out); }
.item:hover { background: var(--hover); color: var(--text); }
.item:active .ico { transform: scale(var(--press-scale)); transition-duration: var(--dur-press); }
.item.on, .item.open { color: var(--text); }
.item.on { background: var(--fill); }
/* The selected indicator: a short bar at the rail's edge, in the panel's colour (the settings and home use the text colour) */
.item.on::before, .logo.on::before { content: ''; position: absolute; left: -4px; top: 50%; width: 3px; height: 24px; margin-top: -12px; border-radius: 0 var(--radius-row) var(--radius-row) 0; background: var(--panel, var(--text-2)); }
.logo.on::before { left: calc((var(--touch-min) - var(--rail-w)) / 2); }
/* 26.65 (D294): labels are never cut off — "Einstellungen" takes two lines with a hyphen */
.lbl { display: none; font-size: var(--type-tiny); line-height: 1.15; font-weight: var(--weight-medium); max-width: 100%; text-align: center; overflow-wrap: break-word; hyphens: auto; padding: 0 1px; }
.labels .lbl { display: block; }
.item.on .lbl { font-weight: var(--weight-title); }
.spacer { flex: 1; min-height: var(--space-2); }
.rail-help { position: relative; display: flex; flex-direction: column; }
/* something is on offer (the walkthrough, a list of changes): a dot, nothing more (D248) */
.dot { width: 7px; height: 7px; border-radius: var(--radius-round); background: var(--accent); flex: 0 0 auto; }
.ico { position: relative; }
.dot.at { position: absolute; right: -5px; top: 0; }
.help-menu { left: calc(100% + 8px); bottom: 0; top: auto; min-width: 210px; }
/* A short window: labels give way, the items stay reachable */
@media (max-height: 620px) { .rail:not(.drawer) .lbl { display: none; } .rail:not(.drawer) .item { min-height: 36px; } }

/* Phone: the same list as a drawer over the page (a floating layer: it takes the glass material) */
.rail.drawer { position: fixed; inset: 0 auto 0 0; width: min(86vw, 330px); flex-basis: auto; padding: 10px 10px calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 9100; overflow: auto; border-right: 0; background: var(--glass-fill); -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter); box-shadow: var(--elev-float), 0 0 0 1px var(--glass-edge); transition: transform var(--dur-enter) var(--ease-out), opacity var(--dur-enter) var(--ease-out); }
@starting-style { .rail.drawer { transform: translateX(-24px); opacity: 0; } }
.brand { display: flex; align-items: center; gap: 8px; padding: 2px 2px 6px 6px; }
.drawer .item { flex-direction: row; align-items: center; justify-content: flex-start; gap: 10px; padding: 6px 10px; min-height: 52px; text-align: left; }
.drawer .item.on::before { left: 0; }
.drawer .ico { width: 28px; flex: 0 0 auto; }
.drawer .lbl { font-size: var(--type-body); flex: 0 0 auto; min-width: 5em; }
.drawer .line { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); }
/* Glass never contains glass: the menu inside the drawer is solid */
.drawer .help-menu { left: 8px; right: 8px; bottom: calc(100% + 4px); background: var(--pane); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: var(--elev-3); }
</style>
