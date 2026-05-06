/**
 * run_sync.js
 * Wrapper: spawns sync_products.js and tees stdout/stderr to logs/sync_products_out.log
 * Run:  node run_sync.js [--full]
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2); // pass through --full etc.
const logDir = './logs';
fs.mkdirSync(logDir, { recursive: true });

const logPath = path.join(logDir, 'sync_products_out.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const sep = `\n${'='.repeat(60)}\nRun started: ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
logStream.write(sep);
process.stdout.write(sep);

const child = spawn('node', ['sync_products.js', ...args], {
  cwd: process.cwd(),
  env: process.env,
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

child.on('close', (code) => {
  const footer = `\nRun finished: ${new Date().toISOString()} — exit code: ${code}\n`;
  logStream.write(footer);
  process.stdout.write(footer);
  logStream.end();
  process.exit(code ?? 0);
});
