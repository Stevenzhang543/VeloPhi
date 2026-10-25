<script setup lang="ts">
/**
 * Inline text box of the text annotation tool, placed over the canvas at the annotation point. Enter commits
 * (Shift+Enter starts a new line), Esc cancels, leaving the box commits.
 */
import { tl } from '../../i18n'
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps<{ x: number; y: number; text: string; size: number }>()
const emit = defineEmits<{ (e: 'commit', text: string): void; (e: 'cancel'): void }>()

const el = ref<HTMLTextAreaElement | null>(null)
const value = ref(props.text)
let done = false

function commit() {
  if (done) return
  done = true
  emit('commit', value.value)
}
function cancel() {
  if (done) return
  done = true
  emit('cancel')
}
function onKey(e: KeyboardEvent) {
  // Keep the editor shortcuts (Delete, arrows, V…) away from the canvas while typing
  e.stopPropagation()
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
  else if (e.key === 'Escape') { e.preventDefault(); cancel() }
}
function rows() { return Math.max(1, value.value.split('\n').length) }

onMounted(async () => {
  await nextTick()
  el.value?.focus()
  el.value?.select()
})
</script>

<template>
  <textarea ref="el" v-model="value" class="ann-input" :rows="rows()" :style="{ left: `${props.x - 5}px`, top: `${props.y - 4}px`, fontSize: `${props.size}px` }"
    :placeholder="tl('输入文字，Enter 完成')" spellcheck="false" @keydown="onKey" @blur="commit" @mousedown.stop />
</template>

<style scoped>
.ann-input {
  position: absolute; z-index: 20; min-width: 160px; padding: 2px 4px; resize: none; overflow: hidden;
  border: 1.5px solid var(--accent); border-radius: 6px; background: var(--pane); color: var(--text);
  font-family: var(--font-ui); line-height: 1.3; box-shadow: var(--shadow); outline: none;
  field-sizing: content;
}
</style>
