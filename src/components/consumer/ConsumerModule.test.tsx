import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConsumerModule } from './ConsumerModule'

describe('消费者端演示工作台', () => {
  it('以会话 Agent 为入口并展示可回放购买历史', () => {
    render(<ConsumerModule />)
    expect(screen.getByRole('heading', { name: /我的消费 Agent/ })).toBeInTheDocument()
    expect(screen.getByText('购买历史')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /开始回放/ })).toBeInTheDocument()
    expect(screen.getByText('可审计决策日志')).toBeInTheDocument()
  })

  it('主动服务页覆盖四类场景', async () => {
    const user = userEvent.setup()
    render(<ConsumerModule />)
    await user.click(screen.getByRole('button', { name: /主动服务/ }))
    expect(screen.getByText('日用品补库')).toBeInTheDocument()
    expect(screen.getByText('稀缺品抢购')).toBeInTheDocument()
    expect(screen.getByText('高值蹲低价')).toBeInTheDocument()
    expect(screen.getByText('盯二手商品')).toBeInTheDocument()
  })

  it('Inbox 展示 Agent 对商业信息的评价与记忆建议', async () => {
    const user = userEvent.setup()
    render(<ConsumerModule />)
    await user.click(screen.getByRole('button', { name: /Inbox/ }))
    expect(screen.getAllByText('Agent 评价').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/记忆/).length).toBeGreaterThan(0)
  })
})
