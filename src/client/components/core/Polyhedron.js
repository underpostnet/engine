// https://underpost.net/cube.php

import { BtnIcon } from './BtnIcon.js';
import { getId, random } from './CommonJs.js';
import { dynamicCol } from './Css.js';
import { fullScreenIn, htmls, s } from './VanillaJs.js';
import { Translate } from './Translate.js';
// https://css-loaders.com/3d/

const Polyhedron = {
  Tokens: {},
  Render: async function (options) {
    const id = options?.id ? options.id : getId(this.Tokens, 'polyhedron-');
    if (!this.Tokens[id])
      this.Tokens[id] = {
        cr: [-25, -57, 90],
        ct: [0, 0, 0],
        dim: 150,
        interval: null,
        immersive: false,
        immersiveParticles: null,
        immersiveRAF: null,
        immersiveStart: 0,
        immersiveSeed: random(0, 1000000000),
        immersiveEffect: 'waveLight', // 'waveLight' | 'darkElectronic'
        faceOpacity: 1,
        chosenFace: 'front',
        faces: {
          front: null,
          back: null,
          left: null,
          right: null,
          top: null,
          bottom: null,
        },
      };

    const getFaceSelector = (faceName) => `.face_${faceName}-${id}`;
    const applyFaceBackground = (faceName) => {
      const el = s(getFaceSelector(faceName));
      if (!el) return;
      const url = this.Tokens[id].faces?.[faceName];

      if (url) {
        el.style.backgroundImage = `url("${url}")`;

        // Always cover the full face area.
        // Using `cover` ensures full coverage even during 3D transforms / resizes.
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center center';
        el.style.backgroundRepeat = 'no-repeat';
      } else {
        el.style.backgroundImage = '';
        el.style.backgroundSize = '';
        el.style.backgroundPosition = '';
        el.style.backgroundRepeat = '';
      }
    };
    const applyAllFaceBackgrounds = () => {
      ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach(applyFaceBackground);
    };

    const applyFaceOpacity = () => {
      const opacity = typeof this.Tokens[id].faceOpacity === 'number' ? this.Tokens[id].faceOpacity : 1;
      const faces = document.querySelectorAll(`.face-${id}`);
      faces.forEach((el) => {
        el.style.opacity = `${opacity}`;
      });
    };

    const startImmersiveEffects = () => {
      const scene = s(`.scene-${id}`);
      if (!scene) return;

      const canvas = s(`.polyhedron-immersive-canvas-${id}`);
      if (!canvas) return;

      if (!s(`.main-body-btn-ui-close`).classList.contains('hide')) s(`.main-body-btn-ui`).click();
      if (!s(`.main-body-btn-ui-menu-close`).classList.contains('hide')) s(`.main-body-btn-menu`).click();
      fullScreenIn();
      // Ensure canvas is visible during immersive mode.
      canvas.style.display = 'block';

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const resize = () => {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const w = scene.clientWidth || window.innerWidth;
        const h = scene.clientHeight || window.innerHeight;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      resize();

      const mkParticlesWaveLight = () => {
        const count = 90;
        const w = scene.clientWidth || window.innerWidth;
        const h = scene.clientHeight || window.innerHeight;
        return Array.from({ length: count }).map((_, i) => {
          const r = random(1, 4);
          return {
            x: random(0, w),
            y: random(0, h),
            vx: (random(-100, 100) / 100) * 0.25,
            vy: (random(-100, 100) / 100) * 0.25,
            r,
            phase: random(0, 628) / 100,
            i,
          };
        });
      };

      const mkParticlesDarkElectronic = () => {
        const count = 140;
        const w = scene.clientWidth || window.innerWidth;
        const h = scene.clientHeight || window.innerHeight;
        return Array.from({ length: count }).map((_, i) => {
          const r = random(1, 3);
          return {
            x: random(0, w),
            y: random(0, h),
            vx: (random(-100, 100) / 100) * 0.42,
            vy: (random(-100, 100) / 100) * 0.42,
            r,
            phase: random(0, 628) / 100,
            i,
            // "spark" bias gives an electronic feel
            spark: random(0, 1000) / 1000,
          };
        });
      };

      const resetParticlesForEffect = () => {
        const eff = this.Tokens[id].immersiveEffect || 'waveLight';
        if (eff === 'darkElectronic') this.Tokens[id].immersiveParticles = mkParticlesDarkElectronic();
        else this.Tokens[id].immersiveParticles = mkParticlesWaveLight();
      };

      resetParticlesForEffect();
      this.Tokens[id].immersiveStart = performance.now();

      const tick = (t) => {
        if (!this.Tokens[id].immersive) return;

        // Keep canvas sized to the scene.
        if (canvas.clientWidth !== scene.clientWidth || canvas.clientHeight !== scene.clientHeight) resize();

        const w2 = canvas.clientWidth || window.innerWidth;
        const h2 = canvas.clientHeight || window.innerHeight;

        const tt = (t - this.Tokens[id].immersiveStart) / 1000;
        const eff = this.Tokens[id].immersiveEffect || 'waveLight';

        if (eff === 'darkElectronic') {
          // Dark electronic: deep background + scanlines + neon sparks
          ctx.fillStyle = 'rgba(0,0,0,1)';
          ctx.fillRect(0, 0, w2, h2);

          const hue = (tt * 30 + this.Tokens[id].immersiveSeed) % 360;

          // Subtle scanlines
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = 'rgba(255,255,255,1)';
          for (let y = 0; y < h2; y += 3) ctx.fillRect(0, y, w2, 1);
          ctx.globalAlpha = 1;

          // Neon grid-ish diagonals
          ctx.globalAlpha = 0.08;
          ctx.strokeStyle = `hsla(${hue}, 90%, 60%, 1)`;
          ctx.lineWidth = 1;
          const step = 46;
          for (let x = -h2; x < w2 + h2; x += step) {
            ctx.beginPath();
            ctx.moveTo(x + Math.sin(tt) * 12, 0);
            ctx.lineTo(x + h2 + Math.sin(tt) * 12, h2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // Particles as sparks
          const ps = this.Tokens[id].immersiveParticles || [];
          for (const p of ps) {
            p.x += p.vx * 60;
            p.y += p.vy * 60;

            if (p.x < -10) p.x = w2 + 10;
            if (p.x > w2 + 10) p.x = -10;
            if (p.y < -10) p.y = h2 + 10;
            if (p.y > h2 + 10) p.y = -10;

            const sparkle = (0.15 + 0.55 * Math.max(0, Math.sin(tt * 6 + p.phase))) * (0.35 + p.spark);
            const hueP = (hue + p.i * 1.2) % 360;

            // glow dot
            ctx.beginPath();
            ctx.fillStyle = `hsla(${hueP}, 95%, 60%, ${0.1 + sparkle * 0.25})`;
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();

            // tiny streak
            ctx.globalAlpha = 0.12 + sparkle * 0.28;
            ctx.strokeStyle = `hsla(${hueP}, 95%, 70%, 1)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 120, p.y - p.vy * 120);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          // Vignette
          const vg = ctx.createRadialGradient(
            w2 / 2,
            h2 / 2,
            Math.min(w2, h2) * 0.12,
            w2 / 2,
            h2 / 2,
            Math.min(w2, h2) * 0.78,
          );
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, 'rgba(0,0,0,0.65)');
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, w2, h2);

          // Polyhedron motion (slightly more "techno")
          const drift = 10;
          this.Tokens[id].cr[1] += 0.55;
          this.Tokens[id].cr[0] += 0.18;
          this.Tokens[id].cr[2] += 0.1;
          this.Tokens[id].ct[0] = Math.sin(tt * 0.85) * drift;
          this.Tokens[id].ct[1] = Math.cos(tt * 0.55) * drift;
          this.Tokens[id].ct[2] = Math.sin(tt * 0.45) * (drift * 0.7);
        } else {
          // Wave light: animated gradient + soft floaty particles
          const hueA = (tt * 18 + this.Tokens[id].immersiveSeed) % 360;
          const hueB = (hueA + 90) % 360;

          const g = ctx.createLinearGradient(0, 0, w2, h2);
          g.addColorStop(0, `hsla(${hueA}, 70%, 10%, 1)`);
          g.addColorStop(1, `hsla(${hueB}, 70%, 10%, 1)`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w2, h2);

          const ps = this.Tokens[id].immersiveParticles || [];
          for (const p of ps) {
            p.x += p.vx * 60;
            p.y += p.vy * 60;

            if (p.x < -10) p.x = w2 + 10;
            if (p.x > w2 + 10) p.x = -10;
            if (p.y < -10) p.y = h2 + 10;
            if (p.y > h2 + 10) p.y = -10;

            const alpha = 0.18 + 0.12 * Math.sin(tt * 1.7 + p.phase);
            const hue = (hueA + p.i * 2) % 360;

            ctx.beginPath();
            ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
          }

          const vg = ctx.createRadialGradient(
            w2 / 2,
            h2 / 2,
            Math.min(w2, h2) * 0.15,
            w2 / 2,
            h2 / 2,
            Math.min(w2, h2) * 0.75,
          );
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, 'rgba(0,0,0,0.55)');
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, w2, h2);

          const drift = 8;
          this.Tokens[id].cr[1] += 0.35;
          this.Tokens[id].cr[0] += 0.12;
          this.Tokens[id].ct[0] = Math.sin(tt * 0.6) * drift;
          this.Tokens[id].ct[1] = Math.cos(tt * 0.45) * drift;
          this.Tokens[id].ct[2] = Math.sin(tt * 0.35) * (drift * 0.6);
        }

        // Keep face backgrounds synced to current face pixel sizing
        // (important when immersive resize happens).
        applyAllFaceBackgrounds();

        // Apply transformation now (outside the 200ms interval) for smooth motion.
        if (s(`.polyhedron-${id}`)) renderTransform();

        this.Tokens[id].immersiveRAF = requestAnimationFrame(tick);
      };

      if (this.Tokens[id].immersiveRAF) cancelAnimationFrame(this.Tokens[id].immersiveRAF);
      this.Tokens[id].immersiveRAF = requestAnimationFrame(tick);

      // Resize handler while immersive
      const onResize = () => {
        if (!this.Tokens[id].immersive) return;
        resize();
      };
      window.removeEventListener('resize', onResize);
      window.addEventListener('resize', onResize);
      this.Tokens[id].immersiveOnResize = onResize;

      // Expose reset so the effect toggle can rebuild particles quickly.
      this.Tokens[id]._resetImmersiveParticles = resetParticlesForEffect;
    };

    const stopImmersiveEffects = () => {
      if (this.Tokens[id].immersiveRAF) cancelAnimationFrame(this.Tokens[id].immersiveRAF);
      this.Tokens[id].immersiveRAF = null;
      this.Tokens[id].immersiveParticles = null;

      if (this.Tokens[id].immersiveOnResize) {
        window.removeEventListener('resize', this.Tokens[id].immersiveOnResize);
        this.Tokens[id].immersiveOnResize = null;
      }

      // Clear + hide canvas so the last rendered frame is not left visible.
      const canvas = s(`.polyhedron-immersive-canvas-${id}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        canvas.style.display = 'none';
      }

      // Reset drift so manual controls feel normal again
      this.Tokens[id].ct = [0, 0, 0];
    };

    const setImmersive = (isImmersive) => {
      this.Tokens[id].immersive = !!isImmersive;
      const scene = s(`.scene-${id}`);
      if (!scene) return;

      if (this.Tokens[id].immersive) {
        scene.classList.add(`scene-immersive-${id}`);
        startImmersiveEffects();
      } else {
        scene.classList.remove(`scene-immersive-${id}`);
        stopImmersiveEffects();
      }
    };

    const renderTransform = () => {
      s(`.polyhedron-${id}`).style.transform =
        `rotateX(${this.Tokens[id].cr[0]}deg) rotateY(${this.Tokens[id].cr[1]}deg) rotateZ(${this.Tokens[id].cr[2]}deg)
      translateX(${this.Tokens[id].ct[0]}px) translateY(${this.Tokens[id].ct[1]}px) translateZ(${this.Tokens[id].ct[2]}px)`;
      s(`.polyhedron-${id}`).style.left = `${s(`.scene-${id}`).offsetWidth / 2 - this.Tokens[id].dim / 2}px`;
      s(`.polyhedron-${id}`).style.top = `${s(`.scene-${id}`).offsetHeight / 2 - this.Tokens[id].dim / 2}px`;
      s(`.polyhedron-${id}`).style.width = `${this.Tokens[id].dim}px`;
      s(`.polyhedron-${id}`).style.height = `${this.Tokens[id].dim}px`;
      /* rotate Y */
      s(`.face_front-${id}`).style.transform = `rotateY(0deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_back-${id}`).style.transform = `rotateY(-180deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_left-${id}`).style.transform = `rotateY(90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_right-${id}`).style.transform = `rotateY(-90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      /* rotate X */
      s(`.face_top-${id}`).style.transform = `rotateX(-90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_bottom-${id}`).style.transform = `rotateX(90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
    };
    if (this.Tokens[id].interval) clearInterval(this.Tokens[id].interval);
    this.Tokens[id].interval = setInterval(() => {
      if (s(`.polyhedron-${id}`)) renderTransform();
      else return clearInterval(this.Tokens[id].interval);
    }, 200);

    setTimeout(() => {
      renderTransform();
      s(`.polyhedron-${id}`).style.transition = `.4s`;
      applyAllFaceBackgrounds();
      applyFaceOpacity();
      setImmersive(this.Tokens[id].immersive);

      s(`.btn-polyhedron-rotate-down-${id}`).onclick = () => {
        this.Tokens[id].cr[0] += 45;
      };
      s(`.btn-polyhedron-rotate-up-${id}`).onclick = () => {
        this.Tokens[id].cr[0] -= 45;
      };
      s(`.btn-polyhedron-rotate-left-${id}`).onclick = () => {
        this.Tokens[id].cr[1] += 45;
      };
      s(`.btn-polyhedron-rotate-right-${id}`).onclick = () => {
        this.Tokens[id].cr[1] -= 45;
      };

      s(`.btn-polyhedron-add-zoom-${id}`).onclick = () => {
        this.Tokens[id].dim += 25;
      };
      s(`.btn-polyhedron-remove-zoom-${id}`).onclick = () => {
        this.Tokens[id].dim -= 25;
      };

      const facePicker = s(`.polyhedron-face-picker-${id}`);
      if (facePicker) {
        // Keep UI and state in sync on re-render
        facePicker.value = this.Tokens[id].chosenFace || 'front';

        facePicker.onchange = (e) => {
          this.Tokens[id].chosenFace = e?.target?.value || 'front';
        };
      }

      const opacitySlider = s(`.polyhedron-face-opacity-${id}`);
      if (opacitySlider) {
        // Keep UI and state in sync on re-render
        opacitySlider.value = `${this.Tokens[id].faceOpacity}`;

        opacitySlider.oninput = (e) => {
          const v = parseFloat(e?.target?.value);
          this.Tokens[id].faceOpacity = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
          applyFaceOpacity();
        };
      }

      const fileInput = s(`.polyhedron-face-image-file-${id}`);
      if (fileInput) {
        fileInput.onchange = (e) => {
          const file = e?.target?.files?.[0];
          if (!file) return;

          const url = URL.createObjectURL(file);
          const face = this.Tokens[id].chosenFace || 'front';

          if (face === 'all') {
            ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach((f) => {
              this.Tokens[id].faces[f] = url;
            });
            applyAllFaceBackgrounds();
          } else {
            this.Tokens[id].faces[face] = url;
            applyFaceBackground(face);
          }

          fileInput.value = '';
        };
      }

      const clearFaceBtn = s(`.btn-polyhedron-clear-face-image-${id}`);
      if (clearFaceBtn) {
        clearFaceBtn.onclick = () => {
          const face = this.Tokens[id].chosenFace || 'front';

          if (face === 'all') {
            ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach((f) => {
              this.Tokens[id].faces[f] = null;
            });
            applyAllFaceBackgrounds();
          } else {
            this.Tokens[id].faces[face] = null;
            applyFaceBackground(face);
          }
        };
      }

      const immersiveBtn = s(`.btn-polyhedron-immersive-${id}`);
      if (immersiveBtn) {
        immersiveBtn.onclick = () => setImmersive(!this.Tokens[id].immersive);
      }

      const immersiveExitBtn = s(`.btn-polyhedron-immersive-exit-${id}`);
      if (immersiveExitBtn) {
        immersiveExitBtn.onclick = () => setImmersive(false);
      }

      const immersiveEffectBtn = s(`.btn-polyhedron-immersive-effect-${id}`);
      if (immersiveEffectBtn) {
        immersiveEffectBtn.onclick = () => {
          this.Tokens[id].immersiveEffect =
            (this.Tokens[id].immersiveEffect || 'waveLight') === 'waveLight' ? 'darkElectronic' : 'waveLight';
          if (this.Tokens[id].immersive && this.Tokens[id]._resetImmersiveParticles)
            this.Tokens[id]._resetImmersiveParticles();
        };
      }

      const escHandler = (ev) => {
        if (ev?.key === 'Escape' && this.Tokens[id].immersive) setImmersive(false);
      };
      document.removeEventListener('keydown', escHandler);
      document.addEventListener('keydown', escHandler);
    });

    return html`
      <style>
        .scene-${id} {
          background: #c7c7c7;
          overflow: hidden;
          padding-bottom: 400px;
          box-sizing: border-box;
          /* perspective: 10000px; */
          position: relative;
        }
        .polyhedron-${id} {
          transform-style: preserve-3d;
          cursor: pointer;
        }
        .face-${id} {
          width: 100%;
          height: 100%;
          background-position: center center;
          background-repeat: no-repeat;
          /* default; JS may override with exact px sizing to match face dimensions */
          background-size: cover;
          /* avoid “quarter visible” artifacts in some browsers when faces rotate in 3D */
          background-origin: border-box;
          background-clip: border-box;
        }

        @keyframes polyhedronImmersiveIn-${id} {
          0% {
            opacity: 0;
            transform: scale(0.98);
            filter: blur(6px) saturate(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0px) saturate(1);
          }
        }

        .scene-immersive-${id} {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 100 !important;
          background: #000 !important;
          animation: polyhedronImmersiveIn-${id} 500ms ease both;
        }

        /* Hide face labels while immersive */
        .scene-immersive-${id} .center {
          display: none !important;
        }

        .polyhedron-immersive-canvas-${id} {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
        }

        .polyhedron-${id} {
          position: relative;
          z-index: 2;
          will-change: transform;
        }

        /* Exit + effect buttons are only visible in immersive mode */
        .scene-immersive-exit-${id} {
          display: none;
          position: absolute;
          right: 12px;
          bottom: 12px;
          z-index: 5;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.35);
          color: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(6px);
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
          transition: 180ms ease;
          user-select: none;
        }
        .scene-immersive-${id} .scene-immersive-exit-${id} {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .scene-immersive-exit-${id}:hover {
          background: rgba(0, 0, 0, 0.55);
          border-color: rgba(255, 255, 255, 0.28);
          color: rgba(255, 255, 255, 0.95);
          transform: translateY(-1px);
        }

        .scene-immersive-effect-${id} {
          display: none;
          position: absolute;
          right: 74px;
          bottom: 12px;
          z-index: 5;
          width: 34px;
          height: 26px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.30);
          color: rgba(255, 255, 255, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(6px);
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
          transition: 180ms ease;
          user-select: none;
        }
        .scene-immersive-${id} .scene-immersive-effect-${id} {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .scene-immersive-effect-${id}:hover {
          background: rgba(0, 0, 0, 0.52);
          border-color: rgba(255, 255, 255, 0.26);
          color: rgba(255, 255, 255, 0.95);
          transform: translateY(-1px);
        }

        ${options?.style?.face
          ? css`
              .face-${id} {
                ${Object.keys(options.style.face)
                  .map((styleKey) => `${styleKey} : ${options.style.face[styleKey]};`)
                  .join('')}
              }
            `
          : css``}
        ${options?.style?.scene
          ? css`
              .scene-${id} {
                ${Object.keys(options.style.scene)
                  .map((styleKey) => `${styleKey} : ${options.style.scene[styleKey]};`)
                  .join('')}
              }
            `
          : css``}
      </style>
      <!--
      <style class="polyhedron-animation-${id}"></style>
      -->

      ${dynamicCol({ containerSelector: options.idModal, id: `polyhedron-${id}` })}
      <div class="fl">
        <div class="in fll polyhedron-${id}-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-arrows-spin"></i> Rotate</div>
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-rotate-up-${id}`,
              label: html`<i class="fa-solid fa-angle-up"></i>`,
            })}
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-rotate-down-${id}`,
              label: html`<i class="fa-solid fa-angle-down"></i>`,
            })}
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-rotate-left-${id}`,
              label: html`<i class="fa-solid fa-angle-left"></i>`,
            })}
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-rotate-right-${id}`,
              label: html`<i class="fa-solid fa-angle-right"></i>`,
            })}

            <div class="in sub-title-modal"><i class="fa-solid fa-magnifying-glass"></i> Zoom</div>
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-add-zoom-${id}`,
              label: html`<i class="fa-solid fa-plus"></i>`,
            })}
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-remove-zoom-${id}`,
              label: html`<i class="fa-solid fa-minus"></i>`,
            })}

            <div class="in sub-title-modal"><i class="fa-solid fa-droplet"></i> Face opacity</div>
            <input
              class="in polyhedron-face-opacity-${id}"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value="${this.Tokens[id].faceOpacity}"
              title="Face opacity"
            />

            <div class="in sub-title-modal"><i class="fa-solid fa-image"></i> Face image</div>

            <select class="in polyhedron-face-picker-${id}">
              <option value="all">all</option>
              <option value="front">front</option>
              <option value="back">back</option>
              <option value="left">left</option>
              <option value="right">right</option>
              <option value="top">top</option>
              <option value="bottom">bottom</option>
            </select>
            <input class="in polyhedron-face-image-file-${id}" type="file" accept="image/*" />
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-clear-face-image-${id}`,
              label: html`<i class="fa-solid fa-eraser"></i> ${Translate.Render('clear')}`,
            })}
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-immersive-${id}`,
              label: html`<i class="fa-solid fa-expand"></i> Immersive`,
            })}
          </div>
        </div>
        <div class="in fll polyhedron-${id}-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-vector-square"></i> Render</div>
            <div class="in scene-${id}">
              <canvas class="polyhedron-immersive-canvas-${id}"></canvas>

              <div
                class="scene-immersive-effect-${id} btn-polyhedron-immersive-effect-${id}"
                title="Change background effect"
              >
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div class="scene-immersive-exit-${id} btn-polyhedron-immersive-exit-${id}" title="Exit immersive (Esc)">
                Exit
              </div>

              <div class="abs polyhedron-${id}">
                <div class="abs face-${id} face_front-${id} ${id}-0"><div class="abs center">1</div></div>
                <div class="abs face-${id} face_bottom-${id} ${id}-1"><div class="abs center">2</div></div>
                <div class="abs face-${id} face_back-${id} ${id}-2"><div class="abs center">3</div></div>
                <div class="abs face-${id} face_top-${id} ${id}-3"><div class="abs center">4</div></div>
                <div class="abs face-${id} face_right-${id} ${id}-4"><div class="abs center">5</div></div>
                <div class="abs face-${id} face_left-${id} ${id}-5"><div class="abs center">6</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },
};

export { Polyhedron };
