// MainBodyCyberiaPortal.js — Cyberia portal landing.
//
// A "landing-style" world selector: the hero keeps the pixel-art particle
// field, grid, logo and title, and instead of a background video it surfaces
// the first three playable worlds from the same registry the full
// InstanceSelectionView consumes (`defaultInstanceProvider`, limited to 3).
//
// Each world is a space-framed thumbnail card (starfield frame + rotating
// beam) with a staggered pixel-step entrance and its own float loop. Clicking a
// card selects it: the selected world's thumbnail becomes the blurred hero
// backdrop and the single CTA enters that world directly. The full selector
// modal stays reachable through the secondary "browse all worlds" link.

import { range } from '../core/CommonJs.js';
import { ThemeEvents, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getProxyPath } from '../core/Router.js';
import { htmls, s } from '../core/VanillaJs.js';
import {
  defaultInstanceProvider,
  placeholderThumbnail,
  DEFAULT_CLIENT_BASE_URL,
  STATUS_META,
} from '../cyberia/InstanceSelectionView.js';

const LANDING_WORLD_LIMIT = 3;

const statusMeta = (status) => STATUS_META[status] || STATUS_META.offline;

const escapeHtml = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const worldCard = (instance, index, selected) => {
  const meta = statusMeta(instance.status);
  return html`
    <button
      class="hero-world hero-world-${index} ${selected ? 'hero-world-selected' : ''} ${
        instance.playable ? '' : 'hero-world-unavailable'
      }"
      data-instance-id="${escapeHtml(instance.id)}"
      type="button"
      title="${escapeHtml(instance.name)}"
      style="--world-index: ${index};"
    >
      <span class="hero-world-frame"></span>
      <span class="hero-world-inner">
        <img
          class="hero-world-img"
          src="${escapeHtml(instance.thumbnailUrl)}"
          alt="${escapeHtml(instance.name)}"
          loading="eager"
          onerror="this.onerror=null;this.src='${placeholderThumbnail()}';"
        />
        <span class="hero-world-status hero-tone-${meta.tone}">
          <span class="hero-world-dot"></span>${meta.label}
        </span>
        <span class="hero-world-check"><i class="fa-solid fa-check"></i></span>
        <span class="hero-world-caption">
          <span class="hero-world-name">${escapeHtml(instance.name)}</span>
          ${instance.code ? html`<span class="hero-world-code">${escapeHtml(instance.code)}</span>` : ''}
        </span>
      </span>
    </button>
  `;
};

const worldSkeleton = () =>
  range(0, LANDING_WORLD_LIMIT - 1)
    .map(
      (i) => html`
        <div class="hero-world hero-world-${i} hero-world-skeleton" style="--world-index: ${i};">
          <span class="hero-world-frame"></span>
          <span class="hero-world-inner"></span>
        </div>
      `,
    )
    .join('');

class MainBodyCyberiaPortal {
  static async instance() {
    const id = 'cyberia-portal-landing';

    // Per-render landing state: the 3 featured worlds and the one the CTA enters.
    const state = { worlds: [], selectedId: null };
    const selectedWorld = () => state.worlds.find((w) => w.id === state.selectedId) || null;

    const worldsSel = `.hero-worlds`;
    const ctaSel = `.cta-button`;
    const backdropSel = `.hero-backdrop-img`;

    const renderCta = () => {
      const cta = s(ctaSel);
      if (!cta) return;
      const world = selectedWorld();
      if (!world) {
        cta.disabled = false;
        cta.classList.remove('cta-button-disabled');
        htmls(ctaSel, html`<i class="fa-solid fa-play"></i> Enter The World`);
        return;
      }
      const meta = statusMeta(world.status);
      cta.disabled = !world.playable;
      cta.classList.toggle('cta-button-disabled', !world.playable);
      htmls(
        ctaSel,
        world.playable
          ? html`<i class="fa-solid fa-play"></i> Enter <span class="cta-world-name">${escapeHtml(world.name)}</span>`
          : html`<i class="fa-solid fa-lock"></i> ${escapeHtml(world.name)} is ${meta.cta || meta.label}`,
      );
    };

    const renderBackdrop = () => {
      const img = s(backdropSel);
      const world = selectedWorld();
      if (!img || !world) return;
      if (img.getAttribute('src') === world.thumbnailUrl) return;
      img.classList.remove('hero-backdrop-visible');
      img.onload = () => img.classList.add('hero-backdrop-visible');
      img.onerror = () => img.classList.remove('hero-backdrop-visible');
      img.src = world.thumbnailUrl;
    };

    const renderWorlds = () => {
      if (!s(worldsSel)) return;
      htmls(worldsSel, state.worlds.map((w, i) => worldCard(w, i, w.id === state.selectedId)).join(''));
    };

    const select = (instanceId) => {
      if (!state.worlds.some((w) => w.id === instanceId)) return;
      state.selectedId = instanceId;
      const cards = s(worldsSel)?.querySelectorAll('.hero-world') || [];
      cards.forEach((card) => card.classList.toggle('hero-world-selected', card.dataset.instanceId === instanceId));
      renderCta();
      renderBackdrop();
    };

    const launch = () => {
      const world = selectedWorld();
      if (!world) return (location.href = `${DEFAULT_CLIENT_BASE_URL}/`);
      if (!world.playable) {
        NotificationManager.Push({
          html: `${world.name} is ${statusMeta(world.status).label}.`,
          status: 'warning',
        });
        return;
      }
      location.href = world.playUrl || `${DEFAULT_CLIENT_BASE_URL}/`;
    };

    const load = async () => {
      if (s(worldsSel)) htmls(worldsSel, worldSkeleton());
      try {
        state.worlds = await defaultInstanceProvider({ limit: LANDING_WORLD_LIMIT });
      } catch (err) {
        console.warn('[cyberia-portal-landing] could not load featured worlds', err);
        state.worlds = [];
      }
      const first = state.worlds.find((w) => w.playable) || state.worlds[0];
      state.selectedId = first ? first.id : null;
      const section = s(`.hero-section`);
      if (section) section.classList.toggle('hero-section-no-worlds', state.worlds.length === 0);
      renderWorlds();
      renderCta();
      renderBackdrop();
    };

    setTimeout(() => {
      EventsUI.onClick(ctaSel, launch);
      EventsUI.onClick('.cta-button-select-instance', () => s(`.main-btn-instance-selection`).click());

      const worlds = s(worldsSel);
      if (worlds)
        worlds.addEventListener('click', (event) => {
          const card = event.target.closest?.('.hero-world:not(.hero-world-skeleton)');
          if (!card) return;
          // Second click on the already selected world enters it directly.
          if (card.dataset.instanceId === state.selectedId) return launch();
          select(card.dataset.instanceId);
        });

      load();
    });

    // Stable pixel-art particle field: positions/motion fixed once so they don't jump on theme change.
    // Colors are theme-driven via CSS custom properties resolved in ThemeEvents.
    const pixelSizes = [10, 14, 18, 24, 30];
    const heroParticles = range(1, 34).map((i) => ({
      i,
      size: pixelSizes[Math.floor(Math.random() * pixelSizes.length)],
      left: Math.round(Math.random() * 100),
      duration: 9 + Math.round(Math.random() * 15),
      delay: Math.round(Math.random() * 24),
      drift: Math.round((Math.random() - 0.5) * 220),
      spin: Math.round((Math.random() - 0.5) * 360),
      alt: i % 3 === 0,
    }));
    const heroParticlesHtml = heroParticles
      .map(
        (p) =>
          html`<span
            class="hero-particle${p.alt ? ' hero-particle-alt' : ''}"
            style="left: ${p.left}%; width: ${p.size}px; height: ${p.size}px; --drift: ${p.drift}px; --spin: ${p.spin}deg; animation-duration: ${p.duration}s; animation-delay: -${p.delay}s;"
          ></span>`,
      )
      .join('');

    ThemeEvents[id] = () => {
      if (!s(`.style-${id}`)) return;
      htmls(
        `.style-${id}`,
        html`<style>
          :root {
            --primary-color: ${darkTheme ? '#9b59b6' : '#ffcc00'};
            --secondary-color: ${darkTheme ? '#8e44ad' : '#e6b800'};
            --background-color: ${darkTheme ? '#1a1a1a' : '#f4f6f8'};
            --text-color: ${darkTheme ? '#E0E0E0' : '#333'};
            --header-bg-color: ${darkTheme ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)'};
            --footer-bg-color: ${darkTheme ? '#101010' : '#E3E3E3'};
            --card-bg-color: ${darkTheme ? '#2c2c2c' : '#FFFFFF'};
            --card-shadow: ${darkTheme ? '0 8px 25px rgba(0, 0, 0, 0.5)' : '0 8px 25px rgba(0, 0, 0, 0.1)'};
            --btn-primary-bg: ${
              darkTheme ? 'linear-gradient(45deg, #9b59b6, #8e44ad)' : 'linear-gradient(45deg, #ffcc00, #e6b800)'
            };
            --btn-primary-shadow: ${
              darkTheme ? '0 4px 15px rgba(155, 89, 182, 0.4)' : '0 4px 15px rgba(255, 204, 0, 0.4)'
            };

            /* Pixel-art particle + title palette (theme aware) */
            --particle-color-1: ${darkTheme ? '#bb8fce' : '#ffcc00'};
            --particle-color-2: ${darkTheme ? '#8e44ad' : '#e6b800'};
            --pixel-glow: ${darkTheme ? '14px' : '7px'};
            --title-accent: ${darkTheme ? '#bb8fce' : '#e6b800'};
            --title-shadow: ${darkTheme ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.55)'};
            --pixel-grid-color: ${darkTheme ? 'rgba(155, 89, 182, 0.75)' : 'rgba(255, 204, 0, 1)'};

            /* Hero space backdrop: deep nebula gradient, the selected world's
               thumbnail is blurred on top of it, then a tint keeps text legible */
            --hero-space: ${
              darkTheme
                ? 'radial-gradient(ellipse 70% 60% at 20% 20%, rgba(155, 89, 182, 0.45), transparent 60%), radial-gradient(ellipse 60% 50% at 85% 80%, rgba(93, 41, 128, 0.5), transparent 60%), linear-gradient(180deg, #0b0a12, #15111f)'
                : 'radial-gradient(ellipse 70% 60% at 20% 20%, rgba(255, 204, 0, 0.35), transparent 60%), radial-gradient(ellipse 60% 50% at 85% 80%, rgba(230, 150, 0, 0.35), transparent 60%), linear-gradient(180deg, #1c1f33, #2a2340)'
            };
            --hero-overlay: ${
              darkTheme
                ? 'linear-gradient(180deg, rgba(8, 6, 14, 0.55), rgba(8, 6, 14, 0.78))'
                : 'linear-gradient(180deg, rgba(16, 14, 30, 0.42), rgba(16, 14, 30, 0.7))'
            };
            --hero-backdrop-opacity: ${darkTheme ? '0.55' : '0.6'};

            /* World cards */
            --world-frame-bg: ${darkTheme ? '#08060e' : '#12101f'};
            --world-star: ${darkTheme ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 244, 200, 0.95)'};
            --world-beam: ${darkTheme ? '#bb8fce' : '#ffcc00'};
            --world-beam-2: ${darkTheme ? '#8e44ad' : '#e6b800'};
            --world-caption-bg: ${
              darkTheme
                ? 'linear-gradient(0deg, rgba(8, 6, 14, 0.95), rgba(8, 6, 14, 0))'
                : 'linear-gradient(0deg, rgba(18, 16, 31, 0.95), rgba(18, 16, 31, 0))'
            };
            --world-glow: ${darkTheme ? 'rgba(187, 143, 206, 0.55)' : 'rgba(255, 204, 0, 0.55)'};
            --world-ok: ${darkTheme ? '#43d17a' : '#3ddc84'};
            --world-warn: ${darkTheme ? '#f0b429' : '#ffc233'};
            --world-err: ${darkTheme ? '#ff5b5b' : '#ff6b6b'};
            --world-info: ${darkTheme ? '#c084fc' : '#c9a2ff'};
            --world-muted: ${darkTheme ? '#8a8a96' : '#b0b0bd'};
            --world-accent: ${darkTheme ? '#bb8fce' : '#ffcc00'};
          }

          .landing-page {
            background-color: var(--background-color);
            color: var(--text-color);
            font-family: 'Roboto', 'Helvetica', sans-serif;
            overflow-x: hidden;
            transition:
              background-color 0.3s,
              color 0.3s;
          }

          /* Hero Section */
          .hero-section {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            position: relative;
            padding: 4rem 1rem 3.5rem;
            overflow: hidden;
            background: var(--hero-space);
          }
          /* Selected world thumbnail, blurred and scaled, behind everything */
          .hero-backdrop {
            position: absolute;
            inset: 0;
            z-index: 0;
            overflow: hidden;
            pointer-events: none;
          }
          .hero-backdrop-img {
            position: absolute;
            inset: -6%;
            width: 112%;
            height: 112%;
            object-fit: cover;
            object-position: center center;
            image-rendering: pixelated;
            filter: blur(18px) saturate(1.2);
            opacity: 0;
            transform: scale(1.04);
            transition:
              opacity 1.1s ease,
              transform 12s ease-out;
          }
          .hero-backdrop-img.hero-backdrop-visible {
            opacity: var(--hero-backdrop-opacity);
            transform: scale(1);
          }
          /* Tint over the backdrop so the white hero text stays legible */
          .hero-section::after {
            content: '';
            position: absolute;
            inset: 0;
            background: var(--hero-overlay);
            z-index: 1;
          }
          /* Pixel grid overlay (theme aware, slow drift) */
          .hero-pixel-grid {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 2;
            background-image:
              linear-gradient(var(--pixel-grid-color) 2px, transparent 2px),
              linear-gradient(90deg, var(--pixel-grid-color) 2px, transparent 2px);
            background-size:
              34px 34px,
              34px 34px;
            -webkit-mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 1), transparent 92%);
            mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 1), transparent 92%);
            animation: heroGridDrift 34s linear infinite;
            opacity: 0.35;
          }

          /* Pixel-art particle field */
          .hero-particles {
            position: absolute;
            inset: 0;
            pointer-events: none;
            overflow: hidden;
            z-index: 2;
          }
          .hero-particle {
            position: absolute;
            bottom: -24px;
            border-radius: 0;
            image-rendering: pixelated;
            background: var(--particle-color-1);
            box-shadow: 0 0 var(--pixel-glow) var(--particle-color-1);
            opacity: 0;
            will-change: transform, opacity;
            animation-name: heroParticleFloat;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
          }
          .hero-particle-alt {
            background: var(--particle-color-2);
            box-shadow: 0 0 var(--pixel-glow) var(--particle-color-2);
          }

          /* Two-column hero: copy + CTA left, world deck right */
          .hero-layout {
            position: relative;
            z-index: 5;
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 2.5rem 3rem;
            align-items: center;
            width: 100%;
            max-width: 1180px;
            animation: fadeInUp 1s ease-out;
          }
          .hero-content {
            text-align: center;
            max-width: 620px;
            margin: 0 auto;
          }
          .hero-content .logo-image {
            max-width: 210px;
            margin-bottom: 0.5rem;
            image-rendering: pixelated;
            transform-origin: center bottom;
            animation:
              heroLogoSlam 0.9s steps(9, end) both,
              heroLogoFloat 4.5s ease-in-out 1.1s infinite;
          }
          .hero-content h1 {
            position: relative;
            display: inline-block;
            font-size: 4rem;
            margin: 10px 0;
            font-weight: 700;
            letter-spacing: 4px;
            color: #fff;
            text-shadow:
              4px 4px 0 var(--title-accent),
              9px 9px 0 var(--title-shadow);
            animation: heroTitlePixelIn 1s steps(18, end) 0.55s both;
          }
          .hero-content p {
            font-size: 1.2rem;
            margin: 10px auto 1.8rem;
            max-width: 560px;
            line-height: 1.6;
            color: #fff;
            text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6);
            animation: heroFadeUp 0.8s steps(6, end) 0.95s both;
          }
          .hero-kicker {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 0.9rem;
            padding: 5px 12px;
            border: 2px solid var(--world-accent);
            color: #fff;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 3px;
            text-transform: uppercase;
            background: rgba(0, 0, 0, 0.35);
            animation: heroFadeUp 0.7s steps(6, end) 1.15s both;
          }
          .hero-kicker-dot {
            width: 8px;
            height: 8px;
            background: var(--world-ok);
            box-shadow: 0 0 10px var(--world-ok);
            animation: heroPulse 1.6s ease-in-out infinite;
          }
          .hero-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            animation: heroFadeUp 0.8s steps(6, end) 1.25s both;
          }

          .cta-button {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            max-width: 100%;
            padding: 15px 35px;
            border: none;
            border-radius: 50px;
            background: var(--btn-primary-bg);
            color: white;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            transition:
              transform 0.3s,
              box-shadow 0.3s,
              opacity 0.3s;
            box-shadow: var(--btn-primary-shadow);
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .cta-button .cta-world-name {
            max-width: 260px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .cta-button:hover:not(:disabled) {
            transform: translateY(-5px);
            box-shadow: 0 6px 20px var(--world-glow);
          }
          .cta-button:disabled,
          .cta-button-disabled {
            cursor: not-allowed;
            opacity: 0.6;
            filter: grayscale(0.5);
          }
          .cta-button-select-instance {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 18px;
            border: 1px solid rgba(255, 255, 255, 0.35);
            border-radius: 50px;
            font-size: 0.9rem;
            cursor: pointer;
            transition:
              transform 0.3s,
              box-shadow 0.3s,
              border-color 0.3s;
            background: rgba(0, 0, 0, 0.35);
            color: #fff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          }
          .cta-button-select-instance:hover {
            transform: translateY(-2px);
            border-color: var(--world-accent);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
          }

          /* World deck: 3 space-framed thumbnails in a staggered cascade */
          .hero-worlds {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
            width: 100%;
            max-width: 720px;
            margin: 0 auto;
            align-items: start;
          }
          .hero-section-no-worlds .hero-worlds {
            display: none;
          }
          .hero-world {
            position: relative;
            display: block;
            width: 100%;
            padding: 0;
            border: none;
            background: transparent;
            color: #fff;
            font-family: inherit;
            text-align: left;
            cursor: pointer;
            /* pixel-step entrance (after the title), then an endless gentle float
               whose phase is offset per card so the deck never bobs in unison */
            animation:
              heroWorldIn 0.75s steps(8, end) calc(1.15s + var(--world-index, 0) * 0.16s) both,
              heroWorldFloat calc(5.2s + var(--world-index, 0) * 0.7s) ease-in-out
                calc(1.9s + var(--world-index, 0) * 0.16s) infinite;
          }
          .hero-world:focus-visible {
            outline: 3px solid var(--world-accent);
            outline-offset: 4px;
          }
          /* Space frame: starfield padding ring with a slowly rotating light beam */
          .hero-world-frame {
            position: absolute;
            inset: 0;
            overflow: hidden;
            background-color: var(--world-frame-bg);
            background-image:
              radial-gradient(circle, var(--world-star) 0.9px, transparent 1.4px),
              radial-gradient(circle, var(--world-star) 0.7px, transparent 1.2px),
              radial-gradient(circle, var(--world-star) 1.1px, transparent 1.6px);
            background-size:
              23px 23px,
              37px 41px,
              59px 53px;
            background-position:
              0 0,
              11px 7px,
              29px 19px;
            animation: heroStarDrift 60s linear infinite;
            transition: box-shadow 0.35s ease;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
          }
          .hero-world-frame::before {
            content: '';
            position: absolute;
            inset: -75%;
            background: conic-gradient(
              from 0deg,
              transparent 0deg,
              transparent 250deg,
              var(--world-beam-2) 300deg,
              var(--world-beam) 330deg,
              transparent 360deg
            );
            opacity: 0.85;
            animation: heroBeamSpin 7s linear infinite;
            animation-delay: calc(var(--world-index, 0) * -2.3s);
          }
          .hero-world-inner {
            position: relative;
            z-index: 1;
            display: block;
            margin: 6px;
            aspect-ratio: 16 / 11;
            overflow: hidden;
            background: var(--world-frame-bg);
            transform: scale(1);
            transition:
              transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2),
              filter 0.35s ease;
          }
          .hero-world-img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            image-rendering: pixelated;
            transform: scale(1.02);
            transition:
              transform 0.6s ease,
              filter 0.35s ease;
            filter: saturate(0.85) brightness(0.9);
          }
          .hero-world:hover .hero-world-img,
          .hero-world-selected .hero-world-img {
            transform: scale(1.1);
            filter: saturate(1.1) brightness(1);
          }
          .hero-world:hover .hero-world-frame,
          .hero-world-selected .hero-world-frame {
            box-shadow:
              0 0 0 2px var(--world-accent),
              0 0 26px var(--world-glow),
              0 14px 32px rgba(0, 0, 0, 0.6);
          }
          .hero-world-selected .hero-world-frame::before {
            opacity: 1;
            animation-duration: 3.2s;
          }
          .hero-world-selected .hero-world-inner {
            transform: scale(1.03);
          }
          .hero-world-unavailable .hero-world-img {
            filter: grayscale(0.7) brightness(0.65);
          }
          .hero-world-status {
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 2;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 3px 8px;
            font-size: 0.62rem;
            font-weight: 700;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            color: #fff;
            background: rgba(0, 0, 0, 0.65);
            border-left: 3px solid var(--tone, var(--world-muted));
          }
          .hero-world-dot {
            width: 7px;
            height: 7px;
            background: var(--tone, var(--world-muted));
            box-shadow: 0 0 8px var(--tone, var(--world-muted));
            animation: heroPulse 1.6s ease-in-out infinite;
          }
          .hero-tone-ok {
            --tone: var(--world-ok);
          }
          .hero-tone-warn {
            --tone: var(--world-warn);
          }
          .hero-tone-err {
            --tone: var(--world-err);
          }
          .hero-tone-info {
            --tone: var(--world-info);
          }
          .hero-tone-muted {
            --tone: var(--world-muted);
          }
          .hero-tone-accent {
            --tone: var(--world-accent);
          }
          .hero-world-check {
            position: absolute;
            top: 6px;
            right: 6px;
            z-index: 2;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            font-size: 0.8rem;
            color: #111;
            background: var(--world-accent);
            box-shadow: 0 0 12px var(--world-glow);
            opacity: 0;
            transform: scale(0.4);
            transition:
              opacity 0.25s ease,
              transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.4);
          }
          .hero-world-selected .hero-world-check {
            opacity: 1;
            transform: scale(1);
          }
          .hero-world-caption {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2;
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 22px 10px 9px;
            background: var(--world-caption-bg);
          }
          .hero-world-name {
            font-size: 0.95rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.7);
          }
          .hero-world-code {
            font-size: 0.66rem;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: var(--world-accent);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .hero-world-skeleton {
            cursor: default;
            animation: heroWorldIn 0.75s steps(8, end) calc(1.15s + var(--world-index, 0) * 0.16s) both;
          }
          .hero-world-skeleton .hero-world-inner {
            background: linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.04) 25%,
              rgba(255, 255, 255, 0.12) 37%,
              rgba(255, 255, 255, 0.04) 63%
            );
            background-size: 400% 100%;
            animation: heroShimmer 1.3s ease infinite;
          }

          /* Features Section */
          .features-section {
            padding: 5rem 2rem;
            text-align: center;
          }
          .features-section h2 {
            font-size: 2.5rem;
            margin-bottom: 3rem;
            font-weight: 600;
          }
          .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100%, 1fr)); /* Default to 1 column */
            gap: 2rem;
            margin-top: 3rem;
          }

          @media (min-width: 576px) {
            .features-grid {
              grid-template-columns: repeat(auto-fit, minmax(45%, 1fr)); /* 2 columns */
            }
          }

          @media (min-width: 992px) {
            .features-grid {
              grid-template-columns: repeat(auto-fit, minmax(22%, 1fr)); /* 4 columns */
            }
            .hero-layout {
              grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
            }
            .hero-content {
              text-align: left;
              margin: 0;
            }
            .hero-content p {
              margin-left: 0;
              margin-right: 0;
            }
            .hero-actions {
              align-items: flex-start;
            }
            /* cascade: each card steps down and right, selected one pops forward */
            .hero-worlds {
              grid-template-columns: repeat(3, minmax(0, 1fr));
              max-width: none;
              padding-top: 24px;
              padding-bottom: 24px;
            }
            .hero-world-0 {
              --card-y: 24px;
            }
            .hero-world-1 {
              --card-y: -12px;
            }
            .hero-world-2 {
              --card-y: 36px;
            }
          }
          .feature-card {
            background: var(--card-bg-color);
            padding: 2.5rem 2rem;
            border-radius: 15px;
            box-shadow: var(--card-shadow);
            transition:
              transform 0.3s,
              box-shadow 0.3s;
          }
          .feature-card:hover {
            transform: translateY(-10px);
            box-shadow: ${darkTheme ? '0 12px 30px rgba(0, 0, 0, 0.7)' : '0 12px 30px rgba(0, 0, 0, 0.15)'};
          }
          .feature-icon {
            max-width: 64px;
            height: 64px;
            margin-bottom: 1.5rem;
            image-rendering: pixelated;
          }
          .feature-card h3 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
          }

          /* Footer */
          .landing-footer {
            background: var(--footer-bg-color);
            padding: 2rem;
            text-align: center;
            margin-top: 4rem;
          }

          /* Animations */
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          /* RPG-style logo entrance: pixelated slam-down, then a slow idle float */
          @keyframes heroLogoSlam {
            0% {
              opacity: 0;
              transform: scale(2.6) translateY(-46px);
            }
            55% {
              opacity: 1;
              transform: scale(0.9) translateY(0);
            }
            75% {
              transform: scale(1.07);
            }
            100% {
              opacity: 1;
              transform: scale(1);
            }
          }
          @keyframes heroLogoFloat {
            0%,
            100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-10px);
            }
          }

          /* Smooth pixel-stepped title reveal (fine steps keep the pixel-art feel) */
          @keyframes heroTitlePixelIn {
            0% {
              opacity: 0;
              transform: translateY(16px) scale(0.94);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes heroFadeUp {
            0% {
              opacity: 0;
              transform: translateY(24px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          /* World cards: pixel-step drop-in, then a slow bob (offsets are baked in
             via --card-y so the desktop cascade survives the float loop) */
          @keyframes heroWorldIn {
            0% {
              opacity: 0;
              transform: translateY(calc(var(--card-y, 0px) + 48px)) scale(0.82);
            }
            60% {
              opacity: 1;
              transform: translateY(calc(var(--card-y, 0px) - 8px)) scale(1.03);
            }
            100% {
              opacity: 1;
              transform: translateY(var(--card-y, 0px)) scale(1);
            }
          }
          @keyframes heroWorldFloat {
            0%,
            100% {
              transform: translateY(var(--card-y, 0px));
            }
            50% {
              transform: translateY(calc(var(--card-y, 0px) - 9px));
            }
          }
          @keyframes heroBeamSpin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          @keyframes heroStarDrift {
            from {
              background-position:
                0 0,
                11px 7px,
                29px 19px;
            }
            to {
              background-position:
                -46px 46px,
                -63px 89px,
                -89px 125px;
            }
          }
          @keyframes heroShimmer {
            0% {
              background-position: 100% 0;
            }
            100% {
              background-position: 0 0;
            }
          }
          @keyframes heroPulse {
            0%,
            100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.45;
              transform: scale(0.75);
            }
          }

          /* Pixel-art particles rise with drift + spin; grid drifts slowly */
          @keyframes heroParticleFloat {
            0% {
              transform: translateY(0) translateX(0) rotate(0deg);
              opacity: 0;
            }
            8% {
              opacity: 0.9;
            }
            92% {
              opacity: 0.9;
            }
            100% {
              transform: translateY(-116vh) translateX(var(--drift, 0px)) rotate(var(--spin, 0deg));
              opacity: 0;
            }
          }
          @keyframes heroGridDrift {
            from {
              background-position:
                0 0,
                0 0;
            }
            to {
              background-position:
                0 -64px,
                64px 0;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .hero-particle,
            .hero-pixel-grid,
            .hero-content .logo-image,
            .hero-content h1,
            .hero-content p,
            .hero-kicker,
            .hero-kicker-dot,
            .hero-actions,
            .hero-world,
            .hero-world-frame,
            .hero-world-frame::before,
            .hero-world-dot,
            .hero-world-skeleton .hero-world-inner {
              animation: none !important;
            }
            .hero-backdrop-img,
            .hero-world-inner,
            .hero-world-img {
              transition: none !important;
            }
          }

          /* Responsive Styles */
          @media (max-width: 650px) {
            .hero-section {
              padding: 3.5rem 1rem 3rem;
            }
            .hero-content h1 {
              font-size: 2.2rem;
            }
            .hero-content p {
              font-size: 1rem;
            }
            .hero-content .logo-image {
              max-width: 160px;
            }
            .cta-button {
              padding: 12px 24px;
              font-size: 1rem;
            }
            .cta-button .cta-world-name {
              max-width: 160px;
            }
            .hero-worlds {
              gap: 10px;
            }
            .hero-world-inner {
              margin: 4px;
            }
            .hero-world-name {
              font-size: 0.78rem;
            }
            .hero-world-code {
              display: none;
            }
            .hero-world-status {
              font-size: 0.55rem;
              padding: 2px 6px;
            }
            .hero-world-caption {
              padding: 16px 7px 6px;
            }
            .features-section {
              padding: 3rem 1rem;
            }
            .features-section h2 {
              font-size: 2rem;
            }
          }
        </style> `,
      );
      const logo = s(`.hero-content .logo-image`);
      if (logo) logo.src = `${getProxyPath()}assets/ui-icons/${darkTheme ? 'cyberia-white.png' : 'cyberia-yellow.png'}`;
    };

    setTimeout(() => {
      ThemeEvents[id]();
    });

    return html`
      <div class="style-${id}"></div>
      <div class="landing-page">
        <section class="hero-section">
          <div class="hero-backdrop"><img class="hero-backdrop-img" alt="" aria-hidden="true" /></div>
          <div class="hero-pixel-grid"></div>
          <div class="hero-particles">${heroParticlesHtml}</div>
          <div class="hero-layout">
            <div class="hero-content">
              <img src="${getProxyPath()}assets/ui-icons/cyberia-white.png" alt="Cyberia Logo" class="logo-image" />
              <h1>CYBERIA</h1>
              <p>
                An action-packed Hack and Slash MMORPG. Explore a dynamic online sandbox pixel art universe, right from
                your browser.
              </p>
              <div class="hero-kicker"><span class="hero-kicker-dot"></span> Pick a world · Jump in</div>
              <div class="hero-actions">
                <button class="cta-button" type="button"><i class="fa-solid fa-play"></i> Enter The World</button>
                <button class="cta-button-select-instance" type="button">
                  <i class="fa-solid fa-globe"></i> Browse all worlds
                </button>
              </div>
            </div>
            <div class="hero-worlds">${worldSkeleton()}</div>
          </div>
        </section>

        <section id="features" class="features-section">
          <h2>Game Features</h2>
          <div class="features-grid">
            ${[
              {
                icon: 'skull.png',
                title: 'Intense Hack and Slash Combat',
                description:
                  'Master a fluid, action-oriented combat system. Slay hordes of monsters and challenging bosses.',
              },
              {
                icon: 'world-default-forest-city.png',
                title: 'Explore a Sandbox Universe',
                description:
                  'Discover a persistent, ever-evolving pixel art world. Unearth secrets, and build your own story.',
              },
              {
                icon: 'bag.png',
                title: 'Deep Loot & Crafting',
                description:
                  'Hunt for epic loot, gather rare resources, and craft powerful gear to define your playstyle.',
              },
              {
                icon: 'wallet.png',
                title: 'Earn While You Play',
                description:
                  'Engage in an innovative play-to-earn economy. Trade items, complete quests, and earn rewards.',
              },
            ]
              .map(
                (feature) => html`
                  <div class="feature-card">
                    <img
                      src="${getProxyPath()}assets/ui-icons/${feature.icon}"
                      alt="${feature.title}"
                      class="feature-icon"
                    />
                    <h3>${feature.title}</h3>
                    <p>${feature.description}</p>
                  </div>
                `,
              )
              .join('')}
          </div>
        </section>

        <footer class="landing-footer">
          <p>&copy; ${new Date().getFullYear()} Cyberia. All Rights Reserved.</p>
        </footer>
      </div>
    `;
  }
}

export { MainBodyCyberiaPortal };
