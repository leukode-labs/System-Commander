# System Commander Cloud Relay

This service is the hosted bridge between remote MCP clients and computers running
the System Commander Remote Agent.

## Architecture

AI client
  -> Streamable HTTP /mcp/<deviceId>
  -> System Commander Cloud Relay
  -> WebSocket /device/connect
  -> System Commander Remote Agent
  -> local MCP server

## Requirements

- Node.js 18+
- A Convex deployment
- HTTPS/WSS in production

## Local setup

Create `.env.local`:

```
CONVEX_URL=https://your-deployment.convex.cloud
PORT=3900
```
Install and build:

```
npm install
npm run build
npm start
```

Health check:

```
GET /health
```

## Provision a device

For the current operator provisioning flow:

```
node scripts/bootstrap-account.mjs customer@example.com CUSTOMER-PC
```

The command creates the account/device records and prints the device token once.

Give the customer:

1. the relay URL2. the device token
3. their device ID

They then run:

```
npx @leukode-labs/system-commander@latest remote \
  --relay https://your-relay.example.com \
  --device-id CUSTOMER-PC \
  --token YOUR_DEVICE_TOKEN
```

## Remote MCP endpoint

Configure the AI client with:

```
https://your-relay.example.com/mcp/CUSTOMER-PC
```

and:

```
Authorization: Bearer YOUR_DEVICE_TOKEN
```

The endpoint uses MCP Streamable HTTP in stateless JSON-response mode.
## Production checklist

- Put the relay behind HTTPS.
- Use WSS for device connections.
- Keep Convex credentials private.
- Never expose device tokens in logs.
- Add rate limits before public launch.
- Add authenticated account/dashboard flows before self-service customer
  provisioning.
- Put billing/plan enforcement in the relay or account layer, not on the device.

## Data model

Convex stores accounts and devices. Device tokens are stored as SHA-256 hashes,
not raw tokens. The relay keeps active WebSocket connections in memory and uses
device IDs to route requests.

## Current product boundary

The remote execution path is fully independent of the original Desktop Commander
remote service. The local MCP tool names and compatibility-oriented internal
identifiers remain unchanged so existing integrations are less likely to break.
