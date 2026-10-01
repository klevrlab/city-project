#!/usr/bin/env node
// Test this working copy on a phone, before pushing.
//
//   npm run phone             dev server (edits show up on the phone after a refresh)
//   npm run phone -- --dist   production build (what GitHub Pages will serve)
//   npm run phone:test        QR opens the at-home test suite (?test=1) instead of Shark AR
//                             (--test works with --dist too)
//
// Camera and GPS only work over HTTPS, so a phone on the Wi-Fi can't use
// http://<laptop-ip>:5173. A Cloudflare quick tunnel gives the local server a
// free https://<random>.trycloudflare.com address — no account, nothing to
// install on the phone. The address changes every run; Ctrl+C stops both.
// Needs: brew install cloudflared
//
// Pages opened with ?log=1 (every link printed here) stream the field log back
// to the laptop: logs/phone/YYYY-MM-DD.log, with errors, ★ marks, test steps,
// drops and 8th Wall events echoed below (tools/phone-log-plugin.mjs).

import { spawn, spawnSync } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode-terminal/vendor/QRCode/index.js';
import QRErrorCorrectLevel from 'qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js';
import { PHONE_LOG_PREFIX } from './phone-log-plugin.mjs';

const useDist = process.argv.includes('--dist');
const testSuite = process.argv.includes('--test');
// What the QR code opens.
const START = testSuite
  ? { path: 'shark-ar-8thwall.html?test=1', what: 'the at-home test suite (?test=1, field log on, every drop unlocked)' }
  : { path: 'shark-ar-8thwall.html?log=1', what: 'Shark AR with the field log on' };
const QR_PAGE = path.resolve('logs/phone/qr.html');
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
let reused = false;
if (await isUp(local)) {
  reused = true;
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
  const server = spawn('npx', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  children.push(server);
  // Vite's own banner is noise here; pass through only the phone's log lines.
  let pending = '';
  server.stdout.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const l of lines) if (l.startsWith(PHONE_LOG_PREFIX)) console.log(l);
  });
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

// A bigger QR for the laptop screen than the terminal's — scans from across a desk.
function writeQrPage(link) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(link);
  qr.make();
  const n = qr.getModuleCount();
  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) rects += `<rect x="${c + 4}" y="${r + 4}" width="1" height="1"/>`;
  }
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><meta charset="utf-8"><title>Phone test QR</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1418;color:#e8f4f6;
font:16px -apple-system,BlinkMacSystemFont,sans-serif;text-align:center}svg{width:min(70vmin,520px);height:auto;
background:#fff;border-radius:16px}p{max-width:560px;padding:0 16px;word-break:break-all}</style>
<div><h2>${esc(START.what.replace(/ \(.*/, ''))}</h2>
<svg viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><g fill="#000">${rects}</g></svg>
<p>Scan with the phone camera.<br>${esc(link)}</p><p style="opacity:.6">Address changes every run of npm run phone.</p></div>`;
  try {
    fs.mkdirSync(path.dirname(QR_PAGE), { recursive: true });
    fs.writeFileSync(QR_PAGE, html);
    return true;
  } catch {
    return false;
  }
}

function announce(url) {
  const page = (path) => `${url}/${path}`;
  console.log('\n────────────────────────────────────────────────────────────');
  console.log(` Phone testing is live (${useDist ? 'production build' : 'dev server'})`);
  console.log('────────────────────────────────────────────────────────────\n');
  qrcode.generate(page(START.path), { small: true });
  console.log(` Scan with the iPhone camera → opens ${START.what}.`);
  if (writeQrPage(page(START.path))) console.log(` Bigger QR for the screen: open ${path.relative(process.cwd(), QR_PAGE)}`);
  console.log('');
  console.log(` Home          ${page('?log=1')}`);
  console.log(` Shark AR      ${page('shark-ar-8thwall.html?log=1')}`);
  console.log(` Debug panel   ${page('shark-ar-8thwall.html?debug=1')}`);
  console.log(` At-home test  ${page('shark-ar-8thwall.html?test=1')}`);
  console.log(` Test + debug  ${page('shark-ar-8thwall.html?test=1&debug=1')}`);
  console.log(` Selfie        ${page('selfie-ar.html?log=1')}`);
  console.log(` Living Mural  ${page('mural-ar.html?log=1')}`);
  console.log(` Tour          ${page('location-tour.html?log=1')}`);
  console.log(`\n ${useDist ? 'Rebuild (Ctrl+C, run again) to see code changes.' : 'Edit code, then refresh on the phone.'}`);
  console.log(' The address changes every run. Ctrl+C stops the tunnel.');
  console.log(` Phone logs → logs/phone/ (contain GPS — not committed)${reused ? '; the already-running server writes them, so they won\'t echo here' : '; errors, ★ marks and test steps also print below'}.\n`);
}
