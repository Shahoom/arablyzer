import { crc32, deflateRawSync } from 'node:zlib'

// A zip writer, since the Chrome Web Store takes a zip and the repository carries no archiver:
// deflated entries, names sorted and a fixed timestamp, so the same files give the same bytes.

export interface ZipEntry {
  readonly name: string
  readonly data: Uint8Array
}

/** 2026-01-01 00:00:00 as MS-DOS date and time. */
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
const DOS_TIME = 0

export function zip(entries: readonly ZipEntry[]): Buffer {
  const files = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8')
    const packed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)

    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4) // version needed
    head.writeUInt16LE(0x0800, 6) // names are UTF-8
    head.writeUInt16LE(8, 8) // deflate
    head.writeUInt16LE(DOS_TIME, 10)
    head.writeUInt16LE(DOS_DATE, 12)
    head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(packed.length, 18)
    head.writeUInt32LE(data.length, 22)
    head.writeUInt16LE(nameBytes.length, 26)
    local.push(head, nameBytes, packed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // made by
    entry.writeUInt16LE(20, 6) // needed
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt16LE(DOS_TIME, 12)
    entry.writeUInt16LE(DOS_DATE, 14)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)

    offset += head.length + nameBytes.length + packed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}
