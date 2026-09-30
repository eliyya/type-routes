---
name: type-routes
description: Set up and use @eliyya/type-routes in Next.js App Router projects, including automatic generation through defineTypeRouteConfig, CLI generation in build and CI pipelines, and typed route calls in application code. Use when a project needs this package or already uses it.
---

# Type Routes

Generate a TypeScript `app` object from a Next.js App Router directory and use its
functions for navigation URLs. The npm package is `@eliyya/type-routes`; its CLI
executable is `type-routes`.

## Inspect the project

- Use the project's package manager and preserve its existing scripts, Next
  configuration, plugins, and import aliases.
- Find the actual App Router directory: commonly `src/app` or `app`. Set `input`
  to that directory, not the project root. Relative input/output paths resolve
  from the process working directory; in a monorepo, run from the Next app's
  directory or pass explicit paths. A working directory named `/app` is valid.
- Choose an output such as `src/lib/routes.ts` or `lib/routes.ts`. Import the
  generated `app` from this file, not from the npm package.
- Add `@eliyya/type-routes` if absent, using the existing dependency convention.
  Check the installed package's Node engine and Next peer dependency before
  choosing a version. This skill describes the API with `defineTypeRouteConfig`;
  verify that export is available in an existing installation before migrating.

## Choose the generation mode

Use the Next plugin for automatic generation when Next loads its configuration
and regeneration during development. Use the CLI for an explicit pipeline step,
especially when typechecking runs before Next loads its configuration.

A project can use both if their input, output, and extra routes agree. The CLI
has no `paramConstraints` option: do not run it over a constrained plugin output,
because it would replace that output with unconstrained types. For that pipeline,
run a TypeScript-compatible script invoking `defineTypeRouteConfig` with the same
options before typechecking, or arrange for Next to load the plugin first.

## Automatic Next integration

```ts
// next.config.ts (the same import works in next.config.mjs)
import { defineTypeRouteConfig } from '@eliyya/type-routes'

const nextConfig = {
    reactStrictMode: true,
}

export default defineTypeRouteConfig({
    input: 'src/app',
    output: 'src/lib/routes.ts',
    quiet: true,
})(nextConfig)
```

`defineTypeRouteConfig(options)` generates immediately and returns a wrapper;
apply that wrapper to the existing Next configuration. Do not export the unapplied
wrapper as a Next config function: Next would pass its phase as the first argument.
Compose with existing wrappers without dropping their settings.

Available options:

| Option | Default | Purpose |
| --- | --- | --- |
| `input` | `'src/app'` | App Router directory to scan |
| `output` | `'src/lib/routes.ts'` | Generated TypeScript file |
| `extraRoutes` | None | Route paths to generate without files, e.g. `['/', '/users']` |
| `paramConstraints` | None | Type-level allowed values, e.g. `{ locale: ['en', 'es'] }` |
| `watch` | `true` | Watch during development; `false` still generates initially |
| `watchDebounceMs` | `300` | Development watcher debounce in milliseconds |
| `quiet` | `false` | Hide routine logs; errors still print |

The wrapper starts a watcher when `NODE_ENV` is `'development'` and `watch` is
enabled. It tracks `page.tsx` and `route.ts` paths: content-only saves do not
rebuild the tree or rescan the input directory. Route additions, deletions,
moves, directory changes, and ambiguous events are reconciled with the
filesystem. `quiet: true` suppresses routine generation and watcher messages.

Initial plugin generation is synchronous so the output exists when Next loads
its configuration. Watcher regeneration uses asynchronous filesystem operations
and a debounced, serialized queue. It does not run on a worker thread. A single
process shares a watcher per output; this does not coordinate separate processes.

Prefer this main-entry import for new code. `withTypeRoutes` from
`@eliyya/type-routes/next` is a deprecated compatibility alias with the same
options and wrapper behavior.

## CLI and pipelines

Invoke the project's locally installed binary in package scripts:

```json
{
  "scripts": {
    "routes:generate": "type-routes --input src/app --output src/lib/routes.ts",
    "typecheck": "npm run routes:generate && tsc --noEmit",
    "build": "npm run routes:generate && next build"
  }
}
```

Adapt the runner to the project's package manager and prepend generation to
existing checks/build commands rather than replacing them. In CI, install
dependencies including this package, generate routes, then typecheck/build.
Run without `--watch` in pipelines so the command can finish. If the generated
file is ignored by Git, ensure generation also precedes standalone local checks.

CLI options:

- `-i, --input`: App Router directory; default `src/app`.
- `-o, --output`: output file; default `src/lib/routes.ts`.
- `-e, --extra`: additional route path; repeat it for multiple routes.
- `-w, --watch`: regenerate during development.
- `--debounce-ms`: watcher delay; default `300`.
- `-h, --help`: show usage.

```sh
# Run from the Next app's directory; these examples are package script commands.
type-routes -i app -o lib/routes.ts
type-routes -i src/app -o src/lib/routes.ts -e / -e '/users/[id]'
type-routes -i src/app -o src/lib/routes.ts --watch --debounce-ms 300
```

There is no CLI `--quiet` or `--paramConstraints` flag. Quote bracketed/grouped
paths as needed by the shell. CLI generation uses asynchronous filesystem
operations and initial failures exit with a nonzero status.

For a watcher isolated from the Next process, set `watch: false` in the plugin
and run `type-routes --watch` alongside `next dev` with matching input, output,
and extra routes. The plugin still performs its initial generation. Use this
mode only without parameter constraints, which the CLI cannot reproduce. Do not
keep both the plugin and CLI watchers enabled for the same output across
processes.

## Use generated routes

Assuming these files exist under the configured input directory:

| Route file | Call | Result |
| --- | --- | --- |
| `page.tsx` | `app()` | `/` |
| `dashboard/page.tsx` | `app.dashboard()` | `/dashboard` |
| `users/[id]/page.tsx` | `app.users.$id('123')` | `/users/123` |
| `api/auth/[...all]/route.ts` | `app.api.auth.$$all('login', 'callback')` | `/api/auth/login/callback` |
| `posts/[[...slug]]/page.tsx` | `app.posts._$$slug('hello')` | `/posts/hello` |
| `(marketing)/about/page.tsx` | `app.about()` | `/about` |

```tsx
import Link from 'next/link'
import { app } from '@/lib/routes' // use the project's actual output import

export function UserLink({ id }: { id: string }) {
    return <Link href={app.users.$id(id)}>View user</Link>
}
```

Use the returned string with `Link`, `router.push`, `redirect`, or API requests.
Pass dynamic parameters in ancestor-to-descendant order at the final route call:
`app.$locale.users.$id('es', '123')`. Intermediate directories are callable only
when they have a `page.tsx`, a `route.ts`, or an explicit extra route. A callable
node can also have child properties.

`[param]` becomes `$param`; `[...param]` becomes `$$param`; `[[...param]]` becomes
`_$$param`. Catch-all calls take separate string arguments. The current optional
catch-all runtime leaves a trailing slash when called without arguments, e.g.
`app.posts._$$slug()` yields `/posts/`.

## Verify and respect the supported scope

- Scan support is limited to `page.tsx` and `route.ts`; this is an App Router
  tool, not a Pages Router scanner. It does not discover `page.js`, `page.ts`,
  or other file extensions.
- An existing input directory without matching route files produces an empty
  `app` object. Extra routes generate URL helpers and do not create Next pages
  or endpoints.
- Route groups `(group)` are removed. Parallel slots and intercepted routes do
  not receive special URL normalization; verify their output before using it.
- `paramConstraints` restricts TypeScript calls; it does not validate values at
  runtime. Query strings, hashes, base paths, and parameter URL encoding are not
  added automatically.
- Treat the output as generated code. Change route files/options and regenerate
  instead of editing it. A fingerprint of normalized, sorted, deduplicated paths,
  extra routes, constraints, and schema version skips tree/code generation when
  the output is intact. The output's first comment stores its content hash; its
  second stores the input fingerprint. Deleted or edited output is recreated on
  the next generation run. Matching inputs and intact output skip rewriting.
- Check that generation produced the expected file and route calls, then run the
  project's TypeScript check. Initial CLI generation failures, including an
  unreadable input directory, exit with a nonzero status. Keep generation ahead
  of checks/builds with `&&` so a failed generation cannot proceed with old output.

When reporting integration, identify the chosen mode, configured paths, pipeline
ordering, and checks actually completed.
