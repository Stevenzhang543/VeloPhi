<script setup lang="ts">
/**
 * Navigation rail (26.63, D232): the pages of the app in the order people use them — 首页 (start), 工作台 (build, run,
 * analyse), 实验室 (ready-made experiments), 资源库 (templates, problems, models, curriculum, handbook), 课堂 (lessons
 * and teacher tools), 监视 (render and monitor) — and, at the bottom, search, help and the settings. On a desktop it
 * is a column at the left edge; on a phone the same list opens as a drawer from the top bar (`drawer`).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { tl } from '../../i18n'
import { state } from '../store'
import type { Page } from '../store'
import { settings } from '../settings'
import { MOD } from '../shortcuts'
import { shell } from '../layout'
import { T3 } from '../models/labels'
import { T } from '../../content/models/types'
import AppLogo from './AppLogo.vue'
import Wordmark from './Wordmark.vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ drawer?: boolean }>(), { drawer: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const PAGES = computed((): Array<{ id: Page; label: string; icon: string; key: string; tip: string }> => [
  { id: 'home', label: tl('首页'), icon: 'home', key: 'Alt+1', tip: tl('开始：搜索、继续上次的场景、按身份进入') },
  { id: 'studio', label: tl('工作台'), icon: 'studio', key: 'Alt+2', tip: tl('搭建场景、运行仿真、对照公式与分析') },
  { id: 'lab', label: tl('实验室'), icon: 'flask', key: 'Alt+3', tip: tl('现成的实验：电路、波动、光学、热学、近代物理') },
  { id: 'library', label: tl('资源库'), icon: 'library', key: 'Alt+4', tip: tl('模板、题目、易错概念、模型目录、课程对照、学习手册') },
  { id: 'classroom', label: tl('课堂'), icon: 'classroom', key: 'Alt+5', tip: tl('课堂实验、教学活动、预测统计与教师工具') },
  { id: 'monitor', label: T3(T('监视', 'Monitor', 'Monitor')), icon: 'monitor', key: 'Alt+6', tip: tl('渲染与监视：大画面播放、读数与能量') }
])

function go(p: Page) { state.page = p; emit('close') }
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
    <button v-if="!props.drawer" type="button" class="logo" :title="tl('VeloΦ 首页')" :aria-label="tl('首页')" @click="go('home')"><AppLogo :size="28" /></button>
    <div v-else class="brand"><AppLogo :size="26" /><Wordmark :size="16" /><span class="spacer" /><button type="button" class="btn icon ghost" :aria-label="tl('关闭')" @click="emit('close')"><Icon name="close" /></button></div>
    <div class="items">
      <button v-for="p in PAGES" :key="p.id" type="button" class="item" :data-ui="`page-${p.id}`" :class="{ on: state.page === p.id }" :aria-current="state.page === p.id ? 'page' : undefined" :title="props.drawer ? undefined : `${p.tip}（${p.key}）`" @click="go(p.id)">
        <span class="pill"><Icon :name="p.icon" :size="20" /></span><span class="lbl">{{ p.label }}</span>
        <span v-if="props.drawer" class="tip-text small muted">{{ p.tip }}</span>
      </button>
    </div>
    <span class="spacer" />
    <div class="items foot">
      <button type="button" class="item" data-ui="search" :title="props.drawer ? undefined : tl('全局搜索（{0}+K）', [MOD])" @click="search"><span class="pill"><Icon name="search" :size="19" /></span><span class="lbl">{{ tl('搜索') }}</span></button>
      <div class="rail-help">
        <button type="button" class="item" data-ui="help" :class="{ on: help }" :aria-expanded="help" :title="props.drawer ? undefined : tl('帮助：导览、快捷键、关于')" @click="help = !help"><span class="pill"><Icon name="help" :size="19" /></span><span class="lbl">{{ tl('帮助') }}</span></button>
        <div v-if="help" class="menu help-menu" role="menu">
          <button role="menuitem" @click="act(() => { state.showWelcome = true })"><Icon name="graduation" />{{ tl('欢迎与导览') }}</button>
          <button role="menuitem" @click="act(() => { shell.shortcuts = true })"><Icon name="keyboard" />{{ tl('快捷键一览') }}<span class="spacer" /><kbd>?</kbd></button>
          <button role="menuitem" @click="act(() => { state.page = 'library'; state.librarySection = 'handbook' })"><Icon name="book" />{{ tl('学习手册') }}</button>
          <button role="menuitem" @click="act(() => { state.showAbout = true })"><Icon name="info" />{{ tl('关于 VeloΦ') }}</button>
        </div>
      </div>
      <button type="button" class="item" data-ui="page-settings" :class="{ on: state.page === 'settings' }" :aria-current="state.page === 'settings' ? 'page' : undefined" :title="props.drawer ? undefined : tl('设置（{0}+,）', [MOD])" @click="go('settings')"><span class="pill"><Icon name="settings" :size="19" /></span><span class="lbl">{{ tl('设置') }}</span></button>
    </div>
  </nav>
</template>

<style scoped>
.rail { flex: 0 0 var(--rail-w); width: var(--rail-w); display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 8px 6px 8px; background: var(--chrome); border-right: 1px solid var(--border); position: relative; z-index: 60; min-height: 0; overflow: visible; }
.logo { align-self: center; width: 40px; height: 40px; border: 0; background: none; border-radius: 12px; display: grid; place-items: center; cursor: pointer; margin-bottom: 6px; transition: transform var(--dur-release) var(--ease-out), background var(--dur-hover) ease; }
.logo:hover { background: var(--hover); }
.logo:active { transform: scale(0.94); }
.items { display: flex; flex-direction: column; gap: 2px; }
.item { position: relative; border: 0; background: none; color: var(--text-2); font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 3px 0 4px; border-radius: 10px; min-height: 40px; justify-content: center; -webkit-tap-highlight-color: transparent; }
.pill { width: 44px; height: 28px; border-radius: 999px; display: grid; place-items: center; transition: background var(--dur-toggle) ease, color var(--dur-hover) ease, transform var(--dur-release) var(--ease-out); }
.item:hover .pill { background: var(--fill); color: var(--text); }
.item:active .pill { transform: scale(0.92); transition-duration: var(--dur-press); }
.item.on { color: var(--accent); }
.item.on .pill { background: var(--accent-soft); color: var(--accent); }
.lbl { display: none; font-size: calc(10.5px * var(--zoom)); line-height: 1.2; font-weight: 500; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.labels .lbl { display: block; }
.item.on .lbl { font-weight: 650; }
.spacer { flex: 1; min-height: 8px; }
.rail-help { position: relative; display: flex; flex-direction: column; }
.help-menu { left: calc(100% + 8px); bottom: 0; top: auto; min-width: 210px; }
/* A short window: labels give way, the items stay reachable */
@media (max-height: 620px) { .rail:not(.drawer) .lbl { display: none; } .rail:not(.drawer) .item { min-height: 34px; } }

/* Phone: the same list as a drawer */
.rail.drawer { position: fixed; inset: 0 auto 0 0; width: min(86vw, 330px); flex-basis: auto; padding: 10px 10px calc(12px + env(safe-area-inset-bottom, 0px)); box-shadow: var(--elev-3); z-index: 9100; overflow: auto; animation: drawer-in var(--dur-enter) var(--ease-out); background: var(--pane); }
@keyframes drawer-in { from { transform: translateX(-24px); opacity: 0; } to { transform: none; opacity: 1; } }
.brand { display: flex; align-items: center; gap: 8px; padding: 2px 2px 10px 6px; }
.drawer .item { flex-direction: row; align-items: center; justify-content: flex-start; gap: 10px; padding: 6px 8px; min-height: 52px; text-align: left; }
.drawer .item.on { background: var(--accent-soft); }
.drawer .item.on .pill { background: none; }
.drawer .pill { width: 32px; flex: 0 0 auto; }
.drawer .lbl { font-size: var(--type-body); flex: 0 0 auto; }
.drawer .tip-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer .help-menu { left: 8px; right: 8px; bottom: calc(100% + 4px); }
</style>
