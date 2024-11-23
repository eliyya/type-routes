import { cli } from './cli.mjs'
import type { NextConfig } from 'next'
import { watch } from 'chokidar'
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
            watch(join(options.dir, 'src', 'app'), {
                ignoreInitial: true,
                persistent: true,
                awaitWriteFinish: true,
            })
                .on('add', debounceCli)
                .on('unlink', debounceCli)
            return typeof nextConfig.webpack === 'function'
                ? nextConfig.webpack(config, options)
                : config
        },
    }
}
export default withTypeRoute
