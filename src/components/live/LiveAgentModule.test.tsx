import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveAgentModule } from './LiveAgentModule'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LiveAgentModule', () => {
  it('shows the unified LLM workspace and runtime status', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/api/runtime')
        ? {
            model: 'gpt-5.6-luna',
            llmConfigured: true,
            evidenceLlmEnabled: true,
          }
        : {
            intent: {
              productDescription: '新生儿低敏床品',
              budgetUsd: 180,
              deadlineHours: 72,
              riskThreshold: 0.15,
              unacceptable: [],
              autoPurchasePolicy: { enabled: true },
            },
            sellers: [],
          }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<LiveAgentModule />)

    expect(screen.getByRole('heading', { name: '实时 Agent 交易' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '智能报价与砍价' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '证据询证与自动购买' })).toBeInTheDocument()
    expect(await screen.findByText('gpt-5.6-luna')).toBeInTheDocument()
    expect(await screen.findByText('Evidence LLM ON')).toBeInTheDocument()
  })
})
