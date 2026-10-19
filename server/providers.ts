import { HttpError, redact, Vault } from './security';
import type { Store } from './store';
import type { Model, Provider, Snapshot, ToolCall, ToolDefinition, WireMessage } from './schema';

export interface Usage { input: number; output: number }
export interface ModelResult { content: string; calls: ToolCall[]; usage?: Usage }
export function validateProviderUrl(input: string) {
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash) throw new HttpError(400, 'Provider URL cannot contain credentials, query parameters, or fragments.');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new HttpError(400, 'Hosted providers require HTTPS. HTTP is supported only on loopback.');
  return url.toString().replace(/\/$/, '');
}
export function buildPayload(provider: Provider, model: Model, messages: WireMessage[], definitions: ToolDefinition[], outputReserve: number): Record<string, unknown> {
  if (provider.kind === 'ollama') return {
    model: model.id, messages: messages.map(m => ({ role: m.role, content: m.content ?? '',
      ...(m.images?.length ? { images: m.images.map(i => i.split(',')[1]) } : {}),
      ...(m.tool_calls ? { tool_calls: m.tool_calls.map(t => ({ function: { name: t.function.name, arguments: JSON.parse(t.function.arguments) } })) } : {}),
      ...(m.tool_call_id ? { tool_name: m.tool_call_id } : {}),
    })), stream: true, options: { num_ctx: model.contextWindow, num_predict: outputReserve },
    ...(definitions.length && model.tools ? { tools: definitions } : {}),
  };
  return { model: model.id, messages: messages.map(m => ({ role: m.role,
    content: m.images?.length ? [{ type: 'text', text: m.content ?? '' }, ...m.images.map(url => ({ type: 'image_url', image_url: { url, detail: 'low' } }))] : m.content,
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}), ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
  })), stream: true, max_completion_tokens: outputReserve, ...(definitions.length && model.tools ? { tools: definitions } : {}) };
}

export class Providers {
  constructor(private store: Store, private vault: Vault) {}
  key(providerId: string) { return this.vault.decrypt(this.store.providerCipher(providerId)); }
  secrets() { return this.store.providers().map(p => this.key(p.id)).filter(Boolean); }
  async discover(providerId: string): Promise<Model[]> {
    const p = this.store.providers().find(x => x.id === providerId);
    if (!p) throw new HttpError(404, 'Provider not found');
    const response = await this.fetch(p, p.kind === 'ollama' ? '/api/tags' : '/models', undefined, AbortSignal.timeout(20_000));
    const data = await response.json() as any;
    let models: Model[];
    if (p.kind === 'ollama') {
      models = [];
      // Bound introspection; discovery remains useful if a server does not implement /api/show.
      for (const m of (data.models ?? []).slice(0, 100)) {
        let info: any = {};
        try { info = await (await this.fetch(p, '/api/show', { model: m.name }, AbortSignal.timeout(5_000))).json(); } catch { /* explicit fallback below */ }
        const limit = Object.entries(info.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))?.[1];
        const previous = p.models.find(v => v.id === m.name);
        models.push({ id: m.name, name: m.name, contextWindow: previous?.contextSource === 'user' ? previous.contextWindow : typeof limit === 'number' ? limit : 8192, contextSource: previous?.contextSource === 'user' ? 'user' : typeof limit === 'number' ? 'provider' : 'fallback', tools: (info.capabilities ?? []).includes('tools'), vision: (info.capabilities ?? []).includes('vision') });
      }
    } else {
      models = (data.data ?? []).filter((m: any) => typeof m.id === 'string').slice(0, 200).map((m: any): Model => {
        const prev = p.models.find(x => x.id === m.id); const limit = m.context_length ?? m.context_window ?? m.top_provider?.context_length;
        return { id: m.id, name: m.name ?? m.id, contextWindow: prev?.contextSource === 'user' ? prev.contextWindow : Number.isInteger(limit) && limit >= 2048 ? limit : 8192, contextSource: prev?.contextSource === 'user' ? 'user' : Number.isInteger(limit) && limit >= 2048 ? 'provider' : 'fallback', tools: prev?.tools ?? (m.supported_parameters?.includes('tools') ?? false), vision: prev?.vision ?? m.architecture?.input_modalities?.includes('image') ?? false };
      });
    }
    this.store.saveProvider({ ...p, models }); return models;
  }
  private async fetch(p: Provider, endpoint: string, body?: unknown, signal?: AbortSignal) {
    const key = this.key(p.id);
    let response: Response;
    try { response = await fetch(`${validateProviderUrl(p.baseUrl)}${endpoint}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { Authorization: `Bearer ${key}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, redirect: 'error' }); }
    catch (e) { if (signal?.aborted) throw e; throw new HttpError(502, `Cannot reach ${p.name}. Check its URL and that the provider is running. ${redact((e as Error).message, [key])}`); }
    if (!response.ok) {
      const detail = redact((await response.text()).slice(0, 1500), [key]);
      throw new HttpError(502, `${p.name} returned ${response.status}: ${detail}`);
    }
    return response;
  }
  async stream(snapshot: Snapshot, signal: AbortSignal, onDelta: (s: string) => void): Promise<ModelResult> {
    const p = this.store.providers().find(p => p.id === snapshot.providerId);
    if (!p) throw new HttpError(400, 'The selected provider has been removed.');
    const response = await this.fetch(p, p.kind === 'ollama' ? '/api/chat' : '/chat/completions', snapshot.payload, signal);
    if (!response.body) throw new Error('The provider returned no stream.');
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    let buffer = ''; let content = ''; let usage: Usage | undefined; let finished = false;
    const calls = new Map<number, ToolCall>();
    function consume(line: string) {
      const raw = p!.kind === 'ollama' ? line.trim() : line.startsWith('data:') ? line.slice(5).trim() : '';
      if (!raw) return;
      if (raw === '[DONE]') { finished = true; return; }
      let packet: any;
      try { packet = JSON.parse(raw); } catch { throw new Error('Provider sent malformed streaming JSON.'); }
      if (packet.error) throw new Error(redact(typeof packet.error === 'string' ? packet.error : packet.error.message ?? 'Provider error'));
      if (p!.kind === 'ollama') {
        if (packet.message?.content) { content += packet.message.content; onDelta(packet.message.content); }
        for (const [index, t] of (packet.message?.tool_calls ?? []).entries()) calls.set(index, { id: `ollama-${index}`, type: 'function', function: { name: t.function.name, arguments: JSON.stringify(t.function.arguments) } });
        if (packet.done) { finished = true; usage = { input: packet.prompt_eval_count ?? 0, output: packet.eval_count ?? 0 }; }
      } else {
        const choice = packet.choices?.[0]; const delta = choice?.delta;
        if (delta?.content) { content += delta.content; onDelta(delta.content); }
        for (const t of delta?.tool_calls ?? []) {
          const existing = calls.get(t.index) ?? { id: t.id ?? `call-${t.index}`, type: 'function', function: { name: '', arguments: '' } };
          if (t.id) existing.id = t.id;
          existing.function.name += t.function?.name ?? ''; existing.function.arguments += t.function?.arguments ?? ''; calls.set(t.index, existing);
        }
        if (choice?.finish_reason) finished = true;
        if (packet.usage) usage = { input: packet.usage.prompt_tokens ?? 0, output: packet.usage.completion_tokens ?? 0 };
      }
    }
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 2_000_000) throw new Error('Provider stream line exceeds the safety limit.');
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1); consume(line); }
      }
      buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
      if (!finished) throw new Error('Provider connection closed before generation completed. Retry the response.');
      return { content, calls: [...calls.values()], usage };
    } finally { await reader.cancel().catch(() => {}); }
  }
}
