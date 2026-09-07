"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertCircle, Check, Copy, LoaderCircle, Mic, RotateCcw, X } from "lucide-react";

type CaptureState = "requesting" | "recording" | "finalizing" | "error";

type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechResultList = {
  length: number;
  [index: number]: SpeechResult;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function recorderFormat() {
  const formats = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
  return formats.find((format) => MediaRecorder.isTypeSupported(format));
}

function recordingName(mediaType: string) {
  const extension = mediaType === "audio/mp4" ? "m4a" : mediaType === "audio/ogg" ? "ogg" : "webm";
  const stamp = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date()).replace(/[/:,]/g, "-").replace(/\s+/g, " ");
  return `Recording ${stamp}.${extension}`;
}

export function RecordingDialog({
  close,
  onRecorded,
}: {
  close: () => void;
  onRecorded: (file: File) => void;
}) {
  const [captureState, setCaptureState] = useState<CaptureState>("requesting");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0.08);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [liveCaptions, setLiveCaptions] = useState(true);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRestartRef = useRef<number | null>(null);
  const transcriptScrollRef = useRef<HTMLParagraphElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const saveRecordingRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const committedTextRef = useRef("");
  const finalTextRef = useRef("");
  const interimTextRef = useRef("");
  const sessionFinalRef = useRef("");
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const releaseCapture = useCallback(() => {
    recognitionActiveRef.current = false;
    if (recognitionRestartRef.current !== null) window.clearTimeout(recognitionRestartRef.current);
    recognitionRestartRef.current = null;
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    saveRecordingRef.current = false;
    chunksRef.current = [];
    committedTextRef.current = "";
    finalTextRef.current = "";
    interimTextRef.current = "";
    sessionFinalRef.current = "";
    async function begin() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
          throw new Error("This browser does not support microphone recording.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: { ideal: 2 },
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const preferredFormat = recorderFormat();
        const recorder = preferredFormat
          ? new MediaRecorder(stream, { mimeType: preferredFormat })
          : new MediaRecorder(stream);
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          const shouldSave = saveRecordingRef.current;
          const recordedType = recorder.mimeType.split(";")[0] || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: recordedType });
          recorderRef.current = null;
          releaseCapture();
          if (shouldSave && blob.size) {
            onRecordedRef.current(new File([blob], recordingName(recordedType), { type: recordedType }));
          } else if (shouldSave) {
            setError("The browser did not return any recorded audio. Please try again.");
            setCaptureState("error");
          }
        };
        recorder.onerror = () => {
          saveRecordingRef.current = false;
          setError("Recording was interrupted by the browser. Please try again.");
          setCaptureState("error");
        };

        const AudioContextClass = window.AudioContext;
        if (AudioContextClass) {
          const context = new AudioContextClass();
          audioContextRef.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.76;
          context.createMediaStreamSource(stream).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          const sampleLevel = () => {
            analyser.getByteTimeDomainData(samples);
            let energy = 0;
            for (const sample of samples) {
              const normalized = (sample - 128) / 128;
              energy += normalized * normalized;
            }
            const rms = Math.sqrt(energy / samples.length);
            setLevel(Math.min(1, Math.max(0.06, rms * 5.8)));
            animationFrameRef.current = requestAnimationFrame(sampleLevel);
          };
          sampleLevel();
        }

        const speechWindow = window as unknown as SpeechWindow;
        const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
        if (Recognition) {
          const recognition = new Recognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-IN";
          recognition.onresult = (event) => {
            let sessionFinal = sessionFinalRef.current;
            let interim = "";
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
              const result = event.results[index];
              const transcript = result[0]?.transcript?.trim();
              if (!transcript) continue;
              if (result.isFinal) sessionFinal = `${sessionFinal} ${transcript}`.trim();
              else interim = `${interim} ${transcript}`.trim();
            }
            sessionFinalRef.current = sessionFinal;
            const stable = [committedTextRef.current, sessionFinal].filter(Boolean).join(" ");
            finalTextRef.current = stable;
            interimTextRef.current = interim;
            setFinalText(stable);
            setInterimText(interim);
          };
          recognition.onerror = (event) => {
            if (!["aborted", "no-speech"].includes(event.error)) setLiveCaptions(false);
          };
          recognition.onend = () => {
            if (!recognitionActiveRef.current) return;
            committedTextRef.current = [
              committedTextRef.current,
              sessionFinalRef.current,
              interimTextRef.current,
            ].filter(Boolean).join(" ");
            sessionFinalRef.current = "";
            finalTextRef.current = committedTextRef.current;
            interimTextRef.current = "";
            setFinalText(committedTextRef.current);
            setInterimText("");
            recognitionRestartRef.current = window.setTimeout(() => {
              if (recognitionActiveRef.current) {
                try { recognition.start(); } catch { /* restart already queued */ }
              }
            }, 40);
          };
          recognitionRef.current = recognition;
          recognitionActiveRef.current = true;
          try { recognition.start(); } catch { setLiveCaptions(false); }
        } else {
          setLiveCaptions(false);
        }

        recorder.start(500);
        setCaptureState("recording");
      } catch (reason) {
        releaseCapture();
        setError(reason instanceof Error ? reason.message : "Microphone access could not be started.");
        setCaptureState("error");
      }
    }

    void begin();
    return () => {
      cancelled = true;
      recognitionActiveRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try { recorder.stop(); } catch { /* already stopping */ }
      }
      recorderRef.current = null;
      releaseCapture();
    };
  }, [attempt, releaseCapture]);

  useEffect(() => {
    if (captureState !== "recording") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [captureState]);

  function discard() {
    if (captureState === "finalizing") return;
    saveRecordingRef.current = false;
    close();
  }

  function finish() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    saveRecordingRef.current = true;
    recognitionActiveRef.current = false;
    setCaptureState("finalizing");
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    try { recorder.requestData(); } catch { /* stop still flushes the final chunk */ }
    try {
      recorder.stop();
    } catch {
      setError("The browser could not finish this recording. Please try again.");
      setCaptureState("error");
    }
  }

  async function copyTranscript() {
    const text = [finalTextRef.current, interimTextRef.current].filter(Boolean).join(" ").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function retry() {
    setCaptureState("requesting");
    setError("");
    setElapsed(0);
    setFinalText("");
    setInterimText("");
    setLiveCaptions(true);
    setCopied(false);
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") discard();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const transcript = [finalText, interimText].filter(Boolean).join(" ");
  useEffect(() => {
    const container = transcriptScrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [transcript]);

  const orbStyle = {
    "--voice-level": level.toFixed(3),
    "--orb-scale": (1 + level * 0.08).toFixed(3),
  } as CSSProperties;

  return (
    <div className="modal-backdrop recording-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) discard(); }}>
      <section className="recording-modal" role="dialog" aria-modal="true" aria-labelledby="recording-title">
        <header className="recording-header">
          <div className="recording-status">
            <i aria-hidden="true" />
            <span>{captureState === "requesting" ? "CONNECTING" : captureState === "finalizing" ? "SAVING" : captureState === "error" ? "MICROPHONE" : "RECORDING"}</span>
          </div>
          <time aria-label={`${elapsed} seconds recorded`}>{formatElapsed(elapsed)}</time>
          <button className="icon-button" type="button" disabled={captureState === "finalizing"} onClick={discard} aria-label="Close recorder"><X size={17} /></button>
        </header>

        <div className="recording-stage">
          <div className={`voice-orb ${captureState === "recording" ? "is-listening" : ""}`} style={orbStyle} aria-hidden="true">
            <span /><i /><b />
          </div>
          <div>
            <h2 id="recording-title">{captureState === "error" ? "Microphone unavailable" : captureState === "finalizing" ? "Preparing your recording" : captureState === "requesting" ? "Opening your microphone" : "Go ahead, I’m listening"}</h2>
            <p>{captureState === "error" ? error : "Speak naturally in Hindi, English, or Hinglish."}</p>
          </div>
        </div>

        {captureState === "error" ? (
          <div className="recording-error" role="alert">
            <AlertCircle size={17} />
            <span>Allow microphone access in your browser, then try again.</span>
          </div>
        ) : (
          <section className="live-transcript" aria-label="Live transcript">
            <header><span>LIVE TRANSCRIPT</span><small>{liveCaptions ? "Draft · final text may differ" : "Preview unavailable in this browser"}</small></header>
            <p ref={transcriptScrollRef} aria-live="polite">{transcript || (captureState === "recording" ? liveCaptions ? "Start speaking…" : "Your recording is active. The final transcript will appear after you stop." : "Listening for your voice…")}{interimText && <i />}</p>
          </section>
        )}

        <footer className="recording-actions">
          <button type="button" className="button secondary" disabled={captureState === "finalizing"} onClick={discard}>Discard</button>
          {captureState === "error" ? (
            <button type="button" className="button dark" onClick={retry}><RotateCcw size={15} />Try again</button>
          ) : (
            <>
              <button type="button" className="button secondary recording-copy" disabled={!transcript.trim()} onClick={() => void copyTranscript()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy text"}
              </button>
              <button type="button" className="button dark" disabled={captureState !== "recording"} onClick={finish}>
                {captureState === "finalizing" ? <LoaderCircle className="spin" size={15} /> : <Mic size={14} />}
                {captureState === "finalizing" ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
