/**
 * 新生儿低敏床品 · 确定性演示场景数据
 *
 * 本模块提供一份**固定、可复现**的演示场景，用于展示「可执行意图 + 机器询证 +
 * 动态评分 + 自动购买」这条链路在一个具体案例上的完整叙事。
 *
 * 设计约束（务必保持，测试会锁定这些数值）：
 *  - 全部为**工厂函数**（createXxx），每次调用都深构造出全新对象，
 *    因此不同测试之间不会共享可变对象，改一个不会污染另一个。
 *  - 这里的一切都是 **Demo 可验证凭证**，不是真实外部认证——每张凭证都带
 *    disclaimer 标记并把 verificationStatus 设为 "demo-verifiable"，
 *    绝不伪装成 OEKO-TEX 等真实机构的真实签发结果。
 *  - 本模块**不接入**任何运行链路（router / agent / server / 前端），
 *    只导出纯数据与工厂函数，供演示脚本或测试按需读取。
 *
 * 复用协议层已有的领域类型（ExecutableIntent / EvidenceRequirement /
 * SellerScoreVector 等），但**不修改**协议层本身。
 */

import type {
  EvidenceRequirement,
  ExecutableIntent,
  SellerScoreVector,
} from "../protocol/events.js";

// ---------------------------------------------------------------------------
// Demo 可验证凭证：比协议层 EvidenceDocument 更丰富的结构化证据。
//
// 任务要求证据必须结构化：类型、签发方、referenceId、hash、有效期、验证状态。
// 这里定义一个专供演示场景使用的凭证类型，独立于协议层，避免改动运行链路。
// ---------------------------------------------------------------------------

/**
 * 凭证的验证状态。
 * 只有 "demo-verifiable" 一个"通过"态，且语义上明确它是**演示用**可验证凭证，
 * 不代表任何真实机构的真实签发。"unverifiable" 表示卖家声称但拿不出可核验证据。
 */
export type DemoCredentialStatus =
  // 演示环境下可被本地校验（hash 可复算、有效期未过），但**非**真实外部认证
  | "demo-verifiable"
  // 卖家给出了声明，但缺少可核验的结构化证据（如缺 hash / 缺签发方 / 已过期）
  | "unverifiable";

/**
 * 一张 Demo 可验证凭证（结构化证据）。
 * 字段完全覆盖任务要求的六要素：类型、签发方、referenceId、hash、有效期、验证状态。
 */
export interface DemoVerifiableCredential {
  // 证据类型：与协议层 EvidenceRequirement.kind 对齐，便于按要求逐项核对
  type: EvidenceRequirement["kind"];
  // 该凭证满足的证据要求 id（回指意图中的 EvidenceRequirement.id）
  requirementId: string;
  // 签发方名称（演示用的虚构机构名，见 disclaimer）
  issuer: string;
  // 凭证在签发方处的引用编号（演示用，可用于"跳转核验"的占位）
  referenceId: string;
  // 凭证内容哈希（演示用，供本地复算比对，模拟防篡改）
  hash: string;
  // 有效期起始（ISO-8601，带时区偏移）
  validFrom: string;
  // 有效期截止（ISO-8601，带时区偏移）
  validUntil: string;
  // 验证状态：见 DemoCredentialStatus
  verificationStatus: DemoCredentialStatus;
  // 免责标记：恒为 true，明确"这是演示可验证凭证，不是真实外部认证"
  isDemoCredential: true;
  // 人类可读的免责说明，展示时直接呈现给观众，杜绝误导
  disclaimer: string;
}

/** 统一的免责说明文案，所有 Demo 凭证共用，确保不伪装成真实认证。 */
export const DEMO_CREDENTIAL_DISCLAIMER =
  "演示用可验证凭证：数据为黑客松 Demo 构造，非真实机构签发，不构成任何真实认证或合规背书。";

// ---------------------------------------------------------------------------
// 卖家场景：把「初始报价 / 验证前后评分 / 已提交证据 / 证据缺口 / bundle」聚合起来。
// ---------------------------------------------------------------------------

/**
 * 卖家在本场景中的完整画像。
 * 同时保留「验证前」与「验证后」两份评分向量，用来讲清楚
 * 「机器询证如何改变排名」这一核心叙事。
 */
export interface SellerScenario {
  // 卖家 id（seller-a / seller-b / seller-c）
  sellerId: string;
  // 卖家展示名
  displayName: string;
  // 初始报价（USD）——询证/砍价之前对外亮出的价格
  initialPriceUsd: number;
  // 最终成交价（USD）——若无 bundle 让利则等于 initialPriceUsd
  finalPriceUsd: number;
  // 承诺交期（小时）
  deliveryHours: number;
  // 卖家已提交的结构化证据凭证
  credentials: DemoVerifiableCredential[];
  // 证据缺口：意图要求但该卖家未能提供**可验证**证据的要求 id 列表
  evidenceGaps: string[];
  // 验证前评分（仅凭报价与自述，尚未核验证据时的初步排名）
  preVerificationScore: SellerScoreVector;
  // 验证后评分（机器询证核验证据、并计入交期/证据缺口后的最终排名）
  postVerificationScore: SellerScoreVector;
  // bundle 说明：Seller C 在提供组合优惠后降价，其余卖家为 null
  bundle: {
    // bundle 名称/描述
    description: string;
    // 应用 bundle 后的价格（USD）
    bundledPriceUsd: number;
  } | null;
}

// ---------------------------------------------------------------------------
// 工厂：买家意图
// ---------------------------------------------------------------------------

/**
 * 构造本场景的买家可执行意图。
 * 每次调用返回全新对象（含全新数组），避免测试间共享可变状态。
 *
 * 语义锚点（测试会锁定）：
 *  - 预算上限 USD 180
 *  - 72 小时内送达（deadlineHours = 72）
 *  - 材料声明必须可验证（mandatory 的 material-spec / lab-report 证据要求）
 *  - 风险分低于 0.15 时自动购买（autoPurchasePolicy 配合 riskThreshold = 0.15）
 *  - 不接受：材料声明无证据、配送超时、无皮肤不适退货政策
 */
export function createNewbornBeddingIntent(): ExecutableIntent {
  return {
    intentId: "intent-newborn-bedding",
    productDescription: "一套新生儿低敏床品（婴儿床四件套，需通过婴幼儿级安全标准）",
    budgetUsd: 180,
    deadlineHours: 72,
    // 风险阈值 0.15：只有风险分低于该值才允许自动成交，体现"低敏高敏感采购"的保守取向
    riskThreshold: 0.15,
    // 三条不可接受项：任意命中即淘汰
    unacceptable: [
      "材料声明无可验证证据",
      "配送超过 72 小时",
      "无皮肤不适退货政策",
    ],
    // 证据要求：材料成分与低敏检测为硬性必需，退货政策与配送覆盖亦要求可验证
    evidenceRequirements: [
      {
        id: "material-composition",
        kind: "material-spec",
        description: "床品材料成分与低敏声明，必须可验证",
        mandatory: true,
      },
      {
        id: "hypoallergenic-lab-report",
        kind: "lab-report",
        description: "婴幼儿级低敏/甲醛限量实验室检测报告",
        mandatory: true,
      },
      {
        id: "return-policy",
        kind: "attestation",
        description: "皮肤不适无理由退货政策证明",
        mandatory: true,
      },
      {
        id: "delivery-coverage",
        kind: "attestation",
        description: "配送覆盖与时效承诺证明",
        mandatory: false,
      },
    ],
    // 自动购买协议：启用自动成交，且上限不超过预算（协议层 superRefine 会校验这一点）
    autoPurchasePolicy: {
      enabled: true,
      // 综合总分门槛
      minTotalScore: 75,
      // 信任分门槛
      minTrustScore: 70,
      // 自动成交金额上限（USD）——等于预算上限，满足 maxAutoSpendUsd <= budgetUsd
      maxAutoSpendUsd: 180,
      // 必须所有硬性证据齐备才允许自动成交
      requireAllMandatoryEvidence: true,
    },
  };
}

// ---------------------------------------------------------------------------
// 凭证构造小工具（内部使用）
// ---------------------------------------------------------------------------

/**
 * 构造一张"演示可验证"凭证。
 * 统一注入 isDemoCredential 与 disclaimer，确保不会被误当成真实认证。
 */
function demoCredential(params: {
  type: EvidenceRequirement["kind"];
  requirementId: string;
  issuer: string;
  referenceId: string;
  hash: string;
  validFrom: string;
  validUntil: string;
}): DemoVerifiableCredential {
  return {
    type: params.type,
    requirementId: params.requirementId,
    issuer: params.issuer,
    referenceId: params.referenceId,
    hash: params.hash,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
    verificationStatus: "demo-verifiable",
    isDemoCredential: true,
    disclaimer: DEMO_CREDENTIAL_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// 工厂：Seller A —— 低价但材料证明不完整
// ---------------------------------------------------------------------------

/**
 * Seller A：USD 139 / 2 天送达 / 材料证明不完整。
 * 叙事：初始靠低价排名靠前，但机器询证后因关键证据（低敏实验室报告）缺失而掉分。
 */
export function createSellerA(): SellerScenario {
  return {
    sellerId: "seller-a",
    displayName: "Seller A · 极速低价铺",
    initialPriceUsd: 139,
    finalPriceUsd: 139,
    deliveryHours: 48, // 2 天
    // 只提供了材料成分说明，缺低敏实验室报告与退货政策的可验证证据
    credentials: [
      demoCredential({
        type: "material-spec",
        requirementId: "material-composition",
        issuer: "Demo 材料自述模板 A",
        referenceId: "A-MAT-0001",
        hash: "demohash-a-material-0001",
        validFrom: "2026-01-01T00:00:00+08:00",
        validUntil: "2027-01-01T00:00:00+08:00",
      }),
    ],
    // 缺口：低敏实验室报告、退货政策（两项硬性证据缺失）
    evidenceGaps: ["hypoallergenic-lab-report", "return-policy"],
    // 验证前：低价拉高价格契合度与匹配度，风险看似可控，暂列第 1
    preVerificationScore: {
      sellerId: "seller-a",
      matchScore: 82,
      trustScore: 68,
      deliveryConfidence: 90,
      priceFit: 95,
      riskScore: 0.14,
      totalScore: 84,
      rank: 1,
      stage: "matched",
    },
    // 验证后：两项硬性证据缺失 → 信任与匹配骤降、风险冲高越过 0.15 阈值，跌出候选
    postVerificationScore: {
      sellerId: "seller-a",
      matchScore: 40,
      trustScore: 30,
      deliveryConfidence: 90,
      priceFit: 95,
      riskScore: 0.62,
      totalScore: 46,
      rank: 3,
      stage: "rejected",
    },
    bundle: null,
  };
}

// ---------------------------------------------------------------------------
// 工厂：Seller B —— 证据完整但交期超限
// ---------------------------------------------------------------------------

/**
 * Seller B：USD 156 / 5 天送达 / 材料证据完整。
 * 叙事：证据齐全、信任高，但 5 天（120h）远超 72h 交期上限，因交付掉分。
 */
export function createSellerB(): SellerScenario {
  return {
    sellerId: "seller-b",
    displayName: "Seller B · 稳健合规坊",
    initialPriceUsd: 156,
    finalPriceUsd: 156,
    deliveryHours: 120, // 5 天，超出 72 小时上限
    // 四项证据齐备且均可验证
    credentials: [
      demoCredential({
        type: "material-spec",
        requirementId: "material-composition",
        issuer: "Demo 材料检验室 B",
        referenceId: "B-MAT-0007",
        hash: "demohash-b-material-0007",
        validFrom: "2026-02-01T00:00:00+08:00",
        validUntil: "2027-02-01T00:00:00+08:00",
      }),
      demoCredential({
        type: "lab-report",
        requirementId: "hypoallergenic-lab-report",
        issuer: "Demo 低敏检测中心 B",
        referenceId: "B-LAB-0007",
        hash: "demohash-b-lab-0007",
        validFrom: "2026-02-01T00:00:00+08:00",
        validUntil: "2027-02-01T00:00:00+08:00",
      }),
      demoCredential({
        type: "attestation",
        requirementId: "return-policy",
        issuer: "Demo 平台退货承诺 B",
        referenceId: "B-RET-0007",
        hash: "demohash-b-return-0007",
        validFrom: "2026-02-01T00:00:00+08:00",
        validUntil: "2027-02-01T00:00:00+08:00",
      }),
      demoCredential({
        type: "attestation",
        requirementId: "delivery-coverage",
        issuer: "Demo 物流覆盖证明 B",
        referenceId: "B-DLV-0007",
        hash: "demohash-b-delivery-0007",
        validFrom: "2026-02-01T00:00:00+08:00",
        validUntil: "2027-02-01T00:00:00+08:00",
      }),
    ],
    // 无证据缺口
    evidenceGaps: [],
    // 验证前：高信任、证据完整，暂列第 2
    preVerificationScore: {
      sellerId: "seller-b",
      matchScore: 84,
      trustScore: 92,
      deliveryConfidence: 55,
      priceFit: 82,
      riskScore: 0.1,
      totalScore: 80,
      rank: 2,
      stage: "matched",
    },
    // 验证后：证据核验全部通过（信任更稳），但 120h 超期使交付信心崩塌、总分被拖累，退居第 2
    postVerificationScore: {
      sellerId: "seller-b",
      matchScore: 84,
      trustScore: 94,
      deliveryConfidence: 20,
      priceFit: 82,
      riskScore: 0.12,
      totalScore: 74,
      rank: 2,
      stage: "scored",
    },
    bundle: null,
  };
}

// ---------------------------------------------------------------------------
// 工厂：Seller C —— 证据完整、交期达标，bundle 让利后夺魁
// ---------------------------------------------------------------------------

/**
 * Seller C：初始 USD 172 / 3 天送达 / 低敏认证+材料组成+配送覆盖+退货政策全齐，
 * 提供 bundle 后最终 USD 164。
 * 叙事：初始因价格偏高仅列第 3，但机器询证核验四类证据全部可验证、交期恰好达标 72h，
 * 叠加 bundle 让利到 164（仍在预算内、风险低于 0.15），验证后跃居第 1，触发自动购买。
 */
export function createSellerC(): SellerScenario {
  return {
    sellerId: "seller-c",
    displayName: "Seller C · 母婴严选馆",
    initialPriceUsd: 172,
    finalPriceUsd: 164, // 提供 bundle 后的最终价
    deliveryHours: 72, // 3 天，恰好卡在交期上限内
    // 四类证据齐备且均可验证：低敏认证、材料组成、配送覆盖、退货政策
    credentials: [
      demoCredential({
        type: "material-spec",
        requirementId: "material-composition",
        issuer: "Demo 材料组成实验室 C",
        referenceId: "C-MAT-0042",
        hash: "demohash-c-material-0042",
        validFrom: "2026-03-01T00:00:00+08:00",
        validUntil: "2027-03-01T00:00:00+08:00",
      }),
      demoCredential({
        type: "certification",
        requirementId: "hypoallergenic-lab-report",
        issuer: "Demo 低敏认证机构 C",
        referenceId: "C-CERT-0042",
        hash: "demohash-c-cert-0042",
        validFrom: "2026-03-01T00:00:00+08:00",
        validUntil: "2027-03-01T00:00:00+08:00",
      }),
      demoCredential({
        type: "attestation",
        requirementId: "return-policy",
        issuer: "Demo 皮肤不适退货承诺 C",
        referenceId: "C-RET-0042",
        hash: "demohash-c-return-0042",
        validFrom: "2026-03-01T00:00:00+08:00",
        validUntil: "2027-03-01T00:00:00+08:00",
      }),
      demoCredential({
        type: "attestation",
        requirementId: "delivery-coverage",
        issuer: "Demo 配送覆盖证明 C",
        referenceId: "C-DLV-0042",
        hash: "demohash-c-delivery-0042",
        validFrom: "2026-03-01T00:00:00+08:00",
        validUntil: "2027-03-01T00:00:00+08:00",
      }),
    ],
    // 无证据缺口
    evidenceGaps: [],
    // 验证前：价格偏高压低价格契合度，仅列第 3
    preVerificationScore: {
      sellerId: "seller-c",
      matchScore: 80,
      trustScore: 85,
      deliveryConfidence: 88,
      priceFit: 70,
      riskScore: 0.11,
      totalScore: 79,
      rank: 3,
      stage: "matched",
    },
    // 验证后：证据全通过 + 交期达标 + bundle 让利到 164（价格契合度回升），风险低于 0.15，跃居第 1
    postVerificationScore: {
      sellerId: "seller-c",
      matchScore: 90,
      trustScore: 93,
      deliveryConfidence: 88,
      priceFit: 84,
      riskScore: 0.08,
      totalScore: 90,
      rank: 1,
      stage: "authorized",
    },
    bundle: {
      description: "床品 + 婴儿级洗涤剂组合优惠，触发让利",
      bundledPriceUsd: 164,
    },
  };
}

// ---------------------------------------------------------------------------
// 工厂：整个场景
// ---------------------------------------------------------------------------

/** 整个新生儿床品演示场景：一份买家意图 + 三个卖家画像。 */
export interface NewbornBeddingScenario {
  // 买家可执行意图
  intent: ExecutableIntent;
  // 三个卖家场景，按 A/B/C 顺序排列
  sellers: SellerScenario[];
}

/**
 * 构造整套演示场景。
 * 每次调用都通过各子工厂重新深构造，返回彼此独立的对象树，
 * 因此可以放心地在测试里修改返回值而不影响其他测试。
 */
export function createNewbornBeddingScenario(): NewbornBeddingScenario {
  return {
    intent: createNewbornBeddingIntent(),
    sellers: [createSellerA(), createSellerB(), createSellerC()],
  };
}
