import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    buildTree,
    generateInterfaceFile,
    generateRuntimeFile,
    resetId,
    extractParam,
    type TreeNode,
} from './index.ts'

function buildAndGenerate(tree: Record<string, TreeNode>) {
    const intf = generateInterfaceFile(tree)
    const runtime = generateRuntimeFile(tree)
    return { intf, runtime }
}

describe('generateInterfaceFile', () => {
    it('returns interface App for a single static page', () => {
        resetId()
        const tree = buildTree(['app/dashboard/page.tsx'])
        const { intf } = buildAndGenerate(tree)
        const lines = intf.trim().split('\n')
        assert.match(intf, /interface App/)
        assert.ok(lines.length > 1)
    })

    it('has call signature for page route', () => {
        resetId()
        const tree = buildTree(['app/dashboard/page.tsx'])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /dashboard/)
        assert.match(intf, /\(\)/)
        assert.match(intf, /`/)
    })

    it('has no call signature for api route', () => {
        resetId()
        const tree = buildTree(['app/dashboard/route.ts'])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /dashboard/)
        assert.match(intf, /\(\)/)
        assert.match(intf, /`/)
    })

    it('generates generic param for dynamic segment', () => {
        resetId()
        const tree = buildTree(['app/[locale]/page.tsx'])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /locale/)
        assert.match(intf, /<.*\$locale.*extends string/)
        assert.match(intf, /\$\{.*\$locale.*\}/)
    })

    it('generates catch-all param type $${name}', () => {
        resetId()
        const tree = buildTree(['app/[...all]/page.tsx'])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /\$\$all/)
        assert.match(intf, /\$\{string\}/)
    })

    it('generates optional catch-all param type _$${name}', () => {
        resetId()
        const tree = buildTree(['app/[[...slug]]/page.tsx'])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /_\$\$slug/)
        assert.match(intf, /\$\{string\}/)
    })

    it('accumulates params across nested dynamic segments', () => {
        resetId()
        const tree = buildTree(['app/[locale]/dashboard/[id]/page.tsx'])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /\$locale/)
        assert.match(intf, /\$id/)
        assert.match(intf, /\$\{\$locale\}/)
        assert.match(intf, /\$\{\$id\}/)
    })

    it('generates recursive properties for nested children', () => {
        resetId()
        const tree = buildTree([
            'app/dashboard/settings/page.tsx',
            'app/dashboard/profile/page.tsx',
        ])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /settings/)
        assert.match(intf, /profile/)
        assert.match(intf, /dashboard/)
    })

    it('uses generic param name as property key for dynamic', () => {
        resetId()
        const tree = buildTree(['app/[locale]/page.tsx'])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /\$locale/)
    })

    it('handles multiple nested levels', () => {
        resetId()
        const tree = buildTree([
            'app/a/b/c/d/page.tsx',
        ])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /a/)
        assert.match(intf, /b/)
        assert.match(intf, /c/)
        assert.match(intf, /d/)
    })
})

describe('generateRuntimeFile', () => {
    it('generates arrow function for a single static page', () => {
        resetId()
        const tree = buildTree(['app/dashboard/page.tsx'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /dashboard/)
        assert.match(runtime, /=>/)
        assert.match(runtime, /`/)
    })

    it('generates object for non-callable node with children', () => {
        resetId()
        const tree = buildTree([
            'app/dashboard/settings/page.tsx',
            'app/dashboard/profile/page.tsx',
        ])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /settings/)
        assert.match(runtime, /profile/)
    })

    it('uses Object.assign for node with both callable and children', () => {
        resetId()
        const tree = buildTree([
            'app/dashboard/page.tsx',
            'app/dashboard/settings/page.tsx',
        ])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /Object.assign/)
    })

    it('generates string params for dynamic segment', () => {
        resetId()
        const tree = buildTree(['app/[locale]/page.tsx'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /\$locale/)
        assert.match(runtime, /locale: string/)
    })

    it('generates rest param for catch-all', () => {
        resetId()
        const tree = buildTree(['app/[...all]/page.tsx'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /\$\$all/)
        assert.match(runtime, /\.\.\.\$/)
        assert.match(runtime, /string\[\]/)
        assert.match(runtime, /join/)
    })

    it('generates optional rest param for optional catch-all', () => {
        resetId()
        const tree = buildTree(['app/[[...slug]]/page.tsx'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /_\$\$slug/)
        assert.match(runtime, /string\[\]\s*=\s*\[\]/)
    })

    it('includes interface before runtime export', () => {
        resetId()
        const tree = buildTree(['app/dashboard/page.tsx'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /interface App/)
        assert.match(runtime, /export const app/)
    })

    it('accumulates params across multiple dynamic segments', () => {
        resetId()
        const tree = buildTree(['app/[locale]/dashboard/[id]/page.tsx'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /\$locale/)
        assert.match(runtime, /\$id/)
        assert.match(runtime, /locale: string/)
        assert.match(runtime, /id: string/)
    })

    it('handles nested object with api route type', () => {
        resetId()
        const tree = buildTree(['app/api/users/route.ts'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /api/)
        assert.match(runtime, /users/)
        assert.match(runtime, /=>/)
    })
})

describe('extractParam', () => {
    it('returns $name for dynamic [name]', () => {
        assert.equal(extractParam('[id]', 'dynamic'), '$id')
    })

    it('returns $$name for catch-all [...name]', () => {
        assert.equal(extractParam('[...all]', 'catch-all'), '$$all')
    })

    it('returns _$$name for optional catch-all [[...name]]', () => {
        assert.equal(extractParam('[[...slug]]', 'optional-catch-all'), '_$$slug')
    })

    it('returns null for static name', () => {
        assert.equal(extractParam('dashboard', 'directory'), null)
    })

    it('returns null for file name', () => {
        assert.equal(extractParam('page.tsx', 'page'), null)
    })
})

describe('buildTree', () => {
    it('creates a single-level tree from one path', () => {
        resetId()
        const tree = buildTree(['app/dashboard/page.tsx'])
        assert.ok(tree.app)
        assert.ok(tree.app.children.dashboard)
        assert.equal(tree.app.children.dashboard.type, 'directory')
    })

    it('creates nested tree from deep path', () => {
        resetId()
        const tree = buildTree(['app/a/b/c/page.tsx'])
        assert.ok(tree.app.children.a)
        assert.ok(tree.app.children.a.children.b)
        assert.ok(tree.app.children.a.children.b.children.c)
    })

    it('removes duplicate paths', () => {
        resetId()
        const tree = buildTree([
            'app/dashboard/page.tsx',
            'app/dashboard/page.tsx',
        ])
        assert.equal(Object.keys(tree.app.children.dashboard.children).length, 1)
    })

    it('classifies dynamic segments', () => {
        resetId()
        const tree = buildTree(['app/[id]/page.tsx'])
        assert.equal(tree.app.children['[id]']?.type, 'dynamic')
    })

    it('classifies catch-all segments', () => {
        resetId()
        const tree = buildTree(['app/[...all]/page.tsx'])
        const keys = Object.keys(tree.app.children)
        const allKey = keys.find((k) => tree.app.children[k].type === 'catch-all')
        assert.ok(allKey)
    })

    it('classifies optional catch-all segments', () => {
        resetId()
        const tree = buildTree(['app/[[...slug]]/page.tsx'])
        const keys = Object.keys(tree.app.children)
        const slugKey = keys.find((k) => tree.app.children[k].type === 'optional-catch-all')
        assert.ok(slugKey)
    })

    it('produces unique ids for each node', () => {
        resetId()
        const tree = buildTree([
            'app/a/page.tsx',
            'app/b/page.tsx',
            'app/c/page.tsx',
        ])
        const ids = [
            tree.app.id,
            tree.app.children.a.id,
            tree.app.children.b.id,
            tree.app.children.c.id,
        ]
        assert.equal(new Set(ids).size, ids.length)
    })
})

describe('edge cases', () => {
    it('handles empty paths returns empty tree', () => {
        resetId()
        const tree = buildTree([])
        assert.equal(Object.keys(tree).length, 0)
    })

    it('route-group segments are passed through to tree', () => {
        resetId()
        const tree = buildTree(['app/(marketing)/home/page.tsx'])
        assert.ok(tree.app.children['(marketing)'])
        assert.equal(tree.app.children['(marketing)'].children.home.type, 'directory')
    })

    it('generates valid type and runtime for 404 catch-all', () => {
        resetId()
        const tree = buildTree(['app/not-found/page.tsx'])
        const { intf, runtime } = buildAndGenerate(tree)
        assert.match(intf, /not-found/)
        assert.match(runtime, /not-found/)
    })

    it('generates correct return path for deeply nested page', () => {
        resetId()
        const tree = buildTree(['app/api/v1/users/page.tsx'])
        const runtime = generateRuntimeFile(tree)
        assert.match(runtime, /`\/api\/v1\/users`/)
    })

    it('handles mixed static and dynamic in same level', () => {
        resetId()
        const tree = buildTree([
            'app/static/page.tsx',
            'app/[id]/page.tsx',
        ])
        const intf = generateInterfaceFile(tree)
        assert.match(intf, /static/)
        assert.match(intf, /\$id/)
    })
})
