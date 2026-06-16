/**
 * Review Buddy MCP server — exposes the single `submit_review` tool.
 *
 * The tool's inputSchema IS schemas/review.schema.json, so Claude Code
 * validates the agent's review (and makes the model retry on mismatch) BEFORE
 * the PreToolUse hook ever runs. The hook (src/cli/index.ts `open-review`)
 * does the real work — capture diff, render UI, block for the human. By the
 * time this handler runs, the human has already seen the review, so it just
 * acks back to the agent (Phase 1, one-way).
 *
 * Registered with Claude Code as MCP server "review-buddy", which makes the
 * tool name `mcp__review-buddy__submit_review` — the hook matcher.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Load the JSON Schema as the single source of truth; strip JSON-Schema meta
// keywords MCP inputSchema doesn't need.
const schemaPath = join(import.meta.dir, "..", "..", "schemas", "review.schema.json");
const { $schema, $id, title, ...inputSchema } = JSON.parse(
  readFileSync(schemaPath, "utf8"),
);
void $schema;
void $id;
void title;

const TOOL_DESCRIPTION = [
  "Submit a structured narrative code review of the current PR / working-tree diff.",
  "Provide a Prologue (why / what / key changes / review focus) and ordered, risk-rated",
  "Chapters grouped by THEME (not by file). For each chapter reference the files and the",
  "hunk ANCHORS (old_start / new_start from the @@ headers) that belong to it — do NOT copy",
  "diff line content; the tool attaches the authoritative lines from git. Omit a file's",
  "`hunks` to mean 'the whole file belongs to this chapter'. Calling this opens the review",
  "in the reviewer's browser.",
].join(" ");

const server = new Server(
  { name: "review-buddy", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "submit_review", description: TOOL_DESCRIPTION, inputSchema }],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "submit_review") {
    return {
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: "text",
        text: "Review displayed to the reviewer in the browser. Awaiting human review.",
      },
    ],
  };
});

await server.connect(new StdioServerTransport());
console.error("[review-buddy] MCP server ready (tool: submit_review).");
