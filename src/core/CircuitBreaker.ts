// ─── M.A.I. Circuit Breaker ─────────────────────────────────────────────
// Tracks provider and primitive reliability. Disables unreliable ones
// and adapts configuration. Implements the standard circuit breaker
// pattern: closed → open → half-open → closed.
//
// Persisted to state/circuit-breaker.json.

import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "./constants.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CircuitStateName = "closed" | "open" | "half_open";

export interface CircuitState {
  name: string;
  failures: number;
  lastFailure: string;
  state: CircuitStateName;
  totalCalls: number;
  successRate: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMax: number;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const STATE_DIR = path.join(PROJECT_ROOT, "state");
const CIRCUIT_STATE_PATH = path.join(STATE_DIR, "circuit-breaker.json");

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  halfOpenMax: 1,
};

// ─── Engine ─────────────────────────────────────────────────────────────────

export class CircuitBreaker {
  private circuits = new Map<string, CircuitState>();
  private config: CircuitBreakerConfig;
  private halfOpenCounts = new Map<string, number>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistScheduled = false;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadState().catch(() => {});
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Record a successful call for a provider/primitive.
   */
  recordSuccess(name: string): void {
    const circuit = this.getOrCreate(name);
    circuit.totalCalls++;

    // Recalculate success rate
    const failures = circuit.failures;
    const total = circuit.totalCalls;
    circuit.successRate = total > 0 ? (total - failures) / total : 1.0;

    if (circuit.state === "half_open") {
      // Test call succeeded → close the circuit
      circuit.state = "closed";
      circuit.failures = 0;
      this.halfOpenCounts.delete(name);
    }

    this.schedulePersist();
  }

  /**
   * Record a failure for a provider/primitive. May open the circuit.
   */
  recordFailure(name: string): void {
    const circuit = this.getOrCreate(name);
    circuit.totalCalls++;
    circuit.failures++;
    circuit.lastFailure = new Date().toISOString();

    // Recalculate success rate
    const total = circuit.totalCalls;
    circuit.successRate = total > 0 ? (total - circuit.failures) / total : 0;

    if (circuit.state === "half_open") {
      // Test call failed → back to open
      circuit.state = "open";
      this.halfOpenCounts.delete(name);
    } else if (circuit.failures >= this.config.failureThreshold) {
      // Threshold reached → open the circuit
      circuit.state = "open";
    }

    this.schedulePersist();
  }

  /**
   * Check if a provider/primitive is available for use.
   * Handles the half-open transition automatically.
   */
  isAvailable(name: string): boolean {
    const circuit = this.circuits.get(name);
    if (!circuit) return true; // no tracking = available

    switch (circuit.state) {
      case "closed":
        return true;

      case "open": {
        // Check if reset timeout has elapsed
        const elapsed = Date.now() - new Date(circuit.lastFailure).getTime();
        if (elapsed >= this.config.resetTimeoutMs) {
          // Transition to half-open
          circuit.state = "half_open";
          this.halfOpenCounts.set(name, 0);
          this.schedulePersist();
          return true; // allow one test call
        }
        return false;
      }

      case "half_open": {
        // Allow limited calls in half-open state
        const count = this.halfOpenCounts.get(name) ?? 0;
        if (count < this.config.halfOpenMax) {
          this.halfOpenCounts.set(name, count + 1);
          return true;
        }
        return false;
      }
    }
  }

  /**
   * Get the current state of all circuits.
   */
  getStats(): CircuitState[] {
    return Array.from(this.circuits.values()).map((c) => ({ ...c }));
  }

  /**
   * Get the state of a specific circuit.
   */
  getCircuit(name: string): CircuitState | null {
    const c = this.circuits.get(name);
    return c ? { ...c } : null;
  }

  /**
   * Get names of currently available circuits.
   */
  getAvailable(): string[] {
    return Array.from(this.circuits.entries())
      .filter(([, c]) => {
        if (c.state === "closed") return true;
        if (c.state === "open") {
          const elapsed = Date.now() - new Date(c.lastFailure).getTime();
          return elapsed >= this.config.resetTimeoutMs;
        }
        return c.state === "half_open";
      })
      .map(([name]) => name);
  }

  /**
   * Get names of currently open (unavailable) circuits.
   */
  getOpen(): string[] {
    return Array.from(this.circuits.entries())
      .filter(([, c]) => {
        if (c.state !== "open") return false;
        const elapsed = Date.now() - new Date(c.lastFailure).getTime();
        return elapsed < this.config.resetTimeoutMs;
      })
      .map(([name]) => name);
  }

  /**
   * Reset all circuits to closed state.
   */
  reset(): void {
    for (const circuit of this.circuits.values()) {
      circuit.state = "closed";
      circuit.failures = 0;
      circuit.successRate = 1.0;
    }
    this.halfOpenCounts.clear();
    this.schedulePersist();
  }

  /**
   * Reset a specific circuit.
   */
  resetCircuit(name: string): void {
    const circuit = this.circuits.get(name);
    if (circuit) {
      circuit.state = "closed";
      circuit.failures = 0;
      circuit.successRate = 1.0;
      this.halfOpenCounts.delete(name);
      this.schedulePersist();
    }
  }

  /**
   * Update configuration (e.g., change thresholds at runtime).
   */
  configure(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  /**
   * Manually open a circuit (e.g., admin override).
   */
  trip(name: string): void {
    const circuit = this.getOrCreate(name);
    circuit.state = "open";
    circuit.lastFailure = new Date().toISOString();
    this.schedulePersist();
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private getOrCreate(name: string): CircuitState {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = {
        name,
        failures: 0,
        lastFailure: new Date(0).toISOString(),
        state: "closed",
        totalCalls: 0,
        successRate: 1.0,
      };
      this.circuits.set(name, circuit);
    }
    return circuit;
  }

  /**
   * Schedule a debounced persist to avoid excessive disk writes.
   */
  private schedulePersist(): void {
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    this.persistTimer = setTimeout(() => {
      this.persistScheduled = false;
      this.persistState().catch(() => {});
    }, 2_000);
  }

  /**
   * Persist circuit state to disk.
   */
  private async persistState(): Promise<void> {
    try {
      await fs.mkdir(STATE_DIR, { recursive: true });

      const data = {
        config: this.config,
        circuits: Array.from(this.circuits.entries()).map(([name, state]) => ({
          ...state,
          name,
        })),
        savedAt: new Date().toISOString(),
      };

      await fs.writeFile(
        CIRCUIT_STATE_PATH,
        JSON.stringify(data, null, 2),
        "utf-8"
      );
    } catch {
      // Persistence failure is non-fatal
    }
  }

  /**
   * Load circuit state from disk.
   */
  private async loadState(): Promise<void> {
    try {
      const content = await fs.readFile(CIRCUIT_STATE_PATH, "utf-8");
      const data = JSON.parse(content);

      if (data.config) {
        this.config = { ...DEFAULT_CONFIG, ...data.config };
      }

      if (Array.isArray(data.circuits)) {
        for (const c of data.circuits) {
          // Don't restore "open" circuits from a previous session —
          // they should get a fresh start (the failure may have been transient)
          if (c.state === "open") {
            c.state = "closed";
            c.failures = Math.max(0, c.failures - 1);
          }
          this.circuits.set(c.name, c);
        }
      }
    } catch {
      // No previous state — start fresh
    }
  }
}

// ─── Singleton Accessor ─────────────────────────────────────────────────────

let _instance: CircuitBreaker | null = null;

export function getCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!_instance) {
    _instance = new CircuitBreaker(config);
  }
  return _instance;
}