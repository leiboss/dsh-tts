/**
 * Optional loudness normalisation through ffmpeg.
 *
 * Podcast directories expect roughly -16 LUFS; the engine's own output is
 * whatever the voice model produces. ffmpeg is not a dependency of this plugin
 * and the DSH sandbox may refuse to spawn it, so a missing or blocked binary is
 * a warning on the episode, never a failed run.
 */
import { spawn } from 'node:child_process';
/** ffmpeg arguments for one conservative speech loudness pass. */
export function loudnessArgs(input, output) {
    return [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        input,
        // -16 LUFS is the podcast convention; the limiter keeps peaks below -1.5 dBTP.
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '64k',
        output,
    ];
}
/**
 * Run the normaliser, resolving to a skip instead of throwing.
 *
 * The caller only needs to know whether the file was replaced; reporting why it
 * was not is what keeps the episode honest about its loudness.
 */
export function normalizeLoudness(input) {
    const binary = input.ffmpegPath ?? 'ffmpeg';
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            resolve(value);
        };
        let child;
        try {
            child = spawn(binary, loudnessArgs(input.inputPath, input.outputPath), {
                stdio: ['ignore', 'ignore', 'pipe'],
            });
        }
        catch (error) {
            finish({ applied: false, reason: error instanceof Error ? error.message : String(error) });
            return;
        }
        let stderr = '';
        child.stderr?.on('data', (chunk) => {
            if (stderr.length < 4000)
                stderr += chunk.toString('utf8');
        });
        child.on('error', (error) => {
            finish({ applied: false, reason: error.message });
        });
        child.on('close', (code) => {
            if (code === 0) {
                finish({ applied: true });
                return;
            }
            const tail = stderr.trim().split('\n').slice(-2).join(' ').slice(0, 200);
            finish({ applied: false, reason: `ffmpeg exited with ${String(code)}${tail.length > 0 ? `: ${tail}` : ''}` });
        });
        const timer = setTimeout(() => {
            child?.kill('SIGKILL');
            finish({ applied: false, reason: 'ffmpeg timed out' });
        }, input.timeoutMs ?? 30 * 60 * 1000);
        timer.unref?.();
    });
}
//# sourceMappingURL=loudness.js.map