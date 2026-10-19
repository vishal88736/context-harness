import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, CircleAlert, Folder, GitBranch, Layers3, Menu, MessageSquare, PanelRightOpen, ShieldCheck, X } from 'lucide-react';
import { activeModel, api, setToken, streamChat, type Bootstrap, type ContextConfig, type Conversation, type Detail, type Message, type Snapshot, type Source, type ToolExecution } from './api';
import { Sidebar } from './components/Sidebar';
import { ContextPanel, AddSourceDialog } from './components/ContextPanel';
import { Composer, EmptyWorkspace, MessageList } from './components/Chat';
import { Inspector } from './components/Inspector';
import { SettingsDialog } from './components/Settings';
import { ProfilesDialog } from './components/Profiles';
import { Logo, Modal, Spinner } from './components/ui';

type Draft = { prompt: string; instructions: string; attachments: Source[]; override: string };
const blankDraft = (): Draft => ({ prompt: '', instructions: '', attachments: [], override: '' });
export function App() {
  const [data, setData] = useState<Bootstrap | null>(null); const [detail, setDetail] = useState<Detail | null>(null);
  const [activeId, setActiveId] = useState(''); const activeRef = useRef(activeId); activeRef.current = activeId;
  const [workspaceId, setWorkspaceId] = useState(''); const [error, setError] = useState(''); const [toast, setToast] = useState('');
  const [search, setSearch] = useState(''); const [sidebarMobile, setSidebarMobile] = useState(false);
  const [contextOpen, setContextOpen] = useState(() => localStorage.getItem('canopy.contextOpen') !== 'false');
  const [panelWidth, setPanelWidth] = useState(() => Number(localStorage.getItem('canopy.contextWidth')) || 344);
  const [dialog, setDialog] = useState<'settings' | 'profiles' | 'add' | null>(null); const [settingsTab, setSettingsTab] = useState('providers');
  const [action, setAction] = useState<{ conversation: Conversation; kind: string } | null>(null); const [rename, setRename] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}); const draft = drafts[activeId] ?? blankDraft();
  const [running, setRunning] = useState<Set<string>>(new Set()); const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null); const [isPreview, setIsPreview] = useState(false);
  const [inspector, setInspector] = useState<{ snapshot: Snapshot; preview: boolean; sendable: boolean } | null>(null);
  const queues = useRef(new Map<string, Promise<unknown>>()); const sequences = useRef(new Map<string, number>());
  const streams = useRef(new Map<string, AbortController>()); const mounted = useRef(true);
  const conversation = detail?.conversation.id === activeId ? detail.conversation : data?.conversations.find(c => c.id === activeId);
  const workspace = data?.workspaces.find(w => w.id === workspaceId);
  const selected = data ? activeModel(data, conversation, draft.override || undefined) : {};
  const enabled = conversation?.config.sources.filter(s => s.enabled).length ?? 0;
  const isRunning = running.has(activeId) || !!detail?.running;
  const updateDraft = (changes: Partial<Draft>) => setDrafts(prev => ({ ...prev, [activeId]: { ...(prev[activeId] ?? blankDraft()), ...changes } }));
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 3200); };
  const refresh = useCallback(async () => { const b = await api<Bootstrap>('/bootstrap'); setToken(b.csrf); setData(b); }, []);
  async function load(id: string) {
    setActiveId(id); activeRef.current = id; setSidebarMobile(false); setSnapshot(null); setInspector(null); setError('');
    localStorage.setItem('canopy.activeConversation', id);
    const d = await api<Detail>(`/conversations/${id}`); if (activeRef.current !== id) return;
    setDetail(d); setWorkspaceId(d.conversation.workspaceId);
    if (d.running) setRunning(prev => new Set([...prev, id]));
  }
  async function create(workspace = workspaceId) {
    try { const c = await api<Conversation>('/conversations', 'POST', { workspaceId: workspace }); await refresh(); await load(c.id); setTimeout(() => document.getElementById('message-composer')?.focus(), 50); }
    catch (e) { setError((e as Error).message); }
  }
  async function chooseWorkspace(id: string) {
    setWorkspaceId(id); const c = data?.conversations.find(c => c.workspaceId === id); if (c) await load(c.id); else await create(id);
  }
  useEffect(() => {
    mounted.current = true; let cancelled = false;
    void (async () => {
      try {
        const b = await api<Bootstrap>('/bootstrap'); if (cancelled) return; setToken(b.csrf); setData(b);
        const stored = localStorage.getItem('canopy.activeConversation'); const c = b.conversations.find(c => c.id === stored) ?? b.conversations[0];
        if (c) { setWorkspaceId(c.workspaceId); await load(c.id); }
        else { const w = b.workspaces[0]; setWorkspaceId(w.id); const created = await api<Conversation>('/conversations', 'POST', { workspaceId: w.id }); if (cancelled) return; setData({ ...b, conversations: [created] }); await load(created.id); }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    })();
    return () => { cancelled = true; mounted.current = false; };
  }, []);
  useEffect(() => {
    const theme = data?.settings.theme ?? 'dark'; const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme;
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [data?.settings.theme]);
  useEffect(() => { localStorage.setItem('canopy.contextOpen', String(contextOpen)); }, [contextOpen]);
  useEffect(() => { localStorage.setItem('canopy.contextWidth', String(panelWidth)); }, [panelWidth]);
  useEffect(() => {
    function shortcuts(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSidebarMobile(true); setTimeout(() => document.getElementById('conversation-search')?.focus(), 30); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); void create(); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); setContextOpen(v => !v); }
      if (e.key === 'Escape' && !dialog && !inspector && !action) { setSidebarMobile(false); if (window.innerWidth < 1100) setContextOpen(false); }
    }
    document.addEventListener('keydown', shortcuts); return () => document.removeEventListener('keydown', shortcuts);
  });
  // A second window can inspect and stop a running chat. Poll only when no local stream owns it.
  useEffect(() => {
    if (!detail?.running || streams.current.has(activeId)) return;
    const timer = setInterval(() => { void api<Detail>(`/conversations/${activeId}`).then(d => { if (activeRef.current !== activeId) return; setDetail(d); if (!d.running) setRunning(prev => { const next = new Set(prev); next.delete(activeId); return next; }); }).catch(e => setError(e.message)); }, 1500);
    return () => clearInterval(timer);
  }, [activeId, detail?.running]);
  async function updateConfig(config: ContextConfig) {
    const cid = activeId; const sequence = (sequences.current.get(cid) ?? 0) + 1; sequences.current.set(cid, sequence);
    setSnapshot(null); setIsPreview(false); setSaving(n => n + 1);
    setDetail(d => d?.conversation.id === cid ? { ...d, conversation: { ...d.conversation, config } } : d);
    setData(b => b ? { ...b, conversations: b.conversations.map(c => c.id === cid ? { ...c, config } : c) } : b);
    const previous = queues.current.get(cid) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const c = await api<Conversation>(`/conversations/${cid}`, 'PATCH', { config });
      if (sequences.current.get(cid) === sequence) { setDetail(d => d?.conversation.id === cid ? { ...d, conversation: c } : d); setData(b => b ? { ...b, conversations: b.conversations.map(x => x.id === cid ? c : x) } : b); }
    }).catch(e => setError(e.message)).finally(() => setSaving(n => Math.max(0, n - 1)));
    queues.current.set(cid, operation); await operation;
  }
  function inputFor(d = draft) {
    const [providerId, ...rest] = d.override.split('::');
    return { prompt: d.prompt.trim() || 'Inspect the configured context for this conversation.', instructions: d.instructions, attachments: d.attachments, ...(d.override ? { providerId, modelId: rest.join('::') } : {}) };
  }
  async function preview() {
    if (!selected.model) { setSettingsTab('providers'); setDialog('settings'); return; }
    setBusy(true); setError('');
    try { await queues.current.get(activeId); const s = await api<Snapshot>(`/conversations/${activeId}/preview`, 'POST', inputFor()); setSnapshot(s); setIsPreview(true); setInspector({ snapshot: s, preview: true, sendable: !!draft.prompt.trim() }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function send(previewHash?: string, retry?: Message) {
    const cid = activeId; if (running.has(cid) || !selected.model || !detail) return;
    let retryPrompt: string | undefined;
    if (retry) { const i = detail.messages.findIndex(m => m.id === retry.id); retryPrompt = detail.messages[i - 1]?.role === 'user' ? detail.messages[i - 1].content : undefined; if (!retryPrompt) return; }
    const input = { ...inputFor(), ...(retryPrompt ? { prompt: retryPrompt, retryMessageId: retry!.id } : {}), ...(previewHash ? { previewHash } : {}) };
    if (!input.prompt.trim()) return;
    await queues.current.get(cid); const controller = new AbortController(); streams.current.set(cid, controller);
    setRunning(prev => new Set([...prev, cid])); setInspector(null); setError(''); setProgress('Composing context…');
    let accepted = false;
    try {
      await streamChat(cid, input, event => {
        if (event.type === 'message') {
          if (!accepted) { accepted = true; if (!retry) setDrafts(prev => ({ ...prev, [cid]: { ...(prev[cid] ?? blankDraft()), prompt: '', instructions: '', attachments: [], override: '' } })); }
          if (activeRef.current === cid) setDetail(d => d?.conversation.id === cid ? { ...d, messages: [...d.messages.filter(m => m.id !== event.message.id), event.message], running: true } : d);
        }
        if (event.type === 'delta' && activeRef.current === cid) setDetail(d => d?.conversation.id === cid ? { ...d, messages: d.messages.map(m => m.id === event.id ? { ...m, content: m.content + event.delta } : m) } : d);
        if (event.type === 'tool' && activeRef.current === cid) setDetail(d => d?.conversation.id === cid ? { ...d, executions: [...d.executions.filter(e => e.id !== event.execution.id), event.execution].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) } : d);
        if (event.type === 'snapshot' && activeRef.current === cid) { setSnapshot(event.snapshot); setIsPreview(false); }
        if (event.type === 'progress' && activeRef.current === cid) setProgress(event.label);
        if (event.type === 'error' && activeRef.current === cid) setError(event.message);
        if (event.type === 'title') setData(b => b ? { ...b, conversations: b.conversations.map(c => c.id === cid ? { ...c, title: event.title, updatedAt: new Date().toISOString() } : c) } : b);
      }, controller.signal);
    } catch (e) { if (!controller.signal.aborted && activeRef.current === cid) setError((e as Error).message); }
    finally {
      streams.current.delete(cid); setRunning(prev => { const next = new Set(prev); next.delete(cid); return next; });
      if (mounted.current) { try { const d = await api<Detail>(`/conversations/${cid}`); if (activeRef.current === cid) setDetail(d); await refresh(); } catch (e) { setError((e as Error).message); } }
    }
  }
  async function stop() { try { await api(`/conversations/${activeId}/stop`, 'POST'); } catch (e) { setError((e as Error).message); } }
  async function inspectInvocation(id: string) { try { const r = await api<{ snapshot: Snapshot }>(`/invocations/${id}`); setInspector({ snapshot: r.snapshot, preview: false, sendable: false }); } catch (e) { setError((e as Error).message); } }
  async function conversationAction(c: Conversation, kind: string) {
    if (kind === 'pin') { await api(`/conversations/${c.id}`, 'PATCH', { pinned: !c.pinned }); await refresh(); return; }
    setAction({ conversation: c, kind }); setRename(c.title);
  }
  async function confirmAction() {
    if (!action) return; setBusy(true);
    try {
      const c = action.conversation;
      if (action.kind === 'rename') await api(`/conversations/${c.id}`, 'PATCH', { title: rename });
      else await api(`/conversations/${c.id}`, 'DELETE');
      setAction(null); const b = await api<Bootstrap>('/bootstrap'); setToken(b.csrf); setData(b);
      if (action.kind === 'delete' && c.id === activeId) { const next = b.conversations.find(x => x.workspaceId === workspaceId); if (next) await load(next.id); else await create(); }
      else if (action.kind === 'rename' && c.id === activeId) setDetail(d => d ? { ...d, conversation: { ...d.conversation, title: rename } } : d);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!data || !workspace) return <div className="app-loading"><Logo/><h1>Room for your next idea.</h1>{error ? <><p role="alert">{error}</p><button className="primary-button" onClick={() => location.reload()}>Reconnect</button></> : <Spinner label="Opening your workspace…"/>}</div>;
  return <div className="app-shell"><a className="skip-link" href="#message-composer">Skip to composer</a><Sidebar data={data} activeId={activeId} workspaceId={workspaceId} search={search} setSearch={setSearch} onSelect={id => void load(id).catch(e => setError(e.message))} onNew={() => void create()} onWorkspace={id => void chooseWorkspace(id).catch(e => setError(e.message))} onContext={() => setContextOpen(v => !v)} onProfiles={() => setDialog('profiles')} onSettings={tab => { setSettingsTab(tab ?? 'providers'); setDialog('settings'); }} onAction={(c, a) => void conversationAction(c, a).catch(e => setError(e.message))} mobile={sidebarMobile} onClose={() => setSidebarMobile(false)} sources={enabled}/><main className="workspace-main"><header className="workspace-header"><button className="icon-button sidebar-mobile-toggle" aria-label="Open conversation sidebar" onClick={() => setSidebarMobile(true)}><Menu size={19}/></button><div className="workspace-breadcrumb"><Folder size={14}/><span>{workspace.name}</span><i>/</i><strong>{conversation?.title ?? 'New conversation'}</strong></div><div className="workspace-header-actions"><span className="local-workspace-status"><span className="status-dot"/>{saving ? 'Saving context…' : 'Local workspace'}</span><button className={`context-header-button ${contextOpen ? 'active' : ''}`} onClick={() => setContextOpen(v => !v)} aria-expanded={contextOpen}><PanelRightOpen size={15}/><span>Context</span><span className="count">{enabled}</span></button></div></header>{error && <div className="app-error" role="alert"><CircleAlert size={16}/><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={15}/></button></div>}<div className="conversation-stage">{detail?.conversation.id !== activeId ? <div className="loading-conversation"><Spinner label="Opening conversation…"/></div> : detail.messages.length ? <MessageList messages={detail.messages} executions={detail.executions} running={isRunning} progress={progress} onInspect={id => void inspectInvocation(id)} onRetry={m => void send(undefined, m)} onDecision={async (id, approve) => { await api(`/executions/${id}/decision`, 'POST', { approve }); notify(approve ? 'Action approved' : 'Action denied'); }}/> : <EmptyWorkspace workspaceName={workspace.name} onContext={() => { setContextOpen(true); setDialog('add'); }} onSuggestion={prompt => { updateDraft({ prompt }); document.getElementById('message-composer')?.focus(); }}/>}</div><Composer data={data} value={draft.prompt} onChange={prompt => updateDraft({ prompt })} instructions={draft.instructions} onInstructions={instructions => updateDraft({ instructions })} attachments={draft.attachments} onAttachments={attachments => updateDraft({ attachments })} modelValue={draft.override || (selected.provider && selected.model ? `${selected.provider.id}::${selected.model.id}` : '')} onModel={override => updateDraft({ override })} onSend={() => void send()} onStop={() => void stop()} onPreview={() => void preview()} onContext={() => setContextOpen(v => !v)} onSettings={() => { setSettingsTab('providers'); setDialog('settings'); }} running={isRunning} busy={busy || saving > 0} connected={!!selected.model} sourceCount={enabled}/>{conversation && <div className="conversation-model-bar"><button onClick={() => { setSettingsTab('providers'); setDialog('settings'); }}><span className="model-indicator"/>{selected.model?.name ?? 'No model connected'}<ChevronDown size={11}/></button>{selected.model && <button onClick={async () => { try { await api(`/conversations/${activeId}`, 'PATCH', { providerId: selected.provider!.id, modelId: selected.model!.id }); updateDraft({ override: '' }); await load(activeId); await refresh(); notify('Model assigned to this conversation'); } catch (e) { setError((e as Error).message); } }}>Use model for this chat</button>}<span><ShieldCheck size={11}/>Context stays in this conversation</span></div>}</main>{contextOpen && <><button className="context-mobile-scrim" onClick={() => setContextOpen(false)} aria-label="Close context overlay"/><ContextPanel conversation={conversation} workspace={workspace} data={data} onChange={c => void updateConfig(c)} onAdd={() => setDialog('add')} onProfiles={() => setDialog('profiles')} onInspect={() => void preview()} onClose={() => setContextOpen(false)} snapshot={snapshot} preview={isPreview} width={panelWidth} onResize={setPanelWidth}/></>}{dialog === 'settings' && <SettingsDialog data={data} workspaceId={workspaceId} initialTab={settingsTab} onRefresh={refresh} onClose={() => setDialog(null)} onWorkspace={id => void chooseWorkspace(id)}/>} {dialog === 'add' && conversation && <AddSourceDialog workspace={workspace} data={data} conversationId={activeId} onClose={() => setDialog(null)} onAdd={async sources => { await updateConfig({ ...conversation.config, sources: [...conversation.config.sources, ...sources] }); await refresh(); }}/>} {dialog === 'profiles' && conversation && <ProfilesDialog data={data} workspace={workspace} config={conversation.config} onRefresh={refresh} onClose={() => setDialog(null)} onApply={async profileId => { const c = await api<Conversation>(`/conversations/${activeId}/apply-profile`, 'POST', { profileId, mode: 'merge' }); setDetail(d => d ? { ...d, conversation: c } : d); setSnapshot(null); await refresh(); notify('Profile applied. Your conversation is intact.'); }}/>} {inspector && <Inspector snapshot={inspector.snapshot} preview={inspector.preview} onClose={() => setInspector(null)} busy={busy || isRunning} onSend={inspector.sendable ? () => void send(inspector.snapshot.previewHash) : undefined}/>} {action && <Modal title={action.kind === 'rename' ? 'Rename conversation' : 'Delete this conversation?'} onClose={() => setAction(null)}>{action.kind === 'rename' ? <label className="field padded">Conversation title<input value={rename} onChange={e => setRename(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && rename.trim()) void confirmAction(); }}/></label> : <p className="padded muted">“{action.conversation.title}” and its messages, context snapshots, and execution records will be permanently removed.</p>}<div className="modal-actions"><button className="secondary-button" onClick={() => setAction(null)}>Cancel</button><button className={action.kind === 'delete' ? 'danger-button' : 'primary-button'} disabled={busy || (action.kind === 'rename' && !rename.trim())} onClick={() => void confirmAction()}>{action.kind === 'delete' ? 'Delete conversation' : 'Save name'}</button></div></Modal>}{toast && <div className="toast" role="status"><Check size={15}/>{toast}</div>}</div>;
}
