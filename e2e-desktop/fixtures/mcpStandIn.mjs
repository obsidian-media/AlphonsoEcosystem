// A tiny MCP server for the desktop check (2026-10-30): the 2026-07-28 protocol (no handshake;
// every request carries its version), on a free local port, with two tools. It records every
// tool call so a spec can count them. Nothing here talks to a real service.
import http from 'node:http';

const TOOLS = [
  {
    name: 'list_products',
    title: 'List products',
    description: 'Lists the products in the shop with their prices.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_price',
    title: 'Update price',
    description: 'Sets the price of one product.',
    inputSchema: {
      type: 'object',
      properties: { product: { type: 'string' }, price: { type: 'number' } },
      required: ['product', 'price'],
    },
  },
];

export async function startMcpStandIn() {
  const calls = [];
  const versions = [];
  const products = { 'Blue mug': 16, 'Red mug': 14, 'Green bowl': 22 };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const reply = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.method !== 'POST') return reply(405, { error: 'POST only' });
      let message;
      try { message = JSON.parse(body); } catch { return reply(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      const version = req.headers['mcp-protocol-version'];
      versions.push(version);
      if (version !== '2026-07-28') {
        return reply(400, { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32022, message: 'Unsupported protocol version', data: { supported: ['2026-07-28'] } } });
      }
      if (message.method === 'tools/list') return reply(200, { jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } });
      if (message.method === 'tools/call') {
        const { name, arguments: args = {} } = message.params || {};
        calls.push({ name, args });
        if (name === 'list_products') {
          const text = Object.entries(products).map(([p, price]) => `${p}: $${price}`).join('\n');
          return reply(200, { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `${Object.keys(products).length} products.\n${text}` }] } });
        }
        if (name === 'update_price') {
          if (!(args.product in products)) {
            return reply(200, { jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: `No product called ${args.product}.` }] } });
          }
          products[args.product] = args.price;
          return reply(200, { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `${args.product} now costs $${args.price}.` }] } });
        }
        return reply(200, { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: `Unknown tool ${name}` } });
      }
      return reply(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    versions,
    products,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
