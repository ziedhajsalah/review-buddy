/**
 * Standalone-mode flag parsing — its own tiny module so the MCP server can
 * decide the mode at startup without loading the standalone handler (and the
 * whole review-session stack behind it) in the default Claude Code mode.
 *
 * The mode is a CLI flag on the server command — deliberately NOT an env var:
 * env is ambient, and a user who exports it globally (e.g. for Cursor) would
 * leak it into the Claude Code plugin's MCP server, where the hook has ALREADY
 * served the review — the handler would open it a second time. A flag lives in
 * the MCP registration itself, so each harness's config chooses its own mode.
 */
export type StandaloneMode = "off" | "detached" | "blocking";

export function standaloneMode(argv: string[] = process.argv): StandaloneMode {
  for (const arg of argv) {
    if (arg === "--standalone") return "detached";
    if (arg === "--standalone=blocking") return "blocking";
    if (arg.startsWith("--standalone=")) {
      // Fail loudly at startup: silently falling back to hook-ack mode would
      // make every standalone review report success without opening anything.
      throw new Error(`Unknown ${arg} (use --standalone or --standalone=blocking)`);
    }
  }
  return "off";
}
