import { useEffect, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { load, destroy, isSessionReady, on, whenLoaded, BUTTON_TEXT_LANGS } from './index.js'
import type { ButtonTextLang, LoadOptions, PosterParams } from './index.js'

export { BUTTON_TEXT_LANGS }
export type { ButtonTextLang, LoadOptions, PosterParams }

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

/**
 * The shape of the button.
 *
 * A shape says which parts of the button are painted. The colour settings say
 * what colour they are. The two questions are independent: each shape can carry
 * your own colours, or the colours of your theme.
 *
 * - `solid`   a filled button with a label. The default.
 * - `outline` the same box with no fill.
 * - `glyph`   the mark and the label, with no box.
 * - `icon`    the mark alone.
 *
 * Each shape carries the same mark. A shape says what is drawn around the mark. It does not
 * say if the mark is there. `icon` is only the extreme of that: the shape with nothing else
 * in it.
 *
 * On the free plan the mark is drawn in the brand colour, and not in the colour of the label
 * beside it. That is the full extent of the branding, and it is visible on the shapes that
 * carry no fill of ours.
 */
export type ButtonVariant = 'solid' | 'outline' | 'glyph' | 'icon'

/** The appearance settings that a merchant can set for one button. */
export interface SeeOnWallButtonStyleProps {
  /**
   * The shape of the button. The default is `"solid"`, which is the button that
   * this package gave before the shapes came. Refer to {@link ButtonVariant}.
   *
   * The three shapes with no fill take the colour of the text around them. Thus
   * they agree with a light theme and with a dark theme, and you set nothing.
   *
   * A colour that a shape does not paint does nothing. `backgroundColor`
   * reaches `"solid"` only, and `borderColor` and `borderRadius` do not reach
   * `"glyph"`. `textColor` reaches every shape: it paints the label, the mark,
   * and the border of `"outline"` if you give no border colour.
   *
   * With `"icon"` the label stays. It becomes the accessible name of the button
   * and the tooltip, thus the button keeps a name that a screen reader reads.
   */
  variant?: ButtonVariant
  /**
   * Stretches the button to the full width of the element that holds it. The
   * default is the natural width of the button.
   *
   * The shape decides how far this setting goes. `"solid"`, `"outline"` and
   * `"glyph"` become as wide as the element, and `"glyph"` puts its mark and
   * its label in the middle. `"icon"` stays 40px square: a wide button with one
   * mark in it is a target that the shopper cannot read.
   */
  fullWidth?: boolean
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
   * shape, the size and the typography of that button. It does not copy the
   * colours.
   *
   * The width comes with the size. A theme button that is as wide as its own
   * label gives a floor in pixels, because your label is a different string and
   * can need more room. A theme button that fills its row gives the full width
   * of the row, thus the two buttons stay together at every width of the page.
   *
   * The shapes with no box, `"glyph"` and `"icon"`, do not copy a button. There
   * is no box to copy, and they take the font of the page.
   */
  matchButton?: string
  /**
   * Your own label for the button, in place of the label of the widget.
   *
   * Give one string to use the same label in every language. Give an object to
   * write a label for each language, for example
   * `{ en: 'Preview on my wall', de: 'An meiner Wand ansehen' }`. A language
   * that the object does not name keeps the label of the widget, thus you name
   * only the languages that you want to change.
   *
   * The keys are the languages of {@link BUTTON_TEXT_LANGS}. A shopper whose
   * language is not one of them reads the English label, and the English label
   * of this object if you give one.
   *
   * Under the `"icon"` shape the label is still the accessible name and the
   * tooltip of the button. Thus this value reaches a screen reader even where
   * the button shows no text.
   */
  buttonText?: string | Partial<Record<ButtonTextLang, string>>
  /**
   * Copies the colours of the button named in `matchButton` as well.
   *
   * The shapes with no fill do not copy the colours. A colour that was selected
   * against a fill, for example white on a black button, disappears on the
   * background of the page.
   */
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
  /**
   * Reads the sizes from a size control on the page, and not from the props (ADR 185).
   *
   * Give `"auto"` to let the widget find the control, or give a CSS selector to name one.
   * `"auto"` looks in the form around the mount, then in the product around the mount, and
   * no wider. It accepts a `select`, or a group of radio buttons or checkboxes, whose option
   * labels are sizes: `60x40cm`, `Medium (50x70cm)` and `Small - 30x40cm` all give a size.
   *
   * The control wins against {@link posterSizes}, {@link posterWidth} and
   * {@link posterHeight}, because the control holds the size that the shopper selected and
   * the props were written before the shopper selected one. A control that shows no
   * selection gives the list only, and the preview opens with the smallest size in it.
   *
   * The widget reads the control again at each click, thus you do not add a listener.
   *
   * Most storefronts do not need this prop. You know your sizes, thus give them in
   * {@link posterSizes}. Use this prop when a different part of the page, for example a
   * plugin, draws the size control.
   */
  sizesFrom?: string
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
    sizesFrom,
    posterInset,
    productPageUrl,
    lang,
    frameDefaultCm,
    frameDefaultColor,
    framePreset,
    variant,
    fullWidth,
    backgroundColor,
    textColor,
    borderRadius,
    borderColor,
    buttonClassName,
    buttonText,
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
  attr(attributes, 'data-sizes-from', sizesFrom)
  attr(attributes, 'data-poster-inset', posterInset)
  attr(attributes, 'data-product-page-url', productPageUrl)
  attr(attributes, 'data-lang', lang)
  attr(attributes, 'data-frame-default-cm', frameDefaultCm)
  attr(attributes, 'data-frame-default-color', frameDefaultColor)
  attr(attributes, 'data-frame-preset', framePreset)
  // A mount with no attribute is a solid button to the widget. Thus the default
  // shape writes nothing, and the markup stays as it was before the shapes came.
  if (variant !== undefined && variant !== 'solid') {
    attributes['data-button-variant'] = variant
  }
  // The widget reads the value "full" and no other value. Thus the attribute is
  // absent for a button of the natural width, as it is for the default shape.
  if (fullWidth === true) {
    attributes['data-button-width'] = 'full'
  }
  attr(attributes, 'data-bg-color', backgroundColor)
  attr(attributes, 'data-text-color', textColor)
  attr(attributes, 'data-border-radius', borderRadius)
  attr(attributes, 'data-border-color', borderColor)
  attr(attributes, 'data-button-class', buttonClassName)
  // One attribute for each language, because the widget reads the attribute of
  // the language of the shopper and of no other language. A single string is
  // therefore the same string in every one of them.
  if (typeof buttonText === 'string') {
    for (const lang of BUTTON_TEXT_LANGS) {
      attr(attributes, `data-button-text-${lang}`, buttonText)
    }
  } else if (buttonText) {
    for (const [lang, text] of Object.entries(buttonText)) {
      attr(attributes, `data-button-text-${lang}`, text)
    }
  }
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
