#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { watch } from 'node:fs'
import { resolve } from 'node:path'
import { generate } from './generate.ts'

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

generate(dir, out, values.extra)

if (values.watch) {
    let timer: ReturnType<typeof setTimeout> | null = null

    try {
        watch(dir, { recursive: true }, (event, filename) => {
            if (!filename) return
            const base = filename.split(/[/\\]/).pop() ?? ''
            if (base !== 'page.tsx' && base !== 'route.ts') return
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                console.log(`[type-routes] Change detected: ${filename}`)
                generate(dir, out, values.extra)
            }, debMs)
        })
        console.log(`[type-routes] Watching ${dir}`)
    } catch (err) {
        console.error(`[type-routes] Failed to watch ${dir}`, err)
        process.exit(1)
    }
}

process.on('SIGINT', () => {
    process.exit(0)
})
