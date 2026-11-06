// GitHub REST API の最小スタブ（テスト専用）。
// fixtures/ の実データ（パイロット repo から取得した形）で応答する。
// 使い方: node stub.mjs  （ポートは STUB_PORT、既定 8791）
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(DIR, 'fixtures');
const PORT = process.env.STUB_PORT || 8791;

const issues = JSON.parse(await readFile(path.join(FIX, 'issues.json'), 'utf-8'));
const parents = JSON.parse(await readFile(path.join(FIX, 'parents.json'), 'utf-8'));
const comments = JSON.parse(await readFile(path.join(FIX, 'comments.json'), 'utf-8'));
const issueByNum = n => issues.find(i => i.number === Number(n));

function send(res, code, obj) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    // ブラウザ完結ビューアから直接叩くテストのために CORS を許可する（テスト専用）
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, 'http://stub');
  const p = decodeURIComponent(url.pathname);
  let m;
  try {
    if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/))) {
      const filePath = path.join(FIX, 'files', m[1]);
      if (req.method === 'GET') {
        try {
          const text = await readFile(filePath, 'utf-8');
          return send(res, 200, {
            name: path.basename(m[1]), path: m[1], sha: 'fixture-sha',
            encoding: 'base64',
            content: Buffer.from(text, 'utf-8').toString('base64'),
          });
        } catch { return send(res, 404, { message: 'Not Found' }); }
      }
      if (req.method === 'PUT') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const text = Buffer.from(body.content, 'base64').toString('utf-8');
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, text, 'utf-8');
        await writeFile(path.join(DIR, 'last-write.json'),
          JSON.stringify({ path: m[1], message: body.message, text }, null, 2), 'utf-8');
        return send(res, 200, { content: { path: m[1], sha: 'stub-new-sha' }, commit: { sha: 'stub-commit-1' } });
      }
    }
    if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/parent$/))) {
      const parentNum = parents[m[1]];
      if (parentNum && issueByNum(parentNum)) return send(res, 200, issueByNum(parentNum));
      return send(res, 404, { message: 'Not Found' });
    }
    if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/))) {
      return send(res, 200, comments[m[1]] || []);
    }
    if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/))) {
      const iss = issueByNum(m[1]);
      return iss ? send(res, 200, iss) : send(res, 404, { message: 'Not Found' });
    }
    if (p.match(/^\/repos\/[^/]+\/[^/]+\/issues$/)) {
      return send(res, 200, issues);
    }
    return send(res, 404, { message: 'stub: no route ' + p });
  } catch (e) {
    return send(res, 500, { message: String(e && e.message || e) });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`stub GitHub API on http://127.0.0.1:${PORT}`));
