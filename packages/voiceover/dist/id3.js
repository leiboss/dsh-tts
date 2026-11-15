/**
 * The smallest ID3v2.4 writer a chaptered episode needs.
 *
 * Players show chapters by reading `CHAP`/`CTOC` frames, so one MP3 can behave
 * like a book. Written here instead of pulled in: the tag is a header plus a
 * handful of frames, and the plugin ships without a runtime dependency budget.
 *
 * Text frames use UTF-8 (v2.4 encoding byte 0x03), and every frame size is
 * syncsafe — that is what makes v2.4 tags differ from the v2.3 ones a naive
 * writer produces.
 */
/** 28-bit syncsafe encoding used by the tag header and every v2.4 frame size. */
function syncsafe(value) {
    const size = Math.max(0, Math.min(0x0fffffff, Math.trunc(value)));
    return Buffer.from([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
}
/** One frame with a v2.4 header: id, syncsafe size, empty flags. */
function frame(id, body) {
    return Buffer.concat([Buffer.from(id, 'latin1'), syncsafe(body.length), Buffer.from([0, 0]), body]);
}
/** UTF-8 text frame. */
function textFrame(id, text) {
    return frame(id, Buffer.concat([Buffer.from([0x03]), Buffer.from(text, 'utf8')]));
}
/** Latin-1, NUL-terminated identifier used by `CHAP` and `CTOC`. */
function identifier(text) {
    return Buffer.concat([Buffer.from(text, 'latin1'), Buffer.from([0])]);
}
function uint32(value) {
    const out = Buffer.alloc(4);
    out.writeUInt32BE(Math.max(0, Math.min(0xffffffff, Math.trunc(value))), 0);
    return out;
}
function pictureFrame(mime, data) {
    return frame('APIC', Buffer.concat([Buffer.from([0x03]), identifier(mime), Buffer.from([0x03]), identifier(''), data]));
}
function chapterFrame(chapter) {
    return frame('CHAP', Buffer.concat([
        identifier(chapter.id),
        uint32(chapter.startMs),
        uint32(chapter.endMs),
        uint32(0xffffffff),
        uint32(0xffffffff),
        textFrame('TIT2', chapter.title),
    ]));
}
function tableOfContentsFrame(ids) {
    return frame('CTOC', Buffer.concat([
        identifier('toc'),
        // 0x03 = top level + ordered children.
        Buffer.from([0x03]),
        Buffer.from([Math.min(255, ids.length)]),
        ...ids.map((id) => identifier(id)),
    ]));
}
/** Build a complete tag; no padding, since the writer owns the whole file head. */
export function buildId3v24(input) {
    const frames = [];
    if (input.title !== undefined)
        frames.push(textFrame('TIT2', input.title));
    if (input.artist !== undefined)
        frames.push(textFrame('TPE1', input.artist));
    if (input.album !== undefined)
        frames.push(textFrame('TALB', input.album));
    if (input.year !== undefined)
        frames.push(textFrame('TDRC', input.year));
    if (input.cover !== undefined)
        frames.push(pictureFrame(input.cover.mime, input.cover.data));
    for (const chapter of input.chapters)
        frames.push(chapterFrame(chapter));
    if (input.chapters.length > 0) {
        frames.push(tableOfContentsFrame(input.chapters.map((chapter) => chapter.id)));
    }
    const body = Buffer.concat(frames);
    return Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([0x04, 0x00, 0x00]), syncsafe(body.length), body]);
}
//# sourceMappingURL=id3.js.map