#!/usr/bin/env node
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Folder, Root } from './Tree.mjs'

const ROOT_DIR = join(process.cwd(), 'src', 'app')

function generateRoutes(dir: string, parentRoute: Folder | Root) {
    const files = readdirSync(dir)
    for (const file of files) {
        const fullPath = join(dir, file)
        const fileStat = statSync(fullPath)
        if (fileStat.isDirectory()) {
            const route = new Folder(file, parentRoute)
            parentRoute.children.push(route)
            generateRoutes(fullPath, route)
        } else if (fileStat.isFile() && file === 'page.tsx')
            parentRoute.hasPage = true
    }
    return parentRoute
}

if (import.meta.url === `file://${process.argv[1]}`) {
    cli()
    console.log('[type-routes] Routes typed')
}

export function cli() {
    const root = generateRoutes(ROOT_DIR, new Root())
    root.purge()
    writeFileSync(
        resolve(import.meta.dirname, '../lib/index.d.mts'),
        root.generateTypeFile(),
    )
    writeFileSync(
        resolve(import.meta.dirname, '../lib/index.mjs'),
        root.generateJavaScriptFile(),
    )
}
