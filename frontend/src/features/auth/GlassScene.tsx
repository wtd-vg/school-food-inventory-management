import { useEffect, useRef, useState, type RefObject } from 'react';
import styles from './GlassScene.module.css';

/**
 * SF77: nền trang đăng nhập — vòng kính mờ trôi giữa các phiến pastel trên nền đào ấm, mép vòng tách
 * ánh sáng thành viền cầu vồng. WebGL 1 tự viết (không thư viện, hợp CSP script-src 'self').
 *
 * - Màu đọc từ tokens.css (--login-*) lúc chạy, không khai báo mã màu ở đây.
 * - Vẽ ở ~60% độ phân giải rồi phóng lên (cảnh vốn mềm), DPR tối đa 1.5, dừng khi tab ẩn.
 * - Tự hạ chất lượng trên máy yếu: sau ~1,5 giây đầu, khung trung bình > 25 ms thì giảm còn 40% độ phân giải;
 *   vẫn > 40 ms thì đứng yên ở một khung tĩnh.
 * - prefers-reduced-motion: vẽ một khung tĩnh. Không có WebGL / mất context: ẩn canvas, nền CSS thay thế.
 * - focusRef: phần tử mà vòng kính lượn phía sau (ô cửa bên phải thẻ đăng nhập).
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uFocus;
uniform float uRingR;
uniform vec3 uPeachA;
uniform vec3 uPeachB;
uniform vec3 uGlow;
uniform vec3 uSlab[5];
uniform vec4 uSlabGeo[5];
uniform vec4 uSlabAnim[5];

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec3 prism(float x) { return 0.5 + 0.5 * cos(6.2831 * (x + vec3(0.0, 0.33, 0.67))); }

vec3 backdrop(vec2 p) {
  float g = clamp(0.5 + 0.55 * (p.x * 0.6 - p.y), 0.0, 1.0);
  vec3 col = mix(uPeachA, uPeachB, g);
  vec2 d = p - vec2(-0.35, 0.32);
  return mix(col, uGlow, 0.55 * exp(-3.0 * dot(d, d)));
}

/* Nền + các phiến (đổ bóng mềm, mép sáng, viền tách màu mảnh ngay ngoài mép). */
vec3 scene(vec2 p, float px) {
  vec3 col = backdrop(p);
  for (int i = 0; i < 5; i++) {
    vec4 g = uSlabGeo[i];
    vec4 an = uSlabAnim[i];
    float fi = float(i);
    vec2 c = g.xy + an.w * vec2(sin(uTime * an.z + an.y), cos(uTime * an.z * 0.8 + an.y * 1.3))
           + uMouse * 0.010 * (1.0 + fi * 0.35);
    float a = an.x + 0.07 * sin(uTime * an.z * 0.7 + an.y);
    vec2 q = rot(a) * (p - c);
    float d = sdRoundBox(q, g.zw, 0.045);
    float ds = sdRoundBox(rot(a) * (p - c - vec2(0.016, -0.028)), g.zw, 0.045);
    col *= 1.0 - 0.10 * (1.0 - smoothstep(-0.025, 0.065, ds));
    vec3 sc = uSlab[i] * (1.03 + 0.05 * (q.y / g.w));
    sc += 0.10 * (1.0 - smoothstep(0.0, 0.006, abs(d + 0.005)));
    col = mix(col, sc, 1.0 - smoothstep(-px, px, d));
    float fringe = (1.0 - smoothstep(0.0, 0.014, d)) * step(0.0, d);
    col += fringe * 0.09 * prism(d * 55.0 + fi * 0.2);
  }
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float px = 1.5 / uRes.y;
  vec3 col = scene(p, px);

  /* Vòng kính: ống tròn nhìn nghiêng nhẹ, lượn quanh uFocus, nghiêng theo chuột. */
  float ang = 0.35 * sin(uTime * 0.12);
  float tilt = 0.84 + 0.10 * sin(uTime * 0.21);
  vec2 rc = uFocus + vec2(0.13 * sin(uTime * 0.18), 0.07 * sin(uTime * 0.27 + 1.0)) + uMouse * 0.035;
  float R = uRingR;
  float W = uRingR * 0.30;
  vec2 q = rot(ang) * (p - rc);
  q.y /= tilt;
  float L = length(q);
  float s = (L - R) / W;

  vec2 qs = rot(ang) * (p - rc - vec2(0.03, -0.05)); qs.y /= tilt;
  col *= 1.0 - 0.13 * (1.0 - smoothstep(0.5, 1.7, abs((length(qs) - R) / W)));
  vec2 qc = rot(ang) * (p - rc + vec2(0.022, -0.034)); qc.y /= tilt;
  col += 0.06 * (1.0 - smoothstep(0.0, 0.4, abs((length(qc) - R * 0.97) / W)));

  float edgeAA = px / W;
  float inside = 1.0 - smoothstep(1.0 - edgeAA * 1.5, 1.0, abs(s));
  if (inside > 0.0) {
    float h = sqrt(max(0.0, 1.0 - s * s));
    vec2 dir = q / max(L, 1e-4);
    vec2 slope = dir * s;
    vec2 off = -slope * 0.11 * R * (1.0 + 2.2 * s * s);
    off = rot(-ang) * vec2(off.x, off.y * tilt);
    vec3 acc = vec3(0.0);
    for (int j = 0; j < 5; j++) {
      float fj = float(j);
      vec2 jit = 0.011 * (0.55 + 0.45 * fract(fj * 0.618)) * vec2(cos(fj * 2.399), sin(fj * 2.399));
      acc.r += scene(p + off * 0.90 + jit, px).r;
      acc.g += scene(p + off + jit, px).g;
      acc.b += scene(p + off * 1.12 + jit, px).b;
    }
    vec3 glass = acc / 5.0;
    glass = mix(glass, vec3(1.0), 0.13 + 0.12 * (1.0 - h));
    float rim = smoothstep(0.5, 1.0, abs(s));
    glass += rim * 0.17 * prism(s * 0.9 + uTime * 0.03);
    vec3 n3 = normalize(vec3(slope * 1.2, h));
    vec3 ld = normalize(vec3(-0.45, 0.6, 0.75));
    glass += 0.5 * pow(max(dot(reflect(-ld, n3), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    glass += 0.10 * pow(1.0 - h, 3.0);
    col = mix(col, glass, inside);
  }

  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const SLAB_TOKENS = ['--login-slab-mint', '--login-slab-lilac', '--login-slab-butter', '--login-slab-sky', '--login-slab-rose'];

function tokenRgb(name: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) return [1, 0.9, 0.85];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

export function GlassScene({ focusRef }: { focusRef: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
    if (!canvas || !gl) {
      setState('failed');
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setState('failed');
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setState('failed');
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(prog, name);

    gl.uniform3fv(u('uPeachA'), tokenRgb('--login-peach-1'));
    gl.uniform3fv(u('uPeachB'), tokenRgb('--login-peach-2'));
    gl.uniform3fv(u('uGlow'), tokenRgb('--login-glow'));
    gl.uniform3fv(u('uSlab'), SLAB_TOKENS.flatMap(tokenRgb));

    /** Bố cục theo khung nhìn: phiến rải quanh mép màn hình và sau ô cửa, vòng kính lượn sau ô cửa. */
    let quality = 0.6;
    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = Math.min(quality, 1400 / Math.max(1, rect.width * dpr));
      canvas.width = Math.max(1, Math.round(rect.width * dpr * scale));
      canvas.height = Math.max(1, Math.round(rect.height * dpr * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u('uRes'), canvas.width, canvas.height);

      const H = rect.height || 1;
      const a = rect.width / H;
      const win = focusRef.current?.getBoundingClientRect();
      const hasWin = !!win && win.width > 0;
      const fx = hasWin ? (win.left + win.width / 2 - rect.left - rect.width / 2) / H : 0;
      const fy = hasWin ? (H / 2 - (win.top + win.height * 0.36 - rect.top)) / H : 0.3;
      const ringR = hasWin ? (Math.min(win.width, win.height) * 0.24) / H : 0.15;
      gl.uniform2f(u('uFocus'), fx, fy);
      gl.uniform1f(u('uRingR'), ringR);
      gl.uniform4fv(u('uSlabGeo'), [
        -a / 2 + 0.13, 0.31, 0.16, 0.105,
        a / 2 - 0.12, -0.31, 0.18, 0.115,
        fx + 0.07, fy + 0.13, 0.13, 0.075,
        fx - 0.08, fy - 0.17, 0.1, 0.07,
        -a / 2 + 0.2, -0.35, 0.14, 0.085,
      ]);
      gl.uniform4fv(u('uSlabAnim'), [
        -0.26, 0.0, 0.27, 0.028,
        0.34, 1.7, 0.21, 0.032,
        0.22, 3.1, 0.33, 0.022,
        -0.42, 4.4, 0.3, 0.024,
        0.14, 5.6, 0.24, 0.03,
      ]);
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const t0 = performance.now();
    let raf = 0;
    let drawn = false;
    let frozen = false;
    const perf = { frames: 0, since: 0 };

    const draw = (time: number) => {
      gl.uniform1f(u('uTime'), time);
      gl.uniform2f(u('uMouse'), mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!drawn) {
        drawn = true;
        setState('ready');
      }
    };
    /** Đo 45 khung sau khi ổn định; chậm thì giảm độ phân giải, rất chậm thì dừng ở khung tĩnh. */
    const adapt = (now: number) => {
      if (perf.since === 0) {
        perf.since = now;
        return;
      }
      perf.frames += 1;
      if (perf.frames < 45) return;
      const avg = (now - perf.since) / perf.frames;
      perf.frames = 0;
      perf.since = now;
      if (avg > 40 && quality <= 0.4) {
        frozen = true;
      } else if (avg > 25 && quality > 0.4) {
        quality = 0.4;
        layout();
      }
    };
    const frame = (now: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      draw(12 + (now - t0) / 1000);
      adapt(now);
      if (!frozen) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      perf.frames = 0;
      perf.since = 0;
      if (reduce.matches || frozen) draw(12);
      else raf = requestAnimationFrame(frame);
    };
    const stop = () => cancelAnimationFrame(raf);

    const onPointer = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      layout();
      if (reduce.matches || frozen) draw(12);
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
      setState('failed');
    };

    layout();
    start();
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    if (focusRef.current) ro.observe(focusRef.current);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reduce.addEventListener('change', start);
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      stop();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      reduce.removeEventListener('change', start);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [focusRef]);

  return <canvas ref={canvasRef} className={styles.canvas} data-state={state} aria-hidden="true" />;
}
