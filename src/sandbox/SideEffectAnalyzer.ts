// ─── M.A.I. Side Effect Analyzer ───────────────────────────
// Analyzes commands for potential side effects without executing them.
// Categorizes effects (file, network, process, system) and assigns severity.

import type { SideEffect, SideEffectReport, SideEffectCategory } from "./types.js";

// ─── Pattern Definitions ──────────────────────────────────────────────────

interface EffectPattern {
  regex: RegExp;
  category: SideEffectCategory;
  description: string;
  severity: "low" | "medium" | "high" | "critical" | ((m: RegExpMatchArray) => "low" | "medium" | "high" | "critical");
  extractTargets: (match: RegExpMatchArray) => string[];
}

const PATTERNS: EffectPattern[] = [
  // ─── File Write Operations ───────────────────────────────────────────────
  {
    regex: /(?:echo|printf|cat|tee|dd)\s+.*?(>>|>)\s*(\S+)/g,
    category: "file_write",
    description: "Write/append content to a file",
    severity: "medium",
    extractTargets: (m) => [m[2]],
  },
  {
    regex: /(?:write|save|dump|export)\s+.*?(?:>|>>|to|into|\-o\s+)(\S+)/gi,
    category: "file_write",
    description: "Write data to a file",
    severity: "medium",
    extractTargets: (m) => [m[1]],
  },

  // ─── File Delete Operations ─────────────────────────────────────────────
  {
    regex: /rm\s+(-[a-zA-Z]*[frRF][a-zA-Z]*\s+)?(.+)/g,
    category: "file_delete",
    description: "Remove files or directories",
    severity: (m) => {
      const flags = m[1] ?? "";
      const target = m[2] ?? "";
      if (flags.includes("r") && flags.includes("f") && (target === "/" || target === "*" || target === "~/*")) {
        return "critical";
      }
      if (flags.includes("r")) return "high";
      return "medium";
    },
    extractTargets: (m) => (m[2] ?? "").split(/\s+/).filter(Boolean),
  },
  {
    regex: /(?:shred|wipe)\s+(.+)/g,
    category: "file_delete",
    description: "Securely delete file (unrecoverable)",
    severity: "high",
    extractTargets: (m) => (m[1] ?? "").split(/\s+/).filter(Boolean),
  },
  {
    regex: /truncate\s+(-s\s+0\s+)?(.+)/g,
    category: "file_write",
    description: "Truncate file contents",
    severity: "medium",
    extractTargets: (m) => [m[2]],
  },

  // ─── File Read Operations ───────────────────────────────────────────────
  {
    regex: /(?:cat|less|more|head|tail)\s+([\w\/.\-~]+)/g,
    category: "file_read",
    description: "Read file contents",
    severity: "low",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /find\s+.*(?:-exec|\-delete)/g,
    category: "file_delete",
    description: "Find and execute/delete files",
    severity: "high",
    extractTargets: () => ["(recursive)"],
  },

  // ─── Network Outbound ───────────────────────────────────────────────────
  {
    regex: /curl\s+(?:-[a-zA-Z]*\s+)?(['\"]?https?:\/\/[^'\"\s]+)/g,
    category: "network_outbound",
    description: "HTTP request via curl",
    severity: "medium",
    extractTargets: (m) => [m[1].replace(/['\"]/g, "")],
  },
  {
    regex: /wget\s+(?:-[a-zA-Z]*\s+)?(https?:\/\/\S+)/g,
    category: "network_outbound",
    description: "Download file via wget",
    severity: "medium",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /(?:nc|netcat|ncat)\s+(\S+)\s+(\d+)/g,
    category: "network_outbound",
    description: "Network connection via netcat",
    severity: "high",
    extractTargets: (m) => [`${m[1]}:${m[2]}`],
  },
  {
    regex: /ssh\s+(\S+)/g,
    category: "network_outbound",
    description: "SSH remote connection",
    severity: "high",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /scp\s+(\S+)\s+(\S+)/g,
    category: "network_outbound",
    description: "Remote file copy via SCP",
    severity: "medium",
    extractTargets: (m) => [m[1], m[2]],
  },
  {
    regex: /git\s+(?:push|pull|fetch|clone)\s+(\S*)/g,
    category: "network_outbound",
    description: "Git network operation",
    severity: "low",
    extractTargets: (m) => [m[1] || "(default remote)"],
  },
  {
    regex: /ping\s+(\S+)/g,
    category: "network_outbound",
    description: "Network ping",
    severity: "low",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /nslookup|dig\s+(\S+)/g,
    category: "network_outbound",
    description: "DNS lookup",
    severity: "low",
    extractTargets: (m) => [m[1]],
  },

  // ─── Process Management ─────────────────────────────────────────────────
  {
    regex: /(?:kill|pkill|killall)\s+(-\s+)?(\S+)/g,
    category: "process_kill",
    description: "Terminate a process",
    severity: "high",
    extractTargets: (m) => [m[2]],
  },
  {
    regex: /(?:nohup|\&\s*$|disown)/g,
    category: "process_spawn",
    description: "Spawn background/daemon process",
    severity: "medium",
    extractTargets: () => ["(background)"],
  },
  {
    regex: /(?:systemctl|service)\s+(?:start|stop|restart|enable|disable)\s+(\S+)/g,
    category: "process_spawn",
    description: "System service management",
    severity: "high",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /(?:crontab|at\s)/g,
    category: "process_spawn",
    description: "Schedule recurring task",
    severity: "medium",
    extractTargets: () => ["(scheduled)"],
  },

  // ─── System Configuration ───────────────────────────────────────────────
  {
    regex: /chmod\s+(-R\s+)?([0-7oawrx]+)\s+(\S+)/g,
    category: "system_config",
    description: "Change file permissions",
    severity: "medium",
    extractTargets: (m) => [m[3]],
  },
  {
    regex: /chown\s+(-R\s+)?(\S+)\s+(\S+)/g,
    category: "system_config",
    description: "Change file ownership",
    severity: "high",
    extractTargets: (m) => [m[3]],
  },
  {
    regex: /(?:export|unset|setenv)\s+(\w+)/g,
    category: "environment_modify",
    description: "Modify environment variable",
    severity: "low",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /(?:alias|unalias)\s+(\w+)/g,
    category: "environment_modify",
    description: "Modify shell alias",
    severity: "low",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /(?:mv|rename|ren)\s+(\S+)\s+(\S+)/g,
    category: "file_write",
    description: "Move/rename file",
    severity: "medium",
    extractTargets: (m) => [m[1], m[2]],
  },
  {
    regex: /(?:cp|copy)\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(\S+)\s+(\S+)/g,
    category: "file_write",
    description: "Copy files",
    severity: "low",
    extractTargets: (m) => [m[2], m[3]],
  },

  // ─── Package Management ─────────────────────────────────────────────────
  {
    regex: /(?:npm|yarn|pnpm|bun)\s+(?:install|i|add|remove|uninstall|rm)\s+(\S*)/g,
    category: "package_install",
    description: "Package management operation",
    severity: "medium",
    extractTargets: (m) => [m[1] || "(all packages)"],
  },
  {
    regex: /(?:apt|apt-get|brew|pacman|yum|dnf)\s+(?:install|remove|purge)\s+(?:-[a-zA-Z]*\s+)?(\S+)/g,
    category: "package_install",
    description: "System package management",
    severity: "high",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /pip\s+(?:install|uninstall)\s+(\S+)/g,
    category: "package_install",
    description: "Python package management",
    severity: "medium",
    extractTargets: (m) => [m[1]],
  },
  {
    regex: /cargo\s+(?:install|uninstall|add|rm)\s+(\S*)/g,
    category: "package_install",
    description: "Rust package management",
    severity: "medium",
    extractTargets: (m) => [m[1] || "(package)"],
  },
];

// ─── Severity Weights ─────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  low: 5,
  medium: 15,
  high: 40,
  critical: 80,
};

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Analyze a command string for potential side effects.
 * Returns a categorized report with risk score.
 */
export function analyzeSideEffects(command: string): SideEffectReport {
  const effects: SideEffect[] = [];
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(command)) !== null) {
      // Deduplicate by category + description
      const key = `${pattern.category}:${pattern.description}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Resolve severity (handle dynamic severity functions)
      let severity: "low" | "medium" | "high" | "critical";
      if (typeof pattern.severity === "function") {
        severity = (pattern.severity as (m: RegExpMatchArray) => "low" | "medium" | "high" | "critical")(match);
      } else {
        severity = pattern.severity;
      }

      const targets = pattern.extractTargets(match);

      effects.push({
        category: pattern.category,
        description: pattern.description,
        severity,
        targets,
      });

      pattern.regex.lastIndex = 0; // Reset for safety
    }
  }

  // Calculate risk score
  const riskScore = effects.reduce((sum, e) => {
    return Math.min(100, sum + (SEVERITY_WEIGHT[e.severity] ?? 10));
  }, 0);

  // Check for pipe chains (each pipe increases risk)
  const pipeCount = (command.match(/\|/g) || []).length;
  const adjustedRisk = Math.min(100, riskScore + pipeCount * 5);

  return {
    command,
    effects,
    hasCriticalEffects: effects.some(e => e.severity === "critical"),
    riskScore: adjustedRisk,
  };
}
