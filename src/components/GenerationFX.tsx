"use client";

import { useEffect, useRef, useState } from "react";

interface GenerationFXProps {
  label: string;
  modelLabel: string;
  compact?: boolean;
  className?: string;
}

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uDark;

out vec4 fragColor;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float scene(vec2 uv, float t) {
  vec2 p1 = vec2(cos(t * 0.72) * 0.34, sin(t * 1.14) * 0.16);
  vec2 p2 = vec2(cos(t * 0.58 + 3.14) * 0.34, sin(t * 1.08 + 3.14) * 0.17);
  vec2 p3 = vec2(cos(t * 0.46 + 1.7) * 0.18, sin(t * 0.82 + 0.8) * 0.24);
  float c1 = sdCircle(uv - p1, 0.18);
  float c2 = sdCircle(uv - p2, 0.15);
  float c3 = sdCircle(uv - p3, 0.11);
  return opSmoothUnion(opSmoothUnion(c1, c2, 0.18), c3, 0.16);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / max(uResolution.y, 1.0);
  float t = uTime;
  float d = scene(uv, t);

  vec3 lightBg = vec3(0.955, 0.965, 0.980);
  vec3 darkBg = vec3(0.025, 0.027, 0.032);
  vec3 bg = mix(lightBg, darkBg, uDark);

  vec3 accentA = mix(vec3(0.12, 0.25, 0.50), vec3(0.50, 0.66, 0.96), uDark);
  vec3 accentB = mix(vec3(0.60, 0.72, 0.92), vec3(0.18, 0.34, 0.62), uDark);
  vec3 ink = mix(vec3(0.02, 0.04, 0.08), vec3(0.88, 0.93, 1.0), uDark);

  float glow = exp(-9.5 * abs(d));
  float body = smoothstep(0.012, 0.0, d);
  float rim = exp(-42.0 * abs(d));

  vec2 gridUv = gl_FragCoord.xy / 24.0;
  vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
  float gridLine = 1.0 - min(min(grid.x, grid.y), 1.0);
  gridLine *= 0.035 + 0.055 * (1.0 - uDark);

  float vignette = smoothstep(0.95, 0.12, length(uv));
  float grain = (hash(gl_FragCoord.xy + floor(t * 24.0)) - 0.5) * 0.018;
  vec3 flow = mix(accentA, accentB, 0.5 + 0.5 * sin(t * 0.7 + uv.x * 2.4));

  vec3 color = bg;
  color += ink * gridLine;
  color += flow * glow * mix(0.34, 0.58, uDark);
  color += mix(vec3(0.94, 0.97, 1.0), vec3(0.60, 0.76, 1.0), uDark) * body * 0.36;
  color += vec3(0.85, 0.92, 1.0) * rim * 0.16;
  color = mix(bg, color, vignette);
  color += grain;

  fragColor = vec4(color, 1.0);
}
`;

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec4 position;
void main() {
  gl_Position = position;
}
`;

class ShaderRenderer {
  private gl: WebGL2RenderingContext | null;
  private program: WebGLProgram | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uDark: WebGLUniformLocation | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      powerPreference: "low-power",
    });
    this.init();
  }

  get ready() {
    return Boolean(this.gl && this.program);
  }

  private compile(type: number, source: string) {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private init() {
    const gl = this.gl;
    if (!gl) return;

    const vertexShader = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const vertices = new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    this.program = program;
    this.uTime = gl.getUniformLocation(program, "uTime");
    this.uResolution = gl.getUniformLocation(program, "uResolution");
    this.uDark = gl.getUniformLocation(program, "uDark");
  }

  resize() {
    const gl = this.gl;
    if (!gl) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  render(time: number, dark: boolean) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    this.resize();
    gl.useProgram(this.program);
    gl.uniform1f(this.uTime, time * 0.001);
    gl.uniform2f(this.uResolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uDark, dark ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    this.program = null;
  }
}

export default function GenerationFX({
  label,
  modelLabel,
  compact = false,
  className = "",
}: GenerationFXProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(false);
  const [shaderReady, setShaderReady] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new ShaderRenderer(canvas);
    if (!renderer.ready) {
      setShaderReady(false);
      return () => renderer.dispose();
    }

    const updateTheme = () => {
      themeRef.current = document.documentElement.classList.contains("dark");
    };
    updateTheme();

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const resizeObserver = new ResizeObserver(() => renderer.resize());
    const mutationObserver = new MutationObserver(updateTheme);
    let rafId = 0;

    resizeObserver.observe(canvas);
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const animate = (time: number) => {
      renderer.render(time, themeRef.current);
      if (!reducedMotion) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className={`generation-shader-fx ${
        compact ? "generation-fx-compact" : ""
      } ${className}`}
    >
      {shaderReady ? (
        <canvas
          ref={canvasRef}
          className="generation-shader-canvas"
          aria-hidden
        />
      ) : (
        <div className="generation-shader-fallback" aria-hidden />
      )}
      <div className="generation-shader-overlay" aria-hidden />
      <div className="generation-fx-copy generation-shader-copy">
        <span className="generation-status-pill" />
        <span className={compact ? "text-[11px]" : "text-sm"}>{label}</span>
        <span className="text-[10px]">{modelLabel}</span>
      </div>
    </div>
  );
}
