import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConsumerModule } from './ConsumerModule'

describe('消费者端演示工作台', () => {
  it('以会话 Agent 为入口并允许实时执行轻薄本采购', () => {
    render(<ConsumerModule />)
    expect(screen.getByRole('heading', { name: /我的消费 Agent/ })).toBeInTheDocument()
    expect(screen.getByText('购买历史')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /运行真实 LLM/ })).toBeInTheDocument()
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

  it('家庭补库展示自主监测而不是购买确认', async () => {
    const user = userEvent.setup()
    render(<ConsumerModule />)
    await user.click(screen.getByRole('button', { name: /家庭日用品补库/ }))
    expect(screen.getByText('AUTONOMOUS MODE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /推进到库存触发点/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '向消费 Agent 描述需求' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '确认下单' })).not.toBeInTheDocument()
  })

  it('Inbox 展示 Agent 对商业信息的评价与记忆建议', async () => {
    const user = userEvent.setup()
    render(<ConsumerModule />)
    await user.click(screen.getByRole('button', { name: /Inbox/ }))
    expect(screen.getAllByText('Agent 评价').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/记忆/).length).toBeGreaterThan(0)
  })
})
