/**
 * Trade Recorder — Bridges the engine to the database
 * Records every action, decision, and portfolio snapshot
 */
import {
  createSession, endSession, insertTrade, closeTrade,
  insertDecision, insertSnapshot, insertLog,
} from './database';
import { TradeAction } from '../strategies/base';
import { ExecutionResult, Position } from '../executors/base';

export class TradeRecorder {
  constructor(private sessionId: string) {}

  recordSessionStart(initialBalance: number, claudeAvailable: boolean) {
    try {
      createSession(this.sessionId, initialBalance, claudeAvailable);
    } catch (e) { console.error('[Recorder] Session start error:', e); }
  }

  recordSessionEnd(finalBalance: number, finalPnl: number, totalTrades: number) {
    try {
      endSession(this.sessionId, finalBalance, finalPnl, totalTrades);
    } catch (e) { console.error('[Recorder] Session end error:', e); }
  }

  recordTradeOpen(action: TradeAction, result: ExecutionResult) {
    if (!result.success) return;
    try {
      insertTrade({
        id: action.id,
        sessionId: this.sessionId,
        strategy: action.strategyName,
        platform: action.platform,
        asset: action.asset,
        side: action.side || 'buy',
        actionType: action.type,
        amount: result.executedAmount || action.amount,
        entryPrice: result.executedPrice,
        stopLoss: action.stopLoss,
        takeProfit: action.takeProfit,
        leverage: action.leverage,
        confidence: action.confidence,
        reasoning: action.reasoning,
        txHash: result.txHash,
      });
    } catch (e) { console.error('[Recorder] Trade open error:', e); }
  }

  recordTradeClose(position: Position) {
    try {
      closeTrade(position.id, position.currentPrice, position.pnl, position.pnlPercent);
    } catch (e) { console.error('[Recorder] Trade close error:', e); }
  }

  recordDecision(d: {
    cycleNumber: number;
    regime?: string;
    regimeConfidence?: number;
    sentiment?: string;
    sentimentScore?: number;
    fearGreed?: number;
    strategyWeights?: Record<string, number>;
    approvedCount: number;
    rejectedCount: number;
    analysis?: string;
  }) {
    try {
      insertDecision({
        sessionId: this.sessionId,
        cycleNumber: d.cycleNumber,
        regime: d.regime,
        regimeConfidence: d.regimeConfidence,
        sentiment: d.sentiment,
        sentimentScore: d.sentimentScore,
        fearGreed: d.fearGreed,
        strategyWeights: d.strategyWeights ? JSON.stringify(d.strategyWeights) : undefined,
        approvedCount: d.approvedCount,
        rejectedCount: d.rejectedCount,
        analysis: d.analysis,
      });
    } catch (e) { console.error('[Recorder] Decision error:', e); }
  }

  recordSnapshot(s: {
    totalValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    openPositions: number;
    totalTrades: number;
    winRate: number;
    drawdown: number;
  }) {
    try {
      insertSnapshot({ sessionId: this.sessionId, ...s });
    } catch (e) { console.error('[Recorder] Snapshot error:', e); }
  }

  recordLog(agentId: string, agentName: string, logType: string, message: string, details?: string) {
    try {
      insertLog({ sessionId: this.sessionId, agentId, agentName, logType, message, details });
    } catch (e) { console.error('[Recorder] Log error:', e); }
  }
}
