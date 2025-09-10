import { cli } from './cli.mjs'
import type { NextConfig } from 'next'
import { watch } from 'node:fs'
import { join } from 'node:path'

function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    wait: number,
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null
    return (...args: Parameters<T>): void => {
        if (timeoutId !== null) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => func(...args), wait)
    }
}

const debounceCli = debounce(
    (filePath: string, options: WithTypeRouteOptions) => filePath.endsWith('page.tsx') && cli(options),
    200,
)

export interface WithTypeRouteOptions {
    extraRoutes?: string[]
}



export function withTypeRoute(options: WithTypeRouteOptions): NextConfig
/**
 * @deprecated
 * Usa la forma `withTypeRoute(options: WithTypeRouteOptions, nextConfig: NextConfig)` en su lugar.
 */
export function withTypeRoute(options: NextConfig): NextConfig
export function withTypeRoute(options: WithTypeRouteOptions, nextConfig:  NextConfig): NextConfig
export function withTypeRoute(options: WithTypeRouteOptions, nextConfig?:  NextConfig): NextConfig {
    if (!nextConfig && "extraRoutes" in options) return withTypeRoute(options, {})
    if (!nextConfig) return withTypeRoute({ extraRoutes: [] }, options)

    cli({ extraRoutes: options.extraRoutes ?? [] })
    return {
        ...nextConfig,
        webpack(config, woptions) {
            const dirPath = join(woptions.dir, 'src', 'app')

            // Usamos fs.watch para observar el directorio
            const watcher = watch(dirPath, { persistent: true })

            watcher.on('change', filePath => {
                if (
                    filePath.endsWith('page.tsx') ||
                    filePath.endsWith('page.js')
                ) {
                    debounceCli(filePath, { extraRoutes: options.extraRoutes ?? [] })
                }
            })

            return typeof nextConfig.webpack === 'function'
                ? nextConfig.webpack(config, woptions)
                : config
        },
    }
}


export default withTypeRoute