#!/usr/bin/env node

// Wrapper for jarvis CLI
const path = require("path");
const fs = require("fs");

const packageDir = path.resolve(__dirname, "..");
const distDir = path.resolve(packageDir, "dist");

// Make sure dist exists (built)
if (!fs.existsSync(distDir)) {
  console.error("Error: Project not built. Run 'npm run build' first.");
  process.exit(1);
}

const cliPath = path.resolve(distDir, "cli.js");

// Import and run the CLI
require(cliPath);
