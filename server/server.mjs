// TinyCompany ローカルサーバー
// 会社 repo（GitHub）の設定ファイルと Issues を読み、ビューア向けに整形して渡す。
// レイアウト・設定・建物の保存は Contents API で repo にコミットする。
// 依存ライブラリなし（Node 18+ の標準機能だけ）。
//
// 環境変数：
//   GITHUB_TOKEN   会社 repo 用の PAT（Issues/Contents の読み書き）
//   COMPANY_REPO   "owner/repo"
//   PORT           既定 8787
//   GITHUB_API_BASE 既定 https://api.github.com（テスト用に差し替え可）
//   CACHE_TTL_MS   既定 30000
//   VIEWER_DIR     既定 ../viewer
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = process.env.COMPANY_REPO || '';
const API_BASE = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
const TTL = Number(process.env.CACHE_TTL_MS || 30000);
const VIEWER_DIR = process.env.VIEWER_DIR ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer');

if (!REPO) {
  console.error('COMPANY_REPO (owner/repo) is required');
  process.exit(1);
}

// ---------- GitHub 層 ----------
async function gh(pathname, options = {}) {
  return fetch(API_BASE + pathname, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
}
async function ghJson(pathname) {
  const r = await gh(pathname);
  if (!r.ok) throw new Error(`GitHub GET ${pathname} -> ${r.status}`);
  return r.json();
}
const contentsUrl = p =>
  `/repos/${REPO}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
async function getRepoFile(p) {
  const r = await gh(contentsUrl(p));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET contents ${p} -> ${r.status}`);
  const j = await r.json();
  return { text: Buffer.from(j.content, 'base64').toString('utf-8'), sha: j.sha };
}
async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// ---------- 整形 ----------
const BODY_FIELDS = ['担当', 'チャット', '親', 'やること', '成果物', '承認待ちの内容', '報告先', '報告文'];
function parseBody(body) {
  const fields = {};
  if (!body) return fields;
  let current = null;
  const headingField = new RegExp(`^#{1,6}\\s*(${BODY_FIELDS.join('|')})(?:（.*）|\\(.*\\))?\\s*$`);
  for (const line of body.split('\n')) {
    const m = line.match(new RegExp(`^(${BODY_FIELDS.join('|')})[：:]\\s?(.*)$`));
    if (m) {
      current = m[1];
      fields[current] = m[2];
      continue;
    }
    const h = line.match(headingField);
    if (h) {
      // 見出し形式（## 担当 の次の行が値）にも対応する
      current = h[1];
      if (fields[current] === undefined) fields[current] = '';
      continue;
    }
    if (line.startsWith('#')) {
      current = null;
    } else if (current) {
      fields[current] = (fields[current] + '\n' + line).trim();
    }
  }
  for (const k of Object.keys(fields)) fields[k] = fields[k].trim();
  return fields;
}
function extractUrl(text) {
  if (!text) return { label: text, url: null };
  const m = text.match(/https?:\/\/[^\s）)]+/);
  if (!m) return { label: text, url: null };
  const label = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() || m[0];
  return { label, url: m[0] };
}
function parsePreCheck(comments) {
  const hits = (comments || []).filter(c => (c.body || '').includes('一次確認'));
  if (!hits.length) return null;
  const c = hits[hits.length - 1];
  const lines = (c.body || '').split('\n').map(l => l.trim());
  const stripItem = l => l.replace(/^[-・]\s?/, '').trim();
  // 「推奨」を含む行を探し、その行の値＋（値が空なら）後続の箇条書きを集める。
  // 「懸念」「確認したこと」など別セクションの行で止める。
  function collect(keyword, stopWords) {
    const i = lines.findIndex(l => stripItem(l).startsWith(keyword));
    if (i < 0) return '';
    const first = stripItem(lines[i]).slice(keyword.length).replace(/^[：:]\s?/, '').trim();
    const parts = first ? [first] : [];
    if (!first) {
      for (let j = i + 1; j < lines.length; j++) {
        const t = stripItem(lines[j]);
        if (!t) continue;
        if (stopWords.some(w => t.startsWith(w))) break;
        if (/^#{1,6}\s/.test(lines[j])) break;
        parts.push(t);
      }
    }
    return parts.join('／').replace(/^／+/, '').trim();
  }
  const recommend = collect('推奨', ['懸念', '確認したこと']);
  const concerns = collect('懸念', ['テスト観点', '判断ポイント', 'その他']);
  if (!recommend && !concerns) {
    const firstLine = lines.filter(Boolean)[0] || '';
    return { by: (c.user && c.user.login) || '', recommend: stripItem(firstLine), concerns: '' };
  }
  return { by: (c.user && c.user.login) || '', recommend, concerns };
}
function keyByLabel(defs, labelNames) {
  for (const [key, def] of Object.entries(defs || {})) {
    if (def && def.label && labelNames.includes(def.label)) return key;
  }
  return null;
}

async function buildCompany() {
  const settingsF = await getRepoFile('board/settings.json');
  if (!settingsF) throw new Error('board/settings.json not found');
  const settings = JSON.parse(settingsF.text);
  const buildingF = await getRepoFile('board/building.json');
  if (!buildingF) throw new Error('board/building.json not found');
  const building = JSON.parse(buildingF.text);

  const layouts = {};
  for (const room of building.rooms || []) {
    const f = await getRepoFile(`rooms/${room.id}/layout.json`);
    if (f) layouts[room.id] = JSON.parse(f.text);
  }

  const raw = await ghJson(`/repos/${REPO}/issues?state=all&per_page=100`);
  const list = raw.filter(i => !i.pull_request);

  const parents = await mapPool(list, 6, async iss => {
    const r = await gh(`/repos/${REPO}/issues/${iss.number}/parent`);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.number ? j.number : null;
  });
  const childrenOf = {};
  list.forEach((iss, i) => {
    const p = parents[i];
    if (p) (childrenOf[p] = childrenOf[p] || []).push(iss.number);
  });

  const roomPrefix = (settings.labelPrefixes && settings.labelPrefixes.room) || 'room:';
  const rolePrefix = (settings.labelPrefixes && settings.labelPrefixes.role) || 'role:';

  const provisional = list.map((iss, i) => {
    const labelNames = (iss.labels || []).map(l => (typeof l === 'string' ? l : l.name));
    return {
      iss,
      parent: parents[i],
      seat: keyByLabel(settings.seats, labelNames),
      status: keyByLabel(settings.statuses, labelNames),
      room: (() => {
        const rl = labelNames.find(n => n.startsWith(roomPrefix));
        return rl ? rl.slice(roomPrefix.length) : null;
      })(),
      roles: labelNames.filter(n => n.startsWith(rolePrefix)).map(n => n.slice(rolePrefix.length)),
    };
  });

  const preChecks = await mapPool(provisional, 6, async p => {
    if (p.status !== 'waiting_review') return null;
    const comments = await ghJson(`/repos/${REPO}/issues/${p.iss.number}/comments?per_page=100`);
    return parsePreCheck(comments);
  });

  const issues = provisional.map((p, i) => {
    const f = parseBody(p.iss.body || '');
    const chat = f['チャット'] ? extractUrl(f['チャット']) : null;
    const reportTo = f['報告先']
      ? (() => { const u = extractUrl(f['報告先']); return { name: u.label, chat: u.url }; })()
      : null;
    return {
      number: p.iss.number,
      title: p.iss.title,
      state: p.iss.state,
      url: p.iss.html_url,
      seat: p.seat,
      status: p.status,
      room: p.room,
      roles: p.roles,
      parent: p.parent,
      children: childrenOf[p.iss.number] || [],
      assignee: f['担当'] || null,
      chat,
      out: f['成果物'] || null,
      ask: f['承認待ちの内容'] && !/^なし([。、（(]|$)/.test(f['承認待ちの内容']) ? f['承認待ちの内容'] : null,
      reportTo,
      reportText: f['報告文'] || null,
      preCheck: preChecks[i],
      body: p.iss.body || '',
    };
  });

  return {
    repo: REPO,
    fetchedAt: new Date().toISOString(),
    settings, building, layouts, issues,
  };
}

// ---------- キャッシュ ----------
let cache = { at: 0, data: null };
async function company() {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  const data = await buildCompany();
  cache = { at: Date.now(), data };
  return data;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
const WRITE_OK = /^board\/(settings|building)\.json$|^rooms\/[A-Za-z0-9._-]+\/layout\.json$/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/health') return sendJson(res, 200, { ok: true, repo: REPO });
    if (p === '/api/company') {
      try { return sendJson(res, 200, await company()); }
      catch (e) { return sendJson(res, 502, { error: String(e && e.message || e) }); }
    }
    if (p === '/api/files' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { path: filePath, content } = JSON.parse(raw || '{}');
      if (!filePath || !WRITE_OK.test(filePath)) {
        return sendJson(res, 400, { error: 'path not allowed: ' + filePath });
      }
      if (content === null || typeof content !== 'object') {
        return sendJson(res, 400, { error: 'content must be a JSON object' });
      }
      const existing = await getRepoFile(filePath);
      const payload = {
        message: `Update ${filePath} via TinyCompany viewer`,
        content: Buffer.from(JSON.stringify(content, null, 2) + '\n', 'utf-8').toString('base64'),
      };
      if (existing) payload.sha = existing.sha;
      const r = await gh(contentsUrl(filePath), { method: 'PUT', body: JSON.stringify(payload) });
      if (!r.ok) return sendJson(res, 502, { error: `GitHub PUT ${filePath} -> ${r.status}` });
      const j = await r.json();
      cache = { at: 0, data: null };
      return sendJson(res, 200, { ok: true, commit: j.commit && j.commit.sha });
    }
    // 静的ファイル（ビューア）
    const rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
    const full = path.join(VIEWER_DIR, rel);
    if (!full.startsWith(VIEWER_DIR)) return sendJson(res, 403, { error: 'forbidden' });
    try {
      const data = await readFile(full);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      return res.end(data);
    } catch { return sendJson(res, 404, { error: 'not found: ' + rel }); }
  } catch (e) {
    return sendJson(res, 500, { error: String(e && e.message || e) });
  }
});
server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`TinyCompany viewer server: http://127.0.0.1:${PORT}  repo=${REPO}`);
});
