<script setup lang="ts">
/**
 * Settings › 账号与 AI (26.59, D153): sign in with the Whitelists account (browser approval or username and
 * password), the AI connection (official after signing in, or the user's own OpenAI-compatible / Anthropic key, kept
 * on this computer), a connection test, today's usage of the official AI, and the AI features.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { settings } from '../../settings'
import { showToast } from '../../store'
import { account, cookieMode, cancelDeviceSignIn, passwordSignIn, refreshAccount, signOut, startDeviceSignIn, officialBase } from '../../../ai/account'
import { getKey, setKey, maskKey } from '../../../ai/keys'
import { resetCaps, testConnection, aiLabel, aiCanThink, aiFlavor, aiLog, knownCapabilities } from '../../../ai/client'
import { AiError } from '../../../ai/types'
import { isDesktop } from '../../../platform/files'
import { openExternal } from '../../../platform/net'
import AsyncButton from '../AsyncButton.vue'
import Icon from '../Icon.vue'

const ai = settings.ai

// ---- thinking and the AI log (26.59 fix) ----
const thinkNote = computed(() => aiCanThink()
  ? tl('Copilot 先思考再回答（DeepSeek 深度思考）：更慢，用量更多；也可以在 Copilot 输入框旁直接切换。读题始终不思考，以免回答被截断。')
  : aiFlavor() === 'deepseek' ? tl('官方服务器需要更新后才能使用深度思考。') : tl('当前连接的模型没有可切换的深度思考（DeepSeek 可用）。'))
// 26.63 (D238): what this kind of service is known to do (ai/capabilities.ts)
const caps = computed(() => knownCapabilities())
const yn = (v: boolean) => (v ? tl('有') : tl('无'))
async function copyLog() {
  const text = aiLog.entries.map(e => `${e.at} ${e.id ?? ''}#${e.attempt ?? 1} ${e.purpose} ${e.connection} ${e.status} finish=${e.finish ?? ''} ${e.ms}ms tokens=${e.tokens ?? ''} reasoning=${e.reasoningChars}\n${e.answer}`).join('\n\n')
  try { await navigator.clipboard.writeText(text); showToast(tl('已复制')) } catch { /* unavailable */ }
}

// ---- account ----
const pwOpen = ref(false)
const username = ref('')
const password = ref('')
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => { void refreshAccount(); tick = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (tick) clearInterval(tick) })
const remaining = computed(() => { const d = account.device; if (!d) return ''; const s = Math.max(0, Math.round((d.expiresAt - now.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
async function pwSignIn() { if (await passwordSignIn(username.value, password.value)) { password.value = ''; pwOpen.value = false; showToast(tl('已登录 {0}', [account.user?.username ?? ''])) } }
async function copyLink() { try { await navigator.clipboard.writeText(account.device?.url ?? ''); showToast(tl('链接已复制')) } catch { /* clipboard unavailable */ } }
const expires = computed(() => (account.expiresAt ? new Date(account.expiresAt).toLocaleDateString() : ''))
function openSiteLogin() { void openExternal(`${officialBase() || 'https://velophi.whitelists.top'}/account/login.html?returnTo=${encodeURIComponent('/online/')}`) }

// ---- connection ----
interface Preset { id: string; label: string; kind: 'openai' | 'anthropic'; baseUrl: string; model: string; vision: boolean }
const PRESETS: Preset[] = [
  { id: 'openai', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vision: true },
  { id: 'deepseek', label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', vision: true },
  { id: 'qwen', label: tl('通义千问'), kind: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', vision: false },
  { id: 'moonshot', label: 'Moonshot', kind: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', vision: false },
  { id: 'openrouter', label: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', vision: true },
  { id: 'siliconflow', label: tl('硅基流动'), kind: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', vision: false },
  { id: 'ollama', label: tl('Ollama（本机）'), kind: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b', vision: false },
  { id: 'lmstudio', label: tl('LM Studio（本机）'), kind: 'openai', baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-model', vision: false },
  { id: 'anthropic', label: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', vision: true }
]
function usePreset(p: Preset) {
  ai.connection = p.kind
  Object.assign(ai[p.kind], { baseUrl: p.baseUrl, model: p.model, vision: p.vision })
  resetCaps()
}
const provider = computed(() => (ai.connection === 'official' ? null : ai[ai.connection]))
const keyInput = ref('')
const showKey = ref(false)
const storedKey = ref(ai.connection === 'official' ? '' : getKey(ai.connection))
watch(() => ai.connection, c => { storedKey.value = c === 'official' ? '' : getKey(c); keyInput.value = ''; resetCaps() })
function saveKey() {
  if (ai.connection === 'official') return
  setKey(ai.connection, keyInput.value)
  storedKey.value = getKey(ai.connection)
  keyInput.value = ''
  resetCaps()
  showToast(storedKey.value ? tl('API key 已保存在本机') : tl('API key 已清除'))
}

// ---- test ----
const testing = ref(false)
const testDone = ref(0)
const testResult = ref<{ ok: boolean; text: string } | null>(null)
async function runTest() {
  testing.value = true
  testResult.value = null
  try {
    const r = await testConnection()
    testResult.value = { ok: true, text: tl('连接正常：{0} ms · 模型回答“{1}”{2}', [r.ms, r.text || '…', r.model ? ` · ${r.model}` : '']) }
    testDone.value++
    if (ai.connection === 'official') void refreshAccount()
  } catch (e) {
    testResult.value = { ok: false, text: e instanceof AiError ? `${e.message}${e.detail ? `（${e.detail}）` : ''}` : String((e as Error).message) }
  } finally { testing.value = false }
}
const usage = computed(() => account.ai?.usage && account.ai.limits ? account.ai : null)
</script>

<template>
  <div class="ai-settings">
    <!-- ---- Account ---- -->
    <div class="sgroup">
      <div class="srow"><div class="sl"><b>{{ tl('Whitelists 账号') }}</b><span>{{ tl('登录后可以使用官方 AI。不登录也能使用全部仿真、解题与教学功能。') }}</span></div></div>
      <div v-if="account.user" class="srow">
        <div class="who"><Icon name="user" :size="18" /><b>{{ account.user.username }}</b><span v-if="account.user.isAdmin" class="badge">{{ tl('管理员') }}</span><span v-if="expires" class="muted tiny">{{ tl('登录有效至 {0}', [expires]) }}</span></div>
        <button v-if="!cookieMode" type="button" class="btn small" @click="signOut"><Icon name="logout" :size="14" />{{ tl('退出登录') }}</button>
      </div>
      <template v-else-if="cookieMode">
        <div class="srow"><span class="small muted">{{ tl('网页版使用网站的登录状态。') }}</span><button type="button" class="btn small primary" @click="openSiteLogin">{{ tl('在网站上登录') }}</button></div>
      </template>
      <template v-else>
        <div v-if="account.device" class="device" role="status">
          <span class="small">{{ tl('在浏览器中核对并允许登录。代码：') }}</span>
          <code class="code">{{ account.device.userCode }}</code>
          <span class="tiny muted">{{ tl('剩余 {0}', [remaining]) }}</span>
          <div class="btns">
            <button type="button" class="btn small" @click="openExternal(account.device!.url)"><Icon name="link" :size="14" />{{ tl('再次打开浏览器') }}</button>
            <button type="button" class="btn small ghost" @click="copyLink">{{ tl('复制链接') }}</button>
            <button type="button" class="btn small ghost" @click="cancelDeviceSignIn">{{ tl('取消') }}</button>
          </div>
        </div>
        <div v-else class="srow">
          <div class="btns">
            <AsyncButton primary icon="link" :busy="account.busy && !pwOpen" @click="startDeviceSignIn">{{ tl('在浏览器中登录（推荐）') }}</AsyncButton>
            <button type="button" class="btn" :aria-expanded="pwOpen" @click="pwOpen = !pwOpen">{{ tl('用账号密码登录') }}</button>
          </div>
        </div>
        <form v-if="pwOpen && !account.device" class="pw" @submit.prevent="pwSignIn">
          <label>{{ tl('用户名') }}<input v-model="username" class="field" autocomplete="username" maxlength="32" required></label>
          <label>{{ tl('密码') }}<input v-model="password" class="field" type="password" autocomplete="current-password" maxlength="128" required></label>
          <AsyncButton primary :busy="account.busy" @click="pwSignIn">{{ tl('登录') }}</AsyncButton>
        </form>
        <p v-if="account.error" class="err" role="alert">{{ account.error }}</p>
        <p class="tiny muted">{{ tl('账号由 whitelists.top 提供（邀请制）。密码只发送给 whitelists.top，VeloΦ 只保存登录令牌。') }}</p>
      </template>
    </div>

    <!-- ---- Connection ---- -->
    <div class="sgroup">
      <div class="srow"><div class="sl"><b>{{ tl('AI 连接') }}</b><span>{{ tl('官方 AI 需要登录；也可以使用自己的 API key（OpenAI 兼容或 Anthropic），密钥只保存在这台电脑上。') }}</span></div>
        <div class="segmented" role="radiogroup" :aria-label="tl('AI 连接')">
          <button role="radio" :aria-checked="ai.connection === 'official'" :class="{ on: ai.connection === 'official' }" @click="ai.connection = 'official'">{{ tl('官方') }}</button>
          <button role="radio" :aria-checked="ai.connection === 'openai'" :class="{ on: ai.connection === 'openai' }" @click="ai.connection = 'openai'">{{ tl('OpenAI 兼容') }}</button>
          <button role="radio" :aria-checked="ai.connection === 'anthropic'" :class="{ on: ai.connection === 'anthropic' }" @click="ai.connection = 'anthropic'">Anthropic</button>
        </div>
      </div>
      <template v-if="ai.connection === 'official'">
        <div class="srow"><span class="small" :class="account.user ? '' : 'muted'">{{ account.user ? (account.ai?.enabled ? tl('官方 AI 可用：{0}', [account.ai.model ?? '']) : tl('服务器还没有配置官方 AI')) : tl('请先登录 Whitelists 账号') }}</span></div>
        <div v-if="usage" class="srow"><span class="small">{{ tl('今日用量：{0} / {1} 次，{2} / {3} token', [usage.usage!.requests, usage.limits!.requests, usage.usage!.tokens, usage.limits!.tokens]) }}</span></div>
      </template>
      <template v-else-if="provider">
        <div class="srow chips"><span class="tiny muted">{{ tl('常用：') }}</span><button v-for="p in PRESETS.filter(x => x.kind === ai.connection)" :key="p.id" type="button" class="btn small" :class="{ active: provider.baseUrl === p.baseUrl }" @click="usePreset(p)">{{ p.label }}</button></div>
        <div class="srow"><div class="sl"><b>{{ tl('接口地址') }}</b><span>{{ ai.connection === 'openai' ? tl('OpenAI 兼容接口的根地址（会加上 /chat/completions）') : tl('Anthropic 接口的根地址（会加上 /v1/messages）') }}</span></div><input v-model.trim="provider.baseUrl" class="field wide" spellcheck="false" @change="resetCaps"></div>
        <div class="srow"><div class="sl"><b>{{ tl('模型') }}</b></div><input v-model.trim="provider.model" class="field wide" spellcheck="false" @change="resetCaps"></div>
        <div class="srow"><div class="sl"><b>API key</b><span>{{ storedKey ? tl('已保存：{0}', [maskKey(storedKey)]) : tl('尚未填写') }}</span></div>
          <div class="keyrow"><input v-model="keyInput" class="field wide" :type="showKey ? 'text' : 'password'" autocomplete="off" spellcheck="false" :placeholder="storedKey ? tl('输入新的 key 以替换') : 'sk-…'"><button type="button" class="btn icon ghost" :aria-label="showKey ? tl('隐藏') : tl('显示')" @click="showKey = !showKey"><Icon name="eye" :size="14" /></button><button type="button" class="btn small" @click="saveKey">{{ keyInput ? tl('保存') : tl('清除') }}</button></div>
        </div>
        <div class="srow"><div class="sl"><b>{{ tl('模型支持图片') }}</b><span>{{ tl('开启后可以粘贴或拖入题目照片。') }}</span></div><input v-model="provider.vision" type="checkbox" class="switch"></div>
        <div v-if="isDesktop" class="srow"><div class="sl"><b>{{ tl('网络代理（可选）') }}</b><span>{{ tl('留空使用系统代理；例如 http://127.0.0.1:7890') }}</span></div><input v-model.trim="ai.proxy" class="field wide" spellcheck="false" placeholder="http://127.0.0.1:7890"></div>
        <p v-else class="tiny muted">{{ tl('网页版直接从浏览器连接该接口，提供方需要允许跨域请求；不允许时请使用桌面版。') }}</p>
      </template>
      <div class="srow"><div class="sl"><b>{{ tl('测试连接') }}</b><span>{{ aiLabel() }}</span></div><AsyncButton :busy="testing" :done="testDone" icon="check2" @click="runTest">{{ tl('测试') }}</AsyncButton></div>
      <p v-if="testResult" class="result" :class="{ err: !testResult.ok }" role="status">{{ testResult.text }}</p>
    </div>

    <!-- ---- Features ---- -->
    <div class="sgroup">
      <div class="srow"><div class="sl"><b>{{ tl('读题后直接显示答案') }}</b><span>{{ tl('关闭时答案先折叠，学生作答后再揭晓（适合练习）。') }}</span></div><input v-model="ai.revealAnswers" type="checkbox" class="switch"></div>
      <div class="srow"><div class="sl"><b>Copilot</b><span>{{ tl('侧栏的 AI 页（手机上是底部的 AI）：讲题、生成仿真场景、替你操作（Ctrl+I 打开或收起）。') }}</span></div><input v-model="ai.copilot" type="checkbox" class="switch"></div>
      <div class="srow"><div class="sl"><b>{{ tl('深度思考') }}</b><span>{{ thinkNote }}</span></div><input v-model="ai.thinking" type="checkbox" class="switch" :disabled="!aiCanThink()"></div>
      <div class="srow"><div class="sl"><b>{{ tl('Copilot 操作软件') }}</b><span>{{ tl('直接执行：Copilot 可以替你载入例题、改参数、播放，每一步都能撤销；每次先问我：执行前先确认。') }}</span></div>
        <div class="segmented" role="radiogroup"><button role="radio" :aria-checked="ai.copilotMode === 'act'" :class="{ on: ai.copilotMode === 'act' }" @click="ai.copilotMode = 'act'">{{ tl('直接执行') }}</button><button role="radio" :aria-checked="ai.copilotMode === 'ask'" :class="{ on: ai.copilotMode === 'ask' }" @click="ai.copilotMode = 'ask'">{{ tl('每次先问我') }}</button></div>
      </div>
      <div class="srow"><div class="sl"><b>{{ tl('学习模式') }}</b><span>{{ tl('Copilot 先给思路提示，学生给出自己的答案后再对照仿真结果。') }}</span></div><input v-model="ai.learningMode" type="checkbox" class="switch"></div>
      <div class="srow"><div class="sl"><b>{{ tl('向 AI 发送当前场景摘要') }}</b><span>{{ tl('物体、参数与结果的简表，帮助 Copilot 回答“现在这个场景”的问题。不发送文件路径与账号信息。') }}</span></div><input v-model="ai.shareScene" type="checkbox" class="switch"></div>
    </div>
    <!-- ---- 26.63 (D238): what the AI does and does not do, and what this connection can do ---- -->
    <details class="sgroup log">
      <summary><b>{{ tl('AI 使用说明') }}</b> <span class="tiny muted">{{ tl('它做什么、不做什么，数据去了哪里') }}</span></summary>
      <ul class="disclose small">
        <li>{{ tl('AI 负责读题、讲解和搭场景；题目里的数值答案由 VeloΦ 的求解器计算并核对，没有经过核对的数值会标成“讲解草稿”。') }}</li>
        <li>{{ tl('发给 AI 的内容：你输入的文字或图片，以及（开着“发送场景摘要”时）当前场景的物体与参数。不发送文件路径、账号密码和其他场景。') }}</li>
        <li>{{ tl('题目文字和图片被当作数据处理：其中像指令的话不会改变 AI 的任务，也不会让它替你操作。') }}</li>
        <li>{{ tl('会替换未保存场景的操作，无论在哪种模式下都先问你；每一步操作都可以撤销。') }}</li>
        <li>{{ tl('服务繁忙或网络中断时自动重试最多两次（按服务要求的等待时间，或逐次加长的随机等待）；密钥错误、额度用完和被拒绝的请求不重试。') }}</li>
        <li>{{ tl('学习建议：先自己想、先预测，再让 AI 给证据。只看 AI 的答案，练习时成绩会更好，考试时反而更差。') }}</li>
      </ul>
      <p class="tiny muted">{{ tl('当前连接：{0}。已知能力：工具调用 {1} · JSON 模式 {2} · 严格结构化输出 {3} · 带图片时指定格式 {4}', [caps.family, yn(caps.tools), yn(caps.jsonObject), yn(caps.jsonSchema), yn(caps.formatWithImage)]) }}</p>
    </details>
    <!-- ---- AI log (26.59 fix): the last exchanges, to see why something failed ---- -->
    <details class="sgroup log">
      <summary><b>{{ tl('AI 记录') }}</b> <span class="tiny muted">{{ tl('最近 {0} 次请求（只在本机内存中，关闭软件后清空；不含 key 与请求内容）', [aiLog.entries.length]) }}</span></summary>
      <p v-if="!aiLog.entries.length" class="tiny muted">{{ tl('还没有请求。') }}</p>
      <div v-for="(e, i) in aiLog.entries" :key="i" class="log-row">
        <div class="log-head"><span>{{ e.at.slice(11, 19) }}</span><span v-if="e.id" class="mono">{{ e.id }}#{{ e.attempt ?? 1 }}</span><b>{{ e.purpose }}</b><span :class="{ bad: e.status !== 'ok' }">{{ e.status }}</span><span v-if="e.finish">finish: {{ e.finish }}</span><span>{{ e.ms }} ms</span><span v-if="e.tokens">{{ e.tokens }} tokens</span><span v-if="e.reasoningChars">{{ tl('思考 {0} 字', [e.reasoningChars]) }}</span></div>
        <pre v-if="e.answer" class="log-answer">{{ e.answer }}</pre>
      </div>
      <button v-if="aiLog.entries.length" type="button" class="btn small" @click="copyLog">{{ tl('复制记录') }}</button>
    </details>
    <p class="tiny muted privacy">{{ tl('发送给 AI 的内容：你输入的题目文字或图片、Copilot 对话、模型与模板目录，以及（如果开启）当前场景摘要。官方 AI 的服务器只记录每日次数与 token 数，不保存题目与对话内容。') }}</p>
  </div>
</template>

<style scoped>
.ai-settings { display: grid; gap: 14px; }
/* The settings page's row layout (its styles are scoped to SettingsPage.vue) */
.sgroup { background: var(--group); border-radius: 12px; padding: 4px 14px; }
.srow { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: calc(44px * var(--zoom)); padding: 6px 0; flex-wrap: wrap; }
.srow + .srow { border-top: 1px solid var(--separator); }
.srow.chips { justify-content: flex-start; gap: 6px; flex-wrap: wrap; min-height: 36px; }
.log { padding: 10px 14px; }
.disclose { margin: 8px 0 6px; padding-left: 18px; line-height: 1.6; color: var(--text-2); }
.log summary { cursor: pointer; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.log-row { border-top: 1px solid var(--separator); padding: 6px 0; display: grid; gap: 4px; }
.log-head { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: var(--type-tiny); color: var(--text-2); }
.log-head .bad { color: var(--danger); }
.log-answer { margin: 0; max-height: 140px; overflow: auto; white-space: pre-wrap; word-break: break-all; font-family: var(--font-mono); font-size: var(--type-tiny); background: var(--fill); border-radius: 6px; padding: 6px 8px; }
.sl { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 260px; }
.sl b { font-weight: 550; font-size: var(--type-body); }
.sl span { font-size: var(--type-tiny); color: var(--text-3); line-height: 1.4; }
.sgroup > .tiny, .sgroup > .result, .sgroup > .err { margin: 6px 0 8px; }
.who { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge { font-size: var(--type-tiny); padding: 1px 6px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.btns { display: flex; flex-wrap: wrap; gap: 6px; }
.device { display: grid; gap: 8px; padding: 10px 12px; }
.code { font-family: var(--font-mono); font-size: 1.6em; letter-spacing: 0.12em; font-weight: 700; }
.pw { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end; padding: 4px 12px 10px; }
.pw label { display: grid; gap: 4px; font-size: var(--type-small); color: var(--text-2); }
.err { color: var(--danger); margin: 0 12px; font-size: var(--type-small); }
.field.wide { width: min(360px, 100%); }
.keyrow { display: flex; gap: 6px; align-items: center; }
.result { margin: 0 12px 10px; font-size: var(--type-small); color: var(--success); }
.result.err { color: var(--danger); }
.privacy { margin: 0 4px; }
@media (max-width: 700px) { .pw { grid-template-columns: 1fr; } }
</style>
