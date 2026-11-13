<script setup lang="ts">
/**
 * Home page (26.63, D232): where a session starts. One search for everything, the three things people come for — keep
 * going with a scene, solve a problem, look something up — then entries by role (student, teacher, researcher), a few
 * "predict first" cases, common templates and experiments. Every card opens something that exists; nothing here is a
 * setting.
 */
import { computed, ref } from 'vue'
import { tl } from '../../i18n'
import { state, showToast } from '../store'
import { settings } from '../settings'
import { MOD } from '../shortcuts'
import { newScene, openScene } from '../files'
import { TEMPLATES } from '../../templates'
import { LABS } from '../lab/catalog'
import { CASES } from '../../teaching/cases'
import { PROBLEM_COUNT } from '../../teaching/problemBank'
import { MODELS } from '../../content/models'
import { ENGINE_VERSION } from '../../core/scene/types'
import { openTemplate, openLab } from '../learn/actions'
import { openCase } from '../tally'
import { isShareLink, openShared } from '../shareOpen'
import { setCopilotOpen, shell, phone } from '../layout'
import { T3 } from '../models/labels'
import AppLogo from './AppLogo.vue'
import Wordmark from './Wordmark.vue'
import Icon from './Icon.vue'

const FEATURED = ['incline', 'projectile', 'collision-1d', 'pendulum', 'atwood', 'vertical-loop', 'rope-break-pendulum', 'cyclotron']
const templates = computed(() => FEATURED.map(id => TEMPLATES.find(t => t.id === id)).filter((t): t is (typeof TEMPLATES)[number] => !!t))
const GROUP_ICON: Record<string, string> = { incline: 'incline', projectile: 'ball', 'collision-1d': 'ball', pendulum: 'pendulum', atwood: 'pulley', 'vertical-loop': 'arcLoop', 'rope-break-pendulum': 'rope', cyclotron: 'bfield' }
const labs = computed(() => ['circuit', 'lens', 'waves', 'gas'].map(id => LABS.find(l => l.id === id)).filter((l): l is (typeof LABS)[number] => !!l))
const cases = computed(() => ['case-drop-throw', 'case-string-breaks', 'case-third-law', 'case-static-friction', 'case-monkey', 'case-push-through'].map(id => CASES.find(c => c.id === id)).filter((c): c is (typeof CASES)[number] => !!c))

const pasted = ref('')
/** The paste box: a share link opens its scene; anything else is a problem for Copilot. */
async function submitPaste() {
  const text = pasted.value.trim()
  if (!text) return
  if (isShareLink(text)) { if (await openShared(text)) pasted.value = ''; return }
  if (!settings.ai.copilot) { showToast(tl('Copilot 已在设置中关闭；可以在工作台的“题目 › 任务”里粘贴题目'), true); return }
  state.page = 'studio'
  setCopilotOpen(true)
  state.copilotDraft = text
  pasted.value = ''
}
function goLibrary(section: typeof state.librarySection) { state.librarySection = section; state.page = 'library' }
const sceneLine = computed(() => tl('{0} 个物体 · {1}', [state.scene.bodies.length, state.recording && !state.stale ? tl('结果已就绪') : tl('尚未运行')]))

interface Entry { icon: string; label: string; text: string; run: () => void }
const ROLES = computed((): Array<{ id: string; title: string; text: string; tone: string; icon: string; items: Entry[] }> => [
  { id: 'student', title: tl('我在学物理'), text: tl('按学段一步步学，做题时让引擎核对每一步。'), tone: '', icon: 'graduation', items: [
    { icon: 'graduation', label: tl('学习路径'), text: tl('初中、高中、大学，按顺序走'), run: () => goLibrary('path') },
    { icon: 'problem', label: tl('做题'), text: tl('{0} 道内置题目，答案由仿真核对', [PROBLEM_COUNT]), run: () => goLibrary('problems') },
    { icon: 'target', label: tl('易错概念'), text: tl('先猜结果，再看仿真怎么说'), run: () => goLibrary('cases') }
  ] },
  { id: 'teacher', title: tl('我在教物理'), text: tl('投影到大屏幕：先让全班预测，再一起看结果。'), tone: 'green', icon: 'classroom', items: [
    { icon: 'classroom', label: tl('课堂实验'), text: tl('10–15 分钟的成套流程与教师视图'), run: () => { state.page = 'classroom' } },
    { icon: 'tally', label: tl('先猜后看'), text: tl('举手计票，不需要学生设备'), run: () => { state.page = 'classroom' } },
    { icon: 'layers', label: tl('课程对照'), text: tl('按课标章节找到对应的资源'), run: () => goLibrary('curriculum') }
  ] },
  { id: 'research', title: tl('我要可复现的数值'), text: tl('精确事件求解、收敛性、参数扫描与复现包。'), tone: 'violet', icon: 'research', items: [
    { icon: 'converge', label: tl('收敛性研究'), text: tl('步长减半，看误差按几阶减小'), run: () => { state.page = 'studio'; shell.convergence = true } },
    { icon: 'sweep', label: tl('参数扫描'), text: tl('一个参数取一组值，批量计算'), run: () => { state.page = 'studio'; state.showSweep = true } },
    { icon: 'layers', label: tl('模型目录'), text: tl('{0} 个带独立参考值的模型族', [MODELS.length]), run: () => goLibrary('models') }
  ] }
])
</script>

<template>
  <div class="page-shell home">
    <div class="page-scroll">
      <div class="page-inner">
        <header class="hero">
          <AppLogo :size="phone ? 44 : 56" />
          <div class="hero-text">
            <h1 class="page-title"><Wordmark :size="phone ? 24 : 30" /><span class="ver mono">{{ ENGINE_VERSION.replace(/\.0$/, '') }}</span></h1>
            <p class="page-sub">{{ tl('二维物理仿真与教学引擎：数值只来自求解器，公式逐项对照，结果可以复现。') }}</p>
          </div>
        </header>

        <button type="button" class="search" data-ui="home-search" @click="state.showPalette = true">
          <Icon name="search" :size="18" /><span class="grow">{{ tl('搜索模板、题目、实验、公式、工具…') }}</span><kbd v-if="!phone">{{ MOD }}+K</kbd>
        </button>

        <div class="start">
          <button type="button" class="card hoverable go" data-ui="home-continue" @click="state.page = 'studio'">
            <span class="card-ico"><Icon name="studio" :size="18" /></span>
            <span class="go-text"><span class="card-title">{{ tl('继续：{0}', [state.fileName ?? state.scene.name]) }}</span><span class="card-text">{{ sceneLine }}</span></span>
            <Icon name="arrowRight" :size="16" class="arrow" />
          </button>
          <div class="quick">
            <button type="button" class="btn lg" @click="newScene()"><Icon name="file" />{{ tl('新建场景') }}</button>
            <button type="button" class="btn lg" @click="openScene()"><Icon name="open" />{{ tl('打开文件…') }}</button>
            <button type="button" class="btn lg" @click="state.showTemplates = true"><Icon name="template" />{{ tl('从模板开始') }}</button>
          </div>
        </div>

        <form class="paste card" @submit.prevent="submitPaste">
          <label class="card-title" for="home-paste"><span class="card-ico amber"><Icon name="wand" :size="17" /></span>{{ tl('粘贴一道题，或一个分享链接') }}</label>
          <textarea id="home-paste" v-model="pasted" class="field" rows="2" :placeholder="tl('例如：质量为 2 kg 的物块从倾角 30° 的斜面顶端由静止滑下，μ = 0.2，求到达底端的速度。')" @keydown.enter.exact.prevent="submitPaste" />
          <div class="paste-foot">
            <span class="tiny muted">{{ tl('题目交给 Copilot 读题并搭成场景，答案由引擎核对；分享链接直接打开，不经过任何服务器。') }}</span>
            <button type="submit" class="btn primary" :disabled="!pasted.trim()">{{ tl('开始') }}<Icon name="arrowRight" :size="14" /></button>
          </div>
        </form>

        <div class="roles">
          <section v-for="r in ROLES" :key="r.id" class="card role">
            <div class="card-title"><span class="card-ico" :class="r.tone"><Icon :name="r.icon" :size="17" /></span>{{ r.title }}</div>
            <p class="card-text">{{ r.text }}</p>
            <button v-for="i in r.items" :key="i.label" type="button" class="entry" @click="i.run()">
              <Icon :name="i.icon" :size="16" /><span class="entry-text"><b>{{ i.label }}</b><span class="tiny muted">{{ i.text }}</span></span><Icon name="arrowRight" :size="13" class="arrow" />
            </button>
          </section>
        </div>

        <h2 class="section-title"><Icon name="target" :size="17" />{{ tl('先猜后看') }}<button type="button" class="btn ghost small more" @click="goLibrary('cases')">{{ tl('全部 {0} 个', [CASES.length]) }}<Icon name="arrowRight" :size="13" /></button></h2>
        <div class="grid-cards wide">
          <button v-for="c in cases" :key="c.id" type="button" class="card" @click="openCase(c.id)">
            <span class="card-title">{{ T3(c.title) }}</span>
            <span class="card-text">{{ T3(c.belief) }}</span>
          </button>
        </div>

        <h2 class="section-title"><Icon name="template" :size="17" />{{ tl('常用模板') }}<button type="button" class="btn ghost small more" @click="goLibrary('templates')">{{ tl('全部 {0} 个', [TEMPLATES.length]) }}<Icon name="arrowRight" :size="13" /></button></h2>
        <div class="grid-cards">
          <button v-for="t in templates" :key="t.id" type="button" class="card tpl" @click="openTemplate(t.id)">
            <span class="card-title"><span class="card-ico"><Icon :name="GROUP_ICON[t.id] ?? 'template'" :size="17" /></span>{{ t.name }}</span>
            <span class="card-text">{{ t.description }}</span>
          </button>
        </div>

        <h2 class="section-title"><Icon name="flask" :size="17" />{{ tl('实验室') }}<button type="button" class="btn ghost small more" @click="state.page = 'lab'">{{ tl('全部 {0} 个', [LABS.length]) }}<Icon name="arrowRight" :size="13" /></button></h2>
        <div class="grid-cards">
          <button v-for="l in labs" :key="l.id" type="button" class="card tpl" @click="openLab(l.id)">
            <span class="card-title"><span class="card-ico green"><Icon :name="l.icon" :size="17" /></span>{{ l.title }}</span>
            <span class="card-text clamp">{{ l.summary }}</span>
          </button>
        </div>

        <footer class="foot small muted">
          <label class="check"><input type="checkbox" :checked="settings.ui.startPage === 'home'" @change="settings.ui.startPage = ($event.target as HTMLInputElement).checked ? 'home' : 'studio'" />{{ tl('启动时显示首页') }}</label>
          <span class="spacer" />
          <button type="button" class="btn ghost small" @click="state.showWelcome = true">{{ tl('欢迎与导览') }}</button>
          <button type="button" class="btn ghost small" @click="shell.shortcuts = true">{{ tl('快捷键一览') }}</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero { display: flex; align-items: center; gap: 16px; }
.hero-text { min-width: 0; }
.page-title { display: flex; align-items: baseline; gap: 10px; }
.ver { font-size: var(--type-small); font-weight: 500; color: var(--text-3); }
.search { margin-top: 22px; width: 100%; display: flex; align-items: center; gap: 10px; height: calc(48px * var(--zoom)); padding: 0 14px; border: 0; border-radius: 14px; background: var(--pane); box-shadow: var(--elev-1); color: var(--text-3); font: inherit; font-size: var(--type-body); cursor: text; text-align: left; transition: box-shadow var(--dur-hover) ease; }
.search:hover { box-shadow: var(--elev-2); color: var(--text-2); }
.search .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.start { margin-top: 12px; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
.go { flex-direction: row !important; align-items: center !important; gap: 12px; }
.go-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.go .card-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.arrow { color: var(--text-3); flex: 0 0 auto; }
.quick { display: flex; gap: 8px; align-items: stretch; }
.quick .btn { flex: 1 1 0; height: auto; min-height: calc(40px * var(--zoom)); justify-content: center; min-width: 0; white-space: normal; text-align: center; padding: 6px 10px; }
.paste { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.paste textarea { width: 100%; }
.paste-foot { display: flex; align-items: center; gap: 12px; }
.paste-foot .tiny { flex: 1; min-width: 0; }
.roles { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.role { display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; }
.role .card-text { margin-bottom: 6px; }
.entry { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: none; font: inherit; color: inherit; text-align: left; padding: 7px 8px; margin: 0 -8px; width: calc(100% + 16px); border-radius: 9px; cursor: pointer; transition: background var(--dur-hover) ease; }
.entry:hover { background: var(--hover); }
.entry:active { background: var(--fill); }
.entry-text { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.3; }
.entry-text b { font-weight: 600; font-size: var(--type-small); }
.tpl .card-text, .clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot { margin-top: 32px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
@media (max-width: 980px) { .roles { grid-template-columns: 1fr; } .start { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .quick { flex-wrap: wrap; } .quick .btn { flex: 1 1 30%; } .paste-foot { flex-direction: column; align-items: stretch; } }
</style>
