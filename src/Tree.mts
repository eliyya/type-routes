import { isAbsolute, dirname, resolve, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'

export type TypeRouteConfig = {
    definedParams?: Record<string, string[]>
}
export class Node {
    #dir: string
    id: string
    name: string
    dirname: string
    type: 'page' | 'handler' | 'dir' = 'dir'
    children: Node[] = []
    typeRouteConfig: TypeRouteConfig

    constructor(path: string, typeRouteConfig: TypeRouteConfig) {
        this.id = '_' + randomUUID().replace(/-/g, '')
        this.#dir = Node.#getDirectory(path)
        this.dirname = basename(this.#dir)
        this.name = Node.#parseName(this.dirname)
        this.typeRouteConfig = typeRouteConfig
        this.#processDirectory()
        if (!this.name.startsWith('...')) {
            this.#filterEmptyDirs()
            this.#mergeParenthesisNames()
            this.#mergeDuplicateChildren()
        }
    }

    #processDirectory(): void {
        try {
            const entries = readdirSync(this.#dir)
            for (const entry of entries) {
                if (entry.startsWith('@')) continue
                const fullPath = resolve(this.#dir, entry)
                const stats = statSync(fullPath)
                if (stats.isDirectory()) {
                    if (!this.name.startsWith('...'))
                        this.children.push(new Node(fullPath, this.typeRouteConfig))
                } else {
                    const fileName = basename(entry, extname(entry))
                    const extension = extname(entry)
                    if (
                        fileName === 'route' &&
                        ['.ts', '.js'].includes(extension)
                    )
                        this.type = 'handler'
                    else if (
                        this.type !== 'handler' &&
                        fileName === 'page' &&
                        ['.ts', '.tsx', '.js', '.jsx'].includes(extension)
                    )
                        this.type = 'page'
                }
            }
        } catch {
            throw new Error(`No se pudo leer el directorio: ${this.#dir}`)
        }
    }

    #filterEmptyDirs(): void {
        this.children = this.children.filter(child => {
            child.#filterEmptyDirs()
            return !(child.type === 'dir' && child.children.length === 0)
        })
    }

    #mergeParenthesisNames(): void {
        for (const child of this.children) {
            if (child.name.startsWith('(') && child.name.endsWith(')')) {
                if (child.type === 'page' && this.type !== 'handler')
                    this.type = 'page'
                if (child.type === 'handler') this.type = 'handler'
                this.children = this.children.filter(c => c !== child)
                this.children.push(...child.children)
            }
            child.#mergeParenthesisNames()
        }
    }

    #mergeDuplicateChildren(): void {
        const mergedChildren: Node[] = []

        for (const child of this.children) {
            const existingChild = mergedChildren.find(
                c => c.name === child.name,
            )

            if (!existingChild) {
                mergedChildren.push(child)
                continue
            }
            existingChild.children.push(...child.children)
            if (existingChild.type === 'dir') existingChild.type = child.type
            else if (child.type === 'handler') existingChild.type = 'handler'
        }

        this.children = mergedChildren
        for (const child of this.children) child.#mergeDuplicateChildren()
    }

    #getGenerics(params: string[]) {
        const generics: string[] = []
        generics.push(...params.map(p => {
            if (p.substring(1) in this.typeRouteConfig.definedParams)
                return `${p} extends '${this.typeRouteConfig.definedParams[p.substring(1)].join("' | '")}'`
            return `${p} extends string | number`
        }))
        if (this.name.startsWith('...'))
            generics.push('R extends [string,...string[]]')
        else if (this.name.startsWith('??'))
            generics.push('R extends [] | [string,...string[]]')
        return generics.length ? `<${generics.join(',')}>` : ''
    }

    #getInterface(route: string, params: string[]): string {
        if (route) {
            if (this.name.startsWith('$')) route += `\${${this.name}}`
            else if (this.name.startsWith('...')) route += `\${GR<R>}`
            else route += this.name
        }
        route += '/'
        if (this.name.startsWith('$') /*|| this.name.startsWith('...')*/)
            params.push(this.name)
        let paramString = params.map(p => `${p}:${p}`).join(', ')

        if (this.name.startsWith('...')) {
            paramString = paramString
                ? `${paramString},${this.name}:R`
                : `${this.name}:R`
        } else if (this.name.startsWith('??')) {
            const cleanName = this.name.slice(2) 
            paramString = paramString
                ? `${paramString},${cleanName}?:R`
                : `${cleanName}?:R`
        }
        
        let out = ''
        if (this.type !== 'dir')
            out += `${this.#getGenerics(params)}(${paramString}):\`${route}\`;`
        for (const child of this.children) {
            out += `/** ${child.type} */'${
                child.name.startsWith('...')
                    ? child.name.replace('...', '$$$$')
                    : child.name
            }':{${child.#getInterface(route, [...params])}};`
        }
        return out
    }

    get #genericGenerateRouteType() {
        return 'type GR<R extends string[]>=R extends[]?never:R extends[string]?R[0]:R extends[infer F extends string,...infer Rest extends string[]]?`${F}/${GR<Rest>}`:never'
    }

    generateTypeScriptFile() {
        return `${
            this.#genericGenerateRouteType
        };export interface Routes {${this.#getInterface(
            '',
            [],
        )}};\nexport const app:Routes;\nexport default app`
    }

    #getFunctions(route: string, params: string[]) {
        if (route) {
            if (this.name.startsWith('$')) route += `\${${this.name}}`
            else if (this.name.startsWith('...'))
                route += `\${${this.name.replace('...', '')}.join('/')}`
            else if (this.name.startsWith('??')) route += `\${(${this.name.slice(2)}?.length ? GR<R> : '')}`
            else route += this.name
        }
        route += '/'
        if (this.name.startsWith('$') || this.name.startsWith('...'))
            params.push(this.name)
        const out: string[] = []
        const assignment =
            this.type === 'dir' ? '{}' : `(${params.join(', ')})=>\`${route}\``
        if (route !== '/') out.push(`const ${this.id}=${assignment}`)
        for (const child of this.children) {
            out.push(child.#getFunctions(route, [...params]))
        }
        return out.join(';')
    }

    #getAssignments(parentName: string) {
        const out: string[] = []
        if (this.name !== 'app')
            out.push(
                `${parentName}['${
                    this.name.startsWith('...')
                        ? this.name.replace('...', '$$$$')
                        : this.name
                }']=${this.id}`,
            )
        for (const child of this.children)
            out.push(
                child.#getAssignments(this.name === 'app' ? 'app' : this.id),
            )
        return out.join(';')
    }

    generateJavaScriptFile() {
        return [
            `export const app=()=>\`/\``,
            this.#getFunctions('', []),
            this.#getAssignments('app'),
            `export default app`,
        ].join(';')
    }

    static #getDirectory(path: string): string {
        path = path.startsWith('file://') ? fileURLToPath(path) : path
        if (!isAbsolute(path))
            throw new Error(`La ruta no es absoluta: ${path}`)
        try {
            const stats = statSync(path)
            return stats.isDirectory() ? path : dirname(path)
        } catch {
            throw new Error(`La ruta no existe o no es accesible: ${path}`)
        }
    }

    static #parseName(dirname: string) {
        if (dirname.startsWith('[[...') && dirname.endsWith(']]'))
            return '??' + dirname.slice(4, -2)
        if (dirname.startsWith('[...') && dirname.endsWith(']'))
            return dirname.slice(1, -1)
        else if (dirname.startsWith('[') && dirname.endsWith(']'))
            return '$' + dirname.slice(1, -1)
        else return dirname
    }
}

// // test
// const root = new Node(import.meta.resolve('../../sos/src/app'), {
//     definedParams: {
//         locale: ['en', 'es'],
//     },
// })
// console.dir(root, {
//     depth: null,
// })
// console.log(root.generateTypeScriptFile())
// import { writeFileSync } from 'node:fs'
// writeFileSync('./test.js', root.generateJavaScriptFile())
