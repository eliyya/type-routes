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

for (const failed of [false, true]) {
    it(`closes the CLI watcher on SIGINT with exit status ${failed ? 1 : 0}`, (t) => {
        const root = mkdtempSync(join(tmpdir(), 'type-routes-cli-sigint-'))
        t.after(() => rmSync(root, { recursive: true, force: true }))
        const input = join(root, 'app')
        const output = join(root, 'routes.ts')
        mkdirSync(input)
        writeFileSync(join(input, 'page.tsx'), 'export default function Page() {}')
        const cli = new URL('./cli.ts', import.meta.url)
        // Emit SIGINT inside the child: Windows kill('SIGINT') forcibly
        // terminates it without invoking the Node signal handler.
        const script = `
            import fs from 'node:fs'
            import { EventEmitter } from 'node:events'
            process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(cli))},
                '-i', ${JSON.stringify(input)}, '-o', ${JSON.stringify(output)},
                '--watch', '--debounce-ms', '0']
            let onChange
            fs.watch = (_dir, _options, callback) => {
                onChange = callback
                const watcher = new EventEmitter()
                watcher.close = () => console.log('watcher closed')
                return watcher
            }
            await import(${JSON.stringify(cli.href)})
            if (${failed}) {
                const report = console.error
                console.error = (...args) => {
                    report(...args)
                    setImmediate(() => process.emit('SIGINT'))
                }
                fs.renameSync(${JSON.stringify(input)}, ${JSON.stringify(`${input}.removed`)})
                onChange('rename', null)
            } else {
                process.emit('SIGINT')
            }
        `
        const runner = join(root, 'runner.mjs')
        writeFileSync(runner, script)
        const result = spawnSync(
            process.execPath,
            ['--experimental-strip-types', runner],
            { encoding: 'utf8', timeout: 10_000 },
        )
        assert.ifError(result.error)
        assert.equal(result.status, failed ? 1 : 0, result.stderr)
        assert.match(result.stdout, /watcher closed/)
        if (failed) assert.match(result.stderr, /Failed to update routes/)
        else assert.doesNotMatch(result.stderr, /Failed to/)
    })
}
