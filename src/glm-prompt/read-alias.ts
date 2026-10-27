/**
 * ZCode Read over the rc.3 natives `read` and `read_image`
 * (reference/dsh-desktop-0.2.1-rc.3/dsh-tool-fs). Texts and schema come from
 * the 3.16.3 mirror (zcode-tool-text.ts); this module keeps the description
 * true on DSH (docs/DESIGN.md §5.3 ⑥, §5.4):
 * - DSH has no video input, so the video line is dropped and video paths are
 *   refused with ZCode's binary-file message; without `read_image` the image
 *   line goes too and image paths are refused the same way;
 * - image paths (ZCode's extension set) go to `read_image`, which the alias
 *   then covers; `offset` and `limit` do not apply to images, as in ZCode;
 * - ZCode's binary extensions are refused before reading, as ZCode does;
 * - a text window renders in ZCode's cat -n form (`<line>\t<text>`), which
 *   Edit's "strip the Read line prefix (line number + tab)" relies on; an
 *   empty file answers with ZCode's empty-file reminder;
 * - when the native line or byte cap ends the window before the file ends
 *   and the model's own `limit` does not explain it, the result opens with
 *   ZCode's partial-view sentences saying where to continue;
 * - `offset` 0 reads from the first line as in ZCode (the native counts from
 *   1); a `limit` above the native 2000-line window is clamped to it.
 */
import type { JsonRecord } from './json.ts'
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import {
  READ_BINARY_EXTENSIONS,
  READ_DEFAULT_MAX_LINES,
  READ_DESCRIPTION_LINES,
  READ_EMPTY_FILE_WARNING,
  READ_IMAGE_EXTENSIONS,
  READ_IMAGE_LINE,
  READ_INPUT_SCHEMA,
  READ_VIDEO_EXTENSIONS,
  READ_VIDEO_LINE,
  readBinaryFileMessage,
  readPartialViewContinue,
  readPartialViewRange,
  readToolResultWarning,
} from './zcode-tool-text.ts'

/** Native names the Read alias stands in for. */
export const READ_NATIVE = 'read'
export const READ_IMAGE_NATIVE = 'read_image'

/**
 * Line cap of one native window: the dsh-tool-fs `readLimit` default, equal
 * to ZCode's default window. The shim assumes the default configuration.
 */
const NATIVE_LINE_CAP = READ_DEFAULT_MAX_LINES

/** The Read description GLM sees: the 3.16.3 lines minus those this composition cannot honor. */
export function readDescription(images: boolean): string {
  return READ_DESCRIPTION_LINES.filter(line => line !== READ_VIDEO_LINE && (images || line !== READ_IMAGE_LINE)).join('\n')
}

/** One native read window (the `read` output value). */
interface ReadWindow {
  readonly path: string
  readonly offset: number
  readonly lines: ReadonlyArray<{ readonly number: number, readonly text: string }>
  readonly totalLines: number
}

const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value)
const isReadWindow = (value: unknown): value is ReadWindow =>
  isRecord(value) && typeof value.offset === 'number' && typeof value.totalLines === 'number' && Array.isArray(value.lines)
const isImageValue = (value: unknown): boolean => isRecord(value) && isRecord(value.image)

/** The last extension of a path's file name, lower-cased (ZCode readFileExtension; a leading dot is not one). */
export function fileExtension(path: string): string | undefined {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1).toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? undefined : name.slice(dot)
}

/** Map ZCode Read arguments to the native `read` arguments. */
export function mapReadArgs(args: JsonRecord): JsonRecord {
  const out: JsonRecord = {}
  if (args.file_path !== undefined) out.file_path = args.file_path
  if (args.offset !== undefined) out.offset = args.offset === 0 ? 1 : args.offset
  if (args.limit !== undefined) out.limit = typeof args.limit === 'number' && args.limit > NATIVE_LINE_CAP ? NATIVE_LINE_CAP : args.limit
  return out
}

/** ZCode's text result (formatReadTextOutput) over one native window. */
export function renderReadWindow(args: JsonRecord, window: ReadWindow): string {
  if (window.lines.length === 0) return readToolResultWarning(READ_EMPTY_FILE_WARNING)
  const endLine = window.lines.at(-1)?.number ?? window.offset
  const requested = typeof args.limit === 'number' ? args.limit : undefined
  const cut = endLine < window.totalLines && (requested === undefined || window.lines.length < requested)
  const body = window.lines.map(line => `${line.number}\t${line.text}`).join('\n')
  if (!cut) return body
  const notice = [readPartialViewRange(window.offset, endLine, window.totalLines), readPartialViewContinue(endLine + 1)].join(' ')
  return `${readToolResultWarning(notice)}\n${body}`
}

/**
 * Build the Read alias over the captured natives. With `read_image` present
 * the output contract is the union of both native values, so the runtime
 * validates whichever native answered, and each projection goes to the
 * native that produced the value.
 */
export function buildReadAlias(read: ToolDefinitionLike, readImage: ToolDefinitionLike | undefined): ToolDefinitionLike {
  const input = (args: unknown): JsonRecord => isRecord(args) ? args : {}
  const imageArgs = (args: unknown): JsonRecord => ({ file_path: input(args).file_path ?? '' })
  const readMeta = read.output.presentationMeta
  const imageMeta = readImage?.output.presentationMeta
  const refused = new Set([...READ_BINARY_EXTENSIONS, ...READ_VIDEO_EXTENSIONS, ...(readImage === undefined ? READ_IMAGE_EXTENSIONS : [])])
  return {
    name: 'Read',
    description: readDescription(readImage !== undefined),
    parameters: READ_INPUT_SCHEMA,
    output: {
      schema: readImage === undefined ? read.output.schema : { oneOf: [read.output.schema, readImage.output.schema] },
      render(args, value) {
        if (readImage !== undefined && isImageValue(value)) return readImage.output.render(imageArgs(args), value)
        if (isReadWindow(value)) return [{ type: 'text', text: renderReadWindow(input(args), value) }]
        return read.output.render(mapReadArgs(input(args)), value)
      },
      ...(readMeta === undefined
        ? {}
        : {
            presentationMeta(args: unknown, value: unknown): unknown {
              if (readImage !== undefined && isImageValue(value)) return imageMeta === undefined ? {} : imageMeta.call(readImage.output, imageArgs(args), value)
              return readMeta.call(read.output, mapReadArgs(input(args)), value)
            },
          }),
    },
    async execute(args, exec) {
      const filePath = input(args).file_path
      const extension = typeof filePath === 'string' ? fileExtension(filePath) : undefined
      if (extension !== undefined && refused.has(extension)) throw new Error(readBinaryFileMessage(extension))
      if (readImage !== undefined && extension !== undefined && READ_IMAGE_EXTENSIONS.includes(extension)) return readImage.execute(imageArgs(args), exec)
      return read.execute(mapReadArgs(input(args)), exec)
    },
  }
}
