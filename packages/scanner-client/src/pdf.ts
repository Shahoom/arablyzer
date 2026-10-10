import { MAX_PDF_BYTES } from '@arablyzer/api-contract/codes'
import type { PdfDocument } from '@arablyzer/pdf/model'
import { ScannerUnavailable, type Fetcher } from './client'

// How the PDF job and the scanner talk (M4.7): the job sends the document as JSON (text and a
// few pictures, never markup), and the scanner draws it in its browser and answers with the file.

/** The path the PDF job asks on. */
export const PDF_RENDER_PATH = '/pdf'
/** The longest the job waits for a file: the browser's own limit, and a little more. */
export const PDF_RENDER_TIMEOUT_MS = 90_000

/** What the PDF job asks of the scanner. */
export type PdfRenderer = (document: PdfDocument, signal?: AbortSignal) => Promise<Uint8Array>

/**
 * The scanner's PDF interface, from the PDF job. A scanner that is not there, or is busy with a
 * scan, or is ending its process after one, throws ScannerUnavailable: nothing was drawn, so the job
 * asks again after a wait. The answer must be a PDF within the size cap.
 */
export function remotePdf(
  endpoint: string,
  token: string,
  fetcher: Fetcher = fetch,
  timeoutMs = PDF_RENDER_TIMEOUT_MS,
): PdfRenderer {
  const url = new URL(PDF_RENDER_PATH, endpoint).href
  return async (document, signal) => {
    const deadline = AbortSignal.timeout(timeoutMs)
    let response: Response
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(document),
        signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
      })
    } catch (error) {
      const code = (error as { cause?: { code?: unknown } }).cause?.code
      if (
        typeof code === 'string' &&
        /^(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)$/.test(code)
      ) {
        throw new ScannerUnavailable(`The scanner is not there (${code})`, { cause: error })
      }
      throw error
    }
    if (response.status === 503) {
      await response.body?.cancel()
      throw new ScannerUnavailable('The scanner answered 503')
    }
    if (response.status === 413) {
      await response.body?.cancel()
      throw new Error('too-large')
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error(`The scanner answered ${String(response.status)}`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > MAX_PDF_BYTES) throw new Error('too-large')
    // %PDF-: anything else is not the file asked for.
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
      throw new Error('The scanner sent an answer that is not a PDF')
    }
    return bytes
  }
}
