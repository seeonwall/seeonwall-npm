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
| `variant` | `solid` \| `outline` \| `glyph` \| `icon` | The shape of the button. Default `solid`. |
| `fullWidth` | boolean | Stretches the button to the width of its container. |
| `backgroundColor`, `textColor`, `borderRadius`, `borderColor` | | Button appearance. |
| `buttonClassName` | | Your theme's classes, added after the widget's own. |
| `matchButton` | selector | Copies shape and typography from one of your own buttons. |
| `matchColors` | boolean | Also copies its colours. |

### Button shapes

`variant` says which parts of the button are painted; the colour props say what colour
they are. The two are independent, so any shape can carry your colours or your theme's.

| | |
|---|---|
| `solid` | A filled button with a label. The default, and what the button looked like before. |
| `outline` | The same box with no fill. |
| `glyph` | The mark and the label, with no box. Reads as a secondary action. |
| `icon` | The mark alone, 40px square. It fits beside Add to cart rather than under it. |

```tsx
<SeeOnWallButton posterUrl={product.image} variant="glyph" />
```

The three shapes with no fill take their colour from the text around them, so they suit a
light or a dark theme with nothing to set. That also decides which colour props have
somewhere to land: `backgroundColor` reaches `solid` alone, and `borderColor` and
`borderRadius` do not reach `glyph`. `textColor` reaches every shape — it paints the label,
the mark, and the `outline` border when `borderColor` is absent. Passing a colour a shape
cannot use is harmless; it applies again as soon as you change back to a shape that can.

`glyph` and `icon` ignore `matchButton`: they draw no box to match, and they take the host
page's own font. `outline` still matches shape and typography, but not colours — a colour
picked against a filled Add to cart disappears on your page background.

`fullWidth` stretches `solid`, `outline` and `glyph` to the width of the element that holds
them. `icon` stays 40px square whatever you pass — a wide button with one mark in it is a
target a shopper cannot read.

Under `icon` the label is still resolved and translated as usual. It becomes the button's
accessible name and its tooltip, so a screen reader still announces it.

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

The shapes above are `data-button-variant="outline" | "glyph" | "icon"` on the mount, and
`data-button-width="full"` stretches the button to its container.

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
| `isSessionReady()` | Returns the cached readiness hint for the current shop session. It is for optional fast wall preview controls, never authorization. |
| `refreshSessionState()` | Refreshes the safe session hint and resolves to `none`, `creating`, `ready`, or `expired`. |
| `on('session-change', listener)` | Reacts to session changes in this or another same-origin shop tab. Returns an unsubscribe function. |
| `openCataloguePreview(params)` | Previews one poster on the wall the shopper already prepared. Resolves to `{ opened: true }` or a reason. |
| `whenLoaded()` | Resolves once the widget is available, including when `load()` has not been called yet. |
| `destroy()` | Stops the widget and removes everything it added. |
| `snippetVersion()` | The loaded widget version, or `null`. Useful in bug reports. |

From `seeonwall/react`:

| | |
|---|---|
| `useSeeOnWall(options)` | Loads the widget for as long as a component needs it. Same options as `load()`. |
| `SeeOnWallButton` | Renders a mount for the widget's button. |
| `useSessionReady()` | `true` while the shopper has a wall ready for this shop. Re-renders when that changes. |

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
//
// The listener also runs when the shopper comes back to your page after setting
// up a wall on a phone, which is the moment the controls first make sense.
```

In React, prefer the hook — it subscribes, unsubscribes and re-renders for you:

```tsx
import { useSessionReady } from 'seeonwall/react'

function CompareButton(props) {
  if (!useSessionReady()) return null
  return <button onClick={() => openCataloguePreview(props)}>See on your wall</button>
}
```

It returns `false` on the server and on the first paint, so server and client markup agree, and it
turns `true` once the widget loads and finds a stored session.

### Fast wall preview

`openCataloguePreview(params)` shows one poster on the wall the shopper set up earlier, without
repeating the photo step. Use it on listing and recommendation surfaces, where the shopper is
comparing products rather than configuring one.

It takes the same `PosterParams` as `open()`, and it never throws — a refusal comes back as a
reason, so a control that ignores the result looks like a button that does nothing.

```ts
import { isSessionReady, openCataloguePreview } from 'seeonwall'

// Show the control only once a wall exists; the first-time visitor has none.
if (isSessionReady()) {
  const result = await openCataloguePreview({
    posterUrl: 'https://cdn.myshop.com/posters/dune.jpg',
    posterTitle: 'Dune',
    posterWidth: '50cm',
    posterHeight: '70cm',
  })
  if (!result.opened) reportToShopper(result.reason)
}
```

| reason | |
|---|---|
| `no-ready-session` | The shopper has not set up a wall yet. Use `isSessionReady()` to avoid this one. |
| `session-expired` | The stored session is gone. Sessions last seven days. |
| `not-entitled` | The shop plan does not include fast wall preview. |
| `inactive-product` | The product is not active for SeeOnWall. Shopify and WooCommerce only. |
| `disabled` | The merchant turned fast wall preview off. Shopify and WooCommerce only. |
| `invalid-poster-data` | A missing poster URL, or a width or height that could not be read. |
| `poster-unavailable` | The artwork could not be prepared for preview. |
| `rate-limited` | Too many requests from this shopper. |
| `network-error` | The request did not complete. |
| `unsupported` | The widget on the page is older than this function. See below. |

Fast wall preview needs a paid SeeOnWall plan. Calling this function is itself the decision to show
it, so there is no separate switch for a script-tag storefront; the Shopify and WooCommerce apps keep
that choice in their own settings. Without a paid plan the call resolves with `not-entitled`.

The package fetches the widget at runtime rather than bundling it, so a browser can still hold a
copy from before this function existed. That copy resolves `unsupported` instead of failing, and it
keeps working for everything else. Treat `unsupported` as "not available here", not as an error.

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
