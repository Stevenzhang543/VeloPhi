<script setup lang="ts">
/**
 * Context menu of the viewport: a fixed-position list with optional one-level submenus, shortcut hints,
 * disabled items with a reason, and keyboard navigation (↑ ↓ Enter → ← Esc). It only reports the chosen item;
 * the viewport runs the command.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'

/** An entry of the context menu; `children` open a one-level submenu. */
export interface MenuItem {
  id: string
  label: string
  icon?: string
  /** Shortcut hint shown on the right. */
  shortcut?: string
  disabled?: boolean
  /** Tooltip (for example why an item is disabled). */
  title?: string
  danger?: boolean
  /** Separator above this item. */
  sep?: boolean
  children?: MenuItem[]
}

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{ (e: 'pick', id: string): void; (e: 'close'): void }>()

const root = ref<HTMLDivElement | null>(null)
const pos = ref({ left: props.x, top: props.y })
const active = ref(-1)
const openSub = ref(-1)
const subActive = ref(-1)
const subLeft = ref(false)

function place() {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  pos.value = {
    left: Math.max(4, Math.min(props.x, window.innerWidth - r.width - 4)),
    top: Math.max(4, Math.min(props.y, window.innerHeight - r.height - 4))
  }
  subLeft.value = pos.value.left + r.width + 200 > window.innerWidth
}

function pick(it: MenuItem, i: number) {
  if (it.disabled) return
  if (it.children) { openSub.value = openSub.value === i ? -1 : i; subActive.value = -1; return }
  emit('pick', it.id)
}

function onOutside(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}

function move(list: MenuItem[], cur: number, d: number): number {
  const n = list.length
  for (let k = 1; k <= n; k++) {
    const i = (cur + d * k + n * 2) % n
    if (!list[i].disabled) return i
  }
  return cur
}

function onKey(e: KeyboardEvent) {
  const sub = openSub.value >= 0 ? props.items[openSub.value].children ?? null : null
  const k = e.key
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' '].includes(k)) {
    // Any other key closes the menu and goes on to its normal handler
    if (k !== 'Shift' && k !== 'Control' && k !== 'Alt' && k !== 'Meta') emit('close')
    return
  }
  e.preventDefault()
  e.stopPropagation()
  if (k === 'Escape') { if (sub) openSub.value = -1; else emit('close'); return }
  if (sub && subActive.value >= 0) {
    if (k === 'ArrowUp' || k === 'ArrowDown') subActive.value = move(sub, subActive.value, k === 'ArrowUp' ? -1 : 1)
    else if (k === 'ArrowLeft') { subActive.value = -1; openSub.value = -1 }
    else if (k === 'Enter' || k === ' ') { const it = sub[subActive.value]; if (it && !it.disabled) emit('pick', it.id) }
    return
  }
  if (k === 'ArrowUp' || k === 'ArrowDown') { active.value = move(props.items, active.value < 0 ? (k === 'ArrowUp' ? 0 : -1) : active.value, k === 'ArrowUp' ? -1 : 1); openSub.value = -1 }
  else if (k === 'ArrowRight' || ((k === 'Enter' || k === ' ') && props.items[active.value]?.children)) {
    const it = props.items[active.value]
    if (it?.children) { openSub.value = active.value; subActive.value = move(it.children, -1, 1) }
  } else if (k === 'Enter' || k === ' ') { const it = props.items[active.value]; if (it) pick(it, active.value) }
}

const close = () => emit('close')

onMounted(async () => {
  await nextTick()
  place()
  window.addEventListener('mousedown', onOutside, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
  window.addEventListener('wheel', close, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
  window.removeEventListener('wheel', close)
})
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="ctx-menu" role="menu" :style="{ left: `${pos.left}px`, top: `${pos.top}px` }" @contextmenu.prevent @mousedown.stop>
      <template v-for="(it, i) in props.items" :key="it.id">
        <div v-if="it.sep" class="sep" role="separator" />
        <div class="row-wrap" @mouseenter="active = i; if (it.children && !it.disabled) { openSub = i; subActive = -1 } else openSub = -1">
          <button class="row" role="menuitem" :class="{ on: active === i, danger: it.danger }" :disabled="it.disabled" :title="it.title" @click="pick(it, i)">
            <span class="ic"><Icon v-if="it.icon" :name="it.icon" :size="15" /></span>
            <span class="lbl">{{ it.label }}</span>
            <span v-if="it.shortcut" class="kbd">{{ it.shortcut }}</span>
            <span v-if="it.children" class="chev">›</span>
          </button>
          <div v-if="it.children && openSub === i" class="ctx-menu sub" :class="{ left: subLeft }" role="menu">
            <button v-for="(c, j) in it.children" :key="c.id" class="row" role="menuitem" :class="{ on: subActive === j }" :disabled="c.disabled" :title="c.title" @mouseenter="subActive = j" @click="pick(c, j)">
              <span class="ic"><Icon v-if="c.icon" :name="c.icon" :size="15" /></span>
              <span class="lbl">{{ c.label }}</span>
              <span v-if="c.shortcut" class="kbd">{{ c.shortcut }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-menu {
  position: fixed; z-index: 3000; min-width: 210px; padding: 5px; border-radius: 10px;
  background: var(--pane); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18), 0 0 0 1px var(--separator);
  font-size: var(--type-body); user-select: none;
}
.ctx-menu.sub { position: absolute; top: -5px; left: calc(100% + 2px); }
.ctx-menu.sub.left { left: auto; right: calc(100% + 2px); }
.row-wrap { position: relative; }
.row {
  display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; text-align: left;
  padding: 5px 8px; border-radius: 6px; cursor: pointer; color: var(--text); white-space: nowrap;
}
.row.on:not(:disabled), .row:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); }
.row:disabled { opacity: 0.42; cursor: default; }
.row.danger { color: var(--danger); }
.row.danger.on:not(:disabled), .row.danger:hover:not(:disabled) { background: var(--danger); color: #fff; }
.ic { width: 16px; display: inline-flex; justify-content: center; flex: 0 0 auto; }
.lbl { flex: 1; }
.kbd { font-size: var(--type-tiny); opacity: 0.65; font-family: var(--font-mono); }
.chev { opacity: 0.7; }
.sep { height: 1px; background: var(--separator); margin: 4px 6px; }
</style>
