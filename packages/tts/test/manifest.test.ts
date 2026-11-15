import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
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
 * Module-level tests stub the loader, so they pass even when the real loader
 * skips this plugin's client half. This package's `tts_generate` player was
 * invisible for exactly that reason: the inject list named three modules the
 * page cannot resolve.
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

test('the client entry and the icon exist and are published', () => {
  const entry = manifest.exports['./client']
  const icon = manifest.exports['./icon']
  assert.equal(typeof entry, 'string')
  assert.equal(typeof icon, 'string', 'Plugin Manager reads the icon through the ./icon export')
  for (const relative of [entry.replace(/^\.\//, ''), icon.replace(/^\.\//, '')]) {
    assert.ok(existsSync(join(root, relative)), `${relative} must exist`)
    assert.ok(
      manifest.files.some((published) => relative.startsWith(`${published}/`) || published === relative),
      `${relative} must fall under a published "files" entry`,
    )
  }
})

test('the bundle patch ships', () => {
  assert.ok(existsSync(join(root, manifest.dsh.bundle.patch)))
})
