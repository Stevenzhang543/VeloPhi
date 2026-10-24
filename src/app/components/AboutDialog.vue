<script setup lang="ts">
import { state } from '../store'
import { ENGINE_VERSION } from '../../core/scene/types'
import Icon from './Icon.vue'
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="state.showAbout = false">
    <div class="dialog about">
      <div class="dialog-header">关于 Verity<span class="spacer" /><button class="btn icon ghost" @click="state.showAbout = false"><Icon name="close" /></button></div>
      <div class="dialog-body small">
        <p><b>Verity {{ ENGINE_VERSION }}</b>（暂名）— 面向物理专业学生与教师的力学仿真与教学引擎。</p>
        <h4>它如何保证结果可验证</h4>
        <ul>
          <li>所有数值只来自求解器：接触、摩擦、绳与碰撞在每个阶段按约束方程精确求解（库仑摩擦、牛顿恢复系数），渲染只读不算。</li>
          <li>状态切换（碰撞、开始滑动、共速、分离、绳松弛）被精确定位到约 10⁻¹² s，并在时间线上标出。</li>
          <li>公式只在适用条件成立时给出；代入值与仿真值逐项对照，并显示绝对误差与相对误差。近似公式（如小角度单摆）会标注“近似”或“近似失效”。</li>
          <li>能量账本：机械能 + 摩擦生热 + 碰撞损失 − 外力与电机做功，始终守恒到 10⁻⁸ 以内。</li>
          <li>同一场景每次计算逐位相同，结果指纹（SHA-256）可用于核对。</li>
        </ul>
        <h4>快捷键</h4>
        <ul class="keys">
          <li><kbd>空格</kbd> 播放 / 暂停　<kbd>←</kbd><kbd>→</kbd> 逐帧　<kbd>Home</kbd> 回到开始</li>
          <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销　<kbd>Ctrl</kbd>+<kbd>Y</kbd> 重做　<kbd>Delete</kbd> 删除所选　<kbd>Esc</kbd> 取消当前工具</li>
          <li><kbd>Ctrl</kbd>+<kbd>S</kbd> 保存　<kbd>Ctrl</kbd>+<kbd>O</kbd> 打开　<kbd>Ctrl</kbd>+<kbd>Enter</kbd> 重新计算</li>
          <li>滚轮缩放，中键或按住空格拖动平移</li>
        </ul>
        <h4>第三方组件</h4>
        <p class="tiny muted">Vue（MIT）、KaTeX（MIT）、uPlot（MIT）、Mediabunny（MPL-2.0，未修改）、Tauri（MIT/Apache-2.0）、Noto Sans SC 与 JetBrains Mono 字体（OFL-1.1）。详见安装目录中的 THIRD_PARTY_NOTICES。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about { width: min(640px, calc(100vw - 48px)); }
h4 { margin: 12px 0 4px; font-size: 13px; }
ul { margin: 0; padding-left: 18px; line-height: 1.6; }
.keys { list-style: none; padding-left: 0; }
kbd { font-family: var(--font-mono); font-size: 11px; background: var(--fill); border-radius: 4px; padding: 1px 5px; margin: 0 1px; }
</style>
