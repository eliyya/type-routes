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

> [!IMPORTANT]
> You need to set `type: "module"` in your `package.json` if you use `withTypeRoute()` config in your `next.config.mjs`
