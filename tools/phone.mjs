#!/usr/bin/env node
// Test this working copy on a phone, before pushing.
//
//   npm run phone          dev server (edits show up on the phone after a refresh)
//   npm run phone -- --dist   production build (what GitHub Pages will serve)
//
// Camera and GPS only work over HTTPS, so a phone on the Wi-Fi can't use
// http://<laptop-ip>:5173. A Cloudflare quick tunnel gives the local server a
// free https://<random>.trycloudflare.com address — no account, nothing to
// install on the phone. The address changes every run; Ctrl+C stops both.
// Needs: brew install cloudflared

import { spawn, spawnSync } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import qrcode from 'qrcode-terminal';

const useDist = process.argv.includes('--dist');
const port = useDist ? 4173 : 5173;
const local = `http://localhost:${port}`;
const children = [];

function stopAll(code = 0) {
  for (const c of children) if (!c.killed) c.kill('SIGTERM');
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

async function isUp(url, ms = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, totalMs, label) {
  const until = Date.now() + totalMs;
  while (Date.now() < until) {
    if (await isUp(url, 3000)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`✗ ${label} didn't answer at ${url} after ${totalMs / 1000}s`);
  return false;
}

async function waitForDns(host, totalMs) {
  const dns = new Resolver();
  dns.setServers(['1.1.1.1', '1.0.0.1']);
  const until = Date.now() + totalMs;
  while (Date.now() < until) {
    try {
      if ((await dns.resolve4(host)).length) return true;
    } catch { /* not registered yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`✗ ${host} never appeared in DNS after ${totalMs / 1000}s`);
  return false;
}

if (spawnSync('cloudflared', ['--version']).error) {
  console.error('✗ cloudflared is not installed. Run:  brew install cloudflared');
  process.exit(1);
}

// 1. Local server — reuse one that's already running on the port.
if (await isUp(local)) {
  console.log(`• Using the server already running at ${local}`);
} else {
  if (useDist) {
    console.log('• Building…');
    const b = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
    if (b.status !== 0) process.exit(b.status || 1);
  }
  const args = useDist
    ? ['vite', 'preview', '--port', String(port), '--strictPort']
    : ['vite', '--port', String(port), '--strictPort', '--open', 'false'];
  console.log(`• Starting ${useDist ? 'the production build' : 'the dev server'} on ${local}`);
  const server = spawn('npx', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  children.push(server);
  server.on('exit', (code) => {
    console.error(`✗ Local server stopped (exit ${code})`);
    stopAll(1);
  });
  if (!(await waitFor(local, 30000, 'The local server'))) stopAll(1);
}

// 2. Tunnel.
console.log('• Opening a Cloudflare tunnel…');
const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', local], {
  stdio: ['ignore', 'pipe', 'pipe']
});
children.push(tunnel);
tunnel.on('exit', (code) => {
  console.error(`✗ Tunnel closed (exit ${code})`);
  stopAll(1);
});

let publicUrl = null;
const onOutput = async (chunk) => {
  if (publicUrl) return;
  const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m) return;
  publicUrl = m[0];
  // The name takes a few seconds to exist after cloudflared prints it. Ask
  // Cloudflare's DNS until it does: asking the Mac too early makes it cache
  // "not found", and then every check fails for minutes (Oct 1).
  if (!(await waitForDns(new URL(publicUrl).hostname, 60000))) stopAll(1);
  if (!(await waitFor(publicUrl, 30000, 'The tunnel'))) stopAll(1);
  announce(publicUrl);
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);

setTimeout(() => {
  if (!publicUrl) {
    console.error('✗ No tunnel address after 30s — check the internet connection and run again.');
    stopAll(1);
  }
}, 30000);

function announce(url) {
  const page = (path) => `${url}/${path}`;
  console.log('\n────────────────────────────────────────────────────────────');
  console.log(` Phone testing is live (${useDist ? 'production build' : 'dev server'})`);
  console.log('────────────────────────────────────────────────────────────\n');
  qrcode.generate(page('shark-ar-8thwall.html?log=1'), { small: true });
  console.log(' Scan with the iPhone camera → opens Shark AR with the field log on.\n');
  console.log(` Home          ${page('')}`);
  console.log(` Shark AR      ${page('shark-ar-8thwall.html?log=1')}`);
  console.log(` Debug panel   ${page('shark-ar-8thwall.html?debug=1')}`);
  console.log(` At-home test  ${page('shark-ar-8thwall.html?test=1')}`);
  console.log(` Selfie        ${page('selfie-ar.html?log=1')}`);
  console.log(` Living Mural  ${page('mural-ar.html?log=1')}`);
  console.log(` Tour          ${page('location-tour.html?log=1')}`);
  console.log(`\n ${useDist ? 'Rebuild (Ctrl+C, run again) to see code changes.' : 'Edit code, then refresh on the phone.'}`);
  console.log(' The address changes every run. Ctrl+C stops the tunnel.\n');
}
