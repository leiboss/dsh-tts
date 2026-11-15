/**
 * Frame-level MP3 facts needed to concatenate chapters into one file.
 *
 * The engine already reports a duration; merging needs different facts: where
 * the audio starts after an ID3v2 tag, which header the first frame carries, and
 * how many bytes one silent frame occupies. Pure JS on purpose — an episode must
 * be produced on a machine without ffmpeg.
 */
/** MPEG-1 Layer III bitrates in kbit/s, indexed by the 4-bit field. */
const BITRATE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
/** MPEG-2 and MPEG-2.5 Layer III bitrates. */
const BITRATE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
/** Sample rates by version bits: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5. */
const SAMPLE_RATES = {
    3: [44100, 48000, 32000],
    2: [22050, 24000, 16000],
    0: [11025, 12000, 8000],
};
/** Samples per frame for Layer III, by MPEG version. */
const SAMPLES_PER_FRAME = { 3: 1152, 2: 576, 0: 576 };
function byte(buffer, offset) {
    return buffer[offset] ?? 0;
}
/** Read a 28-bit ID3v2 syncsafe integer. */
export function syncsafe(buffer, offset) {
    return ((byte(buffer, offset) & 0x7f) * 0x200000 +
        (byte(buffer, offset + 1) & 0x7f) * 0x4000 +
        (byte(buffer, offset + 2) & 0x7f) * 0x80 +
        (byte(buffer, offset + 3) & 0x7f));
}
/** Byte offset of the first audio frame, skipping an ID3v2 tag and its footer. */
export function firstFrameOffset(buffer) {
    if (buffer.length < 10)
        return 0;
    if (byte(buffer, 0) !== 0x49 || byte(buffer, 1) !== 0x44 || byte(buffer, 2) !== 0x33)
        return 0;
    const flags = byte(buffer, 5);
    const footer = (flags & 0x10) !== 0 ? 10 : 0;
    return Math.min(buffer.length, 10 + syncsafe(buffer, 6) + footer);
}
/** Parse the 4-byte header at `offset`; undefined when it is not a Layer III frame. */
export function parseFrameHeader(buffer, offset = 0) {
    if (buffer.length < offset + 4)
        return undefined;
    const b1 = byte(buffer, offset);
    const b2 = byte(buffer, offset + 1);
    const b3 = byte(buffer, offset + 2);
    const b4 = byte(buffer, offset + 3);
    if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0)
        return undefined;
    const version = (b2 >> 3) & 0x03;
    const layer = (b2 >> 1) & 0x03;
    if (version === 1 || layer !== 1)
        return undefined;
    const bitrateIndex = (b3 >> 4) & 0x0f;
    const table = version === 3 ? BITRATE_V1_L3 : BITRATE_V2_L3;
    const bitrateKbps = table[bitrateIndex];
    if (bitrateIndex === 0 || bitrateIndex === 0x0f || bitrateKbps === undefined || bitrateKbps === 0)
        return undefined;
    const sampleIndex = (b3 >> 2) & 0x03;
    const sampleRate = SAMPLE_RATES[version]?.[sampleIndex];
    if (sampleIndex === 3 || sampleRate === undefined)
        return undefined;
    const padding = (b3 >> 1) & 0x01;
    const channels = ((b4 >> 6) & 0x03) === 3 ? 1 : 2;
    const samplesPerFrame = SAMPLES_PER_FRAME[version] ?? 1152;
    const frameLength = Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) + padding;
    if (frameLength <= 4)
        return undefined;
    return { version, layer, bitrateKbps, sampleRate, channels, frameLength, samplesPerFrame };
}
/** Whether two chapters were produced with one encoder setting. */
export function sameFormat(left, right) {
    return (left.version === right.version &&
        left.layer === right.layer &&
        left.bitrateKbps === right.bitrateKbps &&
        left.sampleRate === right.sampleRate &&
        left.channels === right.channels);
}
/** How long one frame lasts. */
export function frameDurationMs(format) {
    return (format.samplesPerFrame / format.sampleRate) * 1000;
}
/** A silent frame reusing `header` (4 bytes), so a gap keeps the same parameters. */
export function silentFrame(header, format) {
    const frame = Buffer.alloc(format.frameLength);
    header.copy(frame, 0, 0, Math.min(4, header.length));
    return frame;
}
/** Duration of a constant-bitrate frame stream, estimated from its byte length. */
export function estimateDurationMs(bytes, format) {
    if (bytes <= 0 || format.frameLength <= 0)
        return 0;
    return (bytes / format.frameLength) * frameDurationMs(format);
}
//# sourceMappingURL=mp3-frames.js.map