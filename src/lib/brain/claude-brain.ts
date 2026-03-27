/**
 * Claude Code CLI Brain
 *
 * Uses Claude Code (CLI) as the AI decision-making engine.
 * Spawns `claude` subprocess with market context and gets trading decisions.
 * This is NOT using the API — it's using Claude Code directly as the brain.
 */
import { spawn } from 'child_process';
import { AgentDecision, SubAgentTask } from './types';

const CLAUDE_CMD = 'claude';

const SYSTEM_PROMPT = `You are SurviveAgent's Coordinator Brain — an autonomous Web3 trading AI.
Your job is to analyze market data and make trading decisions to grow a USDC portfolio.

You control 7 sub-agents:
1. futures - Perpetual futures trading (25% allocation)
2. arbitrage - Cross-DEX price arbitrage (20% allocation)
3. defi_yield - Yield farming optimization (20% allocation)
4. funding_rate - Funding rate arbitrage (15% allocation)
5. polymarket - Prediction market trading (8% allocation)
6. airdrop - Airdrop farming (7% allocation)
7. memecoin - Memecoin momentum trading (5% allocation)

RULES:
- Be conservative. Preserve capital first.
- Never risk more than 5% of total portfolio on a single trade.
- Diversify across strategies.
- Cut losses quickly (max 3% drawdown per position).
- Take profits at reasonable targets.
- Consider gas costs and slippage.
- Factor in news sentiment for timing.

RESPOND IN VALID JSON ONLY. No markdown, no explanation outside JSON.`;

export interface ClaudeBrainConfig {
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Sends market context to Claude Code CLI and gets trading decisions
 */
export async function askClaude(
  prompt: string,
  config: ClaudeBrainConfig = {}
): Promise<string> {
  const { timeoutMs = 60_000 } = config;

  return new Promise((resolve, reject) => {
    const args = [
      '--print',          // non-interactive, just print response
      '--output-format', 'text',
      prompt,
    ];

    const proc = spawn(CLAUDE_CMD, args, {
      timeout: timeoutMs,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        console.error(`Claude CLI exited with code ${code}: ${stderr}`);
        reject(new Error(`Claude CLI failed (code ${code}): ${stderr.slice(0, 500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    // Safety timeout
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Claude CLI timeout'));
    }, timeoutMs + 5000);
  });
}

/**
 * Get coordinator decision from Claude based on market data
 */
export async function getCoordinatorDecision(
  marketContext: string,
  portfolioState: string,
  recentActions: string
): Promise<AgentDecision> {
  const prompt = `${SYSTEM_PROMPT}

=== CURRENT PORTFOLIO STATE ===
${portfolioState}

=== RECENT AGENT ACTIONS ===
${recentActions}

${marketContext}

=== YOUR TASK ===
Analyze the market data above and decide what each sub-agent should do next.
Respond with JSON in this exact format:
{
  "analysis": "Brief market analysis (1-2 sentences)",
  "sentiment": "bullish" | "bearish" | "neutral",
  "risk_level": "low" | "medium" | "high",
  "tasks": [
    {
      "agent": "futures|arbitrage|defi_yield|funding_rate|polymarket|airdrop|memecoin",
      "action": "buy|sell|hold|stake|unstake|bridge|claim|analyze",
      "asset": "asset name or pair",
      "amount_percent": 0-100 (% of agent's allocation),
      "reason": "why this action",
      "urgency": "low|medium|high"
    }
  ],
  "rebalance": {
    "needed": true|false,
    "changes": [{"from": "agent", "to": "agent", "percent": 5}]
  }
}`;

  try {
    const response = await askClaude(prompt, { timeoutMs: 45_000 });
    return parseDecision(response);
  } catch (err) {
    console.error('Failed to get coordinator decision:', err);
    return getDefaultDecision();
  }
}

/**
 * Get sub-agent specific analysis from Claude
 */
export async function getSubAgentAnalysis(
  agentType: string,
  marketContext: string,
  agentState: string
): Promise<SubAgentTask[]> {
  const prompt = `You are the ${agentType} sub-agent of SurviveAgent.

${marketContext}

=== YOUR STATE ===
${agentState}

Analyze the data and suggest 1-3 specific actions for your strategy.
Respond in JSON array format:
[
  {
    "action": "specific action description",
    "type": "buy|sell|hold|stake|bridge|analyze",
    "asset": "specific asset",
    "confidence": 0-100,
    "expected_return": "estimated return %",
    "risk": "low|medium|high",
    "reasoning": "brief reasoning"
  }
]`;

  try {
    const response = await askClaude(prompt, { timeoutMs: 30_000 });
    return parseSubAgentTasks(response);
  } catch (err) {
    console.error(`Failed to get ${agentType} analysis:`, err);
    return [];
  }
}

function parseDecision(raw: string): AgentDecision {
  try {
    // Try to extract JSON from response (Claude might add commentary)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        analysis: parsed.analysis || 'Analysis unavailable',
        sentiment: parsed.sentiment || 'neutral',
        riskLevel: parsed.risk_level || 'medium',
        tasks: (parsed.tasks || []).map((t: Record<string, unknown>) => ({
          agent: t.agent as string,
          action: t.action as string,
          asset: t.asset as string,
          amountPercent: t.amount_percent as number || 10,
          reason: t.reason as string || '',
          urgency: t.urgency as string || 'medium',
        })),
        rebalance: parsed.rebalance || { needed: false, changes: [] },
        raw,
      };
    }
    throw new Error('No JSON found in response');
  } catch (err) {
    console.error('Failed to parse decision:', err, 'Raw:', raw.slice(0, 500));
    return getDefaultDecision(raw);
  }
}

function parseSubAgentTasks(raw: string): SubAgentTask[] {
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch {
    return [];
  }
}

function getDefaultDecision(raw?: string): AgentDecision {
  return {
    analysis: 'Market conditions being assessed. Holding current positions.',
    sentiment: 'neutral',
    riskLevel: 'low',
    tasks: [
      { agent: 'defi_yield', action: 'hold', asset: 'USDC', amountPercent: 100, reason: 'Waiting for clear signal', urgency: 'low' },
      { agent: 'arbitrage', action: 'analyze', asset: 'ALL', amountPercent: 0, reason: 'Scanning for opportunities', urgency: 'low' },
    ],
    rebalance: { needed: false, changes: [] },
    raw: raw || '',
  };
}

/**
 * Check if Claude CLI is available
 */
export async function isClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(CLAUDE_CMD, ['--version'], {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}
