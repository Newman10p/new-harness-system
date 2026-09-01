// ─── M.A.I. Native Tool-Call Schema ──────────────────────────────────────────
// Generates OpenAI-compatible function/tool schemas from the M.A.I. action type
// system. These schemas are passed via the `tools` parameter to providers that
// support native function calling, replacing the fragile markdown ```action blocks.
//
// All 57 primitives have schemas defined here. Schemas are cached based
// on catalog.md modification time.

import fs from "node:fs";
import { TOOLS_CATALOG_PATH } from "./constants.js";

// ─── OpenAI Tool Schema Types ────────────────────────────────────────────────

export interface ToolFunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface OpenAIToolSchema {
  type: "function";
  "function": ToolFunctionSchema;
}

// ─── Static Schema Definitions ──────────────────────────────────────────────
// Each entry maps directly to an action documented in agent/tools/catalog.md.
// Properties use JSON Schema format. `required` lists only mandatory params.

const TOOL_DEFINITIONS: ToolFunctionSchema[] = [
  // ── File System ──────────────────────────────────────────────────────────
  {
    name: "read-file",
    description: "Read the contents of a file at the given path.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path to read.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write-file",
    description:
      "Write content to a file. Creates parent directories automatically if they don't exist. Overwrites existing files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Target file path to write to.",
        },
        content: {
          type: "string",
          description: "The content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "append-file",
    description: "Append content to a file. Creates the file if it doesn't exist.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Target file path to append to.",
        },
        content: {
          type: "string",
          description: "The content to append.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list-directory",
    description: "List files and directories at the given path. Defaults to current directory if no path provided.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (defaults to '.').",
        },
      },
    },
  },

  // ── Terminal ──────────────────────────────────────────────────────────────
  {
    name: "execute-terminal",
    description:
      "Execute a shell command with sandboxing. Simple commands (no pipes/redirects) run via spawn; complex commands fall back to exec with danger-pattern blocking. Requires approval for most commands.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000).",
        },
      },
      required: ["command"],
    },
  },

  // ── Monitoring ─────────────────────────────────────────────────────────────
  {
    name: "get-system-info",
    description: "Get hostname, platform, CPU, and memory information for the current system.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get-process-list",
    description: "Get the top 30 processes sorted by memory usage.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "screenshot-capture",
    description: "Capture a screenshot of the current screen. Returns the file path of the saved screenshot.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional path to save the screenshot file.",
        },
        display: {
          type: "number",
          description: "Display number for multi-monitor setups.",
        },
      },
    },
  },

  // ── Network ──────────────────────────────────────────────────────────────
  {
    name: "open-url",
    description: "Open a URL in the default browser on the host system.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to open.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "http-request",
    description:
      "Make an HTTP request to a URL. Supports all HTTP methods, custom headers, and request bodies. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to request.",
        },
        method: {
          type: "string",
          description: "HTTP method (default: 'GET').",
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        },
        headers: {
          type: "object",
          description: "Request headers as key-value pairs.",
        },
        body: {
          type: "object",
          description: "Request body (for POST/PUT/PATCH).",
        },
      },
      required: ["url"],
    },
  },

  // ── Web Search & Scraping ─────────────────────────────────────────────────
  {
    name: "web-search",
    description:
      "Search the web using a multi-backend search engine. Returns ranked results with titles, URLs, and snippets. Use this for any real-time information from the internet.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query — what you want to find on the internet.",
        },
        max_results: {
          type: "number",
          description: "Maximum results to return (default: 8, max: 20).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web-scrape",
    description:
      "Fetch a web page and extract its readable text content. Strips HTML, scripts, styles, and navigation noise. Returns clean text.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The web page URL to fetch and read.",
        },
        max_chars: {
          type: "number",
          description: "Maximum characters to return (default: 15000, max: 50000).",
        },
      },
      required: ["url"],
    },
  },

  // ── Search Files ──────────────────────────────────────────────────────────
  {
    name: "search-files",
    description: "Search files by content pattern using ripgrep or equivalent.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Content pattern to search for in files.",
        },
        directory: {
          type: "string",
          description: "Directory to search in (defaults to current).",
        },
        file_pattern: {
          type: "string",
          description: "Glob pattern to filter files (e.g. '*.ts').",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (default: 20).",
        },
      },
      required: ["query"],
    },
  },

  // ── Clipboard ──────────────────────────────────────────────────────────────
  {
    name: "clipboard-read",
    description: "Read the current system clipboard content. Returns clipboard text.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "clipboard-write",
    description: "Write text to the system clipboard.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text content to write to the clipboard.",
        },
      },
      required: ["text"],
    },
  },

  // ── HUD ───────────────────────────────────────────────────────────────────
  {
    name: "emit-hud-update",
    description:
      "Send a structured update to the HUD display. The channel determines which UI component receives the update.",
    parameters: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description:
            "HUD channel: jarvis_speech, activity_log, system_metrics, threat_level, reactor_pulse.",
        },
        payload: {
          type: "object",
          description:
            "Payload object whose shape depends on the channel type.",
        },
      },
      required: ["channel", "payload"],
    },
  },

  // ── Memory ────────────────────────────────────────────────────────────────
  {
    name: "remember",
    description:
      "Store a piece of information in long-term memory for later retrieval.",
    parameters: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description: "The information to remember.",
        },
        category: {
          type: "string",
          description:
            "Type of memory: preference, fact, pattern, instruction, relationship.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization and retrieval.",
        },
        confidence: {
          type: "number",
          description: "Confidence score 0-1 (default: 0.5).",
        },
      },
      required: ["fact"],
    },
  },
  {
    name: "recall",
    description: "Retrieve relevant memories matching a query from long-term memory.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for memory retrieval.",
        },
        max_results: {
          type: "number",
          description: "Maximum results to return (default: 5).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by specific tags.",
        },
      },
      required: ["query"],
    },
  },

  // ── Voice ──────────────────────────────────────────────────────────────────
  {
    name: "voice-call",
    description: "Manage voice call state for the HUD (start, stop, check status).",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Voice call operation.",
          enum: ["start", "stop", "status"],
        },
      },
      required: ["operation"],
    },
  },

  // ── Self-Improvement ──────────────────────────────────────────────────────
  {
    name: "self-diagnose",
    description:
      "Run a self-diagnostic check on all M.A.I. subsystems (LLM, policy, actions, memory, proactive engine).",
    parameters: { type: "object", properties: {} },
  },

  // ── Sandbox ──────────────────────────────────────────────────────────────
  {
    name: "sandbox-execute",
    description:
      "Execute a command in an isolated sandbox environment. Supports session management (create/destroy), command execution with streaming output, and resource limits. Auto-approved — no confirmation needed.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation: create-session, execute, list-sessions, destroy-session, session-info, replay, update-config, stats.",
          enum: ["create-session", "execute", "list-sessions", "destroy-session", "session-info", "replay", "update-config", "stats"],
        },
        session_id: {
          type: "string",
          description: "Session ID (required for execute, destroy, info, replay, update-config).",
        },
        command: {
          type: "string",
          description: "Shell command to execute (required for execute operation).",
        },
        name: {
          type: "string",
          description: "Session name (for create-session).",
        },
        tier: {
          type: "string",
          description: "Isolation tier: native (lightest), process, docker, firejail (strongest).",
          enum: ["native", "process", "docker", "firejail"],
        },
        timeout: {
          type: "number",
          description: "Command timeout in ms (default: 30000).",
        },
        memory: {
          type: "number",
          description: "Memory limit in MB (default: 256).",
        },
        network: {
          type: "boolean",
          description: "Allow network access in the session (default: false).",
        },
      },
      required: ["operation"],
    },
  },

  // ── Sandbox Promotion ──────────────────────────────────────────────────
  {
    name: "sandbox-promote",
    description:
      "Promote sandbox files to a real target directory on the host filesystem. After working in the sandbox and verifying results, call this to present the user with a file-level diff summary and ask for one-time permission to apply changes. The user sees exactly which files will be created/modified and their sizes before approving. This is the ONLY way sandbox output reaches the real filesystem.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The sandbox session ID whose files to promote.",
        },
        target_dir: {
          type: "string",
          description: "Absolute path to the real target directory on the host where files should be applied.",
        },
        reason: {
          type: "string",
          description: "Brief explanation to the user about why this promotion is needed and what was verified in the sandbox.",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Optional: specific files to promote (relative to sandbox dir). If omitted, all changed files are promoted.",
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description: "Optional: glob patterns to exclude (default: node_modules, .git, *.tmp, *.log).",
        },
      },
      required: ["session_id", "target_dir"],
    },
  },

  // ── Device Control ──────────────────────────────────────────────────────
  {
    name: "device-control",
    description:
      "Discover, list, and control devices (display brightness, audio volume, smart home, USB, network services). Auto-approved — no confirmation needed.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation: discover, list, control, get-state, search, device-info, stats.",
          enum: ["discover", "list", "control", "get-state", "search", "device-info", "stats"],
        },
        device_id: {
          type: "string",
          description: "Device ID (required for control, get-state, device-info).",
        },
        capability: {
          type: "string",
          description: "Capability name (e.g., brightness, volume, muted). Required for control and get-state.",
        },
        ctrl_action: {
          type: "string",
          description: "Control action: set, get, toggle, trigger.",
          enum: ["set", "get", "toggle", "trigger"],
        },
        value: {
          description: "Value to set (number for slider, boolean for toggle, string for text).",
        },
        protocol: {
          type: "string",
          description: "Filter devices by protocol (for list operation).",
        },
        query: {
          type: "string",
          description: "Search query (for search operation).",
        },
      },
      required: ["operation"],
    },
  },

  // ── UI Adaptation ────────────────────────────────────────────────────────
  {
    name: "ui-adapt",
    description:
      "Self-adapt the web UI in real-time. Send CSS patches, theme changes, layout directives, widget injections, or safe DOM scripts. Auto-approved — no confirmation needed. The UI client applies patches instantly via WebSocket.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Patch type: css (inject styles), theme (CSS variables), layout (show/hide/reorder), widget (inject HTML), script (safe DOM manipulation).",
          enum: ["css", "theme", "layout", "widget", "script"],
        },
        css: {
          type: "string",
          description: "CSS rules to inject. Optionally scoped by selector.",
        },
        selector: {
          type: "string",
          description: "CSS selector to scope the patch (e.g., '.chat-container' or '#hud-panel').",
        },
        variables: {
          type: "object",
          description: "CSS custom properties to set (e.g., { '--mai-primary': '#00ff88', '--mai-bg': '#0a0a0f' }).",
        },
        html: {
          type: "string",
          description: "HTML to inject into a widget slot.",
        },
        js: {
          type: "string",
          description: "Safe DOM script (no eval, no fetch, no external URLs). For animations, toggles, transitions.",
        },
        id: {
          type: "string",
          description: "Unique patch ID for tracking and potential rollback.",
        },
        description: {
          type: "string",
          description: "Human-readable description of what this patch does.",
        },
      },
      required: ["type"],
    },
  },
// ── Additional schemas to be appended to TOOL_DEFINITIONS (before the closing ]) ──
// Generated to complete all 57 primitives with native tool schemas.

  // ── Config & Settings ─────────────────────────────────────────────────
  {
    name: "adaptive-config",
    description: "Modify M.A.I. runtime configuration (provider priority, loop limit, tokens, timeout) and persist to state/runtime-config.json. Sensitive changes require approval.",
    parameters: {
      type: "object",
      properties: {
        change: { type: "string", description: "Config key to change: provider_priority, metrics_interval, max_tokens, timeout, loop_limit, default_model" },
        value: { description: "New value for the config key (type depends on key)" },
        reason: { type: "string", description: "Human-readable justification for the change" },
      },
      required: ["change", "value"],
    },
  },
  {
    name: "system-setting",
    description: "Control system settings: volume, brightness, WiFi, Bluetooth, DND, night-shift, resolution, sleep, lock, shutdown, restart across all platforms.",
    parameters: {
      type: "object",
      properties: {
        setting: { type: "string", description: "Setting to control: volume, brightness, wifi, bluetooth, dnd, night-shift, resolution, sleep, lock, shutdown, restart" },
        value: { description: "Value to set (number for volume/brightness, boolean string for toggles, string like '1920x1080' for resolution)" },
        display: { type: "number", description: "Display index for multi-monitor control" },
      },
      required: ["setting", "value"],
    },
  },

  // ── Vision ────────────────────────────────────────────────────────────────
  {
    name: "analyze-image",
    description: "Analyze an image using a Vision Language Model. Accepts a file path or base64-encoded image data. Returns a text description.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to an image on disk (mutually exclusive with image_base64)" },
        image_base64: { type: "string", description: "Base64-encoded image data (mutually exclusive with path)" },
        prompt: { type: "string", description: "Custom prompt to guide the vision analysis" },
      },
    },
  },

  // ── Browser Automation ────────────────────────────────────────────────────
  {
    name: "browser-control",
    description: "Multi-operation browser automation via Chrome DevTools Protocol: discover browsers, manage tabs, navigate, screenshot, extract content, evaluate JavaScript, and search.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", description: "Operation: discover, list-browsers, browser-info, stats, list-tabs, search-tabs, new-tab, close-tab, activate-tab, navigate, google-search, screenshot, get-content, extract-search-results, evaluate-js" },
        browser_id: { type: "string", description: "Target browser instance ID" },
        tab_id: { type: "string", description: "Target tab ID (required for most per-tab operations)" },
        query: { type: "string", description: "Search query (required for search-tabs, google-search)" },
        url: { type: "string", description: "URL to navigate to or open in new tab" },
        full_page: { type: "boolean", description: "Capture full-page screenshot (default: false)" },
        include_html: { type: "boolean", description: "Include raw HTML in get-content (default: false)" },
        expression: { type: "string", description: "JavaScript expression to evaluate (required for evaluate-js)" },
      },
      required: ["operation"],
    },
  },

  // ── Memory Management ────────────────────────────────────────────────────
  {
    name: "compact-memory",
    description: "Read a markdown file, send it to the LLM for factual summarization, and overwrite with the compressed version to save space.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the markdown file to compact" },
      },
      required: ["path"],
    },
  },
  {
    name: "forget",
    description: "Remove specific memories from long-term storage by keyword match, category filter, or clear all expired entries. Archived to forgotten.md.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword search to match against memory facts" },
        category: { type: "string", description: "Filter memories by category" },
        clear_expired: { type: "boolean", description: "If true, removes all expired memories" },
      },
    },
  },
  {
    name: "semantic-recall",
    description: "Search memory/context files using embedding-based cosine similarity with keyword fallback. Supports reindexing.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text (required unless reindex=true)" },
        force_keyword: { type: "boolean", description: "Skip embeddings, use keyword search only (default: false)" },
        reindex: { type: "boolean", description: "Rebuild the embedding index (default: false)" },
        top_k: { type: "number", description: "Number of results to return, 1-20 (default: 5)" },
      },
    },
  },
  {
    name: "search-conversations",
    description: "Full-text search through indexed conversation history with date range, intent, and keyword filters.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Full-text search query" },
        keyword: { description: "Keyword or array of keywords to search for" },
        limit: { type: "number", description: "Maximum number of results" },
        intent: { type: "string", description: "Filter by conversation intent" },
        from: { type: "string", description: "Start date for date range filter (ISO string)" },
        to: { type: "string", description: "End date for date range filter (ISO string)" },
      },
    },
  },

  // ── Window & Screen Management ──────────────────────────────────────────
  {
    name: "control-window",
    description: "Window management: move, resize, focus, minimize, maximize, close, list, and arrange windows via platform-specific commands.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", description: "Operation: move, resize, focus, minimize, maximize, close, list, arrange" },
        title: { type: "string", description: "Window title to identify the target (one of title or app required)" },
        app: { type: "string", description: "Application name to identify the target (one of title or app required)" },
        x: { type: "number", description: "X coordinate for move operation" },
        y: { type: "number", description: "Y coordinate for move operation" },
        width: { type: "number", description: "Width in pixels for resize operation" },
        height: { type: "number", description: "Height in pixels for resize operation" },
        layout: { type: "string", description: "Layout for arrange: tile, cascade, side-by-side (default: tile)" },
      },
      required: ["operation"],
    },
  },
  {
    name: "screen-arrange",
    description: "Desktop/workspace management: switch/create/remove virtual desktops, move windows between desktops, set wallpaper, and arrange multi-monitor displays.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", description: "Operation: switch-desktop, create-desktop, remove-desktop, list-desktops, move-to-desktop, set-wallpaper, mirror, extend" },
        index: { type: "number", description: "Desktop index for switch/remove/move-to operations" },
        direction: { type: "string", description: "Direction for switch-desktop: left or right" },
        app: { type: "string", description: "Application name for move-to-desktop" },
        wallpaperUrl: { type: "string", description: "Path/URL to wallpaper image (required for set-wallpaper)" },
        monitors: { type: "array", items: { type: "string" }, description: "Monitor identifiers for mirror/extend" },
      },
      required: ["operation"],
    },
  },

  // ── System Info (additional) ────────────────────────────────────────────
  {
    name: "get-gpu-info",
    description: "Retrieve GPU information (name, temperature, memory, utilization) via nvidia-smi, lspci, or /sys/class/drm depending on platform.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get-network-info",
    description: "Retrieve network interface information (address, netmask, MAC, CIDR, bandwidth stats) using OS module and /proc/net/dev.",
    parameters: { type: "object", properties: {} },
  },

  // ── Process Management ────────────────────────────────────────────────────
  {
    name: "manage-processes",
    description: "Kill or restart system processes by PID or name, with audit logging and platform-specific kill commands.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", description: "Operation: kill, restart" },
        pid: { type: "number", description: "Process ID to target" },
        name: { type: "string", description: "Process name to target (one of pid or name required)" },
      },
      required: ["operation"],
    },
  },

  // ── Input Injection ──────────────────────────────────────────────────────
  {
    name: "input-inject",
    description: "Keyboard and mouse input injection supporting key, text, mouse click, scroll, and shortcut types across macOS, Linux, and Windows. All injections are audit-logged.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", description: "Input type: key, text, mouse, scroll, shortcut" },
        key: { type: "string", description: "Key name (required when type=key)" },
        text: { type: "string", description: "Text string to type (required when type=text)" },
        mouseX: { type: "number", description: "X coordinate for mouse click (default: 0)" },
        mouseY: { type: "number", description: "Y coordinate for mouse click (default: 0)" },
        mouseButton: { type: "string", description: "Mouse button: left, right, middle (default: left)" },
        scrollX: { type: "number", description: "Horizontal scroll amount (default: 0)" },
        scrollY: { type: "number", description: "Vertical scroll amount (default: 0)" },
        shortcut: { type: "string", description: "Shortcut string e.g. ctrl+c, cmd+shift+3 (required when type=shortcut)" },
        delay: { type: "number", description: "Delay in ms between keystrokes for text injection (default: 0)" },
      },
      required: ["type"],
    },
  },

  // ── Application Control ──────────────────────────────────────────────────
  {
    name: "open-application",
    description: "Launch an application by name with safety checks that block destructive commands. Supports platform-specific launch methods.",
    parameters: {
      type: "object",
      properties: {
        app: { type: "string", description: "Application name or command to launch" },
        args: { type: "array", items: { type: "string" }, description: "Arguments to pass to the application" },
      },
      required: ["app"],
    },
  },
  {
    name: "media-control",
    description: "Media playback control: play, pause, toggle, next, previous, stop, volume up/down, mute, and info via platform-specific media APIs.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command: play, pause, toggle, next, previous, stop, volume-up, volume-down, mute, info" },
        app: { type: "string", description: "Target media application name (default: auto-detect)" },
        volume: { type: "number", description: "Volume level (used with volume commands)" },
      },
      required: ["command"],
    },
 },

  // ── Notifications ────────────────────────────────────────────────────────
  {
    name: "notification-send",
    description: "Send system notifications with support for urgency levels, sounds, timeout, and action buttons.",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string", description: "Notification body text" },
        title: { type: "string", description: "Notification title (default: M.A.I.)" },
        urgency: { type: "string", description: "Urgency: low, normal, critical (default: normal)" },
        timeout: { type: "number", description: "Display timeout in ms (default: 5000)" },
        sound: { type: "string", description: "Sound name to play" },
        actions: { type: "array", items: { type: "string" }, description: "Action button labels (Linux only)" },
      },
      required: ["body"],
    },
  },

  // ── Email ──────────────────────────────────────────────────────────
  {
    name: "email-access",
    description: "Multi-operation email management: list accounts/folders/messages, get/search messages, send, delete, mark-read, and get stats.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", description: "Operation: list-accounts, list-folders, list-messages, get-message, search, unread, send, delete, mark-read, stats" },
        account_id: { type: "string", description: "Target email account ID" },
        folder: { type: "string", description: "Folder name (default: INBOX)" },
        uid: { type: "string", description: "Message UID (required for get-message, delete, mark-read)" },
        query: { type: "string", description: "Search query string (required for search)" },
        limit: { type: "number", description: "Max messages to return (1-50, default varies by operation)" },
        offset: { type: "number", description: "Pagination offset (default: 0)" },
        to: { description: "Recipient(s) for send (string or string array)" },
        subject: { type: "string", description: "Email subject (required for send)" },
        body: { type: "string", description: "Email body text (required for send)" },
        html: { type: "string", description: "HTML body for send" },
      },
      required: ["operation"],
    },
  },

  // ── File Operations (additional) ────────────────────────────────────────────
  {
    name: "list-files-detailed",
    description: "Enhanced file listing returning name, path, size, modified date, type, and extension for each entry, sorted directories-first.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list (default: .)" },
        show_hidden: { type: "boolean", description: "Include dotfiles (default: false)" },
      },
    },
  },
  {
    name: "watch-directory",
    description: "Watch a directory for filesystem changes and log structured events to inbox.md via fs.watch.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to watch" },
      },
      required: ["path"],
    },
  },
  {
    name: "rollback",
    description: "Revert a file to a previous state using timestamped backups in state/backups/. Supports list, compare, dry-run, and actual restore.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "File path to restore (required for restore/compare/dry-run)" },
        backup_id: { type: "string", description: "Backup ID to restore, 'auto' for most recent, 'list' to list all, 'compare:<id>' to diff (default: auto)" },
        dry_run: { type: "boolean", description: "Preview restore without modifying files (default: false)" },
      },
    },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    name: "create-skill",
    description: "Generate a new YAML skill file from a natural language description, validating before writing to skills/<name>.yml.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name (no dots or slashes)" },
        template: { type: "string", description: "The prompt template for the skill" },
        description: { type: "string", description: "Human-readable description of the skill" },
        inputs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, prompt: { type: "string" }, "default": { type: "string" } } }, description: "Input variable definitions" },
        model: { type: "string", description: "Optional model override for the skill" },
      },
      required: ["name", "template"],
    },
  },
  {
    name: "run-skill",
    description: "Execute a YAML/JSON skill definition file, filling template variables and sending to the LLM for processing.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to the skill YAML or JSON file" },
        variables: { type: "object", description: "Variable values to substitute into the skill template" },
      },
      required: ["path"],
    },
  },
  {
    name: "optimize-skill",
    description: "Analyze an existing skill YAML file against execution history and suggest/improve it.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to the skill YAML to optimize" },
        based_on: { type: "string", description: "Analysis basis (default: execution_history)" },
      },
      required: ["path"],
    },
  },

  // ── Macros & Patterns ───────────────────────────────────────────────────
  {
    name: "run-macro",
    description: "Execute a named macro (user-defined multi-step workflow) by name or ID.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Macro name or trigger word" },
        id: { type: "string", description: "Macro ID" },
        variables: { type: "object", description: "Key-value pairs to substitute into macro steps" },
      },
    },
  },
  {
    name: "learn-pattern",
    description: "Detect and save a repeated workflow pattern to memory/patterns.md. Optionally auto-creates a corresponding YAML skill file.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Pattern name/identifier" },
        description: { type: "string", description: "Description of the pattern" },
        steps: { type: "array", items: { type: "string" }, description: "Non-empty array of workflow step descriptions" },
        trigger: { type: "string", description: "Description of what triggers this pattern" },
        auto_execute: { type: "boolean", description: "Also create a YAML skill file (default: false)" },
      },
      required: ["name", "description", "steps"],
    },
  },
  {
    name: "schedule-task",
    description: "Create a cron-like recurring task that repeatedly sends a command through the agent loop at a specified interval.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command string to execute on each interval" },
        name: { type: "string", description: "Human-readable task name (default: unnamed)" },
        interval_seconds: { type: "number", description: "Interval between runs in seconds (default: 300, minimum enforced by system)" },
      },
      required: ["command"],
    },
  },

  // ── Self-Improvement (additional) ────────────────────────────────────────
  {
    name: "dry-run",
    description: "Simulate an action without executing it, analyzing side effects and predicting success/failure.",
    parameters: {
      type: "object",
      properties: {
        targetAction: { type: "string", description: "The name of the action to simulate" },
        targetParams: { type: "object", description: "Parameters that would be passed to the target action" },
      },
      required: ["targetAction"],
    },
  },
  {
    name: "self-evaluate",
    description: "Analyze M.A.I.'s own performance from the audit log: success rate, failures, slow actions, policy violations. Stores an evaluation report.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", description: "Audit entries to analyze: last_10, last_50, last_100, all (default: last_50)" },
        focus: { type: "string", description: "Focus: all, failures, slow, policy, provider (default: all)" },
      },
    },
  },
  {
    name: "self-modify",
    description: "Modify M.A.I.'s own brain files (identity, memory, skills) with strict path whitelist, mandatory backups, and diff generation.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Relative file path to modify (must match allowed prefixes)" },
        operation: { type: "string", description: "Operation: append, replace, insert_before, insert_after, remove_section" },
        content: { type: "string", description: "Content to append/replace/insert" },
        section_marker: { type: "string", description: "Markdown heading text to locate a section (for insert_before, insert_after, remove_section)" },
      },
      required: ["target", "operation"],
    },
  },
  {
    name: "self-repair",
    description: "Attempt to fix common system issues: corrupted memory, unreachable LLM, disk full, large logs, missing directories. Automatic backup.",
    parameters: {
      type: "object",
      properties: {
        issue: { type: "string", description: "Specific issue to repair or 'all': corrupted_memory, llm_unreachable, disk_full, large_log, missing_dirs (default: all)" },
        auto: { type: "boolean", description: "Whether this was triggered automatically (default: false)" },
      },
    },
  },
  {
    name: "profile-update",
    description: "Update or add a field to the user profile in memory/user-profile.md, tracking confidence and observation history.",
    parameters: {
      type: "object",
      properties: {
        field: { type: "string", description: "Profile field name" },
        value: { type: "string", description: "Value to set for the field" },
        observation: { type: "string", description: "Description of what was observed that led to this update" },
      },
      required: ["field", "value", "observation"],
    },
  },
];

// ─── Cache ────────────────────────────────────────────────────────────────────
// Avoids redundant work on every call. Only regenerated if catalog.md changes.

let cachedSchemas: OpenAIToolSchema[] | null = null;
let cachedCatalogMtime: number | null = null;

/**
 * Get OpenAI-compatible tool schemas for all M.A.I. actions.
 * Cached based on catalog.md file modification time.
 *
 * @returns Array of OpenAI tool schemas in `{ type: "function", function: {...} }` format.
 */
export function getToolSchemas(): OpenAIToolSchema[] {
  // Check cache validity
  try {
    const stat = fs.statSync(TOOLS_CATALOG_PATH);
    const mtime = stat.mtimeMs;

    if (cachedSchemas !== null && cachedCatalogMtime === mtime) {
      return cachedSchemas;
    }

    // Cache miss or catalog changed — rebuild
    cachedCatalogMtime = mtime;
    cachedSchemas = TOOL_DEFINITIONS.map((def) => ({
      type: "function" as const,
      "function": def,
    }));

    return cachedSchemas;
  } catch {
    // catalog.md doesn't exist — return uncached schemas
    if (cachedSchemas === null) {
      cachedSchemas = TOOL_DEFINITIONS.map((def) => ({
        type: "function" as const,
        "function": def,
      }));
    }
    return cachedSchemas;
  }
}

/**
 * Get the set of action names that have native tool schemas.
 * Useful for determining if a tool_call from the LLM refers to a known action.
 */
export function getToolSchemaNames(): Set<string> {
  return new Set(TOOL_DEFINITIONS.map((d) => d.name));
}

/**
 * Force-invalidate the schema cache. Call this if catalog.md is modified
 * programmatically.
 */
export function invalidateSchemaCache(): void {
  cachedSchemas = null;
  cachedCatalogMtime = null;
}
