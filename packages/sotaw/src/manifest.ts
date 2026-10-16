import { z } from 'zod'

/** The files of an edition with their sizes and SHA-256: what the page checks before it links them. */
export const Manifest = z.strictObject({
  v: z.literal(1),
  edition: z.string(),
  license: z.literal('CC-BY-4.0'),
  files: z.array(
    z.strictObject({
      name: z.string().regex(/^[a-z0-9.-]+$/),
      mediaType: z.string(),
      description: z.string(),
      bytes: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
})
export type Manifest = z.infer<typeof Manifest>
