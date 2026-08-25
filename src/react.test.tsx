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

  it('leaves out an attribute that you do not give', async () => {
    const { SeeOnWallButton } = await loadModule()

    const { container } = render(
      <SeeOnWallButton posterUrl="https://shop.example/p.jpg" posterWidth={50} posterHeight={70} />,
    )
    const mount = container.querySelector('.seeonwall-button')

    expect(mount?.hasAttribute('data-poster-title')).toBe(false)
    expect(mount?.hasAttribute('data-lang')).toBe(false)
    expect(mount?.hasAttribute('data-match-colors')).toBe(false)
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
