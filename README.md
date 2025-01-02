# type-routes

Type your routes to avoid 404 redirects or callbacks.

Just only install with

```shell
npm i @eliyya/type-routes
```

Configure your `next.config.mjs`

```js
import { withTypeRoute } from '@eliyya/type-routes/next'

export default withTypeRoute({
    /* config options here */
})
```

Or run the cli to update your app's paths manually if you don't want to modify your `next.config.mjs`.

```bash
npx type-routes
```

And use in your application

```ts
import { app } from '@eliyya/type-routes'

export async function AdminPage() {
    const user = await getUser()

    if (!user) redirect(app.login())
    if (!user.admin) redirect(app())

    const adminInfo = await api(app.api.adminInfo(), { id: user.id })

    return (
        <>
            <nav>
                <Link href={app.admin.panel()}></Link>
                <Link href={app.admin.watcher()}></Link>
            </nav>
            <Dashboard info={adminInfo} />
        </>
    )
}
```

-   if the path is only a directory that contains more directories inside, will return an object with the directories that are found inside as properties with their respective type
    > Example: `src/app/user/settings/` will be converted to `app.user` and return `{ settings: ... }`
-   If the path contains a [`page.js`](https://nextjs.org/docs/app/api-reference/file-conventions/page) file or [`route.js`](https://nextjs.org/docs/app/api-reference/file-conventions/route) file, it can be run as a function to return the string corresponding to the path
    > Example: `src/app/user/page.js` will be converted to `app.user()` and return `'/user/'`
-   If it is a [dynamic route](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes) marked by the [`[dirname]` convention](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes#convention), it will be renamed to `$dirname` and the function will receive the parameters, this applies to your paths within it.
    > Example:`src/app/user/[id]/[option]/page.js` will be converted to `app.user.$id.$option('123', 'abc')` and return `'/user/123/abc/'`
-   if the path is a [catch-all segment](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes#catch-all-segments) marked by the [convention `[...dirname]`](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes#catch-all-segments), it will be similar to a Dynamic Path, but it will be renamed to `$$dirname`
    > Example:`src/app/user/[...rest]/page.js` will be converted to `app.user.$$rest('123', 'abc')` and return `'/user/123/abc/'`

## Motivation

Creating new routes with a file-based router is so easy that sometimes we forget to update all the references in our code when a route is removed or changed.

Nextjs is taking action with the [experimental typedRoutes option](https://nextjs.org/docs/app/api-reference/config/typescript#statically-typed-links), however, this only works when used in Link tags, so there can be errors in runtime when using a redirect or even in references within our code.

This package solves it in a magic and comfortable way bringing the routes as safe type functions to be able to provoke an error in compilation and to avoid disasters with a simple way to use it without so much configuration.

> [!IMPORTANT]
> You need to set `type: "module"` in your `package.json` if you use `withTypeRoute()` config in your `next.config.mjs`
