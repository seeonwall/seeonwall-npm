import type { PosterParams, SizeUnit } from './types.js'

export type { PosterParams, SizeUnit }

/** The safe storefront state returned by the readiness refresh. */
export type StorefrontSessionState = 'none' | 'creating' | 'ready' | 'expired'

/**
 * Why a fast wall preview did not open.
 *
 * The snippet gives all of these values but the last one. The package adds
 * `unsupported`. The package gets the snippet at runtime, thus the copy on the
 * page can be older than the package and can have no fast wall preview. Refer
 * to ADR 172.
 */
export type CataloguePreviewLaunchResult =
  | { opened: true }
  | {
      opened: false
      reason:
        | 'no-ready-session'
        | 'session-expired'
        | 'inactive-product'
        | 'invalid-poster-data'
        | 'poster-unavailable'
        | 'not-entitled'
        | 'disabled'
        | 'rate-limited'
        | 'network-error'
        | 'unsupported'
    }

const UNSUPPORTED: CataloguePreviewLaunchResult = { opened: false, reason: 'unsupported' }

/**
 * The location of the snippet file.
 *
 * The package gets this file at runtime. The package does not contain the file.
 * Thus a correction to the snippet becomes available to all merchants at the
 * next deployment. A new version of the package is not necessary. Refer to
 * ADR 143.
 */
const DEFAULT_SCRIPT_URL = 'https://seeonwall.com/seeonwall.js'

export interface LoadOptions {
  /** Your shop id. You get the shop id from the SeeOnWall dashboard. */
  shopId: string
  /** A different address for the visualizer. Use it only if you proxy the embed. */
  embedUrl?: string
  /**
   * A BCP-47 language tag, for example "de".
   *
   * If you do not give a value, the snippet reads the language from the
   * `<html lang>` attribute. The snippet then obeys subsequent changes to that
   * attribute. This is usually correct for a single-page application.
   */
  lang?: string
  /** The default unit for a size that does not have one. The default is "cm". */
  sizeUnit?: SizeUnit
  /** A different location for the snippet file. Use this option for tests. */
  scriptUrl?: string
}

/** The interface that seeonwall.js puts on the window object. */
interface SnippetApi {
  init: () => Promise<void>
  ready: () => Promise<void>
  destroy: () => void
  open: (params: PosterParams) => void
  close: () => void
  setLanguage: (lang: string) => void
  isSessionReady: () => boolean
  refreshSessionState: () => Promise<StorefrontSessionState>
  on: (event: 'session-change', listener: () => void) => () => void
  /**
   * Optional on purpose. A snippet that is older than this function does not
   * have it, and {@link isRestartable} must not refuse such a copy. The refusal
   * would stop the widget for a merchant who does not use fast wall preview.
   */
  openCataloguePreview?: (params: PosterParams) => Promise<CataloguePreviewLaunchResult>
  version: string
}

interface SnippetConfig {
  shopId: string
  embedUrl?: string
  lang?: string
  sizeUnit?: SizeUnit
}

declare global {
  interface Window {
    SeeOnWall?: Partial<SnippetApi>
    SeeOnWallConfig?: SnippetConfig
  }
}

let loading: Promise<SnippetApi> | null = null
let api: SnippetApi | null = null

/**
 * One promise for every caller that waits for the widget.
 *
 * A wait can start before load() does. React runs the effect of a child before
 * the effect of its parent, thus a component that watches the session usually
 * starts before the component that loads the widget.
 *
 * All callers share one promise. A new promise for each caller would keep one
 * more object for as long as no load occurs.
 */
let loadedPromise: Promise<void> | null = null
let resolveLoaded: (() => void) | null = null

function announceLoaded(): void {
  const resolve = resolveLoaded
  loadedPromise = null
  resolveLoaded = null
  resolve?.()
}

/**
 * True when the caller wants the widget to run.
 *
 * load() sets this value and destroy() clears it. The value is necessary because
 * destroy() can occur while load() is still in progress. At that moment there is
 * no widget to stop. When the widget becomes available, load() examines this
 * value and stops the widget immediately.
 */
let active = false

/**
 * Returns true if the code runs in a browser.
 *
 * A storefront framework also runs this module on the server. Each function
 * below examines this value first and then stops. An error on the server stops
 * the page. A quiet return only delays the buttons until hydration.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * Makes the configuration object for the snippet.
 *
 * The function adds a property only if the property has a value. It does not
 * set a property to undefined. The snippet makes a difference between a
 * property that is absent and a property that is empty.
 */
function toConfig(options: LoadOptions): SnippetConfig {
  return {
    shopId: options.shopId,
    ...(options.embedUrl !== undefined ? { embedUrl: options.embedUrl } : {}),
    ...(options.lang !== undefined ? { lang: options.lang } : {}),
    ...(options.sizeUnit !== undefined ? { sizeUnit: options.sizeUnit } : {}),
  }
}

function injectScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = url
    el.async = true
    el.addEventListener('load', () => { resolve() }, { once: true })
    el.addEventListener(
      'error',
      () => { reject(new Error(`[seeonwall] Could not load ${url}.`)) },
      { once: true },
    )
    document.head.appendChild(el)
  })
}

/**
 * Returns true if a copy of the snippet on the page is new enough to restart.
 *
 * The function examines every member of the interface, and not only the
 * lifecycle functions. A copy that the loader identifies as possibly old must
 * satisfy the full interface before the loader uses it as such.
 */
function isRestartable(candidate: Partial<SnippetApi>): candidate is SnippetApi {
  return (
    typeof candidate.init === 'function' &&
    typeof candidate.ready === 'function' &&
    typeof candidate.destroy === 'function' &&
    typeof candidate.open === 'function' &&
    typeof candidate.close === 'function' &&
    typeof candidate.setLanguage === 'function' &&
    typeof candidate.isSessionReady === 'function' &&
    typeof candidate.refreshSessionState === 'function' &&
    typeof candidate.on === 'function'
    // openCataloguePreview is absent from this list on purpose. Refer to the
    // note on that member of the interface.
  )
}

/** Stops the widget and forgets it. The caller must set `active` first. */
function stop(): void {
  const running = api
  api = null
  loading = null
  running?.destroy()
}

async function start(options: LoadOptions): Promise<SnippetApi> {
  // Set the configuration before you load or restart the snippet. The snippet
  // reads this global object first. It reads a script tag only after that.
  // Thus the snippet uses your shop id and not the shop id of a Shopify theme
  // extension on the same page.
  window.SeeOnWallConfig = toConfig(options)

  const existing = window.SeeOnWall
  if (existing && isRestartable(existing)) {
    // A copy of the snippet is already active. The copy can come from a theme
    // extension or from a script tag in the theme. Restart this copy with your
    // configuration. Do not load a second copy. Two copies make two mount
    // observers and two message listeners. Also, if you stop one copy, that
    // copy removes the buttons of the other copy.
    existing.destroy()
    await existing.init()
    return existing
  }

  if (existing) {
    console.warn(
      '[seeonwall] An older copy of seeonwall.js is on this page and cannot restart. ' +
        'A second copy will load next to it. Update your Shopify theme extension, ' +
        'or remove the script tag that you installed by hand.',
    )
  }

  await injectScript(options.scriptUrl ?? DEFAULT_SCRIPT_URL)

  const loaded = window.SeeOnWall
  if (!loaded || typeof loaded.ready !== 'function') {
    throw new Error('[seeonwall] The snippet loaded but it did not publish its interface.')
  }
  await loaded.ready()
  return loaded as SnippetApi
}

/**
 * Loads the snippet and starts it for your shop.
 *
 * You can call this function more than one time. Only the first call does work.
 * Thus the function is safe in a React effect. React StrictMode calls an effect
 * two times in development.
 *
 * On the server the function does no work and completes immediately.
 *
 * @returns A promise. The promise completes when the snippet finds the buttons
 *   on the page and {@link open} becomes available. If the promise fails, the
 *   package stays unloaded. You can then call this function again.
 */
export function load(options: LoadOptions): Promise<void> {
  if (!isBrowser()) {
    return Promise.resolve()
  }
  active = true
  if (!loading) {
    loading = start(options).then(
      (loaded) => {
        api = loaded
        announceLoaded()
        // A call to destroy() can occur while the widget loads. The widget
        // starts itself when its script runs, thus the loader must stop it now.
        // Before this point there was no widget to stop.
        if (!active) {
          stop()
        }
        return loaded
      },
      (err: unknown) => {
        // Clear the promise. A later call to load() is then a new attempt and
        // not a repetition of this failure. The usual causes are a network
        // problem or a content security policy.
        loading = null
        throw err
      },
    )
  }
  return loading.then(() => undefined)
}

/**
 * Sends work to the loaded snippet.
 *
 * If the snippet is not ready, the function waits for it. Thus a call to open()
 * on the same tick as load() gives a preview. It does not fail quietly.
 */
function withApi(action: (loaded: SnippetApi) => void, name: string): void {
  if (!isBrowser()) {
    return
  }
  if (api) {
    action(api)
    return
  }
  if (loading) {
    void loading.then(action).catch(() => {
      // load() already gave this failure to the caller that waited for it.
    })
    return
  }
  console.warn(`[seeonwall] You called ${name}() before load(). Call load({ shopId }) first.`)
}

/** Opens the preview for one poster. A button on the page is not necessary. */
export function open(params: PosterParams): void {
  withApi((loaded) => { loaded.open(params) }, 'open')
}

/** Closes the preview. The function does nothing if the preview is not open. */
export function close(): void {
  withApi((loaded) => { loaded.close() }, 'close')
}

/**
 * Changes the language while the page is open. The function also changes the
 * text of the buttons that are already on the page.
 *
 * From this point the snippet ignores the `<html lang>` attribute. Use this
 * function only if your language selector does not change that attribute.
 */
export function setLanguage(lang: string): void {
  withApi((loaded) => { loaded.setLanguage(lang) }, 'setLanguage')
}

/**
 * Completes when the widget is available.
 *
 * The promise waits for a load that starts later. It does not complete early
 * because no load is in progress yet. Thus the order of two React effects
 * cannot make a caller miss the widget.
 *
 * The promise does not fail. A load that fails leaves the caller waiting for
 * the next attempt. On the server the promise completes immediately.
 */
export function whenLoaded(): Promise<void> {
  if (!isBrowser() || api) {
    return Promise.resolve()
  }
  if (!loadedPromise) {
    loadedPromise = new Promise<void>((resolve) => {
      resolveLoaded = resolve
    })
  }
  return loadedPromise
}

/**
 * Returns the snippet's cached readiness hint for the current storefront session.
 * It is useful for optional fast wall preview controls and is never authorization.
 */
export function isSessionReady(): boolean {
  return isBrowser() && api?.isSessionReady() === true
}

/** Refreshes the storefront-safe session state from the SeeOnWall API. */
export function refreshSessionState(): Promise<StorefrontSessionState> {
  if (!isBrowser()) return Promise.resolve('none')
  if (api) return api.refreshSessionState()
  if (loading) return loading.then(loaded => loaded.refreshSessionState())
  return Promise.resolve('none')
}

/** Subscribes to same-origin storefront session changes and returns an unsubscribe function. */
export function on(event: 'session-change', listener: () => void): () => void {
  if (!isBrowser()) return () => undefined
  let cancelled = false
  let unsubscribe: (() => void) | undefined
  const subscribe = () => {
    if (!cancelled && api) unsubscribe = api.on(event, listener)
  }
  // Through whenLoaded(), and not through `loading`, because a subscription can
  // start before load(). The earlier form did nothing at all in that case.
  if (api) subscribe()
  else void whenLoaded().then(subscribe)
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

/**
 * Opens a read-only preview of one poster on the wall that the shopper prepared
 * before. The function does not start the camera flow, thus it needs a session
 * that is already ready.
 *
 * The function does not throw. It gives a reason instead. Show the reason, or
 * hide your control when {@link isSessionReady} is false. A silent call looks
 * like a button that does nothing.
 *
 * The shop must have a paid plan. Without one the call gives `not-entitled`.
 * There is no separate switch for a storefront that loads this package: the
 * call is itself the decision to offer the control. The Shopify and WooCommerce
 * apps keep that choice in their own settings, and give `disabled` when a
 * merchant turns it off there.
 */
export function openCataloguePreview(params: PosterParams): Promise<CataloguePreviewLaunchResult> {
  if (!isBrowser()) {
    return Promise.resolve(UNSUPPORTED)
  }
  if (api) {
    return launchCataloguePreview(api, params)
  }
  if (loading) {
    return loading.then(
      (loaded) => launchCataloguePreview(loaded, params),
      () => UNSUPPORTED,
    )
  }
  console.warn(
    '[seeonwall] You called openCataloguePreview() before load(). Call load({ shopId }) first.',
  )
  return Promise.resolve(UNSUPPORTED)
}

/** Calls the snippet, or reports that this copy of the snippet is too old. */
function launchCataloguePreview(
  loaded: SnippetApi,
  params: PosterParams,
): Promise<CataloguePreviewLaunchResult> {
  if (typeof loaded.openCataloguePreview !== 'function') {
    return Promise.resolve(UNSUPPORTED)
  }
  return loaded.openCataloguePreview(params)
}

/**
 * Stops the snippet. The function removes the buttons, the styles, the
 * observers and the listeners of the snippet.
 *
 * Call this function when you unmount the part of your application that uses
 * SeeOnWall. The script element stays on the page, because a browser cannot
 * unload a script. A subsequent call to {@link load} restarts this copy. It
 * does not get the file again.
 */
export function destroy(): void {
  if (!isBrowser()) {
    return
  }
  active = false
  if (api) {
    stop()
  }
  // If the widget is still in progress, the loader keeps the promise. Thus a
  // subsequent call to load() joins the load that is already in progress. It
  // does not add a second script. If no call to load() occurs, the handler in
  // load() examines `active` and stops the widget.
}

/**
 * Returns the version of the loaded snippet, or null before it loads. Give this
 * value in a bug report.
 */
export function snippetVersion(): string | null {
  return api?.version ?? null
}
