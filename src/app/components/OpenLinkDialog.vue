<script setup lang="ts">
/**
 * "Open from a link" (26.64, D241): the paste box of the 26.63 home page, as a small dialog. A share link carries its
 * scene in the address (share.ts) — nothing is fetched. Opened from the file menu, the global search and the keyboard;
 * on the home page the same thing happens when a link is pasted anywhere (Ctrl+V).
 */
import { nextTick, onMounted, ref } from 'vue'
import { tl } from '../../i18n'
import { vDialog } from '../focusTrap'
import { shell } from '../layout'
import { isShareLink, openShared } from '../shareOpen'
import Icon from './Icon.vue'

const text = ref('')
const bad = ref(false)
const busy = ref(false)
const input = ref<HTMLTextAreaElement | null>(null)
const close = () => { shell.openLink = false }

async function open() {
  const link = text.value.trim()
  if (!link || busy.value) return
  if (!isShareLink(link)) { bad.value = true; return }
  busy.value = true
  try { if (await openShared(link)) close() } finally { busy.value = false }
}
onMounted(() => nextTick(() => input.value?.focus()))
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <form v-dialog="close" class="dialog link" role="dialog" :aria-label="tl('从链接打开')" @submit.prevent="open">
      <div class="dialog-header"><Icon name="link" :size="18" />{{ tl('从链接打开') }}<span class="spacer" /><button type="button" class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <textarea ref="input" v-model="text" class="field box" :class="{ invalid: bad }" rows="4" data-ui="open-link-input" :placeholder="tl('粘贴 VeloΦ 分享链接')" :aria-label="tl('分享链接')" :aria-invalid="bad" aria-describedby="open-link-note" @input="bad = false" @keydown.enter.exact.prevent="open" />
        <p id="open-link-note" class="small note" :class="{ bad }" role="status">{{ bad ? tl('这不是 VeloΦ 分享链接') : tl('场景就在链接里，不经过任何服务器。') }}</p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" @click="close">{{ tl('取消') }}</button>
        <button type="submit" class="btn primary" data-ui="open-link-go" :disabled="!text.trim() || busy">{{ tl('打开') }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.link { width: min(520px, calc(100vw - 32px)); }
.box { width: 100%; font-family: var(--font-code); font-size: var(--type-small); word-break: break-all; }
.note { margin: var(--space-2) 0 0; color: var(--text-2); }
.note.bad { color: var(--danger); }
</style>
