// Cross-platform, dependency-free packaging of dist/ into contextia.zip (store
// method). Avoids relying on a `zip` binary so it works on Windows too.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = process.argv[2] || 'dist'
const zipName = root === 'dist' ? 'contextia.zip' : 'contextia-firefox.zip'
const DOS_DATE = 0x21 // 1980-01-01
const DOS_TIME = 0

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

const files = (await walk(root)).sort()
const locals = []
const centrals = []
let offset = 0

for (const file of files) {
  const data = await readFile(file)
  const name = relative(root, file).split('\\').join('/')
  const nameBuf = Buffer.from(name, 'utf8')
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8) // store
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  locals.push(local, nameBuf, data)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(DOS_TIME, 12)
  central.writeUInt16LE(DOS_DATE, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(offset, 42)
  centrals.push(central, nameBuf)

  offset += local.length + nameBuf.length + data.length
}

const localPart = Buffer.concat(locals)
const centralPart = Buffer.concat(centrals)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(files.length, 8)
eocd.writeUInt16LE(files.length, 10)
eocd.writeUInt32LE(centralPart.length, 12)
eocd.writeUInt32LE(localPart.length, 16)

await writeFile(zipName, Buffer.concat([localPart, centralPart, eocd]))
console.log(`packaged: packages/extension/${zipName} (${files.length} files)`)
