import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    statSync,
    utimesSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { generate } from './generate.ts'

function createRoute(appDir: string, route: string): void {
    const routeDir = join(appDir, route)
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(join(routeDir, 'page.tsx'), 'export default function Page() {}\n')
}

describe('generate', () => {
    it('writes a SHA-256 hash comment for the generated content', () => {
        const root = mkdtempSync(join(tmpdir(), 'type-routes-'))
        const appDir = join(root, 'src', 'app')
        const outPath = join(root, 'src', 'lib', 'routes.ts')
        createRoute(appDir, 'dashboard')

        generate(appDir, outPath)

        const output = readFileSync(outPath, 'utf-8')
        const [header, ...bodyLines] = output.split('\n')
        const body = bodyLines.join('\n')
        const expectedHash = createHash('sha256').update(body).digest('hex')
        assert.equal(header, `// @type-routes-hash: ${expectedHash}`)
    })

    it('does not rewrite the output when the generated hash is unchanged', () => {
        const root = mkdtempSync(join(tmpdir(), 'type-routes-'))
        const appDir = join(root, 'src', 'app')
        const outPath = join(root, 'src', 'lib', 'routes.ts')
        createRoute(appDir, 'dashboard')
        generate(appDir, outPath)

        const original = readFileSync(outPath, 'utf-8')
        const oldTime = new Date('2020-01-01T00:00:00.000Z')
        utimesSync(outPath, oldTime, oldTime)

        generate(appDir, outPath)

        assert.equal(readFileSync(outPath, 'utf-8'), original)
        assert.equal(statSync(outPath).mtimeMs, oldTime.getTime())
    })

    it('rewrites the output when the generated hash changes', () => {
        const root = mkdtempSync(join(tmpdir(), 'type-routes-'))
        const appDir = join(root, 'src', 'app')
        const outPath = join(root, 'src', 'lib', 'routes.ts')
        createRoute(appDir, 'dashboard')
        generate(appDir, outPath)
        const original = readFileSync(outPath, 'utf-8')

        createRoute(appDir, 'settings')
        generate(appDir, outPath)

        const updated = readFileSync(outPath, 'utf-8')
        assert.notEqual(updated, original)
        assert.match(updated, /settings/)
    })
})
