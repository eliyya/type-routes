import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { buildTree, generateRuntimeFile } from './index.ts'

const HASH_PREFIX = '// @type-routes-hash: '

function hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex')
}

function getGeneratedHash(content: string): string | null {
    const firstLine = content.split(/\r?\n/, 1)[0]
    if (!firstLine.startsWith(HASH_PREFIX)) return null

    const hash = firstLine.slice(HASH_PREFIX.length)
    return /^[a-f0-9]{64}$/.test(hash) ? hash : null
}

export function getRoutePathsSync(dir: string): string[] {
    const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
    const paths = entries
        .filter((entry) => entry.isFile())
        .filter((entry) => entry.name === 'page.tsx' || entry.name === 'route.ts')
        .map((entry) => {
            const full = join(entry.parentPath, entry.name)
            const parts = full.split(/[/\\]/)
            return parts
                .slice(parts.indexOf('app'))
                .filter((s) => !/^\(.+\)$/.test(s))
                .join('/')
        })
    return [...new Set(paths)].sort()
}

function normalizeExtraRoute(route: string): string {
    const cleaned = route.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!cleaned) return 'app/page.tsx'
    return `app/${cleaned}/page.tsx`
}

export function generate(
    dir: string,
    outPath: string,
    extraRoutes?: string[],
    paramConstraints?: Record<string, string[]>,
): void {
    let paths: string[]
    try {
        paths = getRoutePathsSync(dir)
    } catch (err) {
        console.error(`[type-routes] Failed to read input directory: ${dir}`, err)
        return
    }

    if (extraRoutes && extraRoutes.length > 0) {
        paths.push(...extraRoutes.map(normalizeExtraRoute))
    }

    const tree = buildTree(paths, paramConstraints)
    const code = generateRuntimeFile(tree)
    const hash = hashContent(code)

    if (existsSync(outPath)) {
        const current = readFileSync(outPath, 'utf-8')
        if (getGeneratedHash(current) === hash) {
            console.log(`[type-routes] Unchanged ${outPath}`)
            return
        }
    }

    const output = `${HASH_PREFIX}${hash}\n${code}`

    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, output, 'utf-8')
    console.log(`[type-routes] Generated ${outPath}`)
}
