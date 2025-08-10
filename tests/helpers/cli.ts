import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function runCli(args: string[], options: { cwd?: string } = {}) {
  const cliPath = path.resolve(__dirname, '../../bin/codereap.js');
  const result = spawnSync('node', [cliPath, ...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const outFlagIndex = args.findIndex((a) => a === '--out');
  let json: unknown = undefined;
  if (outFlagIndex !== -1) {
    const outBase = args[outFlagIndex + 1] ?? 'codereap-report';
    const jsonPath = path.resolve(options.cwd ?? process.cwd(), `${outBase}.json`);
    if (fs.existsSync(jsonPath)) {
      json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }
  }

  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status, json };
}


