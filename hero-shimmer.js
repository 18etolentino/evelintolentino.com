/* ============================================
   HERO IRIDESCENCE — the original "Iridescence" component from React Bits
   (reactbits.dev), ported 1:1 to plain JS so it runs without React.
   Shader is the original, plus a click glow + ripple (marked "added"). Change the look in the PROPS block below; the names and
   defaults match the React props exactly.
   ============================================ */
(function () {
  const PROPS = {
    color: '#483e77',
    hueShift: 0,
    saturation: 1,
    brightness: 1.5,
    contrast: 1,
    speed: 1,
    scale: 1,
    detail: 8,
    warp: 1,
    rotation: 0,
    mouseReact: true,
    amplitude: 0.1,
    stir: 0.5,
    sheen: 0.3,
    clickSwirl: true,
    grain: 0,
    fade: 0,
    opacity: 1,
    resolution: 1,
    paused: false
  };

  const canvas = document.getElementById('heroShimmer');
  if (!canvas) return;
  const root = canvas.parentElement;
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return;

  const VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uScale;
uniform float uRotation;
uniform int uDetail;
uniform float uWarp;
uniform float uHue;
uniform float uSaturation;
uniform float uBrightness;
uniform float uContrast;
uniform float uGrain;
uniform float uSeed;
uniform float uFade;
uniform float uOpacity;
uniform sampler2D uField;
uniform float uStir;
uniform vec3 uPointer;
uniform float uSheen;
uniform vec4 uSwirls[6];
in vec2 vUv;
out vec4 outColor;

vec3 hueRotate(vec3 c, float angle) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(angle);
  return c * ca + cross(k, c) * sin(angle) + k * dot(k, c) * (1.0 - ca);
}

float smootherstep(float edge, float x) {
  float t = clamp(x / edge, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 aspect = uResolution / mr;
  vec2 st = vUv - texture(uField, vUv).rg * uStir;


  vec2 uv = (st * 2.0 - 1.0) * aspect;
  float c = cos(uRotation);
  float s = sin(uRotation);
  uv = mat2(c, -s, s, c) * uv / uScale;
  uv += (uMouse - vec2(0.5)) * uAmplitude;

  float d = -uTime * 0.5;
  float a = 0.0;
  for (int i = 0; i < 24; i++) {
    if (i >= uDetail) break;
    float fi = float(i);
    a += cos(fi - d - a * uv.x * uWarp);
    d += sin(uv.y * fi + a);
  }
  d += uTime * 0.5;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;

  vec2 toPointer = (vUv - uPointer.xy) * aspect;
  col += col * uPointer.z * uSheen * 0.8 * exp(-dot(toPointer, toPointer) / 0.09);

  // click glow (added): a soft light at the click point that spreads out through the silk's
  // bright folds. Light only, the silk itself is not moved.
  for (int k = 0; k < 6; k++) {
    vec4 rp = uSwirls[k];                 // x, y, age (s), strength
    if (rp.w == 0.0) continue;
    vec2 delta = (vUv - rp.xy) * aspect;
    float dist = length(delta);
    float front = rp.z * 0.55;
    float ring = exp(-pow((dist - front) / 0.09, 2.0)) * rp.w;
    float flash = exp(-dist * dist / 0.04) * exp(-rp.z * 3.0) * min(rp.w, 1.6);
    // only the bright folds of the silk pick up the light, so it glows from inside the wave
    float folds = smoothstep(0.12, 0.55, dot(col, vec3(0.2126, 0.7152, 0.0722)));
    float lift = mix(folds, 1.0, 0.45);          // mostly the bright folds, a little of everything around them
    col += col * (ring * 0.40 + flash * 0.50) * lift;
  }

  col = hueRotate(col, uHue);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uBrightness;
  col += (hash(gl_FragCoord.xy + uSeed) - 0.5) * uGrain * 0.12;
  col = clamp(col, 0.0, 1.0);

  float alpha = uOpacity;
  if (uFade > 0.0) {
    vec2 px = vUv * uResolution;
    float edge = uFade * mr * 0.5;
    alpha *= smootherstep(edge, px.x) * smootherstep(edge, uResolution.x - px.x);
    alpha *= smootherstep(edge, px.y) * smootherstep(edge, uResolution.y - px.y);
  }
  outColor = vec4(col * alpha, alpha);
}`;

  const FIELD_COLUMNS = 48;
  const MAX_SWIRLS = 6;
  const SWIRL_LIFE = 2.4;   // ripple lifetime (s)
  
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  
  const compile = (gl, type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  };
  
  
  const clampP = PROPS;
  const s0 = {
    colorKey: String(clampP.color), color: clampP.color, speed: clampP.speed, amplitude: clampP.amplitude,
    mouseReact: clampP.mouseReact, scale: Math.max(0.05, clampP.scale), detail: clamp(Math.round(clampP.detail), 1, 24),
    rotation: clampP.rotation, warp: clampP.warp, hueShift: clampP.hueShift, saturation: Math.max(0, clampP.saturation),
    brightness: Math.max(0, clampP.brightness), contrast: Math.max(0, clampP.contrast), stir: Math.max(0, clampP.stir),
    sheen: Math.max(0, clampP.sheen), clickSwirl: clampP.clickSwirl, grain: clamp(clampP.grain, 0, 1),
    fade: clamp(clampP.fade, 0, 1), opacity: clamp(clampP.opacity, 0, 1), resolution: clamp(clampP.resolution, 0.1, 2),
    paused: clampP.paused
  };
  const settingsRef = { current: s0 };
  const wakeRef = { current: null };

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {};
    for (const name of [
      'uResolution',
      'uTime',
      'uColor',
      'uMouse',
      'uAmplitude',
      'uScale',
      'uRotation',
      'uDetail',
      'uWarp',
      'uHue',
      'uSaturation',
      'uBrightness',
      'uContrast',
      'uGrain',
      'uSeed',
      'uFade',
      'uOpacity',
      'uField',
      'uStir',
      'uPointer',
      'uSheen',
      'uSwirls'
    ]) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    const fieldTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniforms.uField, 0);

    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const probeCtx = probe.getContext('2d', { willReadFrequently: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const pointer = { x: 0.5, y: 0.5, px: 0, py: 0, inside: false, tracked: false };
    const state = {
      width: 1,
      height: 1,
      phase: 0,
      mouse: [0.5, 0.5],
      presence: 0,
      color: [1, 1, 1],
      colorKey: '',
      cols: 0,
      rows: 0,
      field: new Float32Array(0),
      scratch: new Float32Array(0),
      fieldActive: false,
      swirls: [],
      seed: 0
    };
    const swirlData = new Float32Array(MAX_SWIRLS * 4);
    let raf = 0;
    let last = 0;
    let visible = true;
    let alive = true;

    const resolveColor = s => {
      if (s.colorKey === state.colorKey) return;
      state.colorKey = s.colorKey;
      if (Array.isArray(s.color)) {
        state.color = [0, 1, 2].map(i => clamp(Number(s.color[i] ?? 1), 0, 1));
        return;
      }
      if (!probeCtx) return;
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = '#ffffff';
      probeCtx.fillStyle = String(s.color);
      probeCtx.fillRect(0, 0, 1, 1);
      const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data;
      state.color = [r / 255, g / 255, b / 255];
    };

    const layoutField = () => {
      const cols = FIELD_COLUMNS;
      const rows = clamp(Math.round((cols * state.height) / state.width), 6, 96);
      if (cols === state.cols && rows === state.rows) return;
      state.cols = cols;
      state.rows = rows;
      state.field = new Float32Array(cols * rows * 2);
      state.scratch = new Float32Array(cols * rows * 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, cols, rows, 0, gl.RG, gl.FLOAT, state.field);
    };

    const brush = (x, y, dx, dy) => {
      const { cols, rows, field } = state;
      const radius = 0.22;
      const aspect = state.width / state.height;
      const fromCol = Math.max(0, Math.floor((x - radius / aspect) * cols));
      const toCol = Math.min(cols - 1, Math.ceil((x + radius / aspect) * cols));
      const fromRow = Math.max(0, Math.floor((y - radius) * rows));
      const toRow = Math.min(rows - 1, Math.ceil((y + radius) * rows));
      for (let row = fromRow; row <= toRow; row++) {
        for (let col = fromCol; col <= toCol; col++) {
          const ox = ((col + 0.5) / cols - x) * aspect;
          const oy = (row + 0.5) / rows - y;
          const t = 1 - (ox * ox + oy * oy) / (radius * radius);
          if (t <= 0) continue;
          const i = (row * cols + col) * 2;
          const px = field[i] + dx * t * t * 3.2;
          const py = field[i + 1] + dy * t * t * 3.2;
          const length = Math.hypot(px, py);
          const limit = 0.4;
          const k = length > 0 ? (limit * Math.tanh(length / limit)) / length : 0;
          field[i] = px * k;
          field[i + 1] = py * k;
        }
      }
      state.fieldActive = true;
    };

    const relaxField = dt => {
      const { cols, rows, field, scratch } = state;
      const decay = Math.exp(-dt * 1.4);
      let peak = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = (row * cols + col) * 2;
          const l = (row * cols + Math.max(0, col - 1)) * 2;
          const r = (row * cols + Math.min(cols - 1, col + 1)) * 2;
          const u = (Math.max(0, row - 1) * cols + col) * 2;
          const b = (Math.min(rows - 1, row + 1) * cols + col) * 2;
          for (let c = 0; c < 2; c++) {
            const value = (field[i + c] * 12 + field[l + c] + field[r + c] + field[u + c] + field[b + c]) / 16;
            scratch[i + c] = value * decay;
            peak = Math.max(peak, Math.abs(scratch[i + c]));
          }
        }
      }
      field.set(scratch);
      if (peak < 0.0004) {
        field.fill(0);
        state.fieldActive = false;
      }
    };

    const render = () => {
      const s = settingsRef.current;
      resolveColor(s);
      layoutField();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, state.cols, state.rows, gl.RG, gl.FLOAT, state.field);
      swirlData.fill(0);
      state.swirls.forEach((swirl, k) => {
        const strength = Math.min(1, swirl.age / 0.08) * (1 - swirl.age / SWIRL_LIFE) ** 1.5;
        swirlData.set([swirl.x, swirl.y, swirl.age, Math.max(strength * (swirl.boost || 1), 0.0001)], k * 4);
      });
      gl.uniform2f(uniforms.uResolution, state.width, state.height);
      gl.uniform1f(uniforms.uTime, state.phase);
      gl.uniform3f(uniforms.uColor, state.color[0], state.color[1], state.color[2]);
      gl.uniform2f(uniforms.uMouse, state.mouse[0], state.mouse[1]);
      gl.uniform1f(uniforms.uAmplitude, s.amplitude);
      gl.uniform1f(uniforms.uScale, s.scale);
      gl.uniform1f(uniforms.uRotation, (s.rotation * Math.PI) / 180);
      gl.uniform1i(uniforms.uDetail, s.detail);
      gl.uniform1f(uniforms.uWarp, s.warp);
      gl.uniform1f(uniforms.uHue, (s.hueShift * Math.PI) / 180);
      gl.uniform1f(uniforms.uSaturation, s.saturation);
      gl.uniform1f(uniforms.uBrightness, s.brightness);
      gl.uniform1f(uniforms.uContrast, s.contrast);
      gl.uniform1f(uniforms.uGrain, s.grain);
      gl.uniform1f(uniforms.uSeed, state.seed);
      gl.uniform1f(uniforms.uFade, s.fade);
      gl.uniform1f(uniforms.uOpacity, s.opacity);
      gl.uniform1f(uniforms.uStir, s.mouseReact ? s.stir : 0);
      gl.uniform3f(uniforms.uPointer, pointer.x, pointer.y, s.mouseReact ? state.presence : 0);
      gl.uniform1f(uniforms.uSheen, s.sheen);
      gl.uniform4fv(uniforms.uSwirls, swirlData);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = now => {
      raf = 0;
      if (!alive || !visible) return;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const moving = !s.paused && !reduce;
      if (moving) state.phase += dt * s.speed;
      const target = s.mouseReact && pointer.tracked ? [pointer.x, pointer.y] : [0.5, 0.5];
      const follow = 1 - Math.exp(-dt * 5);
      state.mouse[0] += (target[0] - state.mouse[0]) * follow;
      state.mouse[1] += (target[1] - state.mouse[1]) * follow;
      state.presence += ((pointer.inside ? 1 : 0) - state.presence) * (1 - Math.exp(-dt * 4));
      if (state.fieldActive) relaxField(dt);
      state.swirls = state.swirls.filter(swirl => (swirl.age += dt) < SWIRL_LIFE);
      if (s.grain > 0 && moving) state.seed = Math.floor(now / 42) % 997;
      render();
      const settling =
        Math.abs(target[0] - state.mouse[0]) > 0.0005 ||
        Math.abs(target[1] - state.mouse[1]) > 0.0005 ||
        Math.abs((pointer.inside ? 1 : 0) - state.presence) > 0.002;
      if (moving || settling || state.fieldActive || state.swirls.length) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (raf || !alive || !visible) return;
      raf = requestAnimationFrame(frame);
    };

    const locate = event => {
      const rect = root.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / Math.max(1, rect.width),
        y: 1 - (event.clientY - rect.top) / Math.max(1, rect.height)
      };
    };

    const onPointerMove = event => {
      const s = settingsRef.current;
      const { x, y } = locate(event);
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (inside && s.mouseReact && !reduce && pointer.inside && s.stir > 0) {
        brush(x, y, x - pointer.x, y - pointer.y);
      }
      pointer.x = x;
      pointer.y = y;
      pointer.inside = inside;
      if (inside) pointer.tracked = true;
      wake();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      wake();
    };

    const onPointerDown = event => {
      if (event.target.closest && event.target.closest('.btn-specular')) return;   // the button sends its own ripple
      const s = settingsRef.current;
      if (!s.clickSwirl || reduce) return;
      const { x, y } = locate(event);
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      if (state.swirls.length >= MAX_SWIRLS) {
        state.swirls.shift();
      }
      state.swirls.push({ x, y, age: 0 });
      wake();
    };

    const resize = () => {
      const s = settingsRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * s.resolution;
      state.width = Math.max(1, root.clientWidth);
      state.height = Math.max(1, root.clientHeight);
      canvas.width = Math.max(1, Math.round(state.width * dpr));
      canvas.height = Math.max(1, Math.round(state.height * dpr));
      render();
      wake();
    };

    wakeRef.current = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * settingsRef.current.resolution;
      if (canvas.width !== Math.max(1, Math.round(state.width * dpr))) resize();
      else if (!raf) render();
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    const visibility = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    visibility.observe(root);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    // lets the "See My Work" button send a (stronger) light ripple through the silk from its centre
    window.heroRipple = (cx, cy) => {
      const rect = root.getBoundingClientRect();
      if (state.swirls.length >= MAX_SWIRLS) state.swirls.shift();
      state.swirls.push({ x: (cx - rect.left) / rect.width, y: 1 - (cy - rect.top) / rect.height, age: 0, boost: 2.6 });
      wake();
    };
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    resize();

})();

/* ============================================
   SPECULAR BUTTON — the shine glides around the edge on its own, and when
   the cursor comes within 250px it slides over to follow it and brightens.
   ============================================ */
(function () {
  const btn = document.querySelector('.btn-specular');
  if (!btn) return;
  const PROXIMITY = 250, IDLE = 0.5, INTENSITY = 1, LAP = 4.5;   // LAP = seconds per trip around
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mouse = null, near = 0, mx = 50, my = 0, visible = true, raf = 0;
  const start = performance.now();

  window.addEventListener('pointermove', e => { mouse = e; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { mouse = null; });

  function frame(now){
    raf = 0;
    const r = btn.getBoundingClientRect();
    // idle: travel around the edge (a point on a stretched circle around the button)
    const a = ((now - start) / 1000 / LAP) * Math.PI * 2 - Math.PI / 2;
    let tx = 50 + Math.cos(a) * 58, ty = 50 + Math.sin(a) * 75, tNear = 0;
    if (mouse){
      const cx = Math.min(Math.max(mouse.clientX, r.left), r.right);
      const cy = Math.min(Math.max(mouse.clientY, r.top), r.bottom);
      tNear = Math.max(0, 1 - Math.hypot(mouse.clientX - cx, mouse.clientY - cy) / PROXIMITY);
      if (tNear > 0){
        const fx = (mouse.clientX - r.left) / r.width * 100, fy = (mouse.clientY - r.top) / r.height * 100;
        const k = Math.min(1, tNear * 2.5);        // hand over from the orbit to the cursor
        tx += (fx - tx) * k; ty += (fy - ty) * k;
      }
    }
    // ease so the hand-over feels smooth
    mx += (tx - mx) * 0.18; my += (ty - my) * 0.18; near += (tNear - near) * 0.12;
    btn.style.setProperty('--mx', mx.toFixed(1) + '%');
    btn.style.setProperty('--my', my.toFixed(1) + '%');
    btn.style.setProperty('--shine', (IDLE + (INTENSITY - IDLE) * near).toFixed(3));
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  if (reduce) return;   // keeps the still shine on the top edge
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }).observe(btn);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });
  raf = requestAnimationFrame(frame);
})();

/* ============================================
   SCROLL STAR -> WORK PAGE
   The hero stays pinned while you scroll; the scroll moves a star around the
   "See My Work" border. One full lap = slide over to work.html.
   Skipped for reduced motion (the page then scrolls normally).
   ============================================ */
(function () {
  const btn = document.querySelector('.btn-specular');
  const hero = document.querySelector('.hero--shimmer');
  if (!btn || !hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const DISTANCE = 1.3;            // how far to scroll for one lap, in screen heights (higher = slower)
  const TARGET = btn.getAttribute('href') || 'work.html';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // pin the hero: wrap it in a taller box and make it sticky
  const pin = document.createElement('div');
  pin.className = 'hero-pin';
  hero.parentNode.insertBefore(pin, hero);
  pin.appendChild(hero);
  pin.style.height = `calc(100vh + ${DISTANCE * 100}vh + 15vh)`;   // +15vh so phones (moving address bar) always finish the lap
  hero.style.position = 'sticky';
  hero.style.top = '0';
  hero.style.height = '100vh';

  let done = false, raf = 0;
  function update(){
    raf = 0;
    const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * DISTANCE)));
    btn.style.setProperty('--sp', p.toFixed(3));
    btn.style.setProperty('--a', (p * 360).toFixed(1) + 'deg');
    if (p >= 0.98 && !done) go();
  }
  // lap finished or button clicked: the button lights up, a light ripple runs through
  // the silk from the button, then Work cross-fades in (CSS view transition, see
  // work.html). Browsers without it just open Work.
  function go(){
    if (done) return;
    done = true;
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    btn.classList.add('is-pressed');
    if (window.heroRipple) window.heroRipple(x, y);
    try { sessionStorage.setItem('etReveal', '1'); } catch (e) {}
    setTimeout(() => { window.location.href = TARGET; }, 260);   // a beat to see the press + ripple, then a light cross-fade
  }
  btn.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // let "open in new tab" work normally
    e.preventDefault();
    go();
  });
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });

  // coming back with the Back button: start fresh at the top
  window.addEventListener('pageshow', () => {
    done = false;
    btn.classList.remove('is-pressed');
    try { sessionStorage.removeItem('etReveal'); } catch (e) {}
    window.scrollTo(0, 0);
    update();
  });
  update();
})();
