// ─── M.A.I. Built-in Workflow Templates ──────────────────────────────────
// These are the predefined workflows that Mai uses for common autonomous tasks.
// Each template is a deterministic blueprint with optional brain decision points.

import type { WorkflowTemplate } from "../../types/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT BUILD WORKFLOW
// Triggered when user asks to build/create a project.
// ═══════════════════════════════════════════════════════════════════════════════

const projectBuild: WorkflowTemplate = {
  id: "project-build",
  name: "Project Build",
  estimatedDurationSec: 120,
  triggers: [
    {
      keywords: ["build a project", "create a project", "scaffold", "set up a project", "new project", "initialize project", "create a web app", "build me a", "make me a"],
      intentTypes: ["complex_task", "planning"],
    },
  ],
  variables: [
    { name: "projectPath", description: "Where to create the project", required: true, prompt: 'Where should I create this project? (path or "." for current directory)' },
  ],
  steps: [
    {
      id: "pb_assess",
      kind: "brain",
      name: "Assess Requirements",
      description: "Brain analyzes what the user wants and creates a build plan",
      prompt: `Based on the user's request, determine:
1. What type of project this is (web app, CLI tool, API server, etc.)
2. What technology stack to use (consider: Node.js/TypeScript, Python, etc.)
3. What the directory structure should look like
4. What dependencies are needed
5. What build/dev commands to set up

Be specific and actionable. Output a clear plan with exact commands to run.`,
      saveAs: "buildPlan",
    },
    {
      id: "pb_create_dir",
      kind: "actions",
      name: "Create Project Directory",
      description: "Create the project directory structure",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "mkdir -p {{projectPath}}" },
          label: "Create project directory",
        },
      ],
    },
    {
      id: "pb_init",
      kind: "actions",
      name: "Initialize Project",
      description: "Run package manager init and install dependencies",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "cd {{projectPath}} && npm init -y" },
          label: "Initialize npm",
        },
      ],
    },
    {
      id: "pb_install_deps",
      kind: "brain",
      name: "Install Dependencies",
      description: "Brain determines which packages to install and installs them",
      prompt: `Based on the build plan:

{{buildPlan}}

List ONLY the exact npm install command(s) needed. Output nothing but the command(s), one per line. Example:
npm install express
npm install -D typescript @types/node`,
      saveAs: "installCommands",
    },
    {
      id: "pb_execute_installs",
      kind: "actions",
      name: "Run Install Commands",
      description: "Execute the dependency installation commands from the brain",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "cd {{projectPath}} && {{installCommands}}" },
          label: "Install dependencies",
        },
      ],
    },
    {
      id: "pb_write_files",
      kind: "brain",
      name: "Generate Project Files",
      description: "Brain generates the actual source code files",
      prompt: `Based on the build plan, generate the project's source files.

Build plan:
{{buildPlan}}

For each file, output in this exact format:
---FILE: <path>---
<file content>
---END FILE---

Include at minimum: main entry point, package.json scripts, README.
For web apps: HTML entry, CSS, server config.
For APIs: route definitions, middleware setup.`,
      saveAs: "generatedFiles",
    },
    {
      id: "pb_verify",
      kind: "decision",
      name: "Verify Build",
      description: "Check if the project builds/compiles successfully",
      decision: {
        id: "build_check",
        question: "Should I verify the project builds correctly by running the build/dev command?",
        branches: [
          {
            id: "verify",
            condition: "Run build check to verify everything compiles",
            actions: [
              {
                action: "execute-terminal",
                params: { command: "cd {{projectPath}} && npm run build 2>&1 || echo 'BUILD_FAILED'" },
                label: "Build check",
                optional: true,
              },
            ],
          },
          {
            id: "skip",
            condition: "Skip verification, project is ready",
            actions: [],
          },
        ],
        fallbackBranch: "verify",
      },
    },
    {
      id: "pb_report",
      kind: "brain",
      name: "Generate Summary",
      description: "Brain summarizes what was built",
      prompt: `Summarize what was just built. Include:
- Project type and location
- Key files created
- How to run it
- Next steps for the user

Keep it concise (3-5 sentences). The project is at: {{projectPath}}`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEPLOY WORKFLOW
// Triggered when user asks to deploy something.
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
      description: "Brain determines the deployment method based on project type",
      prompt: `Analyze the project at {{projectPath}} and determine:
1. What type of project this is
2. The best deployment method (Docker, PM2, systemd, static hosting, serverless)
3. What pre-deployment checks to run (tests, lint, build)
4. What the deployment command should be

Read the project's package.json and config files to make this determination. Be specific with exact commands.`,
      saveAs: "deployPlan",
    },
    {
      id: "dep_precheck",
      kind: "actions",
      name: "Pre-deployment Checks",
      description: "Run tests, lint, and build before deploying",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "cd {{projectPath}} && npm test 2>&1 || echo 'TESTS_SKIPPED'" },
          label: "Run tests",
          optional: true,
        },
        {
          action: "execute-terminal",
          params: { command: "cd {{projectPath}} && npm run build 2>&1 || echo 'BUILD_SKIPPED'" },
          label: "Build for production",
          optional: true,
        },
      ],
    },
    {
      id: "dep_method",
      kind: "decision",
      name: "Choose Deploy Method",
      description: "Brain decides the deployment approach",
      decision: {
        id: "deploy_method_choice",
        question: `Based on the deploy plan, which deployment method should we use?

Deploy plan:
{{deployPlan}}

Choose: docker, pm2, systemd, static, or manual.`,
        branches: [
          {
            id: "docker",
            condition: "Docker container deployment",
            actions: [
              {
                action: "execute-terminal",
                params: { command: "cd {{projectPath}} && docker build -t mai-deploy:latest . 2>&1" },
                label: "Build Docker image",
                optional: true,
              },
              {
                action: "execute-terminal",
                params: { command: "docker run -d --name mai-deploy -p 3000:3000 mai-deploy:latest 2>&1" },
                label: "Run container",
                optional: true,
              },
            ],
          },
          {
            id: "pm2",
            condition: "PM2 process manager",
            actions: [
              {
                action: "execute-terminal",
                params: { command: "cd {{projectPath}} && pm2 restart all 2>&1 || pm2 start npm --name mai-deploy -- start 2>&1" },
                label: "PM2 start/restart",
                optional: true,
              },
            ],
          },
          {
            id: "systemd",
            condition: "Systemd service",
            actions: [
              {
                action: "execute-terminal",
                params: { command: "sudo systemctl restart mai-deploy 2>&1 || echo 'SERVICE_NOT_FOUND'" },
                label: "Restart systemd service",
                optional: true,
              },
            ],
          },
          {
            id: "manual",
            condition: "Manual deployment (just build, user handles the rest)",
            actions: [],
          },
        ],
        fallbackBranch: "manual",
      },
    },
    {
      id: "dep_verify",
      kind: "actions",
      name: "Post-deploy Verification",
      description: "Check that the deployment is healthy",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || echo 'UNREACHABLE'" },
          label: "Health check",
          optional: true,
        },
        {
          action: "get-process-list",
          params: {},
          label: "Check running processes",
          optional: true,
        },
      ],
    },
    {
      id: "dep_report",
      kind: "brain",
      name: "Deployment Summary",
      prompt: `Summarize the deployment result. The project at {{projectPath}} was just deployed.

Deploy plan:
{{deployPlan}}

Include: what was deployed, how to access it, and any issues found.
Keep it concise (2-4 sentences).`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SCAN / DIAGNOSTICS WORKFLOW
// Triggered when user asks to check system health, run diagnostics, or scan.
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
        {
          action: "execute-terminal",
          params: { command: "df -h / 2>/dev/null && echo '---' && free -h 2>/dev/null || echo 'N/A'" },
          label: "Disk and memory usage",
        },
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
// Triggered when user asks to clean up, organize, or sort files.
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
      description: "List current file structure",
      actions: [
        { action: "list-files-detailed", params: { path: "{{targetDir}}" }, label: "List files" },
      ],
    },
    {
      id: "org_plan",
      kind: "brain",
      name: "Create Organization Plan",
      description: "Brain analyzes files and proposes an organization scheme",
      prompt: `I need to organize the files in {{targetDir}}. Based on the file listing above, propose:
1. What categories/groupings make sense (by type, date, project, etc.)
2. What directories to create
3. What files to move where

Output ONLY the exact mv commands, one per line. Example:
mkdir -p archives
mv old-file.txt archives/

Do NOT include files that are already well-organized.`,
      saveAs: "orgCommands",
    },
    {
      id: "org_confirm",
      kind: "decision",
      name: "Review Changes",
      description: "Show the plan to the user and confirm before executing",
      decision: {
        id: "org_confirm_decision",
        question: `Here's the organization plan I came up with. Should I execute these changes?

Commands to run:
{{orgCommands}}`,
        branches: [
          {
            id: "execute",
            condition: "Execute the organization plan",
            actions: [
              {
                action: "execute-terminal",
                params: { command: "cd {{targetDir}} && {{orgCommands}}" },
                label: "Execute organization",
              },
            ],
          },
          {
            id: "skip",
            condition: "Cancel, don't change anything",
            actions: [],
          },
        ],
        fallbackBranch: "skip",
      },
    },
    {
      id: "org_verify",
      kind: "actions",
      name: "Verify Result",
      description: "Show the new directory structure",
      actions: [
        { action: "list-files-detailed", params: { path: "{{targetDir}}" }, label: "Verify new structure" },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CYBER SECURITY SCAN WORKFLOW
// Triggered when user asks for a security scan or vulnerability check.
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
    { name: "scanTarget", description: "Target path or project to scan", required: true, default: ".", prompt: 'What should I scan? (path or "." for current directory)' },
  ],
  steps: [
    {
      id: "sec_deps",
      kind: "parallel",
      name: "Dependency & Config Scan",
      description: "Check for known vulnerabilities in dependencies and config issues",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "cd {{scanTarget}} && npm audit --json 2>/dev/null | head -100 || echo 'NO_PACKAGE_JSON'" },
          label: "NPM audit",
          optional: true,
        },
        {
          action: "execute-terminal",
          params: { command: "cd {{scanTarget}} && find . -name '.env' -o -name '*.pem' -o -name '*.key' -o -name 'credentials*' -o -name 'id_rsa*' 2>/dev/null | head -20 || echo 'CLEAN'" },
          label: "Sensitive file check",
        },
        {
          action: "execute-terminal",
          params: { command: "cd {{scanTarget}} && find . -name 'package.json' -exec grep -l 'http://' {} \; 2>/dev/null | head -10 || echo 'NO_HTTP_DEPS'" },
          label: "Insecure dependency check",
          optional: true,
        },
      ],
    },
    {
      id: "sec_network",
      kind: "actions",
      name: "Network Exposure Check",
      description: "Check for open ports and network exposure",
      actions: [
        {
          action: "execute-terminal",
          params: { command: "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo 'NO_NETWORK_TOOLS'" },
          label: "Open ports check",
          optional: true,
        },
      ],
    },
    {
      id: "sec_report",
      kind: "brain",
      name: "Security Assessment",
      prompt: `Based on the security scan results for {{scanTarget}}, provide a security assessment:
- Critical/High vulnerabilities found
- Exposed sensitive files
- Network exposure risks
- Recommended immediate actions

Rate overall security as: CLEAN / LOW RISK / MEDIUM RISK / HIGH RISK / CRITICAL
Be specific about any issues found.`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESEARCH WORKFLOW
// Triggered when user asks for deep research on a topic.
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
      description: "Brain creates targeted search queries based on the user's topic",
      prompt: `The user wants to research a topic. Based on their message, generate 2-3 specific, targeted search queries that would find the most relevant and up-to-date information. Output ONLY the queries, one per line, without numbering or quotes.`,
      saveAs: "searchQueries",
    },
    {
      id: "res_search",
      kind: "brain",
      name: "Execute Searches",
      description: "Perform web searches to gather information",
      prompt: `I need to research the following. Run web searches for each of these queries and compile the findings:

{{searchQueries}}

Use the web-search tool for each query. Compile key findings, facts, and source URLs.`,
      saveAs: "searchResults",
    },
    {
      id: "res_synthesize",
      kind: "brain",
      name: "Synthesize Findings",
      prompt: `Based on the research results, synthesize a comprehensive but concise analysis.

Search results:
{{searchResults}}

Structure your response as:
1. Executive Summary (2-3 sentences)
2. Key Findings (bullet points with specifics)
3. Sources / References
4. Recommended Next Steps (if applicable)`,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT ALL BUILTIN TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

export function getBuiltinTemplates(): WorkflowTemplate[] {
  return [
    projectBuild,
    deploy,
    systemScan,
    fileOrganize,
    cyberScan,
    research,
  ];
}
