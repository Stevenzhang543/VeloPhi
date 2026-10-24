# Verity 网页版部署说明

网页包是纯静态文件，解压后放到任意 HTTP 服务器的一个目录即可，无需后端、数据库或网络连接（字体与公式渲染都已内置）。

- 本机试用：在解压目录运行 `python -m http.server 8080`，浏览器打开 `http://localhost:8080/`。
- 学校内网：放到任意 Web 服务器（IIS、Nginx、Apache）的子目录，路径都是相对的。
- 不能直接双击 `index.html`（浏览器禁止从 file:// 加载脚本模块）。
- `.js` 文件须以 JavaScript 的 MIME 类型（`text/javascript` 或 `application/javascript`）提供，这是脚本模块的要求；常见服务器默认如此。

## 后台计算线程（26.49 起）

求解在 Web Worker 中进行，脚本是网页包中的 `assets/sim.worker-<哈希>.js`，由页面从同一目录按相对路径以模块方式加载，不需要任何额外配置：

- 不使用 SharedArrayBuffer，所以**不需要** COOP / COEP（跨源隔离）响应头。
- 如果服务器为页面设置了 Content-Security-Policy，须允许从本站加载 Worker（`worker-src 'self'`，或不写 `worker-src` 而 `script-src` 含 `'self'`）。
- Worker 被禁止或加载失败时，程序自动改为在页面主线程中分片计算，结果完全相同，只是长时间计算时界面可能不够流畅。“设置 › 仿真 › 在后台线程计算”也可以手动关闭 Worker。

桌面版（Tauri）的内容安全策略已允许 Worker，无需处理。

## 浏览器要求

已在 Chromium 141（与 Edge/Chrome 同内核）上验证，包括通过 HTTP 打开网页包时计算线程的加载；Windows WebView2 的检查在发布时进行。其他浏览器未逐一测试。视频导出需要浏览器提供 WebCodecs 的 H.264 或 VP9 编码器。

## 数据

数据不上传：场景保存在用户选择的位置（浏览器下载或“另存为”对话框），偏好设置保存在浏览器本地存储中。试用日志默认关闭，开启后也只保存在本地存储中，需手动导出。
