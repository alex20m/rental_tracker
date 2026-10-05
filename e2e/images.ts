import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** A width × height grey-gradient PNG, the stand-in for a phone's photo or screenshot. */
export function pngOfSize(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    for (let x = 0; x < width; x++) raw[row + 1 + x] = (x + y) % 256;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Pixel size and the first luminance quantisation value (lower means higher JPEG quality) of a JPEG. */
export function jpegInfo(jpeg: Buffer): { width: number; height: number; firstQuantValue: number } {
  let firstQuantValue = 0;
  for (let i = 2; i < jpeg.length; ) {
    const marker = jpeg[i + 1]!;
    const length = jpeg.readUInt16BE(i + 2);
    if (marker === 0xdb && !firstQuantValue) firstQuantValue = jpeg[i + 5]!;
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: jpeg.readUInt16BE(i + 5), width: jpeg.readUInt16BE(i + 7), firstQuantValue };
    }
    i += 2 + length;
  }
  throw new Error('No frame header in the JPEG');
}
