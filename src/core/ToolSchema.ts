// ─── M.A.I. Native Tool-Call Schema ──────────────────────────────────────────
// Generates OpenAI-compatible function/tool schemas from the M.A.I. action type
// system. These schemas are passed via the `tools` parameter to providers that
// support native function calling, replacing the fragile markdown ```action blocks.
//
// The schemas are defined statically for the 20 most-used actions and cached
// based on catalog.md modification time. When catalog.md changes, schemas are
// revalidated but the definitions remain stable (they map 1:1 to catalog.md).

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
];

// ─── Cache ────────────────────────────────────────────────────────────────────
// Avoids redundant work on every call. Only regenerated if catalog.md changes.

let cachedSchemas: OpenAIToolSchema[] | null = null;
let cachedCatalogMtime: number | null = null;

/**
 * Get OpenAI-compatible tool schemas for the 20 most-used M.A.I. actions.
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
