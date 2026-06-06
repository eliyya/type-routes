# type-routes

Generate a type-safe runtime and TypeScript interface from your Next.js App Router directory structure.

## Install

```shell
npm add type-routes
```

> Peer dependency: `next@^16.0.0` (optional — only needed for the Next.js plugin).

## CLI

```shell
type-routes --help
```

```
Usage: type-routes [options]

Options:
  -i, --input <dir>        App directory (default: src/app)
  -o, --output <file>      Output file   (default: src/lib/routes.ts)
  -w, --watch              Watch for changes
      --debounce-ms <ms>   Debounce delay (default: 300)
  -e, --extra <route>      Extra route path (can be repeated)
  -h, --help               Show this help
```

### Examples

```shell
# Basic
type-routes

# Custom paths
type-routes -i src/app -o src/lib/routes.ts

# Watch mode
type-routes -w

# Force routes that don't exist on disk
type-routes -e / -e /users
```

## Next.js Plugin

```ts
// next.config.ts
import { withTypeRoutes } from 'type-routes/next'

export default withTypeRoutes({
    input: 'src/app',
    output: 'src/lib/routes.ts',
    extraRoutes: ['/', '/users'],
    paramConstraints: { locale: ['en', 'es'] },
})
```

### PluginOptions

| Option             | Type                       | Default               | Description                           |
| ------------------ | -------------------------- | --------------------- | ------------------------------------- |
| `input`            | `string`                   | `'src/app'`           | App directory                         |
| `output`           | `string`                   | `'src/lib/routes.ts'` | Output file                           |
| `extraRoutes`      | `string[]`                 | —                     | Force routes that don't exist on disk |
| `paramConstraints` | `Record<string, string[]>` | —                     | Restrict dynamic param values         |
| `watchDebounceMs`  | `number`                   | `300`                 | Debounce delay in dev mode            |

In **dev mode** the plugin watches the input directory for `page.tsx`/`route.ts` changes and regenerates automatically.

## Usage

Once generated, import the `app` object from your output file:

```ts
import { app } from '@/lib/routes' // adjust path to your output

// Static routes
app.dashboard.settings() // → '/dashboard/settings'

// Dynamic routes
app.users.$id('123') // → '/users/123'

// Catch-all routes
app.api.auth.$$all('login', 'callback') // → '/api/auth/login/callback'

// Optional catch-all routes
app.posts._$$slug() // → '/posts'
app.posts._$$slug('hello') // → '/posts/hello'

// With constraints
app.$locale('en') // allowed, → '/en'
app.$locale('fr') // type error if constraint is ['en','es']

// Nested Object.assign pattern
app.$locale.dashboard.reports.cc.$cc_id.$month.$year(
    'en',   // $locale
    'cc-1', // $cc_id
    'jan',  // $month
    '2026', // $year
) // → '/en/dashboard/reports/cc/cc-1/jan/2026'
```

## Features

### Static routes

```
app/dashboard/settings/page.tsx  →  app.dashboard.settings()
```

### Dynamic routes (`[param]`)

```
app/users/[id]/page.tsx  →  app.users.$id('123')

app/[locale]/dashboard/page.tsx  →  app.$locale('en')
```

Params are prefixed with `$` when used as property names.

### Catch-all routes (`[...param]`)

```
app/api/auth/[...all]/route.ts  →  app.api.auth.$$all('login', 'callback')
```

Catch-all params are prefixed with `$$`. They receive rest arguments and `join('/')` them into the path.

### Optional catch-all routes (`[[...param]]`)

```
app/posts/[[...slug]]/page.tsx  →  app.posts._$$slug()
app/posts/[[...slug]]/page.tsx  →  app.posts._$$slug('hello')
```

Optional catch-all params are prefixed with `_$$`. Defaults to empty array when omitted.

### Route groups (`(group)`)

Route-group segments like `(marketing)` are stripped from paths and do not appear in the generated types.

### Object.assign pattern

When a directory has both a `page.tsx`/`route.ts` and sub-routes, the generated runtime uses `Object.assign(fn, { children })`, so the node is both callable and has sub-properties:

```
app/dashboard/page.tsx          →  app.dashboard()         // → '/dashboard'
app/dashboard/settings/page.tsx →  app.dashboard.settings() // → '/dashboard/settings'
```

## extraRoutes

Force-generate routes even when the corresponding file doesn't exist on disk:

```ts
withTypeRoutes({
    extraRoutes: [
        '/', // → app/       (creates app(): `/`)
        '/users', // → app/users/ (creates app.users(): `/users`)
    ],
})
```

| Passed         | Internal path             |
| -------------- | ------------------------- |
| `'/'`          | `app/page.tsx`            |
| `'/users'`     | `app/users/page.tsx`      |
| `'users/[id]'` | `app/users/[id]/page.tsx` |

Useful when:

- Your root (`/`) is served by a proxy but has no `app/page.tsx`
- A directory has no `page.tsx` but the router resolves to a sub-route via middleware

## paramConstraints

Restrict dynamic parameter values at the type level:

```ts
withTypeRoutes({
    paramConstraints: {
        locale: ['en', 'es'],
        role: ['admin', 'user'],
    },
})
```

Generated output:

```ts
// interface
$locale: {
    <$locale extends 'en' | 'es'>($locale: $locale): `/${$locale}/dashboard`
}

// runtime
$locale: ($locale: 'en' | 'es') => `/${$locale}/dashboard`
```

Using a constrained param with an invalid value produces a type error:

```ts
app.$locale('en') // OK
app.$locale('fr') // Type error: '"fr"' is not assignable to '"en" | "es"'
```

Keys are normalized: `locale` → `$locale`, `all` → `$$all`.

## Programmatic API

```ts
import {
    buildTree,
    generateInterfaceFile,
    generateRuntimeFile,
    getRoutePaths,
    extractParam,
    resetId,
    type TreeNode,
    type RouteType,
} from 'type-routes'

// Read and build the tree
const paths = await getRoutePaths('./src/app')
const tree = buildTree(paths)

// Or build with constraints
const tree = buildTree(paths, { locale: ['en', 'es'] })

// Generate files
const interfaceCode = generateInterfaceFile(tree)
const runtimeCode = generateRuntimeFile(tree)
```

## How it works

1. Scans the input directory for `page.tsx` and `route.ts` files
2. Builds a tree structure with node types (static, dynamic, catch-all, etc.)
3. Generates a TypeScript `interface App` with recursive call signatures using template literal types
4. Generates a runtime `export const app` with arrow functions and `Object.assign` for mixed nodes

The output is written to a single `.ts` file that can be imported anywhere in your project.

## Motivation

Next.js file-based routing makes it easy to add routes but hard to keep references in sync when routes change. The experimental `typedRoutes` only covers `<Link>` tags, leaving `redirect()`, `router.push()`, and API calls unchecked.

`type-routes` generates a fully typed route object for your entire app, catching mismatches at compile time.
