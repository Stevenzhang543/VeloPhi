/** 26.43 积木文案：每个积木一句话，{字段} 处显示为输入框；英、德、中三种语言。 */
import type { BlockCategory } from './blockScript'

export type BlockLocale = 'en' | 'de' | 'zh'
interface BlockCopy {
  categories: Record<BlockCategory, string>
  events: Record<string, string>
  statements: Record<string, string>
  conditions: Record<string, string>
  ui: Record<string, string>
  problems: Record<string, string>
  /** 26.44: names of the Blocks easings. */
  easings: Record<string, string>
}

const en: BlockCopy = {
  problems: { unknownVariable: 'unknown variable “{name}”', textPlaceholder: '{{name}} is not a variable here, so it is shown as text', needsContact: 'this only works inside a “touches” or “enters” event', needsFrame: 'this block needs an “every frame”, “every physics step” or key event', chooseSound: 'choose a sound', chooseVideo: 'choose a video', choosePrefab: 'choose a prefab', chooseScene: 'choose a scene', chooseObject: 'choose an object', chooseVariable: 'choose a variable', chooseFunction: 'choose a function name', functionName: 'choose a function name (letters, digits and _; not an event name)', functionTwice: 'function “{name}” is defined twice', badParameter: '“{name}” is not a valid parameter name', afterWait: 'after “wait”, this block can no longer use the event’s data' },
  categories: { events: 'Events', motion: 'Motion', looks: 'Looks', sound: 'Sound & video', control: 'Control', variables: 'Variables', game: 'Game', messages: 'Messages' },
  events: {
    start: 'When the game starts', update: 'Every frame', physics: 'Every physics step', pressed: 'When {action} is pressed', released: 'When {action} is released', held: 'While {action} is held',
    touch: 'When this touches {tag}', enter: 'When something enters this area {tag}', leave: 'When something leaves this area {tag}', signal: 'When message {name} arrives', timer: 'When timer {name} finishes', destroyed: 'When this is destroyed', function: 'Function {name} with {params}'
  },
  statements: {
    platformer: 'Move like a platformer: speed {speed} jump {jump} gravity {gravity} · keys {move} {jumpAction}', topdown: 'Move in 4 directions with {move} at speed {speed}',
    setVelocity: 'Set velocity to x {x} y {y}', changeVelocity: 'Change velocity by x {x} y {y}', impulse: 'Push by x {x} y {y}', goTo: 'Go to x {x} y {y}', moveBy: 'Move by x {x} y {y}', turnBy: 'Turn by {degrees}°', pointAt: 'Point at {degrees}°', setSize: 'Set size to x {x} y {y}', glideTo: 'Glide to x {x} y {y} in {seconds} s · {easing}', glideBy: 'Glide by x {x} y {y} in {seconds} s · {easing}', spinBy: 'Spin by {degrees}° in {seconds} s · {easing}', dropThrough: 'Drop through the platform below',
    playAnimation: 'Play animation {state}', blendAnimation: 'Blend to animation {state} in {seconds} s', fadeTo: 'Fade to {opacity} % in {seconds} s', growTo: 'Grow to size {scale} in {seconds} s · {easing}', setText: 'Set my text to {text}', setTextOn: 'Set text of {object} to {text}', show: 'Show {object}', hide: 'Hide {object}',
    playSound: 'Play sound {asset} at volume {volume}', playMusic: 'Play music {asset} fading in {fade} s', jointServo: 'Turn my joint to {target}', postPulse: 'Flash {effect} by {amount} for {seconds} s', explodeHere: 'Explode here · radius {radius} · push {impulse}', stopMusic: 'Stop music fading out {fade} s', busVolume: 'Set {bus} volume to {volume}', playVideo: 'Play video {asset} · skippable {skippable}', rhythmPlay: 'Play the rhythm chart', rhythmPause: 'Pause the rhythm chart', rhythmResume: 'Resume the rhythm chart', rhythmRestart: 'Restart the rhythm chart', rhythmAutoplay: 'Rhythm autoplay {enabled}', rhythmSpeed: 'Set note speed to {speed}', rhythmJudgeMyNote: 'Judge my note as {judgement}',
    if: 'If', repeat: 'Repeat {times} times', wait: 'Wait {seconds} s, then', startTimer: 'Start timer {name} for {seconds} s · repeat {repeat}', stop: 'Stop here',
    setVariable: 'Set {variable} to {value}', changeVariable: 'Change {variable} by {value}', addScore: 'Add {value} to score', saveValue: 'Save {key} = {value}', log: 'Log {text}',
    spawnHere: 'Create {prefab} here', spawnAt: 'Create {prefab} at x {x} y {y}', destroySelf: 'Destroy this', destroyOther: 'Destroy the other object', loadScene: 'Go to scene {scene}', reloadScene: 'Restart scene', pauseGame: 'Pause game {paused}', checkpoint: 'Save checkpoint {name}', restoreCheckpoint: 'Return to checkpoint {name}',
    emitSignal: 'Send message {name}', callGlobal: 'Call {global} . {function} with {args}', callGroup: 'Call {function} on group {group} with {args}', callOther: 'Call {function} on the other object with {args}', run: 'Run {function} with {args}'
  },
  conditions: { held: '{action} is held', pressed: '{action} was just pressed', onFloor: 'on the floor', onWall: 'touching a wall', onOneWay: 'standing on a one-way platform', animationIs: 'animation is {state}', compare: '{a} {op} {b}', otherHasTag: 'the other object has tag {tag}', chance: 'chance {percent} %', rhythmState: 'rhythm chart is {state}', rhythmCombo: 'rhythm combo {op} {value}', expression: 'code {code}' },
  easings: { linear: 'steady', sine_in_out: 'smooth', quad_in: 'speed up', quad_out: 'slow down', back_out: 'overshoot', bounce_out: 'bounce', elastic_out: 'spring' },
  ui: {
    breakpoint: 'Breakpoint', addBreakpoint: 'Stop here (breakpoint)', removeBreakpoint: 'Remove breakpoint', pausedHere: 'Paused here', title: 'Blocks', newScript: 'New blocks script', attach: 'Attach to selected object', attached: 'Attached', save: 'Save', saved: 'Saved', unsaved: 'Unsaved changes', openCode: 'Open as code', convert: 'Convert to code', noScript: 'Choose or create a blocks script', variables: 'Variables', addVariable: 'Add variable', name: 'Name', initial: 'Start value', addEvent: 'Add event', toolbox: 'Blocks', search: 'Search blocks', then: 'then', else: 'else', addCondition: 'Add condition', all: 'all', any: 'any', not: 'not', remove: 'Remove', duplicate: 'Duplicate', moveUp: 'Move up', moveDown: 'Move down', disable: 'Disable', enable: 'Enable', collapse: 'Collapse', expand: 'Expand', insertHere: 'Insert here', empty: 'Click a block on the left to add it here', problems: 'Problems', ready: 'Ready', codeEdited: 'This script was changed as code. Saving the blocks replaces those changes.', keepCode: 'Keep code (leave Blocks)', useBlocks: 'Use the blocks version', notBlocks: 'This script is written as code. Blocks can only open scripts created in Blocks.', convertConfirm: 'Convert this script to plain code? It can no longer be edited as blocks.', variableHint: 'Use variables in text as {name}. Numbers, true/false or "text".', hint: 'Pick an event, then click blocks to stack them. Drag the handle to reorder. Values can be numbers, variables or short expressions such as score * 2.', none: 'none', self: 'this object', chooseAsset: 'choose…', where: 'Add blocks to', choose: 'choose…', code: 'Generated code', touchAny: 'anything', managedByBlocks: 'This script is made with Blocks. Code changes here are replaced when the blocks are saved; open it in Blocks to edit, or convert it to code there.'
  }
}

const de: BlockCopy = {
  problems: { unknownVariable: 'unbekannte Variable „{name}“', textPlaceholder: '{{name}} ist hier keine Variable und wird als Text gezeigt', needsContact: 'funktioniert nur in einem „berührt“- oder „betritt“-Ereignis', needsFrame: 'dieser Block braucht „in jedem Bild“, „in jedem Physikschritt“ oder ein Tastenereignis', chooseSound: 'Ton wählen', chooseVideo: 'Video wählen', choosePrefab: 'Prefab wählen', chooseScene: 'Szene wählen', chooseObject: 'Objekt wählen', chooseVariable: 'Variable wählen', chooseFunction: 'Funktionsnamen wählen', functionName: 'Funktionsnamen wählen (Buchstaben, Ziffern und _; kein Ereignisname)', functionTwice: 'Funktion „{name}“ ist doppelt definiert', badParameter: '„{name}“ ist kein gültiger Parametername', afterWait: 'nach „Warte“ kann dieser Block die Ereignisdaten nicht mehr verwenden' },
  categories: { events: 'Ereignisse', motion: 'Bewegung', looks: 'Aussehen', sound: 'Ton & Video', control: 'Steuerung', variables: 'Variablen', game: 'Spiel', messages: 'Nachrichten' },
  events: {
    start: 'Wenn das Spiel startet', update: 'In jedem Bild', physics: 'In jedem Physikschritt', pressed: 'Wenn {action} gedrückt wird', released: 'Wenn {action} losgelassen wird', held: 'Solange {action} gehalten wird',
    touch: 'Wenn dies {tag} berührt', enter: 'Wenn etwas diesen Bereich betritt {tag}', leave: 'Wenn etwas diesen Bereich verlässt {tag}', signal: 'Wenn Nachricht {name} ankommt', timer: 'Wenn Timer {name} abläuft', destroyed: 'Wenn dies zerstört wird', function: 'Funktion {name} mit {params}'
  },
  statements: {
    platformer: 'Wie ein Jump’n’Run bewegen: Tempo {speed} Sprung {jump} Schwerkraft {gravity} · Tasten {move} {jumpAction}', topdown: 'In 4 Richtungen mit {move} bewegen, Tempo {speed}',
    setVelocity: 'Geschwindigkeit setzen x {x} y {y}', changeVelocity: 'Geschwindigkeit ändern um x {x} y {y}', impulse: 'Anstoßen um x {x} y {y}', goTo: 'Gehe zu x {x} y {y}', moveBy: 'Bewege um x {x} y {y}', turnBy: 'Drehe um {degrees}°', pointAt: 'Richtung {degrees}°', setSize: 'Größe setzen x {x} y {y}', glideTo: 'Gleiten zu x {x} y {y} in {seconds} s · {easing}', glideBy: 'Gleiten um x {x} y {y} in {seconds} s · {easing}', spinBy: 'Drehen um {degrees}° in {seconds} s · {easing}', dropThrough: 'Durch die Plattform darunter fallen',
    playAnimation: 'Animation {state} abspielen', blendAnimation: 'Zu Animation {state} überblenden in {seconds} s', fadeTo: 'Auf {opacity} % ausblenden in {seconds} s', growTo: 'Auf Größe {scale} wachsen in {seconds} s · {easing}', setText: 'Meinen Text setzen auf {text}', setTextOn: 'Text von {object} setzen auf {text}', show: '{object} zeigen', hide: '{object} verstecken',
    playSound: 'Ton {asset} mit Lautstärke {volume} abspielen', playMusic: 'Musik {asset} abspielen, einblenden {fade} s', jointServo: 'Mein Gelenk auf {target} drehen', postPulse: '{effect} um {amount} für {seconds} s aufblitzen', explodeHere: 'Hier explodieren · Radius {radius} · Stoß {impulse}', stopMusic: 'Musik stoppen, ausblenden {fade} s', busVolume: 'Lautstärke von {bus} auf {volume}', playVideo: 'Video {asset} abspielen · überspringbar {skippable}', rhythmPlay: 'Rhythmus-Chart abspielen', rhythmPause: 'Rhythmus-Chart pausieren', rhythmResume: 'Rhythmus-Chart fortsetzen', rhythmRestart: 'Rhythmus-Chart neu starten', rhythmAutoplay: 'Rhythmus-Autoplay {enabled}', rhythmSpeed: 'Notengeschwindigkeit auf {speed}', rhythmJudgeMyNote: 'Meine Note als {judgement} bewerten',
    if: 'Falls', repeat: 'Wiederhole {times} mal', wait: 'Warte {seconds} s, dann', startTimer: 'Timer {name} für {seconds} s starten · wiederholen {repeat}', stop: 'Hier aufhören',
    setVariable: 'Setze {variable} auf {value}', changeVariable: 'Ändere {variable} um {value}', addScore: '{value} zur Punktzahl', saveValue: 'Speichere {key} = {value}', log: 'Protokolliere {text}',
    spawnHere: '{prefab} hier erzeugen', spawnAt: '{prefab} bei x {x} y {y} erzeugen', destroySelf: 'Dies zerstören', destroyOther: 'Das andere Objekt zerstören', loadScene: 'Zur Szene {scene}', reloadScene: 'Szene neu starten', pauseGame: 'Spiel pausieren {paused}', checkpoint: 'Kontrollpunkt {name} speichern', restoreCheckpoint: 'Zum Kontrollpunkt {name} zurück',
    emitSignal: 'Nachricht {name} senden', callGlobal: '{global} . {function} aufrufen mit {args}', callGroup: '{function} bei Gruppe {group} aufrufen mit {args}', callOther: '{function} beim anderen Objekt aufrufen mit {args}', run: '{function} ausführen mit {args}'
  },
  conditions: { held: '{action} wird gehalten', pressed: '{action} wurde gerade gedrückt', onFloor: 'auf dem Boden', onWall: 'berührt eine Wand', onOneWay: 'steht auf einer Einweg-Plattform', animationIs: 'Animation ist {state}', compare: '{a} {op} {b}', otherHasTag: 'das andere Objekt hat Tag {tag}', chance: 'Zufall {percent} %', rhythmState: 'Rhythmus-Chart ist {state}', rhythmCombo: 'Rhythmus-Combo {op} {value}', expression: 'Code {code}' },
  easings: { linear: 'gleichmäßig', sine_in_out: 'weich', quad_in: 'beschleunigen', quad_out: 'abbremsen', back_out: 'überschwingen', bounce_out: 'hüpfen', elastic_out: 'federn' },
  ui: {
    breakpoint: 'Haltepunkt', addBreakpoint: 'Hier anhalten (Haltepunkt)', removeBreakpoint: 'Haltepunkt entfernen', pausedHere: 'Hier angehalten', title: 'Blöcke', newScript: 'Neues Blockskript', attach: 'An ausgewähltes Objekt hängen', attached: 'Angehängt', save: 'Speichern', saved: 'Gespeichert', unsaved: 'Ungespeicherte Änderungen', openCode: 'Als Code öffnen', convert: 'In Code umwandeln', noScript: 'Blockskript wählen oder erstellen', variables: 'Variablen', addVariable: 'Variable hinzufügen', name: 'Name', initial: 'Startwert', addEvent: 'Ereignis hinzufügen', toolbox: 'Blöcke', search: 'Blöcke suchen', then: 'dann', else: 'sonst', addCondition: 'Bedingung hinzufügen', all: 'alle', any: 'eine', not: 'nicht', remove: 'Entfernen', duplicate: 'Duplizieren', moveUp: 'Nach oben', moveDown: 'Nach unten', disable: 'Deaktivieren', enable: 'Aktivieren', collapse: 'Einklappen', expand: 'Ausklappen', insertHere: 'Hier einfügen', empty: 'Links auf einen Block klicken, um ihn hier einzufügen', problems: 'Probleme', ready: 'Bereit', codeEdited: 'Dieses Skript wurde als Code geändert. Beim Speichern der Blöcke werden diese Änderungen ersetzt.', keepCode: 'Code behalten (Blöcke verlassen)', useBlocks: 'Blockversion verwenden', notBlocks: 'Dieses Skript ist als Code geschrieben. Blöcke öffnen nur in Blöcken erstellte Skripte.', convertConfirm: 'Dieses Skript in reinen Code umwandeln? Danach ist es nicht mehr als Blöcke bearbeitbar.', variableHint: 'Variablen im Text als {name}. Zahlen, true/false oder "Text".', hint: 'Ereignis wählen, dann Blöcke anklicken, um sie zu stapeln. Am Griff ziehen zum Umordnen. Werte: Zahlen, Variablen oder kurze Ausdrücke wie score * 2.', none: 'keins', self: 'dieses Objekt', chooseAsset: 'wählen…', where: 'Blöcke einfügen in', choose: 'wählen…', code: 'Erzeugter Code', touchAny: 'irgendetwas', managedByBlocks: 'Dieses Skript ist mit Blöcken erstellt. Codeänderungen hier werden beim Speichern der Blöcke ersetzt; zum Bearbeiten in Blöcken öffnen oder dort in Code umwandeln.'
  }
}

const zh: BlockCopy = {
  problems: { unknownVariable: '未知变量“{name}”', textPlaceholder: '{{name}} 在这里不是变量，会按原样显示', needsContact: '只能放在“碰到”或“进入”事件里', needsFrame: '这个积木需要放在“每一帧”“每个物理步”或按键事件里', chooseSound: '请选择音效', chooseVideo: '请选择视频', choosePrefab: '请选择预制体', chooseScene: '请选择场景', chooseObject: '请选择对象', chooseVariable: '请选择变量', chooseFunction: '请填写函数名', functionName: '请填写函数名（字母、数字和 _，不能是事件名）', functionTwice: '函数“{name}”定义了两次', badParameter: '“{name}”不是有效的参数名', afterWait: '“等待”之后，这个积木不能再使用事件的数据' },
  categories: { events: '事件', motion: '运动', looks: '外观', sound: '声音与视频', control: '控制', variables: '变量', game: '游戏', messages: '消息' },
  events: {
    start: '当游戏开始时', update: '每一帧', physics: '每个物理步', pressed: '当按下 {action} 时', released: '当松开 {action} 时', held: '按住 {action} 期间',
    touch: '当碰到 {tag} 时', enter: '当有物体进入此区域 {tag}', leave: '当有物体离开此区域 {tag}', signal: '当收到消息 {name} 时', timer: '当计时器 {name} 结束时', destroyed: '当被销毁时', function: '函数 {name} 参数 {params}'
  },
  statements: {
    platformer: '平台跳跃移动：速度 {speed} 跳跃 {jump} 重力 {gravity} · 按键 {move} {jumpAction}', topdown: '用 {move} 四方向移动，速度 {speed}',
    setVelocity: '将速度设为 x {x} y {y}', changeVelocity: '速度增加 x {x} y {y}', impulse: '推动 x {x} y {y}', goTo: '移到 x {x} y {y}', moveBy: '移动 x {x} y {y}', turnBy: '旋转 {degrees}°', pointAt: '面向 {degrees}°', setSize: '大小设为 x {x} y {y}', glideTo: '在 {seconds} 秒内滑到 x {x} y {y} · {easing}', glideBy: '在 {seconds} 秒内滑动 x {x} y {y} · {easing}', spinBy: '在 {seconds} 秒内旋转 {degrees}° · {easing}', dropThrough: '从脚下的平台落下',
    playAnimation: '播放动画 {state}', blendAnimation: '在 {seconds} 秒内过渡到动画 {state}', fadeTo: '在 {seconds} 秒内淡到 {opacity} %', growTo: '在 {seconds} 秒内变为 {scale} 倍大小 · {easing}', setText: '把我的文字设为 {text}', setTextOn: '把 {object} 的文字设为 {text}', show: '显示 {object}', hide: '隐藏 {object}',
    playSound: '播放音效 {asset} 音量 {volume}', playMusic: '播放音乐 {asset} 淡入 {fade} 秒', jointServo: '把我的关节转到 {target}', postPulse: '闪动 {effect} 强度 {amount} 持续 {seconds} 秒', explodeHere: '在此处爆炸 · 半径 {radius} · 冲量 {impulse}', stopMusic: '停止音乐 淡出 {fade} 秒', busVolume: '把 {bus} 音量设为 {volume}', playVideo: '播放视频 {asset} · 可跳过 {skippable}', rhythmPlay: '播放节奏谱面', rhythmPause: '暂停节奏谱面', rhythmResume: '继续节奏谱面', rhythmRestart: '重新开始节奏谱面', rhythmAutoplay: '节奏自动演奏 {enabled}', rhythmSpeed: '把音符速度设为 {speed}', rhythmJudgeMyNote: '把我的音符判为 {judgement}',
    if: '如果', repeat: '重复 {times} 次', wait: '等待 {seconds} 秒，然后', startTimer: '启动计时器 {name} {seconds} 秒 · 重复 {repeat}', stop: '到此停止',
    setVariable: '将 {variable} 设为 {value}', changeVariable: '将 {variable} 增加 {value}', addScore: '得分增加 {value}', saveValue: '存档 {key} = {value}', log: '输出日志 {text}',
    spawnHere: '在这里创建 {prefab}', spawnAt: '在 x {x} y {y} 创建 {prefab}', destroySelf: '销毁自己', destroyOther: '销毁碰到的物体', loadScene: '切换到场景 {scene}', reloadScene: '重新开始场景', pauseGame: '暂停游戏 {paused}', checkpoint: '保存检查点 {name}', restoreCheckpoint: '回到检查点 {name}',
    emitSignal: '发送消息 {name}', callGlobal: '调用 {global} . {function} 参数 {args}', callGroup: '对分组 {group} 调用 {function} 参数 {args}', callOther: '对碰到的物体调用 {function} 参数 {args}', run: '运行 {function} 参数 {args}'
  },
  conditions: { held: '按住 {action}', pressed: '刚按下 {action}', onFloor: '站在地面上', onWall: '贴着墙', onOneWay: '站在单向平台上', animationIs: '动画是 {state}', compare: '{a} {op} {b}', otherHasTag: '碰到的物体带有标签 {tag}', chance: '概率 {percent} %', rhythmState: '节奏谱面状态为 {state}', rhythmCombo: '节奏连击 {op} {value}', expression: '代码 {code}' },
  easings: { linear: '匀速', sine_in_out: '平滑', quad_in: '加速', quad_out: '减速', back_out: '回弹', bounce_out: '弹跳', elastic_out: '弹簧' },
  ui: {
    breakpoint: '断点', addBreakpoint: '在这里暂停（断点）', removeBreakpoint: '移除断点', pausedHere: '已在这里暂停', title: '积木', newScript: '新建积木脚本', attach: '挂到所选对象', attached: '已挂载', save: '保存', saved: '已保存', unsaved: '有未保存的更改', openCode: '以代码打开', convert: '转换为代码', noScript: '选择或新建一个积木脚本', variables: '变量', addVariable: '添加变量', name: '名称', initial: '初始值', addEvent: '添加事件', toolbox: '积木', search: '搜索积木', then: '那么', else: '否则', addCondition: '添加条件', all: '全部满足', any: '任一满足', not: '不', remove: '删除', duplicate: '复制', moveUp: '上移', moveDown: '下移', disable: '停用', enable: '启用', collapse: '折叠', expand: '展开', insertHere: '插入到这里', empty: '点击左侧积木即可添加到这里', problems: '问题', ready: '就绪', codeEdited: '这个脚本被当作代码修改过。保存积木会覆盖这些修改。', keepCode: '保留代码（离开积木）', useBlocks: '使用积木版本', notBlocks: '这个脚本是用代码写的。积木只能打开在积木中创建的脚本。', convertConfirm: '把这个脚本转换为普通代码？转换后不能再用积木编辑。', variableHint: '在文字里用 {名称} 插入变量。值可以是数字、true/false 或 "文字"。', hint: '先选一个事件，再点击积木把它们叠起来；拖动左侧把手可以调整顺序。数值可以填数字、变量或简单表达式，例如 score * 2。', none: '无', self: '自己', chooseAsset: '选择…', where: '积木添加到', choose: '选择…', code: '生成的代码', touchAny: '任何物体', managedByBlocks: '这个脚本是用积木做的。在这里改的代码会在保存积木时被覆盖；请到积木中编辑，或在积木里把它转换为代码。'
  }
}

export const BLOCK_COPY: Record<BlockLocale, BlockCopy> = { en, de, zh }
export const blockCopy = (locale: string): BlockCopy => BLOCK_COPY[(locale as BlockLocale)] ?? en

/** Splits a label into text and {field} parts. */
export function labelParts(label: string): Array<{ text: string } | { field: string }> {
  const parts: Array<{ text: string } | { field: string }> = []
  let last = 0
  for (const match of label.matchAll(/\{([A-Za-z]+)\}/g)) {
    if (match.index! > last) parts.push({ text: label.slice(last, match.index) })
    parts.push({ field: match[1] })
    last = match.index! + match[0].length
  }
  if (last < label.length) parts.push({ text: label.slice(last) })
  return parts
}
