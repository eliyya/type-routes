import { build } from 'esbuild'
import path from 'node:path'
import { promises as fs } from 'node:fs'

await build({
    entryPoints: {
        cli: 'src/cli.ts',
        Tree: 'src/Tree.ts',
        index: 'src/index.ts',
    },
    outdir: 'lib',
    platform: 'node',
    format: 'esm',
    minify: true,
    bundle: false,
    outbase: 'src',
    tsconfig: 'tsconfig.json',
})
const filePath = path.resolve('lib/cli.js')
const content = await fs.readFile(filePath, 'utf8')
const fixed = content.replace(/Tree\.ts/g, 'Tree.js')
await fs.writeFile(filePath, fixed)