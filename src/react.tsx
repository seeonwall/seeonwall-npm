import { useEffect, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { load, destroy, isSessionReady, on, whenLoaded } from './index.js'
import type { LoadOptions, PosterParams } from './index.js'

export type { LoadOptions, PosterParams }

/**
 * The number of components that use the widget at this moment.
 *
 * The count is necessary because a page can have many buttons, but the widget
 * is one object for the full page. The widget stops only when the last
 * component goes away. A stop after the first component goes away would remove
 * the buttons of all the others.
 */
let consumers = 0

/**
 * Loads the widget while a component is on the page.
 *
 * Call this hook one time, high in your application. You can also call it in
 * each component that shows a button: the hook counts its users, thus more than
 * one call is safe.
 *
 * The hook obeys the lifecycle of React. It loads the widget when the component
 * arrives and stops the widget when the last one goes away. React StrictMode
 * runs this sequence two times in development. The result is the same.
 */
export function useSeeOnWall(options: LoadOptions): void {
  const { shopId, embedUrl, lang, sizeUnit, scriptUrl } = options

  useEffect(() => {
    consumers += 1
    void load({
      shopId,
      ...(embedUrl !== undefined ? { embedUrl } : {}),
      ...(lang !== undefined ? { lang } : {}),
      ...(sizeUnit !== undefined ? { sizeUnit } : {}),
      ...(scriptUrl !== undefined ? { scriptUrl } : {}),
    }).catch((err: unknown) => {
      console.error('[seeonwall] The widget did not load.', err)
    })

    return () => {
      consumers -= 1
      if (consumers === 0) {
        destroy()
      }
    }
    // Each option is a dependency. A change to one of them starts the widget
    // again with the new value.
  }, [shopId, embedUrl, lang, sizeUnit, scriptUrl])
}

/**
 * Watches the widget for a session that is ready.
 *
 * The snippet does not report a change when it starts, thus a session that was
 * already in storage becomes visible only when the widget arrives. The
 * subscription below reads the value again at that moment.
 */
function subscribeToSession(onStoreChange: () => void): () => void {
  let cancelled = false
  const unsubscribe = on('session-change', onStoreChange)
  void whenLoaded().then(() => {
    if (!cancelled) onStoreChange()
  })
  return () => {
    cancelled = true
    unsubscribe()
  }
}

/**
 * Returns true while the shopper has a wall that is ready for this shop.
 *
 * Use the value to show or hide an optional control, for example a button that
 * calls `openCataloguePreview` from the main entry. The value is a hint of the
 * browser. It is never authorization: the server examines the session again on
 * each action.
 *
 * The value is false on the server and on the first paint. It becomes true
 * after the widget loads, thus your markup is the same on both sides.
 */
export function useSessionReady(): boolean {
  return useSyncExternalStore(subscribeToSession, isSessionReady, () => false)
}

/** The appearance settings that a merchant can set for one button. */
export interface SeeOnWallButtonStyleProps {
  /** The background colour of the button, for example `"#b5502a"`. */
  backgroundColor?: string
  /** The text colour of the button. */
  textColor?: string
  /** The corner radius of the button, for example `"4px"`. */
  borderRadius?: string
  /** The border colour of the button. */
  borderColor?: string
  /**
   * The classes of your own theme to put on the button. The widget adds them
   * after its own class, thus your styles win where they are more specific.
   */
  buttonClassName?: string
  /**
   * A CSS selector for a button of your theme to copy. The widget copies the
   * shape and the typography of that button. It does not copy the colours.
   */
  matchButton?: string
  /** Copies the colours of the button named in `matchButton` as well. */
  matchColors?: boolean
}

export interface SeeOnWallButtonProps
  extends Omit<PosterParams, 'posterSizes'>,
    SeeOnWallButtonStyleProps {
  /**
   * The sizes that the shopper can select. Give an array, for example
   * `['30x40', '50x70']`. A string with commas also works.
   *
   * The widget shows a size selector when there is more than one size.
   */
  posterSizes?: string[] | string
  /** Classes for the element that holds the button. */
  className?: string
  /** Styles for the element that holds the button. */
  style?: CSSProperties
}

/**
 * Adds a value to the map of attributes, but only when the value is present.
 * An absent attribute and an empty attribute do not mean the same thing to the
 * widget.
 */
function attr(
  target: Record<string, string>,
  name: string,
  value: string | number | undefined,
): void {
  if (value !== undefined && value !== '') {
    target[name] = String(value)
  }
}

/**
 * A place for the "See on wall" button.
 *
 * The component gives the widget an empty element and the widget puts the
 * button inside it. The component does not draw a button itself. This keeps the
 * logo, the permitted domains, the theme match and the language of the label in
 * the widget, which already does all four.
 *
 * Your application must also call {@link useSeeOnWall} one time, or no button
 * arrives.
 */
export function SeeOnWallButton(props: SeeOnWallButtonProps): ReactElement {
  const {
    posterUrl,
    posterTitle,
    sizeUnit,
    posterWidth,
    posterHeight,
    posterSizes,
    posterInset,
    productPageUrl,
    lang,
    frameDefaultCm,
    frameDefaultColor,
    framePreset,
    backgroundColor,
    textColor,
    borderRadius,
    borderColor,
    buttonClassName,
    matchButton,
    matchColors,
    className,
    style,
  } = props

  const attributes: Record<string, string> = {}
  attr(attributes, 'data-poster-url', posterUrl)
  attr(attributes, 'data-poster-title', posterTitle)
  attr(attributes, 'data-size-unit', sizeUnit)
  attr(attributes, 'data-poster-width', posterWidth)
  attr(attributes, 'data-poster-height', posterHeight)
  attr(
    attributes,
    'data-poster-sizes',
    Array.isArray(posterSizes) ? posterSizes.join(',') : posterSizes,
  )
  attr(attributes, 'data-poster-inset', posterInset)
  attr(attributes, 'data-product-page-url', productPageUrl)
  attr(attributes, 'data-lang', lang)
  attr(attributes, 'data-frame-default-cm', frameDefaultCm)
  attr(attributes, 'data-frame-default-color', frameDefaultColor)
  attr(attributes, 'data-frame-preset', framePreset)
  attr(attributes, 'data-bg-color', backgroundColor)
  attr(attributes, 'data-text-color', textColor)
  attr(attributes, 'data-border-radius', borderRadius)
  attr(attributes, 'data-border-color', borderColor)
  attr(attributes, 'data-button-class', buttonClassName)
  attr(attributes, 'data-match-button', matchButton)
  if (matchColors === true) {
    attributes['data-match-colors'] = 'true'
  }

  // The element stays empty. The widget puts a button inside it, and React does
  // not touch a child that React did not make.
  return (
    <div
      className={className ? `seeonwall-button ${className}` : 'seeonwall-button'}
      style={style}
      {...attributes}
    />
  )
}
