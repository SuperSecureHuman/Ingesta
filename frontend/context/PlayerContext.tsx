'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useMemo } from 'react';
import Hls from 'hls.js';
import { ProbeData, Capabilities, TranscodeStats } from '@/lib/types';
import { generateUUID } from '@/lib/utils';
import { fetchCapabilities } from '@/lib/api';
import { parseCube } from '@/lib/parseCube';
import { vertexShaderSrc, fragmentShaderSrc } from '@/lib/lutShader';
import { useLutContext } from './LutContext';

interface PlayerContextType {
  isVisible: boolean;
  filePath: string | null;
  quality: string;
  probeData: ProbeData | null;
  capabilities: Capabilities | null;
  transcodeStats: TranscodeStats;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  startPlayback: (filePath: string, seekTime?: number) => Promise<void>;
  stopPlayback: () => void;
  changeQuality: (key: string) => Promise<void>;
  changeLut: (lutId: string | null) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerContextProvider({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [quality, setQuality] = useState('source');
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [transcodeStats, setTranscodeStats] = useState<TranscodeStats>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcodeStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityRef = useRef('source');
  const lutIdRef = useRef<string | null>(null);
  const probedFilePathRef = useRef<string | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);

  // WebGL refs
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const videoTexRef = useRef<WebGLTexture | null>(null);
  const lutTexRef = useRef<WebGLTexture | null>(null);
  const rafRef = useRef<number | null>(null);
  const lutLoadedRef = useRef(false);
  const lutStrengthRef = useRef(1.0);

  const { lutMode, activeLutId, lutStrength } = useLutContext();

  // Sync lutStrengthRef to LutContext lutStrength
  useEffect(() => {
    lutStrengthRef.current = lutStrength;
  }, [lutStrength]);

  // Fetch transcode stats with adaptive polling backoff
  const fetchTranscodeStats = async () => {
    try {
      const resp = await fetch('/api/debug/state');
      if (!resp.ok) return;
      const data = await resp.json();
      const active = data.jobs?.find(
        (j: any) => !j.has_exited && j.pid
      );
      if (!active && transcodeStatsIntervalRef.current) {
        clearInterval(transcodeStatsIntervalRef.current);
        transcodeStatsIntervalRef.current = null;
      }
      setTranscodeStats(
        active
          ? {
              fps: active.transcode_fps || 0,
              speed: active.transcode_speed || 0
            }
          : {}
      );
    } catch (e) {
      // Silently fail
    }
  };

  // Compile shader helper
  const compileShader = (source: string, type: GLenum): WebGLShader | null => {
    const gl = glRef.current;
    if (!gl) return null;
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
  };

  // Create WebGL program
  const createProgram = (): WebGLProgram | null => {
    const gl = glRef.current;
    if (!gl) return null;
    const vShader = compileShader(vertexShaderSrc, gl.VERTEX_SHADER);
    const fShader = compileShader(fragmentShaderSrc, gl.FRAGMENT_SHADER);
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
  };

  // Initialize WebGL
  const initWebGL = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }

    glRef.current = gl;

    // Set viewport
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Create program
    const prog = createProgram();
    if (!prog) return;
    programRef.current = prog;

    // Create VAO with fullscreen quad
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 8, 0);

    // Create video texture
    const vidTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, vidTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
    videoTexRef.current = vidTex;

    // Create LUT texture
    const lutTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    lutTexRef.current = lutTex;

    // Set uniforms
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'uVideo'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uLut'), 1);
  };

  // Load LUT texture
  const loadLutTexture = async (lutId: string | null) => {
    if (!lutId) {
      lutLoadedRef.current = false;
      return;
    }

    try {
      const gl = glRef.current;
      if (!gl) return;

      const cubeData = await parseCube(`/api/luts/${lutId}/file`);

      // Convert Float32Array [0, 1] to Uint8Array [0, 255]
      const bytes = new Uint8Array(cubeData.data.length);
      for (let i = 0; i < cubeData.data.length; i++) {
        bytes[i] = Math.max(0, Math.min(255, Math.round(cubeData.data[i] * 255)));
      }

      gl.bindTexture(gl.TEXTURE_3D, lutTexRef.current);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

      gl.texImage3D(
        gl.TEXTURE_3D, 0, gl.RGB8,
        cubeData.size, cubeData.size, cubeData.size,
        0,
        gl.RGB, gl.UNSIGNED_BYTE,
        bytes
      );

      lutLoadedRef.current = true;
      console.log(`LUT loaded: ${cubeData.size}×${cubeData.size}×${cubeData.size}`);
    } catch (e) {
      console.error('Failed to load LUT texture:', e);
      lutLoadedRef.current = false;
    }
  };

  // RAF render loop
  const renderFrame = () => {
    const gl = glRef.current;
    const video = videoRef.current;
    const prog = programRef.current;

    if (!gl || !video || !prog || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    // Upload video frame
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);

    // Update uniforms
    gl.useProgram(prog);
    if (lutLoadedRef.current) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uLutSize'), 32); // TODO: make dynamic
      gl.uniform1f(gl.getUniformLocation(prog, 'uLutStrength'), lutStrengthRef.current);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lutTexRef.current);
    }

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    rafRef.current = requestAnimationFrame(renderFrame);
  };

  // Start playback
  const startPlayback = async (newFilePath: string, seekTime = 0) => {
    if (!videoRef.current) return;

    const sid = generateUUID();
    sessionIdRef.current = sid;
    playbackStartTimeRef.current = Date.now();
    setFilePath(newFilePath);
    setIsVisible(true);

    try {
      const shouldProbe = newFilePath !== probedFilePathRef.current || !probeData;

      if (shouldProbe) {
        const [probeResp, caps] = await Promise.all([
          fetch(`/api/probe?path=${encodeURIComponent(newFilePath)}`),
          fetchCapabilities(),
        ]);

        if (!probeResp.ok) throw new Error('Probe failed');

        const probe = await probeResp.json();
        setProbeData(probe);
        setCapabilities(caps);
        probedFilePathRef.current = newFilePath;
      }

      // Determine if using client or server LUT
      const useClientLut = lutMode === 'client' && activeLutId;
      const useServerLut = lutMode === 'server' && activeLutId;

      // Adaptive segment length
      const isTranscoding = useServerLut || qualityRef.current !== 'source';
      const segmentLength = isTranscoding ? 1 : 4;

      // Build playlist URL (no lut_id for client mode)
      const playlistUrl = `/api/playlist/${sid}/main.m3u8?path=${encodeURIComponent(
        newFilePath
      )}&quality=${qualityRef.current}&segment_length=${segmentLength}${useServerLut ? `&lut_id=${activeLutId}` : ''}`;

      // Clean up old HLS
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const video = videoRef.current;
      video.pause();
      video.src = '';

      // Set up buffer config
      if (Hls.isSupported()) {
        const bufferConfig = isTranscoding
          ? {
              maxBufferLength: 60,
              maxMaxBufferLength: 120,
              backBufferLength: 5,
              lowWaterMark: 10,
              highWaterMark: 30,
            }
          : {
              maxBufferLength: 15,
              maxMaxBufferLength: 30,
              backBufferLength: 2,
              lowWaterMark: 3,
              highWaterMark: 10,
            };

        const hls = new Hls({
          debug: false,
          enableWorker: true,
          ...bufferConfig,
          maxBufferSize: isTranscoding ? 200 * 1000 * 1000 : 50 * 1000 * 1000,
          startLevel: -1,
          abrEwmaDefaultEstimate: 5000000,
          abrEwmaFastLive: 3,
          abrEwmaSlowLive: 9,
        });

        hls.on(Hls.Events.MANIFEST_PARSED, async () => {
          video.play();
          if (seekTime > 0) {
            video.currentTime = seekTime;
          }

          // Init WebGL and start RAF for client LUT
          if (useClientLut) {
            initWebGL();
            await loadLutTexture(activeLutId);
            rafRef.current = requestAnimationFrame(renderFrame);
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
        });

        hls.loadSource(playlistUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl;
        video.play();
      }

      // Ping loop
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        fetch(`/api/ping/${sid}`, { method: 'POST' }).catch(
          (e) => console.warn(e)
        );
      }, 10000);

      // Transcode stats (only for server-side LUT)
      if (useServerLut || qualityRef.current !== 'source') {
        if (transcodeStatsIntervalRef.current)
          clearInterval(transcodeStatsIntervalRef.current);

        let pollCount = 0;
        transcodeStatsIntervalRef.current = setInterval(() => {
          pollCount++;
          fetchTranscodeStats();

          if (pollCount === 15) {
            clearInterval(transcodeStatsIntervalRef.current!);
            transcodeStatsIntervalRef.current = setInterval(
              fetchTranscodeStats,
              5000
            );
          }
        }, 1000);
      }
    } catch (e) {
      console.error('startPlayback error:', e);
      setIsVisible(false);
      setFilePath(null);
    }
  };

  // Stop playback
  const stopPlayback = () => {
    // Cancel RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Clear intervals
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (transcodeStatsIntervalRef.current) {
      clearInterval(transcodeStatsIntervalRef.current);
      transcodeStatsIntervalRef.current = null;
    }

    // Destroy HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Stop video
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }

    // Clean up GL
    const gl = glRef.current;
    if (gl && videoTexRef.current) {
      gl.deleteTexture(videoTexRef.current);
      videoTexRef.current = null;
    }

    // Send stop signal
    if (sessionIdRef.current) {
      fetch(`/api/stop/${sessionIdRef.current}`, { method: 'POST' }).catch(
        (e) => console.warn(e)
      );
    }

    // Update state
    setIsVisible(false);
    setFilePath(null);
    setProbeData(null);
    setTranscodeStats({});
    probedFilePathRef.current = null;
    lutLoadedRef.current = false;
  };

  // Change quality
  const changeQuality = async (newQuality: string) => {
    if (newQuality === quality) return;

    const video = videoRef.current;
    if (!video) return;

    const seekTime = video.currentTime;

    // Cancel RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Stop current playback
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (transcodeStatsIntervalRef.current) {
      clearInterval(transcodeStatsIntervalRef.current);
      transcodeStatsIntervalRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.pause();
    video.src = '';

    // Stop old session
    if (sessionIdRef.current) {
      try {
        await fetch(`/api/stop/${sessionIdRef.current}`, { method: 'POST' });
      } catch (e) {
        console.warn(e);
      }
    }

    qualityRef.current = newQuality;
    setQuality(newQuality);
    if (filePath) {
      await startPlayback(filePath, seekTime);
    }
  };

  // Change LUT
  const changeLut = async (newLutId: string | null) => {
    const video = videoRef.current;
    if (!video || !filePath) return;

    const seekTime = video.currentTime;

    if (lutMode === 'client') {
      // Client-side LUT: no HLS restart, just swap texture
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (newLutId) {
        initWebGL();
        await loadLutTexture(newLutId);
        rafRef.current = requestAnimationFrame(renderFrame);
      } else {
        // No LUT - stop rendering
        lutLoadedRef.current = false;
      }
    } else {
      // Server-side LUT: full HLS restart
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (transcodeStatsIntervalRef.current) {
        clearInterval(transcodeStatsIntervalRef.current);
        transcodeStatsIntervalRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      video.pause();
      video.src = '';

      if (sessionIdRef.current) {
        try {
          await fetch(`/api/stop/${sessionIdRef.current}`, { method: 'POST' });
        } catch (e) {
          console.warn(e);
        }
      }

      lutIdRef.current = newLutId;
      await startPlayback(filePath, seekTime);
    }
  };

  // beforeunload handler
  useEffect(() => {
    const handler = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(`/api/stop/${sessionIdRef.current}`, '');
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, []);

  const value = useMemo(
    () => ({
      isVisible,
      filePath,
      quality,
      probeData,
      capabilities,
      transcodeStats,
      videoRef,
      canvasRef,
      startPlayback,
      stopPlayback,
      changeQuality,
      changeLut,
    }),
    [
      isVisible,
      filePath,
      quality,
      probeData,
      capabilities,
      transcodeStats,
      startPlayback,
      stopPlayback,
      changeQuality,
      changeLut,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayerContext() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayerContext must be used within PlayerContextProvider');
  }
  return context;
}
