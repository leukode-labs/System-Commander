<div align="center">

<img src="./src/dashboard/assets/logo.png" alt="System Commander" width="150" />

# System Commander

### AI control for your computer.

**Files · Terminal · Processes · Code · Remote MCP**

[![MIT License](https://img.shields.io/badge/license-MIT-111827?style=flat-square)](./LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-7C3AED?style=flat-square)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-111827?style=flat-square)](https://nodejs.org/)

**By Leukode Labs**

</div>

---

System Commander gives AI assistants practical control over a computer through the **Model Context Protocol (MCP)**.

Instead of stopping at conversation, an MCP-compatible AI can work with files, run terminal commands, inspect and manage processes, edit code, and — through **System Commander Cloud** — reach a connected computer remotely.

> **Your AI talks. System Commander executes.**

## What it is

System Commander is built for the gap between *asking an AI to do something* and *having the computer actually do it*.

- **Filesystem** — read, write, search, move, and inspect files
- **Terminal** — execute commands with streaming output and background support
- **Processes** — inspect, interact with, and terminate running processes
- **Code editing** — surgical replacements and full-file edits
- **Documents** — support for PDF, DOCX, Excel, and common text workflows
- **Remote MCP** — connect AI clients to a computer through System Commander Cloud
- **Local authority** — commands ultimately execute on the connected machine under its OS permissions

## The architecture

```text
┌─────────────────────┐
│      AI Client      │
│ ChatGPT · Claude ·  │
│ other MCP clients   │
└──────────┬──────────┘
           │ MCP / HTTPS
           ▼
┌─────────────────────┐
│ System Commander    │
│       Cloud         │
│    Secure Relay     │
└──────────┬──────────┘
           │ WebSocket
           ▼
┌─────────────────────┐
│ Remote Agent        │
│ on your computer    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Local MCP Engine    │
│ files · shell ·     │
│ processes · code    │
└─────────────────────┘
```

The cloud relay routes authenticated MCP requests to a specific connected device. It does not become the user's filesystem authority; the local process remains the authority for local execution.

## Why System Commander

Most AI interfaces are excellent at understanding what you want.

System Commander is about giving that understanding **a way to act**.

That means an AI can move from:

```text
"Find the configuration causing this problem."
```

to actually searching the machine, opening the relevant files, inspecting processes, making a targeted edit, and verifying the result.

---

## Quick start

### 1. Clone

```bash
git clone https://github.com/leukode-labs/System-Commander.git
cd System-Commander
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

### 4. Start the MCP server

```bash
npm start
```

For the guided Claude Desktop setup:

```bash
npm run setup
```

> System Commander is currently distributed from source while the public npm release is being prepared.

## Remote computer control

System Commander Cloud extends the local MCP engine to remote AI clients.

The flow is:

```text
AI Client
   ↓
/mcp/<deviceId>
   ↓
System Commander Cloud
   ↓
WebSocket
   ↓
Remote Agent
   ↓
Local System Commander
```

Start a connected device with:

```bash
npx @leukode-labs/system-commander@latest remote \
  --relay https://your-relay.example.com \
  --device-id YOUR_DEVICE_ID \
  --token YOUR_DEVICE_TOKEN
```

Then configure the AI client to use the device's MCP endpoint:

```text
https://your-relay.example.com/mcp/YOUR_DEVICE_ID
```

See the [Remote Agent guide](./src/remote-device/README.md) and [Cloud Relay guide](./relay/README.md) for the complete setup.

## Security model

System Commander is designed around a simple boundary:

**the connected computer remains in control of its own execution.**

- Device tokens are stored as SHA-256 hashes by the relay backend.
- The raw device token is only exposed during provisioning.
- Commands execute locally under the connected user's operating-system permissions.
- The relay does not need the user's filesystem credentials.
- Production deployments should use HTTPS/WSS.
- Rate limiting and authenticated account flows should be enabled before public self-service provisioning.

Read [SECURITY.md](./SECURITY.md) before exposing a deployment to untrusted users.

## MCP compatibility

System Commander preserves the existing MCP tool surface and compatibility-oriented internal identifiers where practical. This is intentional: rebranding the product should not unnecessarily break existing integrations.

The project follows the [Model Context Protocol](https://modelcontextprotocol.io/) ecosystem and can be used with MCP-compatible AI clients.

## Project structure

```text
System-Commander/
├── src/                  # Local MCP engine and tools
│   └── remote-device/    # Remote Agent
├── relay/                # System Commander Cloud relay
├── convex/               # Cloud data / device state
├── test/                 # Test suites
├── scripts/              # Build and release tooling
└── README.md             # You are here
```

## Development

```bash
npm run build
npm test
npm run validate:tools
```

For remote-agent development:

```bash
npm run device:install
npm run device:start
```

## Origin & attribution

System Commander is a rebranded evolution of the MIT-licensed **Desktop Commander** codebase.

The original MIT license and required attribution are retained in [LICENSE](./LICENSE). This project keeps compatibility-oriented internals where changing them could unnecessarily disrupt existing integrations.

System Commander is developed and maintained by **Leukode Labs**.

## Contributing

Issues, improvements, documentation, security feedback, and pull requests are welcome.

Before contributing, please read the repository's security and contribution guidance and keep compatibility in mind when changing MCP-facing interfaces.

## License

System Commander is available under the **MIT License**.

See [LICENSE](./LICENSE) for the full license text.

<div align="center">

### System Commander

**Give AI a way to act.**

*By Leukode Labs*

</div>
