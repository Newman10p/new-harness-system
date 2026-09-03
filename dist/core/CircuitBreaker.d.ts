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
export declare class CircuitBreaker {
    private circuits;
    private config;
    private halfOpenCounts;
    private persistTimer;
    private persistScheduled;
    constructor(config?: Partial<CircuitBreakerConfig>);
    /**
     * Record a successful call for a provider/primitive.
     */
    recordSuccess(name: string): void;
    /**
     * Record a failure for a provider/primitive. May open the circuit.
     */
    recordFailure(name: string): void;
    /**
     * Check if a provider/primitive is available for use.
     * Handles the half-open transition automatically.
     */
    isAvailable(name: string): boolean;
    /**
     * Get the current state of all circuits.
     */
    getStats(): CircuitState[];
    /**
     * Get the state of a specific circuit.
     */
    getCircuit(name: string): CircuitState | null;
    /**
     * Get names of currently available circuits.
     */
    getAvailable(): string[];
    /**
     * Get names of currently open (unavailable) circuits.
     */
    getOpen(): string[];
    /**
     * Reset all circuits to closed state.
     */
    reset(): void;
    /**
     * Reset a specific circuit.
     */
    resetCircuit(name: string): void;
    /**
     * Update configuration (e.g., change thresholds at runtime).
     */
    configure(config: Partial<CircuitBreakerConfig>): void;
    /**
     * Get current configuration.
     */
    getConfig(): CircuitBreakerConfig;
    /**
     * Manually open a circuit (e.g., admin override).
     */
    trip(name: string): void;
    private getOrCreate;
    /**
     * Schedule a debounced persist to avoid excessive disk writes.
     */
    private schedulePersist;
    /**
     * Persist circuit state to disk.
     */
    private persistState;
    /**
     * Load circuit state from disk.
     */
    private loadState;
}
export declare function getCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker;
//# sourceMappingURL=CircuitBreaker.d.ts.map