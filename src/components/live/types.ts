export type GeneratedBy = 'llm' | 'fallback'

export interface StoredEvent {
  id: string
  transactionId: string
  type: string
  source: string
  target?: string
  timestamp: string
  sequence: number
  payload: Record<string, unknown>
}

export interface TransactionSnapshot {
  id: string
  status: 'queued' | 'running' | 'awaiting-approval' | 'completed' | 'failed'
  error?: string
  events: StoredEvent[]
  chainValid: boolean
}

export interface TransactionStartResponse {
  transactionId: string
  eventsUrl: string
}

export interface ProposalPayload {
  sellerId: string
  totalPrice: number
  deliveryHours: number
  reputation: number
  allergenSafe: boolean
  reasoning: string
  generatedBy: GeneratedBy
  fallbackReason?: string
}

export interface SellerSelectionPayload {
  sellerId: string
  score: number
  reason: string
  proposal: ProposalPayload
}

export interface CounterOfferPayload {
  sellerId: string
  originalPrice: number
  targetPrice: number
  reasoning: string
}

export interface CounterResponsePayload {
  sellerId: string
  accepted: boolean
  finalPrice: number
  concession: number
  reasoning: string
  generatedBy: GeneratedBy
  fallbackReason?: string
}

export interface ConfirmedOrderPayload {
  orderId: string
  sellerId: string
  totalPrice: number
  status: 'confirmed'
}

export interface RuntimeInfo {
  model: string
  llmConfigured: boolean
  evidenceLlmEnabled: boolean
}

export interface NewbornScenario {
  intent: {
    productDescription: string
    budgetUsd: number
    deadlineHours: number
    riskThreshold: number
    unacceptable: string[]
    autoPurchasePolicy: {
      enabled: boolean
    }
  }
  sellers: Array<{
    sellerId: string
    displayName: string
    initialPriceUsd: number
    finalPriceUsd: number
    deliveryHours: number
  }>
}

export interface EvidenceSubmissionPayload {
  sellerId: string
  answers: Record<string, string>
  generatedBy: GeneratedBy
  fallbackReason?: string
  documents: Array<{
    requirementId: string
    title: string
  }>
}

export interface SellerScorePayload {
  sellerId: string
  matchScore: number
  trustScore: number
  deliveryConfidence: number
  priceFit: number
  totalScore: number
  rank: number
  stage: string
}

export interface AuthorizedOrderPayload {
  sellerId: string
  authorizedAmountUsd: number
  autoApproved: boolean
}

export interface ReceiptPayload {
  receiptId: string
  sellerId: string
  amountUsd: number
  deliveryHours: number
}
