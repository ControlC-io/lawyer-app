import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources.js';

function createServer(): McpServer {
  const server = new McpServer(
    { name: 'floowly', version: '1.0.0' },
    { capabilities: { logging: {} } },
  );
  registerAllTools(server);
  registerAllResources(server);
  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/mcp', async (req, res) => {
  res.writeHead(405).end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
});

app.delete('/mcp', async (req, res) => {
  res.writeHead(405).end(JSON.stringify({ error: 'Method not allowed.' }));
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'floowly-mcp' });
});

app.listen(config.port, () => {
  console.log(`Floowly MCP server listening on port ${config.port}`);
  console.log(`API target: ${config.floowlyApiUrl}`);
});
