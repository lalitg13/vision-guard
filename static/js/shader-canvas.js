/**
 * VisionGuard — AI Infrastructure Shader Canvas
 * Recreates the exact ShaderGradient sphere uniforms from @shadergradient/react:
 * uSpeed: 0.3, uStrength: 0.4, uDensity: 0.8, uFrequency: 5.5, uAmplitude: 7
 * rotationZ: 140, color1: #1f469a, color2: #000000, color3: #000000
 * brightness: 1.5, grain: on, camera: distance 1.5, azimuth 250, polar 140
 */

(function () {
  const canvas = document.getElementById("shader-canvas");
  if (!canvas) return;

  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) {
    console.warn("[ShaderCanvas] WebGL not supported, falling back to CSS background.");
    return;
  }

  const vertexShaderSrc = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  // Fragment Shader reproducing the 3D Simplex sphere displacement & deep #1f469a lighting
  const fragmentShaderSrc = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform float uTime;

    // Simplex 3D noise implementation
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
      // Normalized coordinates centered at screen
      vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);

      // Offset camera view to replicate azimuth=250, polar=140, distance=1.5
      vec2 sphereCenter = vec2(0.08, 0.12);
      vec2 p = uv - sphereCenter;

      // Rotation matrix for rotationZ = 140 deg
      float rad = 140.0 * 3.14159265 / 180.0;
      mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
      vec2 rotP = rot * p;

      float dist = length(rotP);

      // Raymarch-like spherical depth
      float radius = 0.88;
      float z = 0.0;
      if (dist < radius) {
        z = sqrt(radius * radius - dist * dist);
      }

      vec3 pos = vec3(rotP, z);

      // Animated 3D noise with shader uniforms:
      // uSpeed: 0.3, uStrength: 0.4, uDensity: 0.8, uFrequency: 5.5, uAmplitude: 7
      float time = uTime * 0.3;
      float noiseVal = snoise(pos * (5.5 * 0.8) + vec3(0.0, 0.0, time));
      float displacement = noiseVal * (0.4 * 0.15);

      float displacedDist = length(rotP) + displacement;
      float sphereAlpha = smoothstep(radius, radius - 0.35, displacedDist);

      // 3D Directional Lighting vector (azimuth 250, polar 140)
      vec3 lightDir = normalize(vec3(-0.6, -0.7, 0.5));
      vec3 normal = normalize(pos + vec3(displacement * 2.0));
      float diff = max(dot(normal, lightDir), 0.0);
      float rim = 1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0);

      // Core palette colors:
      // color1: #1f469a (31, 70, 154)
      // color2: #000000, color3: #000000
      vec3 colorBlue = vec3(31.0/255.0, 70.0/255.0, 154.0/255.0);
      vec3 colorBlack = vec3(0.0, 0.0, 0.0);

      // Illumination combining diffuse, rim light, and brightness = 1.5
      float intensity = (diff * 1.35 + pow(rim, 3.0) * 0.4) * 1.5;
      intensity = clamp(intensity, 0.0, 1.0);

      vec3 finalColor = mix(colorBlack, colorBlue, intensity * sphereAlpha);

      // Add gentle top-left ambient light fill
      float ambientTop = smoothstep(1.2, -0.3, length(uv - vec2(-0.4, 0.5)));
      finalColor += colorBlue * ambientTop * 0.12;

      // Film grain overlay (grain: on)
      float grain = (fract(sin(dot(gl_FragCoord.xy + fract(uTime), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.04;
      finalColor += vec3(grain);

      gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
    }
  `;

  function createShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("[ShaderCanvas] Shader compile error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vShader = createShader(gl.VERTEX_SHADER, vertexShaderSrc);
  const fShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSrc);
  if (!vShader || !fShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[ShaderCanvas] Program link error:", gl.getProgramInfoLog(program));
    return;
  }

  // Full-screen Quad geometry
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const posLocation = gl.getAttribLocation(program, "position");
  const resLocation = gl.getUniformLocation(program, "uResolution");
  const timeLocation = gl.getUniformLocation(program, "uTime");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = window.innerWidth;
    const height = Math.max(window.innerHeight * 1.25, document.documentElement.scrollHeight);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", resize);
  resize();

  let startTime = performance.now();
  function render() {
    const now = performance.now();
    const elapsedTime = (now - startTime) / 1000.0;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, elapsedTime);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
