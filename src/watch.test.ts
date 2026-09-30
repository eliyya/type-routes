import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs, { type FSWatcher } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import type { RouteChange, RouteGenerator } from './generate.ts'
import {
    stopWatchingRoutes,
    watchRoutes,
    type RouteWatchOptions,
} from './watch.ts'

type FakeWatcher = {
    handle: EventEmitter
    emit: (event: RouteChange['event'], filename: string | null) => void
    closes: number
}

function setup(t: TestContext) {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const watchers: FakeWatcher[] = []
    t.mock.method(
        fs,
        'watch',
        (
            _dir: string,
            _options: unknown,
            listener: (
                event: RouteChange['event'],
                filename: string | null,
            ) => void,
        ) => {
            const fake: FakeWatcher = {
                handle: new EventEmitter(),
                emit: listener,
                closes: 0,
            }
            const handle = fake.handle as FSWatcher
            handle.close = () => {
                fake.closes++
                fake.handle.emit('close')
            }
            watchers.push(fake)
            return handle
        },
    )
    const batches: RouteChange[][] = []
    const generator = {
        async handleChanges(changes: readonly RouteChange[]) {
            batches.push([...changes])
        },
    } as unknown as RouteGenerator
    const output = resolve(`watch-test-${t.name}.ts`)
    const stops: (() => void)[] = []
    t.after(() => {
        for (const stop of stops) stop()
    })
    function start(
        nextGenerator = generator,
        options: RouteWatchOptions = { debounceMs: 10, quiet: true },
        input = 'src/app',
    ) {
        const stop = watchRoutes(input, output, nextGenerator, options)
        stops.push(stop)
        return stop
    }
    return { watchers, batches, generator, output, stops, start }
}

async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve()
}

describe('watchRoutes', () => {
    it('batches events and prefers rename for a repeated filename', async t => {
        const { watchers, batches, start } = setup(t)
        start()
        watchers[0].emit('change', 'users/page.tsx')
        watchers[0].emit('rename', 'users/page.tsx')
        watchers[0].emit('change', 'users/page.tsx')
        watchers[0].emit('change', 'api/route.ts')
        watchers[0].emit('change', 'users/styles.css')
        t.mock.timers.tick(9)
        assert.equal(batches.length, 0)
        t.mock.timers.tick(1)
        await settle()
        assert.deepEqual(batches, [
            [
                { event: 'rename', filename: 'users/page.tsx' },
                { event: 'change', filename: 'api/route.ts' },
            ],
        ])
    })

    it('preserves and combines events received during an in-flight generation', async t => {
        const { watchers, batches, start } = setup(t)
        let finish!: () => void
        const blocked = new Promise<void>(resolve => {
            finish = resolve
        })
        let active = 0
        let maxActive = 0
        const generator = {
            async handleChanges(changes: readonly RouteChange[]) {
                active++
                maxActive = Math.max(maxActive, active)
                batches.push([...changes])
                if (batches.length === 1) await blocked
                active--
            },
        } as unknown as RouteGenerator
        start(generator)
        watchers[0].emit('rename', 'first/page.tsx')
        t.mock.timers.tick(10)
        watchers[0].emit('rename', 'second/page.tsx')
        watchers[0].emit('change', 'second/page.tsx')
        watchers[0].emit('rename', 'third/page.tsx')
        t.mock.timers.tick(10)
        assert.equal(batches.length, 1)
        finish()
        await settle()
        assert.equal(maxActive, 1)
        assert.deepEqual(batches[1], [
            { event: 'rename', filename: 'second/page.tsx' },
            { event: 'rename', filename: 'third/page.tsx' },
        ])
    })

    it('forwards directory renames and missing filenames for reconciliation', async t => {
        const { watchers, batches, start } = setup(t)
        start()
        watchers[0].emit('rename', 'users')
        watchers[0].emit('change', null)
        watchers[0].emit('rename', null)
        t.mock.timers.tick(10)
        await settle()
        assert.deepEqual(batches, [
            [
                { event: 'rename', filename: 'users' },
                { event: 'rename', filename: null },
            ],
        ])
    })

    it('ignores its output and temporary writes while preserving other renames', async t => {
        const { watchers, batches, generator, stops } = setup(t)
        stops.push(
            watchRoutes('src/app', 'src/app/routes.ts', generator, {
                debounceMs: 10,
                quiet: true,
            }),
        )
        watchers[0].emit('rename', 'routes.ts')
        watchers[0].emit('change', 'routes.ts')
        watchers[0].emit('rename', 'routes.ts.123.tmp')
        watchers[0].emit('change', 'routes.ts.123.tmp')
        t.mock.timers.tick(10)
        await settle()
        assert.deepEqual(batches, [])
        watchers[0].emit('rename', 'users')
        watchers[0].emit('rename', 'routes.ts.tmp')
        watchers[0].emit('rename', 'routes.ts.backup/page.tsx')
        t.mock.timers.tick(10)
        await settle()
        assert.deepEqual(batches, [
            [
                { event: 'rename', filename: 'users' },
                { event: 'rename', filename: 'routes.ts.tmp' },
                { event: 'rename', filename: 'routes.ts.backup/page.tsx' },
            ],
        ])
    })

    it(
        'deduplicates and stops outputs regardless of letter case on Windows',
        {
            skip: process.platform !== 'win32',
        },
        t => {
            const { watchers, generator, output, stops } = setup(t)
            stops.push(
                watchRoutes('src/app', output, generator, { quiet: true }),
            )
            stops.push(
                watchRoutes('src/app', output.toUpperCase(), generator, {
                    quiet: true,
                }),
            )
            assert.equal(watchers.length, 1)
            stopWatchingRoutes(output.toUpperCase())
            assert.equal(watchers[0].closes, 1)
        },
    )

    it('reuses a watcher and updates its generator on configuration reload', async t => {
        const { watchers, batches, generator, start } = setup(t)
        const originalErrors: unknown[] = []
        const replacementErrors: unknown[] = []
        const oldStop = start(generator, {
            debounceMs: 10,
            quiet: true,
            onError: error => originalErrors.push(error),
        })
        const replacementBatches: RouteChange[][] = []
        const replacement = {
            async handleChanges(changes: readonly RouteChange[]) {
                replacementBatches.push([...changes])
            },
        } as unknown as RouteGenerator
        start(replacement, {
            debounceMs: 10,
            quiet: true,
            onError: error => replacementErrors.push(error),
        })
        oldStop()
        assert.equal(watchers.length, 1)
        assert.equal(watchers[0].closes, 0)
        watchers[0].emit('rename', 'dashboard/page.tsx')
        t.mock.timers.tick(10)
        await settle()
        assert.equal(batches.length, 0)
        assert.equal(replacementBatches.length, 1)
        const error = new Error('watch failed after reload')
        watchers[0].handle.emit('error', error)
        assert.deepEqual(originalErrors, [])
        assert.deepEqual(replacementErrors, [error])
    })

    it('replaces watchers when paths or options change without stale cleanup', t => {
        const { watchers, generator, start } = setup(t)
        const oldStop = start()
        start(generator, { debounceMs: 20, quiet: true })
        assert.equal(watchers[0].closes, 1)
        oldStop()
        assert.equal(watchers[1].closes, 0)
        start(generator, { debounceMs: 20, quiet: true }, 'app')
        assert.equal(watchers[1].closes, 1)
        assert.equal(watchers[2].closes, 0)
    })

    it('cancels pending work and rejects future events after shutdown', async t => {
        const { watchers, batches, start } = setup(t)
        const stop = start()
        watchers[0].emit('rename', 'dashboard/page.tsx')
        stop()
        stop()
        watchers[0].emit('rename', 'users/page.tsx')
        t.mock.timers.tick(100)
        await settle()
        assert.equal(watchers[0].closes, 1)
        assert.equal(batches.length, 0)
        start()
        assert.equal(watchers.length, 2)
    })

    it('stops the current watcher by output when automatic watching is disabled', async t => {
        const { watchers, batches, output, start } = setup(t)
        start()
        start()
        watchers[0].emit('rename', 'dashboard/page.tsx')
        stopWatchingRoutes(output)
        stopWatchingRoutes(output)
        t.mock.timers.tick(100)
        await settle()
        assert.equal(watchers[0].closes, 1)
        assert.equal(batches.length, 0)
        start()
        assert.equal(watchers.length, 2)
    })

    it('rejects invalid debounce delays before opening a watcher', t => {
        const { watchers, generator, output } = setup(t)
        for (const debounceMs of [-1, NaN, Infinity]) {
            assert.throws(
                () => watchRoutes('src/app', output, generator, { debounceMs }),
                /finite, non-negative/,
            )
        }
        assert.equal(watchers.length, 0)
    })

    it('discards queued work when shutdown occurs during a generation', async t => {
        const { watchers, batches, start } = setup(t)
        let finish!: () => void
        const blocked = new Promise<void>(resolve => {
            finish = resolve
        })
        const generator = {
            async handleChanges(changes: readonly RouteChange[]) {
                batches.push([...changes])
                await blocked
            },
        } as unknown as RouteGenerator
        const stop = start(generator)
        watchers[0].emit('rename', 'first/page.tsx')
        t.mock.timers.tick(10)
        watchers[0].emit('rename', 'second/page.tsx')
        stop()
        finish()
        t.mock.timers.tick(100)
        await settle()
        assert.equal(batches.length, 1)
    })

    it('closes failed native watchers, reports errors, and permits restart', t => {
        const { watchers, generator, output, stops } = setup(t)
        const errors: unknown[] = []
        const onError = (error: unknown) => errors.push(error)
        stops.push(
            watchRoutes('src/app', output, generator, { onError, quiet: true }),
        )
        const error = new Error('watch failed')
        watchers[0].handle.emit('error', error)
        assert.deepEqual(errors, [error])
        assert.equal(watchers[0].closes, 1)
        stops.push(
            watchRoutes('src/app', output, generator, { onError, quiet: true }),
        )
        assert.equal(watchers.length, 2)
    })

    it('handles startup errors without leaving a registered watcher', t => {
        const { generator, output, stops } = setup(t)
        const errors: unknown[] = []
        const error = new Error('input unavailable')
        const nativeWatch = fs.watch
        t.mock.method(fs, 'watch', () => {
            throw error
        })
        const options = {
            quiet: true,
            onError: (value: unknown) => errors.push(value),
        }
        assert.throws(
            () => watchRoutes('src/app', output, generator, options),
            value => value === error,
        )
        assert.deepEqual(errors, [])
        t.mock.method(fs, 'watch', nativeWatch)
        stops.push(watchRoutes('src/app', output, generator, options))
    })

    it('reports generator rejections and keeps processing later events', async t => {
        const { watchers, batches, output, stops } = setup(t)
        const errors: unknown[] = []
        const error = new Error('generation failed')
        const generator = {
            async handleChanges(changes: readonly RouteChange[]) {
                batches.push([...changes])
                if (batches.length === 1) throw error
            },
        } as unknown as RouteGenerator
        stops.push(
            watchRoutes('src/app', output, generator, {
                debounceMs: 10,
                quiet: true,
                onError: value => errors.push(value),
            }),
        )
        watchers[0].emit('rename', 'first/page.tsx')
        t.mock.timers.tick(10)
        await settle()
        assert.deepEqual(errors, [error])
        watchers[0].emit('rename', 'second/page.tsx')
        t.mock.timers.tick(10)
        await settle()
        assert.equal(batches.length, 2)
        assert.equal(watchers[0].closes, 0)
    })
})
