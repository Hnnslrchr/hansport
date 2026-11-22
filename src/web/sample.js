// Coach in der Web-Version: Claude-API über /api/coach (eigener Schlüssel), mit Werkzeugen und Live-Text.
class SampleError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

async function* events(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      try { yield JSON.parse(data); } catch (e) { /* unvollständig */ }
    }
  }
}

async function round(messages, { tools, signal, onText, system, maxTokens }) {
  const res = await fetch('/api/coach', {
    method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', signal,
    body: JSON.stringify({ messages, system, max_tokens: maxTokens, tools: tools && tools.length ? tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } })) : undefined }),
  });
  if (res.status === 401) { location.replace('/login.html'); throw new SampleError('unauthorized', 'Bitte anmelden'); }
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new SampleError((j && j.error && j.error.code) || 'error', (j && j.error && j.error.message) || 'Coach nicht erreichbar (' + res.status + ')');
  }
  const blocks = [];
  let stop = null, text = '';
  for await (const ev of events(res)) {
    if (ev.type === 'content_block_start') blocks[ev.index] = ev.content_block.type === 'tool_use' ? { type: 'tool_use', id: ev.content_block.id, name: ev.content_block.name, json: '' } : ev.content_block.type === 'text' ? { type: 'text', text: '' } : { type: ev.content_block.type, raw: ev.content_block };
    else if (ev.type === 'content_block_delta') {
      const b = blocks[ev.index];
      if (!b) continue;
      if (ev.delta.type === 'text_delta') { b.text += ev.delta.text; text += ev.delta.text; if (onText) onText({ text }); }
      else if (ev.delta.type === 'input_json_delta') b.json += ev.delta.partial_json;
    } else if (ev.type === 'message_delta') stop = ev.delta && ev.delta.stop_reason;
    else if (ev.type === 'error') throw new SampleError(ev.error && ev.error.type === 'overloaded_error' ? 'rate_limited' : 'error', (ev.error && ev.error.message) || 'Fehler im Coach');
  }
  return { blocks: blocks.filter(Boolean), stop, text };
}

export async function sample(input, opts = {}) {
  const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map((m) => ({ role: m.role, content: m.content }));
  const tools = opts.tools || [];
  let finalText = '';
  for (let i = 0; i < 8; i++) {
    const r = await round(messages, { ...opts, tools });
    finalText = r.text;
    const uses = r.blocks.filter((b) => b.type === 'tool_use');
    if (r.stop !== 'tool_use' || !uses.length) return { text: finalText };
    messages.push({ role: 'assistant', content: r.blocks.filter((b) => b.type === 'text' || b.type === 'tool_use').map((b) => (b.type === 'text' ? { type: 'text', text: b.text || ' ' } : { type: 'tool_use', id: b.id, name: b.name, input: b.json ? JSON.parse(b.json) : {} })).filter((b) => b.type !== 'text' || b.text.trim()) });
    const results = [];
    for (const u of uses) {
      const t = tools.find((x) => x.name === u.name);
      let content, isErr = false;
      try {
        if (!t) throw new Error('Unbekanntes Werkzeug');
        const out = await t.execute(u.json ? JSON.parse(u.json) : {});
        content = typeof out === 'string' ? out : JSON.stringify(out);
      } catch (e) { content = 'Fehler: ' + (e && e.message ? e.message : String(e)); isErr = true; }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: content.slice(0, 24000), ...(isErr ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
    if (opts.onText) opts.onText({ text: '' });
  }
  return { text: finalText };
}

function firstJson(text) {
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{' && s[i] !== '[') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (!depth) { try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { break; } } }
    }
  }
  return null;
}

sample.json = async (prompt, opts = {}) => {
  const r = await sample(prompt, { ...opts, tools: [], maxTokens: 4000 });
  const v = firstJson(r.text);
  if (v == null) throw new SampleError('bad_json', 'Antwort war kein gültiges JSON');
  return v;
};
