#!/usr/bin/env node
// Host smoke test: `node scripts/host-smoke.mjs <command> [args…]` starts the host, sends one native frame with an
// invalid request and expects `{ ok: false, code: 'invalid_request' }` back. An invalid request never reaches Orca.
import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/host-smoke.mjs <command> [args…]');
  process.exit(2);
}

// Windows cannot spawn a .bat/.cmd without cmd.exe: go through the shell with the argv quoted. The frame goes
// through stdin, so nothing but these paths ever reaches the command line.
const viaShell = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
const child = viaShell
  ? spawn([command, ...args].map((a) => `"${a}"`).join(' '), { shell: true, stdio: ['pipe', 'pipe', 'inherit'] })
  : spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });

const timer = setTimeout(() => fail('timed out after 20 s'), 20_000);

function fail(reason) {
  console.error(`host smoke test failed: ${reason}`);
  child.kill();
  process.exit(1);
}

child.on('error', (e) => fail(e.message));

let out = Buffer.alloc(0);
child.stdout.on('data', (chunk) => {
  out = Buffer.concat([out, chunk]);
});
child.on('close', (code) => {
  clearTimeout(timer);
  if (out.length < 4 || out.length < 4 + out.readUInt32LE(0)) {
    fail(`no complete frame (exit code ${code}, ${out.length} bytes: ${JSON.stringify(out.toString('utf8'))})`);
  }
  const reply = out.subarray(4, 4 + out.readUInt32LE(0)).toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(reply);
  } catch {
    fail(`reply is not JSON: ${reply}`);
  }
  if (parsed?.ok !== false || parsed?.code !== 'invalid_request') fail(`unexpected reply: ${reply}`);
  console.log(`host smoke test passed: ${reply}`);
});

const body = Buffer.from(JSON.stringify({ action: 'nope' }), 'utf8');
const header = Buffer.alloc(4);
header.writeUInt32LE(body.length, 0);
child.stdin.on('error', () => {}); // the host may exit before reading everything; the reply decides
child.stdin.end(Buffer.concat([header, body]));
