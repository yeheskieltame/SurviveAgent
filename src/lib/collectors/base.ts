/**
 * Base Collector interface - Artemis pattern
 * Collectors gather events from various sources and emit them to strategies
 */

export type EventType =
  | 'price_update'
  | 'funding_rate'
  | 'orderbook_update'
  | 'news_signal'
  | 'sentiment_shift'
  | 'new_token_launch'
  | 'yield_change'
  | 'polymarket_update'
  | 'whale_alert'
  | 'liquidation_event'
  | 'on_chain_event';

export interface MarketEvent {
  id: string;
  type: EventType;
  source: string;
  timestamp: Date;
  data: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface Collector {
  name: string;
  start(): Promise<void>;
  stop(): void;
  onEvent(handler: (event: MarketEvent) => void): void;
}

export type EventHandler = (event: MarketEvent) => void;

export abstract class BaseCollector implements Collector {
  abstract name: string;
  protected handlers: EventHandler[] = [];
  protected running = false;

  onEvent(handler: EventHandler) {
    this.handlers.push(handler);
  }

  protected emit(event: MarketEvent) {
    this.handlers.forEach(h => {
      try { h(event); } catch (e) {
        console.error(`[${this.name}] Handler error:`, e);
      }
    });
  }

  abstract start(): Promise<void>;

  stop() {
    this.running = false;
  }
}
