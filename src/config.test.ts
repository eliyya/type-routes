import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, type FSWatcher } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { defineTypeRouteConfig } from './index.ts'
import { withTypeRoutes } from './next.ts'
import { stopWatchingRoutes } from './watch.ts'

it('generates before returning the config wrapper, even with watch disabled', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'type-routes-config-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const input = join(root, 'app', '[locale]')
    const output = join(root, 'lib', 'routes.ts')
    mkdirSync(input, { recursive: true })
    writeFileSync(join(input, 'page.tsx'), 'export default function Page() {}')

    const wrap = defineTypeRouteConfig({
        input: join(root, 'app'),
        output,
        paramConstraints: { locale: ['en', 'es'] },
        quiet: true,
        watch: false,
    })

    assert.match(readFileSync(output, 'utf8'), /\$locale extends 'en' \| 'es'/)
    const config = { reactStrictMode: true, images: { unoptimized: true } }
    assert.equal(wrap(config), config)
    assert.equal(wrap(config), config)
})

it('keeps the deprecated Next entry as the same config factory', () => {
    assert.equal(withTypeRoutes, defineTypeRouteConfig)
})

it('reuses the development watcher and closes it when watch is disabled', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'type-routes-config-'))
    const input = join(root, 'app')
    const output = join(root, 'lib', 'routes.ts')
    mkdirSync(input)
    writeFileSync(join(input, 'page.tsx'), 'export default function Page() {}')
    const previousMode = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    t.after(() => {
        stopWatchingRoutes(output)
        if (previousMode === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = previousMode
        rmSync(root, { recursive: true, force: true })
    })
    let starts = 0
    let closes = 0
    t.mock.method(fs, 'watch', () => {
        starts++
        const watcher = new EventEmitter() as FSWatcher
        watcher.close = () => {
            closes++
            watcher.emit('close')
        }
        return watcher
    })

    const wrap = defineTypeRouteConfig({ input, output, quiet: true })
    wrap({})
    wrap({})
    assert.equal(starts, 1)
    defineTypeRouteConfig({ input, output, quiet: true, watch: false })({})
    assert.equal(closes, 1)
})
