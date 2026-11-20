<script setup lang="ts">
/**
 * Checking for updates in the settings (about section) and, `compact`, in the about dialog (26.64): the switch
 * "check at start" with what exactly is contacted, the current version, the last check, and "check now". Renders
 * nothing on the web build, which has no update.
 */
import { computed } from 'vue'
import { locale, tl } from '../../i18n'
import { settings } from '../settings'
import { ENGINE_VERSION } from '../../core/scene/types'
import { updatePlatform } from '../../platform/update'
import { checkForUpdates, update } from '../update'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const supported = updatePlatform.supported
const LOCALES = { zh: 'zh-CN', en: 'en-GB', de: 'de-DE' } as const
const checking = computed(() => update.phase === 'checking')
const status = computed(() => {
  if (checking.value) return tl('正在检查更新…')
  const at = settings.update.lastCheck
  if (!(at > 0)) return tl('尚未检查')
  return tl('上次检查：{0}，最新版本 {1}', [new Date(at).toLocaleString(LOCALES[locale.lang]), settings.update.lastLatest])
})
</script>

<template>
  <div v-if="supported" class="update-settings" :class="{ compact }" data-ui="update-settings">
    <div v-if="!compact" class="urow">
      <div class="ul">
        <b>{{ tl('启动时检查更新') }}</b>
        <span>{{ tl('每次启动后向 api.github.com 查询 VeloΦ 最新发布的版本：一次 HTTPS 请求，只带程序的版本号（VeloPhi/{0}），不带账号、设备或使用信息；GitHub 像对任何访问一样能看到网络地址。下载更新时访问 github.com 和它的下载服务器。', [ENGINE_VERSION]) }}</span>
      </div>
      <input v-model="settings.update.auto" type="checkbox" class="switch" :aria-label="tl('启动时检查更新')" />
    </div>
    <div class="urow">
      <div class="ul"><b>{{ tl('当前版本 {0}', [ENGINE_VERSION]) }}</b><span>{{ status }}</span></div>
      <button type="button" class="btn small" :disabled="checking" data-ui="update-check" @click="checkForUpdates(true)">{{ tl('立即检查') }}</button>
    </div>
  </div>
</template>

<style scoped>
.urow { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: calc(44px * var(--zoom)); padding: 6px 0; }
.urow + .urow { border-top: 1px solid var(--separator); }
.ul { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ul b { font-weight: var(--weight-medium); font-size: var(--type-body); }
.ul span { font-size: var(--type-tiny); color: var(--text-3); line-height: 1.4; overflow-wrap: break-word; }
.urow > .btn, .urow > .switch { flex: 0 0 auto; }
/* In the about dialog: one line under the content */
.compact { margin-top: 12px; border-top: 1px solid var(--separator); }
</style>
