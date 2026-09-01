// ─── M.A.I. Built-in Workflow Templates ──────────────────────────────────
// Predefined workflows that Mai uses for common autonomous tasks.
// Each template is a deterministic blueprint with optional brain decision points.
//
// Step kinds available:
//   actions   — Execute primitives sequentially
//   parallel  — Execute primitives concurrently
//   decision  — Brain picks a branch
//   brain     — Brain analyzes/synthesizes (saves to variable)
//   file-write — Write files from brain output (---FILE: path--- format)
//   input     — Ask the user for a value
//
// Features: condition, retry, optional, pollUntil

import type { WorkflowTemplate } from "../../types/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT BUILD WORKFLOW
// Triggered when user asks to build/create/scaffold a project.
// Uses file-write step to actually write brain-generated files to disk.
// ═══════════════════════════════════════════════════════════════════════════════

const projectBuild: WorkflowTemplate = {
  id: "project-build",
  name: "Project Build",
  estimatedDurationSec: 180,
  triggers: [
    {
      keywords: ["build a project", "create a project", "scaffold", "set up a project", "new project", "initialize project", "create a web app", "build me a", "make me a", "create an app", "scaffold a"],
      intentTypes: ["complex_task", "planning"],
    },
  ],
  variables: [
    { name: "projectPath", description: "Where to create the project", required: true, default: ".", prompt: "Where should I create this project?" },
  ],
  steps: [
    {
      id: "pb_assess",
      kind: "brain",
      name: "Assess Requirements",
      description: "Brain analyzes what the user wants and creates a detailed build plan",
      prompt: `Based on the user's request, create a detailed build plan:
1. What type of project this is (web app, CLI, API, library, etc.)
2. Technology stack (Node.js/TypeScript preferred unless user specifies otherwise)
3. Complete directory structure
4. All dependencies with exact install commands
5. Build/dev/test scripts for package.json
6. What each source file should contain

Be extremely specific. This plan will be used to generate every file.`,
      saveAs: "buildPlan",
    },
    {
      id: "pb_create_dir",
      kind: "actions",
      name: "Create Project Directory",
      description: "Create the project root directory",
      actions: [
        { action: "execute-terminal", params: { command: "mkdir -p {{projectPath}}" }, label: "Create project directory" },
      ],
    },
    {
      id: "pb_init",
      kind: "actions",
      name: "Initialize Package",
      description: "Run npm init",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && npm init -y 2>&1" }, label: "Initialize npm" },
      ],
    },
    {
      id: "pb_install_deps",
      kind: "brain",
      name: "Plan Dependencies",
      description: "Brain determines install commands from the build plan",
      prompt: `Based on the build plan, output ONLY the exact npm install command(s) needed, one per line:

{{buildPlan}}

Example format:
npm install express
npm install -D typescript @types/node

Output ONLY the commands. Nothing else.`,
      saveAs: "installCommands",
    },
    {
      id: "pb_execute_installs",
      kind: "actions",
      name: "Install Dependencies",
      description: "Run the dependency installation commands",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && {{installCommands}}" }, label: "Install dependencies" },
      ],
      retry: { maxRetries: 2, delayMs: 5000, onFail: true },
    },
    {
      id: "pb_generate_files",
      kind: "brain",
      name: "Generate Source Code",
      description: "Brain generates all project source files",
      prompt: `Based on the build plan, generate ALL source files for the project.

Build plan:
{{buildPlan}}

For EACH file, output in this EXACT format:
---FILE: {{projectPath}}/<relative-path>---
<complete file content>
---END FILE---

Include ALL files needed:
- Main entry point (index.ts or server.ts)
- package.json (with proper scripts section)
- tsconfig.json (if TypeScript)
- README.md with run instructions
- Any config files, routes, middleware
- HTML/CSS if web app

IMPORTANT: Every file must be complete and ready to run. No placeholders or TODOs.`,
      saveAs: "generatedFiles",
    },
    {
      id: "pb_write_files",
      kind: "file-write",
      name: "Write Files to Disk",
      description: "Parse brain output and write all generated files",
      sourceVar: "generatedFiles",
      parseFiles: true,
      fallbackPath: "{{projectPath}}/output.txt",
    },
    {
      id: "pb_verify",
      kind: "actions",
      name: "Verify Build",
      description: "Check if the project compiles/builds",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "cd {{projectPath}} && npm run build 2>&1 || echo 'NO_BUILD_SCRIPT'" },
          label: "Build check",
          optional: true,
        },
      ],
      retry: { maxRetries: 1, onFail: "NO_BUILD_SCRIPT" },
    },
    {
      id: "pb_report",
      kind: "brain",
      name: "Build Summary",
      description: "Brain summarizes what was built",
      prompt: `Summarize what was just built at {{projectPath}}. Include:
- Project type and tech stack
- Key files created (list them)
- How to run it (exact commands)
- How to run tests (if applicable)
- Next steps

Keep it concise but actionable (3-5 sentences).`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// INVESTIGATE ERROR WORKFLOW
// Triggered when user shares an error message and asks for help.
// ═══════════════════════════════════════════════════════════════════════════════

const investigateError: WorkflowTemplate = {
  id: "investigate-error",
  name: "Investigate Error",
  estimatedDurationSec: 90,
  triggers: [
    {
      keywords: ["error", "failed", "crashed", "broken", "not working", "bug", "issue", "fix this", "help me debug", "why is"],
      intentTypes: ["complex_task"],
    },
  ],
  variables: [
    { name: "errorMessage", description: "The error output", required: true },
    { name: "projectPath", description: "Project directory", required: false, default: "." },
  ],
  steps: [
    {
      id: "ie_collect",
      kind: "parallel",
      name: "Gather Context",
      description: "Collect error context and recent file changes",
      actions: [
        { action: "get-system-info", params: {}, label: "System info", optional: true },
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && git log --oneline -5 2>/dev/null || echo 'NOT_A_GIT_REPO'" }, label: "Recent git commits", optional: true },
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && git diff --name-only HEAD~1 2>/dev/null | head -10 || echo 'NO_GIT'" }, label: "Recently changed files", optional: true },
      ],
    },
    {
      id: "ie_read_relevant",
      kind: "brain",
      name: "Identify Relevant Files",
      description: "Brain determines which files to read based on the error",
      prompt: `The user is experiencing this error:

{{errorMessage}}

Based on the error message and any file changes shown above, list the exact file paths (one per line) that I should read to diagnose this issue. Only list files that exist in the project. If the error mentions a specific file, include it.

Output ONLY file paths, one per line. If no relevant files can be determined, output "NONE".`,
      saveAs: "filesToRead",
    },
    {
      id: "ie_analyze",
      kind: "brain",
      name: "Diagnose Error",
      description: "Brain analyzes the error and provides root cause + fix",
      prompt: `Analyze this error and provide a diagnosis:

Error:
{{errorMessage}}

Files to examine:
{{filesToRead}}

Provide:
1. Root cause (1-2 sentences)
2. The exact fix needed (specific code change or command)
3. Step-by-step fix instructions
4. How to verify the fix worked

Be specific and actionable. Include exact file paths and code snippets if applicable.`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP DEV ENVIRONMENT WORKFLOW
// Triggered when user asks to set up a development environment.
// ═══════════════════════════════════════════════════════════════════════════════

const setupDevEnv: WorkflowTemplate = {
  id: "setup-dev-environment",
  name: "Setup Dev Environment",
  estimatedDurationSec: 300,
  triggers: [
    {
      keywords: ["set up environment", "dev environment", "install dependencies", "setup my dev", "configure my development", "prepare my workspace", "get my environment ready"],
      intentTypes: ["complex_task", "planning"],
    },
  ],
  variables: [
    { name: "projectPath", description: "Project directory", required: true, default: ".", prompt: "Which project directory?" },
    { name: "envType", description: "Type of environment (node, python, rust, etc.)", required: false },
  ],
  steps: [
    {
      id: "dev_detect",
      kind: "parallel",
      name: "Detect Current Setup",
      description: "Check what's already installed and what the project needs",
      actions: [
        { action: "get-system-info", params: {}, label: "System info" },
        { action: "execute-terminal", params: { command: "node --version 2>/dev/null && npm --version 2>/dev/null && echo '---' && python3 --version 2>/dev/null && echo '---' && rustc --version 2>/dev/null && echo '---' && git --version 2>/dev/null || echo 'CHECKS_DONE'" }, label: "Installed toolchains" },
        { action: "list-files-detailed", params: { path: "{{projectPath}}" }, label: "Project files" },
      ],
    },
    {
      id: "dev_plan",
      kind: "brain",
      name: "Create Setup Plan",
      description: "Brain determines what needs to be installed/configured",
      prompt: `Based on the system info and project files, determine what needs to be set up for development.

Project path: {{projectPath}}
{{envType}}

Provide:
1. What tools/runtimes are missing
2. What project dependencies need installing
3. What config files need creating or updating
4. Exact install/setup commands (one per line)

Output ONLY the exact commands to run, one per line. Prefix with "INSTALL: " for package installs and "CONFIG: " for configuration steps.`,
      saveAs: "setupCommands",
    },
    {
      id: "dev_execute",
      kind: "actions",
      name: "Run Setup Commands",
      description: "Execute the setup plan",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && {{setupCommands}}" }, label: "Execute setup" },
      ],
      retry: { maxRetries: 2, delayMs: 3000, onFail: true },
    },
    {
      id: "dev_verify",
      kind: "actions",
      name: "Verify Setup",
      description: "Verify everything is working",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && npm run build 2>&1 || npm test 2>&1 || echo 'VERIFY_SKIPPED'" }, label: "Build/test check", optional: true },
      ],
      retry: { maxRetries: 1, onFail: "VERIFY_SKIPPED" },
    },
    {
      id: "dev_report",
      kind: "brain",
      name: "Setup Summary",
      prompt: `Summarize the dev environment setup for {{projectPath}}.
- What was installed/configured
- What's ready to use
- How to start developing (commands)
- Any remaining manual steps

Keep it concise (3-4 sentences).`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GIT WORKFLOW
// Triggered when user asks for git operations.
// ═══════════════════════════════════════════════════════════════════════════════

const gitWorkflow: WorkflowTemplate = {
  id: "git-workflow",
  name: "Git Operations",
  estimatedDurationSec: 60,
  triggers: [
    {
      keywords: ["commit these changes", "create a branch", "git commit", "git push", "git status", "git log", "merge branch", "create a pr", "pull request", "git diff"],
      intentTypes: ["complex_task", "system_command"],
    },
  ],
  variables: [
    { name: "projectPath", description: "Project directory", required: true, default: "." },
  ],
  steps: [
    {
      id: "git_status",
      kind: "actions",
      name: "Git Status",
      description: "Check current git state",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && git status --short 2>&1 && echo '---' && git branch --show-current 2>&1 && echo '---' && git log --oneline -3 2>&1" }, label: "Git status + recent commits" },
      ],
    },
    {
      id: "git_diff",
      kind: "actions",
      name: "Show Changes",
      description: "Show what has changed",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && git diff --stat 2>&1" }, label: "Diff summary", optional: true },
      ],
    },
    {
      id: "git_brain",
      kind: "brain",
      name: "Plan Git Action",
      description: "Brain determines what git operation to perform",
      prompt: `The user wants to perform a git operation. Based on their request and the current git state, determine:
1. What git command(s) to run
2. What commit message to use (if committing)
3. What branch name (if branching)

Output the EXACT commands to run, one per line. Include the commit message in the -m flag.`,
      saveAs: "gitCommands",
    },
    {
      id: "git_execute",
      kind: "decision",
      name: "Confirm and Execute",
      description: "Ask brain to confirm the commands are safe, then execute",
      decision: {
        id: "git_safety_check",
        question: `Review these git commands for safety. Do they look correct and non-destructive?

{{gitCommands}}

Choose 'safe' if the commands are standard git operations. Choose 'risky' if they involve force-push, reset --hard, or branch deletion.`,
        branches: [
          {
            id: "safe",
            condition: "Commands are safe to execute",
            actions: [
              { action: "execute-terminal", params: { command: "cd {{projectPath}} && {{gitCommands}}" }, label: "Execute git commands" },
            ],
          },
          {
            id: "risky",
            condition: "Commands are potentially destructive",
            actions: [],
          },
        ],
        fallbackBranch: "safe",
      },
    },
    {
      id: "git_result",
      kind: "brain",
      name: "Summarize Result",
      prompt: `Summarize the git operation result in 1-2 sentences. What was done and what's the current state?`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// MORNING BRIEFING WORKFLOW
// Triggered when user asks for a morning briefing or daily summary.
// ═══════════════════════════════════════════════════════════════════════════════

const morningBriefing: WorkflowTemplate = {
  id: "morning-briefing",
  name: "Morning Briefing",
  estimatedDurationSec: 45,
  triggers: [
    {
      keywords: ["morning briefing", "daily summary", "what's happening", "morning report", "daily briefing", "start my day", "what's new", "catch me up", "brief me"],
      intentTypes: ["conversation", "planning"],
    },
  ],
  steps: [
    {
      id: "mb_collect",
      kind: "parallel",
      name: "Gather Morning Data",
      description: "Collect system status, pending items, and notifications",
      actions: [
        { action: "get-system-info", params: {}, label: "System status" },
        { action: "get-process-list", params: {}, label: "Running processes", optional: true },
        { action: "get-network-info", params: {}, label: "Network status", optional: true },
        { action: "execute-terminal", params: { command: "date '+%A, %B %d, %Y - %H:%M' 2>/dev/null && echo '---' && uptime 2>/dev/null && echo '---' && df -h / 2>/dev/null | tail -1" }, label: "Date, uptime, disk" },
      ],
    },
    {
      id: "mb_brain",
      name: "Generate Briefing",
      kind: "brain",
      description: "Brain creates a personalized morning briefing",
      prompt: `Create a concise morning briefing based on the system data. Include:
1. Good morning greeting with the current date/time
2. System health summary (CPU, memory, disk at a glance)
3. Network connectivity status
4. Any notable processes running
5. A proactive suggestion for the day (one actionable thing)

Keep the total briefing under 200 words. Be warm but concise. Think of this as a Tony Stark/Jarvis morning report.`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CODE REVIEW WORKFLOW
// Triggered when user asks for a code review.
// ═══════════════════════════════════════════════════════════════════════════════

const codeReview: WorkflowTemplate = {
  id: "code-review",
  name: "Code Review",
  estimatedDurationSec: 90,
  triggers: [
    {
      keywords: ["code review", "review this code", "review my changes", "check this code", "what do you think of this code", "review my pr", "review these changes"],
      intentTypes: ["complex_task"],
    },
  ],
  variables: [
    { name: "projectPath", description: "Project directory", required: true, default: "." },
  ],
  steps: [
    {
      id: "cr_get_changes",
      kind: "actions",
      name: "Get Changed Files",
      description: "Find what files have been modified",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && git diff --name-only HEAD~1 2>/dev/null || git diff --name-only --cached 2>/dev/null || echo 'NO_GIT_CHANGES'" }, label: "Get changed files" },
      ],
    },
    {
      id: "cr_get_diff",
      kind: "actions",
      name: "Get Full Diff",
      description: "Get the actual code changes",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && git diff HEAD~1 2>/dev/null | head -2000 || git diff --cached 2>/dev/null | head -2000 || echo 'NO_DIFF_AVAILABLE'" }, label: "Get code diff" },
      ],
    },
    {
      id: "cr_review",
      name: "Analyze Code",
      kind: "brain",
      description: "Brain performs a thorough code review",
      prompt: `Perform a thorough code review of these changes. Analyze:

1. **Correctness**: Are there bugs, logic errors, or edge cases not handled?
2. **Security**: Any vulnerabilities (injection, XSS, hardcoded secrets, etc.)?
3. **Performance**: Any obvious performance issues (N+1 queries, unnecessary loops, memory leaks)?
4. **Code Quality**: Naming, structure, DRY principle, error handling?
5. **Testing**: Are there test gaps? What should be tested?

Rate overall: APPROVE / APPROVE_WITH_NOTES / REQUEST_CHANGES

For each issue found, specify the file, line area, and exact fix suggestion.
Be specific — no vague "consider refactoring" comments.`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEPLOY WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

const deploy: WorkflowTemplate = {
  id: "deploy",
  name: "Deploy Project",
  estimatedDurationSec: 180,
  triggers: [
    {
      keywords: ["deploy", "ship it", "push to production", "go live", "release", "publish"],
      intentTypes: ["complex_task"],
    },
  ],
  variables: [
    { name: "projectPath", description: "Path to the project to deploy", required: true, prompt: "Which project should I deploy? (path)" },
  ],
  steps: [
    {
      id: "dep_analyze",
      kind: "brain",
      name: "Analyze Deployment Target",
      description: "Brain determines the deployment method",
      prompt: `Analyze the project at {{projectPath}} and determine the best deployment method.
Consider: Docker, PM2, systemd, static hosting, serverless.
Provide exact commands for the recommended approach.`,
      saveAs: "deployPlan",
    },
    {
      id: "dep_precheck",
      kind: "actions",
      name: "Pre-deployment Checks",
      description: "Run tests and build",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && npm test 2>&1 || echo 'TESTS_SKIPPED'" }, label: "Run tests", optional: true },
        { action: "execute-terminal", params: { command: "cd {{projectPath}} && npm run build 2>&1 || echo 'BUILD_SKIPPED'" }, label: "Build for production", optional: true },
      ],
    },
    {
      id: "dep_method",
      kind: "decision",
      name: "Choose Deploy Method",
      description: "Brain picks the deployment approach",
      decision: {
        id: "deploy_method_choice",
        question: "Based on the deploy plan, which deployment method?\n\nDeploy plan:\n{{deployPlan}}\n\nChoose: docker, pm2, systemd, static, or manual.",
        branches: [
          { id: "docker", condition: "Docker deployment", actions: [
            { action: "execute-terminal", params: { command: "cd {{projectPath}} && docker build -t mai-deploy:latest . 2>&1" }, label: "Build Docker image", optional: true },
            { action: "execute-terminal", params: { command: "docker run -d --name mai-deploy -p 3000:3000 mai-deploy:latest 2>&1" }, label: "Run container", optional: true },
          ]},
          { id: "pm2", condition: "PM2 process manager", actions: [
            { action: "execute-terminal", params: { command: "cd {{projectPath}} && pm2 restart all 2>&1 || pm2 start npm --name mai-deploy -- start 2>&1" }, label: "PM2 start/restart", optional: true },
          ]},
          { id: "systemd", condition: "Systemd service", actions: [
            { action: "execute-terminal", params: { command: "sudo systemctl restart mai-deploy 2>&1 || echo 'SERVICE_NOT_FOUND'" }, label: "Restart systemd service", optional: true },
          ]},
          { id: "manual", condition: "Manual deployment", actions: [] },
        ],
        fallbackBranch: "manual",
      },
    },
    {
      id: "dep_verify",
      kind: "actions",
      name: "Post-deploy Health Check",
      description: "Verify the deployment is healthy",
      actions: [
        { action: "execute-terminal", params: { command: "sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || echo 'UNREACHABLE'" }, label: "Health check", optional: true },
      ],
      retry: { pollUntil: { variable: "deployPlan", contains: "healthy", maxAttempts: 5, intervalMs: 3000 } },
    },
    {
      id: "dep_report",
      kind: "brain",
      name: "Deployment Summary",
      prompt: `Summarize the deployment. Project at {{projectPath}}. Deploy plan: {{deployPlan}}
Include: what was deployed, how to access it, any issues. 2-4 sentences.`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM DIAGNOSTICS WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

const systemScan: WorkflowTemplate = {
  id: "system-scan",
  name: "System Diagnostics",
  estimatedDurationSec: 30,
  triggers: [
    {
      keywords: ["system scan", "diagnostics", "check system", "health check", "what's going on", "system status", "check my system", "run diagnostics", "system health"],
      intentTypes: ["complex_task", "system_command"],
    },
  ],
  steps: [
    {
      id: "scan_parallel",
      kind: "parallel",
      name: "Collect System Info",
      description: "Gather system metrics in parallel",
      actions: [
        { action: "get-system-info", params: {}, label: "System info" },
        { action: "get-process-list", params: {}, label: "Process list" },
        { action: "get-gpu-info", params: {}, label: "GPU info", optional: true },
        { action: "get-network-info", params: {}, label: "Network info" },
      ],
    },
    {
      id: "scan_disk",
      kind: "actions",
      name: "Disk & Memory Usage",
      description: "Check disk and memory status",
      actions: [
        { action: "execute-terminal", params: { command: "df -h / 2>/dev/null && echo '---' && free -h 2>/dev/null || echo 'N/A'" }, label: "Disk and memory usage" },
      ],
    },
    {
      id: "scan_report",
      kind: "brain",
      name: "Analyze System Health",
      prompt: `Based on the system information gathered, provide a concise health assessment:
- CPU, memory, and disk status
- Any concerning processes or resource usage
- Network connectivity status
- Recommendations if anything needs attention

Keep it to 3-5 bullet points. Be specific with numbers.`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILE ORGANIZE WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

const fileOrganize: WorkflowTemplate = {
  id: "file-organize",
  name: "File Organization",
  estimatedDurationSec: 60,
  triggers: [
    {
      keywords: ["organize", "clean up", "tidy", "sort files", "file management", "move files", "reorganize"],
      intentTypes: ["complex_task"],
    },
  ],
  variables: [
    { name: "targetDir", description: "Directory to organize", required: true, default: ".", prompt: "Which directory should I organize?" },
  ],
  steps: [
    {
      id: "org_scan",
      kind: "actions",
      name: "Scan Directory",
      actions: [
        { action: "list-files-detailed", params: { path: "{{targetDir}}" }, label: "List files" },
      ],
    },
    {
      id: "org_plan",
      kind: "brain",
      name: "Create Organization Plan",
      prompt: `I need to organize the files in {{targetDir}}. Based on the file listing above, propose reorganization.
Output ONLY the exact mv/mkdir commands, one per line.
Do NOT include files that are already well-organized.`,
      saveAs: "orgCommands",
    },
    {
      id: "org_confirm",
      kind: "decision",
      name: "Review Changes",
      decision: {
        id: "org_confirm_decision",
        question: "Organization plan for {{targetDir}}:\n\n{{orgCommands}}\n\nExecute these changes?",
        branches: [
          { id: "execute", condition: "Execute the plan", actions: [
            { action: "execute-terminal", params: { command: "cd {{targetDir}} && {{orgCommands}}" }, label: "Execute organization" },
          ]},
          { id: "skip", condition: "Cancel", actions: [] },
        ],
        fallbackBranch: "skip",
      },
    },
    {
      id: "org_verify",
      kind: "actions",
      name: "Verify Result",
      actions: [
        { action: "list-files-detailed", params: { path: "{{targetDir}}" }, label: "Verify new structure" },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY SCAN WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

const cyberScan: WorkflowTemplate = {
  id: "cyber-scan",
  name: "Security Scan",
  estimatedDurationSec: 90,
  triggers: [
    {
      keywords: ["security scan", "vulnerability", "check security", "audit security", "cyber", "security check", "npm audit", "check vulnerabilities"],
      intentTypes: ["complex_task"],
    },
  ],
  variables: [
    { name: "scanTarget", description: "Target path", required: true, default: ".", prompt: "What should I scan?" },
  ],
  steps: [
    {
      id: "sec_deps",
      kind: "parallel",
      name: "Dependency & Config Scan",
      actions: [
        { action: "execute-terminal", params: { command: "cd {{scanTarget}} && npm audit --json 2>/dev/null | head -100 || echo 'NO_PACKAGE_JSON'" }, label: "NPM audit", optional: true },
        { action: "execute-terminal", params: { command: "cd {{scanTarget}} && find . -name '.env' -o -name '*.pem' -o -name '*.key' -o -name 'credentials*' -o -name 'id_rsa*' 2>/dev/null | head -20 || echo 'CLEAN'" }, label: "Sensitive file check" },
        { action: "execute-terminal", params: { command: "cd {{scanTarget}} && find . -name 'package.json' -exec grep -l 'http://' {} \\; 2>/dev/null | head -10 || echo 'NO_HTTP_DEPS'" }, label: "Insecure dependency check", optional: true },
      ],
    },
    {
      id: "sec_network",
      kind: "actions",
      name: "Network Exposure Check",
      actions: [
        { action: "execute-terminal", params: { command: "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo 'NO_NETWORK_TOOLS'" }, label: "Open ports", optional: true },
      ],
    },
    {
      id: "sec_report",
      kind: "brain",
      name: "Security Assessment",
      prompt: `Based on the security scan for {{scanTarget}}, provide an assessment:
- Critical/High vulnerabilities
- Exposed sensitive files
- Network exposure risks
- Recommended immediate actions

Rate: CLEAN / LOW RISK / MEDIUM RISK / HIGH RISK / CRITICAL`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEEP RESEARCH WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

const research: WorkflowTemplate = {
  id: "research",
  name: "Deep Research",
  estimatedDurationSec: 60,
  triggers: [
    {
      keywords: ["research", "look into", "investigate", "find out about", "deep dive", "analyze this", "tell me about", "what do you know about"],
      intentTypes: ["complex_task", "planning"],
    },
  ],
  steps: [
    {
      id: "res_web",
      kind: "brain",
      name: "Formulate Search Queries",
      prompt: `The user wants to research a topic. Generate 2-3 specific, targeted search queries. Output ONLY the queries, one per line, without numbering.`,
      saveAs: "searchQueries",
    },
    {
      id: "res_search",
      kind: "brain",
      name: "Execute Searches",
      prompt: `Research the following using web-search:\n\n{{searchQueries}}\n\nCompile key findings, facts, and source URLs.`,
      saveAs: "searchResults",
    },
    {
      id: "res_synthesize",
      kind: "brain",
      name: "Synthesize Findings",
      prompt: `Based on the research results, synthesize a concise analysis.\n\nSearch results:\n{{searchResults}}\n\nStructure:\n1. Executive Summary (2-3 sentences)\n2. Key Findings (bullet points)\n3. Sources / References\n4. Next Steps`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT ALL BUILTIN TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

export function getBuiltinTemplates(): WorkflowTemplate[] {
  return [
    projectBuild,
    investigateError,
    setupDevEnv,
    gitWorkflow,
    morningBriefing,
    codeReview,
    deploy,
    systemScan,
    fileOrganize,
    cyberScan,
    research,
  ];
}
