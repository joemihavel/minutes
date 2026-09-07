"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { upload as uploadBlob } from "@vercel/blob/client";
import {
  AudioLines, Bot, Check, CircleHelp, Copy, FileAudio, FileText,
  HardDrive, Link2, LoaderCircle, Menu, MessageSquareText, MoreHorizontal, Pencil,
  Mic, Plus, RefreshCw, Search, Settings2, Share2, Sparkles, Trash2,
  Upload, UploadCloud, X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { AudioPlayer } from "@/components/elevenlabs-ui/audio-player";
import { ShimmeringText } from "@/components/elevenlabs-ui/shimmering-text";
import { GeminiIcon } from "@/components/provider-icons";
import { AssistantChat } from "@/components/workspace/assistant-chat";
import { RecordingDialog } from "@/components/workspace/recording-dialog";
import { SummaryContent } from "@/components/summary-content";
import { MAX_AUDIO_UPLOAD_BYTES, USER_STORAGE_LIMIT_BYTES } from "@/lib/limits";
import { MODEL_OPTIONS } from "@/lib/models";
import {
  clientUploadPath,
  matchesPersistedUpload,
  safeFilename,
} from "@/lib/clip-helpers";
import type { ClipDTO, ConnectionDTO, ModelCapability, Provider, TranscriptSegment, UsageDTO } from "@/lib/types";

type Pane = "library" | "transcript" | "chat";
type Dialog = "providers" | "usage" | "share" | "delete" | "recording" | null;
type DocumentView = "summary" | "transcript";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : data?.error?.message;
    throw new Error(message ?? "Something went wrong.");
  }
  return data as T;
}

function duration(seconds: number | null) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

function age(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

async function uploadAudio(
  file: File,
  clipId: string,
  onProgress: (progress: number) => void,
): Promise<{ clip: ClipDTO }> {
  const filename = safeFilename(file.name);
  const blob = await uploadBlob(clientUploadPath(clipId, filename), file, {
    access: "private",
    handleUploadUrl: "/api/clips/upload",
    clientPayload: JSON.stringify({
      clipId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    }),
    contentType: file.type,
    multipart: file.size > 5 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => {
      onProgress(Math.min(100, Math.round(percentage)));
    },
  });

  let lastError: unknown;
  for (const delay of [0, 500, 1_500]) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try {
      return await api<{ clip: ClipDTO }>(`/api/clips/${clipId}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url }),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("The recording uploaded, but could not be finalized. Please try again.");
}

async function reconcileUploadedClip(file: File, startedAt: string) {
  for (const delay of [0, 600, 1_600]) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try {
      const latest = await api<{ clips: ClipDTO[] }>("/api/clips");
      const recovered = latest.clips.find((clip) =>
        clip.hasAudio && matchesPersistedUpload(clip, file, startedAt),
      );
      if (recovered) return recovered;
    } catch {
      // Keep checking briefly: the upload may still be committing after a lost response.
    }
  }
  return undefined;
}

export function Workspace({ initialClips, initialConnections, initialUsage }: {
  initialClips: ClipDTO[]; initialConnections: ConnectionDTO[]; initialUsage: UsageDTO;
}) {
  const [clips, setClips] = useState(initialClips);
  const [selectedId, setSelectedId] = useState<string | null>(initialClips[0]?.id ?? null);
  const [connections, setConnections] = useState(initialConnections);
  const [usage, setUsage] = useState(initialUsage);
  const [pane, setPane] = useState<Pane>(initialClips.length ? "transcript" : "library");
  const [dialog, setDialog] = useState<Dialog>(() =>
    initialClips.length === 0 && !initialConnections.some((connection) => connection.connected)
      ? "providers"
      : null,
  );
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [revealingIds, setRevealingIds] = useState<Set<string>>(() => new Set());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    const firstReady = initialClips.find((clip) => clip.status === "ready");
    return new Set(firstReady ? [firstReady.id] : []);
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shareView, setShareView] = useState<DocumentView>("summary");
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const retryFilesRef = useRef(new Map<string, File>());
  const terminalNoticesRef = useRef(new Set<string>());
  const selected = clips.find((clip) => clip.id === selectedId) ?? null;
  const transcriptionReady = connections.some((item) => item.connected && item.models.transcription);
  const storagePercent = Math.min(100, (usage.storedBytes / USER_STORAGE_LIMIT_BYTES) * 100);
  const storageAvailableMb = Math.max(0, (USER_STORAGE_LIMIT_BYTES - usage.storedBytes) / 1024 / 1024);
  const storageAvailablePercent = Math.max(0, 100 - storagePercent);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const chooseClip = (id: string) => { setSelectedId(id); setPane("transcript"); };
  const finishTranscriptReveal = useCallback((id: string) => {
    setRevealingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const pendingClipIds = clips
    .filter((clip) => clip.status === "transcribing")
    .map((clip) => clip.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!pendingClipIds) return;
    const pending = new Set(pendingClipIds.split(","));
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const result = await api<{ clips: ClipDTO[] }>("/api/clips");
        if (cancelled) return;
        const fresh = new Map(result.clips.map((clip) => [clip.id, clip]));
        const completed = result.clips.filter(
          (clip) => pending.has(clip.id) && (clip.status === "ready" || clip.status === "failed"),
        );
        setClips((current) => current.map((clip) => fresh.get(clip.id) ?? clip));
        for (const clip of completed) {
          if (terminalNoticesRef.current.has(clip.id)) continue;
          terminalNoticesRef.current.add(clip.id);
          if (clip.status === "ready") {
            setCheckedIds((current) => {
              const next = new Set(current);
              if (next.size < 5) next.add(clip.id);
              return next;
            });
            setRevealingIds((current) => new Set(current).add(clip.id));
            showNotice("Transcript is ready.");
          } else {
            showNotice(clip.errorMessage ?? "The recording was saved, but transcription failed.");
          }
        }
        if (completed.length) {
          const usageResult = await api<{ usage: UsageDTO }>("/api/usage");
          if (!cancelled) setUsage(usageResult.usage);
        }
      } catch {
        // A temporary polling error should not hide or remove the saved recording.
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingClipIds]);

  function toggleChatSource(clip: ClipDTO) {
    if (clip.status !== "ready") return;
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(clip.id)) next.delete(clip.id);
      else if (next.size < 5) next.add(clip.id);
      else {
        showNotice("You can ask across up to five clips at a time.");
        return current;
      }
      return next;
    });
  }

  function removeChatSource(clipId: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      next.delete(clipId);
      return next;
    });
  }

  function requestDelete(id: string) {
    setDeleteId(id);
    setDialog("delete");
  }

  function startRecording() {
    if (!transcriptionReady) {
      setDialog("providers");
      showNotice("Connect Google AI or Groq before recording audio.");
      return;
    }
    setDialog("recording");
  }

  async function upload(file?: File) {
    if (!file) return;
    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      showNotice("A recording can use up to the 250 MB account storage limit.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const availableBytes = Math.max(0, USER_STORAGE_LIMIT_BYTES - usage.storedBytes);
    if (file.size > availableBytes) {
      showNotice(`This recording needs ${(file.size / 1024 / 1024).toFixed(1)} MB, but only ${storageAvailableMb.toFixed(1)} MB is available.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!transcriptionReady) { setDialog("providers"); showNotice("Connect Google AI or Groq before uploading audio."); return; }
    const temporaryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const temporaryClip: ClipDTO = {
      id: temporaryId,
      title: file.name.replace(/\.[^.]+$/, "") || "Untitled recording",
      originalFilename: file.name,
      mimeType: file.type,
      byteSize: file.size,
      durationSeconds: null,
      transcript: "",
      summary: "",
      segments: [],
      language: null,
      status: "uploading",
      errorMessage: null,
      hasAudio: false,
      shareSlug: null,
      shareIncludesAudio: false,
      createdAt: now,
      updatedAt: now,
    };
    setUploading(true);
    setUploadProgress((current) => ({ ...current, [temporaryId]: 0 }));
    setClips((items) => [temporaryClip, ...items]);
    setSelectedId(temporaryId);
    setPane("transcript");
    try {
      const { clip } = await uploadAudio(file, temporaryId, (progress) => {
        setUploadProgress((current) => ({ ...current, [temporaryId]: progress }));
        if (progress >= 100) {
          setClips((items) => items.map((item) => item.id === temporaryId ? { ...item, status: "transcribing" } : item));
        }
      });
      retryFilesRef.current.delete(temporaryId);
      setClips((items) => items.map((item) => item.id === temporaryId ? clip : item));
      setSelectedId(clip.id);
      const usageResult = await api<{ usage: UsageDTO }>("/api/usage"); setUsage(usageResult.usage);
      showNotice("Recording saved. Transcribing in the background.");
    } catch (error) {
      const recovered = await reconcileUploadedClip(file, now);
      if (recovered) {
        retryFilesRef.current.delete(temporaryId);
        setClips((items) => [recovered, ...items.filter((item) => item.id !== temporaryId && item.id !== recovered.id)]);
        setSelectedId(recovered.id);
        showNotice(recovered.status === "failed" ? "Recording saved. Transcription needs another try." : "Recording saved. Transcribing in the background.");
      } else {
        const message = error instanceof Error ? error.message : "The upload could not reach the server.";
        retryFilesRef.current.set(temporaryId, file);
        setClips((items) => items.map((item) => item.id === temporaryId
          ? { ...item, status: "failed", errorMessage: message, updatedAt: new Date().toISOString() }
          : item));
        setSelectedId(temporaryId);
        showNotice("Upload interrupted. Your file is ready to try again.");
      }
    } finally {
      setUploadProgress((current) => {
        const next = { ...current };
        delete next[temporaryId];
        return next;
      });
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function updateClip(patch: Partial<Pick<ClipDTO,"title"|"transcript">>) {
    if (!selected) return;
    const previous = selected;
    const optimisticPatch = patch.transcript === undefined ? patch : { ...patch, summary: "" };
    setClips((items) => items.map((x) => x.id === selected.id ? { ...x, ...optimisticPatch } : x));
    try {
      const { clip } = await api<{clip: ClipDTO}>(`/api/clips/${selected.id}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify(patch) });
      setClips((items) => items.map((x) => x.id === clip.id ? clip : x));
      showNotice("Saved.");
    } catch (error) { setClips((items) => items.map((x) => x.id === previous.id ? previous : x)); showNotice(error instanceof Error ? error.message : "Could not save."); }
  }

  async function retryTranscription(clip: ClipDTO) {
    const previous = clip;
    terminalNoticesRef.current.delete(clip.id);
    setClips((items) => items.map((item) => item.id === clip.id
      ? { ...item, status: "transcribing", errorMessage: null, updatedAt: new Date().toISOString() }
      : item));
    try {
      const result = await api<{ clip: ClipDTO }>(`/api/clips/${clip.id}/retry`, { method: "POST" });
      setClips((items) => items.map((item) => item.id === clip.id ? result.clip : item));
      showNotice("Trying the complete recording again.");
    } catch (error) {
      setClips((items) => items.map((item) => item.id === clip.id ? previous : item));
      showNotice(error instanceof Error ? error.message : "Could not retry transcription.");
    }
  }

  async function retryUpload(clip: ClipDTO) {
    const file = retryFilesRef.current.get(clip.id);
    if (!file) {
      fileRef.current?.click();
      return;
    }
    await fetch(`/api/clips/${clip.id}`, { method: "DELETE" }).catch(() => undefined);
    retryFilesRef.current.delete(clip.id);
    setClips((items) => items.filter((item) => item.id !== clip.id));
    setSelectedId((current) => current === clip.id ? null : current);
    await upload(file);
  }

  async function deleteClip() {
    const target = clips.find((clip) => clip.id === deleteId);
    if (!target) return;
    try {
      await api(`/api/clips/${target.id}`, { method:"DELETE" });
      const rest = clips.filter((clip) => clip.id !== target.id);
      setClips(rest);
      setCheckedIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
      if (selectedId === target.id) setSelectedId(rest[0]?.id ?? null);
      setDialog(null);
      setDeleteId(null);
      setPane(rest.length ? "transcript" : "library");
      showNotice("Clip deleted.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "Could not delete."); }
  }

  const visible = clips.filter((clip) => `${clip.title} ${clip.originalFilename}`.toLowerCase().includes(query.toLowerCase()));
  const sourceClips = useMemo(
    () => clips.filter((clip) => checkedIds.has(clip.id) && clip.status === "ready"),
    [checkedIds, clips],
  );
  const chatScopeKey = sourceClips.map((clip) => clip.id).sort().join(",");

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
        <button className="icon-button mobile-only" onClick={() => setPane("library")} aria-label="Open library"><Menu size={18}/></button>
        <Brand />
        <div className="topbar-actions">
          <button className="usage-pill" onClick={() => setDialog("usage")} aria-label={`${storageAvailableMb.toFixed(0)} megabytes of storage remaining; ${Math.round(usage.transcriptionSecondsToday/60)} minutes transcribed today`}>
            <HardDrive size={14}/>
            <span className="usage-pill-copy">
              <span className="usage-pill-values"><b>{storageAvailableMb.toFixed(0)} MB left</b><small>{Math.round(usage.transcriptionSecondsToday/60)} min today</small></span>
              <span className="usage-pill-track" aria-hidden="true"><i style={{transform:`scaleX(${storageAvailablePercent/100})`}}/></span>
            </span>
          </button>
          <button className="icon-button" onClick={() => setDialog("providers")} aria-label="AI connections"><Settings2 size={17}/></button>
          <UserButton />
        </div>
      </header>
      <nav className="mobile-tabs mobile-only" aria-label="Workspace panes">
        {(["library","transcript","chat"] as Pane[]).map((x)=><button className={pane===x?"active":""} key={x} onClick={()=>setPane(x)}>{x}</button>)}
      </nav>
      <div className="workspace-grid">
        <aside
          className={`library-pane ${dragging?"is-dragging":""} ${pane!=="library"?"mobile-hidden":""}`}
          onDragOver={(event)=>{event.preventDefault();setDragging(true)}}
          onDragLeave={(event)=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false)}}
          onDrop={(event)=>{event.preventDefault();setDragging(false);void upload(event.dataTransfer.files?.[0])}}
        >
          <div className="pane-heading"><h1>Audio library</h1></div>
          <input ref={fileRef} hidden type="file" accept="audio/*,.mp3,.m4a,.mp4,.wav,.webm,.ogg,.oga" onChange={(e)=>upload(e.target.files?.[0])}/>
          <div className="library-actions">
            <button className="record-button" disabled={uploading} onClick={startRecording}><Mic size={16}/><span><b>Start talking</b><small>Record & transcribe</small></span></button>
            <button className="upload-compact" disabled={uploading} onClick={()=>fileRef.current?.click()}>
              {uploading?<LoaderCircle className="spin" size={16}/>:<UploadCloud size={16}/>}<span><b>{uploading?"Processing…":"Upload audio"}</b><small>or drop a file here</small></span>
            </button>
          </div>
          <label className="search-box"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search clips"/></label>
          <div className="source-summary"><span>Chat sources</span><b>{checkedIds.size}/5 selected</b></div>
          <div className="clip-list">
            {!visible.length && <div className="empty-list"><AudioLines/><b>{clips.length?"No matching clips":"Your library is quiet"}</b><p>{clips.length?"Try a different search.":"Upload a recording to create your first transcript."}</p></div>}
            {visible.map((clip)=><div className={`clip-row ${selectedId===clip.id?"active":""}`} key={clip.id}>
              <label className="source-check" title={clip.status==="ready"?"Include this clip in chat":"Available after transcription"}>
                <input type="checkbox" checked={checkedIds.has(clip.id)} disabled={clip.status!=="ready"} onChange={()=>toggleChatSource(clip)}/><span aria-hidden="true"><Check size={11}/></span>
              </label>
              <button className="clip-main" onClick={()=>chooseClip(clip.id)}>
                <span className="clip-icon"><FileAudio size={16}/></span>
                <span className="clip-copy"><b>{clip.title}</b><small>{clip.status==="uploading"?`Uploading ${uploadProgress[clip.id]??0}%`:clip.status==="transcribing"?"Transcribing audio…":clip.status==="failed"?`${clip.hasAudio?"Transcription":"Upload"} failed · open to retry`:`${age(clip.updatedAt)} · ${duration(clip.durationSeconds)}`}</small>{(clip.status==="uploading"||clip.status==="transcribing")&&<i className="clip-progress"><span style={{transform:`scaleX(${clip.status==="uploading"?(uploadProgress[clip.id]??3)/100:.74})`}}/></i>}</span>
              </button>
              {clip.status!=="uploading"&&clip.hasAudio?<button className="clip-delete" onClick={()=>requestDelete(clip.id)} aria-label={`Delete ${clip.title}`} title="Delete clip"><Trash2 size={14}/></button>:<span className={`status-dot ${clip.status}`}/>}
            </div>)}
          </div>
        </aside>
        <section className={`transcript-pane ${pane!=="transcript"?"mobile-hidden":""}`}>
          {selected
            ? selected.status === "ready"
              ? <Transcript key={selected.id} clip={selected} connections={connections} reveal={revealingIds.has(selected.id)} onRevealComplete={finishTranscriptReveal} onUpdate={updateClip} onReplace={(next)=>setClips((items)=>items.map((item)=>item.id===next.id?next:item))} onShare={(view)=>{setShareView(view);setDialog("share")}} onDelete={()=>requestDelete(selected.id)} onChat={()=>setPane("chat")} onConnect={()=>setDialog("providers")} notify={showNotice}/>
              : <ProcessingClip clip={selected} progress={uploadProgress[selected.id]} onRetry={()=>selected.hasAudio?void retryTranscription(selected):void retryUpload(selected)}/>
            : <EmptyWorkspace onUpload={()=>fileRef.current?.click()}/>}
        </section>
        <aside className={`chat-pane ${pane!=="chat"?"mobile-hidden":""}`}>
          {sourceClips.length ? <AssistantChat key={chatScopeKey} clips={sourceClips} connections={connections} onConnect={()=>setDialog("providers")} onRemoveClip={removeChatSource}/> : <div className="chat-empty"><MessageSquareText/><b>Select chat sources</b><p>Check one or more ready clips in the library to ask questions across them.</p></div>}
        </aside>
      </div>
      {dialog==="providers"&&<ProviderDialog connections={connections} setConnections={setConnections} close={()=>setDialog(null)} notify={showNotice}/>}
      {dialog==="recording"&&<RecordingDialog close={()=>setDialog(null)} onRecorded={(file)=>{setDialog(null);void upload(file)}}/>}
      {dialog==="usage"&&<UsageDialog usage={usage} close={()=>setDialog(null)}/>}
      {dialog==="share"&&selected&&<ShareDialog clip={selected} view={shareView} setClip={(clip)=>setClips((xs)=>xs.map((x)=>x.id===clip.id?clip:x))} close={()=>setDialog(null)} notify={showNotice}/>}
      {dialog==="delete"&&deleteId&&<ConfirmDialog title="Delete this clip?" body="The recording, transcript, related chats, and public link will be permanently removed." confirm="Delete clip" onConfirm={deleteClip} close={()=>{setDialog(null);setDeleteId(null)}}/>}
      {notice&&<div className="toast"><Check size={15}/>{notice}</div>}
    </main>
  );
}

function EmptyWorkspace({onUpload}:{onUpload:()=>void}) { return <div className="empty-workspace"><span><AudioLines size={26}/></span><h2>Turn a recording into something useful.</h2><p>Your transcript and clip-aware assistant will live here.</p><button className="button primary" onClick={onUpload}><Upload size={16}/> Upload audio</button></div>; }

function ProcessingClip({clip,progress,onRetry}:{clip:ClipDTO;progress?:number;onRetry:()=>void}) {
  const uploaded=clip.status!=="uploading";
  const failed=clip.status==="failed";
  return <div className={`processing-clip ${failed?"failed":""}`}><div className="processing-orbit">{failed?<CircleHelp size={25}/>:<AudioLines size={25}/>} {!failed&&<i/>}</div><span className="kicker">{failed?clip.hasAudio?"TRANSCRIPTION FAILED":"UPLOAD INTERRUPTED":uploaded?"TRANSCRIBING":"UPLOADING"}</span><h2>{clip.title}</h2><p>{failed?(clip.errorMessage??"The recording is saved, but it could not be transcribed."):uploaded?<ShimmeringText text="Recording saved. We’re transcribing the complete audio and identifying speakers."/>:`Sending your recording securely… ${progress??0}%`}</p>{failed?<button type="button" className="button dark processing-retry" onClick={onRetry}><RefreshCw size={15}/>{clip.hasAudio?"Try transcription again":"Try upload again"}</button>:<div className="processing-meter"><i style={{transform:`scaleX(${uploaded?.74:(progress??3)/100})`}}/></div>}<small>{failed?clip.hasAudio?"Your original audio is safely stored.":"Your file is still available in this tab.":uploaded?"You can browse other clips while this finishes.":"Keep this tab open until the upload completes."}</small></div>;
}

function Transcript({clip,connections,reveal,onRevealComplete,onUpdate,onReplace,onShare,onDelete,onChat,onConnect,notify}:{clip:ClipDTO;connections:ConnectionDTO[];reveal:boolean;onRevealComplete:(id:string)=>void;onUpdate:(x:Partial<Pick<ClipDTO,"title"|"transcript">>)=>void;onReplace:(x:ClipDTO)=>void;onShare:(view:DocumentView)=>void;onDelete:()=>void;onChat:()=>void;onConnect:()=>void;notify:(message:string)=>void}) {
  const [title,setTitle]=useState(clip.title), [editing,setEditing]=useState(false), [text,setText]=useState(clip.transcript), [textEditing,setTextEditing]=useState(false), [menu,setMenu]=useState(false);
  const [view,setView]=useState<DocumentView>("summary"), [summaryLoading,setSummaryLoading]=useState(false), [summaryError,setSummaryError]=useState<string|null>(null);
  const summaryRequested=useRef(false);
  const menuRef=useRef<HTMLDivElement>(null);
  const summaryProvider:Provider|null=connections.some((item)=>item.provider==="google"&&item.connected)?"google":connections.some((item)=>item.provider==="groq"&&item.connected)?"groq":null;
  const generateSummary=useCallback(async(regenerate=false)=>{
    if(!summaryProvider)return;
    setSummaryLoading(true);setSummaryError(null);
    try{
      const result=await api<{clip:ClipDTO}>(`/api/clips/${clip.id}/summary`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({provider:summaryProvider,regenerate})});
      onReplace(result.clip);
      if(regenerate)notify("Summary refreshed.");
    }catch(error){setSummaryError(error instanceof Error?error.message:"Could not create the summary.")}finally{setSummaryLoading(false)}
  },[clip.id,notify,onReplace,summaryProvider]);
  useEffect(()=>{
    if(clip.summary||!summaryProvider||summaryRequested.current)return;
    summaryRequested.current=true;
    void generateSummary();
  },[clip.summary,generateSummary,summaryProvider]);
  useEffect(()=>{
    if(!menu)return;
    const dismiss=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))setMenu(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setMenu(false)};
    document.addEventListener("pointerdown",dismiss);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape)};
  },[menu]);
  const activeContent=view==="summary"?clip.summary:clip.transcript;
  const copyActive=async()=>{if(!activeContent)return;await navigator.clipboard.writeText(activeContent);notify(`${view==="summary"?"Summary":"Transcript"} copied.`)};
  return <div className="document">
    <header className="document-header"><div className="document-title">{editing?<form onSubmit={(e)=>{e.preventDefault();setEditing(false);if(title.trim()!==clip.title)onUpdate({title:title.trim()})}}><input autoFocus value={title} maxLength={160} onChange={(e)=>setTitle(e.target.value)} onBlur={()=>{setEditing(false);if(title.trim()&&title.trim()!==clip.title)onUpdate({title:title.trim()})}}/></form>:<h2 onDoubleClick={()=>setEditing(true)}>{clip.title}<button className="title-edit" onClick={()=>setEditing(true)} aria-label="Rename"><Pencil size={14}/></button></h2>}<p>{duration(clip.durationSeconds)} · {clip.language??"Auto-detected"} · {new Intl.DateTimeFormat("en",{dateStyle:"medium"}).format(new Date(clip.createdAt))}</p></div><div className="document-actions"><div className="menu-wrap" ref={menuRef}><button className="icon-button" aria-label="More actions" aria-expanded={menu} onClick={()=>setMenu(!menu)}><MoreHorizontal size={18}/></button>{menu&&<div className="popover"><button className="danger" onClick={()=>{setMenu(false);onDelete()}}><Trash2 size={14}/>Delete clip</button></div>}</div></div></header>
    {clip.hasAudio&&<AudioPlayer id={clip.id} title={clip.title} src={`/api/clips/${clip.id}/audio`}/>}
    <div className="document-switcher">
      <div className="document-tabs" role="tablist" aria-label="Recording content"><button role="tab" aria-controls="recording-content" aria-selected={view==="summary"} className={view==="summary"?"active":""} onClick={()=>setView("summary")}><Sparkles size={14}/>Summary</button><button role="tab" aria-controls="recording-content" aria-selected={view==="transcript"} className={view==="transcript"?"active":""} onClick={()=>setView("transcript")}><FileText size={14}/>Transcript</button></div>
      <div className="document-tools">
        {view==="transcript"&&<button onClick={()=>setTextEditing(!textEditing)}><Pencil size={13}/>{textEditing?"Cancel":"Edit"}</button>}
        {view==="summary"&&clip.summary&&<button disabled={summaryLoading} onClick={()=>void generateSummary(true)}><RefreshCw className={summaryLoading?"spin":""} size={13}/>Refresh</button>}
        <button disabled={!activeContent||summaryLoading} onClick={()=>void copyActive()}><Copy size={13}/>Copy</button>
        <button disabled={view==="summary"&&!clip.summary} onClick={()=>onShare(view)}><Share2 size={13}/>Share</button>
      </div>
    </div>
    <div className="document-content" id="recording-content" role="tabpanel" aria-label={view==="summary"?"Detailed summary":"Transcript"}>
      {view==="summary"?<SummaryBody summary={clip.summary} loading={summaryLoading} error={summaryError} connected={Boolean(summaryProvider)} onRetry={()=>void generateSummary()} onConnect={onConnect}/>:textEditing?<div className="transcript-editor"><textarea aria-label="Transcript text" value={text} onChange={(e)=>setText(e.target.value)} maxLength={250000}/><div><button className="button secondary" onClick={()=>{setText(clip.transcript);setTextEditing(false)}}>Cancel</button><button className="button dark" onClick={()=>{onUpdate({transcript:text});setTextEditing(false)}}>Save transcript</button></div></div>:<><div className="transcript-meta">{clip.transcript.split(/\s+/).filter(Boolean).length.toLocaleString()} words</div><TranscriptBody clipId={clip.id} transcript={clip.transcript} segments={clip.segments} reveal={reveal} onRevealComplete={onRevealComplete}/></>}
    </div>
    <button className="mobile-chat-cta mobile-only" onClick={onChat}><Sparkles size={16}/>Ask this clip</button>
  </div>;
}

function SummaryBody({summary,loading,error,connected,onRetry,onConnect}:{summary:string;loading:boolean;error:string|null;connected:boolean;onRetry:()=>void;onConnect:()=>void}){
  if(loading&&!summary)return <div className="summary-loading" role="status" aria-live="polite"><span className="summary-pulse"><Sparkles size={18}/></span><div><b>Creating a detailed summary</b><p>Pulling out key points, decisions, and action items…</p></div><i/><i/><i/></div>;
  if(!connected&&!summary)return <div className="summary-empty"><Sparkles size={20}/><h3>Connect an AI model for summaries</h3><p>Your transcript is ready. Connect Groq or Google AI to turn it into a structured summary.</p><button className="button dark" onClick={onConnect}>Open AI setup</button></div>;
  if(error&&!summary)return <div className="summary-empty error" role="alert"><CircleHelp size={20}/><h3>Summary could not be created</h3><p>{error}</p><button className="button secondary" onClick={onRetry}>Try again</button></div>;
  if(!summary)return <div className="summary-empty"><Sparkles size={20}/><h3>Create an updated summary</h3><p>The transcript changed, so the previous summary was cleared to keep everything accurate.</p><button className="button dark" onClick={onRetry}>Generate summary</button></div>;
  return <SummaryContent summary={summary}/>;
}

function ProgressiveTranscript({clipId,transcript,onComplete}:{clipId:string;transcript:string;onComplete:(id:string)=>void}) {
  const words=useMemo(()=>transcript.split(/\s+/).filter(Boolean),[transcript]);
  const [visible,setVisible]=useState(0);
  useEffect(()=>{
    let frame=0;
    const started=performance.now();
    const runFor=Math.min(14_000,Math.max(2_200,words.length*24));
    const tick=(now:number)=>{
      const next=Math.min(words.length,Math.ceil(((now-started)/runFor)*words.length));
      setVisible(next);
      if(next<words.length) frame=requestAnimationFrame(tick);
      else onComplete(clipId);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[clipId,onComplete,words]);
  return <div className="transcript-copy progressive" aria-live="polite" aria-busy={visible<words.length}><p>{words.slice(0,visible).join(" ")}{visible<words.length&&<i className="transcript-caret"/>}</p></div>;
}

function TranscriptBody({clipId,transcript,segments,reveal,onRevealComplete}:{clipId:string;transcript:string;segments:TranscriptSegment[];reveal:boolean;onRevealComplete:(id:string)=>void}) {
  if (!transcript) return <div className="transcript-copy empty">No transcript text is available.</div>;
  if (reveal) return <ProgressiveTranscript clipId={clipId} transcript={transcript} onComplete={onRevealComplete}/>;
  if (!segments.length) return <div className="transcript-copy"><p>{transcript}</p></div>;
  const speakerTones=new Map<string,number>();
  return <div className="segments">{segments.map((s,i)=>{
    const speaker=s.speaker?.trim();
    if(speaker&&!speakerTones.has(speaker))speakerTones.set(speaker,speakerTones.size%4);
    const tone=speaker?speakerTones.get(speaker)??0:i%4;
    return <p className={`tone-${tone}`} key={`${s.startSecond}-${i}`}><time>{duration(s.startSecond)}</time><span className="segment-copy">{speaker&&<small>{speaker}</small>}{s.text}</span></p>;
  })}</div>;
}

function Modal({title,subtitle,close,children,className=""}:{title:string;subtitle?:string;close:()=>void;children:React.ReactNode;className?:string}) {
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")close()};document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape)},[close]);
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)close()}}><section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={close} aria-label="Close"><X size={18}/></button></header>{children}</section></div>;
}

function ModelRoute({title,description,provider,capability,connection,setConnections,notify,onConnect}:{title:string;description:string;provider:Provider;capability:ModelCapability;connection:ConnectionDTO|undefined;setConnections:(x:ConnectionDTO[])=>void;notify:(x:string)=>void;onConnect:()=>void}) {
  const selected=connection?.models[capability]??"";
  const options=Array.from(new Set([...(MODEL_OPTIONS[provider][capability]??[]),selected].filter(Boolean)));
  const [custom,setCustom]=useState(false),[customId,setCustomId]=useState(""),[saving,setSaving]=useState(false);
  const customRef=useRef<HTMLDivElement>(null);
  const providerLabel=provider==="groq"?"Groq":"Google AI";
  const closeCustom=useCallback(()=>{setCustom(false);setCustomId("")},[]);
  useEffect(()=>{
    if(!custom)return;
    const dismiss=(event:PointerEvent)=>{if(!customRef.current?.contains(event.target as Node))closeCustom()};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")closeCustom()};
    document.addEventListener("pointerdown",dismiss);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape)};
  },[closeCustom,custom]);
  async function choose(modelId:string){
    setSaving(true);
    try{
      const result=await api<{connections:ConnectionDTO[]}>("/api/connections",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({provider,capability,modelId})});
      setConnections(result.connections);closeCustom();notify(`${title} model updated.`);
    }catch(error){notify(error instanceof Error?error.message:"Could not update the model.")}finally{setSaving(false)}
  }
  return <div className="model-route">
    <span className="model-route-icon">{provider==="google"?<GeminiIcon size={17}/>:capability==="transcription"?<AudioLines size={17}/>:<Bot size={17}/>}</span>
    <div className="model-route-copy"><b>{title}</b><small>{description}</small></div>
    <div className="model-route-control" ref={customRef}>
      {connection?.connected?<><div className="model-select-row"><select value={selected} disabled={saving} onChange={(event)=>void choose(event.target.value)} aria-label={`${title} model`}>
        {options.map((model)=><option key={model} value={model}>{model}</option>)}
      </select><button type="button" className="model-add-trigger" aria-label={`Add a custom ${providerLabel} model`} aria-expanded={custom} onClick={()=>custom?closeCustom():setCustom(true)}><Plus size={15}/></button></div>
      {custom&&<form className="custom-model-popover" onSubmit={(event)=>{event.preventDefault();if(customId.trim())void choose(customId.trim())}}><header><span className="model-popover-icon">{provider==="google"?<GeminiIcon size={16}/>:<Bot size={16}/>}</span><span><b>Add a {providerLabel} model</b><small>Use the exact ID from your provider dashboard.</small></span></header><label>Model ID<input aria-label="Provider model ID" autoFocus value={customId} onChange={(event)=>setCustomId(event.target.value)} placeholder={provider==="google"?"gemini-…":"provider/model-name"} maxLength={120}/></label><footer><button type="button" className="button secondary" onClick={closeCustom}>Cancel</button><button className="button dark" disabled={saving||customId.trim().length<2}>{saving?<LoaderCircle className="spin" size={14}/>:<Plus size={14}/>}Add model</button></footer></form>}</>:<button type="button" onClick={onConnect}>Connect {providerLabel}</button>}
    </div>
  </div>;
}

function ProviderDialog({connections,setConnections,close,notify}:{connections:ConnectionDTO[];setConnections:(x:ConnectionDTO[])=>void;close:()=>void;notify:(x:string)=>void}) {
  const [view,setView]=useState<"models"|"accounts">(()=>connections.some((item)=>item.connected)?"models":"accounts"),[provider,setProvider]=useState<Provider>("groq"),[key,setKey]=useState(""),[saving,setSaving]=useState(false); const existing=connections.find((x)=>x.provider===provider);
  async function save(e:React.FormEvent){e.preventDefault();setSaving(true);try{const x=await api<{connections:ConnectionDTO[]}>("/api/connections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({provider,apiKey:key})});setConnections(x.connections);setKey("");const nextProvider:Provider=provider==="groq"?"google":"groq";const next=x.connections.find((item)=>item.provider===nextProvider);if(!next?.connected){setProvider(nextProvider);setView("accounts");notify(`${provider==="groq"?"Groq":"Google AI"} connected. Add ${nextProvider==="groq"?"Groq":"Google AI"} next.`)}else{setView("models");notify(`${provider==="groq"?"Groq":"Google AI"} connected.`)}}catch(e){notify(e instanceof Error?e.message:"Connection failed.")}finally{setSaving(false)}}
  async function remove(){try{const x=await api<{connections:ConnectionDTO[]}>(`/api/connections?provider=${provider}`,{method:"DELETE"});setConnections(x.connections);notify("Connection removed.")}catch(e){notify(e instanceof Error?e.message:"Could not disconnect.")}}
  const groq=connections.find((item)=>item.provider==="groq"),google=connections.find((item)=>item.provider==="google");
  const openAccount=(next:Provider)=>{setProvider(next);setView("accounts")};
  const firstConnection=!connections.some((item)=>item.connected);
  return <Modal title="AI setup" subtitle={firstConnection?"Connect Groq and Google AI to start recording, transcribing, and chatting.":"Choose models or manage provider access."} close={close} className="provider-modal"><div className="provider-view-tabs" role="tablist" aria-label="AI setup"><button role="tab" aria-selected={view==="models"} className={view==="models"?"active":""} onClick={()=>setView("models")}><Bot size={15}/>Models</button><button role="tab" aria-selected={view==="accounts"} className={view==="accounts"?"active":""} onClick={()=>setView("accounts")}><Link2 size={15}/>Accounts</button></div>{view==="models"?<section className="model-routing"><div className="section-label"><span>USED FOR</span><small>New requests</small></div><ModelRoute title="Speaker transcript" description="Preferred · speakers + code-switching" provider="google" capability="transcription" connection={google} setConnections={setConnections} notify={notify} onConnect={()=>openAccount("google")}/><ModelRoute title="Fallback transcript" description="Used when Google AI is disconnected" provider="groq" capability="transcription" connection={groq} setConnections={setConnections} notify={notify} onConnect={()=>openAccount("groq")}/><ModelRoute title="Fast chat" description="Transcript answers · Groq" provider="groq" capability="chat" connection={groq} setConnections={setConnections} notify={notify} onConnect={()=>openAccount("groq")}/><ModelRoute title="Gemini chat" description="Google reasoning option" provider="google" capability="chat" connection={google} setConnections={setConnections} notify={notify} onConnect={()=>openAccount("google")}/></section>:<section className="provider-connect-section"><div className="provider-tabs"><button className={provider==="groq"?"active":""} onClick={()=>setProvider("groq")}><AudioLines/>Groq<small>Transcription + chat</small></button><button className={provider==="google"?"active":""} onClick={()=>setProvider("google")}><GeminiIcon size={18}/>Google AI<small>Speakers + chat</small></button></div><div className="provider-status"><span className={`connection-dot ${existing?.connected?"ready":""}`}/>{existing?.connected?`Connected · ${existing.keyHint}`:"Not connected"}</div><form className="key-form" onSubmit={save}><label>{provider==="groq"?"Groq API key":"Google AI Studio API key"}<input autoComplete="off" type="password" value={key} onChange={(e)=>setKey(e.target.value)} placeholder={existing?.connected?"Enter a new key to replace it":"Paste your API key"}/></label><p>{provider==="groq"?<>Used for fallback transcription and fast chat. <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Create a Groq key</a>.</>:<>Used for speaker-aware transcription and Gemini chat. <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Create a Google AI key</a>.</>}</p><div>{existing?.connected&&<button type="button" className="button danger-text" onClick={remove}>Disconnect</button>}<button className="button dark" disabled={saving||key.length<12}>{saving?<LoaderCircle className="spin" size={15}/>:<Link2 size={15}/>}Validate & connect</button></div></form><div className="security-note"><LockKeyholeIcon/>Encrypted with AES-256-GCM. Keys are never returned to the browser.</div></section>}</Modal>;
}
function LockKeyholeIcon(){return <span className="lock-mini">••</span>}

function UsageDialog({usage,close}:{usage:UsageDTO;close:()=>void}) { const mb=usage.storedBytes/1024/1024; const available=Math.max(0,(USER_STORAGE_LIMIT_BYTES-usage.storedBytes)/1024/1024); const storagePercent=Math.min(100,(usage.storedBytes/USER_STORAGE_LIMIT_BYTES)*100); return <Modal title="Usage limits" subtitle="Your Minutes limits at a glance." close={close}><div className="allowance-card"><div><span className="allowance-icon"><HardDrive size={17}/></span><span><small>Account storage limit</small><b>{mb<1?"< 1":mb.toFixed(1)} of 250 MB used</b></span><strong>{available.toFixed(1)} MB left</strong></div><div className="usage-meter"><i style={{transform:`scaleX(${storagePercent/100})`}}/></div><footer><span>{storagePercent.toFixed(0)}% used</span><span>Does not reset</span></footer></div><div className="usage-grid"><div><span>Transcription today</span><b>{Math.round(usage.transcriptionSecondsToday/60)} min</b><small>No Minutes daily cap</small></div><div><span>Chats today</span><b>{usage.chatRequestsToday}</b><small>No Minutes daily cap</small></div></div><p className="usage-footnote">Groq and Google may apply separate limits to their accounts.</p></Modal>; }

function ShareDialog({clip,view,setClip,close,notify}:{clip:ClipDTO;view:DocumentView;setClip:(x:ClipDTO)=>void;close:()=>void;notify:(x:string)=>void}) { const viewLabel=view==="summary"?"summary":"transcript"; const makeUrl=(slug:string)=>`${window.location.origin}/s/${slug}?view=${view}`; const [audio,setAudio]=useState(clip.shareIncludesAudio),[expiry,setExpiry]=useState<string>("7"),[link,setLink]=useState(clip.shareSlug&&typeof window!=="undefined"?makeUrl(clip.shareSlug):""),[busy,setBusy]=useState(false); async function create(){setBusy(true);try{const x=await api<{share:{slug:string;includeAudio:boolean}}>(`/api/clips/${clip.id}/share`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({includeAudio:audio,expiresInDays:expiry==="none"?null:Number(expiry)})});const url=makeUrl(x.share.slug);setLink(url);setClip({...clip,shareSlug:x.share.slug,shareIncludesAudio:x.share.includeAudio});await navigator.clipboard.writeText(url);notify(`Public ${viewLabel} link copied.`)}catch(e){notify(e instanceof Error?e.message:"Could not create link.")}finally{setBusy(false)}} async function revoke(){await api(`/api/clips/${clip.id}/share`,{method:"DELETE"});setClip({...clip,shareSlug:null,shareIncludesAudio:false});setLink("");notify("Public link revoked.")}
  return <Modal title={`Share ${viewLabel}`} subtitle={`Anyone with the private link can open this ${viewLabel} without signing in.`} close={close}><div className="share-options"><label><span>Link expiry</span><select value={expiry} onChange={(e)=>setExpiry(e.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="none">Never</option></select></label><label className="toggle-row"><span><b>Include audio playback</b><small>Off by default for privacy</small></span><input type="checkbox" checked={audio} onChange={(e)=>setAudio(e.target.checked)}/></label></div>{link&&<div className="share-link"><input aria-label={`Public ${viewLabel} link`} readOnly value={link}/><button aria-label="Copy public link" onClick={()=>{void navigator.clipboard.writeText(link);notify("Link copied.")}}><Copy size={15}/></button></div>}<div className="modal-actions">{clip.shareSlug&&<button className="button danger-text" onClick={revoke}>Revoke link</button>}<button className="button dark" onClick={create} disabled={busy}>{busy?<LoaderCircle className="spin" size={15}/>:<Share2 size={15}/>} {link?"Update & copy":"Create public link"}</button></div></Modal>; }

function ConfirmDialog({title,body,confirm,onConfirm,close}:{title:string;body:string;confirm:string;onConfirm:()=>void;close:()=>void}) { return <Modal title={title} close={close}><p className="confirm-copy">{body}</p><div className="modal-actions"><button className="button secondary" onClick={close}>Cancel</button><button className="button destructive" onClick={onConfirm}><Trash2 size={15}/>{confirm}</button></div></Modal>; }
