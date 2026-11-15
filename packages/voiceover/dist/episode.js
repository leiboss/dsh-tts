/**
 * Assemble one publishable file from a finished project.
 *
 * For a listener a project is one file with chapter marks, not N loose mp3s: a
 * podcast client shows the chapters, a phone plays it straight through, and the
 * merged subtitles line up without bookkeeping.
 *
 * The merge is a byte-level frame concatenation. Every chapter comes from the
 * same engine, so re-encoding would only lose quality — but mixed parameters
 * (a SAPI fallback next to an Edge chapter) are refused instead of writing a
 * file that plays at the wrong speed.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { estimateDurationMs, firstFrameOffset, frameDurationMs, parseFrameHeader, sameFormat, silentFrame, } from "./audio/mp3-frames.js";
import { buildId3v24 } from "./id3.js";
import { renderFeed } from "./feed.js";
import { normalizeLoudness } from "./loudness.js";
import { formatSrt, parseSrt } from "./subtitle.js";
import { readJson, sha256, writeJsonAtomic } from "./util.js";
/** Silence inserted between chapters when a caller does not ask for one. */
export const DEFAULT_GAP_MS = 300;
/** A failure a caller can act on, carrying its own code. */
export class EpisodeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'EpisodeError';
        this.code = code;
    }
}
/** Filesystem-safe file stem for the episode; never empty, never a device name. */
export function slugify(title) {
    const cleaned = title
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
        .replace(/[. ]+$/g, '');
    if (cleaned.length === 0)
        return 'episode';
    // Windows refuses these as file names even with an extension.
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned) ? `_${cleaned}` : cleaned;
}
/** Read the one episode metadata file a project may hold. */
export async function readEpisodeMetadata(projectDir) {
    const dir = join(projectDir, 'episode');
    let names;
    try {
        names = await readdir(dir);
    }
    catch {
        return undefined;
    }
    const name = names.find((entry) => entry.endsWith('.json') && !entry.startsWith('.'));
    if (name === undefined)
        return undefined;
    const metadata = await readJson(join(dir, name));
    if (metadata === undefined || typeof metadata.audio !== 'string')
        return undefined;
    return {
        metadata,
        audioPath: join(dir, metadata.audio),
        subtitlesPath: metadata.subtitles.length > 0 ? join(dir, metadata.subtitles) : '',
    };
}
/** Read and validate one cover image. */
async function readCover(path) {
    let info;
    try {
        info = await stat(path);
    }
    catch {
        throw new EpisodeError('EPISODE_COVER_INVALID', `Cover not found: ${path}`);
    }
    if (!info.isFile() || info.size === 0 || info.size > 1024 * 1024) {
        throw new EpisodeError('EPISODE_COVER_INVALID', 'Cover must be an image file of at most 1 MiB.');
    }
    const lower = path.toLowerCase();
    const mime = lower.endsWith('.png') ? 'image/png' : /\.jpe?g$/.test(lower) ? 'image/jpeg' : undefined;
    if (mime === undefined)
        throw new EpisodeError('EPISODE_COVER_INVALID', 'Cover must be .jpg, .jpeg or .png.');
    return { mime, data: await readFile(path) };
}
/** Identity of one episode's inputs. */
function fingerprintOf(input, chapters, gapMs, cover) {
    return sha256(JSON.stringify({
        title: input.title,
        author: input.author ?? '',
        gapMs,
        cover: cover === undefined ? '' : sha256(cover.data),
        loudness: input.loudness === true,
        feed: input.feed?.baseUrl ?? '',
        chapters: chapters.map((chapter) => ({
            id: chapter.id,
            durationMs: Math.round(chapter.durationMs),
            audio: chapter.audioPath,
            subtitles: chapter.subtitlesPath ?? '',
        })),
    }));
}
/** Absolute URL for one file inside the episode directory. */
function episodeUrl(baseUrl, fileName) {
    return `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(fileName)}`;
}
/** Write the one-episode feed next to the audio and return its path. */
async function writeEpisodeFeed(options) {
    const xml = renderFeed({
        title: options.title,
        audioUrl: episodeUrl(options.baseUrl, options.audioName),
        bytes: options.bytes,
        durationMs: options.durationMs,
        publishedAt: options.publishedAt,
        ...(options.description === undefined ? {} : { description: options.description }),
        ...(options.link === undefined ? {} : { link: options.link }),
        ...(options.author === undefined ? {} : { author: options.author }),
        ...(options.coverName === undefined
            ? {}
            : { imageUrl: episodeUrl(options.baseUrl, options.coverName) }),
    });
    const feedPath = join(options.dir, 'feed.xml');
    await writeFile(feedPath, xml, 'utf8');
    return feedPath;
}
/** Write one buffer and wait for the stream to accept it. */
function writeAsync(stream, buffer) {
    return new Promise((resolve, reject) => {
        stream.write(buffer, (error) => (error === null || error === undefined ? resolve() : reject(error)));
    });
}
/** Close a stream and wait for it. */
function endAsync(stream) {
    return new Promise((resolve, reject) => {
        stream.end((error) => (error === null || error === undefined ? resolve() : reject(error)));
    });
}
/**
 * Merge the chapters, tag the result and write the sidecar artifacts.
 *
 * Returns the paths rather than serving them: minting a URL is the route
 * owner's job, and this module must stay usable from the CLI and from tests.
 */
export async function buildEpisode(input) {
    const chapters = [...input.chapters].sort((left, right) => left.order - right.order);
    if (chapters.length === 0) {
        throw new EpisodeError('EPISODE_NOT_READY', 'No chapter has audio yet; finish at least one chapter first.');
    }
    const dir = join(input.projectDir, 'episode');
    await mkdir(dir, { recursive: true });
    const slug = slugify(input.title.length > 0 ? input.title : input.projectId);
    const audioPath = join(dir, `${slug}.mp3`);
    const subtitlesPath = join(dir, `${slug}.srt`);
    const metadataPath = join(dir, `${slug}.json`);
    const gapMs = Math.max(0, Math.round(input.gapMs ?? DEFAULT_GAP_MS));
    const cover = input.coverPath === undefined ? undefined : await readCover(input.coverPath);
    const fingerprint = fingerprintOf(input, chapters, gapMs, cover);
    const previous = await readJson(metadataPath);
    if (previous !== undefined && previous.fingerprint === fingerprint) {
        try {
            const info = await stat(audioPath);
            let feedPath = '';
            if (input.feed !== undefined) {
                feedPath = await writeEpisodeFeed({
                    dir,
                    baseUrl: input.feed.baseUrl,
                    ...(input.feed.description === undefined ? {} : { description: input.feed.description }),
                    ...(input.feed.link === undefined ? {} : { link: input.feed.link }),
                    title: previous.title,
                    ...(previous.author === undefined ? {} : { author: previous.author }),
                    durationMs: previous.durationMs,
                    bytes: info.size,
                    publishedAt: previous.createdAt,
                    audioName: previous.audio,
                    ...(previous.cover === undefined ? {} : { coverName: previous.cover }),
                });
            }
            return {
                audioPath,
                subtitlesPath: previous.subtitles.length > 0 ? subtitlesPath : '',
                metadataPath,
                feedPath,
                durationMs: previous.durationMs,
                bytes: info.size,
                chapters: previous.chapters.length,
                loudness: previous.loudness ?? 'skipped',
                warnings: [],
                reused: true,
            };
        }
        catch {
            // The file vanished under us: rebuild instead of reporting a stale episode.
        }
    }
    const partPath = join(dir, `.${slug}.part.mp3`);
    const warnings = [];
    const timeline = [];
    const subtitlesByChapter = new Map();
    for (const chapter of chapters) {
        if (chapter.subtitlesPath !== undefined)
            subtitlesByChapter.set(chapter.id, chapter.subtitlesPath);
    }
    const out = createWriteStream(partPath);
    try {
        let format;
        let cursorMs = 0;
        for (const [index, chapter] of chapters.entries()) {
            const buffer = await readFile(chapter.audioPath);
            const offset = firstFrameOffset(buffer);
            const header = parseFrameHeader(buffer, offset);
            if (header === undefined) {
                throw new EpisodeError('EPISODE_FORMAT_UNSUPPORTED', `${chapter.id}: the audio is not an MP3 frame stream.`);
            }
            if (format === undefined) {
                format = header;
            }
            else if (!sameFormat(format, header)) {
                throw new EpisodeError('EPISODE_FORMAT_UNSUPPORTED', `${chapter.id} is ${header.bitrateKbps} kbps / ${header.sampleRate} Hz / ${header.channels === 1 ? 'mono' : 'stereo'}, but ${format.bitrateKbps} kbps / ${format.sampleRate} Hz / ${format.channels === 1 ? 'mono' : 'stereo'} is required: every chapter must come from one encoder setting.`);
            }
            if (index > 0 && gapMs > 0) {
                const frameMs = frameDurationMs(header);
                const count = Math.max(1, Math.round(gapMs / frameMs));
                const silence = silentFrame(buffer.subarray(offset, offset + 4), header);
                for (let step = 0; step < count; step += 1)
                    await writeAsync(out, silence);
                cursorMs += count * frameMs;
            }
            const audio = buffer.subarray(offset);
            const measured = estimateDurationMs(audio.length, header);
            const declared = chapter.durationMs > 0 ? chapter.durationMs : measured;
            if (chapter.durationMs > 0 && measured > 0 && Math.abs(measured - declared) / declared > 0.02) {
                warnings.push(`${chapter.id}: measured ${Math.round(measured)} ms differs from the recorded ${Math.round(declared)} ms`);
            }
            await writeAsync(out, audio);
            const startMs = Math.round(cursorMs);
            const endMs = Math.round(startMs + declared);
            timeline.push({ id: chapter.id, title: chapter.title, startMs, endMs, durationMs: Math.round(declared) });
            cursorMs = endMs;
        }
        await endAsync(out);
    }
    catch (error) {
        // A failed merge must not leave a half-written temp file behind.
        out.destroy();
        await rm(partPath, { force: true }).catch(() => { });
        throw error;
    }
    // The loudness pass replaces the audio, so it runs before tagging: the tag
    // must describe the bytes that end up in the file.
    let audioSource = partPath;
    let loudness = 'skipped';
    if (input.loudness === true) {
        const normalizedPath = join(dir, `.${slug}.norm.mp3`);
        const outcome = await normalizeLoudness({
            inputPath: partPath,
            outputPath: normalizedPath,
            ...(input.ffmpegPath === undefined ? {} : { ffmpegPath: input.ffmpegPath }),
        });
        if (outcome.applied) {
            audioSource = normalizedPath;
            loudness = 'applied';
        }
        else {
            warnings.push(`loudness skipped: ${outcome.reason ?? 'ffmpeg unavailable'}`);
        }
    }
    const id3Chapters = timeline.map((entry) => ({
        id: entry.id,
        title: entry.title,
        startMs: entry.startMs,
        endMs: entry.endMs,
    }));
    const tag = buildId3v24({
        title: input.title,
        ...(input.author === undefined ? {} : { artist: input.author }),
        album: input.title,
        ...(cover === undefined ? {} : { cover }),
        chapters: id3Chapters,
    });
    const finalStream = createWriteStream(audioPath);
    await writeAsync(finalStream, tag);
    await pipeline(createReadStream(audioSource), finalStream);
    await rm(partPath, { force: true }).catch(() => { });
    if (audioSource !== partPath)
        await rm(audioSource, { force: true }).catch(() => { });
    // Merge the subtitles on the same timeline the tag uses.
    const units = [];
    for (const entry of timeline) {
        const source = subtitlesByChapter.get(entry.id);
        if (source === undefined)
            continue;
        let text;
        try {
            text = await readFile(source, 'utf8');
        }
        catch {
            warnings.push(`${entry.id}: subtitles are recorded but the file is missing`);
            continue;
        }
        for (const unit of parseSrt(text)) {
            units.push({
                text: unit.text,
                startMs: unit.startMs + entry.startMs,
                endMs: unit.endMs + entry.startMs,
            });
        }
    }
    const hasSubtitles = units.length > 0;
    if (hasSubtitles)
        await writeFile(subtitlesPath, formatSrt(units), 'utf8');
    else
        warnings.push('no subtitles were merged: the project has none');
    const info = await stat(audioPath);
    const durationMs = timeline.length > 0 ? (timeline[timeline.length - 1]?.endMs ?? 0) : 0;
    // The cover is also written as a file, so the feed can point at it.
    let coverName;
    if (cover !== undefined) {
        coverName = cover.mime === 'image/png' ? 'cover.png' : 'cover.jpg';
        await writeFile(join(dir, coverName), cover.data);
    }
    const feedName = input.feed === undefined ? undefined : 'feed.xml';
    const metadata = {
        schemaVersion: 1,
        projectId: input.projectId,
        title: input.title,
        ...(input.author === undefined ? {} : { author: input.author }),
        durationMs,
        bytes: info.size,
        gapMs,
        chapters: timeline,
        fingerprint,
        createdAt: new Date().toISOString(),
        audio: `${slug}.mp3`,
        subtitles: hasSubtitles ? `${slug}.srt` : '',
        loudness,
        ...(coverName === undefined ? {} : { cover: coverName }),
        ...(feedName === undefined ? {} : { feed: feedName }),
    };
    await writeJsonAtomic(metadataPath, metadata);
    let feedPath = '';
    if (input.feed !== undefined) {
        feedPath = await writeEpisodeFeed({
            dir,
            baseUrl: input.feed.baseUrl,
            ...(input.feed.description === undefined ? {} : { description: input.feed.description }),
            ...(input.feed.link === undefined ? {} : { link: input.feed.link }),
            title: input.title,
            ...(input.author === undefined ? {} : { author: input.author }),
            durationMs,
            bytes: info.size,
            publishedAt: metadata.createdAt,
            audioName: metadata.audio,
            ...(coverName === undefined ? {} : { coverName }),
        });
    }
    return {
        audioPath,
        subtitlesPath: hasSubtitles ? subtitlesPath : '',
        metadataPath,
        feedPath,
        durationMs,
        bytes: info.size,
        chapters: timeline.length,
        loudness,
        warnings,
        reused: false,
    };
}
//# sourceMappingURL=episode.js.map