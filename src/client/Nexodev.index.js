'use strict';

import { Css, darkTheme, ThemeEvents } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInNexodev } from './components/nexodev/LogInNexodev.js';
import { LogOutNexodev } from './components/nexodev/LogOutNexodev.js';
import { SignUpNexodev } from './components/nexodev/SignUpNexodev.js';
import { MenuNexodev } from './components/nexodev/MenuNexodev.js';
import { RouterNexodev } from './components/nexodev/RoutesNexodev.js';
import { SocketIo } from './components/core/SocketIo.js';
import { ElementsNexodev } from './components/nexodev/ElementsNexodev.js';
import { SocketIoNexodev } from './components/nexodev/SocketIoNexodev.js';
import { Worker } from './components/core/Worker.js';
import { CssNexodevDark, CssNexodevLight } from './components/nexodev/CssNexodev.js';
import { Keyboard } from './components/core/Keyboard.js';
import { NexodevParams } from './components/nexodev/CommonNexodev.js';
import { Scroll } from './components/core/Scroll.js';
import { getProxyPath, s } from './components/core/VanillaJs.js';
import { EventsUI } from './components/core/EventsUI.js';

const htmlMainBody = async () => {
  // Add global styles with animations
  const style = document.createElement('style');
  style.textContent = css`
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(-30px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .landing-page {
      opacity: 0;
      animation: fadeIn 0.6s ease-out forwards;
    }

    .hero h1 {
      animation: fadeInUp 0.8s ease-out 0.2s forwards;
      opacity: 0;
    }

    .hero .lead {
      animation: fadeInUp 0.8s ease-out 0.4s forwards;
      opacity: 0;
    }

    .cta-buttons {
      animation: fadeInUp 0.8s ease-out 0.6s forwards;
      opacity: 0;
    }

    .hero-image {
      animation: slideIn 0.8s ease-out 0.8s forwards;
      opacity: 0;
      transform: translateX(30px);
    }

    .feature-card {
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      opacity: 0;
      animation: fadeInUp 0.6s ease-out forwards;
      animation-delay: calc(var(--index) * 0.15s);
    }

    .feature-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
    }

    .feature-icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      transition: transform 0.3s ease;
    }

    .feature-card:hover .feature-icon {
      transform: scale(1.1);
    }

    .btn {
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .btn:after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      transition: width 0.6s ease, height 0.6s ease;
    }

    .btn:hover:after {
      width: 300px;
      height: 300px;
      opacity: 0;
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    EventsUI.onClick('.btn-landing-sign-up', () => {
      s(`.main-btn-sign-up`).click();
    });

    EventsUI.onClick('.btn-start-project', () => {
      s(`.main-btn-sign-up`).click();
    });
  });

  return html`
    <div class="landing-page">
      <!-- Hero Section -->
      <header class="hero">
        <div class="hero-content">
          <h1>Transform Your Business</h1>
          <p class="lead">
            Specializing in custom ERP & CRM development and cloud DevOps services to streamline your operations and
            drive growth.
          </p>
          <div class="cta-buttons">
            <button class="btn btn-primary btn-landing-sign-up" id="getStartedBtn">Sign Up</button>
            <!--  <button class="btn btn-outline" id="learnMoreBtn">Our Services</button> -->
          </div>
        </div>
        <div class="hero-image">
          <img
            class="img-fluid in"
            style="top: 50px; margin: auto; width: 80%; max-width: 400px; border-radius: 12px;"
            src="${getProxyPath()}assets/generic/apps3.png"
            alt="Business Process Automation"
          />
        </div>
      </header>

      <!-- Features Section -->
      <section class="features">
        <h2 style="opacity: 0; animation: fadeInUp 0.6s ease-out 1s forwards;">Our Core Services</h2>
        <div class="feature-grid">
          ${['ERP Development', 'CRM Solutions', 'Cloud DevOps']
            .map(
              (title, index) => html`
                <div class="feature-card" style="--index: ${index + 1};">
                  <div class="feature-icon">${['📊 ', '👥', '☁️'][index]}</div>
                  <h3>${title}</h3>
                  <p>
                    ${[
                      'Custom enterprise resource planning systems tailored to your business needs and workflows.',
                      'Comprehensive customer relationship management solutions to enhance engagement and sales.',
                      'End-to-end cloud infrastructure and DevOps services for seamless deployment and scaling.',
                    ][index]}
                  </p>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section" style="opacity: 0; animation: fadeInUp 0.6s ease-out 1.5s forwards;">
        <h2>Ready to Transform Your Business?</h2>
        <p>Join businesses that trust Nexodev for their digital transformation journey.</p>
        <button class="btn btn-primary btn-lg  btn-start-project">Start Your Project</button>
      </section>

      <!-- Footer -->
      <footer class="footer">
        <div class="footer-content">
          <div class="footer-section">
            <h3>About Nexodev</h3>
            <p>
              Empowering businesses with cutting-edge ERP, CRM, and cloud DevOps solutions to achieve operational
              excellence.
            </p>
          </div>
          <div class="footer-section">
            <h3>Quick Links</h3>
            <ul>
              <li><a href="#services">Our Services</a></li>
              <li><a href="#solutions">Solutions</a></li>
              <li><a href="#case-studies">Case Studies</a></li>
              <li><a href="#contact">Contact Us</a></li>
            </ul>
          </div>
          <div class="footer-section">
            <h3>Connect With Us</h3>
            <div class="social-links">
              <a href="#" aria-label="LinkedIn"><i class="fab fa-linkedin"></i></a>
              <a href="#" aria-label="GitHub"><i class="fab fa-github"></i></a>
              <a href="#" aria-label="Twitter"><i class="fab fa-twitter"></i></a>
              <a href="#" aria-label="Discord"><i class="fab fa-discord"></i></a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; ${new Date().getFullYear()} Nexodev. All rights reserved.</p>
        </div>
      </footer>
    </div>

    <style>
      /* Theme variables */

      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        transition: 0.4s;
        border-radius: 34px;
      }

      .slider:before {
        position: absolute;
        content: '';
        height: 22px;
        width: 22px;
        left: 4px;
        bottom: 3px;
        transition: 0.4s;
        border-radius: 50%;
        z-index: 2;
      }

      .sun,
      .moon {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        font-size: 14px;
        transition: opacity 0.3s;
      }

      .sun {
        left: 8px;
        opacity: 0;
      }

      .moon {
        right: 8px;
        opacity: 1;
      }

      input:checked + .slider:before {
        transform: translateX(28px);
      }

      input:checked + .slider .sun {
        opacity: 1;
      }

      input:checked + .slider .moon {
        opacity: 0;
      }

      .landing-page {
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        line-height: 1.6;
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 1rem;
      }

      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 4rem 1rem;
        gap: 2rem;
      }

      .hero-content {
        max-width: 600px;
      }

      .hero h1 {
        font-size: 2.5rem;
        margin-bottom: 1rem;
      }

      .lead {
        font-size: 1.25rem;
        margin-bottom: 2rem;
      }

      .cta-buttons {
        display: flex;
        gap: 1rem;
        justify-content: center;
        margin-top: 2rem;
      }

      .btn {
        padding: 0.75rem 1.5rem;
        border-radius: 5px;
        font-weight: 600;
        transition: all 0.3s ease;
      }

      .btn:hover {
        transform: translateY(-2px);
      }

      .features {
        padding: 4rem 1rem;
        text-align: center;
      }

      .features h2 {
        margin-bottom: 3rem;
        font-size: 2rem;
      }

      .feature-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 2rem;
        margin-top: 2rem;
      }

      .feature-card {
        padding: 2rem;
        border-radius: 10px;
        transition: transform 0.3s ease;
      }

      .feature-card:hover {
        transform: translateY(-5px);
      }

      .feature-icon {
        font-size: 2.5rem;
        margin-bottom: 1rem;
      }

      .feature-card h3 {
        margin: 1rem 0;
      }

      /* Footer Styles */
      .footer {
        padding: 3rem 1rem;
        margin-top: 4rem;
      }

      .footer-content {
        max-width: 1200px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 2rem;
        padding: 0 1rem;
      }

      .footer-section h3 {
        margin-bottom: 1.5rem;
        font-size: 1.2rem;
      }

      .footer-section p,
      .footer-section a {
        line-height: 1.8;
        transition: color 0.3s ease;
      }

      .footer-section a:hover {
        text-decoration: none;
      }

      .footer-section ul {
        list-style: none;
        padding: 0;
      }

      .footer-section ul li {
        margin-bottom: 0.8rem;
      }

      .social-links {
        display: flex;
        gap: 1rem;
        margin-top: 1.5rem;
      }

      .social-links a {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        transition: all 0.3s ease;
      }

      .social-links a:hover {
        background-color: var(--primary-color);
        transform: translateY(-3px);
      }

      .footer-bottom {
        max-width: 1200px;
        margin: 2rem auto 0;
        padding-top: 2rem;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        font-size: 0.9rem;
      }

      .footer-links {
        display: flex;
        gap: 1rem;
        align-items: center;
      }

      .footer-links a {
        transition: color 0.3s ease;
      }

      .footer-links a:hover {
        text-decoration: none;
      }

      @media (max-width: 768px) {
        .footer-content {
          grid-template-columns: 1fr;
        }

        .footer-bottom {
          flex-direction: column;
          gap: 1rem;
          text-align: center;
        }
      }

      .cta-section {
        text-align: center;
        padding: 5rem 1rem;
        border-radius: 15px;
        margin: 4rem 0;
      }

      .cta-section h2 {
        font-size: 2rem;
        margin-bottom: 1rem;
      }

      .btn-lg {
        padding: 1rem 2rem;
        font-size: 1.1rem;
        margin-top: 1.5rem;
      }

      @media (min-width: 768px) {
        .hero {
          flex-direction: row;
          text-align: left;
          justify-content: space-between;
          padding: 6rem 2rem;
        }

        .hero-content {
          flex: 1;
          padding-right: 2rem;
        }

        .hero-image {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .cta-buttons {
          justify-content: flex-start;
        }
      }
    </style>
  `;
};

window.onload = () =>
  Worker.instance({
    router: RouterNexodev,
    render: async () => {
      await Css.loadThemes([CssNexodevLight, CssNexodevDark]);
      await TranslateCore.Init();
      await Responsive.Init();
      await MenuNexodev.Render({ htmlMainBody });
      await SocketIo.Init({ channels: ElementsNexodev.Data });
      await SocketIoNexodev.Init();
      await LogInNexodev();
      await LogOutNexodev();
      await SignUpNexodev();
      await Scroll.pullTopRefresh();
      await Keyboard.Init({ callBackTime: NexodevParams.EVENT_CALLBACK_TIME });
    },
  });
