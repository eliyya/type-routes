#!/usr/bin/env node
import { join, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { Node, TypeRouteConfig } from './Tree.mjs'

const ROOT_DIR = join(process.env.INIT_CWD || process.cwd(), 'src', 'app')

if (
    import.meta.url.replace(/\\/g, '/') ===
    `file:///${process.argv[1]}`.replace(/\\/g, '/')
) {
    cli()
    console.log('[type-routes] Routes typed')
}


export function cli(typeRouteConfig: TypeRouteConfig = {}) {
    const root = new Node(ROOT_DIR, typeRouteConfig)
    writeFileSync(
        resolve(import.meta.dirname, './index.d.mts'),
        root.generateTypeScriptFile(),
    )
    writeFileSync(
        resolve(import.meta.dirname, './index.mjs'),
        root.generateJavaScriptFile(),
    )
}
