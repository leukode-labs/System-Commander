// In-memory event log for the connected-clients dashboard.
// Not persisted to disk on purpose — this is a live "what's happening right
// now" view, not an audit trail. Restarting the server clears it.

export interface ClientRecord {
    name: string;
    version: string;
    firstSeen: number;
    lastSeen: number;
    toolCallCount: number;
    remote: boolean;
}

export interface ToolCallRecord {
    id: number;
    timestamp: number;
    clientName: string;
    clientVersion: string;
    toolName: string;
    durationMs: number;
    isError: boolean;
    remote: boolean;
}

const MAX_EVENTS = 500;

class Monitor {
    private clients = new Map<string, ClientRecord>();
    private events: ToolCallRecord[] = [];
    private nextId = 1;

    recordConnect(name: string, version: string, remote: boolean) {
        const key = `${name}@${version}`;
        const existing = this.clients.get(key);
        const now = Date.now();
        if (existing) {
            existing.lastSeen = now;
        } else {
            this.clients.set(key, {
                name,
                version,
                firstSeen: now,
                lastSeen: now,
                toolCallCount: 0,
                remote,
            });
        }
    }

    recordToolCall(params: {
        clientName: string;
        clientVersion: string;
        toolName: string;
        durationMs: number;
        isError: boolean;
        remote: boolean;
    }) {
        const now = Date.now();
        const key = `${params.clientName}@${params.clientVersion}`;
        const existing = this.clients.get(key);
        if (existing) {
            existing.lastSeen = now;
            existing.toolCallCount += 1;
        } else {
            this.clients.set(key, {
                name: params.clientName,
                version: params.clientVersion,
                firstSeen: now,
                lastSeen: now,
                toolCallCount: 1,
                remote: params.remote,
            });
        }

        this.events.push({
            id: this.nextId++,
            timestamp: now,
            clientName: params.clientName,
            clientVersion: params.clientVersion,
            toolName: params.toolName,
            durationMs: params.durationMs,
            isError: params.isError,
            remote: params.remote,
        });

        if (this.events.length > MAX_EVENTS) {
            this.events.splice(0, this.events.length - MAX_EVENTS);
        }
    }

    getState() {
        return {
            clients: Array.from(this.clients.values()).sort((a, b) => b.lastSeen - a.lastSeen),
            events: this.events.slice().reverse(), // newest first
            serverStartedAt: SERVER_STARTED_AT,
        };
    }
}

const SERVER_STARTED_AT = Date.now();

export const monitor = new Monitor();
