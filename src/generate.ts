import {
    promises as fs,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join, dirname, relative, resolve, isAbsolute } from 'node:path'
import { buildTree, generateRuntimeFile } from './index.ts'

const HASH_PREFIX = '// @type-routes-hash: '
const INPUT_HASH_PREFIX = '// @type-routes-input-hash: '
// Increment whenever generated code or route normalization changes.
const GENERATOR_SCHEMA_VERSION = 1

// Requests replace earlier requests for the same output, including requests
// from another plugin instance after Next reloads its configuration.
const registryKey = Symbol.for('@eliyya/type-routes/generation-requests')
const registryHost = globalThis as typeof globalThis & {
    [registryKey]?: Map<string, symbol>
}
const latestRequests = (registryHost[registryKey] ??= new Map())

export type GenerateOptions = {
    extraRoutes?: string[]
    paramConstraints?: Record<string, string[]>
    quiet?: boolean
}

export type RouteChange = {
    event: 'change' | 'rename'
    filename: string | null
}

type PreparedInput = {
    paths: string[]
    constraints: Record<string, string[]>
    hash: string
}

function hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex')
}

function isMissingFile(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR'
}

function isRouteFile(filename: string): boolean {
    const name = filename.split(/[/\\]/).pop()
    return name === 'page.tsx' || name === 'route.ts'
}

function normalizeRoutePath(filename: string): string {
    return ['app', ...filename.split(/[/\\]/)]
        .filter(part => part && !/^\(.+\)$/.test(part))
        .join('/')
}

function normalizeExtraRoute(route: string): string {
    const cleaned = route
        .replaceAll('\\', '/')
        .split('/')
        .filter(Boolean)
        .join('/')
    return normalizeRoutePath(cleaned ? `${cleaned}/page.tsx` : 'page.tsx')
}

function getPhysicalRouteFilesSync(dir: string): Set<string> {
    return new Set(
        readdirSync(dir, { recursive: true, withFileTypes: true })
            .filter(entry => entry.isFile() && isRouteFile(entry.name))
            .map(entry =>
                relative(dir, join(entry.parentPath, entry.name)).replaceAll(
                    '\\',
                    '/',
                ),
            ),
    )
}

async function getPhysicalRouteFiles(dir: string): Promise<Set<string>> {
    const entries = await fs.readdir(dir, {
        recursive: true,
        withFileTypes: true,
    })
    return new Set(
        entries
            .filter(entry => entry.isFile() && isRouteFile(entry.name))
            .map(entry =>
                relative(dir, join(entry.parentPath, entry.name)).replaceAll(
                    '\\',
                    '/',
                ),
            ),
    )
}

function normalizePaths(files: Iterable<string>): string[] {
    return [...new Set([...files].map(normalizeRoutePath))].sort()
}

export function getRoutePathsSync(dir: string): string[] {
    return normalizePaths(getPhysicalRouteFilesSync(dir))
}

export async function getRoutePaths(dir: string): Promise<string[]> {
    return normalizePaths(await getPhysicalRouteFiles(dir))
}

function canonicalConstraints(
    constraints?: Record<string, string[]>,
): Record<string, string[]> {
    const normalized: Record<string, string[]> = {}
    for (const [key, values] of Object.entries(constraints ?? {})) {
        const param =
            key.startsWith('$') || key.startsWith('_') ? key : `$${key}`
        normalized[param] = [...new Set(values)].sort()
    }
    return Object.fromEntries(
        Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)),
    )
}

function readGeneratedOutput(
    content: string,
): { inputHash: string; contentHash: string; code: string } | null {
    const firstBreak = content.indexOf('\n')
    const secondBreak = content.indexOf('\n', firstBreak + 1)
    if (firstBreak < 0 || secondBreak < 0) return null
    const hashLine = content.slice(0, firstBreak).replace(/\r$/, '')
    const inputLine = content
        .slice(firstBreak + 1, secondBreak)
        .replace(/\r$/, '')
    if (
        !hashLine.startsWith(HASH_PREFIX) ||
        !inputLine.startsWith(INPUT_HASH_PREFIX)
    )
        return null
    const contentHash = hashLine.slice(HASH_PREFIX.length)
    const inputHash = inputLine.slice(INPUT_HASH_PREFIX.length)
    if (
        !/^[a-f0-9]{64}$/.test(contentHash) ||
        !/^[a-f0-9]{64}$/.test(inputHash)
    )
        return null
    const code = content.slice(secondBreak + 1)
    if (hashContent(code) !== contentHash) return null
    return { inputHash, contentHash, code }
}

function outputFor(input: PreparedInput): string {
    // An empty App Router directory still has a valid empty route object.
    const tree = buildTree(
        input.paths.length ? input.paths : ['app'],
        input.constraints,
    )
    const code = generateRuntimeFile(tree)
    return `${HASH_PREFIX}${hashContent(code)}\n${INPUT_HASH_PREFIX}${input.hash}\n${code}`
}

export class RouteGenerator {
    private readonly dir: string
    private readonly outPath: string
    private readonly outputKey: string
    private readonly extraRoutes: string[]
    private readonly constraints: Record<string, string[]>
    private readonly quiet: boolean
    private files: Set<string> | null = null
    private preparedInput: PreparedInput | null = null
    private queue: Promise<void> = Promise.resolve()
    private syncVersion = 0

    constructor(dir: string, outPath: string, options: GenerateOptions = {}) {
        this.dir = resolve(dir)
        this.outPath = resolve(outPath)
        this.outputKey =
            process.platform === 'win32' ?
                this.outPath.toLowerCase()
            :   this.outPath
        this.extraRoutes = [...(options.extraRoutes ?? [])].map(
            normalizeExtraRoute,
        )
        this.constraints = canonicalConstraints(options.paramConstraints)
        this.quiet = options.quiet ?? false
    }

    private request(): symbol {
        const request = Symbol()
        latestRequests.set(this.outputKey, request)
        return request
    }

    private isCurrent(request: symbol): boolean {
        return latestRequests.get(this.outputKey) === request
    }

    private enqueue(work: (request: symbol) => Promise<void>): Promise<void> {
        const request = this.request()
        const pending = this.queue.then(() => work(request))
        // A failed request propagates to its caller while keeping the queue usable.
        this.queue = pending.catch(() => {})
        return pending
    }

    private setFiles(files: Set<string>): void {
        this.files = files
        this.preparedInput = null
    }

    private input(): PreparedInput {
        if (this.preparedInput) return this.preparedInput
        const paths = [
            ...new Set([
                ...normalizePaths(this.files ?? []),
                ...this.extraRoutes,
            ]),
        ].sort()
        const hash = hashContent(
            JSON.stringify({
                version: GENERATOR_SCHEMA_VERSION,
                paths,
                paramConstraints: this.constraints,
            }),
        )
        this.preparedInput = { paths, constraints: this.constraints, hash }
        return this.preparedInput
    }

    private log(generated: boolean): void {
        if (!this.quiet)
            console.log(
                `[type-routes] ${generated ? 'Generated' : 'Unchanged'} ${this.outPath}`,
            )
    }

    generateSync(): void {
        this.syncVersion++
        const request = this.request()
        this.setFiles(getPhysicalRouteFilesSync(this.dir))
        const input = this.input()
        let current: string | null = null
        try {
            current = readFileSync(this.outPath, 'utf-8')
        } catch (error) {
            if (!isMissingFile(error)) throw error
        }
        if (
            current !== null &&
            readGeneratedOutput(current)?.inputHash === input.hash
        ) {
            this.log(false)
            return
        }
        const output = outputFor(input)
        mkdirSync(dirname(this.outPath), { recursive: true })
        const temporary = `${this.outPath}.${randomUUID()}.tmp`
        try {
            writeFileSync(temporary, output, 'utf-8')
            if (this.isCurrent(request)) {
                renameSync(temporary, this.outPath)
                this.log(true)
            }
        } finally {
            try {
                unlinkSync(temporary)
            } catch (error) {
                if (!isMissingFile(error)) throw error
            }
        }
    }

    generate(): Promise<void> {
        return this.enqueue(async request => {
            await this.reconcile(this.syncVersion)
            await this.write(request)
        })
    }

    handleChange(
        event: 'change' | 'rename',
        filename: string | null,
    ): Promise<void> {
        return this.handleChanges([{ event, filename }])
    }

    handleChanges(changes: readonly RouteChange[]): Promise<void> {
        if (changes.length === 0) return Promise.resolve()
        return this.enqueue(async request => {
            const version = this.syncVersion
            if (this.files === null) {
                await this.reconcile(version)
            } else {
                for (const change of changes) {
                    if (version !== this.syncVersion) break
                    if (await this.updateFile(change, version)) {
                        await this.reconcile(version)
                        break
                    }
                }
            }
            await this.write(request)
        })
    }

    private async reconcile(version: number): Promise<void> {
        const files = await getPhysicalRouteFiles(this.dir)
        // A synchronous call can run while this scan awaits disk I/O. Its
        // newer index must survive the completion of the earlier scan.
        if (version === this.syncVersion) this.setFiles(files)
    }

    // Returns true when the event cannot be resolved from one physical file.
    private async updateFile(
        { event, filename }: RouteChange,
        version: number,
    ): Promise<boolean> {
        if (!filename) return true
        const fullPath = resolve(this.dir, filename.replaceAll('\\', '/'))
        const file = relative(this.dir, fullPath).replaceAll('\\', '/')
        if (
            !file ||
            file === '..' ||
            file.startsWith('../') ||
            isAbsolute(file)
        )
            return true
        let exists = false
        let directory = false
        try {
            const info = await fs.stat(fullPath)
            exists = info.isFile()
            directory = info.isDirectory()
        } catch (error) {
            if (!isMissingFile(error)) throw error
        }
        if (version !== this.syncVersion) return false
        if (directory) return true
        // A missing/replaced directory may itself be named page.tsx or
        // route.ts. Its indexed descendants take precedence over the name.
        if ([...this.files!].some(known => known.startsWith(`${file}/`))) {
            return true
        }
        if (isRouteFile(file)) {
            const hadFile = this.files!.has(file)
            if (exists !== hadFile) {
                if (exists) this.files!.add(file)
                else this.files!.delete(file)
                this.preparedInput = null
            }
            return false
        }
        if (exists) return false
        // Missing non-route names may be deleted/moved directories or atomic
        // editor temporary files. Reconcile once for the entire batch.
        return event === 'rename'
    }

    private async write(request: symbol): Promise<void> {
        const input = this.input()
        let current: string | null = null
        try {
            current = await fs.readFile(this.outPath, 'utf-8')
        } catch (error) {
            if (!isMissingFile(error)) throw error
        }
        if (!this.isCurrent(request)) return
        if (
            current !== null &&
            readGeneratedOutput(current)?.inputHash === input.hash
        ) {
            this.log(false)
            return
        }
        const output = outputFor(input)
        await fs.mkdir(dirname(this.outPath), { recursive: true })
        const temporary = `${this.outPath}.${randomUUID()}.tmp`
        try {
            await fs.writeFile(temporary, output, 'utf-8')
            if (this.isCurrent(request)) {
                // Only the final atomic commit is synchronous. A pending async
                // rename could otherwise overwrite a newer synchronous config.
                renameSync(temporary, this.outPath)
                this.log(true)
            }
        } finally {
            await fs.unlink(temporary).catch((error: unknown) => {
                if (!isMissingFile(error)) throw error
            })
        }
    }
}

export function generate(
    dir: string,
    outPath: string,
    extraRoutes?: string[],
    paramConstraints?: Record<string, string[]>,
    quiet = false,
): void {
    new RouteGenerator(dir, outPath, {
        extraRoutes,
        paramConstraints,
        quiet,
    }).generateSync()
}

export function generateAsync(
    dir: string,
    outPath: string,
    extraRoutes?: string[],
    paramConstraints?: Record<string, string[]>,
    quiet = false,
): Promise<void> {
    return new RouteGenerator(dir, outPath, {
        extraRoutes,
        paramConstraints,
        quiet,
    }).generate()
}
