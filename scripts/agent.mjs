#!/usr/bin/env node
/**
 * SurviveAgent CLI — The interface between Claude and the trading engine
 *
 * Usage:
 *   node scripts/agent.mjs status              — Show engine status
 *   node scripts/agent.mjs start [options]     — Start the agent
 *   node scripts/agent.mjs stop                — Stop the agent
 *   node scripts/agent.mjs trades [--limit N]  — Show recent trades
 *   node scripts/agent.mjs stats               — Show performance stats
 *   node scripts/agent.mjs config              — Show current config
 *   node scripts/agent.mjs config --set '{}'   — Update config
 *   node scripts/agent.mjs wallet              — Show wallet info
 *   node scripts/agent.mjs wallet --new        — Generate new wallet
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'data', 'config.json');
const DB_PATH = path.join(ROOT, 'data', 'surviveagent.db');
const API_BASE = 'http://localhost:3000/api';

// ===== Config Management =====

const DEFAULT_CONFIG = {
  mode: 'paper',
  initialBalance: 1000,
  strategies: {
    momentum: 25,
    funding_arb: 25,
    yield: 35,
    polymarket: 15,
  },
  risk: {
    maxPositionSize: 15,
    maxDrawdown: 20,
    maxSingleTradeRisk: 3,
    maxTotalExposure: 80,
  },
  wallet: {
    address: '',
    privateKey: '',
    chain: 'arbitrum',
  },
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function ensureConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
  }
  return loadConfig();
}

// ===== API Helpers =====

async function apiGet(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error('\n❌ Server not running. Start it first:\n');
      console.error('   npm run dev\n');
      process.exit(1);
    }
    throw err;
  }
}

async function apiPost(endpoint, body = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error('\n❌ Server not running. Start it first:\n');
      console.error('   npm run dev\n');
      process.exit(1);
    }
    throw err;
  }
}

// ===== Commands =====

async function cmdStatus() {
  const data = await apiGet('/agent/status');
  const config = loadConfig();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        SurviveAgent Status               ║');
  console.log('╚══════════════════════════════════════════╝\n');

  console.log(`  Mode:           ${config.mode.toUpperCase()}`);
  console.log(`  Engine:         ${data.running ? '🟢 RUNNING' : '⚫ STOPPED'}`);
  console.log(`  Claude Brain:   ${data.claudeConnected ? '🧠 Connected' : '⚠️  Heuristic mode'}`);

  if (data.state) {
    const s = data.state;
    const pnlSign = s.totalPnl >= 0 ? '+' : '';
    const pnlColor = s.totalPnl >= 0 ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`  Balance:        $${s.totalBalance?.toFixed(2) || '0.00'}`);
    console.log(`  P&L:            ${pnlColor}${pnlSign}$${s.totalPnl?.toFixed(4) || '0.00'} (${pnlSign}${s.totalPnlPercent?.toFixed(2) || '0'}%)${reset}`);
    console.log(`  Open Trades:    ${s.activeTrades?.length || 0}`);
    console.log(`  Agents Active:  ${s.subAgents?.filter(a => a.status !== 'idle').length || 0}/7`);

    if (s.subAgents) {
      console.log('\n  Sub-Agents:');
      for (const a of s.subAgents) {
        const icon = a.status !== 'idle' ? '🟢' : '⚫';
        const apnl = a.pnl >= 0 ? `\x1b[32m+$${a.pnl.toFixed(4)}\x1b[0m` : `\x1b[31m-$${Math.abs(a.pnl).toFixed(4)}\x1b[0m`;
        console.log(`    ${icon} ${a.icon} ${a.name.padEnd(22)} $${a.allocated.toFixed(2).padEnd(10)} ${apnl}`);
      }
    }
  }

  console.log(`\n  Dashboard:      http://localhost:3000`);
  console.log(`  Trade History:  http://localhost:3000/trades\n`);
}

async function cmdStart(args) {
  const config = ensureConfig();

  // Parse args
  let balance = config.initialBalance;
  let mode = config.mode;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--balance' && args[i + 1]) balance = parseFloat(args[i + 1]);
    if (args[i] === '--mode' && args[i + 1]) mode = args[i + 1];
  }

  // Update config
  config.initialBalance = balance;
  config.mode = mode;
  saveConfig(config);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     🧬 SurviveAgent — Deploying...       ║');
  console.log('╚══════════════════════════════════════════╝\n');

  console.log(`  Mode:     ${mode.toUpperCase()}`);
  console.log(`  Balance:  $${balance}`);
  console.log(`  Allocation:`);
  console.log(`    📈 Momentum:    ${config.strategies.momentum}%`);
  console.log(`    💰 Funding Arb: ${config.strategies.funding_arb}%`);
  console.log(`    🌾 DeFi Yield:  ${config.strategies.yield}%`);
  console.log(`    🔮 Polymarket:  ${config.strategies.polymarket}%`);

  if (mode === 'live') {
    console.log('\n  ⚠️  LIVE MODE — Real transactions will be executed!');
    console.log('  Make sure your wallet has funds.\n');
  }

  const result = await apiPost('/agent/start', { initialBalance: balance, mode });

  if (result.success) {
    console.log(`\n  ✅ Agent deployed!`);
    console.log(`  Claude Brain: ${result.claudeAvailable ? '🧠 Connected' : '⚠️  Heuristic mode'}`);
    console.log(`\n  Dashboard: http://localhost:3000`);
    console.log(`  Trades:    http://localhost:3000/trades\n`);
  } else {
    console.error(`\n  ❌ Failed to start: ${result.error}\n`);
  }
}

async function cmdStop() {
  const result = await apiPost('/agent/stop');
  if (result.success) {
    console.log('\n  ⏹  Agent stopped.\n');
    console.log('  Check your results:');
    console.log('    node scripts/agent.mjs stats');
    console.log('    node scripts/agent.mjs trades\n');
  }
}

async function cmdTrades(args) {
  let limit = 20;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[i + 1]);
  }

  const data = await apiGet(`/trades?limit=${limit}`);

  if (!data.trades || data.trades.length === 0) {
    console.log('\n  No trades recorded yet. Start the agent first.\n');
    return;
  }

  console.log(`\n  📊 Recent Trades (${data.trades.length})\n`);
  console.log('  Time       │ Strategy              │ Asset       │ Side  │ Amount    │ P&L        │ Conf │ Status');
  console.log('  ───────────┼───────────────────────┼─────────────┼───────┼───────────┼────────────┼──────┼───────');

  for (const t of data.trades) {
    const time = new Date(t.opened_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const strategy = t.strategy.slice(0, 21).padEnd(21);
    const asset = t.asset.slice(0, 11).padEnd(11);
    const side = t.side.toUpperCase().padEnd(5);
    const amount = `$${t.amount.toFixed(2)}`.padEnd(9);
    const pnlVal = t.pnl || 0;
    const pnlStr = pnlVal >= 0 ? `\x1b[32m+$${pnlVal.toFixed(4)}\x1b[0m` : `\x1b[31m-$${Math.abs(pnlVal).toFixed(4)}\x1b[0m`;
    const conf = `${t.confidence}%`.padEnd(4);
    const status = t.status === 'open' ? '\x1b[34mOPEN\x1b[0m' : '\x1b[90mCLOSED\x1b[0m';

    console.log(`  ${time} │ ${strategy} │ ${asset} │ ${side} │ ${amount} │ ${pnlStr.padEnd(20)} │ ${conf} │ ${status}`);
  }
  console.log('');
}

async function cmdStats() {
  const data = await apiGet('/stats');

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        📊 Performance Statistics         ║');
  console.log('╚══════════════════════════════════════════╝\n');

  if (data.overall) {
    const o = data.overall;
    const pnlColor = o.totalPnl >= 0 ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`  Total Sessions:   ${o.totalSessions}`);
    console.log(`  Total Trades:     ${o.totalTrades}`);
    console.log(`  Total P&L:        ${pnlColor}$${o.totalPnl.toFixed(4)}${reset}`);
    console.log(`  Win Rate:         ${o.winRate >= 50 ? '\x1b[32m' : '\x1b[31m'}${o.winRate.toFixed(1)}%${reset}`);
    console.log(`  Avg P&L/Trade:    ${pnlColor}$${o.avgPnlPerTrade.toFixed(6)}${reset}`);
  }

  if (data.sessions?.length > 0) {
    console.log('\n  Sessions:');
    for (const s of data.sessions.slice(0, 5)) {
      const started = new Date(s.started_at).toLocaleString();
      const running = !s.stopped_at ? ' 🟢 RUNNING' : '';
      const pnl = s.final_pnl != null ? ` P&L: $${s.final_pnl.toFixed(4)}` : '';
      console.log(`    ${started} | $${s.initial_balance} | ${s.total_trades} trades${pnl}${running}`);
    }
  }

  console.log(`\n  Engine: ${data.engineRunning ? '🟢 Running' : '⚫ Stopped'}`);
  console.log(`  Claude: ${data.claudeConnected ? '🧠 Connected' : '⚠️  Heuristic'}\n`);
}

async function cmdConfig(args) {
  const config = ensureConfig();

  // Check for --set
  const setIdx = args.indexOf('--set');
  if (setIdx !== -1 && args[setIdx + 1]) {
    try {
      const newWeights = JSON.parse(args[setIdx + 1]);
      const sum = Object.values(newWeights).reduce((s, v) => s + v, 0);

      if (Math.abs(sum - 100) > 0.01) {
        console.error(`\n  ❌ Weights must sum to 100 (got ${sum})\n`);
        process.exit(1);
      }

      config.strategies = { ...config.strategies, ...newWeights };
      saveConfig(config);
      console.log('\n  ✅ Strategy allocation updated!\n');
    } catch (e) {
      console.error(`\n  ❌ Invalid JSON: ${e.message}\n`);
      process.exit(1);
    }
  }

  // Check for --mode
  const modeIdx = args.indexOf('--mode');
  if (modeIdx !== -1 && args[modeIdx + 1]) {
    config.mode = args[modeIdx + 1];
    saveConfig(config);
    console.log(`\n  ✅ Mode set to: ${config.mode.toUpperCase()}\n`);
  }

  // Check for --balance
  const balIdx = args.indexOf('--balance');
  if (balIdx !== -1 && args[balIdx + 1]) {
    config.initialBalance = parseFloat(args[balIdx + 1]);
    saveConfig(config);
    console.log(`\n  ✅ Initial balance set to: $${config.initialBalance}\n`);
  }

  // Check for --risk
  const riskIdx = args.indexOf('--risk');
  if (riskIdx !== -1 && args[riskIdx + 1]) {
    try {
      const newRisk = JSON.parse(args[riskIdx + 1]);
      config.risk = { ...config.risk, ...newRisk };
      saveConfig(config);
      console.log('\n  ✅ Risk parameters updated!\n');
    } catch (e) {
      console.error(`\n  ❌ Invalid JSON: ${e.message}\n`);
      process.exit(1);
    }
  }

  // Show config
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        ⚙️  Current Configuration         ║');
  console.log('╚══════════════════════════════════════════╝\n');

  console.log(`  Mode:           ${config.mode.toUpperCase()}`);
  console.log(`  Balance:        $${config.initialBalance}`);
  console.log(`  Wallet:         ${config.wallet.address || '(not set)'}`);
  console.log(`  Chain:          ${config.wallet.chain}`);

  console.log('\n  Strategy Allocation:');
  console.log(`    📈 Momentum:    ${config.strategies.momentum}%`);
  console.log(`    💰 Funding Arb: ${config.strategies.funding_arb}%`);
  console.log(`    🌾 DeFi Yield:  ${config.strategies.yield}%`);
  console.log(`    🔮 Polymarket:  ${config.strategies.polymarket}%`);

  console.log('\n  Risk Parameters:');
  console.log(`    Max Position:       ${config.risk.maxPositionSize}%`);
  console.log(`    Max Drawdown:       ${config.risk.maxDrawdown}%`);
  console.log(`    Max Trade Risk:     ${config.risk.maxSingleTradeRisk}%`);
  console.log(`    Max Total Exposure: ${config.risk.maxTotalExposure}%\n`);

  console.log('  Edit with:');
  console.log('    node scripts/agent.mjs config --set \'{"momentum":30,"funding_arb":30,"yield":25,"polymarket":15}\'');
  console.log('    node scripts/agent.mjs config --mode live --balance 10');
  console.log('    node scripts/agent.mjs config --risk \'{"maxDrawdown":15}\'\n');
}

async function cmdWallet(args) {
  const config = ensureConfig();

  if (args.includes('--new')) {
    console.log('\n  🔑 Generating new wallet with cast...\n');
    try {
      const output = execSync('cast wallet new', { encoding: 'utf-8' });
      console.log(output);

      // Parse address and private key from output
      const addrMatch = output.match(/Address:\s+(0x[a-fA-F0-9]{40})/);
      const keyMatch = output.match(/Private key:\s+(0x[a-fA-F0-9]{64})/);

      if (addrMatch && keyMatch) {
        config.wallet.address = addrMatch[1];
        config.wallet.privateKey = keyMatch[1];
        saveConfig(config);
        console.log('  ✅ Wallet saved to config!\n');
        console.log(`  Address:     ${addrMatch[1]}`);
        console.log(`  Private Key: ${keyMatch[1].slice(0, 10)}...${keyMatch[1].slice(-4)}\n`);
        console.log('  ⚠️  BACKUP YOUR PRIVATE KEY! It is stored in data/config.json\n');
      }
    } catch (e) {
      console.error('  ❌ cast not found. Install Foundry first:');
      console.error('     curl -L https://foundry.paradigm.xyz | bash');
      console.error('     foundryup\n');
    }
    return;
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        🔑 Wallet Information             ║');
  console.log('╚══════════════════════════════════════════╝\n');

  if (!config.wallet.address) {
    console.log('  No wallet configured.\n');
    console.log('  Generate one:  node scripts/agent.mjs wallet --new');
    console.log('  Or set manually in data/config.json\n');
    return;
  }

  console.log(`  Address:  ${config.wallet.address}`);
  console.log(`  Chain:    ${config.wallet.chain}`);

  // Try to check balance
  try {
    const rpcUrl = config.wallet.chain === 'arbitrum'
      ? 'https://arb1.arbitrum.io/rpc'
      : 'https://eth.llamarpc.com';

    const ethBal = execSync(`cast balance ${config.wallet.address} --rpc-url ${rpcUrl}`, { encoding: 'utf-8' }).trim();
    console.log(`  ETH:      ${ethBal}`);

    // USDC balance (Arbitrum USDC address)
    const usdcAddr = config.wallet.chain === 'arbitrum'
      ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
      : '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

    const usdcRaw = execSync(
      `cast call ${usdcAddr} "balanceOf(address)(uint256)" ${config.wallet.address} --rpc-url ${rpcUrl}`,
      { encoding: 'utf-8' }
    ).trim();
    const usdcBalance = parseInt(usdcRaw) / 1e6;
    console.log(`  USDC:     $${usdcBalance.toFixed(2)}`);
  } catch {
    console.log('  Balance:  (could not fetch — cast or RPC unavailable)');
  }

  console.log('');
}

// ===== Main =====

const [, , command, ...args] = process.argv;

if (!command) {
  console.log(`
  🧬 SurviveAgent CLI

  Usage:
    node scripts/agent.mjs <command> [options]

  Commands:
    status              Show current engine status
    start               Start the trading agent
      --balance <n>     Initial balance (default: from config)
      --mode <m>        paper or live (default: paper)
    stop                Stop the trading agent
    trades              Show recent trades
      --limit <n>       Number of trades (default: 20)
    stats               Show performance statistics
    config              Show/edit configuration
      --set '{...}'     Set strategy weights (JSON)
      --mode <m>        Set mode (paper/live)
      --balance <n>     Set initial balance
      --risk '{...}'    Set risk parameters (JSON)
    wallet              Show wallet info
      --new             Generate new wallet with cast

  Examples:
    node scripts/agent.mjs start --balance 10 --mode paper
    node scripts/agent.mjs config --set '{"momentum":30,"funding_arb":30,"yield":25,"polymarket":15}'
    node scripts/agent.mjs wallet --new
`);
  process.exit(0);
}

const commands = {
  status: () => cmdStatus(),
  start: () => cmdStart(args),
  stop: () => cmdStop(),
  trades: () => cmdTrades(args),
  stats: () => cmdStats(),
  config: () => cmdConfig(args),
  wallet: () => cmdWallet(args),
};

if (commands[command]) {
  commands[command]().catch(err => {
    console.error(`\n  ❌ Error: ${err.message}\n`);
    process.exit(1);
  });
} else {
  console.error(`\n  Unknown command: ${command}\n  Run without arguments for help.\n`);
  process.exit(1);
}
