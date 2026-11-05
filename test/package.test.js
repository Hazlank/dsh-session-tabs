import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { name } from '../lib/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8')
}

test('package identity is consistent across manifests and both halves', async () => {
  const pkg = JSON.parse(await text('package.json'))
  assert.equal(pkg.name, '@hazlank/dsh-session-tabs')
  assert.equal(pkg.version, '0.12.0')
  assert.equal(name, pkg.name)
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')

  const patch = await text('cordis.patch.yml')
  assert.match(patch, new RegExp(`name:\\s*'${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))

  const client = await text('lib/client.js')
  assert.match(client, /window\.__ModuleLoader__\.load\(\{\s*id:\s*"@hazlank\/dsh-session-tabs"/)
})

test('manifest declares the publish metadata and host surfaces', async () => {
  const pkg = JSON.parse(await text('package.json'))
  assert.equal(pkg.license, 'MIT')
  assert.equal(pkg.icon, './icon.svg')
  assert.equal(pkg.publishConfig.access, 'public')
  assert.equal(pkg.publishConfig.registry, 'https://registry.npmjs.org/')
  assert.match(pkg.repository.url, /github\.com\/Hazlank\/dsh-session-tabs/)
  assert.ok(pkg.engines.node)
  assert.ok(pkg.engines.dsh)
  assert.ok(pkg.dsh.capabilities.includes('network:ingress'))
  assert.ok(pkg.dsh.labels.includes('remote-access'))
  assert.ok(pkg.files.includes('LICENSE'))
  assert.ok(pkg.files.includes('icon.svg'))
  assert.ok(pkg.files.includes('locale/*.json'))
  assert.ok(pkg.files.includes('README.zh.md'))
  assert.ok(pkg.files.includes('CHANGELOG.md'))
})

test('locale metadata is valid and bilingual', async () => {
  for (const locale of ['en', 'zh']) {
    const data = JSON.parse(await text(`locale/${locale}.json`))
    assert.equal(typeof data.meta.title, 'string')
    assert.ok(data.meta.title.length > 0)
    assert.equal(typeof data.meta.description, 'string')
    assert.ok(data.meta.description.length > 0)
  }
})

test('release assets exist and are readable', async () => {
  for (const file of [
    'LICENSE',
    'icon.svg',
    'README.md',
    'README.zh.md',
    'CHANGELOG.md',
    'docs/images/tabs.png',
    'docs/images/inbox.png',
  ]) {
    await access(path.join(root, file))
  }
  for (const image of ['docs/images/tabs.png', 'docs/images/inbox.png']) {
    const bytes = await readFile(path.join(root, image))
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  }
  const license = await text('LICENSE')
  assert.match(license, /MIT License/)
  assert.match(license, /Copyright \(c\) 2026 Hazlank/)
  const icon = await text('icon.svg')
  assert.match(icon, /^<svg[\s>]/)
  assert.match(icon, /<\/svg>\s*$/)
})
