/**
 * Frame-level MP3 facts needed to concatenate chapters into one file.
 *
 * The engine already reports a duration; merging needs different facts: where
 * the audio starts after an ID3v2 tag, which header the first frame carries, and
 * how many bytes one silent frame occupies. Pure JS on purpose — an episode must
 * be produced on a machine without ffmpeg.
 */
/** One parsed Layer III frame header. */
export interface FrameFormat {
    /** MPEG version bits: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5. */
    version: number;
    /** Layer bits (1 = Layer III, the only layer accepted here). */
    layer: number;
    bitrateKbps: number;
    sampleRate: number;
    /** 1 for mono, 2 for stereo. */
    channels: number;
    /** Bytes occupied by one frame, padding included. */
    frameLength: number;
    /** PCM samples carried by one frame. */
    samplesPerFrame: number;
}
/** Read a 28-bit ID3v2 syncsafe integer. */
export declare function syncsafe(buffer: Buffer, offset: number): number;
/** Byte offset of the first audio frame, skipping an ID3v2 tag and its footer. */
export declare function firstFrameOffset(buffer: Buffer): number;
/** Parse the 4-byte header at `offset`; undefined when it is not a Layer III frame. */
export declare function parseFrameHeader(buffer: Buffer, offset?: number): FrameFormat | undefined;
/** Whether two chapters were produced with one encoder setting. */
export declare function sameFormat(left: FrameFormat, right: FrameFormat): boolean;
/** How long one frame lasts. */
export declare function frameDurationMs(format: FrameFormat): number;
/** A silent frame reusing `header` (4 bytes), so a gap keeps the same parameters. */
export declare function silentFrame(header: Buffer, format: FrameFormat): Buffer;
/** Duration of a constant-bitrate frame stream, estimated from its byte length. */
export declare function estimateDurationMs(bytes: number, format: FrameFormat): number;
//# sourceMappingURL=mp3-frames.d.ts.map