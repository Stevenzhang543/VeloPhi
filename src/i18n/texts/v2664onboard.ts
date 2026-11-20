/**
 * Interface texts of 26.64: the walkthrough, "what is new" (D248–D251) and the update check.
 * One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2664_ONBOARD: Record<string, readonly [string, string]> = {
  // ---- The update check of the desktop and Android apps (app/update.ts, UpdateNotice.vue, UpdateSettings.vue) ----
  '软件更新': ['Software update', 'Software-Update'],
  '正在检查更新…': ['Checking for updates…', 'Suche nach Updates …'],
  '已是最新版本（{0}）': ['You have the latest version ({0})', 'Die neueste Version ({0}) ist installiert'],
  '检查更新失败': ['The update check failed', 'Die Update-Prüfung ist fehlgeschlagen'],
  '在浏览器中查看': ['View in browser', 'Im Browser ansehen'],
  '新版本 {0}': ['New version {0}', 'Neue Version {0}'],
  '当前 {0}': ['Installed: {0}', 'Installiert: {0}'],
  '更新': ['Update', 'Aktualisieren'],
  '稍后': ['Later', 'Später'],
  '跳过此版': ['Skip version', 'Überspringen'],
  '这个版本不再提醒': ['Do not remind me of this version again', 'An diese Version nicht mehr erinnern'],
  '正在下载 {0}': ['Downloading {0}', '{0} wird heruntergeladen'],
  '正在校验…': ['Verifying…', 'Wird geprüft …'],
  '安装': ['Install', 'Installieren'],
  '启动新版': ['Start now', 'Jetzt starten'],
  '正在启动…': ['Starting…', 'Wird gestartet …'],
  '更新没有完成': ['The update did not complete', 'Das Update wurde nicht abgeschlossen'],
  '已下载并通过校验。安装时 VeloΦ 会关闭，装好后自动重新打开。': ['Downloaded and verified. VeloΦ closes for the installation and opens again afterwards.', 'Heruntergeladen und geprüft. VeloΦ wird für die Installation geschlossen und danach wieder geöffnet.'],
  '已下载并通过校验。请在系统的安装提示中确认。': ['Downloaded and verified. Confirm the installation in the prompt of the system.', 'Heruntergeladen und geprüft. Bestätigen Sie die Installation in der Abfrage des Systems.'],
  '新版本已保存为 {0}。启动它之后，旧文件 {1} 可以删除。': ['The new version was saved as {0}. Once it is running, the old file {1} can be deleted.', 'Die neue Version wurde als {0} gespeichert. Sobald sie läuft, kann die alte Datei {1} gelöscht werden.'],
  '无法连接 GitHub，请检查网络后重试。': ['GitHub could not be reached. Check the network and try again.', 'GitHub ist nicht erreichbar. Bitte die Netzwerkverbindung prüfen und erneut versuchen.'],
  '这个网络地址的查询次数已用完，请一小时后再试。': ['This network address has used up its queries for now. Try again in an hour.', 'Für diese Netzwerkadresse sind vorerst keine Abfragen mehr möglich. Bitte in einer Stunde erneut versuchen.'],
  '无法识别 GitHub 返回的版本信息。': ['The version information from GitHub could not be read.', 'Die Versionsangaben von GitHub konnten nicht gelesen werden.'],
  '这个版本没有可以自动安装的文件，请在浏览器中下载。': ['This version has no file that can be installed automatically. Please download it in the browser.', 'Diese Version enthält keine Datei, die automatisch installiert werden kann. Bitte im Browser herunterladen.'],
  '下载的文件没有通过校验，已删除。': ['The downloaded file failed verification and was deleted.', 'Die heruntergeladene Datei hat die Prüfung nicht bestanden und wurde gelöscht.'],
  '无法保存下载的文件。': ['The downloaded file could not be saved.', 'Die heruntergeladene Datei konnte nicht gespeichert werden.'],
  '版本信息已过期，请重新检查。': ['The version information is out of date. Please check again.', 'Die Versionsangaben sind veraltet. Bitte erneut prüfen.'],
  '无法打开系统的安装程序，已在浏览器中打开发布页。': ['The installer of the system could not be opened. The release page was opened in the browser instead.', 'Das Installationsprogramm des Systems ließ sich nicht öffnen. Stattdessen wurde die Seite der Version im Browser geöffnet.'],
  '遇到了没有预料到的问题。': ['An unexpected problem occurred.', 'Ein unerwartetes Problem ist aufgetreten.'],
  '启动时检查更新': ['Check for updates at start', 'Beim Start nach Updates suchen'],
  '每次启动后向 api.github.com 查询 VeloΦ 最新发布的版本：一次 HTTPS 请求，只带程序的版本号（VeloPhi/{0}），不带账号、设备或使用信息；GitHub 像对任何访问一样能看到网络地址。下载更新时访问 github.com 和它的下载服务器。': [
    'After each start, asks api.github.com for the latest published version of VeloΦ: one HTTPS request that carries only the version number of the program (VeloPhi/{0}) — no account, device or usage data; GitHub sees the network address, as with any visit. Downloading an update contacts github.com and its download servers.',
    'Fragt nach jedem Start bei api.github.com die neueste veröffentlichte Version von VeloΦ ab: eine HTTPS-Anfrage, die nur die Versionsnummer des Programms enthält (VeloPhi/{0}) – keine Konto-, Geräte- oder Nutzungsdaten; GitHub sieht wie bei jedem Aufruf die Netzwerkadresse. Beim Herunterladen eines Updates werden github.com und dessen Download-Server kontaktiert.'
  ],
  '当前版本 {0}': ['Current version {0}', 'Aktuelle Version {0}'],
  '尚未检查': ['Not checked yet', 'Noch nicht geprüft'],
  '上次检查：{0}，最新版本 {1}': ['Last check: {0}; latest version {1}', 'Letzte Prüfung: {0}; neueste Version {1}'],
  '立即检查': ['Check now', 'Jetzt prüfen']
}
