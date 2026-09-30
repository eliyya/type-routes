import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

it('awaits CLI generation and reports initial failures with a nonzero status', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'type-routes-cli-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const input = join(root, 'app')
    const output = join(root, 'routes.ts')
    mkdirSync(input)
    writeFileSync(join(input, 'page.tsx'), 'export default function Page() {}')
    const cli = fileURLToPath(new URL('./cli.ts', import.meta.url))
    const args = ['--experimental-strip-types', cli, '-o', output]

    const generated = spawnSync(process.execPath, [...args, '-i', input], {
        encoding: 'utf8',
    })
    assert.equal(generated.status, 0, generated.stderr)
    assert.match(readFileSync(output, 'utf8'), /export const app/)
    const original = readFileSync(output, 'utf8')

    const failed = spawnSync(process.execPath, [...args, '-i', join(root, 'missing')], {
        encoding: 'utf8',
    })
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /Failed to generate/)
    assert.equal(readFileSync(output, 'utf8'), original)
})
