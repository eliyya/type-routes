import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
    promises as fs,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmdirSync,
    rmSync,
    statSync,
    unlinkSync,
    utimesSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, basename, join, resolve } from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import {
    generate,
    generateAsync,
    getRoutePaths,
    getRoutePathsSync,
    RouteGenerator,
} from './generate.ts'

function createFixture(t: TestContext): {
    root: string
    appDir: string
    outPath: string
} {
    const root = mkdtempSync(join(tmpdir(), 'type-routes-'))
    t.after(() => {
        assert.equal(dirname(resolve(root)), resolve(tmpdir()))
        assert.ok(basename(root).startsWith('type-routes-'))
        rmSync(root, { recursive: true, force: true })
    })
    return {
        root,
        appDir: join(root, 'src', 'app'),
        outPath: join(root, 'src', 'lib', 'routes.ts'),
    }
}

function createRoute(appDir: string, route: string): void {
    const routeDir = join(appDir, route)
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(
        join(routeDir, 'page.tsx'),
        'export default function Page() {}\n',
    )
}

function installCachedFixture(outPath: string): string {
    const inputLine = readFileSync(outPath, 'utf-8').split('\n')[1]
    const code =
        '// Fixture retained only when generation is skipped before building the tree.\n'
    const hash = createHash('sha256').update(code).digest('hex')
    const fixture = `// @type-routes-hash: ${hash}\n${inputLine}\n${code}`
    writeFileSync(outPath, fixture)
    return fixture
}

describe('getRoutePaths', () => {
    it('uses the input directory as root when an ancestor is named app', async t => {
        const { root } = createFixture(t)
        const appDir = join(root, 'app', 'src', 'app')
        createRoute(appDir, '')
        createRoute(appDir, '(marketing)/dashboard')
        createRoute(appDir, 'app/settings')
        mkdirSync(join(appDir, 'api'), { recursive: true })
        writeFileSync(
            join(appDir, 'api', 'route.ts'),
            'export function GET() {}\n',
        )
        const expected = [
            'app/api/route.ts',
            'app/app/settings/page.tsx',
            'app/dashboard/page.tsx',
            'app/page.tsx',
        ]
        assert.deepEqual(getRoutePathsSync(appDir), expected)
        assert.deepEqual(await getRoutePaths(appDir), expected)
    })

    it('supports an input directory with a custom name and deduplicates route groups', t => {
        const { root } = createFixture(t)
        const appDir = join(root, 'custom-routes')
        createRoute(appDir, '(first)/users/[id]')
        createRoute(appDir, '(second)/users/[id]')
        assert.deepEqual(getRoutePathsSync(appDir), ['app/users/[id]/page.tsx'])
    })
})

describe('generate', () => {
    it('persists independent SHA-256 hashes for content and canonical generation inputs', t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'dashboard')
        generate(appDir, outPath, undefined, undefined, true)
        const [header, inputHeader, ...bodyLines] = readFileSync(
            outPath,
            'utf-8',
        ).split('\n')
        const expectedHash = createHash('sha256')
            .update(bodyLines.join('\n'))
            .digest('hex')
        assert.equal(header, `// @type-routes-hash: ${expectedHash}`)
        assert.match(
            inputHeader,
            /^\/\/ @type-routes-input-hash: [a-f0-9]{64}$/,
        )
    })

    it('skips tree/code generation with the same fingerprint across new sync and async instances', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'dashboard')
        generate(appDir, outPath, undefined, undefined, true)
        const fixture = installCachedFixture(outPath)
        const oldTime = new Date('2020-01-01T00:00:00.000Z')
        utimesSync(outPath, oldTime, oldTime)
        generate(appDir, outPath, undefined, undefined, true)
        await generateAsync(appDir, outPath, undefined, undefined, true)
        assert.equal(readFileSync(outPath, 'utf-8'), fixture)
        assert.equal(statSync(outPath).mtimeMs, oldTime.getTime())
    })

    it('invalidates the cache when route structure changes', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'dashboard')
        await generateAsync(appDir, outPath, undefined, undefined, true)
        const original = readFileSync(outPath, 'utf-8')
        createRoute(appDir, 'settings')
        await generateAsync(appDir, outPath, undefined, undefined, true)
        const updated = readFileSync(outPath, 'utf-8')
        assert.notEqual(updated, original)
        assert.match(updated, /settings/)
    })

    it('canonicalizes extra paths and constraint keys/values before checking the cache', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'users/[id]')
        generate(
            appDir,
            outPath,
            ['/extra/', '/extra'],
            { id: ['b', 'a', 'b'], unused: ['z'] },
            true,
        )
        const fixture = installCachedFixture(outPath)
        await generateAsync(
            appDir,
            outPath,
            ['extra', '\\extra\\'],
            { unused: ['z'], $id: ['a', 'b'] },
            true,
        )
        assert.equal(readFileSync(outPath, 'utf-8'), fixture)
    })

    it('invalidates constraints and extra routes even when filesystem paths are unchanged', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'users/[id]')
        generate(appDir, outPath, ['/login'], { id: ['a'] }, true)
        const initial = readFileSync(outPath, 'utf-8')
        await generateAsync(appDir, outPath, ['/login'], { id: ['b'] }, true)
        const constrained = readFileSync(outPath, 'utf-8')
        assert.notEqual(constrained, initial)
        assert.match(constrained, /\$id: 'b'/)
        await generateAsync(appDir, outPath, ['/logout'], { id: ['b'] }, true)
        const extra = readFileSync(outPath, 'utf-8')
        assert.notEqual(extra, constrained)
        assert.match(extra, /logout/)
        assert.doesNotMatch(extra, /login/)
    })

    it('repairs edits with stale hash headers and recreates a deleted output', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'dashboard')
        generate(appDir, outPath, undefined, undefined, true)
        const original = readFileSync(outPath, 'utf-8')
        writeFileSync(outPath, original.replace('dashboard', 'corrupted'))
        await generateAsync(appDir, outPath, undefined, undefined, true)
        assert.equal(readFileSync(outPath, 'utf-8'), original)
        unlinkSync(outPath)
        generate(appDir, outPath, undefined, undefined, true)
        assert.equal(readFileSync(outPath, 'utf-8'), original)
    })

    it('migrates output with only the old content-hash header', t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'dashboard')
        generate(appDir, outPath, undefined, undefined, true)
        const original = readFileSync(outPath, 'utf-8')
        writeFileSync(
            outPath,
            original
                .split('\n')
                .filter((_, index) => index !== 1)
                .join('\n'),
        )
        generate(appDir, outPath, undefined, undefined, true)
        assert.equal(readFileSync(outPath, 'utf-8'), original)
    })

    it('produces identical sync/async output and accepts an empty route directory', async t => {
        const { appDir, outPath, root } = createFixture(t)
        createRoute(appDir, '[id]/settings')
        createRoute(appDir, '')
        generate(appDir, outPath, ['/logout'], { id: ['b', 'a'] }, true)
        const otherOut = join(root, 'async.ts')
        await generateAsync(
            appDir,
            otherOut,
            ['/logout'],
            { id: ['b', 'a'] },
            true,
        )
        assert.equal(
            readFileSync(otherOut, 'utf-8'),
            readFileSync(outPath, 'utf-8'),
        )
        const emptyDir = join(root, 'empty')
        mkdirSync(emptyDir)
        await generateAsync(emptyDir, otherOut, undefined, undefined, true)
        assert.match(
            readFileSync(otherOut, 'utf-8'),
            /export const app = \{\} as App/,
        )
    })

    it('propagates input/output filesystem errors from sync and async APIs', async t => {
        const { appDir, outPath } = createFixture(t)
        assert.throws(
            () => generate(appDir, outPath, undefined, undefined, true),
            { code: 'ENOENT' },
        )
        await assert.rejects(
            generateAsync(appDir, outPath, undefined, undefined, true),
            { code: 'ENOENT' },
        )
        createRoute(appDir, '')
        mkdirSync(outPath, { recursive: true })
        assert.throws(() =>
            generate(appDir, outPath, undefined, undefined, true),
        )
        await assert.rejects(
            generateAsync(appDir, outPath, undefined, undefined, true),
        )
        assert.deepEqual(readdirSync(dirname(outPath)), ['routes.ts'])
    })
})

describe('RouteGenerator watcher index', () => {
    it('avoids recursive scans and tree generation for content and atomic-save events', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'dashboard')
        const generator = new RouteGenerator(appDir, outPath, { quiet: true })
        generator.generateSync()
        const fixture = installCachedFixture(outPath)
        const scans = t.mock.method(fs, 'readdir')
        writeFileSync(join(appDir, 'dashboard', 'page.tsx'), 'changed JSX')
        await generator.handleChange('change', 'dashboard/page.tsx')
        const temporary = join(appDir, 'dashboard', '.page.tmp')
        writeFileSync(temporary, 'atomic replacement')
        renameSync(temporary, join(appDir, 'dashboard', 'page.tsx'))
        await generator.handleChanges([
            { event: 'rename', filename: 'dashboard/page.tsx' },
            { event: 'change', filename: 'dashboard/page.tsx' },
        ])
        assert.equal(scans.mock.callCount(), 0)
        assert.equal(readFileSync(outPath, 'utf-8'), fixture)
    })

    it('checks output integrity even when only page content changes', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'dashboard')
        const generator = new RouteGenerator(appDir, outPath, { quiet: true })
        generator.generateSync()
        const original = readFileSync(outPath, 'utf-8')
        const scans = t.mock.method(fs, 'readdir')
        unlinkSync(outPath)
        await generator.handleChange('change', 'dashboard/page.tsx')
        assert.equal(readFileSync(outPath, 'utf-8'), original)
        writeFileSync(outPath, `${original}\n// unexpected edit`)
        await generator.handleChange('change', 'dashboard/page.tsx')
        assert.equal(readFileSync(outPath, 'utf-8'), original)
        assert.equal(scans.mock.callCount(), 0)
    })

    it('updates physical files in a batch without scanning and preserves grouped duplicates', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, '(first)/dashboard')
        createRoute(appDir, '(second)/dashboard')
        const generator = new RouteGenerator(appDir, outPath, { quiet: true })
        generator.generateSync()
        const original = readFileSync(outPath, 'utf-8')
        const scans = t.mock.method(fs, 'readdir')
        unlinkSync(join(appDir, '(first)', 'dashboard', 'page.tsx'))
        await generator.handleChange('rename', '(first)/dashboard/page.tsx')
        assert.equal(readFileSync(outPath, 'utf-8'), original)
        createRoute(appDir, 'settings')
        createRoute(appDir, 'account')
        const writes = t.mock.method(fs, 'writeFile')
        await generator.handleChanges([
            { event: 'rename', filename: 'settings/page.tsx' },
            { event: 'rename', filename: 'account/page.tsx' },
        ])
        const output = readFileSync(outPath, 'utf-8')
        assert.match(output, /settings/)
        assert.match(output, /account/)
        assert.equal(scans.mock.callCount(), 0)
        assert.equal(writes.mock.callCount(), 1)
    })

    it('reconciles directory moves, deletion, and unknown event names once per batch', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'before/nested')
        const generator = new RouteGenerator(appDir, outPath, { quiet: true })
        generator.generateSync()
        const scans = t.mock.method(fs, 'readdir')
        renameSync(join(appDir, 'before'), join(appDir, 'after'))
        await generator.handleChanges([
            { event: 'rename', filename: 'before' },
            { event: 'rename', filename: 'after' },
            { event: 'rename', filename: null },
        ])
        assert.equal(scans.mock.callCount(), 1)
        assert.match(readFileSync(outPath, 'utf-8'), /after/)
        assert.doesNotMatch(readFileSync(outPath, 'utf-8'), /before/)
        unlinkSync(join(appDir, 'after', 'nested', 'page.tsx'))
        await generator.handleChange('rename', 'after')
        assert.match(
            readFileSync(outPath, 'utf-8'),
            /export const app = \{\} as App/,
        )
        assert.equal(scans.mock.callCount(), 2)
    })

    it('serializes concurrent changes without losing either route and recovers after an error', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, '')
        const generator = new RouteGenerator(appDir, outPath, { quiet: true })
        generator.generateSync()
        createRoute(appDir, 'first')
        createRoute(appDir, 'second')
        await Promise.all([
            generator.handleChange('rename', 'first/page.tsx'),
            generator.handleChange('rename', 'second/page.tsx'),
        ])
        const output = readFileSync(outPath, 'utf-8')
        assert.match(output, /first/)
        assert.match(output, /second/)
        const failure = new Error('denied')
        const stat = t.mock.method(
            fs,
            'stat',
            async () => {
                throw failure
            },
            { times: 1 },
        )
        await assert.rejects(
            generator.handleChange('change', 'page.tsx'),
            failure,
        )
        stat.mock.restore()
        await generator.handleChange('change', 'page.tsx')
        assert.equal(readFileSync(outPath, 'utf-8'), output)
    })

    it('reconciles moved and deleted directories whose names match route files', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, 'page.tsx/nested')
        const generator = new RouteGenerator(appDir, outPath, { quiet: true })
        generator.generateSync()
        const original = readFileSync(outPath, 'utf-8')
        const scans = t.mock.method(fs, 'readdir')
        renameSync(join(appDir, 'page.tsx'), join(appDir, 'route.ts'))
        await generator.handleChange('rename', 'page.tsx')
        const moved = readFileSync(outPath, 'utf-8')
        assert.notEqual(moved.split('\n')[1], original.split('\n')[1])
        assert.equal(scans.mock.callCount(), 1)
        unlinkSync(join(appDir, 'route.ts', 'nested', 'page.tsx'))
        rmdirSync(join(appDir, 'route.ts', 'nested'))
        rmdirSync(join(appDir, 'route.ts'))
        await generator.handleChange('rename', 'route.ts')
        assert.match(
            readFileSync(outPath, 'utf-8'),
            /export const app = \{\} as App/,
        )
        assert.equal(scans.mock.callCount(), 2)
    })

    it('prevents stale async commits after newer sync config and removes temporary files', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, '')
        let release!: () => void
        const gate = new Promise<void>(done => {
            release = done
        })
        let entered!: () => void
        const started = new Promise<void>(done => {
            entered = done
        })
        const originalWrite = fs.writeFile
        const writes = t.mock.method(
            fs,
            'writeFile',
            async (...args: Parameters<typeof fs.writeFile>) => {
                await originalWrite(...args)
                entered()
                await gate
            },
            { times: 1 },
        )
        const older = new RouteGenerator(appDir, outPath, {
            extraRoutes: ['/old'],
            quiet: true,
        }).generate()
        await started
        new RouteGenerator(appDir, outPath, {
            extraRoutes: ['/new'],
            quiet: true,
        }).generateSync()
        release()
        await older
        writes.mock.restore()
        const output = readFileSync(outPath, 'utf-8')
        assert.match(output, /new/)
        assert.doesNotMatch(output, /old/)
        assert.deepEqual(readdirSync(dirname(outPath)), ['routes.ts'])
    })

    it('preserves a newer sync index when an older async scan finishes on the same instance', async t => {
        const { appDir, outPath } = createFixture(t)
        createRoute(appDir, '')
        const generator = new RouteGenerator(appDir, outPath, { quiet: true })
        let release!: () => void
        const gate = new Promise<void>(done => {
            release = done
        })
        let entered!: () => void
        const started = new Promise<void>(done => {
            entered = done
        })
        const originalRead = fs.readdir
        const scan = t.mock.method(
            fs,
            'readdir',
            async (...args: Parameters<typeof fs.readdir>) => {
                const result = await originalRead(...args)
                entered()
                await gate
                return result
            },
            { times: 1 },
        )
        const older = generator.generate()
        await started
        createRoute(appDir, 'newest')
        generator.generateSync()
        release()
        await older
        scan.mock.restore()
        const fixture = installCachedFixture(outPath)
        await generator.handleChange('change', 'page.tsx')
        assert.equal(readFileSync(outPath, 'utf-8'), fixture)
    })
})
