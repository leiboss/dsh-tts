/**
 * Browser half of the voiceover plugin: a progress panel for the conversation.
 *
 * Why it polls HTTP instead of reading the tool result: a settled
 * `ToolResultNode` exposes only the model-facing text, not the structured
 * return value, and re-invoking the Tool from the UI would fight the
 * conversation. So the panel extracts the project id from the rendered text and
 * polls `GET /voiceover/panel/<projectId>.json`, which the Host half serves
 * from the same `state.json` the pipeline writes.
 *
 * Two rules this file must never break:
 * 1. A registered view REPLACES the generic tool row, so returning null for a
 *    settled result leaves a blank gap. Every result renders something:
 *    progress, an error row, or the raw text.
 * 2. The panel never invents freshness. "Last update" comes from the host's
 *    state-file mtime, so a stalled run looks stalled.
 *
 * Format: the Host serves this file as the `./client` bundle, so it stays in the
 * lazy-CJS module-loader format; executing it only registers the factory.
 */

window.__ModuleLoader__.load({
  id: '@leiboss/dsh-voiceover',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const h = react.createElement

    // ---------------------------------------------------------------- locale

    /** Locale namespace owned by this plugin. */
    const LOCALE_NS = 'voiceover'

    /**
     * Panel copy. Both languages live here so a missing translation cannot
     * happen: the two dictionaries are checked for parity by a unit test, and
     * the translated string is read at call time so switching language
     * re-renders every mounted panel.
     */
    const MESSAGES = {
      zh: {
        'group.label': '有声项目进度',
        'card.title': '有声项目',
        'card.notStarted': '未开始',
        'card.errorTitleStatus': '有声项目查询失败',
        'card.errorTitleCreate': '有声项目创建失败',
        'card.errorNext': '修正后重试；项目已存在时再次运行 voiceover_create 会跳过已完成章节。',
        'card.planning': '规划中…',
        'card.preparing': '准备中…',
        'card.unavailable': '进度不可用',
        'card.preparingHint': '准备中…（首章完成后开始显示进度）',
        'card.unavailableHint': '无法读取进度（面板仅在 Web 宿主可用）',
        'count.progress': '{done}/{total} 章',
        'count.preparing': '准备中',
        'progress.label': '生成进度',
        'progress.value': '{total} 章中完成 {done} 章',
        'progress.playback': '播放进度',
        'progress.played': '已播 {played} / 共 {total}',
        'progress.seek': '点击跳转播放位置',
        'state.runningLeft': '生成中 · 剩 {count} 章',
        'state.runningChapter': '生成中 · {id} {status}',
        'state.endedFailed': '已结束 · {count} 章失败',
        'state.done': '已完成',
        'state.preparing': '准备中',
        'status.queued': '排队',
        'status.adapted': '改写',
        'status.marked': '标注',
        'status.audited': '质检',
        'status.synthesized': '合成',
        'status.timed': '对齐',
        'status.done': '完成',
        'status.failed': '失败',
        'chip.model': '模型 改写',
        'chip.raw': '按原文朗读',
        'chip.voiceEdge': '配音 Edge 在线',
        'chip.voiceLocal': '配音 本地声音',
        'chip.subsPending': '字幕 待生成',
        'chip.subsExact': '字幕 精确时间轴',
        'chip.subsEstimated': '字幕 估算时间轴',
        'label.subtitles': '字幕',
        'queue.waiting': '正在为 {total} 章排队…',
        'queue.planning': '正在规划章节…',
        'audio.label': '{id} 音频',
        'action.play': '播放',
        'action.pause': '暂停',
        'strip.total': '共 {time}',
        'strip.chapter': '{id} · {at}/{total}',
        'action.stop': '停止',
        'action.speed': '播放速度',
        'action.retry': '重试',
        'action.retryAria': '重跑 {id} {title}',
        'action.rerun': '重跑 {count} 章',
        'action.resuming': '正在续跑…',
        'hint.stalled': '超过 60 秒没有进度写入，宿主可能重启过；让我重新运行 voiceover_status 续跑。',
        'hint.allDone': '全部 {done} 章已生成（音频 + 字幕）· 需要文件路径时让我运行 voiceover_export。',
        'hint.moreWarnings': '…还有 {count} 条提醒',
        'meta.updated': '更新于 {time}',
        'dock.title': '有声项目',
        'dock.failed': '{count} 章失败',
        'dock.hint': '详情在对话的工具调用里',
        'warn.llmOff': '未配置模型：按原文朗读，未做口语化改写',
        'warn.outlineMerge': '章节规划失败，已按长度均分',
        'warn.outlineBlock': '部分正文块规划失败，已跳过',
        'warn.highSeverity': '质检发现高危问题，已回炉一次',
        'warn.reasonMissing': '未提供原因',
        'err.EDGE_TTS_FAILED': '配音服务失败，检查网络或代理',
        'err.SYNTHESIS_TIMEOUT': '合成超时，可重试',
        'err.TTS_BUSY': '配音队列繁忙，稍后自动重试',
        'err.SPAWN_EPERM': '沙箱禁止创建子进程，需调整进程策略',
        'err.OUTPUT_DIR_NOT_WRITABLE': '输出目录不可写',
        'err.EMPTY_AUDIO': '返回空音频，可重试',
        'err.LLM_SCHEMA_INVALID': '改写结果不合格，已降级',
        'err.CHAPTER_FAILED': '本章失败，可重新创建续跑',
        'err.UPSTREAM_THROTTLED': '配音服务限流，稍后重试',
        'err.ALL_FALLBACKS_FAILED': '所有配音引擎都失败，检查网络或系统语音',
        'err.ENGINE_UNAVAILABLE': '没有可用的配音引擎',
      },
      en: {
        'group.label': 'Voiceover progress',
        'card.title': 'Voiceover',
        'card.notStarted': 'Not started',
        'card.errorTitleStatus': 'Voiceover lookup failed',
        'card.errorTitleCreate': 'Voiceover creation failed',
        'card.errorNext': 'Fix the input and retry; re-running voiceover_create on an existing project skips finished chapters.',
        'card.planning': 'Planning…',
        'card.preparing': 'Preparing…',
        'card.unavailable': 'Progress unavailable',
        'card.preparingHint': 'Preparing… (progress appears after the first chapter)',
        'card.unavailableHint': 'Cannot read progress (the panel needs the Web host)',
        'count.progress': '{done}/{total} chapters',
        'count.preparing': 'Preparing',
        'progress.label': 'Generation progress',
        'progress.value': '{done} of {total} chapters done',
        'progress.playback': 'Playback progress',
        'progress.played': '{played} of {total} played',
        'progress.seek': 'Click to seek',
        'state.runningLeft': 'Running · {count} left',
        'state.runningChapter': 'Running · {id} {status}',
        'state.endedFailed': 'Ended · {count} failed',
        'state.done': 'Done',
        'state.preparing': 'Preparing',
        'status.queued': 'Queued',
        'status.adapted': 'Adapting',
        'status.marked': 'Prosody',
        'status.audited': 'Auditing',
        'status.synthesized': 'Synthesizing',
        'status.timed': 'Timing',
        'status.done': 'Done',
        'status.failed': 'Failed',
        'chip.model': 'Model rewrite',
        'chip.raw': 'Read as written',
        'chip.voiceEdge': 'Voice Edge online',
        'chip.voiceLocal': 'Voice local',
        'chip.subsPending': 'Subtitles pending',
        'chip.subsExact': 'Subtitles exact timing',
        'chip.subsEstimated': 'Subtitles estimated',
        'label.subtitles': 'subtitles',
        'queue.waiting': 'Queuing {total} chapters…',
        'queue.planning': 'Planning chapters…',
        'audio.label': '{id} audio',
        'action.play': 'Play',
        'action.pause': 'Pause',
        'strip.total': '{time} total',
        'strip.chapter': '{id} · {at}/{total}',
        'action.stop': 'Stop',
        'action.speed': 'Playback speed',
        'action.retry': 'Retry',
        'action.retryAria': 'Retry {id} {title}',
        'action.rerun': 'Retry {count} chapters',
        'action.resuming': 'Resuming…',
        'hint.stalled': 'No progress for over 60 seconds; the host may have restarted. Ask me to run voiceover_status to resume.',
        'hint.allDone': 'All {done} chapters are ready (audio + subtitles). Ask me to run voiceover_export for the file paths.',
        'hint.moreWarnings': '…and {count} more',
        'meta.updated': 'Updated {time}',
        'dock.title': 'Voiceover',
        'dock.failed': '{count} failed',
        'dock.hint': 'Details live in the tool call above',
        'warn.llmOff': 'No model configured: the text was read as written',
        'warn.outlineMerge': 'Chapter planning failed; split by length instead',
        'warn.outlineBlock': 'Some source blocks failed to plan and were skipped',
        'warn.highSeverity': 'The audit found a high-severity issue; one repair round ran',
        'warn.reasonMissing': 'No reason provided',
        'err.EDGE_TTS_FAILED': 'Voice service failed; check the network or proxy',
        'err.SYNTHESIS_TIMEOUT': 'Synthesis timed out; retry',
        'err.TTS_BUSY': 'Voice queue is busy; retrying shortly',
        'err.SPAWN_EPERM': 'The sandbox blocked a subprocess; adjust the process policy',
        'err.OUTPUT_DIR_NOT_WRITABLE': 'The output directory is not writable',
        'err.EMPTY_AUDIO': 'Empty audio returned; retry',
        'err.LLM_SCHEMA_INVALID': 'The rewrite failed validation and was degraded',
        'err.CHAPTER_FAILED': 'This chapter failed; recreate to resume',
        'err.UPSTREAM_THROTTLED': 'The voice service is rate limiting; retry later',
        'err.ALL_FALLBACKS_FAILED': 'Every voice engine failed; check the network or the system voice',
        'err.ENGINE_UNAVAILABLE': 'No voice engine is available',
      },
    }

    /** Locale service, when the client exposes one. */
    let localeService = null
    /** Translate function bound to this plugin's namespace. */
    let translate = null
    /**
     * Active locale id, used when no dictionary was registered. Defaults to the
     * product's primary language; the host locale service overrides it on mount.
     */
    let activeLocale = 'zh'

    const listeners = new Set()

    /** Notify mounted panels that copy may have changed. */
    function emitLocaleChange() {
      for (const listener of listeners) listener()
    }

    /** Subscribe to locale changes; returns the unsubscriber. */
    function subscribeLocale(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    /** Best local fallback dictionary. */
    function dictionary() {
      return /^zh/i.test(activeLocale) ? MESSAGES.zh : MESSAGES.en
    }

    /**
     * Translate one key, with `{name}` interpolation.
     *
     * The host's `t` is consulted first so language packs can override these
     * strings; when it returns the key itself the local dictionary answers.
     */
    function tr(key, params) {
      let text
      if (translate !== null) {
        const value = translate(key)
        if (typeof value === 'string' && value.length > 0 && value !== key) text = value
      }
      if (text === undefined) text = dictionary()[key] ?? MESSAGES.zh[key] ?? key
      if (params !== undefined) {
        for (const name of Object.keys(params)) {
          text = text.split(`{${name}}`).join(String(params[name]))
        }
      }
      return text
    }

    /** Status word from the dictionary, falling back to the raw status. */
    function label(status) {
      const text = tr(`status.${status}`)
      return text === `status.${status}` ? status : text
    }

    /** One-line cause for a chapter error code. */
    function errorText(code) {
      const text = tr(`err.${code}`)
      return text === `err.${code}` ? tr('err.CHAPTER_FAILED') : text
    }

    // ----------------------------------------------------------------- style

    /** Dot color per status; active states share the brand accent. */
    const TONE = {
      done: 'var(--dsw-alias-state-success-primary)',
      failed: 'var(--dsw-alias-state-error-primary)',
      queued: 'var(--dsw-alias-state-idle-primary)',
    }

    /** Font sizes follow the chat scale so a user-adjusted size also applies here. */
    const FONT = 'var(--dsh-content-font-size-secondary, 13px)'
    const FONT_META = 'calc(var(--dsh-content-font-size-secondary, 13px) - 2px)'
    const RADIUS = 'var(--dsw-radius-md, 10px)'

    /** Keyboard focus for the panel's own buttons; rendered as a style node. */
    const FOCUS_CSS =
      '.dsh-vo-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}'

    const S = {
      card: {
        width: '100%',
        display: 'grid',
        gap: 8,
        padding: '10px 12px',
        borderRadius: RADIUS,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: FONT,
        boxSizing: 'border-box',
        overflow: 'hidden',
      },
      header: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
      title: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      count: { flex: 'none', fontSize: FONT_META, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' },
      // A white-on-white track is invisible; the neutral step is the same in every theme.
      track: {
        height: 6,
        borderRadius: 999,
        background: 'var(--dsw-static-neutral-bluish-100, #ebeef2)',
        overflow: 'hidden',
      },
      fill: {
        height: '100%',
        borderRadius: 999,
        background: 'var(--dsw-alias-brand-primary)',
        transition: 'width 240ms ease',
      },
      state: { fontSize: FONT_META, color: 'var(--dsw-alias-label-secondary)' },
      chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
      chip: {
        fontSize: FONT_META,
        lineHeight: '18px',
        padding: '0 6px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
      list: { display: 'grid', gap: 2, maxHeight: 260, overflowY: 'auto' },
      row: { display: 'grid', gridTemplateColumns: '8px 1fr auto auto', alignItems: 'center', gap: 8, minHeight: 22 },
      dot: { width: 8, height: 8, borderRadius: 999 },
      rowTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      meta: {
        fontSize: FONT_META,
        color: 'var(--dsw-alias-label-secondary)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        maxWidth: 160,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      warn: { fontSize: FONT_META, color: 'var(--dsw-alias-state-warn-primary)', overflowWrap: 'anywhere' },
      error: { fontSize: FONT_META, color: 'var(--dsw-alias-state-error-primary)', overflowWrap: 'anywhere' },
      footer: { fontSize: FONT_META, color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap' },
      mono: { fontVariantNumeric: 'tabular-nums', userSelect: 'all' },
      playBtn: {
        width: 18,
        height: 18,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        cursor: 'pointer',
        fontSize: FONT_META,
        lineHeight: '18px',
      },
      playerWrap: { display: 'grid', gap: 4 },
      player: { width: '100%', height: 32 },
      cue: {
        fontSize: FONT,
        lineHeight: 1.5,
        minHeight: '1.5em',
        color: 'var(--dsw-alias-label-primary)',
        overflowWrap: 'anywhere',
      },
      retryBtn: {
        fontSize: FONT_META,
        padding: '0 6px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        cursor: 'pointer',
      },
      actions: { display: 'flex', gap: 8 },
      action: {
        fontSize: FONT_META,
        padding: '2px 10px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        cursor: 'pointer',
      },
      // Dock strip under the composer: one line, always visible while a job runs.
      strip: {
        display: 'grid',
        gap: 4,
        padding: '6px 10px',
        borderRadius: RADIUS,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        fontSize: FONT_META,
        color: 'var(--dsw-alias-label-secondary)',
        width: '100%',
        boxSizing: 'border-box',
      },
      stripRow: { display: 'flex', alignItems: 'center', gap: 8 },
      stripPlay: {
        flex: 'none',
        width: 22,
        height: 22,
        padding: 0,
        border: 'none',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        cursor: 'pointer',
        fontSize: FONT_META,
        lineHeight: '22px',
      },
      stripAudio: { display: 'none' },
      stripRate: {
        flex: 'none',
        minWidth: 36,
        padding: '0 4px',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontSize: FONT_META,
        fontVariantNumeric: 'tabular-nums',
      },
      stripFail: { padding: '4px 8px', fontSize: FONT_META, color: 'var(--dsw-alias-state-error-primary)' },
      stripCue: {
        fontSize: FONT,
        lineHeight: 1.5,
        minHeight: '1.5em',
        color: 'var(--dsw-alias-label-primary)',
        overflowWrap: 'anywhere',
      },
      stripDot: { width: 6, height: 6, borderRadius: 999, background: 'var(--dsw-alias-brand-primary)', flex: 'none' },
      stripTitle: {
        color: 'var(--dsw-alias-label-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 180,
      },
      stripCount: { whiteSpace: 'nowrap' },
      stripTime: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
      stripTrack: {
        flex: 1,
        height: 4,
        borderRadius: 999,
        background: 'var(--dsw-static-neutral-bluish-100, #ebeef2)',
        overflow: 'hidden',
      },
      stripFill: { height: '100%', background: 'var(--dsw-alias-brand-primary)' },
      // In this slot the bar is either a job indicator or the player's timeline.
      // A timeline is a control, so it is taller and clickable.
      stripTrackTimeline: { height: 6, cursor: 'pointer' },
      stripFailed: { color: 'var(--dsw-alias-state-error-primary)', whiteSpace: 'nowrap' },
      stripHint: { whiteSpace: 'nowrap', opacity: 0.7 },
    }

    // ------------------------------------------------------------------ data

    /** Stable token emitted by `voiceover_create` and `voiceover_status`. */
    const PROJECT_ID = /projectId:\s*([0-9a-f]{8,24})/i

    // Cross-mount cache: scrolling a row out of view and back must not flash a
    // loading card, and several status rows for one project share progress.
    const snapshots = new Map()
    const inFlight = new Map()

    /**
     * Latest progress per session, mirrored from the panel's own polls.
     *
     * The comic strip under the composer reads this instead of fetching again:
     * one poller, two surfaces. Keyed by session because a conversation must not
     * show another session's job.
     */
    const activity = new Map()
    const activityListeners = new Set()

    /** Notify dock strips; returns the unsubscriber. */
    function subscribeActivity(listener) {
      activityListeners.add(listener)
      return () => activityListeners.delete(listener)
    }

    /** Record one project's progress for a session, skipping no-op updates. */
    function noteProgress(sessionId, snapshot) {
      if (typeof sessionId !== 'string' || typeof snapshot?.projectId !== 'string') return
      const entry = {
        projectId: snapshot.projectId,
        title: snapshot.title,
        done: snapshot.done,
        total: snapshot.total,
        pending: snapshot.pending,
        failed: snapshot.failed,
        stateUpdatedAt: snapshot.stateUpdatedAt,
        // Chapters travel with the counts so the strip can offer playback without
        // a second request when the panel is the one that saw the snapshot first.
        chapters: Array.isArray(snapshot.chapters) ? snapshot.chapters : [],
      }
      const current = activity.get(sessionId)
      if (
        current !== undefined &&
        current.projectId === entry.projectId &&
        current.done === entry.done &&
        current.pending === entry.pending &&
        current.failed === entry.failed
      ) {
        return
      }
      // A mounted panel for an older tool call keeps polling its own project; its
      // writes must not overwrite a newer project in the same session.
      if (current !== undefined && newerProject(current, entry) === current) return
      activity.set(sessionId, entry)
      for (const listener of activityListeners) listener()
    }

    /**
     * The newer of two project snapshots, by the host's state timestamp.
     *
     * Timestamps come from the state file's mtime, so they order projects by real
     * activity rather than by which surface happened to poll last.
     */
    function newerProject(current, candidate) {
      if (candidate === null || candidate === undefined) return current
      if (typeof candidate.projectId !== 'string') return current
      if (current === null || current === undefined) return candidate
      if (current.projectId === candidate.projectId) return candidate
      const a = Date.parse(current.stateUpdatedAt ?? '') || 0
      const b = Date.parse(candidate.stateUpdatedAt ?? '') || 0
      return b >= a ? candidate : current
    }


    /** Test-only: seed the shared cache so a render test starts from a settled card. */
    function __seedSnapshot(projectId, snapshot) {
      snapshots.set(projectId, snapshot)
    }

    /**
     * Concatenate the model-facing text of a result.
     * @param {{ text?: string }[] | undefined} blocks
     * @returns {string}
     */
    function blocksText(blocks) {
      if (!Array.isArray(blocks)) return ''
      let text = ''
      for (const block of blocks) {
        if (typeof block === 'object' && block !== null && typeof block.text === 'string') {
          text += `${block.text}\n`
        }
      }
      return text
    }

    /**
     * Pull the project id out of a rendered tool result.
     * @param {{ text?: string }[] | undefined} blocks
     * @returns {string | undefined}
     */
    function projectIdFrom(blocks) {
      const match = PROJECT_ID.exec(blocksText(blocks))
      return match === null ? undefined : match[1]
    }

    /** `m:ss` for a chapter duration; empty when unknown. */
    function formatDuration(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return ''
      const total = Math.round(ms / 1000)
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
    }

    /** `HH:MM:SS` in the viewer's clock, or empty for an unknown timestamp. */
    function formatClock(iso) {
      if (typeof iso !== 'string') return ''
      const time = Date.parse(iso)
      if (!Number.isFinite(time) || time <= 0) return ''
      const date = new Date(time)
      return [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map((part) => String(part).padStart(2, '0'))
        .join(':')
    }

    /** Parse one SRT timestamp (`HH:MM:SS,mmm`) into milliseconds. */
    function parseTime(value) {
      const match = /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/.exec(String(value ?? '').trim())
      if (match === null) return NaN
      return Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(match[4])
    }

    /**
     * Parse an SRT document into cues.
     * @param {string} text
     * @returns {{ startMs: number, endMs: number, text: string }[]}
     */
    function parseSrt(text) {
      const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
      if (normalized.length === 0) return []
      const cues = []
      for (const block of normalized.split('\n\n')) {
        const lines = block.split('\n')
        const timeIndex = lines.findIndex((line) => line.includes('-->'))
        if (timeIndex < 0) continue
        const [startRaw, endRaw] = (lines[timeIndex] ?? '').split('-->').map((part) => part.trim())
        const startMs = parseTime(startRaw)
        const endMs = parseTime(endRaw)
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
        const text2 = lines.slice(timeIndex + 1).join('\n').trim()
        if (text2.length > 0) cues.push({ startMs, endMs, text: text2 })
      }
      return cues
    }

    /** The cue visible at `ms`, or an empty string between cues. */
    function cueAt(cues, ms) {
      if (!Array.isArray(cues)) return ''
      for (const cue of cues) {
        if (ms >= cue.startMs && ms < cue.endMs) return cue.text
      }
      return ''
    }
    /** Translate the pipeline's warning strings into one user sentence. */
    function warningText(warning) {
      const text = typeof warning === 'string' ? warning : String(warning)
      if (text.startsWith('capability.llm=false')) return tr('warn.llmOff')
      if (text.startsWith('outline merge failed')) return tr('warn.outlineMerge')
      if (text.startsWith('outline block')) return tr('warn.outlineBlock')
      if (text.includes('high-severity')) return tr('warn.highSeverity')
      return text.length > 80 ? `${text.slice(0, 80)}…` : text
    }

    /** Whether a settled result represents a failed call. */
    function isErrorResult(block) {
      if (typeof block !== 'object' || block === null) return false
      if (block.isError === true) return true
      return typeof block.error === 'object' && block.error !== null
    }

    /** Best-effort reason for a failed call, from `error` or the rendered text. */
    function errorMessage(block) {
      const error = block?.error
      if (typeof error === 'string' && error.length > 0) return error
      if (typeof error === 'object' && error !== null) {
        const reason = error.reason ?? error.message ?? error.code
        if (typeof reason === 'string' && reason.length > 0) return reason
      }
      const text = blocksText(block?.content).trim()
      return text.length > 0 ? text.slice(0, 240) : tr('warn.reasonMissing')
    }

    /** Derived run state; distinguishes "running" from "ended with failures". */
    function stateWord(snapshot) {
      if (snapshot.pending > 0) {
        const active = snapshot.chapters.find(
          (chapter) => chapter.status !== 'queued' && chapter.status !== 'done' && chapter.status !== 'failed',
        )
        const next = snapshot.chapters.find((chapter) => chapter.status === 'queued')
        const current = active ?? next
        return current === undefined
          ? tr('state.runningLeft', { count: snapshot.pending })
          : tr('state.runningChapter', { id: current.id, status: label(current.status) })
      }
      if (snapshot.failed > 0) return tr('state.endedFailed', { count: snapshot.failed })
      if (snapshot.total > 0 && snapshot.done === snapshot.total) return tr('state.done')
      return tr('state.preparing')
    }

    /**
     * Progress through each chapter's stages, not just finished chapters.
     *
     * A one-chapter job spends minutes inside synthesis, so a bar driven only by
     * "done chapters / total" sits at 0 until it jumps to 100. The pipeline
     * records the stage per chapter, so that is what the bar reflects.
     */
    const STAGE_WEIGHT = { queued: 0, adapted: 0.2, marked: 0.35, audited: 0.5, synthesized: 0.75, timed: 0.9, done: 1, failed: 1 }

    /**
     * Integer percent of the job done, weighting each chapter by its stage.
     *
     * The denominator is the project's chapter count, not the number of chapter
     * records: a run that has finished one chapter of eight has one record, and
     * dividing by that record count reported 100% while seven were still queued.
     */
    function progressPercent(chapters, total) {
      if (!Array.isArray(chapters) || chapters.length === 0) return 0
      const denominator = Math.max(chapters.length, typeof total === 'number' ? total : 0)
      let sum = 0
      for (const chapter of chapters) sum += STAGE_WEIGHT[chapter?.status] ?? 0
      return Math.max(0, Math.min(100, Math.round((sum / denominator) * 100)))
    }

    /**
     * What the strip's thin bar shows right now.
     *
     * While chapters are still pending the bar is the job's progress -- unless
     * audio is actually playing, in which case the clock is what the row is
     * reporting. Once nothing is pending the bar is always the player's
     * timeline; leaving a full bar next to the play button reads as a stuck
     * player, which is how this row was reported.
     *
     * @param {{ pending?: number, total?: number, chapters?: unknown[], player?: unknown, elapsed?: number | null, playing?: boolean }} input
     * @returns {{ mode: 'generate' | 'playback', percent: number }}
     */
    function stripBar(input) {
      const pending = typeof input?.pending === 'number' ? input.pending : 0
      const total = typeof input?.total === 'number' ? input.total : 0
      const chapters = Array.isArray(input?.chapters) ? input.chapters : []
      const player = input?.player ?? null
      const elapsed = typeof input?.elapsed === 'number' ? input.elapsed : 0
      const playing = input?.playing === true
      const playable = chapters.some(
        (chapter) => typeof chapter?.audioUrl === 'string' && chapter.audioUrl.length > 0,
      )
      const jobDone = pending <= 0
      if (!playable || (!jobDone && !playing)) {
        return { mode: 'generate', percent: total > 0 ? progressPercent(chapters, total) : 0 }
      }
      const durationMs = typeof player?.durationMs === 'number' ? player.durationMs : 0
      const percent = durationMs > 0 ? Math.max(0, Math.min(100, (elapsed / durationMs) * 100)) : 0
      return { mode: 'playback', percent }
    }

    /**
     * The strip's second line: the current subtitle, else the job's own words.
     *
     * Between two cues a subtitle track is empty for a moment. Falling back to
     * the status there made "已完成 · 15:15" flash between every line while the
     * audio played, so during playback the line is reserved instead of reused.
     *
     * @param {{ cue?: string, playing?: boolean, status?: string }} input
     * @returns {string}
     */
    function stripLine(input) {
      const cue = typeof input?.cue === 'string' ? input.cue : ''
      if (cue.length > 0) return cue
      if (input?.playing === true) return '\u00A0'
      return typeof input?.status === 'string' ? input.status : ''
    }

    /** Playback speeds the strip cycles through. */
    const PLAYBACK_RATES = [1, 1.25, 1.5, 2]

    /** Playable chapters in reading order. */
    function playableChapters(chapters) {
      if (!Array.isArray(chapters)) return []
      return chapters
        .filter((chapter) => typeof chapter?.audioUrl === 'string' && chapter.audioUrl.length > 0)
        .slice()
        .sort(
          (left, right) =>
            (typeof left?.order === 'number' ? left.order : 0) -
            (typeof right?.order === 'number' ? right.order : 0),
        )
    }

    /** The next book position, or -1 when the last chapter has finished. */
    function nextPlaybackIndex(index, count) {
      if (!Number.isInteger(count) || count <= 0) return -1
      const next = (Number.isInteger(index) ? index : -1) + 1
      return next >= 0 && next < count ? next : -1
    }

    /** localStorage key holding one project's listening position. */
    function positionKey(projectId) {
      return `voiceover:pos:${String(projectId ?? '')}`
    }

    /** Stored `{index, ms}`, or null when absent or unreadable. */
    function readPosition(projectId) {
      try {
        if (typeof localStorage === 'undefined') return null
        const raw = localStorage.getItem(positionKey(projectId))
        if (typeof raw !== 'string') return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        const index = Number(parsed.index)
        const ms = Number(parsed.ms)
        if (!Number.isInteger(index) || index < 0 || !Number.isFinite(ms) || ms <= 0) return null
        return { index, ms }
      } catch {
        return null
      }
    }

    /** Persist the listening position; a disabled storage must not break playback. */
    function storePosition(projectId, index, ms) {
      try {
        if (typeof localStorage === 'undefined') return
        if (!Number.isInteger(index) || index < 0 || !Number.isFinite(ms) || ms <= 0) return
        localStorage.setItem(positionKey(projectId), JSON.stringify({ index, ms: Math.round(ms) }))
      } catch {
        // Private mode or a full quota: leaving the position unremembered is fine.
      }
    }

    /** Next speed in the cycle. */
    function nextRate(rate) {
      const at = PLAYBACK_RATES.indexOf(rate)
      return PLAYBACK_RATES[(at + 1) % PLAYBACK_RATES.length] ?? 1
    }
    /** One capability pill. Neutral by default: a fallback is a mode, not a fault. */
    function chip(text) {
      return h('span', { key: text, style: S.chip }, text)
    }

    /** One chapter row. */
    function ChapterRow(props) {
      const chapter = props.chapter
      const playable = typeof chapter.audioUrl === 'string' && chapter.audioUrl.length > 0
      const tone = TONE[chapter.status] ?? 'var(--dsw-alias-brand-primary)'
      const duration = formatDuration(chapter.durationMs)
      const meta =
        chapter.error === undefined
          ? [label(chapter.status), duration, chapter.subtitles === undefined ? '' : tr('label.subtitles')]
              .filter(Boolean)
              .join(' · ')
          : errorText(chapter.error)
      return h(
        'div',
        { style: S.row, role: 'listitem', title: chapter.error ?? undefined },
        h('span', { style: { ...S.dot, background: tone } }),
        h('span', { style: S.rowTitle }, `${chapter.id} ${chapter.title}`),
        h(
          'span',
          { style: chapter.error === undefined ? S.meta : { ...S.meta, color: 'var(--dsw-alias-state-error-primary)' } },
          meta,
        ),
        chapter.status === 'failed'
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-vo-btn',
                style: S.retryBtn,
                'aria-label': tr('action.retryAria', { id: chapter.id, title: chapter.title }),
                disabled: props.retrying,
                onClick: () => props.onRetry(chapter),
              },
              props.retrying ? '…' : tr('action.retry'),
            )
          : playable
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-vo-btn',
                  'aria-pressed': props.playing,
                  style: S.playBtn,
                  'aria-label': `${props.playing ? tr('action.stop') : tr('action.play')} ${chapter.id} ${chapter.title}`,
                  onClick: () => props.onPlay(chapter),
                },
                props.playing ? '■' : '▶',
              )
            : h('span'),
      )
    }

    /** A failed call: never render nothing, the generic row is replaced. */
    function ErrorCard(props) {
      return h(
        'div',
        { style: S.card, role: 'status' },
        h(
          'div',
          { style: S.header },
          h('span', { style: S.title }, props.title),
          h('span', { style: S.count }, tr('card.notStarted')),
        ),
        h('div', { style: S.error }, props.reason),
        h('div', { style: S.state }, props.next),
      )
    }

    /** Compact row for the phases before a result exists. */
    function PendingCard(props) {
      return h(
        'div',
        { style: S.card, role: 'status' },
        h(
          'div',
          { style: S.header },
          h('span', { style: S.title }, tr('card.title')),
          h('span', { style: S.count }, props.label),
        ),
      )
    }

    /**
     * Progress panel for one voiceover project.
     *
     * Hooks run before any early return so the hook order never changes.
     * @param {{ phase?: string, block?: unknown, toolName?: string }} props
     */
    function VoiceoverPanel(props) {
      const phase = props?.phase
      const block = props?.block
      const isResult = phase === 'result' || phase === undefined
      const failed = isResult && isErrorResult(block)
      const id = isResult && !failed ? projectIdFrom(/** @type {{ text?: string }[]} */ (block)?.content) : undefined

      const [snap, setSnap] = react.useState(() => (id === undefined ? null : (snapshots.get(id) ?? null)))
      const [problem, setProblem] = react.useState(null)
      // One player, not one per chapter: a 20-chapter project must not mount 20
      // audio elements, and the URL is stored at click time so a snapshot
      // refresh cannot restart playback.
      const [playing, setPlaying] = react.useState(null)
      // Subtitles for the chapter currently playing, and the line at its clock.
      const [cues, setCues] = react.useState([])
      const [cue, setCue] = react.useState('')
      // Bumping this restarts the polling effect, which is how the rerun button
      // gets fresh progress without a second fetch path.
      const [nonce, setNonce] = react.useState(0)
      const [busy, setBusy] = react.useState(false)
      // Which chapter is being retried; one at a time keeps the UI honest.
      const [retrying, setRetrying] = react.useState(null)
      // Re-render when the active locale changes; the copy is read at call time.
      const [, forceLocale] = react.useState(0)

      react.useEffect(
        () => subscribeLocale(() => forceLocale((value) => value + 1)),
        [],
      )

      react.useEffect(() => {
        if (id === undefined) return undefined
        let stopped = false
        let timer
        let attempts = 0
        const schedule = (delay) => {
          if (!stopped) timer = setTimeout(tick, delay)
        }
        const tick = async () => {
          try {
            // Several panels for one project share a single request.
            let request = inFlight.get(id)
            if (request === undefined) {
              request = fetch(`/voiceover/panel/${id}.json`, { credentials: 'same-origin', cache: 'no-store' })
              inFlight.set(id, request)
              request.finally(() => inFlight.delete(id)).catch(() => {})
            }
            const res = await request
            if (res.status === 404) {
              // The project exists but has not written state yet (planning or
              // the first chapter). That is a wait, not a broken endpoint.
              if (!stopped) {
                attempts = 0
                setProblem(null)
                schedule(2000)
              }
              return
            }
            if (!res.ok) {
              if (!stopped) {
                attempts += 1
                if (attempts >= 5) {
                  setProblem('unavailable')
                  return
                }
                setProblem('retrying')
                schedule(Math.min(30000, 2000 * 2 ** (attempts - 1)))
              }
              return
            }
            const next = await res.json()
            if (stopped) return
            attempts = 0
            setProblem(null)
            setSnap(next)
            snapshots.set(id, next)
            noteProgress(props?.sessionId, next)
            // Running projects poll fast; a project that ended with failures
            // polls slowly so a requested rerun becomes visible.
            if (next.pending > 0) schedule(2000)
            else if (next.failed > 0) schedule(10000)
          } catch {
            if (stopped) return
            attempts += 1
            if (attempts >= 5) {
              setProblem('unavailable')
              return
            }
            setProblem('retrying')
            schedule(Math.min(30000, 2000 * 2 ** (attempts - 1)))
          }
        }
        tick()
        return () => {
          stopped = true
          clearTimeout(timer)
        }
      }, [id, nonce])

      if (failed) {
        return h(ErrorCard, {
          title: props?.toolName === 'voiceover_status' ? tr('card.errorTitleStatus') : tr('card.errorTitleCreate'),
          reason: errorMessage(block),
          next: tr('card.errorNext'),
        })
      }
      if (!isResult) return h(PendingCard, { label: tr('card.planning') })
      if (id === undefined) {
        // A real but unrecognized result: show its text rather than a blank gap.
        const text = blocksText(/** @type {{ text?: string }[]} */ (block)?.content).trim()
        if (text.length === 0) return null
        return h(
          'div',
          { style: S.card },
          h('div', { style: S.title }, tr('card.title')),
          h('div', { style: S.state }, text.slice(0, 400)),
        )
      }

      if (snap === null) {
        return h(PendingCard, {
          label: problem === 'unavailable' ? tr('card.unavailable') : tr('card.preparing'),
        })
      }

      const total = typeof snap.total === 'number' ? snap.total : 0
      const done = typeof snap.done === 'number' ? snap.done : 0
      const failedCount = typeof snap.failed === 'number' ? snap.failed : 0
      const pending = typeof snap.pending === 'number' ? snap.pending : 0
      const chapters = Array.isArray(snap.chapters) ? snap.chapters : []
      // Stage-weighted over the planned chapter count, so one finished chapter of
      // eight reads as 12% and not as a full bar.
      const pct = total > 0 ? progressPercent(chapters, total) : 0
      const warnings = Array.isArray(snap.warnings) ? snap.warnings : []
      const warningTotal = typeof snap.warningCount === 'number' ? snap.warningCount : warnings.length
      const capability = snap.capability ?? {}
      const engine = snap.engine ?? {}
      const clock = formatClock(snap.stateUpdatedAt)
      const stalled =
        pending > 0 && typeof snap.stateUpdatedAt === 'string' && Date.now() - Date.parse(snap.stateUpdatedAt) > 60000
      const finished = total > 0 && pending === 0 && failedCount === 0 && done === total
      const voice = engine.name === 'sapi' ? tr('chip.voiceLocal') : tr('chip.voiceEdge')
      const subtitles =
        capability.timingQuality === 'none'
          ? tr('chip.subsPending')
          : capability.timingQuality === 'exact'
            ? tr('chip.subsExact')
            : tr('chip.subsEstimated')

      // Same operation the `voiceover_rerun` Tool calls; this is only the
      // transport. Bumping `nonce` restarts the poller so progress resumes.
      const rerun = async () => {
        if (busy) return
        setBusy(true)
        try {
          const res = await fetch(`/voiceover/panel/${id}/rerun`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          if (res.ok) setNonce((value) => value + 1)
        } catch {
          // A dead host is already reported by the poller; leave the button.
        } finally {
          setBusy(false)
        }
      }

      /**
       * Play or stop one chapter, and load its subtitles.
       *
       * The panel is the only place these subtitles are visible: a sidecar
       * `.srt` is invisible in Windows' built-in player and in an <audio>
       * element, so the current line is rendered here instead.
       */
      const playChapter = async (chapter) => {
        if (playing !== null && playing.id === chapter.id) {
          setPlaying(null)
          setCue('')
          return
        }
        setPlaying({ id: chapter.id, url: chapter.audioUrl })
        setCue('')
        setCues([])
        if (chapter.subtitles === undefined) return
        try {
          const res = await fetch(`/voiceover/panel/${id}/subtitles/${chapter.id}`, {
            credentials: 'same-origin',
            cache: 'no-store',
          })
          if (res.ok) setCues(parseSrt(await res.text()))
        } catch {
          // Without subtitles the player still works; the line simply stays empty.
        }
      }
      // Per-chapter retry: the same route, narrowed to one chapter. The Tool
      // reaches the same operation through `voiceover_rerun({ chapter })`.
      const retryChapter = async (chapter) => {
        if (retrying !== null) return
        setRetrying(chapter.id)
        try {
          const res = await fetch(`/voiceover/panel/${id}/rerun`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chapter: chapter.id }),
          })
          if (res.ok) setNonce((value) => value + 1)
        } catch {
          // A dead host is already reported by the poller.
        } finally {
          setRetrying(null)
        }
      }

      return h(
        'div',
        { style: S.card, role: 'group', 'aria-label': tr('group.label') },
        h('style', { key: 'vo-a11y' }, FOCUS_CSS),
        h(
          'div',
          { style: S.header },
          h('span', { style: S.title }, snap.title || tr('card.title')),
          // The visual count is decorative; the live region below carries the
          // same fact for a screen reader without double-announcing.
          h(
            'span',
            { style: S.count, 'aria-hidden': 'true' },
            total > 0 ? tr('count.progress', { done, total }) : tr('count.preparing'),
          ),
        ),
        h(
          'div',
          {
            role: 'progressbar',
            'aria-label': tr('progress.label'),
            'aria-valuemin': 0,
            'aria-valuemax': Math.max(1, total),
            'aria-valuenow': done,
            'aria-valuetext': total > 0 ? tr('progress.value', { done, total }) : tr('count.preparing'),
            style: S.track,
          },
          h('div', { style: { ...S.fill, width: `${pct}%` } }),
        ),
        h(
          'div',
          { style: S.state, 'aria-live': 'polite' },
          stateWord({ ...snap, chapters, pending, failed: failedCount, done, total }),
        ),
        h(
          'div',
          { style: S.chips },
          chip(capability.llm === true ? tr('chip.model') : tr('chip.raw')),
          chip(voice),
          chip(subtitles),
        ),
        chapters.length === 0
          ? h(
              'div',
              { style: S.state },
              total > 0 ? tr('queue.waiting', { total }) : tr('queue.planning'),
            )
          : h(
              'div',
              { style: S.list, role: 'list' },
              chapters.map((chapter) =>
                h(ChapterRow, {
                  key: chapter.id,
                  chapter,
                  playing: playing !== null && playing.id === chapter.id,
                  retrying: retrying === chapter.id,
                  onPlay: (target) => void playChapter(target),
                  onRetry: (target) => void retryChapter(target),
                }),
              ),
            ),
        playing === null
          ? null
          : h(
              'div',
              { style: S.playerWrap },
              h('audio', {
                key: playing.url,
                src: playing.url,
                controls: true,
                autoPlay: true,
                preload: 'none',
                style: S.player,
                'aria-label': tr('audio.label', { id: playing.id }),
                onTimeUpdate: (event) => setCue(cueAt(cues, event.currentTarget.currentTime * 1000)),
                onEnded: () => {
                  setPlaying(null)
                  setCue('')
                },
              }),
              h('div', { style: S.cue }, cue.length === 0 ? '\u00A0' : cue),
            ),
        failedCount > 0
          ? h(
              'div',
              { style: S.actions },
              h(
                'button',
                { type: 'button', className: 'dsh-vo-btn', style: S.action, disabled: busy, onClick: rerun },
                busy ? tr('action.resuming') : tr('action.rerun', { count: failedCount }),
              ),
            )
          : null,
        warnings.length === 0
          ? null
          : h(
              'div',
              { style: S.warn },
              warnings.slice(0, 3).map((warning, index) => h('div', { key: index }, warningText(warning))),
              warningTotal > 3
                ? h('div', { key: 'more' }, tr('hint.moreWarnings', { count: warningTotal - 3 }))
                : null,
            ),
        stalled ? h('div', { style: S.warn }, tr('hint.stalled')) : null,
        finished ? h('div', { style: S.state }, tr('hint.allDone', { done })) : null,
        h(
          'div',
          { style: S.footer },
          h('span', { style: S.mono }, `projectId ${snap.projectId ?? ''}`),
          clock.length === 0 ? null : h('span', null, tr('meta.updated', { time: clock })),
        ),
      )
    }

    /**
     * Ambient player and progress line above the composer.
     *
     * Tool views render inside the collapsed process group, and a collapsed row
     * is not mounted at all, so this surface cannot wait for the panel to poll.
     * It asks the host what this session is running (`sessions/<id>.json`),
     * loads the first playable chapter, and follows the audio clock to show the
     * current subtitle line.
     *
     * It lives in the input dock rather than in a Turn: one player per Session,
     * not one per reply, and it is still on screen after the Turn that started
     * the job has scrolled away.
     */
    function VoiceoverStrip(props) {
      const sessionId = props?.sessionId
      const [project, setProject] = react.useState(() =>
        typeof sessionId === 'string' ? (activity.get(sessionId) ?? null) : null,
      )
      const [cues, setCues] = react.useState([])
      const [cue, setCue] = react.useState('')
      const [paused, setPaused] = react.useState(true)
      const [elapsed, setElapsed] = react.useState(null)
      // The audio URL is re-signed on every poll, so it is captured when the user
      // presses play; binding src to the snapshot would remount the element every
      // couple of seconds and stop playback.
      const [player, setPlayer] = react.useState(null)
      // Playback speed and the listening position restored from storage.
      const [speed, setSpeed] = react.useState(1)
      const [resume, setResume] = react.useState(null)
      const audioRef = (react.useRef ?? (() => ({ current: null })))(null)

      react.useEffect(() => {
        if (typeof sessionId !== 'string') return undefined
        let stopped = false
        let timer
        const tick = async () => {
          try {
            const res = await fetch(`/voiceover/panel/sessions/${encodeURIComponent(sessionId)}.json`, {
              credentials: 'same-origin',
              cache: 'no-store',
            })
            if (!res.ok) return
            const data = await res.json()
            if (stopped) return
            // Keep the shared store's entry when the host has nothing to add.
            if (data.project !== null && data.project !== undefined) {
              setProject((current) => newerProject(current, data.project))
            }
            const active =
              data.project !== null && data.project !== undefined && data.project.pending > 0
            // Fast while it runs; a slow heartbeat otherwise, so a project started
            // later is not invisible until the next Turn renders a new strip.
            timer = setTimeout(tick, active ? 2000 : 15000)
          } catch {
            // Offline or a non-Web host: the strip simply stays hidden.
          }
        }
        void tick()
        return () => {
          stopped = true
          clearTimeout(timer)
        }
      }, [sessionId])

      react.useEffect(() => {
        if (typeof sessionId !== 'string') return undefined
        // The panel publishes there; without this the strip would wait for its
        // own heartbeat even though fresher data already exists.
        return subscribeActivity(() => {
          const entry = activity.get(sessionId)
          if (entry !== undefined) setProject((current) => newerProject(current, entry))
        })
      }, [sessionId])
      const chapters = Array.isArray(project?.chapters) ? project.chapters : []
      // The whole book, in order: the strip plays through it, not just ch-01.
      const playlist = playableChapters(chapters)

      react.useEffect(() => {
        if (project === null || player === null) return undefined
        let stopped = false
        const load = async () => {
          try {
            const res = await fetch(`/voiceover/panel/${project.projectId}/subtitles/${player.id}`, {
              credentials: 'same-origin',
              cache: 'no-store',
            })
            if (res.ok && !stopped) setCues(parseSrt(await res.text()))
          } catch {
            // Without subtitles the transport still works; no line is shown.
          }
        }
        void load()
        return () => {
          stopped = true
        }
      }, [project?.projectId, player?.id])

      react.useEffect(() => {
        // A new project means the previous audio is no longer this row's subject.
        setPlayer(null)
        setCue('')
        setElapsed(null)
        setPaused(true)
        setResume(readPosition(project?.projectId))
      }, [project?.projectId])

      if (typeof sessionId !== 'string' || project === null) return null

      const total = typeof project.total === 'number' ? project.total : 0
      const done = typeof project.done === 'number' ? project.done : 0
      const failed = typeof project.failed === 'number' ? project.failed : 0
      const pending = typeof project.pending === 'number' ? project.pending : 0
      // Job progress while chapters are pending, the audio clock afterwards.
      const playing = player !== null && paused === false
      const bar = stripBar({ pending, total, chapters, player, elapsed, playing })
      const pct = bar.percent
      const timeline = bar.mode === 'playback'
      const totalMs = chapters.reduce(
        (sum, entry) => sum + (typeof entry?.durationMs === 'number' ? entry.durationMs : 0),
        0,
      )
      const finished = pending === 0 && failed === 0
      // A finished project must say so in words: the bar becomes the player's
      // timeline, so it no longer announces completion by itself.
      // A finished project carries its last write time: without it a stale result
      // looks identical to a live one that happens to be at 100%.
      const clock = formatClock(project.stateUpdatedAt)
      const statusText = finished
        ? clock.length > 0
          ? `${tr('state.done')} · ${clock}`
          : tr('state.done')
        : stateWord({ ...project, chapters, pending, failed, done, total })
      // While playing, the clock is the answer; before that, the project's total.
      const timeLabel =
        elapsed !== null && player !== null
          ? `${formatDuration(elapsed)} / ${formatDuration(player.durationMs)}`
          : totalMs > 0
            ? tr('strip.total', { time: formatDuration(totalMs) })
            : ''

      /**
       * Start one chapter of the book.
       *
       * The signed URL is frozen here, not in render: every poll re-signs it, and
       * binding src to the snapshot would remount the element and stop playback.
       */
      const playAt = (at, startMs = 0) => {
        const target = playlist[at]
        if (target === undefined) return
        setPlayer({
          id: target.id,
          url: target.audioUrl,
          durationMs: target.durationMs,
          index: at,
          startMs,
        })
      }

      const toggle = () => {
        if (player === null) {
          if (playlist.length === 0) return
          // Continue where the listener stopped, when that position still exists.
          const at = resume !== null && resume.index < playlist.length ? resume.index : 0
          playAt(at, at === resume?.index ? resume.ms : 0)
          return
        }
        const audio = audioRef.current
        if (audio === null || audio === undefined) return
        if (audio.paused === true) {
          const started = audio.play?.()
          if (started !== undefined && typeof started.catch === 'function') started.catch(() => {})
        } else {
          audio.pause?.()
        }
      }

      /**
       * Seek inside the strip's own player, or start it.
       *
       * The bar becomes the timeline once the project is finished; without this
       * the row would show playback and still refuse to be moved.
       */
      const scrub = (event) => {
        if (player === null) {
          toggle()
          return
        }
        const audio = audioRef.current
        if (audio === null || audio === undefined) return
        const rect = event?.currentTarget?.getBoundingClientRect?.()
        const width = typeof rect?.width === 'number' ? rect.width : 0
        if (width <= 0) return
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / width))
        const seconds =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : (typeof player.durationMs === 'number' ? player.durationMs : 0) / 1000
        if (seconds <= 0) return
        try {
          audio.currentTime = ratio * seconds
        } catch {
          // Metadata has not arrived yet; the next click retries.
        }
      }

      try {
        return h(
        'div',
        { style: S.strip, role: 'group', 'aria-label': tr('group.label') },
        h('style', { key: 'vo-strip' }, FOCUS_CSS),
        h(
          'div',
          { style: S.stripRow },
          playlist.length === 0
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-vo-btn',
                  style: S.stripPlay,
                  'aria-label': paused ? tr('action.play') : tr('action.pause'),
                  onClick: toggle,
                },
                paused ? '▶' : '❚❚',
              ),
          h('span', { style: S.stripTitle }, project.title || tr('card.title')),
          h(
            'span',
            { style: S.stripCount },
            player === null
              ? total > 0
                ? tr('count.progress', { done, total })
                : tr('count.preparing')
              : tr('strip.chapter', { id: player.id, at: player.index + 1, total: playlist.length }),
          ),
          player === null
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-vo-btn',
                  style: S.stripRate,
                  'aria-label': tr('action.speed'),
                  title: tr('action.speed'),
                  onClick: () => {
                    const next = nextRate(speed)
                    setSpeed(next)
                    const audio = audioRef.current
                    if (audio !== null && audio !== undefined) audio.playbackRate = next
                  },
                },
                `${speed}×`,
              ),
          timeLabel.length === 0 ? null : h('span', { style: S.stripTime }, timeLabel),
          h(
            'div',
            timeline
              ? {
                  style: { ...S.stripTrack, ...S.stripTrackTimeline },
                  role: 'progressbar',
                  'aria-label': tr('progress.playback'),
                  'aria-valuemin': 0,
                  'aria-valuemax': 100,
                  'aria-valuenow': Math.round(pct),
                  'aria-valuetext':
                    player === null
                      ? tr('progress.seek')
                      : tr('progress.played', {
                          played: formatDuration(elapsed) || '0:00',
                          total: formatDuration(player.durationMs),
                        }),
                  title: tr('progress.seek'),
                  onClick: scrub,
                }
              : { style: S.stripTrack, 'aria-hidden': 'true' },
            h('div', {
              style: {
                ...S.stripFill,
                width: `${pct}%`,
                // Finished reads as success rather than as the accent the theme
                // uses everywhere, so a full bar never looks like an error.
                // A timeline is a player control, so it uses the accent.
                background: timeline
                  ? 'var(--dsw-alias-brand-primary)'
                  : finished
                    ? 'var(--dsw-alias-state-success-primary)'
                    : 'var(--dsw-alias-brand-primary)',
              },
            }),
          ),
          failed > 0 ? h('span', { style: S.stripFailed }, tr('dock.failed', { count: failed })) : null,
        ),
        h(
          'div',
          { style: S.stripCue, 'aria-live': 'polite' },
          stripLine({ cue, playing, status: `${statusText} · ${String(project.projectId).slice(0, 6)}` }),
        ),
        player === null
          ? null
          : h('audio', {
              key: player.id,
              ref: audioRef,
              src: player.url,
              autoPlay: true,
              preload: 'none',
              style: S.stripAudio,
              onLoadedMetadata: (event) => {
                const audio = event.currentTarget
                audio.playbackRate = speed
                if (player.startMs > 0) {
                  try {
                    audio.currentTime = player.startMs / 1000
                  } catch {
                    // No seekable range yet: start from the top instead.
                  }
                }
              },
              onTimeUpdate: (event) => {
                const audio = event.currentTarget
                setElapsed(audio.currentTime * 1000)
                setCue(cueAt(cues, audio.currentTime * 1000))
                storePosition(project.projectId, player.index, audio.currentTime * 1000)
              },
              onPlay: () => setPaused(false),
              onPause: () => setPaused(true),
              onEnded: () => {
                // Keep the book going: the next chapter mounts its own element.
                const next = nextPlaybackIndex(player.index, playlist.length)
                if (next >= 0) {
                  playAt(next, 0)
                  return
                }
                setPaused(true)
                setCue('')
                setElapsed(null)
              },
            }),
        )
      } catch (error) {
        // Never let the host draw its error placeholder in place of progress.
        return h('div', { style: S.stripFail }, `voiceover: ${String((error && error.message) || error)}`)
      }
    }


    // ----------------------------------------------------------------- mount

    /**
     * Register this plugin's dictionaries and keep `activeLocale` in sync.
     *
     * Everything is optional: a client without a locale service still renders,
     * falling back to the local default language.
     */
    function installLocale(ctx) {
      const service = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      if (service === undefined || service === null) return

      localeService = service
      try {
        const snapshot = service.getSnapshot?.() ?? service.getLocale?.()
        if (typeof snapshot?.active === 'string') activeLocale = snapshot.active
      } catch {
        // Keep the fallback language.
      }

      for (const code of Object.keys(MESSAGES)) {
        try {
          const dispose = service.register(LOCALE_NS, code, MESSAGES[code])
          if (typeof ctx.effect === 'function') ctx.effect(() => dispose)
        } catch {
          // A duplicate namespace owner must not break the panel.
        }
      }

      try {
        translate = service.bind(LOCALE_NS)
      } catch {
        translate = null
      }

      try {
        const unsubscribe = service.subscribe(() => {
          try {
            const snapshot = service.getSnapshot?.() ?? service.getLocale?.()
            if (typeof snapshot?.active === 'string') activeLocale = snapshot.active
          } catch {
            // Keep the previous language.
          }
          emitLocaleChange()
        })
        if (typeof ctx.effect === 'function') ctx.effect(() => unsubscribe)
      } catch {
        // Live switching is a nicety; the mount-time language still works.
      }

      emitLocaleChange()
    }

    function apply(ctx) {
      installLocale(ctx)
      ctx.slots.inject('tool.call.toolview', function* () {
        yield ctx.slots.register({ name: 'tool.call.toolview', key: 'voiceover_create' }, VoiceoverPanel)
        yield ctx.slots.register({ name: 'tool.call.toolview', key: 'voiceover_status' }, VoiceoverPanel)
      })
      // Ambient session state, not a message attachment. The turn tail renders
      // on every completed Turn, so registering there drew one player under
      // every reply; the input dock renders once per session, full width, just
      // above the composer card.
      ctx.slots.inject('conversation.input.dock', function* () {
        yield ctx.slots.register({ name: 'conversation.input.dock', id: 'voiceover-progress', order: 30 }, VoiceoverStrip)
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    exports.__seedSnapshot = __seedSnapshot
    exports.__messages = MESSAGES
    exports.noteProgress = noteProgress
    exports.subscribeActivity = subscribeActivity
    exports.__activity = activity
    exports.VoiceoverStrip = VoiceoverStrip
    exports.projectIdFrom = projectIdFrom
    exports.blocksText = blocksText
    exports.formatDuration = formatDuration
    exports.warningText = warningText
    exports.stateWord = stateWord
    exports.formatClock = formatClock
    exports.progressPercent = progressPercent
    exports.stripBar = stripBar
    exports.stripLine = stripLine
    exports.playableChapters = playableChapters
    exports.nextPlaybackIndex = nextPlaybackIndex
    exports.readPosition = readPosition
    exports.storePosition = storePosition
    exports.nextRate = nextRate
    exports.newerProject = newerProject
    exports.parseSrt = parseSrt
    exports.cueAt = cueAt
    exports.VoiceoverPanel = VoiceoverPanel
    return module.exports
  },
})
