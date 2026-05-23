import React, { useEffect, useMemo, useRef, useState } from 'react';

const SCENARIOS = {
  hawaii: {
    id: 'hawaii',
    title: 'Hawaiʻi M6.0 Flexural Rupture',
    location: '13 km S of Hōnaunau–Nāpōʻopoʻo',
    magnitude: 5.96,
    displayMagnitude: 'M6.0',
    depthKm: 22.64,
    mechanism: 'Flexural plate-bending beneath the Hawaiian volcanic load',
    color: '#06b6d4',
    pVelocity: 6.2,
    sVelocity: 3.55,
    surfVelocity: 2.9,
    tsunami: 'No tsunami threat detected',
    maxMMI: 7.24,
    feltReports: 5896,
  },
  cascadia: {
    id: 'cascadia',
    title: 'Cascadia M9.0 Megathrust Event',
    location: 'Pacific Northwest Subduction Zone',
    magnitude: 9.0,
    displayMagnitude: 'M9.0',
    depthKm: 35.0,
    mechanism: 'Subduction plate-boundary thrust-fault dislocation',
    color: '#ef4444',
    pVelocity: 7.8,
    sVelocity: 4.45,
    surfVelocity: 3.6,
    tsunami: 'Tsunami advisory issued for Coastal Cascadia',
    maxMMI: 9.15,
    feltReports: 142050,
  },
  sanandreas: {
    id: 'sanandreas',
    title: 'San Andreas M7.2 Strike-Slip',
    location: 'Carrizo Plain segment, California',
    magnitude: 7.2,
    displayMagnitude: 'M7.2',
    depthKm: 8.5,
    mechanism: 'Shallow strike-slip horizontal shear fracture',
    color: '#f59e0b',
    pVelocity: 5.8,
    sVelocity: 3.3,
    surfVelocity: 2.7,
    tsunami: 'No tsunami threat — inland fault',
    maxMMI: 8.42,
    feltReports: 89430,
  },
  mantleplume: {
    id: 'mantleplume',
    title: 'Mantle Hotspot Plume M5.5',
    location: 'Conduit boundary beneath Mauna Loa',
    magnitude: 5.5,
    displayMagnitude: 'M5.5',
    depthKm: 72.0,
    mechanism: 'Deep thermal-magmatic conduit tensile fracturing',
    color: '#a855f7',
    pVelocity: 8.4,
    sVelocity: 4.8,
    surfVelocity: 3.9,
    tsunami: 'No tsunami threat',
    maxMMI: 4.1,
    feltReports: 1105,
  },
};

const STAGES = [
  { name: 'Stress Accumulation', from: 0, to: 2 },
  { name: 'Nucleation / Slip Initiation', from: 2, to: 3.2 },
  { name: 'Violent Motion Cascade', from: 3.2, to: 8.5 },
  { name: 'Aftershock Decoupling', from: 8.5, to: 15 },
];

const SIM_DURATION = 15;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const stageFor = (time) => STAGES.find((s) => time >= s.from && time < s.to) || STAGES[STAGES.length - 1];
const energyFromMagnitude = (m) => Math.pow(10, 1.5 * m + 4.8);
const formatEnergy = (j) => {
  if (!Number.isFinite(j) || j <= 0) return 'unknown';
  const exp = Math.floor(Math.log10(j));
  const mantissa = j / Math.pow(10, exp);
  return `${mantissa.toFixed(2)} × 10^${exp} J`;
};

function drawText(ctx, text, x, y, opts = {}) {
  const { size = 13, color = '#dfeafe', weight = 600, align = 'left', alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function glowDot(ctx, x, y, r, color, alpha = 1, blur = 12) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function glowLine(ctx, x1, y1, x2, y2, color, width = 1, alpha = 1, blur = 8) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

class SeismicAudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.rumbleOsc = null;
    this.rumbleGain = null;
  }
  init() {
    if (this.ctx) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
    this.rumbleOsc = this.ctx.createOscillator();
    this.rumbleOsc.type = 'sawtooth';
    this.rumbleOsc.frequency.value = 32;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 75;
    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumbleOsc.connect(lp);
    lp.connect(this.rumbleGain);
    this.rumbleGain.connect(this.master);
    this.rumbleOsc.start();
    return true;
  }
  setRumble(volume, freq = 32) {
    if (!this.ctx || !this.rumbleGain || !this.rumbleOsc) return;
    const now = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(clamp(volume, 0, 0.7), now, 0.08);
    this.rumbleOsc.frequency.setTargetAtTime(freq, now, 0.2);
  }
  crack() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 230;
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }
  impact(kind, mag) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const scale = clamp(mag / 9, 0.2, 1.1);
    if (kind === 'p') {
      osc.type = 'sine';
      osc.frequency.value = 140;
      filter.type = 'bandpass';
      filter.frequency.value = 120;
      gain.gain.setValueAtTime(0.18 * scale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    } else if (kind === 's') {
      osc.type = 'triangle';
      osc.frequency.value = 52;
      filter.type = 'lowpass';
      filter.frequency.value = 90;
      gain.gain.setValueAtTime(0.32 * scale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
    } else {
      osc.type = 'sine';
      osc.frequency.value = 24;
      filter.type = 'lowpass';
      filter.frequency.value = 45;
      gain.gain.setValueAtTime(0.42 * scale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.1);
    }
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(now + 3.5);
  }
  stop() {
    if (this.rumbleGain && this.ctx) this.rumbleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }
}

const audio = new SeismicAudioEngine();

export default function App() {
  const [scenarioKey, setScenarioKey] = useState('hawaii');
  const [playing, setPlaying] = useState(true);
  const [timeScale, setTimeScale] = useState(1.2);
  const [particleDensity, setParticleDensity] = useState(1);
  const [bloom, setBloom] = useState(1.1);
  const [layerOpacity, setLayerOpacity] = useState(0.9);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showAftershocks, setShowAftershocks] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [customMagnitude, setCustomMagnitude] = useState(6);
  const [customEpicenter, setCustomEpicenter] = useState(null);
  const [probe, setProbe] = useState(null);
  const [simTime, setSimTime] = useState(0);

  const canvasRef = useRef(null);
  const seismoRef = useRef(null);
  const particles = useRef([]);
  const timeRef = useRef(0);
  const lastRef = useRef(0);
  const flagsRef = useRef({ p: false, s: false, surf: false, after: [] });

  const scenario = SCENARIOS[scenarioKey];
  const params = useMemo(() => {
    if (!customEpicenter) return scenario;
    return {
      ...scenario,
      title: 'User-Triggered Custom Fault Rupture',
      displayMagnitude: `M${customMagnitude.toFixed(1)}`,
      magnitude: customMagnitude,
      depthKm: customEpicenter.depthKm,
      location: 'Manually Selected Focus',
      mechanism: 'User-stimulated regional stress rupture',
      tsunami: customMagnitude >= 7.8 && customEpicenter.depthKm < 30 ? 'Local tsunami generation potential' : 'No tsunami threat anticipated',
      maxMMI: Math.min(10, 1.2 * customMagnitude + 1.5 - Math.log10(customEpicenter.depthKm)),
      feltReports: Math.round(Math.pow(10, customMagnitude * 0.6) * 10),
    };
  }, [scenario, customEpicenter, customMagnitude]);

  const reset = () => {
    timeRef.current = 0;
    setSimTime(0);
    particles.current = [];
    flagsRef.current = { p: false, s: false, surf: false, after: [] };
    if (audioEnabled) audio.crack();
  };

  useEffect(() => {
    setCustomEpicenter(null);
    reset();
  }, [scenarioKey]);

  const toggleAudio = () => {
    if (!audioEnabled) {
      const ok = audio.init();
      if (ok) {
        audio.crack();
        setAudioEnabled(true);
      }
    } else {
      audio.stop();
      setAudioEnabled(false);
    }
  };

  const emitRing = (count, color, speed, size, life, type, origin) => {
    const n = Math.round(count * clamp(particleDensity, 0.4, 2.5));
    for (let i = 0; i < n; i += 1) {
      const theta = (i / n) * Math.PI * 2;
      const jitter = 0.75 + Math.random() * 0.5;
      particles.current.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(theta) * speed * jitter,
        vy: Math.sin(theta) * speed * jitter,
        color,
        size: size + Math.random() * size * 0.7,
        life: life + Math.random() * 0.45,
        maxLife: life + 0.45,
        type,
        phase: Math.random() * Math.PI * 2,
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;

    const drawBoundary = (ctx2, w, h, baseY, epicenter, fill, stroke, t, opacity) => {
      ctx2.save();
      ctx2.globalAlpha = opacity;
      ctx2.beginPath();
      ctx2.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 8) {
        const dist = Math.abs(x - epicenter.x);
        const loadDip = 40 * Math.exp(-Math.pow((x - w * 0.48) / (w * 0.22), 2));
        const dynamic = t > 2 && t < 7 ? Math.sin(t * 15 - dist * 0.045) * 3.5 * Math.exp(-dist * 0.006) : 0;
        ctx2.lineTo(x, baseY + loadDip + dynamic);
      }
      ctx2.lineTo(w, h);
      ctx2.lineTo(0, h);
      ctx2.closePath();
      ctx2.fillStyle = fill;
      ctx2.fill();
      ctx2.strokeStyle = stroke;
      ctx2.lineWidth = 1.2;
      ctx2.stroke();
      ctx2.restore();
    };

    const draw = (timestamp) => {
      if (!lastRef.current) lastRef.current = timestamp;
      const dt = clamp((timestamp - lastRef.current) / 1000, 0, 0.1);
      lastRef.current = timestamp;
      if (playing) {
        timeRef.current += dt * timeScale;
        if (timeRef.current > SIM_DURATION) reset();
        setSimTime(timeRef.current);
      }
      const t = timeRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const seaY = h * 0.27;
      const crustY = h * 0.47;
      const lithY = h * 0.58;
      const asthY = h * 0.78;
      const epicenter = customEpicenter ? { x: customEpicenter.x, y: customEpicenter.y } : { x: w * 0.43, y: h * 0.65 };
      const mag = params.magnitude;

      ctx.clearRect(0, 0, w, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.55, '#08111f');
      sky.addColorStop(1, '#120911');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      if (showGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56,189,248,0.075)';
        for (let x = 0; x < w; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = layerOpacity;
      const ocean = ctx.createLinearGradient(0, seaY, 0, crustY + 25);
      ocean.addColorStop(0, 'rgba(8,47,73,0.86)');
      ocean.addColorStop(1, 'rgba(3,105,161,0.94)');
      ctx.fillStyle = ocean;
      ctx.fillRect(0, seaY, w, crustY - seaY + 16);
      for (let i = 0; i < 6; i += 1) {
        ctx.strokeStyle = `rgba(186,230,253,${0.05 + i * 0.012})`;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 18) {
          const y = seaY + 18 + i * 8 + Math.sin(x * 0.03 + t * 1.4 + i) * 2.5;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(w * 0.05, crustY + 2);
      ctx.bezierCurveTo(w * 0.22, crustY - 40, w * 0.34, crustY - 118, w * 0.46, crustY - 142);
      ctx.bezierCurveTo(w * 0.54, crustY - 158, w * 0.61, crustY - 92, w * 0.68, crustY - 76);
      ctx.bezierCurveTo(w * 0.77, crustY - 58, w * 0.9, crustY - 43, w, crustY);
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      ctx.restore();

      if (t > 1 && t < 9) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const conduit = ctx.createLinearGradient(w * 0.45, crustY - 140, w * 0.45, h);
        conduit.addColorStop(0, 'rgba(239,68,68,0.28)');
        conduit.addColorStop(0.55, 'rgba(249,115,22,0.14)');
        conduit.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = conduit;
        ctx.fillRect(w * 0.43, crustY - 140, w * 0.045, h);
        ctx.restore();
      }

      drawBoundary(ctx, w, h, crustY, epicenter, 'rgba(15,23,42,0.66)', 'rgba(148,163,184,0.36)', t, layerOpacity);
      drawBoundary(ctx, w, h, lithY, epicenter, 'rgba(8,47,73,0.47)', 'rgba(14,116,144,0.28)', t, layerOpacity);
      drawBoundary(ctx, w, h, asthY, epicenter, 'rgba(69,10,10,0.43)', 'rgba(220,38,38,0.18)', t, layerOpacity);

      const flags = flagsRef.current;
      if (t >= 2 && !flags.p) {
        flags.p = true;
        if (audioEnabled) { audio.crack(); audio.impact('p', mag); }
        emitRing(165, '#f97316', scenario.pVelocity * 12, 2.1, 1, 'p', epicenter);
      }
      if (t >= 2.4 && !flags.s) {
        flags.s = true;
        if (audioEnabled) audio.impact('s', mag);
        emitRing(130, '#06b6d4', scenario.sVelocity * 12, 2.8, 1.45, 's', epicenter);
      }
      if (t >= 3.3 && !flags.surf) {
        flags.surf = true;
        if (audioEnabled) audio.impact('surf', mag);
        const n = Math.round(100 * particleDensity);
        for (let i = 0; i < n; i += 1) {
          const dir = i % 2 === 0 ? 1 : -1;
          particles.current.push({ x: epicenter.x, y: crustY + 12, vx: dir * scenario.surfVelocity * 11 * (0.7 + Math.random() * 0.5), vy: (Math.random() - 0.5) * 2.5, color: '#fbbf24', size: 3.4 + Math.random() * 2.4, life: 2.4, maxLife: 2.8, type: 'surf', phase: Math.random() * 6 });
        }
      }
      if (showAftershocks && t >= 8.5) {
        [8.8, 10.2, 11.5, 13].forEach((mark, idx) => {
          if (t >= mark && !flags.after.includes(idx)) {
            flags.after.push(idx);
            const ax = epicenter.x + (Math.random() - 0.5) * 160;
            const ay = epicenter.y + (Math.random() - 0.5) * 80;
            emitRing(32, '#34d399', 8, 1.4, 0.8, 'after', { x: ax, y: ay });
            if (audioEnabled) audio.crack();
          }
        });
      }
      if (audioEnabled) {
        const envelope = t > 2 && t < 8.5 ? smoothstep(2, 4.5, t) * (1 - smoothstep(4.5, 8.5, t)) : 0;
        audio.setRumble(envelope * mag / 9, 30 + envelope * 22);
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.current.length - 1; i >= 0; i -= 1) {
        const p = particles.current[i];
        p.life -= dt;
        if (p.life <= 0) { particles.current.splice(i, 1); continue; }
        p.vx *= 0.985;
        p.vy *= 0.985;
        if (p.type === 's') {
          const angle = Math.atan2(p.vy, p.vx);
          p.x += p.vx * dt * 4 + -Math.sin(angle) * Math.sin(p.life * 15 + p.phase) * 1.8;
          p.y += p.vy * dt * 4 + Math.cos(angle) * Math.sin(p.life * 15 + p.phase) * 1.8;
        } else if (p.type === 'surf') {
          p.x += p.vx * dt * 4;
          p.y += p.vy * dt * 4 + Math.cos(p.x * 0.08 + p.life * 12) * 1.2;
        } else {
          p.x += p.vx * dt * 4;
          p.y += p.vy * dt * 4;
        }
        const alpha = p.life / p.maxLife;
        glowLine(ctx, p.x - p.vx * 0.1, p.y - p.vy * 0.1, p.x, p.y, p.color, p.size * 0.72, alpha * 0.5, 6 * bloom);
        glowDot(ctx, p.x, p.y, p.size, p.color, alpha, 12 * bloom);
      }
      ctx.restore();

      glowDot(ctx, epicenter.x, epicenter.y, 10, params.color, 0.75 + Math.sin(timestamp * 0.005) * 0.22, 22 * bloom);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(epicenter.x, epicenter.y, 3, 0, Math.PI * 2); ctx.fill();

      if (showLabels) {
        const stationX = w * 0.5;
        const stationY = crustY - 145;
        glowDot(ctx, stationX, stationY, 5, '#34d399', 0.95, 10);
        drawText(ctx, '▲ Virtual Geophone ML-01', stationX + 8, stationY - 2, { size: 11, color: '#34d399', weight: 800 });
        drawText(ctx, 'PACIFIC DEEP BASIN', w * 0.08, seaY + 110, { size: 12, color: '#38bdf8', weight: 700, alpha: 0.85 });
        drawText(ctx, 'Mauna Loa Summit Volcanic Complex', w * 0.45, crustY - 170, { size: 11, color: '#f8fafc', weight: 800, align: 'center' });
        drawText(ctx, 'Oceanic Crustal Layer', 25, crustY + 45, { size: 12, color: '#94a3b8', weight: 700 });
        drawText(ctx, 'Elastic Oceanic Lithosphere', 25, lithY + 50, { size: 12, color: '#06b6d4', weight: 700 });
        drawText(ctx, 'Viscous Asthenosphere', 25, asthY + 60, { size: 12, color: '#ef4444', weight: 700 });
        drawText(ctx, `Focus: ${params.location}`, epicenter.x, epicenter.y - 18, { size: 13, color: '#fff', weight: 900, align: 'center' });
        drawText(ctx, `${params.depthKm.toFixed(1)} km depth`, epicenter.x, epicenter.y + 24, { size: 12, color: params.color, weight: 900, align: 'center' });
      }

      const boxX = w - 176;
      ctx.fillStyle = 'rgba(15,23,42,0.76)';
      ctx.strokeStyle = 'rgba(56,189,248,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(boxX, 84, 154, 70, 10); ctx.fill(); ctx.stroke();
      drawText(ctx, 'Wavefront radii', boxX + 11, 103, { size: 11, color: '#38bdf8', weight: 900 });
      drawText(ctx, `P-wave: ${(scenario.pVelocity * Math.max(0, t - 2)).toFixed(1)} km`, boxX + 11, 123, { size: 10, color: '#f97316' });
      drawText(ctx, `S-wave: ${(scenario.sVelocity * Math.max(0, t - 2.4)).toFixed(1)} km`, boxX + 11, 140, { size: 10, color: '#06b6d4' });

      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath(); ctx.moveTo(w * 0.65, h - 25); ctx.lineTo(w * 0.65 + 100, h - 25); ctx.stroke();
      drawText(ctx, '12.0 km', w * 0.65 + 50, h - 34, { size: 10, color: '#94a3b8', align: 'center' });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeScale, particleDensity, bloom, layerOpacity, showGrid, showLabels, showAftershocks, scenarioKey, customEpicenter, params, audioEnabled]);

  useEffect(() => {
    const canvas = seismoRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let buffer = Array(canvas.width).fill(0);
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#090d16'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(14,116,144,0.16)';
      for (let x = 0; x < w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      const t = timeRef.current;
      const magFactor = Math.pow(2.2, params.magnitude - 4);
      let y = (Math.random() - 0.5) * 1.6;
      if (t > 2.1) y += Math.sin((t - 2.1) * 45) * 4.5 * Math.exp(-(t - 2.1) * 1.45) * magFactor;
      if (t > 2.7) y += Math.sin((t - 2.7) * 24) * 12 * Math.exp(-(t - 2.7) * 0.78) * magFactor;
      if (t > 3.5) y += Math.sin((t - 3.5) * 9) * 22 * Math.exp(-(t - 3.5) * 0.38) * magFactor;
      buffer.push(clamp(y, -55, 55));
      if (buffer.length > w) buffer.shift();
      ctx.strokeStyle = params.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      buffer.forEach((v, i) => { const py = h / 2 + v; if (i === 0) ctx.moveTo(i, py); else ctx.lineTo(i, py); });
      ctx.stroke();
      drawText(ctx, 'LIVE SEISMOGRAPH FEED', 15, 20, { size: 11, color: '#34d399', weight: 900 });
      drawText(ctx, stageFor(t).name, w - 190, 20, { size: 10, color: '#94a3b8', weight: 700 });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [params, scenarioKey]);

  const canvasPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0];
    const clientX = touch ? touch.clientX : event.clientX;
    const clientY = touch ? touch.clientY : event.clientY;
    return { canvas, x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  };

  const handleMove = (event) => {
    const { canvas, x, y } = canvasPoint(event);
    const crustTop = canvas.height * 0.47;
    if (y < crustTop) { setProbe(null); return; }
    const rel = clamp((y - crustTop) / (canvas.height - crustTop), 0, 1);
    const depth = lerp(5, 95, rel);
    let layer = 'Oceanic Basement Crust';
    if (y > canvas.height * 0.78) layer = 'Upper Viscous Asthenosphere';
    else if (y > canvas.height * 0.58) layer = 'Elastic Upper Lithosphere';
    setProbe({ x: x / canvas.width, y: y / canvas.height, depth: depth.toFixed(1), pressure: (depth * 0.032).toFixed(2), temp: Math.round(depth * 14.5 + 20), layer });
  };

  const trigger = (event) => {
    const { canvas, x, y } = canvasPoint(event);
    const crustTop = canvas.height * 0.47;
    const safeY = Math.max(crustTop, y);
    const rel = clamp((safeY - crustTop) / (canvas.height - crustTop), 0, 1);
    setCustomEpicenter({ x, y: safeY, depthKm: lerp(5, 95, rel) });
    reset();
  };

  const metricCards = [
    ['Active Magnitude', params.displayMagnitude, 'rose'],
    ['Hypocentral Depth', `${params.depthKm.toFixed(1)} km`, 'amber'],
    ['Primary Wave Speed', `${scenario.pVelocity} km/s`, 'cyan'],
    ['Calculated Energy', formatEnergy(energyFromMagnitude(params.magnitude)), 'emerald'],
  ];

  return (
    <div className="app-shell">
      <header className="topbar glass">
        <div>
          <div className="eyebrow"><span className="pulse" /> Seismic Wave Mechanics Lab</div>
          <h1>Multiphase Seismic Wavefield Simulator</h1>
          <p>{params.title}</p>
        </div>
        <div className="top-actions">
          <button className={audioEnabled ? 'button active' : 'button'} onClick={toggleAudio}>{audioEnabled ? 'Seismic Synth Active' : 'Enable Sonification'}</button>
          <select value={scenarioKey} onChange={(e) => setScenarioKey(e.target.value)}>
            <option value="hawaii">Hawaii M6.0</option>
            <option value="cascadia">Cascadia M9.0</option>
            <option value="sanandreas">San Andreas M7.2</option>
            <option value="mantleplume">Mantle Plume M5.5</option>
          </select>
        </div>
      </header>

      <section className="metrics">
        {metricCards.map(([label, value, tone]) => <article className="metric glass" key={label}><span>{label}</span><strong className={tone}>{value}</strong></article>)}
      </section>

      <main className="workbench">
        <section className="sim-column">
          <div className="canvas-card">
            <div className="hint"><b>Interactive geological cross-section</b><br />Tap inside the rock strata to trigger a rupture at that depth.</div>
            <div className="phase"><i /> <span>Phase:</span> {stageFor(simTime).name}</div>
            {probe && <div className="probe" style={{ left: `${Math.min(probe.x * 100 + 2, 66)}%`, top: `${Math.max(probe.y * 100 - 8, 8)}%` }}><b>Structural Probe</b><br />{probe.layer}<br />Depth {probe.depth} km · {probe.pressure} GPa · {probe.temp} °C</div>}
            <canvas ref={canvasRef} width="800" height="480" onMouseMove={handleMove} onMouseLeave={() => setProbe(null)} onTouchMove={handleMove} onClick={trigger} onTouchStart={trigger} />
            <div className="sim-controls"><button onClick={() => setPlaying((v) => !v)}>{playing ? 'Pause Sim' : 'Resume'}</button><button onClick={reset}>Reset Phase</button><code>t = {simTime.toFixed(2)}s</code></div>
            <div className="legend"><span className="pwave" />P <span className="swave" />S <span className="surface" />Surface <span className="after" />Aftershocks</div>
          </div>
          <canvas className="seismo" ref={seismoRef} width="800" height="130" />
        </section>

        <aside className="side-panel">
          <section className="glass panel">
            <h2>Custom Fracture Stimulator</h2>
            <label>Target Magnitude <b>M{customMagnitude.toFixed(1)}</b></label>
            <input type="range" min="4" max="9.5" step="0.1" value={customMagnitude} onChange={(e) => setCustomMagnitude(Number(e.target.value))} />
            <div className="info"><b>Fault Model Parameters</b><br />Mechanism: {params.mechanism}<br />Tsunami risk: {params.tsunami}<br />Max intensity: MMI {params.maxMMI.toFixed(1)}<br />Est. felt reports: {params.feltReports.toLocaleString()}</div>
          </section>
          <section className="glass panel">
            <h2>Wavefield Visual Settings</h2>
            <Control label="Wave Dilation Speed" value={`${timeScale.toFixed(1)}x`} min="0.3" max="3" step="0.1" state={timeScale} setState={setTimeScale} />
            <Control label="Ray / Particle Density" value={`${particleDensity.toFixed(1)}x`} min="0.4" max="2.5" step="0.1" state={particleDensity} setState={setParticleDensity} />
            <Control label="Wavefront Luminescence" value={`${bloom.toFixed(1)}x`} min="0.2" max="2.5" step="0.1" state={bloom} setState={setBloom} />
            <Control label="Subsurface Strata Opacity" value={`${Math.round(layerOpacity * 100)}%`} min="0.1" max="1" step="0.05" state={layerOpacity} setState={setLayerOpacity} />
            <Toggle label="Geodetic Grid Overlay" value={showGrid} setValue={setShowGrid} />
            <Toggle label="Geological Annotations" value={showLabels} setValue={setShowLabels} />
            <Toggle label="Aftershock Sequence" value={showAftershocks} setValue={setShowAftershocks} />
          </section>
          <section className="glass panel reference"><h2>Reference</h2><p><b>P-waves</b> arrive first as compressional motion. <b>S-waves</b> carry slower shear motion. <b>Surface waves</b> roll along interfaces and often dominate damaging shaking.</p></section>
        </aside>
      </main>
    </div>
  );
}

function Control({ label, value, state, setState, min, max, step }) {
  return <div className="control"><label>{label}<b>{value}</b></label><input type="range" min={min} max={max} step={step} value={state} onChange={(e) => setState(Number(e.target.value))} /></div>;
}

function Toggle({ label, value, setValue }) {
  return <button className={value ? 'toggle on' : 'toggle'} onClick={() => setValue((v) => !v)}><span>{label}</span><i /></button>;
}
