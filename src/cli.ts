#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { RouteGenerator } from './generate.ts'
import { watchRoutes } from './watch.ts'

function printHelp(): void {
    process.stdout.write(
        [
            'Usage: type-routes [options]',
            '',
            'Options:',
            '  -i, --input <dir>        App directory (default: src/app)',
            '  -o, --output <file>      Output file   (default: src/lib/routes.ts)',
            '  -w, --watch              Watch for changes',
            '      --debounce-ms <ms>   Debounce delay (default: 300)',
            '  -e, --extra <route>      Extra route path (can be repeated)',
            '  -h, --help               Show this help',
            '',
        ].join('\n'),
    )
    process.exit(0)
}

const { values } = parseArgs({
    options: {
        input: { type: 'string', short: 'i', default: 'src/app' },
        output: { type: 'string', short: 'o', default: 'src/lib/routes.ts' },
        watch: { type: 'boolean', short: 'w', default: false },
        'debounce-ms': { type: 'string', default: '300' },
        extra: { type: 'string', short: 'e', multiple: true, default: [] },
        help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
})

if (values.help) printHelp()

const dir = resolve(values.input)
const out = resolve(values.output)
const debMs = Number(values['debounce-ms'])

const generator = new RouteGenerator(dir, out, { extraRoutes: values.extra })
let stopWatching: (() => void) | undefined

try {
    await generator.generate()
} catch (err) {
    console.error(`[type-routes] Failed to generate ${out}`, err)
    process.exit(1)
}

if (values.watch) {
    try {
        stopWatching = watchRoutes(dir, out, generator, {
            debounceMs: debMs,
            onError: (err) => {
                console.error(`[type-routes] Failed to update routes for ${dir}`, err)
                process.exitCode = 1
            },
        })
    } catch (err) {
        console.error(`[type-routes] Failed to watch ${dir}`, err)
        process.exit(1)
    }
}

process.on('SIGINT', () => {
    stopWatching?.()
    process.exit(0)
})
