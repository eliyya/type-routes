export type RouteType =
    | 'page'
    | 'api'
    | 'dynamic'
    | 'catch-all'
    | 'optional-catch-all'
    | 'parallel'
    | 'intercepting'
    | 'directory'

export type TreeNode = {
    id: string
    name: string
    type: RouteType
    params: string[]
    constraints: Record<string, string[]>
    children: Record<string, TreeNode>
}

export function extractParam(name: string, type: RouteType): string | null {
    const m = name.match(/^\[{1,2}\.{0,3}(.+?)\]{1,2}$/)
    if (!m) return null
    const base = m[1]
    if (type === 'catch-all') return `$$${base}`
    if (type === 'optional-catch-all') return `_$$${base}`
    return `$${base}`
}

let nextId = 1
export function resetId(): void {
    nextId = 1
}
function genId(): string {
    return `_${nextId++}`
}

function classifyNode(name: string, isLast: boolean): RouteType {
    if (isLast) {
        if (name === 'page.tsx') return 'page'
        if (name === 'route.ts') return 'api'
    }

    if (/^\[\[\.\.\..+\]\]$/.test(name)) return 'optional-catch-all'
    if (/^\[\.\.\..+\]$/.test(name)) return 'catch-all'
    if (/^\[.+\]$/.test(name)) return 'dynamic'
    if (/^@.+$/.test(name)) return 'parallel'
    if (/^\(\.{1,3}\).+$/.test(name)) return 'intercepting'

    return 'directory'
}

export function buildTree(
    paths: string[],
    paramConstraints?: Record<string, string[]>,
): Record<string, TreeNode> {
    const root: Record<string, TreeNode> = {}
    const sharedConstraints: Record<string, string[]> = {}
    for (const [key, vals] of Object.entries(paramConstraints ?? {})) {
        const k = key.startsWith('$') || key.startsWith('_') ? key : `$${key}`
        sharedConstraints[k] = vals
    }

    for (const p of paths) {
        const parts = p.split('/')
        let level = root
        const parentParams: string[] = []

        for (let i = 0; i < parts.length; i++) {
            const name = parts[i]
            const isLast = i === parts.length - 1
            const type = classifyNode(name, isLast)

            if (!level[name]) {
                const ownParam = extractParam(name, type)
                level[name] = {
                    id: genId(),
                    name,
                    type,
                    params: ownParam ? [...parentParams, ownParam] : [...parentParams],
                    constraints: sharedConstraints,
                    children: {},
                }
            }

            const ownParam = extractParam(name, type)
            if (ownParam) parentParams.push(ownParam)

            level = level[name].children
        }
    }

    return root
}

function toPropName(name: string): string {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)
        ? name
        : `'${name.replaceAll("'", "\\'")}'`
}


function pathSegmentFor(node: TreeNode): string {
    if (node.type === 'dynamic') {
        const ownParam = node.params[node.params.length - 1]
        return `\${${ownParam}}`
    }
    if (node.type === 'catch-all' || node.type === 'optional-catch-all') {
        return `\${string}`
    }
    return node.name
}

function buildReturnType(pathParts: string[]): string {
    if (pathParts.length === 0) return '`/`'
    return `\`/${pathParts.join('/')}\``
}

function nodeToType(
    node: TreeNode,
    indent: string,
    pathParts: string[],
): string {
    const children = Object.entries(node.children)
    const hasChildren = children.length > 0

    if (!hasChildren) {
        if (node.type === 'page') return '{}'
        if (node.type === 'api') return '{}'
        return '{}'
    }

    const inner = indent + '    '
    const props = children
        .map(([key, child]) => {
            if (key === 'page.tsx' || key === 'route.ts') {
                const typeParams = child.params
                    .map((p) => {
                        const vals = child.constraints[p]
                        if (vals?.length)
                            return `${p} extends ${vals.map((v) => `'${v}'`).join(' | ')}`
                        return `${p} extends string`
                    })
                    .join(', ')
                const generic =
                    child.params.length > 0 ? `<${typeParams}>` : ''
                const paramsStr = child.params
                    .map((p) => {
                        if (p.startsWith('_$$'))
                            return `...${p}?: ${p}[]`
                        if (p.startsWith('$$'))
                            return `...${p}: ${p}[]`
                        return `${p}: ${p}`
                    })
                    .join(', ')
                const returnType = buildReturnType(pathParts)
                return `${inner}${generic}(${paramsStr}): ${returnType}`
            }
            const ownParam = extractParam(key, child.type)
            const propName = ownParam ?? toPropName(key)
            const childParts = [...pathParts, pathSegmentFor(child)]
            return `${inner}${propName}: ${nodeToType(child, inner, childParts)}`
        })
        .join('\n')

    const inlineObj = `{\n${props}\n${indent}}`
    return inlineObj
}

export function generateInterfaceFile(root: Record<string, TreeNode>): string {
    const app = root['app']
    if (!app) throw new Error('Root must have an "app" key')

    const body = nodeToType(app, '    ', [])
    return `interface App ${body}\n`
}

function runtimeSegmentFor(node: TreeNode): string {
    if (node.type === 'dynamic') {
        const ownParam = node.params[node.params.length - 1]
        return `\${${ownParam}}`
    }
    if (node.type === 'catch-all') {
        const ownParam = node.params[node.params.length - 1]
        return `\${${ownParam}.join('/')}`
    }
    if (node.type === 'optional-catch-all') {
        const ownParam = node.params[node.params.length - 1]
        return `\${${ownParam}?.join('/') ?? ''}`
    }
    return node.name
}

function buildRuntimePath(parts: string[]): string {
    if (parts.length === 0) return '`/`'
    return '`/' + parts.join('/') + '`'
}

function nodeToRuntime(node: TreeNode, indent: string, pathParts: string[]): string {
    const entries = Object.entries(node.children)
    const pageEntry = entries.find(([k]) => k === 'page.tsx' || k === 'route.ts')
    const other = entries.filter(([k]) => k !== 'page.tsx' && k !== 'route.ts')

    const inner = indent + '    '

    let fnPart = ''
    if (pageEntry) {
        const pageNode = pageEntry[1]
        const params = pageNode.params
        const paramStr = params
            .map((p) => {
                if (p.startsWith('_$$')) return `...${p}: string[] = []`
                if (p.startsWith('$$')) return `...${p}: string[]`
                const vals = pageNode.constraints[p]
                if (vals?.length) return `${p}: ${vals.map((v) => `'${v}'`).join(' | ')}`
                return `${p}: string`
            })
            .join(', ')
        fnPart = `(${paramStr}) => ${buildRuntimePath(pathParts)}`
    }

    if (!pageEntry && other.length === 0) return '{}'

    const childEntries = other
        .map(([key, child]) => {
            const ownParam = extractParam(key, child.type)
            const propName = ownParam ?? toPropName(key)
            const childParts = [...pathParts, runtimeSegmentFor(child)]
            return `${inner}${propName}: ${nodeToRuntime(child, inner, childParts)}`
        })
        .join(',\n')

    if (pageEntry && other.length === 0) return fnPart

    if (pageEntry) {
        return `Object.assign(\n${inner}${fnPart},\n${inner}{\n${childEntries}\n${inner}}\n${indent})`
    }

    return `{\n${childEntries}\n${indent}}`
}

export function generateRuntimeFile(root: Record<string, TreeNode>): string {
    const app = root['app']
    if (!app) throw new Error('Root must have an "app" key')
    const interfaceContent = generateInterfaceFile(root)
    const code = nodeToRuntime(app, '    ', [])
    return `${interfaceContent}\n\nexport const app = ${code} as App\n`
}
