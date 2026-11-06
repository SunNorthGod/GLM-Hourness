/**
 * A script's text as the rules board and the loop board show it under
 * 讲细点 (rules design 0.10 §9.1, loop board design 0.6 §8.2 item 5): read
 * only when the person opens it, through remote.workspaceFiles, at most
 * 64 KiB (the executor's own limit, src/loops/command-text.ts); a larger
 * file is not read at all. The file is the entry's path from the project
 * root, and the root is where the board's view.json sits
 * (`<root>/.llm/<board>/view.json`). Pure but for the reads; the component
 * that opens it is ./ScriptDetails.tsx.
 */
import { SCRIPT_MAX_BYTES } from '../../../src/loops/command-text.ts'
import type { WorkspaceFilesRemote } from '../dsh.ts'

/** What 讲细点 has of a script: being read, its text, too large to show, no file, a failed read, or no project to read it in. */
export type ScriptText =
  | { readonly kind: 'reading' }
  | { readonly kind: 'text', readonly text: string }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed', readonly message: string }
  | { readonly kind: 'no-root' }

/** The project root and its separator of a board's view.json; null when the path is not `<root>/.llm/<board>/view.json`. */
export function projectRootOfView(viewFile: string): { readonly root: string, readonly separator: string } | null {
  const match = /^(.+?)([\\/])\.llm\2[^\\/]+\2view\.json$/.exec(viewFile)
  return match === null ? null : { root: match[1], separator: match[2] }
}

/** Read one script of the project: its size first, so a file over 64 KiB is not read; then its bytes as UTF-8. */
export async function readScriptText(files: WorkspaceFilesRemote, sessionId: string, project: { readonly root: string, readonly separator: string }, file: string, signal: AbortSignal): Promise<ScriptText> {
  const path = [project.root, ...file.split('/')].join(project.separator)
  const stat = await files.stat(sessionId, path, signal)
  if (!stat.ok) return stat.error.code === 'workspace-file/not-found' ? { kind: 'missing' } : { kind: 'failed', message: stat.error.message }
  if ((stat.value.bytes ?? 0) > SCRIPT_MAX_BYTES) return { kind: 'too-large' }
  const read = await files.readBytes(sessionId, path, {}, signal)
  if (!read.ok) return read.error.code === 'workspace-file/not-found' ? { kind: 'missing' } : { kind: 'failed', message: read.error.message }
  // The file grew between the two calls: the read stopped short or went over the limit.
  if (read.value.data.length > SCRIPT_MAX_BYTES || read.value.eof === false) return { kind: 'too-large' }
  return { kind: 'text', text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(read.value.data) }
}

/** The line above the text, or in its place. */
export function scriptTextHead(shown: ScriptText, file: string): string {
  switch (shown.kind) {
    case 'reading': return `正在读脚本原文：${file}`
    case 'text': return `脚本原文：${file}`
    case 'too-large': return `脚本 ${file} 超过 64 KiB，这里不显示原文`
    case 'missing': return `脚本文件不见了：${file}`
    case 'failed': return `脚本原文读不出：${shown.message}`
    case 'no-root': return '脚本原文读不出：不知道这个项目在哪'
  }
}
