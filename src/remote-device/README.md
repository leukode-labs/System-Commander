# System Commander Remote Agent

The System Commander Remote Agent keeps the existing local MCP engine on the user's
computer and connects it to a System Commander Cloud relay.

## Architecture

AI client -> System Commander Cloud -> WebSocket -> Remote Agent -> local MCP server

The AI client never receives direct filesystem credentials. Commands are executed by
the local System Commander process under the user's operating-system permissions.

## Start the agent

Install the package, then run:

```bash
npx @leukode-labs/system-commander@latest remote \
  --relay https://your-relay.example.com \
  --token YOUR_DEVICE_TOKEN
```

The agent can also read:

- SYSTEM_COMMANDER_RELAY_URL
- SYSTEM_COMMANDER_DEVICE_ID
- SYSTEM_COMMANDER_DEVICE_TOKEN
The token is persisted locally with restrictive file permissions unless
`--no-persist-session` is used.

## MCP connection

The relay exposes one MCP endpoint per device:

```
POST https://your-relay.example.com/mcp/<deviceId>
Authorization: Bearer <device-token>
```

Use that URL and bearer token when configuring an MCP client such as ChatGPT or
Claude web.

## Device identity

The device ID defaults to the computer hostname. Override it with `--device-id`
or SYSTEM_COMMANDER_DEVICE_ID.

## Troubleshooting

If the agent says the device token is invalid, issue a new token from the System
Commander device provisioning flow.

If the relay is offline, confirm the relay URL and that the customer's device can
make outbound HTTPS/WebSocket connections.
If the local engine fails, run:

```bash
npx @leukode-labs/system-commander@latest --debug
```

or start the remote agent with `--debug`.

## Security notes

Device tokens are stored as SHA-256 hashes by the relay backend. The raw token is
only shown at provisioning time and is stored locally on the customer's machine so
the agent can authenticate its WebSocket connection.

The relay should always run behind HTTPS/WSS in production. Put it behind a reverse
proxy with automatic TLS and firewall access to the MCP/WS ports only.

The local process remains the authority for filesystem and process permissions.
