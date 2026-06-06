# Changelog

All notable changes to this project will be documented in this file.

# 3.0.0

## Breaking Changes

-   **rewrite** Complete rewrite from scratch. TypeScript 6 and ESM.
-   **API** `withTypeRoute` -> `withTypeRoutes` (plural). Options shape changed.
-   **import path** Previously `import { app } from '@eliyya/type-routes'` imported the generated runtime directly from the package. Now the package generates a file at the configured output path; you import from that file (e.g. `import { app } from '@/lib/routes'`).

## Features

-   **CLI** `type-routes` binary with `--input`, `--output`, `--watch`, `--extra`, `--debounce-ms` flags.
-   **Next.js plugin** `withTypeRoutes()` generates runtime on config load. In dev mode, watches the input directory for `page.tsx`/`route.ts` changes and regenerates automatically.
-   **extraRoutes** Force-generate routes that don't exist on disk (e.g. `'/'` when there's no `page.tsx` at root).
-   **paramConstraints** Restrict dynamic parameter values at the type level (`<$locale extends 'en' | 'es'>`).
-   **Object.assign pattern** Mixed nodes - directories with both a `page.tsx`/`route.ts` and sub-routes - use `Object.assign(fn, { children })`, making the node both callable and a namespace.
-   **Recursive template literal types** Deeply nested routes generate accurate path template literals with generic parameters.
-   **Catch-all segments** `[...param]` -> `$$param` rest params. Optional catch-all `[[...param]]` -> `_$$param` with default empty array.

## Improvements

-   **Architecture** Separated into `index.ts` (core tree/generation), `generate.ts` (file reading and orchestration shared by CLI and plugin), `next.ts` (plugin), `cli.ts` (binary).
-   **ESM** Full ESM support with `rewriteRelativeImportExtensions` for clean `.ts` -> `.js` output.
-   **Tests** 36 tests using Node's native test runner (`node:test` + `node:assert`). No Jest/vitest dependency.
-   **Linting** ESLint flat config with `typescript-eslint` and `eslint-plugin-import-x` with TypeScript resolver.
-   **Route groups** `(group)` segments stripped from generated paths.

# 2.5.4

## Fix

-   **build** fixed build

# 2.5.3

## Fix

-   **output** removed tail slash

# 2.5.2

## Fix

-   **postinstall** fixed postinstall

# 2.5.1

## Fix

-   **TypeError** fixed TypeError

# 2.5.0

## Features

-   **definedParams** added support for defined params

# 2.3.0

## deeps

-   **\[...all]** suport catch-all segments
-   **\[\[all]]** suport optional catch-all segments

# 2.2.8

## deeps

-   **\[next]** next update

# 2.2.6

## Fix

-   **\[name-fix]** Fix routes wit `-` in asigns

# 2.2.5

## Fix

-   **name-fix** Fix routes wit `-` in names

## Features

-   **string | number** Acepts number in params routes

# 2.2.1

## Fix

-   **vanilla** Remove test

# 2.2.0

## Changues

-   **vanilla** Removed all dependencies
-   **lightweight** Reduced by 47%

# 2.1.0

## Breaking Changues

-   **root** Remove completly root exports

## Features

-   **Parallel Routes** added support for Parallel Routes
-   **Route Groups** added support for Route Groups
-   **Catch-all Segments** added support for Catch-all Segments
-   **Return Type** The return type has been improved by displaying the exact output

# 1.1.2

## Fix

-   **default export** type correctly the initial export after install
