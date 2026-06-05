import { watch } from 'node:fs'
import { resolve } from 'node:path'
import { generate } from './generate.ts'

type NextConfig = Record<string, unknown>

export type PluginOptions = {
    input?: string
    output?: string
    extraRoutes?: string[]
    paramConstraints?: Record<string, string[]>
    watchDebounceMs?: number
}

export function withTypeRoutes(
    opts: PluginOptions = {},
): (nextConfig: NextConfig) => NextConfig {
    const dir = resolve(opts.input ?? 'src/app')
    const outPath = resolve(opts.output ?? 'src/lib/routes.ts')
    const extraRoutes = opts.extraRoutes
    const paramConstraints = opts.paramConstraints
    const debounceMs = opts.watchDebounceMs ?? 300

    generate(dir, outPath, extraRoutes, paramConstraints)

    return (nextConfig: NextConfig): NextConfig => {
        const isDev = process.env.NODE_ENV === 'development'

        if (isDev) {
            let timer: ReturnType<typeof setTimeout> | null = null

            try {
                watch(dir, { recursive: true }, (event, filename) => {
                    if (!filename) return
                    const base = filename.split(/[/\\]/).pop() ?? ''
                    if (base !== 'page.tsx' && base !== 'route.ts') return
                    if (timer) clearTimeout(timer)
                    timer = setTimeout(() => {
                        console.log(
                            `[type-routes] Change detected: ${filename}`,
                        )
                        generate(dir, outPath, extraRoutes, paramConstraints)
                    }, debounceMs)
                })
                console.log(`[type-routes] Watching ${dir}`)
            } catch (err) {
                console.error(
                    `[type-routes] Failed to start file watcher for ${dir}`,
                    err,
                )
            }
        }

        return nextConfig
    }
}
