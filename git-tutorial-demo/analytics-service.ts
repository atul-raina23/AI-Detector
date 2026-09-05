/**
 * Analytics Tracking Service
 * Demonstrates modular feature additions for git merge/rebase tutorials.
 */

export interface AnalyticsEvent {
  eventName: string;
  category: 'user_action' | 'navigation' | 'error' | 'performance';
  properties?: Record<string, unknown>;
  timestamp: string;
}

export class AnalyticsService {
  private static events: AnalyticsEvent[] = [];

  static trackEvent(name: string, category: AnalyticsEvent['category'], properties?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      eventName: name,
      category,
      properties,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);
    console.log(`[Analytics] Tracked: ${name}`, event);
  }

  static getEventHistory(): AnalyticsEvent[] {
    return [...this.events];
  }

  static filterByCategory(category: AnalyticsEvent['category']): AnalyticsEvent[] {
    return this.events.filter((e) => e.category === category);
  }

  static getEventCount(): number {
    return this.events.length;
  }

  static exportAnalyticsSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const event of this.events) {
      summary[event.category] = (summary[event.category] || 0) + 1;
    }
    return summary;
  }

  static clearHistory(): void {
    this.events = [];
  }
}

