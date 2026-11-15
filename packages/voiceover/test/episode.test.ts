import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  estimateDurationMs,
  firstFrameOffset,
  parseFrameHeader,
  sameFormat,
  silentFrame,
} from '../src/audio/mp3-frames.ts'
import { buildId3v24 } from '../src/id3.ts'
import { buildEpisode, EpisodeError, readEpisodeMetadata, slugify } from '../src/episode.ts'
import { projectSnapshot } from '../src/snapshot.ts'
import { parseSrt } from '../src/subtitle.ts'

/** MPEG-2 Layer III, 48 kbps, 24 kHz, mono: 144 bytes per 24 ms frame. */
const HEADER = Buffer.from([0xff, 0xf3, 0x64, 0xc0])
/** Same stream at 96 kbps: 288 bytes per frame, so it must not be concatenated. */
const HEADER_96 = Buffer.from([0xff, 0xf3, 0x84, 0xc0])
const FRAME_MS = 24
const FRAME_BYTES = 144

/** One valid constant-bitrate frame stream. */
function mp3Frames(frames: number, header: Buffer = HEADER, frameBytes: number = FRAME_BYTES): Buffer {
  const frame = Buffer.alloc(frameBytes)
  header.copy(frame)
  return Buffer.concat(Array.from({ length: frames }, () => frame))
}

/** One SRT cue starting at zero. */
function srt(text: string, endMs = 100): string {
  return `1\n00:00:00,000 --> 00:00:00,${String(endMs).padStart(3, '0')}\n${text}\n`
}

test('parses the frame header the episode merge depends on', () => {
  const stream = mp3Frames(3)
  assert.equal(firstFrameOffset(stream), 0)
  const format = parseFrameHeader(stream, 0)
  assert.ok(format)
  assert.equal(format.version, 2, 'MPEG-2')
  assert.equal(format.bitrateKbps, 48)
  assert.equal(format.sampleRate, 24_000)
  assert.equal(format.channels, 1)
  assert.equal(format.samplesPerFrame, 576)
  assert.equal(format.frameLength, FRAME_BYTES)
  assert.equal(estimateDurationMs(stream.length, format), 3 * FRAME_MS)
  const other = parseFrameHeader(mp3Frames(1), 0)
  assert.ok(other && sameFormat(format, other))

  // An ID3v2 tag in front of the audio must be skipped, footer included.
  const tag = buildId3v24({ title: 'x', chapters: [] })
  assert.equal(firstFrameOffset(Buffer.concat([tag, stream])), tag.length)

  assert.equal(parseFrameHeader(Buffer.from('not mp3 at all')), undefined)
})

test('a silent frame keeps the encoder parameters and the frame length', () => {
  const format = parseFrameHeader(mp3Frames(1), 0)
  assert.ok(format)
  const silence = silentFrame(HEADER, format)
  assert.equal(silence.length, FRAME_BYTES)
  assert.deepEqual([...silence.subarray(0, 4)], [...HEADER])
  assert.ok(silence.subarray(4).every((byte) => byte === 0))
})

test('writes a v2.4 tag with one CHAP per chapter and a CTOC table', () => {
  const tag = buildId3v24({
    title: '只写文档',
    artist: 'leiboss',
    album: '只写文档',
    cover: { mime: 'image/jpeg', data: Buffer.from('fake-jpeg') },
    chapters: [
      { id: 'ch-01', title: '开场', startMs: 0, endMs: 240 },
      { id: 'ch-02', title: '判断标准', startMs: 480, endMs: 960 },
    ],
  })
  assert.equal(tag.subarray(0, 3).toString('latin1'), 'ID3')
  assert.equal(tag[3], 0x04, 'version 2.4')
  const declared = (tag[6] ?? 0) * 0x200000 + (tag[7] ?? 0) * 0x4000 + (tag[8] ?? 0) * 0x80 + (tag[9] ?? 0)
  const body = tag.subarray(10)
  assert.equal(body.length, declared, 'the syncsafe size covers exactly the frames')

  const ids: string[] = []
  let at = 0
  while (at + 10 <= body.length) {
    const id = body.subarray(at, at + 4).toString('latin1')
    const size =
      (body[at + 4] ?? 0) * 0x200000 +
      (body[at + 5] ?? 0) * 0x4000 +
      (body[at + 6] ?? 0) * 0x80 +
      (body[at + 7] ?? 0)
    if (!/^[A-Z0-9]{4}$/.test(id) || size <= 0 || at + 10 + size > body.length) break
    ids.push(id)
    at += 10 + size
  }
  assert.deepEqual(ids, ['TIT2', 'TPE1', 'TALB', 'APIC', 'CHAP', 'CHAP', 'CTOC'])
  assert.equal(at, body.length, 'every byte belongs to a frame')
  assert.ok(tag.includes(Buffer.from('ch-01', 'latin1')))
  assert.ok(tag.includes(Buffer.from('开场', 'utf8')))
})

test('merges chapters into one tagged file with a chapter timeline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vo-episode-'))
  const projectDir = join(dir, 'abcdef123456')
  await mkdir(join(projectDir, 'audio'), { recursive: true })
  const ch1 = join(projectDir, 'audio', 'ch-01.mp3')
  const ch2 = join(projectDir, 'audio', 'ch-02.mp3')
  await writeFile(ch1, mp3Frames(10))
  await writeFile(ch2, mp3Frames(20))
  const srt1 = join(projectDir, 'audio', 'ch-01.srt')
  const srt2 = join(projectDir, 'audio', 'ch-02.srt')
  await writeFile(srt1, srt('第一句', 120))
  await writeFile(srt2, srt('第二句', 100))

  const input = {
    projectId: 'abcdef123456',
    projectDir,
    title: '只写文档',
    chapters: [
      { id: 'ch-01', order: 1, title: '开场', audioPath: ch1, durationMs: 10 * FRAME_MS, subtitlesPath: srt1 },
      {
        id: 'ch-02',
        order: 2,
        title: '判断标准',
        audioPath: ch2,
        durationMs: 20 * FRAME_MS,
        subtitlesPath: srt2,
      },
    ],
    gapMs: 240,
  }

  const result = await buildEpisode(input)
  assert.equal(result.chapters, 2)
  assert.equal(result.durationMs, 10 * FRAME_MS + 240 + 20 * FRAME_MS)
  assert.equal(result.reused, false)

  const merged = await readFile(result.audioPath)
  const tagSize = firstFrameOffset(merged)
  assert.ok(tagSize > 0, 'the merged file starts with an ID3 tag')
  assert.equal(merged.length - tagSize, (10 + 10 + 20) * FRAME_BYTES, 'ten gap frames of 24 ms')

  const mergedSrt = parseSrt(await readFile(result.subtitlesPath, 'utf8'))
  assert.deepEqual(
    mergedSrt.map((unit) => ({ text: unit.text, startMs: unit.startMs })),
    [
      { text: '第一句', startMs: 0 },
      { text: '第二句', startMs: 480 },
    ],
  )

  const metadata = await readEpisodeMetadata(projectDir)
  assert.ok(metadata)
  assert.deepEqual(
    metadata.metadata.chapters.map((chapter) => chapter.startMs),
    [0, 480],
  )
  assert.equal(metadata.metadata.bytes, merged.length)

  // The same inputs must not rewrite the file.
  const before = (await stat(result.audioPath)).mtimeMs
  const again = await buildEpisode(input)
  assert.equal(again.reused, true)
  assert.equal((await stat(result.audioPath)).mtimeMs, before)
})

test('refuses chapters that were not produced by one encoder setting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vo-episode-mixed-'))
  const projectDir = join(dir, 'mixed')
  await mkdir(projectDir, { recursive: true })
  const ch1 = join(projectDir, 'a.mp3')
  const ch2 = join(projectDir, 'b.mp3')
  await writeFile(ch1, mp3Frames(2))
  await writeFile(ch2, mp3Frames(2, HEADER_96, 288))

  await assert.rejects(
    buildEpisode({
      projectId: 'mixed',
      projectDir,
      title: 'mixed',
      chapters: [
        { id: 'ch-01', order: 1, title: 'a', audioPath: ch1, durationMs: 48 },
        { id: 'ch-02', order: 2, title: 'b', audioPath: ch2, durationMs: 48 },
      ],
    }),
    (error: unknown) => error instanceof EpisodeError && error.code === 'EPISODE_FORMAT_UNSUPPORTED',
  )
})

test('reports a missing cover instead of writing a tag without one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vo-episode-cover-'))
  const projectDir = join(dir, 'cover')
  await mkdir(projectDir, { recursive: true })
  const ch1 = join(projectDir, 'a.mp3')
  await writeFile(ch1, mp3Frames(2))

  await assert.rejects(
    buildEpisode({
      projectId: 'cover',
      projectDir,
      title: 'cover',
      coverPath: join(projectDir, 'missing.png'),
      chapters: [{ id: 'ch-01', order: 1, title: 'a', audioPath: ch1, durationMs: 48 }],
    }),
    (error: unknown) => error instanceof EpisodeError && error.code === 'EPISODE_COVER_INVALID',
  )
})

test('slugifies titles into safe file stems', () => {
  assert.equal(slugify('只写文档'), '只写文档')
  assert.equal(slugify('a/b:c*d?'), 'a b c d')
  assert.equal(slugify('   '), 'episode')
  assert.equal(slugify('con'), '_con', 'Windows device names are prefixed')
  assert.equal(slugify('x'.repeat(90)).length, 60)
})

test('the panel snapshot exposes an assembled episode with a minted URL', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'vo-episode-snap-'))
  const projectId = 'abcdef123456'
  const projectDir = join(outputDir, projectId)
  await mkdir(join(projectDir, 'audio'), { recursive: true })
  await mkdir(join(projectDir, 'state'), { recursive: true })
  const chapterAudio = join(projectDir, 'audio', 'ch-01.mp3')
  await writeFile(chapterAudio, mp3Frames(10))
  await writeFile(
    join(projectDir, 'state', 'state.json'),
    JSON.stringify({
      projectId,
      sourceHash: 'x',
      promptVersion: 'p1.3',
      engine: { name: 'edge-js', voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%' },
      capability: { llm: false, network: true, wordBoundaries: false, timingQuality: 'exact' },
      style: 'news',
      outline: {
        title: '只写文档',
        chapters: [{ id: 'ch-01', title: '开场', summary: '', sourceRange: [0, 0], estimatedChars: 10, crossRefs: [], note: '' }],
      },
      chapters: [
        {
          id: 'ch-01',
          order: 1,
          title: '开场',
          chars: 10,
          sourceRange: [0, 0],
          status: 'done',
          audio: { path: 'audio/ch-01.mp3', bytes: 10 * FRAME_BYTES, durationMs: 10 * FRAME_MS, timingQuality: 'exact', format: 'mp3' },
        },
      ],
      inputHashes: {},
      warnings: [],
      createdAt: new Date().toISOString(),
    }),
  )

  await buildEpisode({
    projectId,
    projectDir,
    title: '只写文档',
    chapters: [
      { id: 'ch-01', order: 1, title: '开场', audioPath: chapterAudio, durationMs: 10 * FRAME_MS },
    ],
  })

  const snapshot = await projectSnapshot(outputDir, projectId, {
    audioUrlFor: (path) => `/voiceover/audio/${path.split(/[\\/]/).pop() ?? ''}`,
  })
  assert.ok(snapshot?.episode, 'the episode reaches the panel snapshot')
  assert.equal(snapshot.episode.chapters, 1)
  assert.equal(snapshot.episode.path, '只写文档.mp3')
  assert.equal(snapshot.episode.url, '/voiceover/audio/只写文档.mp3')
  assert.equal(snapshot.episode.durationMs, 10 * FRAME_MS)
})
