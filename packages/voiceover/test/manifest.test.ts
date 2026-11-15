import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string
  files: string[]
  exports: Record<string, string>
  dsh: {
    bundle: { patch: string }
    client: { platform: string; immediately: boolean; inject: string[] }
  }
}

/**
 * The one module that owns `tool.call.toolview`.
 *
 * A wrong id here is invisible to module-level tests: they stub the loader, so
 * a client half that the real loader skips still "passes". That is exactly how
 * a three-name inject list shipped once and rendered nothing in the app.
 */
const CLIENT_INJECT = ['@deepseek-ai/dsh-client-ui-conversation']

test('the client manifest matches what the loader expects', () => {
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.immediately, true)
  assert.deepEqual(
    manifest.dsh.client.inject,
    CLIENT_INJECT,
    'injecting an id the page cannot resolve makes the loader skip this plugin entirely',
  )
})

test('the client entry named by the export exists and is published', () => {
  const entry = manifest.exports['./client']
  assert.equal(typeof entry, 'string', 'exports["./client"] is how the loader finds the bundle')
  const relative = entry.replace(/^\.\//, '')
  assert.ok(existsSync(join(root, relative)), `${relative} must exist`)
  assert.ok(
    manifest.files.some((directory) => relative.startsWith(`${directory}/`)),
    `${relative} must fall under a published "files" directory`,
  )
})

test('the bundle patch exists and the version matches the source constant', () => {
  assert.ok(existsSync(join(root, manifest.dsh.bundle.patch)), 'the bundle patch must ship')
  const source = readFileSync(join(root, 'src', 'version.ts'), 'utf8')
  assert.match(source, new RegExp(`VERSION = '${manifest.version}'`), 'the daemon would report a stale version')
})

test('display metadata exists for both locales and is published', () => {
  // Without these the plugin row falls back to the package name; the icon is
  // resolved separately, so a package can have one and still look nameless.
  for (const locale of ['en', 'zh']) {
    const file = join(root, 'locale', `${locale}.json`)
    assert.ok(existsSync(file), `locale/${locale}.json must exist`)
    const meta = (JSON.parse(readFileSync(file, 'utf8')) as { meta: { title: string; description: string } }).meta
    assert.ok(typeof meta.title === 'string' && meta.title.length > 0, `${locale}.meta.title must be set`)
    assert.ok(typeof meta.description === 'string' && meta.description.length > 0, `${locale}.meta.description must be set`)
    assert.ok(
      manifest.exports['./locale/*.json'] !== undefined,
      'the locale files must be exported for Plugin Manager to read them',
    )
    assert.ok(
      manifest.files.some((entry) => entry.startsWith('locale/')),
      'the locale files must be in the published file list',
    )
  }
  assert.equal(manifest.icon, './icon.svg', 'a top-level icon wins over the ./icon export')
})