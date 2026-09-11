/**
 * Tests for the React layer.
 *
 * The two things that can go wrong are the lifecycle and the attributes. The
 * lifecycle must survive StrictMode and must not stop the widget while other
 * buttons still need it. The attributes are the contract that the widget reads.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup, act } from '@testing-library/react'

type ReactApi = typeof import('./react.js')

function makeSnippet() {
  return {
    init: vi.fn(async () => {}),
    ready: vi.fn(async () => {}),
    destroy: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    setLanguage: vi.fn(),
    version: '9.9.9',
  }
}

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

/** A snippet that also has the storefront-session part of the interface. */
function makeSessionSnippet(ready = true) {
  const listeners: (() => void)[] = []
  return {
    ...makeSnippet(),
    isSessionReady: vi.fn(() => ready),
    refreshSessionState: vi.fn(async () => (ready ? 'ready' : 'none')),
    on: vi.fn((_event: string, listener: () => void) => {
      listeners.push(listener)
      return () => {
        const at = listeners.indexOf(listener)
        if (at >= 0) listeners.splice(at, 1)
      }
    }),
    /** Raises the event the snippet raises when storage changes. */
    emit: () => { for (const listener of [...listeners]) listener() },
    setReady: (value: boolean) => { ready = value },
  }
}

async function loadModule(): Promise<ReactApi> {
  vi.resetModules()
  return await import('./react.js')
}

/** Lets the load promise and its handlers complete. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5))
  })
}

beforeEach(() => {
  document.head.innerHTML = ''
  delete window.SeeOnWall
  delete window.SeeOnWallConfig
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useSeeOnWall', () => {
  it('loads the widget one time under StrictMode', async () => {
    // StrictMode runs the effect, the cleanup, then the effect again. Two
    // scripts would make two mount observers and two message listeners.
    const { snippet, scripts } = interceptScriptLoad()
    const { useSeeOnWall } = await loadModule()

    function App() {
      useSeeOnWall({ shopId: 'shop-1', scriptUrl: 'https://x.test/s.js' })
      return null
    }
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await settle()

    expect(scripts).toHaveLength(1)
    expect(snippet.destroy).not.toHaveBeenCalled()
    // scriptUrl selects the file to get. It is not part of the
    // configuration that the widget reads.
    expect(window.SeeOnWallConfig).toEqual({ shopId: 'shop-1' })
  })

  it('stops the widget when the last component goes away', async () => {
    const { snippet } = interceptScriptLoad()
    const { useSeeOnWall } = await loadModule()

    function App() {
      useSeeOnWall({ shopId: 'shop-1', scriptUrl: 'https://x.test/s.js' })
      return null
    }
    const view = render(<App />)
    await settle()

    view.unmount()
    await settle()

    expect(snippet.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the widget while another component still needs it', async () => {
    // A listing page has many buttons. A stop after the first one goes away
    // would remove the buttons of all the others.
    const { snippet } = interceptScriptLoad()
    const { useSeeOnWall } = await loadModule()

    function User() {
      useSeeOnWall({ shopId: 'shop-1', scriptUrl: 'https://x.test/s.js' })
      return null
    }
    function App({ count }: { count: number }) {
      return (
        <>
          {Array.from({ length: count }, (_, i) => (
            <User key={i} />
          ))}
        </>
      )
    }

    const view = render(<App count={2} />)
    await settle()

    view.rerender(<App count={1} />)
    await settle()
    expect(snippet.destroy).not.toHaveBeenCalled()

    view.rerender(<App count={0} />)
    await settle()
    expect(snippet.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('SeeOnWallButton', () => {
  it('makes a mount that the widget can find', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton
        posterUrl="https://shop.example/p.jpg"
        posterWidth={50}
        posterHeight={70}
      />,
    )
    const mount = container.querySelector('.seeonwall-button')

    expect(mount).not.toBeNull()
    expect(mount?.getAttribute('data-poster-url')).toBe('https://shop.example/p.jpg')
    expect(mount?.getAttribute('data-poster-width')).toBe('50')
    expect(mount?.getAttribute('data-poster-height')).toBe('70')
    // The widget puts the button inside. The component draws nothing.
    expect(mount?.children).toHaveLength(0)
  })

  it('joins a list of sizes with commas', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" posterSizes={['30x40', '50x70']} />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.getAttribute('data-poster-sizes'),
    ).toBe('30x40,50x70')
  })

  it('names the size control that the widget must read', async () => {
    // A prop that reaches no attribute is a prop that does nothing. The shops that need this
    // one have no size in their product record, thus a silent drop gives them no button.
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" sizesFrom="auto" />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.getAttribute('data-sizes-from'),
    ).toBe('auto')
  })

  it('passes a selector that names the size control', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" sizesFrom="#size-field select" />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.getAttribute('data-sizes-from'),
    ).toBe('#size-field select')
  })

  it('writes the offers as JSON for the widget to match', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton
        posterUrl="https://shop.example/p.jpg"
        offers={[
          { key: 'v1', width: 50, height: 70, framePreset: null, purchaseUrl: '/cart/add?v=1' },
          { key: 'v2', width: 50, height: 70, framePreset: 'Oak', productUrl: '/p/dune?f=oak' },
        ]}
      />,
    )

    const written = container.querySelector('.seeonwall-button')?.getAttribute('data-poster-offers')
    expect(JSON.parse(written ?? 'null')).toEqual([
      { key: 'v1', width: 50, height: 70, framePreset: null, purchaseUrl: '/cart/add?v=1' },
      { key: 'v2', width: 50, height: 70, framePreset: 'Oak', productUrl: '/p/dune?f=oak' },
    ])
  })

  it('writes no offers attribute for an empty list', async () => {
    // An empty list and no list give the widget the same thing to match against: nothing.
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" offers={[]} />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.hasAttribute('data-poster-offers'),
    ).toBe(false)
  })

  it('leaves out an attribute that you do not give', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" posterWidth={50} posterHeight={70} />,
    )
    const mount = container.querySelector('.seeonwall-button')

    expect(mount?.hasAttribute('data-poster-title')).toBe(false)
    expect(mount?.hasAttribute('data-lang')).toBe(false)
    expect(mount?.hasAttribute('data-match-colors')).toBe(false)
    expect(mount?.hasAttribute('data-button-variant')).toBe(false)
    expect(mount?.hasAttribute('data-button-width')).toBe(false)
    // An empty value is no request at all to the widget, thus the attribute must stay away.
    expect(mount?.hasAttribute('data-sizes-from')).toBe(false)
  })

  it('passes the framing settings', async () => {
    // A prop that reaches no attribute is a prop that does nothing, and the type says it works.
    // `framePreset` names a frame from the catalogue of the shop and beats the two values
    // beside it, so a silent drop here previews the wrong frame.
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton
        posterUrl="https://shop.example/p.jpg"
        frameDefaultCm={2}
        frameDefaultColor="#3E2723"
        framePreset="Oak"
      />,
    )
    const mount = container.querySelector('.seeonwall-button')

    expect(mount?.getAttribute('data-frame-default-cm')).toBe('2')
    expect(mount?.getAttribute('data-frame-default-color')).toBe('#3E2723')
    expect(mount?.getAttribute('data-frame-preset')).toBe('Oak')
  })

  it('leaves out a frame preset that you do not give', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(<SeeOnWallButton posterUrl="https://shop.example/p.jpg" />)

    expect(container.querySelector('.seeonwall-button')?.hasAttribute('data-frame-preset')).toBe(false)
  })

  it('passes the shape of the button', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" variant="glyph" />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.getAttribute('data-button-variant'),
    ).toBe('glyph')
  })

  it('writes no attribute for the shape that is the default', async () => {
    // The widget reads a mount with no attribute as a solid button. An attribute that
    // says the same thing is one more thing to read in the markup, thus it stays away.
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" variant="solid" />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.hasAttribute('data-button-variant'),
    ).toBe(false)
  })

  it('keeps the colours that you give next to a shape that paints few of them', async () => {
    // The widget decides which colours a shape can use. The component gives every
    // colour that it gets, thus a change of shape does not delete a setting.
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton
        posterUrl="https://shop.example/p.jpg"
        variant="outline"
        backgroundColor="#b5502a"
        textColor="#101010"
      />,
    )
    const mount = container.querySelector('.seeonwall-button')

    expect(mount?.getAttribute('data-button-variant')).toBe('outline')
    expect(mount?.getAttribute('data-bg-color')).toBe('#b5502a')
    expect(mount?.getAttribute('data-text-color')).toBe('#101010')
  })

  it('stretches the button when you ask for the full width', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" fullWidth />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.getAttribute('data-button-width'),
    ).toBe('full')
  })

  it('writes no width attribute for a button of the natural width', async () => {
    // The widget reads "full" and no other value, thus false must remove the attribute
    // and not write a word that the widget ignores.
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" fullWidth={false} />,
    )

    expect(
      container.querySelector('.seeonwall-button')?.hasAttribute('data-button-width'),
    ).toBe(false)
  })

  it('writes one label for every language when you give one string', async () => {
    // The widget reads the attribute of the shopper's language only. One attribute would
    // therefore give the label to one language and the default to every other one.
    const { SeeOnWallButton, BUTTON_TEXT_LANGS } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" buttonText="Preview on my wall" />,
    )
    const mount = container.querySelector('.seeonwall-button')

    for (const lang of BUTTON_TEXT_LANGS) {
      expect(mount?.getAttribute(`data-button-text-${lang}`)).toBe('Preview on my wall')
    }
  })

  it('writes a label for each language that you name, and no other', async () => {
    // A language you leave out keeps the label of the widget. Thus a shop that translates
    // two of its languages does not lose the seven that the widget already translates.
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton
        posterUrl="https://shop.example/p.jpg"
        buttonText={{ en: 'Preview on my wall', de: 'An meiner Wand ansehen' }}
      />,
    )
    const mount = container.querySelector('.seeonwall-button')

    expect(mount?.getAttribute('data-button-text-en')).toBe('Preview on my wall')
    expect(mount?.getAttribute('data-button-text-de')).toBe('An meiner Wand ansehen')
    expect(mount?.hasAttribute('data-button-text-pl')).toBe(false)
  })

  it('writes no label attribute when you give no label', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(<SeeOnWallButton posterUrl="https://shop.example/p.jpg" />)

    expect(
      container.querySelector('.seeonwall-button')?.getAttributeNames()
        .filter((name) => name.startsWith('data-button-text-')),
    ).toHaveLength(0)
  })

  it('keeps your own class next to the class of the widget', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" className="my-4" />,
    )

    expect(container.querySelector('div')?.className).toBe('seeonwall-button my-4')
  })

  it('passes the appearance settings', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton
        posterUrl="https://shop.example/p.jpg"
        backgroundColor="#b5502a"
        buttonClassName="btn btn-secondary"
        matchButton=".add-to-cart"
        matchColors
      />,
    )
    const mount = container.querySelector('.seeonwall-button')

    expect(mount?.getAttribute('data-bg-color')).toBe('#b5502a')
    expect(mount?.getAttribute('data-button-class')).toBe('btn btn-secondary')
    expect(mount?.getAttribute('data-match-button')).toBe('.add-to-cart')
    expect(mount?.getAttribute('data-match-colors')).toBe('true')
  })
})

describe('useSessionReady()', () => {
  /**
   * The snippet raises no event when it starts. Thus a session that was already
   * in storage is only visible once the widget arrives, and the hook has to read
   * the value again at that moment.
   */
  it('becomes true when the widget arrives with a session already stored', async () => {
    const snippet = makeSessionSnippet(true)
    interceptScriptLoad(snippet as unknown as ReturnType<typeof makeSnippet>)
    const { useSeeOnWall, useSessionReady } = await loadModule()

    const seen: boolean[] = []
    function Probe() {
      useSeeOnWall({ shopId: 'shop-1', scriptUrl: 'https://example.test/seeonwall.js' })
      seen.push(useSessionReady())
      return null
    }

    render(<Probe />)
    expect(seen[0]).toBe(false)

    await settle()
    expect(seen[seen.length - 1]).toBe(true)
  })

  it('follows a session change', async () => {
    const snippet = makeSessionSnippet(false)
    interceptScriptLoad(snippet as unknown as ReturnType<typeof makeSnippet>)
    const { useSeeOnWall, useSessionReady } = await loadModule()

    const seen: boolean[] = []
    function Probe() {
      useSeeOnWall({ shopId: 'shop-1', scriptUrl: 'https://example.test/seeonwall.js' })
      seen.push(useSessionReady())
      return null
    }

    render(<Probe />)
    await settle()
    expect(seen[seen.length - 1]).toBe(false)

    snippet.setReady(true)
    await act(async () => { snippet.emit() })
    expect(seen[seen.length - 1]).toBe(true)
  })

  it('is false and does not fail without a widget', async () => {
    const { useSessionReady } = await loadModule()

    const seen: boolean[] = []
    function Probe() {
      seen.push(useSessionReady())
      return null
    }

    render(<Probe />)
    expect(seen[0]).toBe(false)
  })
})
