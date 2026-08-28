# seeonwall

Show shoppers a poster on their own wall, at true scale, before they buy.

This package loads the [seeonwall.com](https://seeonwall.com) widget into a
JavaScript storefront — Hydrogen, Next.js, Nuxt, or any app that builds its own
product pages. If your shop is a Shopify theme or a WooCommerce site, install the
app or the plugin instead; you do not need this package.

## Install

```bash
npm install seeonwall
```

You need a shop id from the [SeeOnWall dashboard](https://seeonwall.com).

## React

```tsx
import { useSeeOnWall, SeeOnWallButton } from 'seeonwall/react'

function ProductPage({ product }) {
  useSeeOnWall({ shopId: 'YOUR_SHOP_ID' })

  return (
    <SeeOnWallButton
      posterUrl={product.image}
      posterTitle={product.title}
      posterWidth={50}
      posterHeight={70}
      posterSizes={['30x40', '50x70', '70x100']}
    />
  )
}
```

`useSeeOnWall` loads the widget and stops it when the last component using it
unmounts. It counts its callers, so calling it in several components is safe, and
it survives StrictMode's double-invoked effects.

`SeeOnWallButton` renders an empty mount and lets the widget put the button
inside. It deliberately does not render its own button — that keeps the logo,
the allowed-domain check, the theme match and the localised label in the code
that already implements all four.

React is a peer dependency, so you use whichever version you already have.

### Button props

Everything in `PosterParams`, plus:

| prop | | |
|---|---|---|
| `posterSizes` | `string[]` or `string` | An array is joined with commas for you. |
| `className`, `style` | | Applied to the mount element. |
| `backgroundColor`, `textColor`, `borderRadius`, `borderColor` | | Button appearance. |
| `buttonClassName` | | Your theme's classes, added after the widget's own. |
| `matchButton` | selector | Copies shape and typography from one of your own buttons. |
| `matchColors` | boolean | Also copies its colours. |

## Vanilla JavaScript

```js
import { load } from 'seeonwall'

await load({ shopId: 'YOUR_SHOP_ID' })
```

That is the whole setup. The package fetches the widget and starts it.

Then mark any element on the page as a button mount, and the widget puts a
"See on wall" button inside it:

```html
<div class="seeonwall-button"
     data-poster-url="https://example.com/poster.jpg"
     data-poster-width="50"
     data-poster-height="70"></div>
```

Mounts added later are picked up automatically, so client-side navigation works
without another call to `load()`.

The full list of `data-*` attributes — sizes, frames, passe-partout, per-button
language — is in the [integration docs](https://seeonwall.com/docs).

### Open the preview without a button

```js
import { open } from 'seeonwall'

open({
  posterUrl: 'https://example.com/poster.jpg',
  posterWidth: 50,
  posterHeight: 70,
  posterSizes: '30x40,50x70,70x100',
})
```

`open()` waits if the widget is still loading, so calling it on the same tick as
`load()` is safe.

### Clean up

```js
import { destroy } from 'seeonwall'

destroy()
```

Removes the buttons, styles, observers and listeners. Call it when you unmount
the part of your app that uses SeeOnWall.

## API

| | |
|---|---|
| `load(options)` | Fetches the widget and starts it. Returns a promise. Safe to call more than once — only the first call does work. |
| `open(params)` | Opens the preview for one poster. |
| `close()` | Closes the preview. |
| `setLanguage(lang)` | Changes language at runtime. Only needed if your language switcher does not update `<html lang>`. |
| `isSessionReady()` | Returns the cached readiness hint for the current shop session. It is for optional catalogue UI, never authorization. |
| `refreshSessionState()` | Refreshes the safe session hint and resolves to `none`, `creating`, `ready`, or `expired`. |
| `on('session-change', listener)` | Reacts to session changes in this or another same-origin shop tab. Returns an unsubscribe function. |
| `destroy()` | Stops the widget and removes everything it added. |
| `snippetVersion()` | The loaded widget version, or `null`. Useful in bug reports. |

From `seeonwall/react`:

| | |
|---|---|
| `useSeeOnWall(options)` | Loads the widget for as long as a component needs it. Same options as `load()`. |
| `SeeOnWallButton` | Renders a mount for the widget's button. |

### `load(options)`

| option | | |
|---|---|---|
| `shopId` | required | Your shop id. |
| `lang` | optional | A BCP-47 tag, e.g. `"de"`. Omit it and the language follows `<html lang>`. |
| `sizeUnit` | optional | `"cm"` (default) or `"in"`. The fallback for sizes that do not state a unit. |
| `embedUrl` | optional | A different visualizer origin. Only if you proxy the embed. |

TypeScript types ship with the package. `PosterParams` and `SizeUnit` are exported.

### Storefront readiness

Use readiness only to decide whether to show optional catalogue-comparison controls. It is a cache hint; every protected SeeOnWall action still validates the session on the server.

```ts
import { isSessionReady, refreshSessionState, on } from 'seeonwall'

await refreshSessionState()
if (isSessionReady()) showCatalogueComparison()

const unsubscribe = on('session-change', updateCatalogueControls)
// Call unsubscribe() when the page or component is disposed.
```

## Notes

**Server rendering is safe.** Every function returns quietly when there is no
`document`, so importing this module on the server does not throw. Call `load()`
in an effect, or anywhere that runs after hydration.

**The widget is fetched at runtime, not bundled.** That is deliberate: fixes reach
your storefront without you reinstalling a package and redeploying.

**ESM only.** The package keeps module state, and a dual CommonJS build would give
some bundlers two copies of it.

**Already have the Shopify app installed?** If a copy of the widget is already on
the page, this package restarts it on your configuration rather than loading a
second one.

## License

MIT — see [LICENSE](./LICENSE).

The licence covers this package. Use of the seeonwall.com service needs an account
and is governed by its [Terms of Service](https://seeonwall.com/terms). SeeOnWall
is a trademark of Mateusz Dziurdziak; the MIT licence does not grant rights to the
name or logo.
