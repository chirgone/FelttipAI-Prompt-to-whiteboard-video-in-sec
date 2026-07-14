/**
 * Minimal writer for raw-RGBA-in-AVI, the cheapest container Remotion's
 * trimmed ffmpeg can demux. Its PNG path decodes at ~255ms/frame (zlib built
 * -Os), while AVI + the rawvideo decoder is a memcpy — so frames go over the
 * pipe uncompressed with an 8-byte chunk header each. The byte layout mirrors
 * what that ffmpeg itself emits for `-c:v rawvideo -pix_fmt rgba -f avi`
 * (fourcc "RGBA"; positive biHeight stays top-down for non-BI_RGB fourccs).
 * No idx1 index — the demuxer streams chunks sequentially from the pipe.
 */
export class RawAviStream {
  private readonly frameBytes: number;
  private readonly chunkHeader: Buffer;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly fps: number,
    private readonly frameCount: number,
  ) {
    this.frameBytes = width * height * 4;
    this.chunkHeader = Buffer.alloc(8);
    this.chunkHeader.write("00db", 0, "ascii");
    this.chunkHeader.writeUInt32LE(this.frameBytes, 4);
  }

  /** RIFF/hdrl/movi preamble; write once before the first frame. */
  header(): Buffer {
    const { width, height, fps, frameCount, frameBytes } = this;
    const w = new ByteWriter();

    const strh = new ByteWriter();
    strh.fourcc("vids");
    strh.fourcc("RGBA"); // handler
    strh.u32(0); // flags
    strh.u32(0); // priority + language
    strh.u32(0); // initial frames
    strh.u32(1); // scale
    strh.u32(fps); // rate
    strh.u32(0); // start
    strh.u32(frameCount); // length
    strh.u32(frameBytes); // suggested buffer size
    strh.u32(0xffffffff); // quality
    strh.u32(0); // sample size
    strh.u16(0).u16(0).u16(width).u16(height); // rcFrame

    const strf = new ByteWriter(); // BITMAPINFOHEADER
    strf.u32(40);
    strf.u32(width);
    strf.u32(height); // positive is fine: non-BI_RGB fourcc means top-down
    strf.u16(1).u16(32); // planes, bit count
    strf.fourcc("RGBA"); // compression
    strf.u32(frameBytes);
    strf.u32(0).u32(0).u32(0).u32(0);

    const avih = new ByteWriter();
    avih.u32(Math.round(1_000_000 / fps));
    avih.u32(frameBytes * fps); // max bytes/sec
    avih.u32(0); // padding granularity
    avih.u32(0); // flags: no index, interleave irrelevant for one stream
    avih.u32(frameCount);
    avih.u32(0); // initial frames
    avih.u32(1); // streams
    avih.u32(frameBytes); // suggested buffer size
    avih.u32(width);
    avih.u32(height);
    avih.u32(0).u32(0).u32(0).u32(0);

    const strl = ByteWriter.list("strl", [
      ByteWriter.chunk("strh", strh.bytes()),
      ByteWriter.chunk("strf", strf.bytes()),
    ]);
    const hdrl = ByteWriter.list("hdrl", [ByteWriter.chunk("avih", avih.bytes()), strl]);
    const moviSize = 4 + frameCount * (8 + frameBytes);
    const riffSize = 4 + hdrl.length + 8 + moviSize;

    w.fourcc("RIFF");
    w.u32(riffSize);
    w.fourcc("AVI ");
    w.raw(hdrl);
    w.fourcc("LIST");
    w.u32(moviSize);
    w.fourcc("movi");
    return w.bytes();
  }

  /**
   * One '00db' movi chunk. Copies `rgba` because @napi-rs/canvas's data() is
   * a live view into the surface — the next drawFrame() would mutate bytes
   * still queued on the pipe.
   */
  frame(rgba: Buffer): Buffer {
    if (rgba.length !== this.frameBytes) {
      throw new Error(`render: AVI frame is ${rgba.length} bytes, expected ${this.frameBytes}`);
    }
    const out = Buffer.allocUnsafe(8 + this.frameBytes);
    this.chunkHeader.copy(out, 0);
    rgba.copy(out, 8);
    return out;
  }
}

class ByteWriter {
  private parts: Buffer[] = [];

  static chunk(fourcc: string, data: Buffer): Buffer {
    const w = new ByteWriter();
    w.fourcc(fourcc);
    w.u32(data.length);
    w.raw(data);
    return w.bytes();
  }

  static list(kind: string, items: Buffer[]): Buffer {
    const w = new ByteWriter();
    const size = 4 + items.reduce((n, b) => n + b.length, 0);
    w.fourcc("LIST");
    w.u32(size);
    w.fourcc(kind);
    for (const item of items) w.raw(item);
    return w.bytes();
  }

  fourcc(s: string): this {
    this.parts.push(Buffer.from(s, "ascii"));
    return this;
  }

  u32(v: number): this {
    const b = Buffer.allocUnsafe(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.parts.push(b);
    return this;
  }

  u16(v: number): this {
    const b = Buffer.allocUnsafe(2);
    b.writeUInt16LE(v & 0xffff, 0);
    this.parts.push(b);
    return this;
  }

  raw(b: Buffer): this {
    this.parts.push(b);
    return this;
  }

  bytes(): Buffer {
    return Buffer.concat(this.parts);
  }
}
