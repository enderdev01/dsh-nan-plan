#!/usr/bin/env node
/**
 * Builds the npm-publishable copy of this plugin in `.publish/`.
 *
 * The package you link into your own Harness profile is named `@local/nan-plan`.
 * For the registry it has to be an unscoped public name, so this script copies
 * the same sources and rewrites the three places that carry the package name:
 * `package.json`, the row in `cordis.patch.yml`, and the client module id.
 *
 *   node scripts/publish.mjs          # build .publish/
 *   node scripts/publish.mjs --pack   # build and run `npm pack --dry-run`
 *   npm publish .publish --access public
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(root, '.publish')
const PUBLISHED_NAME = 'dsh-nan-plan'

const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { private: _private, ...published } = source
const manifest = {
  ...published,
  name: PUBLISHED_NAME,
  files: [...source.files, 'LICENSE'],
  engines: { node: '>=20' },
}

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'locale'), { recursive: true })

for (const file of ['index.js', 'client.js', 'icon.svg', 'LICENSE']) {
  cpSync(join(root, file), join(out, file))
}
for (const file of ['en.json', 'es.json']) {
  cpSync(join(root, 'locale', file), join(out, 'locale', file))
}
cpSync(join(root, 'README.md'), join(out, 'README.md'))
writeFileSync(join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const client = readFileSync(join(root, 'client.js'), 'utf8').replace(
  "id: '@local/nan-plan'",
  `id: '${PUBLISHED_NAME}'`,
)
writeFileSync(join(out, 'client.js'), client)

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8').replaceAll(
  '@local/nan-plan',
  PUBLISHED_NAME,
)
writeFileSync(join(out, 'cordis.patch.yml'), patch)

if (!client.includes(`id: '${PUBLISHED_NAME}'`)) {
  throw new Error('client.js: the module id was not rewritten')
}
if (!patch.includes(PUBLISHED_NAME)) {
  throw new Error('cordis.patch.yml: the row name was not rewritten')
}

console.log(`built ${out}`)
console.log(`name: ${PUBLISHED_NAME}@${manifest.version}`)

if (process.argv.includes('--pack')) {
  // `npm publish --dry-run` validates the manifest and every packed file. The
  // cache is redirected because a damaged ~/.npm (root-owned files) otherwise
  // fails before npm reads the package.
  execFileSync(
    'npm',
    ['publish', '--dry-run', '--cache', join(tmpdir(), 'dsh-npm-cache'), '--no-audit', '--no-fund'],
    { cwd: out, stdio: 'inherit' },
  )
}
