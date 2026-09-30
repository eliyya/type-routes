import { resolve } from 'node:path'
import { RouteGenerator } from './generate.ts'
import { stopWatchingRoutes, watchRoutes } from './watch.ts'

type NextConfig = Record<string, unknown>

export type PluginOptions = {
    input?: string
    output?: string
    extraRoutes?: string[]
    paramConstraints?: Record<string, string[]>
    watchDebounceMs?: number
    quiet?: boolean
    watch?: boolean
}

export function defineTypeRouteConfig(
    opts: PluginOptions = {},
): (nextConfig: NextConfig) => NextConfig {
    const dir = resolve(opts.input ?? 'src/app')
    const outPath = resolve(opts.output ?? 'src/lib/routes.ts')
    const debounceMs = opts.watchDebounceMs ?? 300
    const quiet = opts.quiet ?? false
    const generator = new RouteGenerator(dir, outPath, {
        extraRoutes: opts.extraRoutes,
        paramConstraints: opts.paramConstraints,
        quiet,
    })

    generator.generateSync()

    return (nextConfig: NextConfig): NextConfig => {
        const isDev = process.env.NODE_ENV === 'development'

        if (isDev && opts.watch !== false) {
            try {
                watchRoutes(dir, outPath, generator, {
                    debounceMs,
                    quiet,
                    onError: (err) => {
                        console.error(
                            `[type-routes] Failed to update routes for ${dir}`,
                            err,
                        )
                    },
                })
            } catch (err) {
                console.error(
                    `[type-routes] Failed to start file watcher for ${dir}`,
                    err,
                )
            }
        } else {
            stopWatchingRoutes(outPath)
        }

        return nextConfig
    }
}
