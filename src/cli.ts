#!/usr/bin/env node
import { join, resolve } from 'node:path'
import { writeFileSync, watch } from 'node:fs'
import { Node, type TypeRouteConfig } from './Tree.ts'
import { NextConfig } from 'next'

const ROOT_DIR = join(process.env.INIT_CWD || process.cwd(), 'src', 'app')

if (
    import.meta.url.replace(/\\/g, '/') ===
    `file:///${process.argv[1]}`.replace(/\\/g, '/')
) {
    cli()
    // eslint-disable-next-line no-console
    console.log('[type-routes] Routes typed')
}


export function cli(typeRouteConfig: TypeRouteConfig = {}) {
    const root = new Node(ROOT_DIR, typeRouteConfig)
    writeFileSync(
        resolve(import.meta.dirname, './index.d.ts'),
        root.generateTypeScriptFile(),
    )
    writeFileSync(
        resolve(import.meta.dirname, './index.js'),
        root.generateJavaScriptFile(),
    )
}

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