import fs, { type FSWatcher } from 'node:fs'
import { resolve } from 'node:path'
import type { RouteChange, RouteGenerator } from './generate.ts'

export type RouteWatchOptions = {
    debounceMs?: number
    quiet?: boolean
    onError?: (error: unknown) => void
}

type WatchState = {
    dir: string
    debounceMs: number
    quiet: boolean
    onError?: (error: unknown) => void
    generator: RouteGenerator
    owner: symbol
    close: () => void
}

const registryKey = Symbol.for('@eliyya/type-routes/watchers')
const registryHost = globalThis as typeof globalThis & {
    [registryKey]?: Map<string, WatchState>
}
const registry = (registryHost[registryKey] ??= new Map())

function pathKey(path: string): string {
    const absolute = resolve(path)
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

export function stopWatchingRoutes(outPath: string): void {
    registry.get(pathKey(outPath))?.close()
}

export function watchRoutes(
    dir: string,
    outPath: string,
    generator: RouteGenerator,
    options: RouteWatchOptions = {},
): () => void {
    const input = resolve(dir)
    const output = pathKey(outPath)
    const debounceMs = options.debounceMs ?? 300
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
        throw new RangeError(
            'watch debounceMs must be a finite, non-negative number',
        )
    }
    const quiet = options.quiet ?? false
    const owner = Symbol()
    const previous = registry.get(output)

    if (
        previous?.dir === input &&
        previous.debounceMs === debounceMs &&
        previous.quiet === quiet
    ) {
        previous.generator = generator
        previous.onError = options.onError
        previous.owner = owner
        return () => {
            if (previous.owner === owner) previous.close()
        }
    }
    previous?.close()

    let watcher: FSWatcher | undefined
    let timer: ReturnType<typeof setTimeout> | null = null
    let running = false
    let closed = false
    const pending = new Map<string | null, RouteChange['event']>()
    const state: WatchState = {
        dir: input,
        debounceMs,
        quiet,
        onError: options.onError,
        generator,
        owner,
        close() {
            if (closed) return
            closed = true
            if (timer) clearTimeout(timer)
            timer = null
            pending.clear()
            if (registry.get(output) === state) registry.delete(output)
            watcher?.close()
        },
    }

    function reportError(error: unknown): void {
        try {
            if (state.onError) state.onError(error)
            else console.error(`[type-routes] Failed to watch ${input}`, error)
        } catch (callbackError) {
            console.error(
                '[type-routes] Watch error handler failed',
                callbackError,
            )
        }
    }

    async function drain(): Promise<void> {
        if (closed || running || pending.size === 0) return
        const changes = [...pending].map(([filename, event]) => ({
            event,
            filename,
        }))
        pending.clear()
        running = true
        try {
            if (!state.quiet) {
                console.log(
                    `[type-routes] Change detected: ${changes
                        .map(({ filename }) => filename ?? input)
                        .join(', ')}`,
                )
            }
            await state.generator.handleChanges(changes)
        } catch (error) {
            if (!closed) reportError(error)
        } finally {
            running = false
            if (!closed && !timer && pending.size > 0) void drain()
        }
    }

    registry.set(output, state)
    try {
        watcher = fs.watch(input, { recursive: true }, (event, filename) => {
            if (closed) return
            if (filename !== null) {
                const changed = pathKey(resolve(input, filename))
                if (
                    changed === output ||
                    (changed.startsWith(output) &&
                        /^\.[^/\\]*\.tmp$/.test(changed.slice(output.length)))
                )
                    return
            }
            if (event === 'change' && filename !== null) {
                const base = filename.split(/[/\\]/).pop()
                if (base !== 'page.tsx' && base !== 'route.ts') return
            }
            if (pending.get(filename) !== 'rename') pending.set(filename, event)
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                timer = null
                void drain()
            }, state.debounceMs)
        })
        watcher.on('error', error => {
            state.close()
            reportError(error)
        })
        watcher.on('close', state.close)
        if (!quiet) console.log(`[type-routes] Watching ${input}`)
    } catch (error) {
        state.close()
        throw error
    }

    return () => {
        if (state.owner === owner) state.close()
    }
}
