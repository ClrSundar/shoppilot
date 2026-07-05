export interface ScoreBreakdown {
  attributeMatch: number; // 0–40
  stock: number;          // 0–30
  price: number;          // 0–20
  compatibility: number;  // 0–10
  total: number;          // 0–100
}

export interface CandidateResult {
  rank: number;
  productId: string;
  productName: string;
  sku: string;
  sellingPrice: number;
  stockQty: number;
  scoreBreakdown: ScoreBreakdown;
  selectedReason: string;
}

export interface AppliedRule {
  id: string;
  code: string;
  name: string;
  version: number;
  scope: 'tenant' | 'platform'; // which matched
}

export interface RecommendSolutionResponse {
  recommendationRunId: string;
  status: 'MATCHED' | 'NO_MATCH' | 'ERROR';

  appliedRule: AppliedRule | null;
  explanation: string;

  selectedProducts: CandidateResult[];
  candidates: CandidateResult[];

  // Present when status = NO_MATCH
  missingFields?: string[];
  // Present when status = ERROR
  errorMessage?: string;
}
