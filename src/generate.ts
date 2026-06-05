import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { buildTree, generateRuntimeFile } from './index.ts'

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
    return [...new Set(paths)]
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

    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, code, 'utf-8')
    console.log(`[type-routes] Generated ${outPath}`)
}
