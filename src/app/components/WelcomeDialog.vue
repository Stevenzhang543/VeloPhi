<script setup lang="ts">
/**
 * Welcome page (26.58, D138): shown once on the first start (and from Help / Ctrl+K). Four ways in — teach a
 * lesson, practise as a student, paste a problem for the AI to read (26.59, D172), experiment freely — and the
 * 60-second tour. Playback pauses while it is open (26.59, UX3). Teachers named setup, time and
 * training as their main obstacles (docs/DEV_MANUAL_26_58.md §1): each card leads straight to ready content.
 */
import { onMounted } from 'vue'
import { vDialog } from '../focusTrap'
import { tl } from '../../i18n'
import { state, pause } from '../store'
import { setCopilotOpen } from '../layout'
import { settings } from '../settings'
import { openTemplate } from '../learn/actions'
import { newScene } from '../files'
import Icon from './Icon.vue'
import AppLogo from './AppLogo.vue'

function done() {
  settings.ui.welcomed = true
  state.showWelcome = false
}
function teach() {
  settings.projector = true
  done()
  state.page = 'studio'
  state.showTemplates = true
}
function learn() {
  done()
  state.showLearning = true
}
async function explore(kind: 'blank' | 'many') {
  done()
  if (kind === 'blank') await newScene()
  else await openTemplate('galton')
}
/** Paste a problem: the import bar above the canvas, focused (it is switched on if it was off). */
function paste() {
  done()
  state.page = 'studio'
  // 26.59 fix (D182): problems are pasted into the Copilot box ("识别题目")
  settings.ai.copilot = true
  setCopilotOpen(true)
  setTimeout(() => window.dispatchEvent(new CustomEvent('velophi:focus-import')), 120)
}
onMounted(() => { if (state.playing) pause() })
function tour() {
  done()
  state.page = 'studio'
  state.tourStep = 0
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="done">
    <div v-dialog="done" class="dialog welcome" role="dialog" :aria-label="tl('欢迎使用 VeloΦ')">
      <div class="dialog-body">
        <div class="hero">
          <AppLogo class="logo" />
          <div>
            <h2>{{ tl('欢迎使用 VeloΦ') }}</h2>
            <p class="muted">{{ tl('画面上的一切都来自数值求解器，公式只做对照，误差公开。从下面任一入口开始，随时可以从“帮助”或 Ctrl+K 回到这里。') }}</p>
          </div>
        </div>
        <div class="cards">
          <button class="card" @click="teach">
            <Icon name="monitor" :size="22" />
            <b>{{ tl('课堂演示') }}</b>
            <span>{{ tl('切换为课堂投影（大字、粗线），打开 80 多个经典模型的模板库，选一个、改参数、播放。') }}</span>
          </button>
          <button class="card" @click="learn">
            <Icon name="graduation" :size="22" />
            <b>{{ tl('学生练习') }}</b>
            <span>{{ tl('按课程顺序的学习路径：先预测、再观察、最后解释；题目答案由仿真给出。') }}</span>
          </button>
          <button class="card" @click="paste">
            <Icon name="wand" :size="22" />
            <b>{{ tl('粘贴一道题') }}</b>
            <span>{{ tl('粘贴题目文字或截图，AI 读题、分类并建好场景，答案由引擎计算。需要登录或填写自己的 API key。') }}</span>
          </button>
          <div class="card two">
            <Icon name="flask" :size="22" />
            <b>{{ tl('自由实验') }}</b>
            <span>{{ tl('从空白场景开始搭建，或打开多体沙盒（高尔顿板），看几百个小球怎样落成正态分布。') }}</span>
            <div class="row-btns">
              <button class="btn small" @click="explore('blank')">{{ tl('空白场景') }}</button>
              <button class="btn small" @click="explore('many')">{{ tl('多体沙盒') }}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="tour"><Icon name="play" :size="14" />{{ tl('60 秒导览') }}</button>
        <span class="spacer" />
        <button class="btn primary" @click="done">{{ tl('开始使用') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome { width: min(760px, calc(100vw - 32px)); }
.hero { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
.hero .logo { width: 56px; height: 56px; flex: 0 0 auto; }
.hero h2 { margin: 0 0 4px; font-size: 22px; }
.hero p { margin: 0; line-height: 1.55; }
.cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.card { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; padding: 14px; border-radius: var(--radius-group); border: 1px solid var(--border); background: var(--panel); color: var(--text); font: inherit; line-height: 1.5; cursor: pointer; }
.card.two { cursor: default; }
button.card:hover, button.card:focus-visible { border-color: var(--accent); background: var(--accent-soft); }
.card b { font-size: 15px; }
.card span { color: var(--text-2); font-size: var(--type-small, 12.5px); }
.row-btns { display: flex; gap: 6px; margin-top: auto; padding-top: 4px; }
@media (max-width: 640px) { .cards { grid-template-columns: 1fr; } }
</style>
