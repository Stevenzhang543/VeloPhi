/**
 * Interface texts of 26.65 (D298): the update of the Linux packages (app/update.ts, UpdateNotice.vue) — the deb and
 * the rpm go to the system's package tool, which asks for the administrator's authorisation; when it does not install
 * them, the notice shows the command to type.
 * One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2665_LINUX: Record<string, readonly [string, string]> = {
  '已下载并通过校验。安装需要系统管理员授权，装好后 VeloΦ 会自动重新打开。': ['Downloaded and verified. Installing needs the authorisation of an administrator; VeloΦ then opens again by itself.', 'Heruntergeladen und geprüft. Die Installation erfordert die Autorisierung durch einen Administrator; danach öffnet sich VeloΦ von selbst wieder.'],
  '正在等待系统授权并安装…': ['Waiting for authorisation and installing…', 'Warten auf Autorisierung und Installation …'],
  '需要手动安装': ['Install by hand', 'Manuell installieren'],
  '系统授权被取消，没有安装。': ['The authorisation was cancelled; nothing was installed.', 'Die Autorisierung wurde abgebrochen; es wurde nichts installiert.'],
  '无法请求系统授权（没有 pkexec 或授权代理）。': ['The authorisation could not be requested (no pkexec or authentication agent).', 'Die Autorisierung konnte nicht angefordert werden (kein pkexec oder Authentifizierungsagent).'],
  '没有找到系统的软件包工具。': ['No package tool of the system was found.', 'Es wurde kein Paketwerkzeug des Systems gefunden.'],
  '系统的软件包工具报告了错误（退出码 {0}）。': ['The package tool of the system reported an error (exit code {0}).', 'Das Paketwerkzeug des Systems hat einen Fehler gemeldet (Exit-Code {0}).'],
  '系统的软件包工具报告了错误。': ['The package tool of the system reported an error.', 'Das Paketwerkzeug des Systems hat einen Fehler gemeldet.'],
  '新版本已保存为 {0}。在终端里运行下面的命令即可安装：': ['The new version was saved as {0}. To install it, run this command in a terminal:', 'Die neue Version wurde als {0} gespeichert. Zur Installation diesen Befehl in einem Terminal ausführen:'],
  '复制命令': ['Copy command', 'Befehl kopieren'],
  '显示文件': ['Show file', 'Datei zeigen']
}
