// TinyCompany ビューア：ブラウザ完結のための GitHub 接続層。
// 会社 repo（GitHub）の設定ファイルと Issues を読み、ビューア向けに整形する。
// レイアウト・設定・建物の保存は Contents API で repo にコミットする。
// 接続情報（repo・トークン・API base）は localStorage にだけ保存する。
// もともと server/server.mjs が担っていた処理のブラウザ移植版。整形の契約は
// server/CONTRACT.md の GET /api/company の形に一致させる。
(function () {
  const LS_KEY = 'tc-viewer-config-v1';

  function getConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (c && c.repo && c.token) return { apiBase: 'https://api.github.com', ...c };
      return null;
    } catch { return null; }
  }
  function saveConfig(c) { localStorage.setItem(LS_KEY, JSON.stringify(c)); }

  // ---------- GitHub 層 ----------
  function apiBase(cfg) { return (cfg.apiBase || 'https://api.github.com').replace(/\/$/, ''); }
  async function gh(cfg, pathname, options = {}) {
    return fetch(apiBase(cfg) + pathname, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${cfg.token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
  }
  async function ghJson(cfg, pathname) {
    const r = await gh(cfg, pathname);
    if (!r.ok) throw new Error(`GitHub GET ${pathname} -> ${r.status}`);
    return r.json();
  }
  const contentsUrl = (cfg, p) =>
    `/repos/${cfg.repo}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
  function b64decodeText(b64) {
    const bin = atob((b64 || '').replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function b64encodeText(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  async function getRepoFile(cfg, p) {
    const r = await gh(cfg, contentsUrl(cfg, p));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub GET contents ${p} -> ${r.status}`);
    const j = await r.json();
    return { text: b64decodeText(j.content), sha: j.sha };
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

  // ---------- 整形（server.mjs から移植） ----------
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
      if (/^#{1,6}(\s|$)/.test(line)) {
        // 見出し行で節を区切る。ただし「#16 の子」のような Issue 参照は見出しではない
        // （# の直後に数字が続く）ので、値として現在の項目へ取り込む（親の宣言がこの形）
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
    const m = text.match(/(?:https?|codex):\/\/[^\s）)]+/);
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

  async function loadCompany(cfg) {
    const settingsF = await getRepoFile(cfg, 'board/settings.json');
    if (!settingsF) throw new Error('board/settings.json not found');
    const settings = JSON.parse(settingsF.text);
    const buildingF = await getRepoFile(cfg, 'board/building.json');
    if (!buildingF) throw new Error('board/building.json not found');
    const building = JSON.parse(buildingF.text);

    const layouts = {};
    for (const room of building.rooms || []) {
      const f = await getRepoFile(cfg, `rooms/${room.id}/layout.json`);
      if (f) layouts[room.id] = JSON.parse(f.text);
    }

    const raw = await ghJson(cfg, `/repos/${cfg.repo}/issues?state=all&per_page=100`);
    const list = raw.filter(i => !i.pull_request);

    // サブIssueリンクの親。階層の正ではなくなったが、本文の「親」宣言が無い
    // Issue への移行の橋渡しとして使うため、取得自体は残す（設計B、#46）。
    const parents = await mapPool(list, 6, async iss => {
      const r = await gh(cfg, `/repos/${cfg.repo}/issues/${iss.number}/parent`);
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.number ? j.number : null;
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
        hidden: labelNames.includes('非表示'),
      };
    });

    // ---------- 親子の解決：正は本文の「親」宣言（設計B、#46） ----------
    // 宣言（「## 親」の節／「親：#N」の行）にある最初の #番号が親になる。
    // 宣言が実リンクと食い違ったら宣言が勝つ。宣言先が存在しない・別部屋
    // （room が子と異なる）・循環しているときは、その親子関係は無効（親なし）
    // として扱い、理由を parentNote に残す（表示は詳細パネルの親の行だけ）。
    // 宣言が無い Issue に限り、橋渡しとしてサブIssueリンクの親を使い、
    // その場合は「リンクのみ（宣言なし）」の注記を残す。
    const fieldsList = provisional.map(p => parseBody(p.iss.body || ''));
    const declaredOf = f => {
      const t = f['親'];
      if (!t) return null;
      const m = String(t).match(/#(\d+)/);
      return m ? Number(m[1]) : null;
    };
    const idxByNum = new Map(provisional.map((p, i) => [p.iss.number, i]));
    const resolvedParent = new Array(provisional.length).fill(null);
    const parentNote = new Array(provisional.length).fill(null);
    const candIdx = new Map(); // index -> 宣言による親の番号（存在・部屋の検証済み）
    provisional.forEach((p, i) => {
      const d = declaredOf(fieldsList[i]);
      if (d === null) return;
      if (!idxByNum.has(d)) { parentNote[i] = `宣言された親 #${d} は見つかりません`; return; }
      if (provisional[idxByNum.get(d)].room !== p.room) { parentNote[i] = '親は別の部屋です'; return; }
      candIdx.set(i, d);
    });
    // 循環検出：候補を辿って輪に入っている Issue は候補を取り消す。
    // 輪の外から輪を指す Issue は、輪側が親なしになることで辿れるようになるため残す。
    const cyclic = new Set();
    for (const start of candIdx.keys()) {
      const seen = new Map();
      const path = [];
      let cur = start;
      while (cur !== undefined && candIdx.has(cur)) {
        if (seen.has(cur)) {
          for (let k = seen.get(cur); k < path.length; k++) cyclic.add(path[k]);
          break;
        }
        seen.set(cur, path.length);
        path.push(cur);
        cur = idxByNum.get(candIdx.get(cur));
      }
    }
    for (const i of cyclic) { candIdx.delete(i); parentNote[i] = '親が循環しています'; }
    provisional.forEach((p, i) => {
      if (declaredOf(fieldsList[i]) !== null) {
        resolvedParent[i] = candIdx.has(i) ? candIdx.get(i) : null;
      } else if (p.parent != null) {
        resolvedParent[i] = p.parent;
        parentNote[i] = 'リンクのみ（宣言なし）';
      }
    });
    const childrenOf = {};
    provisional.forEach((p, i) => {
      const par = resolvedParent[i];
      if (par != null) (childrenOf[par] = childrenOf[par] || []).push(p.iss.number);
    });

    const preChecks = await mapPool(provisional, 6, async p => {
      if (p.status !== 'waiting_review') return null;
      const comments = await ghJson(cfg, `/repos/${cfg.repo}/issues/${p.iss.number}/comments?per_page=100`);
      return parsePreCheck(comments);
    });

    const issues = provisional.map((p, i) => {
      const f = fieldsList[i];
      const chat = f['チャット'] ? extractUrl(f['チャット']) : null;
      const reportTo = f['報告先']
        ? (() => { const u = extractUrl(f['報告先']); return { name: u.label, chat: u.url }; })()
        : null;
      return {
        number: p.iss.number,
        title: p.iss.title,
        state: p.iss.state,
        url: p.iss.html_url,
        updatedAt: p.iss.updated_at || null,
        seat: p.seat,
        status: p.status,
        hidden: p.hidden,
        room: p.room,
        parent: resolvedParent[i],
        parentNote: parentNote[i],
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
      repo: cfg.repo,
      fetchedAt: new Date().toISOString(),
      settings, building, layouts, issues,
    };
  }

  // ---------- 変更の見張り（ETag の条件付きリクエスト） ----------
  // 「変更なし（304）」の応答は GitHub の回数制限に数えられないため、
  // 数秒ごとに軽く確認して、変わったときだけ loadCompany を呼ぶための仕組み。
  const probeEtags = {};
  async function probeOne(cfg, key, pathname) {
    // 初回は必ず不一致になる値を送って 200 を受け取り、ETag を基準として記録する。
    // （ヘッダーを送らないとブラウザが自身のキャッシュの ETag で再検証してしまい、
    //   こちらの基準とずれて変更を取りこぼすため）
    const headers = { 'If-None-Match': probeEtags[key] || '"tc-prime-none"' };
    let r;
    try {
      r = await gh(cfg, pathname, { headers, cache: 'no-cache' });
    } catch (e) { return false; }
    if (r.status === 304) return false;
    if (!r.ok) return false;
    const et = r.headers.get('ETag');
    const had = Object.prototype.hasOwnProperty.call(probeEtags, key);
    if (et) probeEtags[key] = et;
    return had; // 初回は基準（ETag の記録）作りのみで、変更とはみなさない
  }
  async function probeChanges(cfg) {
    const issuesChanged = await probeOne(cfg, cfg.repo + '|issues',
      `/repos/${cfg.repo}/issues?state=all&per_page=100`);
    const headChanged = await probeOne(cfg, cfg.repo + '|head',
      `/repos/${cfg.repo}/commits?per_page=1`);
    return issuesChanged || headChanged;
  }

  // 「非表示」ラベルの付け外し（キャラの表示・非表示の切り替え）
  async function setIssueHidden(cfg, number, hidden) {
    if (hidden) {
      const r = await gh(cfg, `/repos/${cfg.repo}/issues/${number}/labels`, {
        method: 'POST', body: JSON.stringify({ labels: ['非表示'] }),
      });
      if (!r.ok) throw new Error(`add label -> ${r.status}`);
    } else {
      const r = await gh(cfg, `/repos/${cfg.repo}/issues/${number}/labels/${encodeURIComponent('非表示')}`, {
        method: 'DELETE',
      });
      if (!r.ok && r.status !== 404) throw new Error(`remove label -> ${r.status}`);
    }
    return true;
  }

  // ---------- 保存（server.mjs の POST /api/files と同じ制限） ----------
  const WRITE_OK = /^board\/(settings|building)\.json$|^rooms\/[A-Za-z0-9._-]+\/layout\.json$/;
  async function saveFile(cfg, filePath, content) {
    if (!WRITE_OK.test(filePath)) throw new Error('path not allowed: ' + filePath);
    if (content === null || typeof content !== 'object') throw new Error('content must be a JSON object');
    const existing = await getRepoFile(cfg, filePath);
    const payload = {
      message: `Update ${filePath} via TinyCompany viewer`,
      content: b64encodeText(JSON.stringify(content, null, 2) + '\n'),
    };
    if (existing) payload.sha = existing.sha;
    const r = await gh(cfg, contentsUrl(cfg, filePath), { method: 'PUT', body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`GitHub PUT ${filePath} -> ${r.status}`);
    const j = await r.json();
    return { ok: true, commit: j.commit && j.commit.sha };
  }

  async function validate(cfg) {
    const f = await getRepoFile(cfg, 'board/settings.json');
    if (!f) throw new Error('会社リポジトリに board/settings.json が見つかりません');
    return true;
  }

  window.TCGitHub = { getConfig, saveConfig, loadCompany, saveFile, validate, probeChanges, setIssueHidden };
})();
