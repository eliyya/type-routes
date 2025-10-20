import { cli } from './cli.mjs'
import type { NextConfig } from 'next'
import { watch } from 'node:fs'
import { join } from 'node:path'
import type { TypeRouteConfig } from './Tree.mjs'

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
    (filePath: string, typeRouteConfig: TypeRouteConfig) => filePath.endsWith('page.tsx') && cli(typeRouteConfig),
    200,
)


export function withTypeRoute(nextConfig: NextConfig = {}, typeRouteConfig: TypeRouteConfig = {}): NextConfig {
    cli(typeRouteConfig)
    return {
        ...nextConfig,
        webpack(config, options) {
            const dirPath = join(options.dir, 'src', 'app')

            const watcher = watch(dirPath, { persistent: true })

            watcher.on('change', filePath => {
                if (
                    filePath.endsWith('page.tsx') ||
                    filePath.endsWith('page.js')
                ) {
                    debounceCli(filePath, typeRouteConfig)
                }
            })

            return typeof nextConfig.webpack === 'function'
                ? nextConfig.webpack(config, options)
                : config
        },
    }
}
export { TypeRouteConfig }
export default withTypeRoute
