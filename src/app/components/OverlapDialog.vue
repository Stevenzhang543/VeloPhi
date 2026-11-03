<script setup lang="ts">
/**
 * Overlapping bodies before a run (26.59 fix 3, D200): which bodies overlap and by how much, and the choice — push
 * them apart along the shortest way (undoable) or cancel and move them by hand. Overlaps too deep to resolve
 * automatically can only be moved by hand.
 */
import { tl } from '../../i18n'
import { vDialog } from '../focusTrap'
import { overlapPrompt } from '../overlapGate'
import Icon from './Icon.vue'

const choose = (c: 'push' | 'cancel') => overlapPrompt.answer?.(c)
</script>

<template>
  <Teleport to="body">
    <div v-if="overlapPrompt.open" class="dialog-backdrop" @mousedown.self="choose('cancel')">
      <div v-dialog="() => choose('cancel')" class="dialog overlap-dialog" role="alertdialog" aria-modal="true" :aria-label="tl('物体重叠')">
        <div class="dialog-header"><Icon name="info" :size="16" />{{ tl('物体重叠') }}</div>
        <div class="dialog-body">
          <p>{{ tl('开始时有物体互相重叠。直接计算时，求解器会在 t = 0 把它们一下子推开（看起来像瞬移），重叠太深时接触无法正确处理。') }}</p>
          <ul class="pairs"><li v-for="(l, i) in overlapPrompt.lines" :key="i">{{ l }}</li></ul>
          <template v-if="overlapPrompt.stuck.length">
            <p class="warn" role="alert">{{ tl('以下物体重叠太深，无法自动挤开，请手动移动：') }}</p>
            <ul class="pairs warn"><li v-for="(l, i) in overlapPrompt.stuck" :key="i">{{ l }}</li></ul>
          </template>
          <p v-else class="muted small">{{ tl('“挤开”按最短路线移动可动物体，使它们刚好接触（较重的物体移动较少，绳和铰链保持连接），可撤销。') }}</p>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn" @click="choose('cancel')">{{ tl('取消，我来移动') }}</button>
          <button v-if="overlapPrompt.canPush" type="button" class="btn primary" @click="choose('push')">{{ tl('挤开并计算') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlap-dialog { width: min(520px, calc(100vw - 32px)); }
.overlap-dialog .dialog-footer { flex-wrap: wrap; }
.overlap-dialog .dialog-footer .btn { max-width: 100%; white-space: normal; }
.dialog-header { gap: 8px; }
.pairs { margin: 8px 0; padding-left: 20px; display: grid; gap: 2px; font-variant-numeric: tabular-nums; }
.warn { color: var(--danger); }
.small { font-size: var(--type-small); }
.muted { color: var(--text-3); }
</style>
