import { range } from '../core/CommonJs.js';
import { ThemeEvents, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { getProxyPath } from '../core/Router.js';
import { htmls, s } from '../core/VanillaJs.js';

class MainBodyCyberiaPortal {
  static async instance() {
    setTimeout(() => {
      EventsUI.onClick('.cta-button', () => {
        console.log('Enter the world button clicked');
        location.href = 'https://client.cyberiaonline.com/';
      });
    });

    const id = 'cyberia-portal-landing';

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
            --btn-primary-bg: ${darkTheme
              ? 'linear-gradient(45deg, #9b59b6, #8e44ad)'
              : 'linear-gradient(45deg, #ffcc00, #e6b800)'};
            --btn-primary-shadow: ${darkTheme
              ? '0 4px 15px rgba(155, 89, 182, 0.4)'
              : '0 4px 15px rgba(255, 204, 0, 0.4)'};

            /* Pixel-art particle + title palette (theme aware) */
            --particle-color-1: ${darkTheme ? '#bb8fce' : '#ffcc00'};
            --particle-color-2: ${darkTheme ? '#8e44ad' : '#e6b800'};
            --pixel-glow: ${darkTheme ? '14px' : '7px'};
            --title-accent: ${darkTheme ? '#bb8fce' : '#e6b800'};
            --title-shadow: ${darkTheme ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.55)'};
            --hero-overlay: ${darkTheme
              ? 'linear-gradient(180deg, rgba(0, 0, 0, 0.34), rgba(0, 0, 0, 0.5))'
              : 'linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.35))'};
            --pixel-grid-color: ${darkTheme ? 'rgba(155, 89, 182, 0.75)' : 'rgba(255, 204, 0, 1)'};
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
            text-align: center;
            min-height: 100vh;
            /*     background: url('${getProxyPath()}assets/lore/vectorized/lore8.svg') no-repeat center center/cover;*/
            position: relative;
            padding: 0 1rem;
            overflow: hidden;
          }
          .hero-video {
            position: absolute;
            inset: 0;

            width: 100%;
            height: 100%;

            display: block;

            object-fit: cover;
            object-position: center center;

            pointer-events: none;
            user-select: none;
            z-index: 0;
          }
          /* Soft blurred backdrop over the video (kept light) */
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

          .hero-content {
            position: relative;
            z-index: 5;
            max-width: 800px;
            animation: fadeInUp 1s ease-out;
          }
          .hero-content .logo-image {
            max-width: 250px;
            margin-bottom: 1rem;
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
            margin-bottom: 1rem;
            font-weight: 700;
            letter-spacing: 4px;
            color: #fff;
            text-shadow:
              4px 4px 0 var(--title-accent),
              9px 9px 0 var(--title-shadow);
            animation: heroTitlePixelIn 1s steps(18, end) 0.55s both;
          }
          .hero-content p {
            font-size: 1.25rem;
            margin-bottom: 2.5rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.6;
            text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6);
            animation: heroFadeUp 0.8s steps(6, end) 0.95s both;
          }

          .cta-button {
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
              box-shadow 0.3s;
            box-shadow: var(--btn-primary-shadow);
            text-transform: uppercase;
          }
          .cta-button:hover {
            transform: translateY(-5px);
            box-shadow: 0 6px 20px rgba(231, 76, 60, 0.6);
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
            .hero-content p {
              animation: none !important;
            }
          }

          /* Responsive Styles */
          @media (max-width: 650px) {
            .hero-content h1 {
              font-size: 2.2rem;
            }
            .hero-content p {
              font-size: 1rem;
            }
            .hero-content .logo-image {
              max-width: 180px;
            }
            .cta-button {
              padding: 12px 28px;
              font-size: 1rem;
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
          <video class="hero-video" autoplay muted loop playsinline preload="auto" poster="/assets/video/landing.webp">
            <!-- H.264 (compatibilidad) -->
            <source src="/assets/video/landing-web.mp4" type='video/mp4; codecs="avc1.42E01E"' />
          </video>
          <div class="hero-pixel-grid"></div>
          <div class="hero-particles">${heroParticlesHtml}</div>
          <div class="hero-content">
            <img src="${getProxyPath()}assets/ui-icons/cyberia-white.png" alt="Cyberia Logo" class="logo-image" />
            <h1 style="margin: 10px">CYBERIA</h1>
            <p style="color: #fff; text-align: center; margin: 10px auto;">
              An action-packed Hack and Slash MMORPG. Explore a dynamic online sandbox pixel art universe, right from
              your browser.
            </p>
            <button class="cta-button">Enter The World</button>
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
