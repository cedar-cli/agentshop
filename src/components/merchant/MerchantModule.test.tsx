import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MerchantModule } from './MerchantModule'

describe('商家端演示工作台', () => {
  it('交易战情展示买家沟通、历史和回放', () => {
    render(<MerchantModule />)
    expect(screen.getByText('买家 Agent 会话')).toBeInTheDocument()
    expect(screen.getByText('历史买家记录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /开始回放/ })).toBeInTheDocument()
  })

  it('销售机制页完整展示四种 A2A 机制', async () => {
    const user = userEvent.setup()
    render(<MerchantModule />)
    await user.click(screen.getByRole('button', { name: /销售机制/ }))
    expect(screen.getAllByText('约束锚定式精准推销').length).toBeGreaterThan(0)
    expect(screen.getByText('合约裂变式分销')).toBeInTheDocument()
    expect(screen.getByText('履约声誉排序竞争')).toBeInTheDocument()
    expect(screen.getByText('广播推销')).toBeInTheDocument()
    expect(screen.getByText('内部执行过程')).toBeInTheDocument()
    expect(screen.getByText('影响变化')).toBeInTheDocument()
  })
})
