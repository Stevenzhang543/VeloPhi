/**
 * File access for both hosts. In the desktop app (Tauri) native open/save dialogs and the file system are
 * used; in a browser the File System Access API when available, otherwise an <input type=file> and a
 * download link. Nothing is uploaded anywhere.
 */
import { tl } from '../i18n'
/** Running inside the Tauri desktop app. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** A file type of the open and save dialogs. */
export interface FileFilter { name: string; extensions: string[] }

/** A file read by openTextFile; `path` is null in the browser. */
export interface OpenedFile { name: string; path: string | null; text: string }

/** Let the user pick a text file and read it (desktop: null when cancelled). */
export async function openTextFile(filters: FileFilter[]): Promise<OpenedFile | null> {
  if (isDesktop) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await open({ multiple: false, directory: false, filters })
    if (!path || Array.isArray(path)) return null
    const text = await readTextFile(path)
    return { name: path.split(/[\\/]/).pop() ?? path, path, text }
  }
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters.flatMap(f => f.extensions.map(e => `.${e}`)).join(',')
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) { resolve(null); return }
      resolve({ name: f.name, path: null, text: await f.text() })
    }
    // Chromium fires `cancel` when the picker is dismissed; without it the promise would never settle
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

/** Save data; returns the saved path (desktop) or file name (browser), or null when cancelled. */
export async function saveFile(data: string | Uint8Array, suggestedName: string, filters: FileFilter[], existingPath: string | null = null): Promise<string | null> {
  if (isDesktop) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile, writeTextFile } = await import('@tauri-apps/plugin-fs')
    const path = existingPath ?? await save({ defaultPath: suggestedName, filters })
    if (!path) return null
    if (typeof data === 'string') await writeTextFile(path, data)
    else await writeFile(path, data)
    return path
  }
  const blob = new Blob([typeof data === 'string' ? data : data.slice().buffer], { type: mimeOf(suggestedName) })
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>; name: string }> }
  // A ?download query in the address forces plain downloads (automated checks; browsers without the picker)
  const forceDownload = typeof location !== 'undefined' && new URLSearchParams(location.search).has('download')
  if (w.showSaveFilePicker && !forceDownload) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName, types: filters.map(f => ({ description: f.name, accept: { [mimeOf(suggestedName)]: f.extensions.map(e => `.${e}`) } })) })
      const stream = await handle.createWritable()
      await stream.write(blob)
      await stream.close()
      return handle.name
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return suggestedName
}

const MIME: Record<string, string> = {
  json: 'application/json',
  csv: 'text/csv',
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  png: 'image/png',
  mp4: 'video/mp4',
  webm: 'video/webm',
  zip: 'application/zip',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

/** Media type from the file extension (download links and the save picker's accept list). */
export function mimeOf(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

/** File filter of scene files. */
/** File type of scene files (its name in the current language). */
export function sceneFilter(): FileFilter[] { return [{ name: tl('Verity 场景'), extensions: ['json'] }] }
