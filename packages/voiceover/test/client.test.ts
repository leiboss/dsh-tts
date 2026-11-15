import assert from 'node:assert/strict'
import test from 'node:test'

/** Shape of one registered lazy factory. */
interface LoadedModule {
  id: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

let captured: LoadedModule | undefined

/** The client file is a plain script: it needs the loader global before import. */
async function loadClient(reactOverride?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const globals = globalThis as unknown as Record<string, unknown>
  globals.window = {
    __ModuleLoader__: {
      load: (module: LoadedModule) => {
        captured = module
      },
    },
  }
  await import('../client/client.js')
  assert.ok(captured, 'the client bundle must register a factory')
  assert.equal(captured.id, '@leiboss/dsh-voiceover')
  const react = reactOverride ?? {
    createElement: () => null,
    useState: () => [null, () => {}],
    useEffect: () => {},
  }
  return captured.factory((specifier: string) => {
    assert.equal(specifier, 'react')
    return react
  })
}

/** One element produced by the recording React shim. */
interface Element {
  type: unknown
  props: Record<string, unknown>
  children: unknown[]
}

/**
 * Minimal React shim: records elements instead of rendering, and keeps hook
 * slots so a single component call sees stable state.
 */
function recordingReact(): { react: Record<string, unknown>; reset: () => void; remount: () => void } {
  const cells: unknown[] = []
  let cursor = 0
  return {
    reset: () => {
      cursor = 0
    },
    // A remount starts from empty hook cells, which is how one test can render
    // the same component before and after external state changes.
    remount: () => {
      cursor = 0
      cells.length = 0
    },
    react: {
      createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element => ({
        type,
        props: props ?? {},
        children,
      }),
      useState: (initial: unknown) => {
        const index = cursor
        cursor += 1
        if (!(index in cells)) {
          cells[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
        }
        return [cells[index], () => {}]
      },
      useEffect: () => {},
    },
  }
}

/** Flatten a rendered tree into every element node. */
function collect(node: unknown, out: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out)
    return out
  }
  if (typeof node !== 'object' || node === null) return out
  const element = node as Element
  out.push(element)
  for (const child of element.children ?? []) collect(child, out)
  return out
}

test('parses the project id out of a rendered tool result', async () => {
  const client = await loadClient()
  const projectIdFrom = client.projectIdFrom as (blocks: { text?: string }[]) => string | undefined

  assert.equal(
    projectIdFrom([{ text: 'Voiceover project abc123456789 started.\nprojectId: abc123456789' }]),
    'abc123456789',
  )
  assert.equal(projectIdFrom([{ text: 'other output' }]), undefined)
  assert.equal(projectIdFrom([]), undefined)
  // A non-hex token must not be mistaken for a project id.
  assert.equal(projectIdFrom([{ text: 'projectId: ../../../etc' }]), undefined)
})

test('formats chapter durations as m:ss', async () => {
  const client = await loadClient()
  const formatDuration = client.formatDuration as (ms?: number) => string

  assert.equal(formatDuration(61000), '1:01')
  assert.equal(formatDuration(6384), '0:06')
  assert.equal(formatDuration(125000), '2:05')
  assert.equal(formatDuration(undefined), '')
  assert.equal(formatDuration(0), '')
})

test('registers the tool views and the composer dock strip', async () => {
  const client = await loadClient()
  const apply = client.apply as (ctx: unknown) => void
  const registrations: { slot: string; id: string }[] = []

  const ctx = {
    slots: {
      inject: (_name: string, generator: () => Generator<unknown>) => {
        for (const _ of generator()) {
          // Draining the generator is what registers the occupants.
        }
      },
      register: (options: { name: string; key?: string; id?: string }) => {
        registrations.push({ slot: options.name, id: options.key ?? options.id ?? '' })
        return () => {}
      },
    },
  }
  apply(ctx)

  assert.deepEqual(registrations, [
    { slot: 'tool.call.toolview', id: 'voiceover_create' },
    { slot: 'tool.call.toolview', id: 'voiceover_status' },
    // Ambient session state: one player under the composer, not one per Turn.
    { slot: 'conversation.composer.dock', id: 'voiceover-progress' },
  ])
})

test('the result strip mirrors the latest progress and hides when finished', async () => {
  const { react, remount } = recordingReact()
  const client = await loadClient(react)
  const noteProgress = client.noteProgress as (sessionId: unknown, snapshot: unknown) => void
  const subscribeActivity = client.subscribeActivity as (listener: () => void) => () => void
  const Dock = client.VoiceoverStrip as (props: unknown) => unknown

  remount()
  assert.equal(Dock({ sessionId: 'dock-idle' }), null, 'no job means no strip')
  remount()
  assert.equal(Dock({}), null, 'no session means no strip')

  let notifications = 0
  const unsubscribe = subscribeActivity(() => {
    notifications += 1
  })
  const snapshot = { projectId: 'abcdef123456', title: '只写文档', done: 2, total: 5, pending: 3, failed: 0 }
  noteProgress('dock-session', snapshot)
  assert.equal(notifications, 1)
  noteProgress('dock-session', snapshot)
  assert.equal(notifications, 1, 'an unchanged poll must not wake the strip')
  noteProgress('dock-session', { ...snapshot, done: 3 })
  assert.equal(notifications, 2)
  unsubscribe()
  noteProgress('dock-session', { ...snapshot, done: 4 })
  assert.equal(notifications, 2, 'unsubscribing stops notifications')
  // A snapshot without an id (or a missing session) is ignored, not thrown.
  noteProgress('dock-session', {})
  noteProgress(undefined, snapshot)

  const spy = client.__activity as Map<string, unknown>
  assert.ok(spy.has('dock-session'), 'progress reached the shared store')
  remount()
  const tree = Dock({ sessionId: 'dock-session' }) as { props: { role?: string }; children: unknown[] }
  assert.equal(tree.props.role, 'group')
  const rendered = JSON.stringify(tree)
  assert.match(rendered, /只写文档/)
  assert.match(rendered, /4\/5 章/)

  // A finished project still shows: the strip is also the player.
  noteProgress('dock-session', { ...snapshot, done: 5, pending: 0, failed: 0 })
  remount()
  const finished = JSON.stringify(Dock({ sessionId: 'dock-session' }))
  assert.match(finished, /只写文档/)
  assert.match(finished, /5\/5 章/)
  assert.match(finished, /已完成/, 'a finished project must say so')
  assert.doesNotMatch(finished, /章失败/)
  // A full bar in the accent colour reads as an error when the theme is red.
  assert.match(finished, /state-success-primary/)

  // Failures are actionable, so the strip stays and names the count.
  noteProgress('dock-session', { ...snapshot, done: 3, pending: 0, failed: 2 })
  remount()
  const failedTree = JSON.stringify(Dock({ sessionId: 'dock-session' }))
  assert.match(failedTree, /2 章失败/)

  // With a playable chapter the strip is also a player: a control and an audio
  // element whose clock drives the subtitle line.
  noteProgress('dock-session', {
    ...snapshot,
    done: 5,
    total: 5,
    pending: 0,
    failed: 0,
    chapters: [
      {
        id: 'ch-01',
        title: '开场',
        status: 'done',
        durationMs: 1000,
        audioUrl: '/voiceover/audio/ch-01.mp3',
        subtitles: 'audio/ch-01.srt',
      },
    ],
  })
  remount()
  const player = Dock({ sessionId: 'dock-session' }) as Element
  const flat = collect(player)
  const control = flat.find((element) => element.type === 'button')
  assert.equal(control?.props['aria-label'], '播放')
  // Nothing is mounted before the press: a signed URL changes on every poll, so
  // binding it during render would remount the element and stop playback.
  assert.equal(flat.find((element) => element.type === 'audio'), undefined)
  assert.equal(typeof control?.props.onClick, 'function')

  // The clock: the project's total before playback starts.
  assert.match(JSON.stringify(player), /共 0:01/)

  // The cue line reserves its height even with no current cue, so the row does
  // not jump in the gap between two subtitles.
  const cueLine = flat.find((element) => (element.props.style as { minHeight?: string } | undefined)?.minHeight === '1.5em')
  assert.ok(cueLine, 'the cue line always exists')
  // With no cue it carries the status, so the height is stable either way.
  assert.equal(typeof cueLine?.children[0], 'string')
})

test('the strip bar follows the audio clock once nothing is left to generate', async () => {
  const client = await loadClient()
  const stripBar = client.stripBar as (input: Record<string, unknown>) => { mode: string; percent: number }
  const chapter = { id: 'ch-01', status: 'done', durationMs: 1000, audioUrl: '/voiceover/audio/x' }

  // Still generating: the bar is the job's own progress, measured against the
  // planned chapter count rather than the number of records on disk.
  assert.deepEqual(stripBar({ pending: 2, total: 4, chapters: [{ status: 'done' }, { status: 'queued' }] }), {
    mode: 'generate',
    percent: 25,
  })
  // Playing while later chapters still generate: the row is reporting the clock,
  // so the bar must follow it instead of sitting on the job's percentage.
  assert.deepEqual(
    stripBar({ pending: 2, total: 4, chapters: [chapter], player: { durationMs: 1000 }, elapsed: 250, playing: true }),
    { mode: 'playback', percent: 25 },
  )
  // Nothing pending: a full bar next to the play button is what a user reads as
  // a stuck player, so the bar starts empty and follows playback.
  assert.deepEqual(stripBar({ pending: 0, total: 1, chapters: [chapter], player: { durationMs: 1000 } }), {
    mode: 'playback',
    percent: 0,
  })
  assert.deepEqual(
    stripBar({ pending: 0, total: 1, chapters: [chapter], player: { durationMs: 1000 }, elapsed: 500, playing: true }),
    { mode: 'playback', percent: 50 },
  )
  // Never beyond the track, never below it.
  assert.equal(
    stripBar({ pending: 0, total: 1, chapters: [chapter], player: { durationMs: 1000 }, elapsed: 9000 }).percent,
    100,
  )
  assert.equal(stripBar({ pending: 0, total: 1, chapters: [chapter], player: { durationMs: 1000 }, elapsed: -5 }).percent, 0)
  // An unknown duration cannot become a fake position.
  assert.deepEqual(stripBar({ pending: 0, total: 1, chapters: [chapter] }), { mode: 'playback', percent: 0 })
  // No playable chapter: there is nothing to play, so generation stays the subject.
  assert.deepEqual(stripBar({ pending: 0, total: 1, chapters: [{ status: 'failed' }] }), {
    mode: 'generate',
    percent: 100,
  })
})

test('the strip keeps the status out of the subtitle line while playing', async () => {
  const client = await loadClient()
  const stripLine = client.stripLine as (input: Record<string, unknown>) => string

  assert.equal(stripLine({ cue: '第一句', playing: true, status: '已完成 · 15:15:14' }), '第一句')
  // Between two cues the track is empty for a moment. Reusing the line for the
  // status there made "已完成 · 15:15:14" flash between every subtitle.
  assert.equal(stripLine({ cue: '', playing: true, status: '已完成 · 15:15:14' }), '\u00A0')
  // Paused or finished, the row goes back to reporting the job itself.
  assert.equal(stripLine({ cue: '', playing: false, status: '已完成 · 15:15:14' }), '已完成 · 15:15:14')
  assert.equal(stripLine({}), '')
})

test('distinguishes running, done and ended-with-failures', async () => {
  const client = await loadClient()
  const stateWord = client.stateWord as (snapshot: Record<string, unknown>) => string

  assert.equal(
    stateWord({ pending: 2, failed: 0, done: 1, total: 3, chapters: [{ id: 'ch-02', status: 'synthesized' }] }),
    '生成中 · ch-02 合成',
  )
  // 6 done + 2 failed must not read as "still working".
  assert.equal(stateWord({ pending: 0, failed: 2, done: 6, total: 8, chapters: [] }), '已结束 · 2 章失败')
  assert.equal(stateWord({ pending: 0, failed: 0, done: 8, total: 8, chapters: [] }), '已完成')
  assert.equal(stateWord({ pending: 0, failed: 0, done: 0, total: 0, chapters: [] }), '准备中')
})

test('maps pipeline warnings to user sentences and leaves unknown ones readable', async () => {
  const client = await loadClient()
  const warningText = client.warningText as (warning: string) => string

  assert.equal(
    warningText('capability.llm=false: chapters were split by length, no spoken-script adaptation ran'),
    '未配置模型：按原文朗读，未做口语化改写',
  )
  assert.equal(warningText('outline merge failed (Error: boom)'), '章节规划失败，已按长度均分')
  assert.equal(warningText('ch-03: failed with EDGE_TTS_FAILED'), 'ch-03: failed with EDGE_TTS_FAILED')
})

test('treats an unparsable timestamp as unknown instead of fresh', async () => {
  const client = await loadClient()
  const formatClock = client.formatClock as (iso?: string) => string

  assert.equal(formatClock(undefined), '')
  assert.equal(formatClock('1970-01-01T00:00:00.000Z'), '')
  assert.match(formatClock(new Date().toISOString()), /^\d{2}:\d{2}:\d{2}$/)
})

test('renders progress semantics, a live region and a keyboard focus style', async () => {
  const { react, reset } = recordingReact()
  const client = await loadClient(react)
  const seed = client.__seedSnapshot as (id: string, snapshot: unknown) => void
  const panel = client.VoiceoverPanel as (props: unknown) => unknown

  const projectId = 'abcdef123456'
  seed(projectId, {
    projectId,
    title: '接口测试',
    done: 1,
    total: 2,
    pending: 0,
    failed: 1,
    capability: { llm: true, network: true, wordBoundaries: true, timingQuality: 'exact' },
    engine: { name: 'edge-js', voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%' },
    chapters: [
      { id: 'ch-01', order: 1, title: '开头', status: 'done', durationMs: 61000, audioUrl: '/voiceover/audio/x' },
      { id: 'ch-02', order: 2, title: '结尾', status: 'failed', error: 'EDGE_TTS_FAILED' },
    ],
    warnings: [],
    warningCount: 0,
    stateUpdatedAt: new Date().toISOString(),
    servedAt: new Date().toISOString(),
  })
  reset()

  const tree = panel({ phase: 'result', block: { content: [{ text: `projectId: ${projectId}` }] } })
  const nodes = collect(tree)

  const progress = nodes.find((node) => node.props.role === 'progressbar')
  assert.ok(progress, 'the progress bar must expose a role')
  assert.equal(progress.props['aria-valuenow'], 1)
  assert.equal(progress.props['aria-valuemax'], 2)
  assert.match(String(progress.props['aria-valuetext']), /2 章中完成 1 章/)

  assert.ok(
    nodes.some((node) => node.props['aria-live'] === 'polite'),
    'progress changes must be announced',
  )
  assert.ok(
    nodes.some((node) => node.type === 'style' && String(node.children[0]).includes('focus-visible')),
    'keyboard focus must be visible',
  )

  const bulk = nodes.find((node) => node.type === 'button' && node.props.className === 'dsh-vo-btn')
  assert.ok(bulk, 'the retry button is a native, focusable button')
  assert.equal(bulk.props.disabled, false)
})
test('both dictionaries cover exactly the same keys', async () => {
  const client = await loadClient()
  const messages = client.__messages as Record<string, Record<string, string>>
  const zh = Object.keys(messages.zh).sort()
  const en = Object.keys(messages.en).sort()
  assert.deepEqual(en, zh, 'a translation must not drift from the source language')
  for (const key of zh) {
    assert.ok((messages.zh[key] ?? '').length > 0, `zh.${key} is empty`)
    assert.ok((messages.en[key] ?? '').length > 0, `en.${key} is empty`)
  }
})

test('registers both locales under its namespace and follows changes', async () => {
  const client = await loadClient()
  const apply = client.apply as (ctx: unknown) => void

  const registered: string[] = []
  const boundTo: string[] = []
  const slotKeys: string[] = []
  let subscribed = false
  const catalog: Record<string, string> = { 'group.label': 'Voiceover progress' }
  const locale = {
    register(namespace: string, code: string) {
      registered.push(`${namespace}:${code}`)
      return () => {}
    },
    bind(namespace: string) {
      boundTo.push(namespace)
      return (key: string) => catalog[key] ?? key
    },
    getSnapshot() {
      return { active: 'en', locales: [], revision: 1 }
    },
    subscribe() {
      subscribed = true
      return () => {}
    },
  }

  apply({
    get: (key: string) => (key === 'locale' ? locale : undefined),
    slots: {
      inject: (_name: string, generator: () => Generator<unknown>) => {
        for (const _ of generator()) {
          // Drain to run the registrations.
        }
      },
      register: (options: { key?: string; id?: string }) => {
        slotKeys.push(options.key ?? options.id ?? '')
        return () => {}
      },
    },
  })

  assert.deepEqual(registered.sort(), ['voiceover:en', 'voiceover:zh'])
  assert.deepEqual(boundTo, ['voiceover'])
  assert.ok(subscribed, 'the panel follows live locale switches')
  assert.deepEqual(slotKeys, ['voiceover_create', 'voiceover_status', 'voiceover-progress'])
})
test('parses SRT into cues and finds the line at a clock position', async () => {
  const client = await loadClient()
  const parseSrt = client.parseSrt as (text: string) => { startMs: number; endMs: number; text: string }[]
  const cueAt = client.cueAt as (cues: unknown, ms: number) => string

  const cues = parseSrt(
    '1\r\n00:00:00,050 --> 00:00:01,737\r\n第一屏\r\n\r\n2\r\n00:00:02,000 --> 00:00:05,975\r\n第二屏\r\n第二行\r\n',
  )
  assert.equal(cues.length, 2)
  assert.deepEqual(cues[0], { startMs: 50, endMs: 1737, text: '第一屏' })
  assert.equal(cues[1]?.text, '第二屏\n第二行')

  assert.equal(cueAt(cues, 1000), '第一屏')
  assert.equal(cueAt(cues, 1800), '', 'between cues nothing is shown')
  assert.equal(cueAt(cues, 3000), '第二屏\n第二行')

  // Malformed input must not throw or invent cues.
  assert.deepEqual(parseSrt('not a subtitle'), [])
  assert.deepEqual(parseSrt(''), [])
  assert.equal(cueAt(undefined, 0), '')
})
test('the bar follows chapter stages, so one chapter still moves it', async () => {
  const client = await loadClient()
  const progressPercent = client.progressPercent as (chapters: { status: string }[], total?: number) => number

  assert.equal(progressPercent([]), 0)
  assert.equal(progressPercent([{ status: 'queued' }]), 0)
  // A single chapter spends most of its time in synthesis; the bar must show it.
  assert.equal(progressPercent([{ status: 'synthesized' }]), 75)
  assert.equal(progressPercent([{ status: 'timed' }]), 90)
  assert.equal(progressPercent([{ status: 'done' }]), 100)
  assert.equal(progressPercent([{ status: 'done' }, { status: 'synthesized' }]), 88)
  // The denominator is the planned chapter count: one finished chapter of four is
  // a quarter of the job, not a full bar. This is what made the bar sit at 100%.
  assert.equal(progressPercent([{ status: 'done' }], 4), 25)
  assert.equal(progressPercent([{ status: 'done' }, { status: 'queued' }], 4), 25)
  assert.equal(progressPercent([{ status: 'done' }], 1), 100)
})
test('the freshest project wins, whatever polled last', async () => {
  const client = await loadClient()
  const newerProject = client.newerProject as (current: unknown, candidate: unknown) => { projectId: string }
  const older = { projectId: 'aaaa1111', stateUpdatedAt: '2026-11-15T05:50:00.000Z' }
  const fresher = { projectId: 'bbbb2222', stateUpdatedAt: '2026-11-15T06:20:00.000Z' }

  assert.equal(newerProject(older, fresher), fresher)
  // A mounted panel for an old tool call keeps polling its own project; that
  // write must not beat the newer one.
  assert.equal(newerProject(fresher, older), fresher)
  assert.equal(newerProject(null, fresher), fresher)
  assert.equal(newerProject(fresher, {}), fresher)
})

test('a stale panel poll cannot overwrite a newer project in the store', async () => {
  const client = await loadClient()
  const noteProgress = client.noteProgress as (session: string, snapshot: unknown) => void
  const store = client.__activity as Map<string, { projectId: string }>

  noteProgress('freshness', {
    projectId: 'bbbb2222',
    title: 'new',
    done: 1,
    total: 4,
    pending: 3,
    failed: 0,
    stateUpdatedAt: '2026-11-15T06:20:00.000Z',
    chapters: [],
  })
  noteProgress('freshness', {
    projectId: 'aaaa1111',
    title: 'old',
    done: 1,
    total: 1,
    pending: 0,
    failed: 0,
    stateUpdatedAt: '2026-11-15T05:50:00.000Z',
    chapters: [],
  })
  assert.equal(store.get('freshness')?.projectId, 'bbbb2222')
})