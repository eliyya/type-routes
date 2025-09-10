#!/usr/bin/env node
import { join, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { Node } from './Tree.mjs'

const ROOT_DIR = join(process.env.INIT_CWD || process.cwd(), 'src', 'app')

if (
    import.meta.url.replace(/\\/g, '/') ===
    `file:///${process.argv[1]}`.replace(/\\/g, '/')
) {
    cli()
    // eslint-disable-next-line no-console
    console.log('[type-routes] Routes typed')
}

export function cli({ extraRoutes = [] }: { extraRoutes?: string[] } = {}) {
    const root = new Node(ROOT_DIR, { extraRoutes })
    
    writeFileSync(
        resolve(import.meta.dirname, './index.d.mts'),
        root.generateTypeScriptFile(),
    )
    writeFileSync(
        resolve(import.meta.dirname, './index.mjs'),
        root.generateJavaScriptFile(),
    )
}
