'use strict';

import { Css, darkTheme, ThemeEvents } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInItemledger } from './components/itemledger/LogInItemledger.js';
import { LogOutItemledger } from './components/itemledger/LogOutItemledger.js';
import { SignUpItemledger } from './components/itemledger/SignUpItemledger.js';
import { MenuItemledger } from './components/itemledger/MenuItemledger.js';
import { RouterItemledger } from './components/itemledger/RoutesItemledger.js';
import { TranslateItemledger } from './components/itemledger/TranslateItemledger.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { ItemledgerParams } from './components/itemledger/CommonItemledger.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoItemledger } from './components/itemledger/SocketIoItemledger.js';
import { ElementsItemledger } from './components/itemledger/ElementsItemledger.js';
import { CssItemledgerDark, CssItemledgerLight } from './components/itemledger/CssItemledger.js';
import { s } from './components/core/VanillaJs.js';
import { EventsUI } from './components/core/EventsUI.js';

const htmlMainBody = async () => {
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
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes slideInLeft {
      from {
        opacity: 0;
        transform: translateX(-50px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(50px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes pulse {
      0%,
      100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.05);
      }
    }

    @keyframes float {
      0%,
      100% {
        transform: translateY(0px);
      }
      50% {
        transform: translateY(-10px);
      }
    }

    @keyframes glowPulse {
      0%,
      100% {
        box-shadow: 0 0 20px rgba(255, 107, 53, 0.4);
      }
      50% {
        box-shadow: 0 0 40px rgba(255, 107, 53, 0.8);
      }
    }

    .mr-casas-landing {
      font-family:
        'Segoe UI',
        system-ui,
        -apple-system,
        sans-serif;
      line-height: 1.6;
      max-width: 1400px;
      margin: 0 auto;
      padding: 0;
      opacity: 0;
      animation: fadeIn 0.8s ease-out forwards;
    }

    /* Hero Section */
    .hero-section {
      min-height: 90vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 2rem;
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    }

    .hero-section::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
      pointer-events: none;
    }

    .hero-badge {
      display: inline-block;
      background: rgba(255, 107, 53, 0.2);
      color: #ff6b35;
      padding: 0.5rem 1.5rem;
      border-radius: 50px;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      border: 1px solid rgba(255, 107, 53, 0.3);
      animation: fadeInUp 0.6s ease-out 0.2s forwards;
      opacity: 0;
    }

    .hero-title {
      font-size: 4rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #fff 0%, #ff6b35 50%, #f7931e 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: fadeInUp 0.8s ease-out 0.4s forwards;
      opacity: 0;
    }

    .hero-subtitle {
      font-size: 1.5rem;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 1rem;
      animation: fadeInUp 0.8s ease-out 0.5s forwards;
      opacity: 0;
    }

    .hero-partner {
      font-size: 1.1rem;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 2rem;
      animation: fadeInUp 0.8s ease-out 0.6s forwards;
      opacity: 0;
    }

    .hero-partner strong {
      color: #ff6b35;
    }

    .hero-description {
      font-size: 1.25rem;
      color: rgba(255, 255, 255, 0.9);
      max-width: 700px;
      margin-bottom: 2.5rem;
      animation: fadeInUp 0.8s ease-out 0.7s forwards;
      opacity: 0;
    }

    .hero-cta-container {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
      animation: fadeInUp 0.8s ease-out 0.9s forwards;
      opacity: 0;
    }

    .btn-primary-landing {
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      color: white;
      padding: 1rem 2.5rem;
      border-radius: 50px;
      font-size: 1.1rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-primary-landing:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(255, 107, 53, 0.4);
    }

    .btn-secondary-landing {
      background: transparent;
      color: white;
      padding: 1rem 2.5rem;
      border-radius: 50px;
      font-size: 1.1rem;
      font-weight: 600;
      border: 2px solid rgba(255, 255, 255, 0.3);
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-secondary-landing:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.5);
      transform: translateY(-3px);
    }

    .raylib-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 3rem;
      padding: 1rem 2rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      animation: fadeInUp 0.8s ease-out 1.1s forwards;
      opacity: 0;
    }

    .raylib-badge span {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.95rem;
    }

    .raylib-badge strong {
      color: #66bb6a;
      font-size: 1.1rem;
    }

    /* Featured Service Section */
    .featured-section {
      padding: 5rem 2rem;
      background: linear-gradient(180deg, #0f3460 0%, #1a1a2e 100%);
    }

    .featured-container {
      display: flex;
      flex-wrap: wrap;
      gap: 3rem;
      align-items: center;
      max-width: 1200px;
      margin: 0 auto;
    }

    .featured-content {
      flex: 1;
      min-width: 300px;
    }

    .featured-visual {
      flex: 1;
      min-width: 300px;
      display: flex;
      justify-content: center;
    }

    .featured-tag {
      display: inline-block;
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
      padding: 0.4rem 1rem;
      border-radius: 5px;
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 1.5rem;
    }

    .featured-title {
      font-size: 2.8rem;
      font-weight: 700;
      color: white;
      margin-bottom: 1.5rem;
      line-height: 1.2;
    }

    .featured-title .highlight {
      color: #ff6b35;
    }

    .featured-description {
      font-size: 1.15rem;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 2rem;
      line-height: 1.8;
    }

    .featured-benefits {
      list-style: none;
      padding: 0;
      margin: 0 0 2rem 0;
    }

    .featured-benefits li {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: rgba(255, 255, 255, 0.9);
      font-size: 1.05rem;
      margin-bottom: 1rem;
    }

    .featured-benefits li i {
      color: #66bb6a;
      font-size: 1.2rem;
    }

    .boss-fight-visual {
      position: relative;
      width: 100%;
      max-width: 400px;
      height: 350px;
      background: linear-gradient(135deg, #2d3436 0%, #1a1a2e 100%);
      border-radius: 20px;
      overflow: hidden;
      border: 3px solid rgba(255, 107, 53, 0.3);
      animation: glowPulse 3s ease-in-out infinite;
    }

    .boss-fight-visual::before {
      content: 'VS';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 3rem;
      font-weight: 900;
      color: #ff6b35;
      text-shadow: 0 0 20px rgba(255, 107, 53, 0.5);
      z-index: 2;
    }

    .fighter-you,
    .fighter-boss {
      position: absolute;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3.5rem;
    }

    .fighter-you {
      top: 20%;
      left: 15%;
      background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
      border: 3px solid #5dade2;
      animation: float 3s ease-in-out infinite;
    }

    .fighter-boss {
      bottom: 20%;
      right: 15%;
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      border: 3px solid #ec7063;
      animation: float 3s ease-in-out infinite 1.5s;
    }

    .visual-label {
      position: absolute;
      font-size: 0.8rem;
      font-weight: 600;
      color: white;
      background: rgba(0, 0, 0, 0.7);
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
    }

    .label-you {
      top: 45%;
      left: 10%;
    }

    .label-boss {
      bottom: 45%;
      right: 10%;
    }

    /* Services Section */
    .services-section {
      padding: 5rem 2rem;
      background: #1a1a2e;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-title {
      font-size: 2.5rem;
      font-weight: 700;
      color: white;
      margin-bottom: 1rem;
    }

    .section-subtitle {
      font-size: 1.15rem;
      color: rgba(255, 255, 255, 0.7);
      max-width: 600px;
      margin: 0 auto;
    }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .service-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 2rem;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .service-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #ff6b35, #f7931e);
      transform: scaleX(0);
      transition: transform 0.3s ease;
    }

    .service-card:hover {
      transform: translateY(-5px);
      border-color: rgba(255, 107, 53, 0.3);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    }

    .service-card:hover::before {
      transform: scaleX(1);
    }

    .service-icon {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, rgba(255, 107, 53, 0.2) 0%, rgba(247, 147, 30, 0.2) 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      margin-bottom: 1.5rem;
    }

    .service-title {
      font-size: 1.4rem;
      font-weight: 600;
      color: white;
      margin-bottom: 1rem;
    }

    .service-description {
      font-size: 1rem;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.7;
    }

    /* Why Raylib Section */
    .raylib-section {
      padding: 5rem 2rem;
      background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
    }

    .raylib-container {
      max-width: 1000px;
      margin: 0 auto;
      text-align: center;
    }

    .raylib-logo {
      font-size: 4rem;
      margin-bottom: 1.5rem;
    }

    .raylib-title {
      font-size: 2.2rem;
      font-weight: 700;
      color: white;
      margin-bottom: 1.5rem;
    }

    .raylib-title .green {
      color: #66bb6a;
    }

    .raylib-description {
      font-size: 1.15rem;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 3rem;
      max-width: 700px;
      margin-left: auto;
      margin-right: auto;
    }

    .raylib-features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
    }

    .raylib-feature {
      background: rgba(102, 187, 106, 0.1);
      border: 1px solid rgba(102, 187, 106, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      transition: all 0.3s ease;
    }

    .raylib-feature:hover {
      background: rgba(102, 187, 106, 0.15);
      transform: translateY(-3px);
    }

    .raylib-feature i {
      font-size: 1.5rem;
      color: #66bb6a;
      margin-bottom: 0.75rem;
    }

    .raylib-feature h4 {
      font-size: 1.1rem;
      color: white;
      margin-bottom: 0.5rem;
    }

    .raylib-feature p {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.6);
    }

    /* CTA Section */
    .cta-section {
      padding: 5rem 2rem;
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      text-align: center;
    }

    .cta-title {
      font-size: 2.5rem;
      font-weight: 700;
      color: white;
      margin-bottom: 1rem;
    }

    .cta-description {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 2rem;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .btn-cta {
      background: white;
      color: #ff6b35;
      padding: 1rem 3rem;
      border-radius: 50px;
      font-size: 1.15rem;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: all 0.3s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-cta:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }

    /* Footer */
    .landing-footer {
      padding: 4rem 2rem 2rem;
      background: #0d1117;
    }

    .footer-content {
      display: flex;
      flex-wrap: wrap;
      gap: 3rem;
      max-width: 1200px;
      margin: 0 auto;
      justify-content: space-between;
    }

    .footer-brand {
      flex: 1;
      min-width: 250px;
    }

    .footer-brand h3 {
      font-size: 1.8rem;
      color: white;
      margin-bottom: 0.5rem;
    }

    .footer-brand .partner {
      color: #ff6b35;
      font-size: 1rem;
      margin-bottom: 1rem;
    }

    .footer-brand p {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.95rem;
      line-height: 1.7;
    }

    .footer-links {
      flex: 1;
      min-width: 150px;
    }

    .footer-links h4 {
      color: white;
      font-size: 1.1rem;
      margin-bottom: 1rem;
    }

    .footer-links ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .footer-links li {
      margin-bottom: 0.75rem;
    }

    .footer-links a {
      color: rgba(255, 255, 255, 0.6);
      text-decoration: none;
      transition: color 0.3s ease;
    }

    .footer-links a:hover {
      color: #ff6b35;
    }

    .footer-contact {
      flex: 1;
      min-width: 200px;
    }

    .footer-contact h4 {
      color: white;
      font-size: 1.1rem;
      margin-bottom: 1rem;
    }

    .footer-contact p {
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .footer-contact i {
      color: #ff6b35;
    }

    .footer-bottom {
      max-width: 1200px;
      margin: 3rem auto 0;
      padding-top: 2rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      text-align: center;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.9rem;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-title {
        font-size: 2.5rem;
      }

      .hero-subtitle {
        font-size: 1.2rem;
      }

      .hero-description {
        font-size: 1rem;
      }

      .featured-title {
        font-size: 2rem;
      }

      .section-title {
        font-size: 2rem;
      }

      .boss-fight-visual {
        height: 280px;
      }

      .fighter-you,
      .fighter-boss {
        width: 90px;
        height: 90px;
        font-size: 2.5rem;
      }

      .cta-title {
        font-size: 1.8rem;
      }
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    EventsUI.onClick('.btn-contact-landing', () => {
      if (s(`.main-btn-sign-up`)) s(`.main-btn-sign-up`).click();
    });

    EventsUI.onClick('.btn-learn-more', () => {
      const featuredSection = s('.featured-section');
      if (featuredSection) {
        featuredSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  return html`
    <div class="mr-casas-landing">
      <!-- Hero Section -->
      <section class="hero-section">
        <span class="hero-badge"><i class="fas fa-gamepad"></i> Game Development Studio</span>
        <h1 class="hero-title">Mr Casas</h1>
        <p class="hero-subtitle">Custom Game Development Services</p>
        <p class="hero-partner">In partnership with <strong>Rodrigo Escar</strong></p>
        <p class="hero-description">
          We create unique, personalized gaming experiences. From indie games to custom projects, we bring your vision
          to life with cutting-edge technology and creative passion.
        </p>
        <div class="hero-cta-container">
          <button class="btn-primary-landing btn-contact-landing">
            <i class="fas fa-rocket"></i> Start Your Project
          </button>
          <button class="btn-secondary-landing btn-learn-more"><i class="fas fa-info-circle"></i> Learn More</button>
        </div>
        <div class="raylib-badge">
          <span>Powered by</span>
          <strong><i class="fas fa-code"></i> Raylib Engine</strong>
        </div>
      </section>

      <!-- Featured Service: Fight Your Boss -->
      <section class="featured-section">
        <div class="featured-container">
          <div class="featured-content">
            <span class="featured-tag"><i class="fas fa-fire"></i> Most Popular</span>
            <h2 class="featured-title">
              Put <span class="highlight">Your Face</span> in the Game & <span class="highlight">Fight Your Boss</span>
            </h2>
            <p class="featured-description">
              Ever dreamed of settling workplace frustrations in an epic virtual battle? Our signature service lets you
              become the hero of your own game! We'll create a custom fighting game where YOU face off against your
              actual boss (or anyone you choose) in an exciting, stress-relieving showdown.
            </p>
            <ul class="featured-benefits">
              <li><i class="fas fa-check-circle"></i> Your face accurately rendered as the game protagonist</li>
              <li><i class="fas fa-check-circle"></i> Custom character abilities and fighting moves</li>
              <li><i class="fas fa-check-circle"></i> Multiple boss levels with increasing difficulty</li>
              <li><i class="fas fa-check-circle"></i> Personalized arenas (office, boardroom, parking lot...)</li>
              <li><i class="fas fa-check-circle"></i> Shareable with friends for maximum fun</li>
            </ul>
            <button class="btn-primary-landing btn-contact-landing">
              <i class="fas fa-fist-raised"></i> Create My Game Now
            </button>
          </div>
          <div class="featured-visual">
            <div class="boss-fight-visual">
              <div class="fighter-you">😎</div>
              <span class="visual-label label-you">YOU</span>
              <div class="fighter-boss">👔</div>
              <span class="visual-label label-boss">YOUR BOSS</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Services Section -->
      <section class="services-section">
        <div class="section-header">
          <h2 class="section-title">Our Game Development Services</h2>
          <p class="section-subtitle">From concept to launch, we deliver high-quality games tailored to your needs</p>
        </div>
        <div class="services-grid">
          <div class="service-card">
            <div class="service-icon">🎮</div>
            <h3 class="service-title">Custom Game Development</h3>
            <p class="service-description">
              Full-cycle game development from concept art to final release. We create 2D and 3D games for PC, mobile,
              and web platforms.
            </p>
          </div>
          <div class="service-card">
            <div class="service-icon">👤</div>
            <h3 class="service-title">Character Personalization</h3>
            <p class="service-description">
              Transform real photos into game characters. Put yourself, friends, or family into any game we create for a
              truly unique experience.
            </p>
          </div>
          <div class="service-card">
            <div class="service-icon">⚔️</div>
            <h3 class="service-title">Fighting Games</h3>
            <p class="service-description">
              Our specialty! We create action-packed fighting games with smooth controls, combo systems, and exciting
              special moves.
            </p>
          </div>
          <div class="service-card">
            <div class="service-icon">🏢</div>
            <h3 class="service-title">Corporate Gamification</h3>
            <p class="service-description">
              Boost team morale with custom games featuring your team members. Perfect for events, training, or just
              workplace fun.
            </p>
          </div>
          <div class="service-card">
            <div class="service-icon">🎁</div>
            <h3 class="service-title">Gift Games</h3>
            <p class="service-description">
              The ultimate personalized gift! Commission a game featuring your loved ones for birthdays, anniversaries,
              or special occasions.
            </p>
          </div>
          <div class="service-card">
            <div class="service-icon">🔧</div>
            <h3 class="service-title">Game Porting & Updates</h3>
            <p class="service-description">
              Need to port your existing game to new platforms or add features? We handle updates, optimizations, and
              cross-platform deployment.
            </p>
          </div>
        </div>
      </section>

      <!-- Why Raylib Section -->
      <section class="raylib-section">
        <div class="raylib-container">
          <div class="raylib-logo">🎯</div>
          <h2 class="raylib-title">Built with <span class="green">Raylib</span> Engine</h2>
          <p class="raylib-description">
            We chose Raylib for its simplicity, power, and flexibility. This lightweight game programming library allows
            us to create high-performance games that run smoothly across all platforms.
          </p>
          <div class="raylib-features">
            <div class="raylib-feature">
              <i class="fas fa-bolt"></i>
              <h4>Fast Performance</h4>
              <p>Optimized C code for smooth gameplay</p>
            </div>
            <div class="raylib-feature">
              <i class="fas fa-desktop"></i>
              <h4>Cross-Platform</h4>
              <p>Windows, Mac, Linux, and Web</p>
            </div>
            <div class="raylib-feature">
              <i class="fas fa-feather-alt"></i>
              <h4>Lightweight</h4>
              <p>No bloat, just what you need</p>
            </div>
            <div class="raylib-feature">
              <i class="fas fa-code-branch"></i>
              <h4>Open Source</h4>
              <p>Transparent and community-driven</p>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section">
        <h2 class="cta-title">Ready to Beat Your Boss?</h2>
        <p class="cta-description">
          Let's create your personalized game today. Contact us for a free consultation and quote!
        </p>
        <button class="btn-cta btn-contact-landing"><i class="fas fa-envelope"></i> Get Started Now</button>
      </section>

      <!-- Footer -->
      <footer class="landing-footer">
        <div class="footer-content">
          <div class="footer-brand">
            <h3>Mr Casas</h3>
            <p class="partner">& Rodrigo Escar</p>
            <p>
              We're passionate game developers dedicated to creating unique, personalized gaming experiences. Every
              project is crafted with care, creativity, and technical excellence.
            </p>
          </div>
          <div class="footer-links">
            <h4>Services</h4>
            <ul>
              <li><a href="#">Custom Games</a></li>
              <li><a href="#">Boss Fight Games</a></li>
              <li><a href="#">Character Design</a></li>
              <li><a href="#">Corporate Games</a></li>
            </ul>
          </div>
          <div class="footer-links">
            <h4>Company</h4>
            <ul>
              <li><a href="#">About Us</a></li>
              <li><a href="#">Portfolio</a></li>
              <li><a href="#">Testimonials</a></li>
              <li><a href="#">FAQ</a></li>
            </ul>
          </div>
          <div class="footer-contact">
            <h4>Contact</h4>
            <p><i class="fas fa-envelope"></i> hello@mrcasas.dev</p>
            <p><i class="fab fa-discord"></i> MrCasas#GameDev</p>
            <p><i class="fab fa-github"></i> @mrcasas-games</p>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; ${new Date().getFullYear()} Mr Casas & Rodrigo Escar. All rights reserved. Powered by Raylib.</p>
        </div>
      </footer>
    </div>
  `;
};

window.onload = () =>
  Worker.instance({
    router: RouterItemledger,
    render: async () => {
      await Css.loadThemes([CssItemledgerLight, CssItemledgerDark]);
      await TranslateCore.Init();
      await TranslateItemledger.Init();
      await Responsive.Init();
      await MenuItemledger.Render({ htmlMainBody });
      await SocketIo.Init({ channels: ElementsItemledger.Data });
      await SocketIoItemledger.Init();
      await LogInItemledger();
      await LogOutItemledger();
      await SignUpItemledger();
      await Keyboard.Init({ callBackTime: ItemledgerParams.EVENT_CALLBACK_TIME });
    },
  });
