export interface SellerProfile {
  sellerId: string;
  inventory: number;
  unitCost: number;
  minimumMargin: number;
  minimumDeliveryHours: number;
  reputation: number;
  allergenSafe: boolean;
  strategy: string;
}

export const sellerProfiles: SellerProfile[] = [
  {
    sellerId: "seller-a",
    inventory: 320,
    unitCost: 25,
    minimumMargin: 0.12,
    minimumDeliveryHours: 10,
    reputation: 72,
    allergenSafe: true,
    strategy: "低价获客，在成本底线之上尽量提高中标概率",
  },
  {
    sellerId: "seller-b",
    inventory: 260,
    unitCost: 30,
    minimumMargin: 0.18,
    minimumDeliveryHours: 8,
    reputation: 96,
    allergenSafe: true,
    strategy: "依靠高信用争取合理利润，不参与不可持续的价格战",
  },
  {
    sellerId: "seller-c",
    inventory: 220,
    unitCost: 32,
    minimumMargin: 0.2,
    minimumDeliveryHours: 4,
    reputation: 88,
    allergenSafe: true,
    strategy: "主打最快交付，接受较低利润以突出时效优势",
  },
];
