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
   * Fallback unit for any value here that does not state its own (ADR 094).
   * Defaults to "cm". A value that spells out its unit — "24cm", "10in", "a4" —
   * is unaffected by this, so setting it shop-wide can never change the meaning
   * of a number that was already explicit.
   *
   * Also seeds the unit the shopper is shown for wall, frame and mat
   * measurements — they can still switch it in the visualizer.
   */
  sizeUnit?: SizeUnit
  /**
   * Poster width. Either a number in {@link sizeUnit}, or a string carrying its
   * own unit — "24cm", "10in", "29,7 cm", '11"' — or a named format such as
   * "a4", which resolves to that format's width (21cm). Declare a named poster
   * by writing the same name in {@link posterHeight}.
   */
  posterWidth?: number | string
  /** Poster height. Same forms as {@link posterWidth}; "a4" here is 29.7cm. */
  posterHeight?: number | string
  /**
   * Comma-separated list of available poster sizes. Each entry is a "WxH" pair
   * that may carry its own unit, or a named format: "30x40,50x70",
   * "12x16in,18x24in", "a4,a3,50x70cm". Entries without a unit fall back to
   * {@link sizeUnit}.
   * When present with more than one entry, the visualizer shows a size selector.
   */
  posterSizes?: string
  /**
   * Merchant-declared sub-rectangle of the poster image holding the actual artwork,
   * as "left,top,width,height" percentages (ADR 092).
   *
   * Shops sell with mockup images — the print centred on a coloured field, often
   * framed — and rendering the whole image makes the print come out too small.
   * Forwarded verbatim: the visualizer parses it and ignores anything malformed, so a
   * typo in a theme setting degrades to the uncropped rendering rather than breaking.
   */
  posterInset?: string
  /**
   * Explicit product page URL for this poster. When set, bookmarks link to this
   * URL instead of the page where the button was clicked (originPageUrl).
   * Useful on listing/search pages where each poster has its own detail page.
   */
  productPageUrl?: string
  /**
   * Per-button language override (BCP-47 tag, e.g. "pl", "de").
   * Read from data-lang on the .seeonwall-button element.
   * When set, this language is used for the button label and forwarded to the
   * visualizer iframe, overriding the global config.lang for this button only.
   */
  lang?: string
  /**
   * Width in centimetres of the frame the preview starts with. Omitted or 0 means
   * the poster previews unframed, which is what most shops sell — set this only if
   * the price on the page includes a frame. Shoppers can still add or remove one.
   */
  frameDefaultCm?: number
  /**
   * Hex colour of that default frame (e.g. "#3E2723"). Ignored unless
   * frameDefaultCm is greater than 0. Defaults to black.
   */
  frameDefaultColor?: string
}
