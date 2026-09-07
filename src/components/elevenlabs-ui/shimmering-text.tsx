"use client";

import { useMemo, useRef } from "react";
import { motion, useInView, useReducedMotion, type UseInViewOptions } from "motion/react";

type ShimmeringTextProps = {
  text: string;
  duration?: number;
  delay?: number;
  repeat?: boolean;
  repeatDelay?: number;
  className?: string;
  startOnView?: boolean;
  once?: boolean;
  inViewMargin?: UseInViewOptions["margin"];
  spread?: number;
  color?: string;
  shimmerColor?: string;
};

/** Adapted from the MIT-licensed ElevenLabs UI Shimmering Text component. */
export function ShimmeringText({
  text,
  duration = 2,
  delay = 0,
  repeat = true,
  repeatDelay = 0.5,
  className,
  startOnView = true,
  once = false,
  inViewMargin,
  spread = 2,
  color = "#8a918d",
  shimmerColor = "#27302c",
}: ShimmeringTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once, margin: inViewMargin });
  const reducedMotion = useReducedMotion();
  const dynamicSpread = useMemo(() => text.length * spread, [spread, text.length]);
  const animate = !startOnView || inView;

  return (
    <motion.span
      ref={ref}
      className={className ? `shimmering-text ${className}` : "shimmering-text"}
      style={{
        "--shimmer-spread": `${dynamicSpread}px`,
        "--shimmer-base": color,
        "--shimmer-highlight": shimmerColor,
      } as React.CSSProperties}
      initial={reducedMotion ? { opacity: 1 } : { backgroundPosition: "100% center", opacity: 0 }}
      animate={animate ? { backgroundPosition: reducedMotion ? "100% center" : "0% center", opacity: 1 } : {}}
      transition={{
        backgroundPosition: {
          repeat: repeat && !reducedMotion ? Infinity : 0,
          duration,
          delay,
          repeatDelay,
          ease: "linear",
        },
        opacity: { duration: reducedMotion ? 0 : 0.3, delay },
      }}
    >
      {text}
    </motion.span>
  );
}
