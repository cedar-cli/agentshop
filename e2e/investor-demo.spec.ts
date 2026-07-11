import { expect, test } from '@playwright/test'

test('轻薄本案例在购买历史原位提供实时执行入口', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '出差轻薄本采购' })).toBeVisible()
  await expect(page.getByRole('button', { name: '运行真实 LLM' })).toBeVisible()
  await expect(page.getByRole('button', { name: /实时采购/ })).toHaveCount(0)
})

test('消费者端覆盖会话、主动服务与 Inbox', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '我的消费 Agent' })).toBeVisible()
  await expect(page.getByText('购买历史')).toBeVisible()
  await page.getByRole('button', { name: /主动服务/ }).click()
  await expect(page.getByText('日用品补库')).toBeVisible()
  await expect(page.getByText('盯二手商品')).toBeVisible()
  await expect(page.getByText('LIVE BACKEND')).toBeVisible()
  await expect(page.getByText('FIXTURE')).toHaveCount(3)
  await page.getByRole('button', { name: /Inbox/ }).click()
  await expect(page.getByText('LIVE API')).toBeVisible()
  await expect(page.getByText('Agent 评价')).toBeVisible()
  await expect(page.getByText('建议存入记忆')).toBeVisible()
})

test('家庭补库明确表达无人类采购指令', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /家庭日用品补库/ }).click()
  await expect(page.getByText('AUTONOMOUS MODE')).toBeVisible()
  await expect(page.getByRole('button', { name: '推进到库存触发点' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '向消费 Agent 描述需求' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '确认下单' })).toHaveCount(0)
})

test('假设时间机器：拖偏好后冠军翻盘', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 980, '决策检视栏在窄屏隐藏（沿用既有响应式设计）')
  await page.goto('/')
  // 默认「消费 Agent」视图，右栏是反事实推演
  await expect(page.getByText('假设时间机器 · 反事实推演')).toBeVisible()
  await page.getByRole('button', { name: '最看重价格' }).click()
  await expect(page.getByText(/翻盘/)).toBeVisible()
})

test('决策剧场：海选决出 3 家 + 议价擂台', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /决策剧场/ }).click()
  await expect(page.getByText('是商品来面试你')).toBeVisible()
  // 幕一：海选（跳转即展示最终决策集）
  await page.getByRole('button', { name: /幕一 · 海选/ }).click()
  await expect(page.getByText(/最终决策集|入选决策集/)).toBeVisible()
  // 幕二：擂台
  await page.getByRole('button', { name: /幕二 · 擂台/ }).click()
  await expect(page.getByText('桌面价格')).toBeVisible()
  await expect(page.getByText('我的 C-Agent')).toBeVisible()
})

test('生态演化：交易流驱动信誉 + 诊断建议', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /商家端/ }).click()
  await page.getByRole('button', { name: /编队与履约/ }).click()
  await page.getByRole('button', { name: /生态演化/ }).click()
  // 三区都在
  await expect(page.getByText(/信用竞速榜/)).toBeVisible()
  await expect(page.getByText(/实时交易流/)).toBeVisible()
  await expect(page.getByText('改进建议')).toBeVisible()
  // 快进演化，交易流出现带归因的结果
  await page.getByRole('button', { name: /快进一年/ }).click()
  await expect(page.getByText(/满意|差评|流失/).first()).toBeVisible({ timeout: 5000 })
})

test('商家端覆盖买家回放与四种销售机制', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /商家端/ }).click()
  await expect(page.getByText('买家 Agent 会话')).toBeVisible()
  await expect(page.getByText('历史买家记录')).toBeVisible()
  await page.getByRole('button', { name: /销售机制/ }).click()
  await expect(page.getByText('合约裂变式分销')).toBeVisible()
  await expect(page.getByText('履约声誉排序竞争')).toBeVisible()
  await expect(page.getByText('广播推销')).toBeVisible()
  await page.getByRole('button', { name: '运行机制演示' }).click()
  await expect(page.getByText(/已执行/)).toBeVisible()
})
