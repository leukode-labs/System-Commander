import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import 'dotenv/config';
import { isRpcForward, RpcForward } from './rpc.js';

const RELAY_URL = process.env.RELAY_URL ?? 'ws://localhost:3900/device/connect';
const DEVICE_ID = process.env.DEVICE_ID ?? 'local-dev-device';
const DEVICE_TOKEN = process.env.DEVICE_TOKEN ?? 'dev-token-change-me';
// Path to your existing System Commander build (the actual stdio MCP server)
const MCP_ENTRY = process.env.MCP_ENTRY ?? '../dist/index.js';

console.log(`[agent] connecting to ${RELAY_URL} as device "${DEVICE_ID}"`);

const child = spawn(process.execPath, [MCP_ENTRY], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = createInterface({ input: child.stdout });

const ws = new WebSocket(RELAY_URL);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'register', deviceId: DEVICE_ID, token: DEVICE_TOKEN }));
});

ws.on('message', (raw) => {
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (msg.type === 'registered') {
    console.log(`[agent] registered with relay as "${msg.deviceId}" - online`);
    return;
  }
  if (msg.type === 'auth_error') {
    console.error(`[agent] relay rejected this device: ${msg.message}`);
    process.exit(1);
  }

  // An MCP JSON-RPC request came in from a client via the relay - forward
  // it to the local stdio server, tagging it so the response can be
  // routed back to the right relay requestId.
  if (isRpcForward(msg)) {
    pendingByStdioId.set((msg.payload as any).id, msg.requestId);
    child.stdin.write(JSON.stringify(msg.payload) + '\n');
  }
});

// Maps a JSON-RPC id (as seen by the local stdio server) back to the
// relay requestId that's waiting on it, since the stdio server itself
// knows nothing about relay envelopes.
const pendingByStdioId = new Map<string | number, string>();

rl.on('line', (line) => {
  if (!line.trim()) return;
  let payload: any;
  try {
    payload = JSON.parse(line);
  } catch {
    return; // not a JSON-RPC line (e.g. stray log output)
  }
  const requestId = pendingByStdioId.get(payload.id);
  if (!requestId) return;
  pendingByStdioId.delete(payload.id);

  const frame: RpcForward = { type: 'rpc', requestId, payload };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
});

ws.on('close', () => console.log('[agent] disconnected from relay'));
ws.on('error', (err) => console.error('[agent] relay connection error:', err.message));
child.on('exit', (code) => {
  console.error(`[agent] local MCP server exited (code ${code}) - stopping agent`);
  process.exit(code ?? 1);
});
