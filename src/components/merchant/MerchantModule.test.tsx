import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MerchantModule } from "./MerchantModule";

describe("商家端演示工作台", () => {
  it("交易战情展示买家沟通、历史和回放", () => {
    render(<MerchantModule />);
    expect(screen.getByText("买家 Agent 会话")).toBeInTheDocument();
    expect(screen.getByText("历史买家记录")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /开始回放/ }),
    ).toBeInTheDocument();
  });

  it("销售机制页完整展示四种 A2A 机制", async () => {
    const user = userEvent.setup();
    render(<MerchantModule />);
    await user.click(screen.getByRole("button", { name: /销售机制/ }));
    expect(screen.getAllByText("约束锚定式精准推销").length).toBeGreaterThan(0);
    expect(screen.getByText("合约裂变式分销")).toBeInTheDocument();
    expect(screen.getByText("履约声誉排序竞争")).toBeInTheDocument();
    expect(screen.getByText("广播推销")).toBeInTheDocument();
    expect(screen.getByText("内部执行过程")).toBeInTheDocument();
    expect(screen.getByText("影响变化")).toBeInTheDocument();
  });

  it("主动销售页展示商品、授权 Router 和真实启动入口", async () => {
    const user = userEvent.setup();
    render(<MerchantModule />);
    await user.click(screen.getByRole("button", { name: /主动销售/ }));
    expect(screen.getByText("商品主动找到合适的买家")).toBeInTheDocument();
    expect(screen.getByText("Product Shelf")).toBeInTheDocument();
    expect(screen.getByText("Authorized Buyer Inboxes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /启动 Seller Agent/ }),
    ).toBeInTheDocument();
  });

  it("需求网络页展示九幕链路和真实合约参数", async () => {
    const user = userEvent.setup();
    render(<MerchantModule />);
    await user.click(screen.getByRole("button", { name: /需求网络/ }));
    expect(screen.getByText("需求驱动的供给网络")).toBeInTheDocument();
    expect(screen.getByText(/Intent Extractor/)).toBeInTheDocument();
    expect(screen.getByText(/A2A 供应协商/)).toBeInTheDocument();
    expect(screen.getByText(/分销 Agent 网络/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /启动需求网络/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("3.0%")).toBeInTheDocument();
  });

  it("意图增长页展示落选学习、商品优化和真实启动入口", async () => {
    const user = userEvent.setup();
    render(<MerchantModule />);
    await user.click(screen.getByRole("button", { name: /意图增长/ }));
    expect(
      screen.getByText("商品能力从输掉的 Agent 交易中生长"),
    ).toBeInTheDocument();
    expect(screen.getByText("Buyer Agent Conversations")).toBeInTheDocument();
    expect(screen.getByText("Usable Intent Output")).toBeInTheDocument();
    expect(screen.getByText("Order + Reputation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /启动主动优化/ }),
    ).toBeInTheDocument();
  });
});
