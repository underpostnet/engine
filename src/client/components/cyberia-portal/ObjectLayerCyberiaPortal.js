import { ThemeEvents, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { getProxyPath } from '../core/Router.js';
import { htmls, s } from '../core/VanillaJs.js';

const ObjectLayerCyberiaPortal = {
  Render: async function () {
    setTimeout(() => {
      EventsUI.onClick('.cta-button', () => {
        console.log('Enter the world button clicked');
        const loginButton = s(`.main-btn-log-in`);
        if (loginButton) loginButton.click();
      });
    });

    const id = 'cyberia-portal-landing';

    ThemeEvents[id] = () => {
      if (!s(`.style-${id}`)) return;
      htmls(
        `.style-${id}`,
        html`<style>
          :root {
            --primary-color: ${darkTheme ? '#c0392b' : '#e74c3c'};
            --secondary-color: ${darkTheme ? '#f1c40f' : '#f39c12'};
            --background-color: ${darkTheme ? '#1a1a1a' : '#f4f6f8'};
            --text-color: ${darkTheme ? '#E0E0E0' : '#333'};
            --header-bg-color: ${darkTheme ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)'};
            --footer-bg-color: ${darkTheme ? '#101010' : '#E3E3E3'};
            --card-bg-color: ${darkTheme ? '#2c2c2c' : '#FFFFFF'};
            --card-shadow: ${darkTheme ? '0 8px 25px rgba(0, 0, 0, 0.5)' : '0 8px 25px rgba(0, 0, 0, 0.1)'};
            --btn-primary-bg: ${darkTheme
              ? 'linear-gradient(45deg, #e74c3c, #c0392b)'
              : 'linear-gradient(45deg, #e74c3c, #c0392b)'};
            --btn-primary-shadow: ${darkTheme
              ? '0 4px 15px rgba(231, 76, 60, 0.4)'
              : '0 4px 15px rgba(231, 76, 60, 0.4)'};
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
            background: url('${getProxyPath()}assets/lore/vectorized/lore8.svg') no-repeat center center/cover;
            position: relative;
            padding: 0 1rem;
          }
          .hero-section::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
          }
          .hero-content {
            z-index: 1;
            max-width: 800px;
            animation: fadeInUp 1s ease-out;
          }
          .hero-content .logo-image {
            max-width: 250px;
            margin-bottom: 1rem;
          }
          .hero-content h1 {
            font-size: 4rem;
            margin-bottom: 1rem;
            text-shadow: 3px 3px 10px rgba(0, 0, 0, 0.8);
            font-weight: 700;
            letter-spacing: 2px;
            color: #fff;
          }
          .hero-content p {
            font-size: 1.25rem;
            margin-bottom: 2.5rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.6;
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
    };

    setTimeout(() => {
      ThemeEvents[id]();
    });

    return html`
      <div class="style-${id}"></div>
      <div class="landing-page">
        <section class="hero-section">
          <div class="hero-content">
            <img src="${getProxyPath()}assets/ui-icons/cyberia-white.png" alt="Cyberia Logo" class="logo-image" />
            <h1 style="margin: 10px">CYBERIA</h1>
            <p style="color: #fff; margin: 10px 20px 10px 20px;">
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
  },
};

export { ObjectLayerCyberiaPortal };
