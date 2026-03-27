export interface AgentTask {
  agent: string;
  action: string;
  asset: string;
  amountPercent: number;
  reason: string;
  urgency: string;
}

export interface RebalanceChange {
  from: string;
  to: string;
  percent: number;
}

export interface AgentDecision {
  analysis: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  riskLevel: 'low' | 'medium' | 'high';
  tasks: AgentTask[];
  rebalance: {
    needed: boolean;
    changes: RebalanceChange[];
  };
  raw: string;
}

export interface SubAgentTask {
  action: string;
  type: string;
  asset: string;
  confidence: number;
  expected_return: string;
  risk: string;
  reasoning: string;
}
