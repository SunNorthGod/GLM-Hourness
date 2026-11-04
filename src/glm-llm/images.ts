/**
 * Request images for the native channel. DSH keeps images as durable
 * attachment references; the adapter reads one request version per
 * attachment from the attachment service (dsh-attachment
 * `AttachmentStore.readImageRequest`, the same call the rc.3 pi-ai adapter
 * makes) and the encoder sends it as an Anthropic base64 image block, the
 * form the ZCode client sends GLM (src/glm-llm/anthropic.ts).
 *
 * Request bounds follow ZCode's model-image limits (3.16.3 bundle; source
 * contracts/src/tools/read.ts READ_IMAGE_MAX_DIMENSION and
 * READ_IMAGE_TARGET_BYTES, runtime/types.ts MAX_IMAGE_ATTACHMENT_DIMENSION).
 */
import type { AttachmentsLike, ImageRefLike, ImageTarget, RequestMessageLike } from '../shared/lm-min.ts'

/** ZCode's long-edge bound for model images (Read results and attachments). */
export const ZCODE_IMAGE_MAX_DIMENSION = 2000
/** ZCode's raw-byte target for model images: the base64 form stays within 5 MiB. */
export const ZCODE_IMAGE_TARGET_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4)

/** The attachment service when `value` offers the `AttachmentsLike` members, otherwise undefined. */
export function asAttachments(value: unknown): AttachmentsLike | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const service = value as Partial<Record<keyof AttachmentsLike, unknown>>
  return typeof service.readImageRequest === 'function' && typeof service.imageHostPath === 'function' ? value as AttachmentsLike : undefined
}

/**
 * The request version bounds for one normalized image: ZCode's long edge and
 * byte target. Dimensions scale like dsh-attachment `longEdgeDimensions`
 * (exact long edge, short edge rounded); smaller images keep their size.
 */
export function glmImageRequestTarget(image: Pick<ImageRefLike, 'width' | 'height'>): ImageTarget {
  const { width, height } = image
  const edge = ZCODE_IMAGE_MAX_DIMENSION
  const dimensions = edge >= Math.max(width, height)
    ? { width, height }
    : width >= height
      ? { width: edge, height: Math.max(1, Math.round(edge * height / width)) }
      : { width: Math.max(1, Math.round(edge * width / height)), height: edge }
  return { ...dimensions, maxBytes: ZCODE_IMAGE_TARGET_BYTES }
}

/** One prepared request image in wire form. */
export interface WireImage {
  readonly mediaType: string
  /** Base64 of the request version's bytes. */
  readonly data: string
}

/** The images of one call: request versions by attachment id, and the text sent for an offloaded occurrence. */
export interface RequestImages {
  readonly versions: ReadonlyMap<string, WireImage>
  offloadedText(ref: ImageRefLike): string
}

/**
 * Read the request version of every image the call sends. Only user and tool
 * messages carry images (rc.3 assistant images are forward compatibility).
 * Offloaded occurrences send placeholder text instead of bytes; the offloaded
 * set is a durable session fact every route honors. Returns undefined when
 * the call carries no image.
 */
export async function prepareRequestImages(
  messages: readonly RequestMessageLike[],
  attachments: AttachmentsLike | undefined,
  mapHostPath: ((hostPath: string) => string | undefined) | undefined,
  signal: AbortSignal | undefined,
): Promise<RequestImages | undefined> {
  const retained = new Map<string, ImageRefLike>()
  let offloaded = false
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'tool') continue
    for (const block of message.content) {
      if (block.type !== 'image') continue
      if (block.offloaded === true) offloaded = true
      else retained.set(block.attachment.attachmentId, block.attachment)
    }
  }
  if (retained.size === 0 && !offloaded) return undefined
  if (retained.size > 0 && attachments === undefined) throw new Error('glm-zcode: image input requires the durable attachment service')
  const refs = [...retained.values()]
  const prepared = attachments === undefined ? [] : await Promise.all(refs.map(ref => attachments.readImageRequest(ref, glmImageRequestTarget(ref), signal)))
  const versions = new Map<string, WireImage>()
  for (const [index, ref] of refs.entries()) {
    const version = prepared[index]
    versions.set(ref.attachmentId, { mediaType: version.mediaType, data: Buffer.from(version.data).toString('base64') })
  }
  return { versions, offloadedText: ref => offloadedImageText(ref, readonlyPath(attachments, mapHostPath, ref)) }
}

/** The execution-world path of an attachment's normalized copy (dsh-llm `resolveImageAttachmentAccess`). */
function readonlyPath(attachments: AttachmentsLike | undefined, mapHostPath: ((hostPath: string) => string | undefined) | undefined, ref: ImageRefLike): string | undefined {
  let hostPath: string | undefined
  try { hostPath = attachments?.imageHostPath(ref) } catch { return undefined }
  return hostPath === undefined ? undefined : mapHostPath?.(hostPath)
}

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }

/**
 * DSH's placeholder for an image offloaded to fit request image limits,
 * reproduced from dsh-llm 0.2.1-rc.3 (`offloadedImageText`, `imageIdentity`,
 * `normalizedAccessText`): the runtime package does not resolve from this
 * repository, so the text is copied with its source.
 */
export function offloadedImageText(ref: ImageRefLike, path: string | undefined): string {
  const identity = `image omitted to fit request image limits; ${ref.name === undefined ? ref.attachmentId : `${JSON.stringify(ref.name)} (${ref.attachmentId})`}.`
  if (path === undefined) return `[${identity} No local normalized image path is available; ask the user to attach it again if needed.]`
  return `[${identity} Normalized copy (read-only; may be resized or re-encoded): ${JSON.stringify(path)} (${ref.width}x${ref.height}px, ${ref.mediaType}). Source dimensions, format, and byte size may differ. Copy to a writable path ending in ${IMAGE_EXTENSIONS[ref.mediaType] ?? ''} before editing.]`
}
