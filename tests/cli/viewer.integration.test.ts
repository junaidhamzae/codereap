import http from 'http';
import { spawn } from 'child_process';
import path from 'path';

function waitForReady(child: ReturnType<typeof spawn>, timeoutMs=8000): Promise<string> {
	return new Promise((resolve, reject)=>{
		const t = setTimeout(()=>reject(new Error('timeout')), timeoutMs);
		const onData = (d: string)=>{
			const m = /listening on (http:\/\/[^\s]+)/i.exec(d);
			if (m){ clearTimeout(t); resolve(m[1]); }
		};
		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		child.stdout?.on('data', onData);
		child.stderr?.on('data', onData);
	});
}

jest.setTimeout(10000);

test('viewer serves healthz and index', async () => {
	const bin = path.resolve(__dirname, '../../bin/codereap.js');
	const child = spawn(process.execPath, [bin, '--viewer', '--no-open'], { env: process.env, stdio: ['ignore','pipe','pipe'] });
	const url = await waitForReady(child);
	const ok = await new Promise<boolean>(res=>{
		http.get(`${url}healthz`, r=> res(r.statusCode===200)).on('error', ()=>res(false));
	});
	expect(ok).toBe(true);
	const ok2 = await new Promise<boolean>(res=>{
		http.get(url, r=> res(r.statusCode===200)).on('error', ()=>res(false));
	});
	expect(ok2).toBe(true);
	child.kill('SIGINT');
});
