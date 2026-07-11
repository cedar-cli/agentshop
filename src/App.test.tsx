import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

class EventSourceMock {
  onerror: (() => void) | null = null
  addEventListener() {}
  close() {}
}

afterEach(() => vi.unstubAllGlobals())

describe('顶层模块切换', () => {
  it('切换商家端后保留消费者当前交易上下文', async () => {
    vi.stubGlobal('EventSource', EventSourceMock)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ transactions: [], messages: [], services: [], products: [] }),
    })))
    const user = userEvent.setup()

    render(<App />)
    await user.click(screen.getByRole('button', { name: /家庭日用品补库/ }))
    expect(screen.getByRole('heading', { name: '家庭日用品补库' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /商家端.*S-Agent 编队/ }))
    expect(screen.getByRole('heading', { name: /S-Agent 销售中枢/ })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /消费者端.*C-Agent/ }))
    expect(screen.getByRole('heading', { name: '家庭日用品补库' })).toBeVisible()
  })
})
