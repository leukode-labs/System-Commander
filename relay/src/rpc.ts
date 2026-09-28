/**
 * RPC frame shape carried inside the register/registered/auth_error
 * envelope above, once a device is connected. This is a thin envelope
 * around a raw JSON-RPC 2.0 message (what MCP itself uses) so the relay
 * never needs to understand MCP semantics - it only routes by requestId.
 */

export interface RpcForward {
  type: 'rpc';
  requestId: string; // correlates the HTTP call waiting on the client side
  payload: unknown;  // the raw JSON-RPC request/response body
}

export function isRpcForward(msg: any): msg is RpcForward {
  return msg && msg.type === 'rpc' && typeof msg.requestId === 'string';
}
