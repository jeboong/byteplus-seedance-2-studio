"use client";

import { useEffect, useRef, useState } from "react";

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function BackgroundGradientAnimation({
  gradientBackgroundStart = "rgb(5, 7, 10)",
  gradientBackgroundEnd = "rgb(14, 22, 38)",
  firstColor = "78, 116, 214",
  secondColor = "180, 198, 230",
  thirdColor = "255, 255, 255",
  fourthColor = "40, 68, 118",
  fifthColor = "10, 16, 28",
  pointerColor = "126, 164, 255",
  size = "70%",
  blendingValue = "screen",
  interactive = true,
  className,
  containerClassName,
}: {
  gradientBackgroundStart?: string;
  gradientBackgroundEnd?: string;
  firstColor?: string;
  secondColor?: string;
  thirdColor?: string;
  fourthColor?: string;
  fifthColor?: string;
  pointerColor?: string;
  size?: string;
  blendingValue?: string;
  interactive?: boolean;
  className?: string;
  containerClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef<HTMLDivElement>(null);
  const current = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--gradient-background-start", gradientBackgroundStart);
    root.style.setProperty("--gradient-background-end", gradientBackgroundEnd);
    root.style.setProperty("--first-color", firstColor);
    root.style.setProperty("--second-color", secondColor);
    root.style.setProperty("--third-color", thirdColor);
    root.style.setProperty("--fourth-color", fourthColor);
    root.style.setProperty("--fifth-color", fifthColor);
    root.style.setProperty("--pointer-color", pointerColor);
    root.style.setProperty("--size", size);
    root.style.setProperty("--blending-value", blendingValue);
  }, [
    blendingValue,
    fifthColor,
    firstColor,
    fourthColor,
    gradientBackgroundEnd,
    gradientBackgroundStart,
    pointerColor,
    secondColor,
    size,
    thirdColor,
  ]);

  useEffect(() => {
    setIsSafari(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!interactive) return;

    const tick = () => {
      current.current.x += (target.current.x - current.current.x) / 24;
      current.current.y += (target.current.y - current.current.y) / 24;
      if (interactiveRef.current) {
        interactiveRef.current.style.transform = `translate3d(${Math.round(
          current.current.x
        )}px, ${Math.round(current.current.y)}px, 0)`;
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [interactive]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    target.current = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  };

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      onPointerMove={interactive ? handlePointerMove : undefined}
      className={cx("gradient-animation-bg", containerClassName)}
    >
      <svg className="hidden">
        <defs>
          <filter id="bwBlueGradientBlur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
      <div
        className={cx(
          "gradients-container",
          isSafari ? "gradients-container-safari" : "gradients-container-goo",
          className
        )}
      >
        <div className="gradient-orb gradient-orb-first" />
        <div className="gradient-orb gradient-orb-second" />
        <div className="gradient-orb gradient-orb-third" />
        <div className="gradient-orb gradient-orb-fourth" />
        <div className="gradient-orb gradient-orb-fifth" />
        {interactive && (
          <div ref={interactiveRef} className="gradient-orb gradient-orb-pointer" />
        )}
      </div>
    </div>
  );
}
