"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

type ScrubBarContextValue = {
  duration: number;
  value: number;
  progress: number;
  onScrub?: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

const ScrubBarContext = createContext<ScrubBarContextValue | null>(null);

function useScrubBar() {
  const context = useContext(ScrubBarContext);
  if (!context) throw new Error("ScrubBar components must be used inside ScrubBar.Root.");
  return context;
}

function classes(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

type RootProps = HTMLAttributes<HTMLDivElement> & {
  duration: number;
  value: number;
  onScrub?: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

function Root({ duration, value, onScrub, onScrubStart, onScrubEnd, children, className, ...props }: RootProps) {
  const context = useMemo(
    () => ({
      duration,
      value,
      progress: duration > 0 ? Math.min(100, Math.max(0, (value / duration) * 100)) : 0,
      onScrub,
      onScrubStart,
      onScrubEnd,
    }),
    [duration, onScrub, onScrubEnd, onScrubStart, value],
  );

  return (
    <ScrubBarContext.Provider value={context}>
      <div className={classes("scrub-bar", className)} {...props}>{children}</div>
    </ScrubBarContext.Provider>
  );
}

function Track({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { duration, value, onScrub, onScrubStart, onScrubEnd } = useScrubBar();

  const getTime = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    return duration * Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, [duration]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - 5;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + 5;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = duration;
    if (next === null) return;
    event.preventDefault();
    onScrub?.(Math.min(duration, Math.max(0, next)));
  };

  return (
    <div
      ref={trackRef}
      className={classes("scrub-bar-track", className)}
      role="slider"
      tabIndex={0}
      aria-label="Audio position"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={Math.min(Math.max(value, 0), duration || 0)}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (!duration) return;
        event.preventDefault();
        onScrubStart?.();
        onScrub?.(getTime(event.clientX));

        const move = (moveEvent: PointerEvent) => onScrub?.(getTime(moveEvent.clientX));
        const up = () => {
          onScrubEnd?.();
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function Progress({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { progress } = useScrubBar();
  return <div className={classes("scrub-bar-progress", className)} style={{ width: `${progress}%` }} {...props} />;
}

function Thumb({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { progress } = useScrubBar();
  return <div className={classes("scrub-bar-thumb", className)} style={{ left: `${progress}%` }} {...props} />;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type TimeLabelProps = HTMLAttributes<HTMLSpanElement> & { time: number };

function TimeLabel({ time, className, ...props }: TimeLabelProps) {
  return <span className={classes("scrub-bar-time", className)} {...props}>{formatTime(time)}</span>;
}

/** Adapted from the MIT-licensed ElevenLabs UI Scrub Bar compound component. */
export const ScrubBar = { Root, Track, Progress, Thumb, TimeLabel };
