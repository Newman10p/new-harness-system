import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

export interface SecurityAuditInput {
  code: string;
  language?: string;
}

class SecurityAuditAction implements HarnessAction {
  name = "code.securityAudit";
  description = "Analyze code for security issues (defensive only)";

  async run(input: unknown): Promise<{ issues: string[]; summary: string }> {
    const { code, language } = input as SecurityAuditInput;
    if (!code) throw new Error("code.securityAudit requires 'code'");

    const issues: string[] = [];
    const lang = (language ?? "unknown").toLowerCase();

    // Check for common security patterns
    if (code.includes("eval(")) issues.push("Use of eval() - risk of code injection");
    if (code.includes("exec(")) issues.push("Use of exec() - potential command injection");
    if (code.includes("innerHTML")) issues.push("Use of innerHTML - XSS risk, consider textContent");
    if (code.includes("document.write")) issues.push("Use of document.write - XSS risk");
    if (code.includes("dangerouslySetInnerHTML")) issues.push("React dangerouslySetInnerHTML - XSS risk");
    if (code.includes("SQL") || code.includes("sql")) {
      if (!code.includes("?") && !code.includes("$")) issues.push("Possible SQL injection - use parameterized queries");
    }
    if (code.includes("process.env")) issues.push("Exposes environment variables - ensure no secrets leaked");
    if (code.includes("fs.writeFileSync") || code.includes("fs.writeFile")) {
      issues.push("File write operations - validate paths to avoid path traversal");
    }
    if (code.includes("http://")) issues.push("Uses HTTP instead of HTTPS");

    const summary = issues.length > 0
      ? `Found ${issues.length} potential security ${issues.length === 1 ? "issue" : "issues"} in ${lang} code`
      : `No common security issues detected in ${lang} code`;

    return { issues, summary };
  }
}

class SecurityDiagnosticsAction implements HarnessAction {
  name = "security.diagnostics";
  description = "Run security diagnostics on the local environment";

  async run(_input: unknown): Promise<{ diagnostics: string[] }> {
    const diagnostics: string[] = [];
    diagnostics.push(`Platform: ${process.platform}`);
    diagnostics.push(`Node version: ${process.version}`);
    diagnostics.push(`Working directory: ${process.cwd()}`);

    // Check for common security tools
    const tools = ["fail2ban", "ufw", "iptables", "clamav", "rkhunter", "chkrootkit", "lynis"];
    const { execSync } = await import("node:child_process");
    for (const tool of tools) {
      try {
        execSync(`which ${tool} 2>/dev/null || where ${tool} 2>nul`, { encoding: "utf8", timeout: 3000 });
        diagnostics.push(`Security tool found: ${tool}`);
      } catch { /* not installed */ }
    }

    return { diagnostics };
  }
}

export const securityAuditAction = new SecurityAuditAction();
export const securityDiagnosticsAction = new SecurityDiagnosticsAction();

export function registerSecurityActions(): void {
  globalActionRegistry.register(securityAuditAction, {
    name: "code.securityAudit",
    description: "Analyze code for security issues (defensive only)",
    category: "security"
  });
  globalActionRegistry.register(securityDiagnosticsAction, {
    name: "security.diagnostics",
    description: "Run security diagnostics on the local environment",
    category: "security"
  });
}