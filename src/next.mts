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
    (filePath: string) => filePath.endsWith('page.tsx') && cli(),
    200,
)

export function withTypeRoute(nextConfig: NextConfig = {}): NextConfig {
    cli()
    return {
        ...nextConfig,
        webpack(config, options) {
            const dirPath = join(options.dir, 'src', 'app')

            // Usamos fs.watch para observar el directorio
            const watcher = watch(dirPath, { persistent: true })

            watcher.on('change', filePath => {
                if (
                    filePath.endsWith('page.tsx') ||
                    filePath.endsWith('page.js')
                ) {
                    debounceCli(filePath)
                }
            })

            return typeof nextConfig.webpack === 'function'
                ? nextConfig.webpack(config, options)
                : config
        },
    }
}

export default withTypeRoute
