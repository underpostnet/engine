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

// Initialize theme variables
let currentTheme = darkTheme ? 'dark' : 'light';

// Theme toggle function
const toggleTheme = () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);
  // Trigger theme change event
  ThemeEvents['lading-handle-theme-event']?.();
};

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || (darkTheme ? 'dark' : 'light');
  currentTheme = savedTheme;
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Set initial theme toggle state
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.checked = currentTheme === 'dark';
  }
});

// Listen for theme changes from other components
ThemeEvents['lading-handle-theme-event'] = () => {
  const root = document.documentElement;
  const isDark = currentTheme === 'dark';

  // Update CSS variables based on theme
  if (isDark) {
    root.style.setProperty('--primary-color', '#5d7ff3');
    root.style.setProperty('--secondary-color', '#1a1a2e');
    root.style.setProperty('--text-color', '#f0f0f0');
    root.style.setProperty('--light-text', '#a0a0a0');
    root.style.setProperty('--bg-color', '#0f0f1a');
    root.style.setProperty('--card-bg', '#1a1a2e');
    root.style.setProperty('--footer-bg', '#0d0d1a');
  } else {
    root.style.setProperty('--primary-color', '#4a6ee0');
    root.style.setProperty('--secondary-color', '#f8f9fa');
    root.style.setProperty('--text-color', '#333333');
    root.style.setProperty('--light-text', '#6c757d');
    root.style.setProperty('--bg-color', '#ffffff');
    root.style.setProperty('--card-bg', '#ffffff');
    root.style.setProperty('--footer-bg', '#f8f9fa');
  }
};

const htmlMainBody = async () => {
  return html`
    <div class="landing-page">
      <!-- Theme Toggle -->
      <div class="theme-toggle-container">
        <label class="theme-toggle" title="Toggle theme">
          <input type="checkbox" id="theme-toggle" onchange="toggleTheme()" />
          <span class="slider">
            <span class="sun">☀️</span>
            <span class="moon">🌙</span>
          </span>
        </label>
      </div>
      <!-- Hero Section -->
      <header class="hero">
        <div class="hero-content">
          <h1>Welcome to Our Platform</h1>
          <p class="lead">Experience the next generation of web applications with our powerful PWA solution.</p>
          <div class="cta-buttons">
            <button class="btn btn-primary" id="getStartedBtn">Get Started</button>
            <button class="btn btn-outline" id="learnMoreBtn">Learn More</button>
          </div>
        </div>
        <div class="hero-image">
          <img src="/assets/images/hero-illustration.svg" alt="App Illustration" class="img-fluid" />
        </div>
      </header>

      <!-- Features Section -->
      <section class="features">
        <h2>Why Choose Us</h2>
        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon">🚀</div>
            <h3>Lightning Fast</h3>
            <p>Optimized for performance and speed.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📱</div>
            <h3>Fully Responsive</h3>
            <p>Works on all devices and screen sizes.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🔒</div>
            <h3>Secure</h3>
            <p>Your data is always protected.</p>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section">
        <h2>Ready to Get Started?</h2>
        <p>Join thousands of satisfied users today.</p>
        <button class="btn btn-primary btn-lg">Sign Up Now</button>
      </section>

      <!-- Footer -->
      <footer class="footer">
        <div class="footer-content">
          <div class="footer-section">
            <h3>About Us</h3>
            <p>Building the future of web applications with cutting-edge technology and user-centric design.</p>
          </div>
          <div class="footer-section">
            <h3>Quick Links</h3>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><a href="#blog">Blog</a></li>
            </ul>
          </div>
          <div class="footer-section">
            <h3>Connect With Us</h3>
            <div class="social-links">
              <a href="#" aria-label="Twitter"><i class="fab fa-twitter"></i></a>
              <a href="#" aria-label="GitHub"><i class="fab fa-github"></i></a>
              <a href="#" aria-label="LinkedIn"><i class="fab fa-linkedin"></i></a>
              <a href="#" aria-label="Discord"><i class="fab fa-discord"></i></a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
          <div class="footer-links">
            <a href="#privacy">Privacy Policy</a>
            <span>•</span>
            <a href="#terms">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>

    <style>
      /* Theme variables */
      :root[data-theme='light'] {
        --primary-color: #4a6ee0;
        --secondary-color: #f8f9fa;
        --text-color: #333333;
        --light-text: #6c757d;
        --bg-color: #ffffff;
        --card-bg: #ffffff;
        --footer-bg: #f8f9fa;
        --border-color: #e0e0e0;
      }

      :root[data-theme='dark'] {
        --primary-color: #5d7ff3;
        --secondary-color: #1a1a2e;
        --text-color: #f0f0f0;
        --light-text: #a0a0a0;
        --bg-color: #0f0f1a;
        --card-bg: #1a1a2e;
        --footer-bg: #0d0d1a;
        --border-color: #2a2a3a;
      }

      :host {
        --primary-color: #4a6ee0;
        --secondary-color: #f8f9fa;
        --text-color: #333;
        --light-text: #6c757d;
      }

      /* Theme Toggle Styles */
      .theme-toggle-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
      }

      .theme-toggle {
        position: relative;
        display: inline-block;
        width: 60px;
        height: 30px;
      }

      .theme-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--card-bg);
        transition: 0.4s;
        border-radius: 34px;
        border: 1px solid var(--border-color);
      }

      .slider:before {
        position: absolute;
        content: '';
        height: 22px;
        width: 22px;
        left: 4px;
        bottom: 3px;
        background-color: var(--primary-color);
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
        color: var(--text-color);
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
        color: var(--primary-color);
      }

      .lead {
        font-size: 1.25rem;
        color: var(--light-text);
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
        cursor: pointer;
        transition: all 0.3s ease;
        border: 2px solid transparent;
      }

      .btn-primary {
        background-color: var(--primary-color);
        color: white;
      }

      .btn-outline {
        background-color: transparent;
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
        background: var(--card-bg);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--border-color);
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
        color: var(--primary-color);
      }

      /* Footer Styles */
      .footer {
        background-color: var(--footer-bg);
        color: var(--text-color);
        padding: 3rem 1rem;
        margin-top: 4rem;
        border-top: 1px solid var(--border-color);
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
        color: var(--primary-color);
        margin-bottom: 1.5rem;
        font-size: 1.2rem;
      }

      .footer-section p,
      .footer-section a {
        color: var(--light-text);
        line-height: 1.8;
        transition: color 0.3s ease;
      }

      .footer-section a:hover {
        color: var(--primary-color);
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
        background-color: var(--card-bg);
        color: var(--primary-color);
        transition: all 0.3s ease;
      }

      .social-links a:hover {
        background-color: var(--primary-color);
        color: white;
        transform: translateY(-3px);
      }

      .footer-bottom {
        max-width: 1200px;
        margin: 2rem auto 0;
        padding-top: 2rem;
        border-top: 1px solid var(--border-color);
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        color: var(--light-text);
        font-size: 0.9rem;
      }

      .footer-links {
        display: flex;
        gap: 1rem;
        align-items: center;
      }

      .footer-links a {
        color: var(--light-text);
        transition: color 0.3s ease;
      }

      .footer-links a:hover {
        color: var(--primary-color);
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
        background: linear-gradient(135deg, var(--secondary-color) 0%, var(--card-bg) 100%);
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
      await MenuNexodev.Render();
      await SocketIo.Init({ channels: ElementsNexodev.Data });
      await SocketIoNexodev.Init();
      await LogInNexodev();
      await LogOutNexodev();
      await SignUpNexodev();
      await Scroll.pullTopRefresh();
      await Keyboard.Init({ callBackTime: NexodevParams.EVENT_CALLBACK_TIME });
    },
  });
