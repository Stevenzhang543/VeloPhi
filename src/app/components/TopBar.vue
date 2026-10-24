<script setup lang="ts">
import { state, undo, redo, runSimulation } from '../store'
import { newScene, openScene, saveScene } from '../files'
import Icon from './Icon.vue'

const toggles: Array<{ key: keyof typeof state.display; label: string; tip: string }> = [
  { key: 'velocity', label: '速度', tip: '显示速度矢量' },
  { key: 'acceleration', label: '加速度', tip: '显示加速度矢量' },
  { key: 'forces', label: '受力', tip: '显示所选物体受力（运行后）' },
  { key: 'trajectory', label: '轨迹', tip: '显示质心轨迹' },
  { key: 'labels', label: '关键时刻', tip: '在画面上标注碰撞、共速等时刻' },
  { key: 'grid', label: '网格', tip: '显示网格与比例尺' }
]
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="6" fill="var(--accent)" /><path d="M6 7l6 11 6-11" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span class="name">Verity</span>
      <span class="doc small muted" :title="state.filePath ?? ''">{{ state.fileName ?? state.scene.name }}<span v-if="state.dirty" class="dot" title="有未保存的修改">●</span></span>
    </div>
    <div class="group-btns">
      <button class="btn ghost" title="新建（Ctrl+N）" @click="newScene"><Icon name="file" />新建</button>
      <button class="btn ghost" title="经典模型模板" @click="state.showTemplates = true"><Icon name="template" />模板</button>
      <button class="btn ghost" title="打开（Ctrl+O）" @click="openScene"><Icon name="open" />打开</button>
      <button class="btn ghost" title="保存（Ctrl+S）" @click="saveScene(false)"><Icon name="save" />保存</button>
      <button class="btn ghost small" title="另存为（Ctrl+Shift+S）" @click="saveScene(true)">另存为</button>
    </div>
    <div class="group-btns">
      <button class="btn icon ghost" title="撤销（Ctrl+Z）" :disabled="!state.past.length" @click="undo"><Icon name="undo" /></button>
      <button class="btn icon ghost" title="重做（Ctrl+Y）" :disabled="!state.future.length" @click="redo"><Icon name="redo" /></button>
    </div>
    <button class="btn primary" title="重新计算（Ctrl+Enter）" :disabled="state.computing" @click="runSimulation()"><Icon name="run" />{{ state.computing ? '计算中…' : state.stale ? '运行仿真' : '重新计算' }}</button>
    <div class="toggles">
      <button v-for="t in toggles" :key="t.key" class="btn small" :class="{ active: state.display[t.key] }" :title="t.tip" @click="state.display[t.key] = !state.display[t.key]">{{ t.label }}</button>
      <label class="check tiny" title="同时显示所有物体的受力"><input v-model="state.display.forcesAll" type="checkbox" :disabled="!state.display.forces" />全部受力</label>
    </div>
    <span class="spacer" />
    <button class="btn ghost" :disabled="!state.recording || state.stale" title="导出数据或视频" @click="state.showExport = true"><Icon name="export" />导出</button>
    <button class="btn icon ghost" :title="state.theme === 'dark' ? '浅色外观' : '深色外观'" @click="state.theme = state.theme === 'dark' ? 'light' : 'dark'"><Icon :name="state.theme === 'dark' ? 'sun' : 'moon'" /></button>
    <button class="btn icon ghost" title="关于与快捷键" @click="state.showAbout = true"><Icon name="info" /></button>
  </header>
</template>

<style scoped>
.topbar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; min-height: 48px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 8px; margin-right: 6px; min-width: 0; }
.name { font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
.doc { width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } /* fixed width: the buttons stay put when the file name changes */
.dot { color: var(--warning); margin-left: 4px; font-size: 10px; }
.group-btns { display: flex; gap: 2px; }
.toggles { display: flex; gap: 3px; align-items: center; flex-wrap: wrap; }
.toggles .btn { height: 26px; padding: 0 9px; }
</style>
