import { RefObject, useEffect, useRef } from 'react';
import { parseCubeText } from '@/lib/parseCube';
import { vertexShaderSrc, fragmentShaderSrc } from '@/lib/lutShader';

export interface UseWebGLLutOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  activeLutId: string | null;
  lutStrength: number;
  fetchLutFile: (lutId: string) => Promise<string>;
  enabled: boolean;
}

export function useWebGLLut({
  videoRef,
  canvasRef,
  activeLutId,
  lutStrength,
  fetchLutFile,
  enabled,
}: UseWebGLLutOptions): void {
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const videoTexRef = useRef<WebGLTexture | null>(null);
  const lutTexRef = useRef<WebGLTexture | null>(null);
  const rafRef = useRef<number | null>(null);
  const lutLoadedRef = useRef(false);
  const lutStrengthRef = useRef(lutStrength);
  const lutSizeLocRef = useRef<WebGLUniformLocation | null>(null);
  const lutStrengthLocRef = useRef<WebGLUniformLocation | null>(null);
  const lutSizeRef = useRef(32);
  const fetchLutFileRef = useRef(fetchLutFile);

  // Keep refs in sync with latest prop values
  useEffect(() => {
    fetchLutFileRef.current = fetchLutFile;
  });

  // Keep lutStrengthRef in sync so the RAF loop always reads the latest value
  useEffect(() => {
    lutStrengthRef.current = lutStrength;
  }, [lutStrength]);

  // Main effect: init/teardown GL when enabled changes
  useEffect(() => {
    if (!enabled) {
      teardown();
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // Wait for video metadata before initialising GL
    const init = () => {
      initWebGL();
      if (activeLutId) {
        loadLutTexture(activeLutId).then(() => {
          rafRef.current = requestAnimationFrame(renderFrame);
        });
      } else {
        rafRef.current = requestAnimationFrame(renderFrame);
      }
    };

    if (video.readyState >= 1) {
      init();
    } else {
      video.addEventListener('loadedmetadata', init, { once: true });
      return () => video.removeEventListener('loadedmetadata', init);
    }

    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Swap LUT texture when activeLutId changes (while enabled)
  useEffect(() => {
    if (!enabled || !glRef.current) return;
    if (activeLutId) {
      loadLutTexture(activeLutId);
    } else {
      lutLoadedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLutId, enabled]);

  // --- helpers ---

  function teardown() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const gl = glRef.current;
    if (gl) {
      if (videoTexRef.current) {
        gl.deleteTexture(videoTexRef.current);
        videoTexRef.current = null;
      }
      if (lutTexRef.current) {
        gl.deleteTexture(lutTexRef.current);
        lutTexRef.current = null;
      }
      if (programRef.current) {
        gl.deleteProgram(programRef.current);
        programRef.current = null;
      }
    }
    glRef.current = null;
    lutLoadedRef.current = false;
  }

  function compileShader(gl: WebGL2RenderingContext, source: string, type: GLenum): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vShader = compileShader(gl, vertexShaderSrc, gl.VERTEX_SHADER);
    const fShader = compileShader(gl, fragmentShaderSrc, gl.FRAGMENT_SHADER);
    if (!vShader || !fShader) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vShader);
    gl.attachShader(prog, fShader);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    gl.deleteShader(vShader);
    gl.deleteShader(fShader);
    return prog;
  }

  function initWebGL() {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }
    glRef.current = gl;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const prog = createProgram(gl);
    if (!prog) return;
    programRef.current = prog;

    // Fullscreen quad VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 8, 0);

    // Video texture
    const vidTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, vidTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
    videoTexRef.current = vidTex;

    // LUT texture
    const lutTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    lutTexRef.current = lutTex;

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'uVideo'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uLut'), 1);
    lutSizeLocRef.current = gl.getUniformLocation(prog, 'uLutSize');
    lutStrengthLocRef.current = gl.getUniformLocation(prog, 'uLutStrength');
  }

  async function loadLutTexture(lutId: string) {
    try {
      const gl = glRef.current;
      if (!gl) return;

      const text = await fetchLutFileRef.current(lutId);
      const cubeData = parseCubeText(text);
      lutSizeRef.current = cubeData.size;

      const bytes = new Uint8Array(cubeData.data.length);
      for (let i = 0; i < cubeData.data.length; i++) {
        bytes[i] = Math.max(0, Math.min(255, Math.round(cubeData.data[i] * 255)));
      }

      gl.bindTexture(gl.TEXTURE_3D, lutTexRef.current);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(
        gl.TEXTURE_3D, 0, gl.RGB8,
        cubeData.size, cubeData.size, cubeData.size,
        0, gl.RGB, gl.UNSIGNED_BYTE, bytes,
      );
      lutLoadedRef.current = true;
    } catch (e) {
      console.error('Failed to load LUT texture:', e);
      lutLoadedRef.current = false;
    }
  }

  function syncCanvasSize(gl: WebGL2RenderingContext) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w <= 0 || h <= 0) return;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    // Always sync CSS so the canvas fills the container correctly from the first frame
    const container = canvas.parentElement;
    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
      const canvasAspect = w / h;
      const containerAspect = container.clientWidth / container.clientHeight;
      const wantWidth = canvasAspect > containerAspect ? '100%' : 'auto';
      const wantHeight = canvasAspect > containerAspect ? 'auto' : '100%';
      if (canvas.style.width !== wantWidth) canvas.style.width = wantWidth;
      if (canvas.style.height !== wantHeight) canvas.style.height = wantHeight;
    }
  }

  function renderFrame() {
    const gl = glRef.current;
    const video = videoRef.current;
    const prog = programRef.current;

    if (!gl || !video || !prog || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    syncCanvasSize(gl);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);

    gl.useProgram(prog);
    if (lutLoadedRef.current) {
      gl.uniform1f(lutSizeLocRef.current, lutSizeRef.current);
      gl.uniform1f(lutStrengthLocRef.current, lutStrengthRef.current);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lutTexRef.current);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    rafRef.current = requestAnimationFrame(renderFrame);
  }
}
