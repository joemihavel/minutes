"use client";

import { useCallback, useRef, useState } from "react";
import { LoaderCircle, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { ScrubBar } from "@/components/elevenlabs-ui/scrub-bar";

type AudioPlayerProps = {
  id: string;
  src: string;
  title: string;
};

const WAVEFORM = [
  36, 58, 42, 76, 52, 88, 64, 44, 70, 94, 56, 38, 62, 82, 48, 72,
  54, 90, 68, 46, 78, 58, 96, 66, 42, 74, 52, 86, 60, 40, 70, 92,
  50, 80, 62, 44, 72, 56, 84, 48,
];

function Waveform() {
  return (
    <span className="audio-waveform" aria-hidden="true">
      {WAVEFORM.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
    </span>
  );
}

/** A compact Minutes skin over the interaction model used by ElevenLabs UI Audio Player. */
export function AudioPlayer({ id, src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeAfterScrub = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);
  const playedPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const play = useCallback(async () => {
    try {
      setError(false);
      await audioRef.current?.play();
    } catch {
      setError(true);
    }
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);
  const seek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  return (
    <section className="audio-player" aria-label={`Audio player for ${title}`}>
      <audio
        key={id}
        ref={audioRef}
        preload="metadata"
        src={src}
        muted={muted}
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onEnded={() => setPlaying(false)}
        onError={() => { setError(true); setBuffering(false); }}
      />
      <button className="audio-player-play" type="button" onClick={playing ? pause : play} aria-label={playing ? "Pause audio" : "Play audio"}>
        {buffering ? <LoaderCircle className="spin" size={16} /> : playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <ScrubBar.TimeLabel className="audio-player-elapsed" time={currentTime} />
      <div className="audio-player-timeline">
        <ScrubBar.Root
          duration={duration}
          value={currentTime}
          onScrub={seek}
          onScrubStart={() => { resumeAfterScrub.current = playing; pause(); }}
          onScrubEnd={() => { if (resumeAfterScrub.current) void play(); }}
        >
          <ScrubBar.Track className="audio-waveform-track">
            <Waveform />
            <span className="audio-waveform audio-waveform-played" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - playedPercent}% 0 0)` }}>
              {WAVEFORM.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
            </span>
            <ScrubBar.Progress />
            <ScrubBar.Thumb />
          </ScrubBar.Track>
        </ScrubBar.Root>
      </div>
      <ScrubBar.TimeLabel className="audio-player-duration" time={duration} />
      <span className="audio-player-divider" aria-hidden="true" />
      <button
        type="button"
        className="audio-player-mute"
        aria-label={muted ? "Unmute audio" : "Mute audio"}
        onClick={() => setMuted((value) => !value)}
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      <label className="audio-player-speed">
        <span className="sr-only">Playback speed</span>
        <select
          aria-label="Playback speed"
          value={rate}
          onChange={(event) => {
            const next = Number(event.target.value);
            setRate(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
        >
          {[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
      {error && <span className="audio-player-error" role="alert">Audio unavailable</span>}
    </section>
  );
}
