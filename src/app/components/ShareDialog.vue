<script setup lang="ts">
/**
 * Share link (26.63, D236): the scene on screen as an address. The scene travels inside the link (compressed), so
 * nothing is uploaded; whoever opens it gets a copy in the web version, or pastes it into the home page of the
 * desktop app. Options: open in the simulate mode, start playing. A long link gets a warning and the file as the
 * other way.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../i18n'
import { vDialog } from '../focusTrap'
import { state, showToast } from '../store'
import { shell } from '../layout'
import { saveScene } from '../files'
import { currentShareLink } from '../shareOpen'
import { SHARE_LONG, shareBase } from '../share'
import { isDesktop } from '../../platform/files'
import Icon from './Icon.vue'

const close = () => { shell.share = false }
const simulate = ref(true)
const autoplay = ref(false)
const link = ref('')
const failed = ref('')
async function build() {
  failed.value = ''
  try { link.value = await currentShareLink({ mode: simulate.value ? 'simulate' : null, play: autoplay.value }) } catch (e) { link.value = ''; failed.value = (e as Error).message }
}
watch([simulate, autoplay], build, { immediate: true })
const long = computed(() => link.value.length > SHARE_LONG)
const offSite = computed(() => isDesktop || !link.value.startsWith(typeof location !== 'undefined' ? location.origin : '~'))
async function copy() {
  try { await navigator.clipboard.writeText(link.value); showToast(tl('链接已复制（{0} 个字符）', [link.value.length])) } catch { showToast(tl('无法写入剪贴板，请手动选中链接复制'), true) }
}
function selectAll(e: Event) { (e.target as HTMLTextAreaElement).select() }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div v-dialog="close" class="dialog share" role="dialog" :aria-label="tl('分享链接')">
      <div class="dialog-header"><Icon name="share" :size="18" />{{ tl('分享链接') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <p class="lead">{{ tl('“{0}”连同它的全部设置都写在链接里：不上传到任何服务器，也不需要账号。对方打开链接得到的是一份副本，改动不会影响你的场景。', [state.scene.name]) }}</p>
        <textarea class="field link mono" rows="4" readonly :value="link" :aria-label="tl('分享链接')" data-ui="share-link" @focus="selectAll" />
        <div class="opts">
          <label class="check"><input v-model="simulate" type="checkbox" />{{ tl('打开后进入“仿真”模式') }}</label>
          <label class="check"><input v-model="autoplay" type="checkbox" />{{ tl('打开后自动播放') }}</label>
          <span class="spacer" /><span class="tiny muted mono">{{ tl('{0} 个字符', [link.length]) }}</span>
        </div>
        <p v-if="failed" class="note bad small">{{ tl('无法生成链接：{0}', [failed]) }}</p>
        <p v-if="long" class="note warn small"><Icon name="alert" :size="14" />{{ tl('这个链接很长，有些聊天软件和邮件会把它截断。场景较大时，建议改发场景文件。') }}</p>
        <p v-if="offSite" class="note small muted">{{ tl('链接指向网页版 {0}（需要 26.63 或更新的版本）；在桌面版里，把链接粘贴到首页的输入框也能打开。', [shareBase()]) }}</p>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="saveScene(true)"><Icon name="saveas" />{{ tl('改为保存文件…') }}</button>
        <button class="btn primary" :disabled="!link" data-ui="share-copy" @click="copy"><Icon name="copy" />{{ tl('复制链接') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.share { width: min(620px, calc(100vw - 32px)); }
.lead { margin: 0 0 10px; color: var(--text-2); line-height: 1.55; }
.link { width: 100%; font-size: var(--type-tiny); word-break: break-all; resize: none; }
.opts { display: flex; align-items: center; gap: 16px; margin-top: 8px; flex-wrap: wrap; }
.note { margin: 10px 0 0; display: flex; gap: 6px; align-items: baseline; line-height: 1.5; }
.note.warn { color: var(--warning); }
.note.bad { color: var(--danger); }
.note :deep(.icon) { flex: 0 0 auto; transform: translateY(2px); }
</style>
