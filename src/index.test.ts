/**
 * Tests for the loader.
 *
 * The loader has module state. Each test gets a new copy of the module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CataloguePreviewLaunchResult, StorefrontSessionState } from './index.js'

type Loader = typeof import('./index.js')

const SCRIPT_URL = 'https://example.test/seeonwall.js'

/** Makes an object with the same shape as the interface of the snippet. */
function makeSnippet() {
  return {
    init: vi.fn(async () => {}),
    ready: vi.fn(async () => {}),
    destroy: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    setLanguage: vi.fn(),
    isSessionReady: vi.fn(() => false),
    refreshSessionState: vi.fn(async (): Promise<StorefrontSessionState> => 'none'),
    on: vi.fn(() => vi.fn()),
    openCataloguePreview: vi.fn(
      async (): Promise<CataloguePreviewLaunchResult> => ({ opened: true }),
    ),
    version: '9.9.9',
  }
}

/** A snippet from before catalogue preview. Every other member is present. */
function makeSnippetWithoutCataloguePreview() {
  const snippet: Partial<ReturnType<typeof makeSnippet>> = makeSnippet()
  delete snippet.openCataloguePreview
  return snippet as Omit<ReturnType<typeof makeSnippet>, 'openCataloguePreview'>
}

/**
 * Replaces the network. jsdom does not run a script that you add to the page.
 * This function watches for the script element. It then puts the interface on
 * the window object and sends the load event.
 *
 * The function sets the global object at the same time as the load event, and
 * not when the loader adds the script. A browser also does this: the global
 * object appears only when the script runs. An earlier assignment makes the
 * second call to load() find a copy that a browser cannot find yet.
 */
function interceptScriptLoad(snippet = makeSnippet()) {
  const scripts: HTMLScriptElement[] = []
  const append = document.head.appendChild.bind(document.head)
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    const result = append(node)
    if (node instanceof HTMLScriptElement) {
      scripts.push(node)
      setTimeout(() => {
        window.SeeOnWall = snippet
        node.dispatchEvent(new Event('load'))
      }, 0)
    }
    return result as T
  })
  return { snippet, scripts }
}

async function loadModule(): Promise<Loader> {
  vi.resetModules()
  return await import('./index.js')
}

beforeEach(() => {
  document.head.innerHTML = ''
  delete window.SeeOnWall
  delete window.SeeOnWallConfig
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('load()', () => {
  it('adds the script and waits for the snippet to become ready', async () => {
    const { snippet, scripts } = interceptScriptLoad()
    const loader = await loadModule()

    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.src).toBe(SCRIPT_URL)
    expect(snippet.ready).toHaveBeenCalledTimes(1)
    expect(loader.snippetVersion()).toBe('9.9.9')
  })

  it('does the work one time only', async () => {
    // React StrictMode calls an effect two times in development.
    const { scripts } = interceptScriptLoad()
    const loader = await loadModule()

    await Promise.all([
      loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL }),
      loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL }),
    ])
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    expect(scripts).toHaveLength(1)
  })

  it('gives the shop id to the snippet through the global object', async () => {
    interceptScriptLoad()
    const loader = await loadModule()

    await loader.load({ shopId: 'shop-1', lang: 'pl', scriptUrl: SCRIPT_URL })

    expect(window.SeeOnWallConfig).toEqual({ shopId: 'shop-1', lang: 'pl' })
  })

  it('omits an option that you do not give', async () => {
    // The snippet makes a difference between an absent language and an empty
    // one. An absent language starts the automatic detection.
    interceptScriptLoad()
    const loader = await loadModule()

    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    expect(window.SeeOnWallConfig).not.toHaveProperty('lang')
    expect(window.SeeOnWallConfig).not.toHaveProperty('sizeUnit')
  })

  it('permits a new attempt after a failure', async () => {
    const append = document.head.appendChild.bind(document.head)
    let attempts = 0
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      const result = append(node)
      if (node instanceof HTMLScriptElement) {
        attempts += 1
        const first = attempts === 1
        setTimeout(() => {
          if (!first) {
            window.SeeOnWall = makeSnippet()
          }
          node.dispatchEvent(new Event(first ? 'error' : 'load'))
        }, 0)
      }
      return result as T
    })
    const loader = await loadModule()

    await expect(loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })).rejects.toThrow()
    await expect(loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  })
})

describe('a copy of the snippet that is already on the page', () => {
  it('restarts the copy and does not add a second script', async () => {
    // A Shopify theme extension puts its own copy on the page. Two copies make
    // two mount observers and two message listeners.
    const snippet = makeSnippet()
    window.SeeOnWall = snippet
    const { scripts } = interceptScriptLoad()
    const loader = await loadModule()

    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    expect(scripts).toHaveLength(0)
    expect(snippet.destroy).toHaveBeenCalledTimes(1)
    expect(snippet.init).toHaveBeenCalledTimes(1)
    expect(window.SeeOnWallConfig).toEqual({ shopId: 'shop-1' })
  })

  it('adds a second script when the copy is too old to restart', async () => {
    // A copy from before the lifecycle has no destroy function.
    window.SeeOnWall = { open: vi.fn(), close: vi.fn(), version: '0.0.1' }
    const { scripts } = interceptScriptLoad()
    const loader = await loadModule()

    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    expect(scripts).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('cannot restart'))
  })
})

describe('open()', () => {
  const poster = { posterUrl: 'https://shop.example/p.jpg', posterWidth: 50, posterHeight: 70 }

  it('waits when you call it on the same tick as load()', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()

    const pending = loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    loader.open(poster)
    expect(snippet.open).not.toHaveBeenCalled()

    await pending
    await Promise.resolve()

    expect(snippet.open).toHaveBeenCalledWith(poster)
  })

  it('gives a warning when you call it before load()', async () => {
    const loader = await loadModule()

    loader.open(poster)

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('before load()'))
  })
})

describe('destroy()', () => {
  it('stops the snippet and permits a later load()', async () => {
    const { snippet, scripts } = interceptScriptLoad()
    const loader = await loadModule()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    loader.destroy()
    expect(snippet.destroy).toHaveBeenCalledTimes(1)
    expect(loader.snippetVersion()).toBeNull()

    // The script element stays on the page, thus the loader restarts the copy
    // that is there. It does not get the file again.
    await loader.load({ shopId: 'shop-2', scriptUrl: SCRIPT_URL })

    expect(scripts).toHaveLength(1)
    expect(snippet.init).toHaveBeenCalledTimes(1)
    expect(window.SeeOnWallConfig).toEqual({ shopId: 'shop-2' })
  })

  it('does nothing when the snippet does not run', async () => {
    const loader = await loadModule()

    expect(() => { loader.destroy() }).not.toThrow()
  })
})

describe('destroy() while load() is still in progress', () => {
  /**
   * React StrictMode runs an effect, then the cleanup, then the effect again.
   * All three occur before the script runs. Thus destroy() gets no widget to
   * stop, and the widget starts itself a moment later.
   */
  it('stops the widget that arrives after the teardown', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()

    const pending = loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    loader.destroy()
    await pending

    expect(snippet.destroy).toHaveBeenCalledTimes(1)
    expect(loader.snippetVersion()).toBeNull()
  })

  it('joins the load in progress when the caller returns', async () => {
    // The mount, the unmount and the second mount happen together. Only one
    // script must arrive, because two copies make two mount observers.
    const { snippet, scripts } = interceptScriptLoad()
    const loader = await loadModule()

    const first = loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    loader.destroy()
    const second = loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    await Promise.all([first, second])

    expect(scripts).toHaveLength(1)
    expect(snippet.destroy).not.toHaveBeenCalled()
    expect(loader.snippetVersion()).toBe('9.9.9')
  })
})

describe('openCataloguePreview()', () => {
  it('gives the result of the snippet', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    const poster = { posterUrl: 'https://cdn.test/one.jpg', posterWidth: 50, posterHeight: 70 }
    await expect(loader.openCataloguePreview(poster)).resolves.toEqual({ opened: true })
    expect(snippet.openCataloguePreview).toHaveBeenCalledWith(poster)
  })

  it('passes a refusal of the snippet to the caller', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    ;(snippet.openCataloguePreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      opened: false,
      reason: 'no-ready-session',
    })

    await expect(
      loader.openCataloguePreview({ posterUrl: 'https://cdn.test/one.jpg' }),
    ).resolves.toEqual({ opened: false, reason: 'no-ready-session' })
  })

  /**
   * The loader gets the snippet from a location without a version. Thus a
   * browser can hold an older copy after a deployment. That copy must give a
   * reason and must not stop the widget.
   */
  it('gives "unsupported" when the snippet on the page is older', async () => {
    interceptScriptLoad(makeSnippetWithoutCataloguePreview() as ReturnType<typeof makeSnippet>)
    const loader = await loadModule()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    await expect(
      loader.openCataloguePreview({ posterUrl: 'https://cdn.test/one.jpg' }),
    ).resolves.toEqual({ opened: false, reason: 'unsupported' })
  })

  it('starts an older copy of the snippet as usual', async () => {
    const old = makeSnippetWithoutCataloguePreview()
    window.SeeOnWall = old as unknown as NonNullable<Window['SeeOnWall']>
    const loader = await loadModule()

    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    // The copy restarts. A missing catalogue preview must never make the loader
    // treat the copy as one that it cannot use.
    expect(old.destroy).toHaveBeenCalledTimes(1)
    expect(old.init).toHaveBeenCalledTimes(1)
  })

  it('waits for a load that is in progress', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()

    const loaded = loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    const result = loader.openCataloguePreview({ posterUrl: 'https://cdn.test/one.jpg' })
    await loaded

    await expect(result).resolves.toEqual({ opened: true })
    expect(snippet.openCataloguePreview).toHaveBeenCalledTimes(1)
  })

  it('warns and gives "unsupported" before load()', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loader = await loadModule()

    await expect(
      loader.openCataloguePreview({ posterUrl: 'https://cdn.test/one.jpg' }),
    ).resolves.toEqual({ opened: false, reason: 'unsupported' })
    expect(warn).toHaveBeenCalled()
  })
})

/**
 * The event is a native one on the window. The wrapper must not go through the widget: a copy
 * of the widget that is older than ADR 235 answers an event name it does not know with a
 * subscription that never runs, and the merchant sees a listener that is silent.
 */
describe("on('purchase-request')", () => {
  it('hears the event with no widget loaded at all', async () => {
    const loader = await loadModule()

    const listener = vi.fn()
    const unsubscribe = loader.on('purchase-request', listener)
    window.dispatchEvent(new CustomEvent('seeonwall:purchase-request', { detail: { selectionKey: 'v1' } }))

    expect(listener).toHaveBeenCalledTimes(1)
    const received = listener.mock.calls[0]?.[0] as CustomEvent
    expect(received.detail.selectionKey).toBe('v1')
    unsubscribe()
  })

  it('stops hearing the event after the caller unsubscribes', async () => {
    const loader = await loadModule()

    const listener = vi.fn()
    loader.on('purchase-request', listener)()
    window.dispatchEvent(new CustomEvent('seeonwall:purchase-request', { detail: {} }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not ask the widget for this event', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    const unsubscribe = loader.on('purchase-request', vi.fn())

    expect(snippet.on).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('whenLoaded()', () => {
  it('waits for a load that starts after the wait', async () => {
    interceptScriptLoad()
    const loader = await loadModule()

    let done = false
    const waiting = loader.whenLoaded().then(() => { done = true })

    // Nothing has asked for the widget yet. The wait must not complete early.
    await Promise.resolve()
    expect(done).toBe(false)

    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    await waiting
    expect(done).toBe(true)
  })

  it('completes at once when the widget is already there', async () => {
    interceptScriptLoad()
    const loader = await loadModule()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    await expect(loader.whenLoaded()).resolves.toBeUndefined()
  })
})

describe('storefront readiness API', () => {
  /**
   * A subscription can start before load(). React runs the effect of a child
   * before the effect of its parent, thus this is the usual order and not an
   * edge case. The earlier form subscribed to nothing and stayed silent.
   */
  it('subscribes to a widget that arrives after the subscription', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()

    const listener = vi.fn()
    const unsubscribe = loader.on('session-change', listener)
    expect(snippet.on).not.toHaveBeenCalled()

    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    await Promise.resolve()

    expect(snippet.on).toHaveBeenCalledWith('session-change', listener)
    unsubscribe()
  })

  it('does not subscribe when the caller gave up before the widget arrived', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()

    loader.on('session-change', vi.fn())()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })
    await Promise.resolve()

    expect(snippet.on).not.toHaveBeenCalled()
  })

  it('proxies readiness reads and subscriptions after loading the snippet', async () => {
    const { snippet } = interceptScriptLoad()
    const loader = await loadModule()
    await loader.load({ shopId: 'shop-1', scriptUrl: SCRIPT_URL })

    ;(snippet.isSessionReady as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(snippet.refreshSessionState as ReturnType<typeof vi.fn>).mockResolvedValue('ready')
    const listener = vi.fn()
    const unsubscribe = loader.on('session-change', listener)

    expect(loader.isSessionReady()).toBe(true)
    await expect(loader.refreshSessionState()).resolves.toBe('ready')
    expect(snippet.on).toHaveBeenCalledWith('session-change', listener)

    unsubscribe()
    const nestedUnsubscribe = (snippet.on as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<typeof vi.fn>
    expect(nestedUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
