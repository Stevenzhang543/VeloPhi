<script setup lang="ts">
/**
 * About Verity: version, what makes results verifiable, shortcuts (optional) and third-party licenses.
 * Shared by the about dialog and the settings page.
 */
import AppLogo from './AppLogo.vue'
import { tl } from '../../i18n'
import { ENGINE_VERSION } from '../../core/scene/types'
import { SHORTCUTS } from '../shortcuts'

withDefaults(defineProps<{ shortcuts?: boolean }>(), { shortcuts: true })

const LICENSES: Array<{ name: string; license: string; use: string }> = [
  { name: 'Vue', license: 'MIT', use: tl('界面框架') },
  { name: 'KaTeX', license: 'MIT', use: tl('公式排版') },
  { name: 'uPlot', license: 'MIT', use: tl('曲线') },
  { name: 'Mediabunny', license: tl('MPL-2.0（未修改）'), use: tl('视频编码') },
  { name: 'Tauri', license: 'MIT / Apache-2.0', use: tl('桌面外壳') },
  { name: 'Rust std, serde, serde_json', license: 'MIT / Apache-2.0', use: tl('Rust 计算引擎（WebAssembly）') },
  { name: 'Noto Sans SC', license: 'OFL-1.1', use: tl('中文字体') },
  { name: 'JetBrains Mono', license: 'OFL-1.1', use: tl('等宽数字字体') }
]
</script>

<template>
  <div class="about-content">
    <div class="hero">
      <AppLogo :size="44" />
      <div>
        <div class="title">Verity <span class="mono ver">{{ ENGINE_VERSION }}</span></div>
        <div class="small muted">{{ tl('（暂名）面向物理专业学生与教师的力学仿真与教学引擎') }}</div>
      </div>
    </div>
    <h4>{{ tl('它如何保证结果可验证') }}</h4>
    <ul>
      <li>{{ tl('所有数值只来自求解器：接触、摩擦、绳与碰撞在每个阶段按约束方程精确求解（库仑摩擦、牛顿恢复系数），渲染只读不算。') }}</li>
      <li>{{ tl('状态切换（碰撞、开始滑动、共速、分离、绳松弛）被精确定位到约 10⁻¹² s，并在时间线上标出。') }}</li>
      <li>{{ tl('公式只在适用条件成立时给出；代入值与仿真值逐项对照，并显示绝对误差与相对误差。近似公式（如小角度单摆）会标注“近似”或“近似失效”。') }}</li>
      <li>{{ tl('能量账本：机械能 + 摩擦生热 + 碰撞损失 − 外力与电机做功，始终守恒到 10⁻⁸ 以内。') }}</li>
      <li>{{ tl('同一场景每次计算逐位相同，结果指纹（SHA-256）可用于核对。内部一律使用国际单位，单位只在显示时换算。') }}</li>
    </ul>
    <template v-if="shortcuts">
      <h4>{{ tl('快捷键') }}</h4>
      <div class="keys">
        <template v-for="g in SHORTCUTS" :key="g.title">
          <div v-for="s in g.items" :key="s.text" class="key-row small">
            <span class="ktext">{{ s.text }}</span>
            <span class="combos"><template v-for="(combo, ci) in s.keys" :key="ci"><span v-if="ci" class="muted or">{{ tl('或') }}</span><template v-for="(k, ki) in combo" :key="k"><span v-if="ki" class="plus">+</span><kbd>{{ k }}</kbd></template></template></span>
          </div>
        </template>
      </div>
    </template>
    <h4>{{ tl('第三方组件') }}</h4>
    <div class="licenses small">
      <div v-for="l in LICENSES" :key="l.name" class="lic"><b>{{ l.name }}</b><span class="muted">{{ l.use }}</span><span class="mono tiny">{{ l.license }}</span></div>
    </div>
    <p class="tiny muted">{{ tl('均未修改，按各自许可证使用；完整清单与许可证全文见安装目录中的 THIRD_PARTY_NOTICES。界面图标为 Verity 自绘，未使用任何第三方或专有图标、字体。') }}</p>
  </div>
</template>

<style scoped>
.hero { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.title { font-size: calc(20px * var(--zoom)); font-weight: 700; letter-spacing: -0.01em; }
.ver { font-size: var(--type-small); font-weight: 500; color: var(--text-3); margin-left: 4px; }
h4 { margin: 14px 0 6px; font-size: var(--type-body); }
ul { margin: 0; padding-left: 18px; line-height: 1.6; font-size: var(--type-small); }
.about-content { min-width: 0; }
.keys { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0 24px; }
.key-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 3px 0; border-bottom: 1px solid var(--separator); min-width: 0; }
.ktext { min-width: 0; }
.combos { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 2px; flex: 0 1 auto; }
.plus { color: var(--text-3); font-size: var(--type-tiny); }
.or { margin: 0 4px; font-size: var(--type-tiny); }
.licenses { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 4px 16px; }
.lic { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: baseline; padding: 3px 0; border-bottom: 1px solid var(--separator); }
p { margin: 8px 0 0; line-height: 1.5; }
</style>
