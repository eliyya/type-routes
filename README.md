# type-routes

Generate a type-safe runtime and TypeScript interface from your Next.js App Router directory structure.

## Install

```shell
npm add @eliyya/type-routes
```

> Peer dependency: `next@^16.3.5` (required).

This package uses ESM imports.

Next.js 16.3.5 requires `sharp@^0.35.4`, which includes fixes for image decoding vulnerabilities. Existing applications must update their own Next.js dependency and lockfile; updating this package alone does not replace an already installed Next.js version.

## Agent skill

[skills/type-routes/SKILL.md](skills/type-routes/SKILL.md) teaches agents how to
integrate this package into Next.js projects, run the CLI in CI pipelines, and
use the generated route helpers. It is included in the npm package at
`node_modules/@eliyya/type-routes/skills/type-routes/SKILL.md`.

Copy the `skills/type-routes` folder into the skill directory supported by your
agent, or reference its `SKILL.md` in the project's agent instructions.

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

# App Router at the project root
type-routes -i app -o lib/routes.ts

# Watch mode
type-routes -w

# Force routes that don't exist on disk
type-routes -e / -e /users
```

`input` must point to the App Router directory. Relative input/output paths are
resolved from the working directory, so run from the Next application's root
in a monorepo. Route paths are relative to `input`; a working directory named
`/app` does not change the generated URL root.

### Pipeline example

Generate before a standalone typecheck or build that imports the output:

```json
{
  "scripts": {
    "routes:generate": "type-routes -i src/app -o src/lib/routes.ts",
    "typecheck": "npm run routes:generate && tsc --noEmit",
    "build": "npm run routes:generate && next build"
  }
}
```

Adapt the runner to the project's package manager and preserve existing build
commands. Run without `--watch` in CI so generation can finish. The CLI has no
`--quiet` or `paramConstraints` option; use the plugin with shared options when
the output needs constrained parameters.

## Next.js Plugin

```ts
// next.config.ts
import { defineTypeRouteConfig } from '@eliyya/type-routes'

const nextConfig = {}

// The factory generates routes, then returns a wrapper for the Next config.
export default defineTypeRouteConfig({
    input: 'src/app',
    output: 'src/lib/routes.ts',
    quiet: true,
    extraRoutes: ['/', '/users'],
    paramConstraints: { locale: ['en', 'es'] },
})(nextConfig)
```

### PluginOptions

| Option             | Type                       | Default               | Description                           |
| ------------------ | -------------------------- | --------------------- | ------------------------------------- |
| `input`            | `string`                   | `'src/app'`           | App directory                         |
| `output`           | `string`                   | `'src/lib/routes.ts'` | Output file                           |
| `extraRoutes`      | `string[]`                 | —                     | Force routes that don't exist on disk |
| `paramConstraints` | `Record<string, string[]>` | —                     | Restrict dynamic param values         |
| `watch`            | `boolean`                  | `true`                | Watch during development; initial generation still runs when `false` |
| `watchDebounceMs`  | `number`                   | `300`                 | Debounce delay in dev mode            |
| `quiet`            | `boolean`                  | `false`               | Hide routine logs; errors remain visible |

The plugin generates immediately when its configuration is loaded. In **dev
mode**, it also watches the input directory unless `watch: false` is configured.
The watcher keeps an index of `page.tsx`/`route.ts` paths: saving their content
does not rebuild the route tree or scan the whole directory. Creating, deleting,
or moving routes updates the index; directory changes and ambiguous events are
reconciled with the filesystem.

To run the watcher in a separate process, configure `watch: false` and run
`type-routes --watch` alongside `next dev`, with matching input, output, and
extra routes. The CLI does not support `paramConstraints`, so use this mode only
for an unconstrained output. Watchers are shared per output within one process;
separate CLI and Next processes must not both watch the same output.

`withTypeRoutes` from `@eliyya/type-routes/next` is deprecated. Use
`defineTypeRouteConfig` from `@eliyya/type-routes` instead; options and behavior
are unchanged.

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
app.posts._$$slug() // → '/posts/'
app.posts._$$slug('hello') // → '/posts/hello'

// With constraints
app.$locale.dashboard('en') // allowed, → '/en/dashboard'
app.$locale.dashboard('fr') // type error if constraint is ['en','es']

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

app/[locale]/dashboard/page.tsx  →  app.$locale.dashboard('en')
```

Params are prefixed with `$` when used as property names.
Pass ancestor parameters at the final route call, in directory order:
`app.$locale.users.$id('es', '123')`. A node is callable only when it has a
`page.tsx`, `route.ts`, or an explicit extra route.

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

Optional catch-all params are prefixed with `_$$`. Calling without arguments
uses an empty array; the current runtime preserves a trailing slash, such as
`'/posts/'`.

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
defineTypeRouteConfig({
    extraRoutes: [
        '/', // → app/       (creates app(): `/`)
        '/users', // → app/users/ (creates app.users(): `/users`)
    ],
})(nextConfig)
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
defineTypeRouteConfig({
    paramConstraints: {
        locale: ['en', 'es'],
        role: ['admin', 'user'],
    },
})(nextConfig)
```

For `app/[locale]/dashboard/page.tsx`, the generated output includes:

```ts
interface App {
    $locale: {
        dashboard: {
            <$locale extends 'en' | 'es'>($locale: $locale): `/${$locale}/dashboard`
        }
    }
}

export const app = {
    $locale: {
        dashboard: ($locale: 'en' | 'es') => `/${$locale}/dashboard`,
    },
} as App
```

Using a constrained param with an invalid value produces a type error:

```ts
app.$locale.dashboard('en') // OK
app.$locale.dashboard('fr') // Type error: '"fr"' is not assignable to '"en" | "es"'
```

Ordinary keys are normalized: `locale` → `$locale`. Use the generated names
explicitly for catch-all parameters (`$$all`) and optional catch-all parameters
(`_$$slug`). Constraints apply to TypeScript calls; they do not validate values
at runtime.

## Programmatic API

```ts
import {
    buildTree,
    generateInterfaceFile,
    generateRuntimeFile,
} from '@eliyya/type-routes'

// Build from normalized paths rooted at app (route groups already removed).
const paths = [
    'app/dashboard/page.tsx',
    'app/[locale]/dashboard/page.tsx',
    'app/users/[id]/page.tsx',
]
// The second argument is optional.
const tree = buildTree(paths, { locale: ['en', 'es'] })

// Generate TypeScript source strings.
const interfaceCode = generateInterfaceFile(tree)
const runtimeCode = generateRuntimeFile(tree)
```

Use the CLI or Next plugin to scan files on disk and write the generated output.
`buildTree` accepts normalized paths; the package's main entry does not export a
filesystem scanner.
The main entry also exports `extractParam`, `resetId`, and the `TreeNode`,
`RouteType`, and `PluginOptions` types.

## Supported scope

The scanner reads App Router `page.tsx` and `route.ts` files only. Other file
extensions and the Pages Router are not scanned. An existing input directory
with no route files produces an empty `app` object.

Route groups are omitted from URLs. Parallel slots and intercepted routes are
not specially normalized, so inspect their generated URLs before using them.
Query strings, fragments, `basePath`, rewrites, and parameter URL encoding are
not applied automatically.

## How it works

1. Scans the input directory for `page.tsx` and `route.ts` files (watch mode reuses its route index)
2. Hashes the normalized, sorted, deduplicated route paths, extra routes, parameter constraints, and generator schema version
3. Skips tree/code generation when that input fingerprint matches and the existing output passes its content-integrity check
4. Otherwise builds a tree with node types (static, dynamic, catch-all, etc.) and generates a TypeScript `interface App` plus a runtime `export const app`

The output is written to a single `.ts` file that can be imported anywhere in your project.
The first comment contains a SHA-256 hash of the generated content, and the
second stores the input fingerprint. The input fingerprint avoids rebuilding
unchanged routes and avoids unnecessary writes; the content hash detects an
edited output. A deleted or edited output is regenerated on the next generation
run even when the input fingerprint is unchanged.

CLI generation and watcher regeneration use asynchronous filesystem operations.
Watcher events are debounced and processed in a serialized queue, so batches do
not run overlapping generations. The plugin's initial generation remains
synchronous so the output is ready when Next loads its configuration. This does
not create a worker thread or a background process; `type-routes --watch` can be
run separately when process isolation is desired.

Initial CLI generation errors produce a nonzero exit code, allowing a pipeline
to stop before typechecking or building with a stale output.

## Motivation

`type-routes` turns the App Router directory structure into reusable URL builder
functions. Callers construct dynamic paths through typed parameters and can use
the same generated helpers with links, redirects, router navigation, and API
requests.
