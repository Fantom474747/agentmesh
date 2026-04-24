# AgentMesh — Claude Code MCP config

Copy `.mcp.json` from this folder to your **project root** (the folder you open in Claude Code), then replace `/REPLACE/WITH/ABSOLUTE/PATH/TO/agentmesh` with the absolute path to wherever you cloned AgentMesh. Restart Claude Code — the `agentmesh_*` tools will appear automatically.

If you changed the default port (4321) in AgentMesh Settings, set `AGENTMESH_URL=http://127.0.0.1:YOUR_PORT` in the environment block of your `.mcp.json` or in a `.env` file in the same directory.

**Example on Windows:**
```json
"args": ["C:/Users/you/repos/agentmesh/scripts/agentmesh-mcp.mjs"]
```

**Example on macOS/Linux:**
```json
"args": ["/home/you/repos/agentmesh/scripts/agentmesh-mcp.mjs"]
```
