/**
 * Text written for the AI, not for the user (26.59): the JSON tool protocol, tool results, how a transcribed photo
 * joins the user's words, the repair hint with the readable quantities. Chinese on purpose (the built-in prompts
 * are Chinese, D162), kept with the prompts and skipped by the interface-text check (scripts/i18n-keys.mjs).
 */

/** One tool in the JSON protocol (providers without native function calling, D148). */
export const toolLine = (name: string, description: string, schema: unknown) => `- ${name}: ${description}\n  参数（JSON Schema）：${JSON.stringify(schema)}`

/** The JSON protocol rule with the list of tools. */
export const jsonProtocol = (toolList: string) => `你不能使用原生的函数调用。需要调用工具时，整条回复只输出一个 JSON 对象：{"tool_calls":[{"name":"工具名","arguments":{…}}]}；不需要工具、直接回答用户时，输出 {"reply":"给用户的回答"}。可用工具：\n${toolList}`

/** A tool result passed back as a user message in the JSON protocol. */
export const toolResult = (id: string, content: string) => `工具结果（${id}）：${content}`

/** A tool result cut to the size limit. */
export const truncated = (s: string) => `${s}…（结果过长，已截断）`

/** The user's words and the transcript of their photo, as one text (the words first, D178). */
export const withTranscript = (words: string, transcript: string) => (words ? `${words}\n\n【图片中的题目】\n${transcript}` : transcript)

/** The words the user typed next to a photo, for the transcription call. */
export const typedWithPhoto = (text: string) => (text ? `\n\n用户同时输入的文字（与图片互为补充）：\n${text}` : '')

/** Repair hint of a generated scene: the quantities it can read. */
export const readableList = (ids: string[]) => `这个场景可读的量：${ids.join(', ')}`

/** 26.59 fix 3: asked of a model that thinks although asked not to (the official server before 20261102-r2). */
export const BREVITY = '\n\n（请直接作答：不要长时间思考，思考不超过 200 字，然后完整地输出要求的内容。）'
