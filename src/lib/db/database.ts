/**
 * SQLite Database for SurviveAgent
 * Stores all paper trades, decisions, portfolio snapshots, and logs
 * This is the "proof" layer — shows exactly what the agent would have done
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'surviveagent.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      strategy TEXT NOT NULL,
      platform TEXT NOT NULL,
      asset TEXT NOT NULL,
      side TEXT NOT NULL,
      action_type TEXT NOT NULL,
      amount REAL NOT NULL,
      entry_price REAL,
      exit_price REAL,
      pnl REAL DEFAULT 0,
      pnl_percent REAL DEFAULT 0,
      fee REAL DEFAULT 0,
      stop_loss REAL,
      take_profit REAL,
      leverage REAL DEFAULT 1,
      confidence INTEGER DEFAULT 0,
      reasoning TEXT,
      status TEXT DEFAULT 'open',
      tx_hash TEXT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      cycle_number INTEGER NOT NULL,
      regime TEXT,
      regime_confidence INTEGER,
      sentiment TEXT,
      sentiment_score INTEGER,
      fear_greed INTEGER,
      strategy_weights TEXT,
      approved_count INTEGER DEFAULT 0,
      rejected_count INTEGER DEFAULT 0,
      analysis TEXT,
      raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      total_value REAL NOT NULL,
      total_pnl REAL NOT NULL,
      total_pnl_percent REAL NOT NULL,
      open_positions INTEGER DEFAULT 0,
      total_trades INTEGER DEFAULT 0,
      win_rate REAL DEFAULT 0,
      drawdown REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      log_type TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      initial_balance REAL NOT NULL,
      mode TEXT DEFAULT 'paper',
      claude_available INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      stopped_at TEXT,
      final_balance REAL,
      final_pnl REAL,
      total_trades INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_trades_session ON trades(session_id);
    CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_session ON portfolio_snapshots(session_id);
    CREATE INDEX IF NOT EXISTS idx_logs_session ON agent_logs(session_id);
  `);
}

// ===== Session Operations =====

export function createSession(id: string, initialBalance: number, claudeAvailable: boolean): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO sessions (id, initial_balance, claude_available) VALUES (?, ?, ?)'
  ).run(id, initialBalance, claudeAvailable ? 1 : 0);
}

export function endSession(id: string, finalBalance: number, finalPnl: number, totalTrades: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE sessions SET stopped_at = datetime('now'), final_balance = ?, final_pnl = ?, total_trades = ? WHERE id = ?`
  ).run(finalBalance, finalPnl, totalTrades, id);
}

// ===== Trade Operations =====

export function insertTrade(trade: {
  id: string;
  sessionId: string;
  strategy: string;
  platform: string;
  asset: string;
  side: string;
  actionType: string;
  amount: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  confidence?: number;
  reasoning?: string;
  txHash?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO trades (id, session_id, strategy, platform, asset, side, action_type, amount, entry_price, stop_loss, take_profit, leverage, confidence, reasoning, tx_hash, opened_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    trade.id, trade.sessionId, trade.strategy, trade.platform, trade.asset,
    trade.side, trade.actionType, trade.amount, trade.entryPrice || null,
    trade.stopLoss || null, trade.takeProfit || null, trade.leverage || 1,
    trade.confidence || 0, trade.reasoning || null, trade.txHash || null
  );
}

export function closeTrade(id: string, exitPrice: number, pnl: number, pnlPercent: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE trades SET status = 'closed', exit_price = ?, pnl = ?, pnl_percent = ?, closed_at = datetime('now')
    WHERE id = ?
  `).run(exitPrice, pnl, pnlPercent, id);
}

export function getTradesBySession(sessionId: string): unknown[] {
  const db = getDb();
  return db.prepare('SELECT * FROM trades WHERE session_id = ? ORDER BY opened_at DESC').all(sessionId);
}

export function getAllTrades(limit = 100): unknown[] {
  const db = getDb();
  return db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function getOpenTrades(sessionId: string): unknown[] {
  const db = getDb();
  return db.prepare('SELECT * FROM trades WHERE session_id = ? AND status = ? ORDER BY opened_at DESC').all(sessionId, 'open');
}

// ===== Decision Operations =====

export function insertDecision(d: {
  sessionId: string;
  cycleNumber: number;
  regime?: string;
  regimeConfidence?: number;
  sentiment?: string;
  sentimentScore?: number;
  fearGreed?: number;
  strategyWeights?: string;
  approvedCount?: number;
  rejectedCount?: number;
  analysis?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO decisions (session_id, cycle_number, regime, regime_confidence, sentiment, sentiment_score, fear_greed, strategy_weights, approved_count, rejected_count, analysis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.sessionId, d.cycleNumber, d.regime || null, d.regimeConfidence || null,
    d.sentiment || null, d.sentimentScore || null, d.fearGreed || null,
    d.strategyWeights || null, d.approvedCount || 0, d.rejectedCount || 0,
    d.analysis || null
  );
}

// ===== Portfolio Snapshot Operations =====

export function insertSnapshot(s: {
  sessionId: string;
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  totalTrades: number;
  winRate: number;
  drawdown: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO portfolio_snapshots (session_id, total_value, total_pnl, total_pnl_percent, open_positions, total_trades, win_rate, drawdown)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(s.sessionId, s.totalValue, s.totalPnl, s.totalPnlPercent, s.openPositions, s.totalTrades, s.winRate, s.drawdown);
}

export function getSnapshots(sessionId: string): unknown[] {
  const db = getDb();
  return db.prepare('SELECT * FROM portfolio_snapshots WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
}

// ===== Log Operations =====

export function insertLog(l: { sessionId: string; agentId: string; agentName: string; logType: string; message: string; details?: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_logs (session_id, agent_id, agent_name, log_type, message, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(l.sessionId, l.agentId, l.agentName, l.logType, l.message, l.details || null);
}

// ===== Stats =====

export function getSessionStats(sessionId: string) {
  const db = getDb();
  const trades = db.prepare('SELECT * FROM trades WHERE session_id = ?').all(sessionId) as Array<{ pnl: number; status: string }>;
  const closed = trades.filter(t => t.status === 'closed');
  const wins = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl <= 0);

  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: trades.length - closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    totalPnl,
    avgWin,
    avgLoss,
    profitFactor: avgLoss > 0 ? avgWin / avgLoss : 0,
  };
}

export function getAllSessions() {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all();
}

export function getOverallStats() {
  const db = getDb();
  const trades = db.prepare('SELECT * FROM trades WHERE status = ?').all('closed') as Array<{ pnl: number }>;
  const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.pnl > 0);

  return {
    totalSessions: sessions.count,
    totalTrades: trades.length,
    totalPnl,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    avgPnlPerTrade: trades.length > 0 ? totalPnl / trades.length : 0,
  };
}
