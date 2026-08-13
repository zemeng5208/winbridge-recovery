import {
  PROGRESS_MOTION_WIDTH,
  PROGRESS_MOTION_HEIGHT,
  PROGRESS_MOTION_DURATION,
  PROGRESS_MOTION_MAX_PX,
  getProgressMotionData
} from './progress-motion-data.js';

function hexToRgb01(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  ];
}

function stringSeed(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

const PROFILE_INDEX = {
  'model-training': 0,
  'agent-migration': 1,
  'visual-training': 2
};

const MOTION_SCALE_FACTORS = {
  'model-training': 1.05,
  'agent-migration': 1.04,
  'visual-training': 1.04
};

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_progress;
uniform float u_seed;
uniform float u_profile;
uniform sampler2D u_motion;
uniform sampler2D u_effect;
uniform float u_hasEffect;
uniform float u_effectFrames;
uniform float u_motionDuration;
uniform float u_motionScale;
uniform vec3 u_dark;
uniform vec3 u_accentA;
uniform vec3 u_accentB;
uniform vec3 u_glow;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32 + u_seed * 11.7);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;
  mat2 rotation = mat2(0.82, 0.57, -0.57, 0.82);
  for (int i = 0; i < 6; i++) {
    value += noise(p) * amplitude;
    p = rotation * p * 2.02 + 13.7;
    amplitude *= 0.48;
  }
  return value;
}

float gaussian(float value, float center, float width) {
  float delta = (value - center) / max(width, 0.0001);
  return exp(-delta * delta);
}

float profileMix(float model, float agent, float visual) {
  if (u_profile < 0.5) return model;
  if (u_profile < 1.5) return agent;
  return visual;
}

float motionSample(float y, float t) {
  float phase = fract(t / max(u_motionDuration, 0.001));
  float captured = texture(u_motion, vec2(phase, 1.0 - clamp(y, 0.0, 1.0))).r;
  return (captured * 2.0 - 1.0) * u_motionScale;
}

float edgeDisplacement(float y, float t) {
  return motionSample(y, t);
}

float flowDisplacement(float y, float t) {
  return (
    motionSample(y - 0.024, t) * 0.08 +
    motionSample(y - 0.012, t) * 0.18 +
    motionSample(y, t) * 0.48 +
    motionSample(y + 0.012, t) * 0.18 +
    motionSample(y + 0.024, t) * 0.08
  );
}

float ellipseRing(vec2 p, float radius, float width) {
  return gaussian(length(p), radius, width);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time;
  float edge = u_progress + edgeDisplacement(uv.y, t);
  float flowEdge = u_progress + flowDisplacement(uv.y, t);
  float d = uv.x - edge;
  float fd = uv.x - flowEdge;

  vec3 rightBase = vec3(0.125, 0.129, 0.145);
  vec3 color = rightBase;

  float leftMask = 1.0 - smoothstep(-0.001, 0.002, d);
  color = mix(color, u_dark, leftMask * profileMix(0.96, 0.92, 0.96));

  vec2 flowP = vec2((fd + 0.10) * 6.2, uv.y * 1.95);
  float flowA = fbm(flowP + vec2(-t * 0.22, t * 0.27) + u_seed * 1.7);
  float flowB = fbm(flowP * 1.52 + vec2(t * 0.28, -t * 0.36) + 8.2 + u_seed);
  float flowC = fbm(flowP * 2.25 + vec2(-t * 0.41, t * 0.46) + 19.0);

  float farCenter = profileMix(-0.060, -0.079, -0.045) + (flowA - 0.5) * profileMix(0.018, 0.022, 0.014);
  float midCenter = profileMix(-0.039, -0.052, -0.030) + (flowB - 0.5) * profileMix(0.013, 0.016, 0.010);
  float hotCenter = profileMix(-0.026, -0.029, -0.023) + (flowC - 0.5) * 0.010;

  float farBand = gaussian(fd, farCenter, profileMix(0.035, 0.049, 0.030));
  float midBand = gaussian(fd, midCenter, profileMix(0.026, 0.034, 0.026));
  float hotBand = gaussian(fd, hotCenter, profileMix(0.023, 0.027, 0.026));
  float darkTrough = gaussian(fd, profileMix(-0.050, -0.058, -0.044) + (flowB - 0.5) * 0.010, profileMix(0.020, 0.025, 0.021));

  float ringY = 0.47 + sin(t * 0.58 + u_seed * 2.4) * 0.12;
  vec2 ringP = vec2((fd + 0.086) / 0.078, (uv.y - ringY) / 0.25);
  ringP += vec2((flowB - 0.5) * 0.08, (flowA - 0.5) * 0.06);
  float ringTexture = fbm(ringP * 2.15 + vec2(t * 0.18, -t * 0.14) + u_seed * 1.9);
  float ring = ellipseRing(ringP, 0.66, 0.32) * (0.30 + 0.64 * ringTexture);
  float ringCore = gaussian(length(ringP), 0.25, 0.25);
  float ringPulse = smoothstep(0.58, 0.90, 0.5 + 0.5 * sin(t * 0.82 + u_seed * 4.1));
  float modelRing = ring * ringPulse * (1.0 - step(0.5, u_profile));
  float visualRing = ring * 0.16 * step(1.5, u_profile) * ringPulse;

  float cloudGate = leftMask * smoothstep(-0.30, -0.008, fd);
  float textureA = smoothstep(0.24, 0.92, flowA * 0.72 + flowB * 0.42);
  float textureB = smoothstep(0.28, 0.94, flowB * 0.68 + flowC * 0.38);

  vec3 hotColor = u_accentB;
  color += u_accentA * farBand * cloudGate * (0.07 + textureA * profileMix(0.42, 0.24, 0.40));
  color += u_accentB * midBand * cloudGate * (0.15 + textureB * profileMix(0.70, 0.46, 0.68));
  color += hotColor * hotBand * cloudGate * profileMix(0.88, 0.62, 0.84);
  float modelMask = 1.0 - step(0.5, u_profile);
  color += u_accentA * (modelRing + visualRing) * cloudGate * profileMix(0.54, 0.0, 0.34);
  color *= 1.0 - darkTrough * profileMix(0.44, 0.24, 0.24) * cloudGate;
  color *= 1.0 - ringCore * modelMask * ringPulse * 0.44 * cloudGate;

  float broadHalo = exp(-abs(d) * 96.0);
  float innerHalo = exp(-abs(d) * 176.0);
  float colorCore = exp(-abs(d) * 360.0);
  float sharpCore = exp(-abs(d) * 760.0);
  float leftGate = 1.0 - smoothstep(-0.003, 0.005, d);

  color += u_accentA * broadHalo * leftGate * profileMix(0.09, 0.04, 0.06);
  color += hotColor * innerHalo * leftGate * profileMix(0.76, 0.72, 0.78);
  color += u_glow * colorCore * profileMix(0.72, 0.34, 0.24);

  float whiteStrength = profileMix(0.10, 0.0, 0.0);
  color += vec3(1.0, 0.99, 0.91) * sharpCore * whiteStrength;

  float rightCut = smoothstep(0.001, 0.006, d);
  color = mix(color, rightBase, rightCut);

  float effectX = (d * 1257.0 + 260.0) / 320.0;
  float atlasPhase = fract(t / 12.0) * u_effectFrames;
  float atlasFrameA = floor(atlasPhase);
  float atlasFrameB = mod(atlasFrameA + 1.0, u_effectFrames);
  float atlasMix = smoothstep(0.0, 1.0, fract(atlasPhase));
  float atlasXA = (atlasFrameA + clamp(effectX, 0.0, 1.0)) / u_effectFrames;
  float atlasXB = (atlasFrameB + clamp(effectX, 0.0, 1.0)) / u_effectFrames;
  vec3 referenceA = texture(u_effect, vec2(atlasXA, uv.y)).rgb;
  vec3 referenceB = texture(u_effect, vec2(atlasXB, uv.y)).rgb;
  vec3 referenceColor = mix(referenceA, referenceB, atlasMix);
  float stripMask = smoothstep(0.0, 0.018, effectX) * (1.0 - smoothstep(0.982, 1.0, effectX));
  float referenceLeft = 1.0 - smoothstep(-0.026, -0.012, d);
  color = mix(color, referenceColor, stripMask * referenceLeft * u_hasEffect);

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown shader link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export class ProgressFlowRenderer {
  constructor(canvas, preset) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 unavailable');

    this.canvas = canvas;
    this.gl = gl;
    this.program = createProgram(gl);
    this.profile = PROFILE_INDEX[preset.id] ?? 2;
    this.seed = stringSeed(`${preset.id}-shader`) * 13.7 + 1.0;
    this.colors = preset.colors.map(hexToRgb01);
    this.motionData = getProgressMotionData(preset.id);
    this.motionScale = (PROGRESS_MOTION_MAX_PX * (MOTION_SCALE_FACTORS[preset.id] || 1.65)) / 1257;

    this.position = gl.getAttribLocation(this.program, 'a_position');
    this.uniforms = {
      resolution: gl.getUniformLocation(this.program, 'u_resolution'),
      time: gl.getUniformLocation(this.program, 'u_time'),
      progress: gl.getUniformLocation(this.program, 'u_progress'),
      seed: gl.getUniformLocation(this.program, 'u_seed'),
      profile: gl.getUniformLocation(this.program, 'u_profile'),
      motion: gl.getUniformLocation(this.program, 'u_motion'),
      effect: gl.getUniformLocation(this.program, 'u_effect'),
      hasEffect: gl.getUniformLocation(this.program, 'u_hasEffect'),
      effectFrames: gl.getUniformLocation(this.program, 'u_effectFrames'),
      motionDuration: gl.getUniformLocation(this.program, 'u_motionDuration'),
      motionScale: gl.getUniformLocation(this.program, 'u_motionScale'),
      dark: gl.getUniformLocation(this.program, 'u_dark'),
      accentA: gl.getUniformLocation(this.program, 'u_accentA'),
      accentB: gl.getUniformLocation(this.program, 'u_accentB'),
      glow: gl.getUniformLocation(this.program, 'u_glow')
    };

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.motionTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.motionTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      PROGRESS_MOTION_WIDTH,
      PROGRESS_MOTION_HEIGHT,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.motionData
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.effectTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.effectTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      1,
      1,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      new Uint8Array([32, 33, 38])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.effectUploaded = false;
  }

  resize(width, height, dpr) {
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  draw(time, progress, effectImage = null) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.position);
    gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.time, time);
    gl.uniform1f(this.uniforms.progress, progress / 100);
    gl.uniform1f(this.uniforms.seed, this.seed);
    gl.uniform1f(this.uniforms.profile, this.profile);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.motionTexture);
    gl.uniform1i(this.uniforms.motion, 0);
    gl.uniform1f(this.uniforms.motionDuration, PROGRESS_MOTION_DURATION);
    gl.uniform1f(this.uniforms.motionScale, this.motionScale);

    let hasEffect = this.effectUploaded ? 1 : 0;
    if (!this.effectUploaded && effectImage && effectImage.complete && effectImage.naturalWidth > 0) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.effectTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, effectImage);
        this.effectUploaded = true;
        hasEffect = 1;
      } catch (error) {
        console.warn('[画境观屿] 参考纹理图集上传失败，继续使用程序化降级。', error);
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.effectTexture);
    gl.uniform1i(this.uniforms.effect, 1);
    gl.uniform1f(this.uniforms.hasEffect, hasEffect);
    gl.uniform1f(this.uniforms.effectFrames, 24);

    gl.uniform3fv(this.uniforms.dark, this.colors[0]);
    gl.uniform3fv(this.uniforms.accentA, this.colors[1]);
    gl.uniform3fv(this.uniforms.accentB, this.colors[2]);
    gl.uniform3fv(this.uniforms.glow, this.colors[3]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteTexture(this.motionTexture);
    gl.deleteTexture(this.effectTexture);
    gl.deleteProgram(this.program);
  }
}

export function createProgressFlowRenderer(canvas, preset) {
  try {
    return new ProgressFlowRenderer(canvas, preset);
  } catch (error) {
    console.warn('[画境观屿] 进度流体 WebGL2 不可用，使用 Canvas 2D 降级。', error);
    return null;
  }
}
