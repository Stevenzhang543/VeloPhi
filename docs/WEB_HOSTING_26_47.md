# Nova_A 26.47 / 26.47.0 Web hosting

Extract the complete Web ZIP into your website directory. Serve index.html over HTTP/HTTPS with WebAssembly MIME application/wasm and real 404 responses; no application backend or SPA rewrite is needed for local authoring. Subdirectory hosting is supported. External multiplayer/cloud services still require their own configured servers.

Use HTTPS for home-screen installation and secure browser APIs. The manifest has relative scope/start_url and local icons. Safari on iPhone: Share → Add to Home Screen. This is a Web app, not an iOS binary. Browser installation UI varies by platform; there is no promise of automatic installation.

## Updates and offline behavior
This release is online-only: no service worker caches an application shell. Offline reload is unsupported. Loaded tabs may keep working with memory-resident resources, but lazy panels, import/build dependencies and reload may require the network. Save/download project backups before closing or updating.

Deploy a complete build atomically. Revalidate HTML, browser bootstrap, manifest and player-manifest.json (Cache-Control: no-cache). Hashed assets may be immutable; retain the previous asset files while old tabs remain open. Never mix an old player manifest with a new asset directory. Reload after saving to adopt an update. Do not overwrite a live directory file by file.

## Mobile and browser boundaries
Phones edit in landscape with an accessible portrait prompt. Tablets (iPad, iPad mini, Android tablets) edit in both orientations; in portrait and split view the hierarchy and inspector open over the canvas from the buttons at its top edge, and the title bar folds its menus into one Menu button. The editor uses the visible viewport height (`dvh`), safe areas and its own UI scale: Safari does not zoom into focused fields, and the page itself never scrolls. The mounted editor preserves drafts when rotated. Software keyboard height changes must not trigger the portrait prompt. Design canvas uses one-finger edit gestures and two-finger pan/zoom. Browser file import/download are the fallback when directory access is unavailable.

Build → Web → Download Web ZIP exports a complete game. Keep its player, game.nova-pak and integrity metadata together and deploy them to a separate directory. Test the downloaded game, not just the editor preview. Since 26.43 the exported game starts in the independent Player (no editor code). Games fill the visible screen, offer a full-screen button in browsers and, on touch screens, show touch controls generated from the game's input actions when the project defines none. If a game cannot start in the independent Player, the page opens the compatibility Player once (`?legacyPlayer=1` forces it; `?legacyPlayer=0` disables the fallback for testing). Since 26.45 the compatibility Player is a page of its own, `player-legacy.html`, next to the game's `index.html`: deploy it with the rest of the ZIP and give it the same no-cache header as `index.html`. Players' own key bindings (remap buttons, `input_rebind`) are stored in the browser's local storage for the page's origin; clearing site data puts the game's bindings back.

Capabilities, not a browser name, control startup. Legacy browsers receive a readable unsupported notice before application module execution. Internet Explorer is unsupported. Consult the actual 26.47 browser report for tested engine/version; unavailable Firefox/WebKit and physical iPhone/iPad/Android remain unqualified.

## Deutsch
Vollständiges Web-ZIP in ein Server-Unterverzeichnis entpacken. HTTPS für Installation; Safari: Teilen → Zum Home-Bildschirm. Kein Nova-Backend für lokale Projekte nötig. Nur online, kein Offline-Neuladen. Vor Updates speichern; vollständigen Build atomar bereitstellen, HTML/Manifest neu validieren und alte Hash-Dateien für offene Tabs behalten. Telefone bearbeiten im Querformat, Tablets in beiden Ausrichtungen. Web-Spiel-ZIP separat vollständig bereitstellen; Spiele starten seit 26.43 im eigenständigen Player (Vollbild, Touch-Steuerung), mit einmaligem Rückfall auf den Kompatibilitäts-Player (`?legacyPlayer=1`); dieser ist seit 26.45 die eigene Seite `player-legacy.html` neben `index.html` und wird mit dem ZIP bereitgestellt (gleicher No-Cache-Header). Eigene Tastenbelegungen der Spieler liegen im lokalen Speicher des Browsers. Nicht getestete Browser und echte Geräte bleiben ungeprüft.

## 中文
完整解压 Web ZIP 到网站目录，支持子目录；普通本地项目不需要 Nova 后端。使用 HTTPS 安装主屏幕网页；iPhone Safari：分享 → 添加到主屏幕。仅在线，不支持断网重载。更新前保存，整包原子部署，HTML/清单重新验证缓存，保留旧哈希资源供旧标签使用。手机横屏编辑，平板横竖屏都可编辑。下载的游戏 ZIP 须完整部署到独立目录；26.43 起游戏在独立播放器中启动（全屏按钮、触屏按键），无法启动时自动改用兼容播放器重新加载一次（`?legacyPlayer=1` 可强制使用）。26.45 起兼容播放器是 `index.html` 旁边单独的页面 `player-legacy.html`，请随 ZIP 一起部署并使用相同的不缓存响应头。玩家自定义的按键保存在浏览器本地存储中。未实测浏览器和真实设备保持待验证。

## Rhythm games (26.46)

Songs of Rhythm Chart 2D are decoded whole in the browser (at most 64 MB per file, 256 MB decoded) and played on the Web Audio clock; they travel inside game.nova-pak like every other asset, so nothing extra is deployed. Browsers start sound only after a user gesture: a game that plays a chart on start shows "Click or press a key to start", and that first press is not counted as a hit. Each player's audio calibration is stored in the browser's local storage for the page's origin (key `nova.rhythm.calibrationMs`); moving the game to another origin, or clearing site data, resets it to 0. Bluetooth headphones often add 100–300 ms of delay; ask players to calibrate once (the starter games and the chart editor have Calibrate…). A host CSP must allow `data:` and `blob:` in `connect-src` and `media-src` (see below) or songs cannot be decoded.

Deutsch: Songs von Rhythmus-Chart 2D werden im Browser vollständig dekodiert (höchstens 64 MB pro Datei, 256 MB dekodiert) und auf der Web-Audio-Uhr abgespielt; sie liegen wie alle Assets in game.nova-pak. Browser starten Ton erst nach einer Nutzeraktion: Ein Spiel, das ein Chart beim Start abspielt, zeigt „Click or press a key to start“; dieser erste Druck zählt nicht als Treffer. Die Audio-Kalibrierung jedes Spielers liegt im lokalen Speicher des Browsers für den Ursprung der Seite (`nova.rhythm.calibrationMs`). Bluetooth-Kopfhörer verzögern oft um 100–300 ms; Spieler einmal kalibrieren lassen. Eine Host-CSP muss `data:` und `blob:` in `connect-src` und `media-src` erlauben.

中文：二维节奏谱面的歌曲在浏览器中整段解码（单个文件最大 64 MB，解码后最大 256 MB），并在 Web Audio 时钟上播放；歌曲和其他资源一样打包在 game.nova-pak 中，无需额外部署。浏览器只有在用户操作之后才允许发声：开场即播放谱面的游戏会显示“Click or press a key to start”，这第一下按键不计入判定。每位玩家的音频校准值保存在该页面来源的浏览器本地存储中（键名 `nova.rhythm.calibrationMs`），换域名或清除站点数据后会恢复为 0。蓝牙耳机常带来 100–300 毫秒延迟，请让玩家先校准一次。若托管方设置了 CSP，必须在 `connect-src` 与 `media-src` 中放行 `data:` 和 `blob:`，否则歌曲无法解码。

## Rhythm games: note types, timeline and picture offset (26.47)

Nothing new is deployed: chart version 2 (note types, tracks, triggers) is part of the chart asset, and prefab notes are ordinary prefabs inside game.nova-pak. Besides the audio calibration, each player's picture offset is stored in the browser's local storage for the page's origin (key `nova.rhythm.visualOffsetMs`); another origin or cleared site data resets it to 0. Post-processing tracks need post-processing enabled in the project's rendering settings.

Deutsch: Es wird nichts zusätzlich bereitgestellt: Chart-Version 2 (Notentypen, Spuren, Auslöser) steckt im Chart-Asset, Prefab-Noten sind gewöhnliche Prefabs in game.nova-pak. Neben der Audio-Kalibrierung liegt der Bildversatz jedes Spielers im lokalen Speicher des Browsers für den Ursprung der Seite (`nova.rhythm.visualOffsetMs`). Nachbearbeitungsspuren brauchen eingeschaltete Nachbearbeitung in den Rendering-Einstellungen des Projekts.

中文：无需额外部署：谱面版本 2（音符类型、轨道、触发器）包含在谱面资源中，预制体音符就是 game.nova-pak 里的普通预制体。除音频校准外，每位玩家的画面延迟也保存在该页面来源的浏览器本地存储中（键名 `nova.rhythm.visualOffsetMs`），换域名或清除站点数据后恢复为 0。后期效果轨道需要在项目的渲染设置中打开后期效果。

## Asset updates / 资源更新

Reimported assets retain UUID identity; save the project and rebuild the exported game after replacement. Deploy the complete new game package, never only a changed image/audio file beside an older package. Test imported fonts and audio on target devices. Resource cache checks do not qualify external hosting services.

重导入后保存项目并重新构建游戏，部署完整新资源包，不要只替换旧包旁边的单个图片或音频。字体与音频的目标设备兼容仍需实机检查。

## Optional services and platform delivery

26.47 / 26.47.0 does not add a mandatory backend. A disabled networking configuration must continue to support local authoring and games. Explicitly enabled multiplayer/authentication/relay adapters require their own compatible endpoints, HTTPS/WSS and server Origin/CORS policy where applicable. Static hosting cannot supply a native UDP listener. Do not embed service secrets in public Web files. See platform prerequisites and recipes and network boundaries.

The targeted static-host check loads both root and nested editor URLs, fetches actual relative manifest/icons, checks the declared online-only policy and absence of service-worker registration, then downloads and starts an actual Web game. It does not claim browser home-screen installation or physical phone qualification. The 26.43 Web Player check (`scripts/verify-2643-web-player.mjs`) runs the exported Platformer in the built Player at desktop and iPad sizes with keyboard and touch.

Deutsch: Kein verpflichtendes Backend. Nur ausdrücklich aktivierte Netzwerkdienste benötigen eigene kompatible Endpunkte, HTTPS/WSS und gegebenenfalls Origin-/CORS-Freigaben. Ein statischer Server bietet keinen nativen UDP-Listener. Die PWA bleibt online; eine Manifest-Prüfung ist keine echte Geräteinstallation.

中文：没有强制后端。仅明确启用的联网服务需要兼容端点、HTTPS/WSS 及适用的 Origin/CORS 配置；静态网站不是原生 UDP 监听器。此 PWA 仍仅在线，清单检查不等于真实设备安装验收。

## Supplied branding and theme boundaries

The editor and bundled manual choose the supplied light or dark PNG mark when their own color theme changes. Their favicons follow that theme. PWA/home-screen and Windows icons use the fixed dark artwork derivative; operating-system icon backgrounds are outside the editor theme. The downloaded player favicon is bundled from the supplied dark mark and resolves relative to its exported package. Deploy all branding files with the complete Web build; do not copy only a new logo beside old HTML/assets. Root/subdirectory HTTP checks do not certify physical home-screen installation.

## Content security policy (26.42, unchanged in 26.47)

The Web build sends no Content-Security-Policy of its own. If your host adds one, allow what the editor and exported games need: `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self' data: blob:` (plus any service endpoints you enable), `media-src 'self' data: blob:` and `img-src 'self' data: blob:`. Project and template sounds and images are stored as `data:` URLs; without `data:` in `connect-src` and `media-src` audio fails with "Failed to fetch" (the 26.42 desktop fix for the same problem is in `src-tauri/tauri.conf.json`).

Deutsch: Der Web-Build setzt keine eigene CSP. Wenn der Host eine setzt, `data:` und `blob:` für `connect-src`, `media-src` und `img-src` sowie `'wasm-unsafe-eval'` für Skripte erlauben, sonst schlägt Projekt-Audio mit „Failed to fetch“ fehl.

中文：Web 构建本身不设置 CSP。若托管方添加 CSP，请为 `connect-src`、`media-src`、`img-src` 放行 `data:` 与 `blob:`，并为脚本放行 `'wasm-unsafe-eval'`；否则项目内嵌音频会报 “Failed to fetch”。
