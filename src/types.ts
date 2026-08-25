/**
 * The poster contract. This file is a copy of the definition in the snippet.
 * The source files are `integration-snippet/src/config.ts` and
 * `integration-snippet/src/sizeParser.ts`.
 *
 * The package repeats these types. It does not import them. This package has
 * its own public repository, because npm provenance must attest to it. The
 * repository of the snippet is private.
 *
 * A check in the snippet repository compares this file with the source. The
 * check fails when the two files disagree. The check finds a difference, but it
 * cannot prevent one. Thus you must change the source file first. Then copy the
 * new text to this file. Do not do this in the opposite order.
 *
 * The text below the next line is an exact copy. Do not edit the wording, or
 * the check fails.
 */

export type SizeUnit = 'cm' | 'in'

export interface PosterParams {
  posterUrl: string
  posterTitle?: string
  /**
   * The unit for a value in this object that does not give one. Refer to
   * ADR 094. The default is "cm".
   *
   * A value that gives its own unit does not change. Examples are "24cm",
   * "10in" and "a4". Thus a shop-wide unit cannot change the meaning of a
   * number that was already complete.
   *
   * This value also selects the first unit for the wall, the frame and the mat.
   * The shopper can select a different unit in the visualizer.
   */
  sizeUnit?: SizeUnit
  /**
   * The width of the poster. Give one of these three forms:
   *
   * - A number in the unit of {@link sizeUnit}.
   * - A string with its own unit, for example "24cm", "10in", "29,7 cm" or '11"'.
   * - The name of a format, for example "a4". The width of A4 is 21cm.
   *
   * To declare a poster by name, write the same name in {@link posterHeight}.
   */
  posterWidth?: number | string
  /**
   * The height of the poster. The forms are those of {@link posterWidth}. The
   * height of A4 is 29.7cm.
   */
  posterHeight?: number | string
  /**
   * The sizes that the shopper can select. Write them in one string and put a
   * comma between them.
   *
   * Each item is a "WxH" pair or the name of a format. An item can give its own
   * unit. Examples are "30x40,50x70", "12x16in,18x24in" and "a4,a3,50x70cm". An
   * item without a unit uses {@link sizeUnit}.
   *
   * The visualizer shows a size selector when there is more than one item.
   */
  posterSizes?: string
  /**
   * The part of the image that holds the artwork. Write four percentages and
   * put a comma between them: the left edge, the top edge, the width and the
   * height. Refer to ADR 092.
   *
   * Many shops sell with a mockup image. The print is in the middle of a
   * coloured field, and often it has a frame. The print becomes too small if
   * the visualizer uses the full image.
   *
   * The widget sends this value without a change. The visualizer reads it and
   * ignores a value that it cannot read. Thus an error in a theme setting gives
   * the full image. It does not stop the preview.
   */
  posterInset?: string
  /**
   * The address of the product page for this poster.
   *
   * A bookmark uses this address. Without it, a bookmark uses the address of
   * the page that holds the button. Give this value on a list page or a search
   * page, where each poster has its own page.
   */
  productPageUrl?: string
  /**
   * The language for this button only. Write a BCP-47 tag, for example "pl" or
   * "de". The widget reads it from the `data-lang` attribute of the mount.
   *
   * The widget uses this language for the label of the button, and it sends the
   * language to the visualizer. This value replaces the language of the shop
   * for this button. It does not change the other buttons.
   */
  lang?: string
  /**
   * The width in centimetres of the frame that the preview starts with.
   *
   * The preview shows no frame if this value is absent or 0. Most shops sell a
   * print without a frame. Give this value only if the price on the page
   * includes a frame. The shopper can add a frame or remove it.
   */
  frameDefaultCm?: number
  /**
   * The colour of that frame, as a hex value, for example "#3E2723". The widget
   * ignores this value if {@link frameDefaultCm} is 0 or absent. The default is
   * black.
   */
  frameDefaultColor?: string
  /**
   * The name of a frame that this shop sells (ADR 162).
   *
   * The widget reads it from the `data-frame-preset` attribute of the mount. It selects a frame
   * from the catalogue of the shop, and the preview opens with the width and the colour of that
   * frame. This value beats {@link frameDefaultCm} and {@link frameDefaultColor}.
   *
   * The value is the name that the merchant gave the frame in the admin portal. A name that no
   * frame carries is ignored, and the two values above then apply.
   */
  framePreset?: string
}
