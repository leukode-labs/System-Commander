import { RemoteAgentError, SystemCommanderRemoteAgent } from '../remote-device/system-commander-agent.js';
import { VERSION } from '../version.js';

const RESET = '\x1b[0m';
const ACCENT = '\x1b[38;5;75m';
const MUTED = '\x1b[38;5;245m';
const WHITE = '\x1b[97m';
const RED = '\x1b[91m';
function setTerminalTitle(title = 'SYSTEM COMMANDER') {
    process.title = title;
    if (process.stdout.isTTY) {
        process.stdout.write('\\x1b]0;' + title + '\\x07');
    }
}

function printRemoteHeader(version: string) {
    setTerminalTitle('SYSTEM COMMANDER');

    console.log();
    console.log(WHITE + 'System Commander' + RESET + MUTED + '  ' + version + RESET);
    console.log(MUTED + 'Remote device setup' + RESET);
    console.log(ACCENT + '────────────────────────────────────────────────────────' + RESET);
    console.log();
}

function printRemoteStatus(icon: string, label: string, value?: string, color = WHITE) {
    const suffix = value ? MUTED + '  ' + RESET + color + value + RESET : '';
    console.log('  ' + icon + '  ' + WHITE + label + RESET + suffix);
}

function getOption(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    if (index === -1) return undefined;
    return process.argv[index + 1];
}

export async function runRemote() {
    const args = process.argv.slice(2);
    const help = args.includes('--help') || args.includes('-h');

    setTerminalTitle('SYSTEM COMMANDER');

    if (help) {
        printRemoteHeader(VERSION);
        console.log('System Commander Remote Agent');
        console.log('');
        console.log('Usage:');
        console.log('  system-commander remote [options]');        console.log('');
        console.log('Options:');
        console.log('  --relay <url>         System Commander Cloud relay URL');
        console.log('  --device-id <id>      Device identifier');
        console.log('  --token <token>       Device authentication token');
        console.log('  --logout              Remove saved device credentials');
        console.log('  --no-persist-session  Do not save the device token locally');
        console.log('  --debug               Enable verbose diagnostics');
        console.log('  -h, --help            Show this help');
        console.log('');
        console.log('Environment variables:');
        console.log('  SYSTEM_COMMANDER_RELAY_URL');
        console.log('  SYSTEM_COMMANDER_DEVICE_ID');
        console.log('  SYSTEM_COMMANDER_DEVICE_TOKEN');
        return;
    }

    const relayUrl = getOption('--relay');
    const deviceId = getOption('--device-id');
    const token = getOption('--token');
    const persistSession = !args.includes('--no-persist-session');
    const debug = args.includes('--debug');

    const agent = new SystemCommanderRemoteAgent({
        relayUrl,
        deviceId,
        token,
        persistSession,        debug,
    });

    if (args.includes('--logout')) {
        await agent.logout();
        return;
    }

    printRemoteHeader(VERSION);
    printRemoteStatus('·', 'Preparing secure device bridge');
    printRemoteStatus('·', 'Device', deviceId || 'saved configuration', WHITE);
    printRemoteStatus('·', 'Relay', relayUrl || 'saved configuration', ACCENT);
    console.log();

    try {
        await agent.run();
    } catch (error: any) {
        console.error('');
        console.error(RED + '✕  System Commander could not start the remote device.' + RESET);
        console.error('');

        if (error instanceof RemoteAgentError) {
            console.error(WHITE + '   Problem' + RESET + MUTED + '  ' + RESET + error.message);
            console.error(WHITE + '   Action' + RESET + MUTED + '   ' + RESET + error.action);
            console.error(MUTED + '   Code' + RESET + '     ' + error.code);
        } else {
            console.error(WHITE + '   Problem' + RESET + MUTED + '  ' + RESET + (error?.message || String(error)));
            console.error(WHITE + '   Action' + RESET + MUTED + '   ' + RESET + 'Run with --debug for diagnostics and check your System Commander Cloud device command.');
        }

        console.error('');
        console.error(MUTED + '   Tip: Never manually edit or reuse an old device token. Generate a fresh command in System Commander Cloud when pairing a device.' + RESET);
        console.error('');
        process.exitCode = 1;
    }
}
