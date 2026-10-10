import { describe } from 'vitest'
import { MemoryPdfData } from '../src/index'
import { pdfContract } from './pdf-contract'

describe('MemoryPdfData', () => {
  pdfContract(() => ({
    pdfs: new MemoryPdfData(),
    user: () => Promise.resolve(),
    scan: () => Promise.resolve(),
    reset: () => Promise.resolve(),
  }))
})
