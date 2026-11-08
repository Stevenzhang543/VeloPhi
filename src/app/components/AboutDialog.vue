<script setup lang="ts">
/** About dialog: the shared about content (version, verifiability, shortcuts, licenses). */
import { vDialog } from '../focusTrap'
import { tl } from '../../i18n'
import { computed, ref } from 'vue'
import { state, showToast } from '../store'
import { reproPackage } from '../repro'
import { saveFile } from '../../platform/files'
import AboutContent from './AboutContent.vue'
import Icon from './Icon.vue'

function openSettings() { state.showAbout = false; state.page = 'settings' }

// 26.61 (A): the reproduction package — built here, shown before it is saved, never sent
const withScene = ref(false)
const steps = ref('')
const expected = ref('')
const actual = ref('')
const preview = computed(() => JSON.stringify(reproPackage({ withScene: withScene.value, steps: steps.value, expected: expected.value, actual: actual.value }), null, 1))
async function saveRepro() {
  try { if (await saveFile(preview.value, `velophi-repro-${Date.now().toString(36)}.json`, [{ name: 'JSON', extensions: ['json'] }])) showToast(tl('已保存')) } catch (e) { showToast((e as Error).message, true) }
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="state.showAbout = false">
    <div v-dialog="() => (state.showAbout = false)" class="dialog about-dialog" role="dialog" :aria-label="tl('关于 VeloPhi')">
      <div class="dialog-header">{{ tl('关于 VeloPhi') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="state.showAbout = false"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <AboutContent />
        <details class="repro" data-ui="repro">
          <summary>{{ tl('问题复现包（本地生成，保存前可预览）') }}</summary>
          <p class="tiny muted">{{ tl('只包含版本、平台类别、计算后端、求解器与设置、运行指纹、当前时刻与事件侧、错误代码和最近的诊断事件。不包含题图、聊天内容、文件名与路径、密钥。') }}</p>
          <label class="tiny">{{ tl('操作步骤') }}<textarea v-model="steps" rows="2" /></label>
          <label class="tiny">{{ tl('期望结果') }}<input v-model="expected"></label>
          <label class="tiny">{{ tl('实际结果') }}<input v-model="actual"></label>
          <label class="tiny"><input v-model="withScene" type="checkbox"> {{ tl('附上当前场景（只含几何与参数，名称换成 id）') }}</label>
          <pre class="tiny" tabindex="0">{{ preview }}</pre>
          <button class="btn small" @click="saveRepro"><Icon name="download" :size="12" />{{ tl('保存复现包') }}</button>
        </details>
      </div>
      <div class="dialog-footer"><button class="btn ghost" @click="openSettings"><Icon name="settings" :size="14" />{{ tl('打开设置') }}</button><span class="spacer" /><button class="btn primary" @click="state.showAbout = false">{{ tl('好') }}</button></div>
    </div>
  </div>
</template>

<style scoped>
.about-dialog { width: min(720px, calc(100vw - 48px)); }
</style>
