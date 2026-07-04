## Plan: AI Harness with Ollama + Obsidian

TL;DR - Build a Node.js/TypeScript standalone harness that supports external skill scripts, plugs into Ollama for model calls, and optionally integrates with Obsidian vaults via filesystem access. Start with a CLI and reusable library core, then add Obsidian note ingestion/creation support.

**Steps**
1. Initialize the project structure and toolchain.
   - Create `package.json`, `tsconfig.json`, `.gitignore`, and basic `README.md` expansion.
   - Use Node.js/TypeScript to align with Obsidian ecosystem and CLI tooling.
2. Define the core harness architecture.
   - Implement a `ModelAdapter` interface for pluggable model integrations.
   - Implement a `SkillRunner` that can load and execute external skill scripts or config-driven actions.
   - Implement an `ObsidianConnector` that can optionally read vault notes and create/edit notes on disk.
3. Implement Ollama support.
   - Add `OllamaAdapter` to call the Ollama local model service using CLI or HTTP.
   - Provide configuration fallback if Ollama is unavailable, with clear error messages.
4. Add CLI entrypoints and configuration.
   - Build `src/cli.ts` to accept commands like `run-skill`, `inspect-vault`, `create-note`, and `init-skill`.
   - Support config via a local `harness.config.json` plus command-line overrides.
5. Define external skill format and loader.
   - Support YAML/JSON skill definitions that describe a prompt, inputs, outputs, and runtime script.
   - Allow skill scripts to be plain Node.js executables or shell scripts invoked by the harness.
6. Add Obsidian integration.
   - Allow an optional vault path configuration.
   - Implement note ingestion: scan markdown files, parse frontmatter/metadata, and produce in-memory context.
   - Implement note creation: generate or update markdown files from harness actions.
7. Add sample skills and verification artifacts.
   - Add sample Obsidian-aware skill definitions and a simple Ollama prompt skill.
   - Add a smoke test or usage example in `README.md`.

**Verification**
1. Confirm project scaffolding installs with `npm install` and builds with `npm run build`.
2. Run a sample skill against Ollama and verify the harness calls the model adapter.
3. Run vault ingestion on a sample Obsidian folder and verify notes are read and a new note can be created.
4. Validate CLI commands like `node dist/cli.js run-skill --skill sample` or equivalent.

**Decisions**
- Use Node.js/TypeScript because it fits Obsidian integration patterns and a CLI/library approach.
- Start with file-based Obsidian access rather than an Obsidian plugin UI.
- Support external scripts/config-driven skills first, leaving richer plugin loading for later.

**Further Considerations**
1. Should the initial harness support both Ollama CLI and Ollama HTTP endpoints, or only one method? Recommended: both, with priority for local CLI if available.
2. Should skill definitions include a standard manifest format for inputs/outputs or remain minimal at first? Recommended: a minimal YAML schema with room to extend.
3. Do you want an early sample Obsidian skill that turns a note prompt into a new note, or just generic note ingestion? Recommended: include both ingestion and creation samples.