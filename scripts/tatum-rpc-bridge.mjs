// Loopback-only bridge for Sui CLI, which has no x-api-key header flag.
// All upstream requests go to the authenticated Tatum Mainnet endpoint.
import { config } from 'dotenv';
import http from 'node:http';
config({ path: '.env.local', quiet: true }); config({ quiet: true });
if (!process.env.TATUM_API_KEY) throw new Error('Configure TATUM_API_KEY in .env.local first.');
const port = 3987;
http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/') { res.writeHead(404).end(); return; }
  try {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 1_000_000) { res.writeHead(413).end(); return; } }
    const payload = JSON.parse(raw);
    const upstream = await fetch('https://sui-mainnet.gateway.tatum.io', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.TATUM_API_KEY }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' }).end(await upstream.text());
  } catch { res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Tatum Mainnet gateway request failed.' } })); }
}).listen(port, '127.0.0.1', () => console.log('Tatum Mainnet CLI bridge: http://127.0.0.1:' + port + ' (x-api-key stays server-side)'));
