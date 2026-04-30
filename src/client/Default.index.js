'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterDefault } from './components/default/RouterDefault.js';
import { AppShellDefault } from './components/default/AppShellDefault.js';
import { AppStoreDefault } from './components/default/AppStoreDefault.js';
import { SocketIoDefault } from './components/default/SocketIoDefault.js';
import { LogInDefault } from './components/default/LogInDefault.js';
import { LogOutDefault } from './components/default/LogOutDefault.js';
import { SignUpDefault } from './components/default/SignUpDefault.js';
import { CssDefaultDark, CssDefaultLight } from './components/default/CssDefault.js';
import { TranslateDefault } from './components/default/TranslateDefault.js';
import { EventsUI } from './components/core/EventsUI.js';
const DefaultTemplate = async () => {
  setTimeout(() => {
    EventsUI.onClick('.get-started-button', (e) => {
      e.preventDefault();
      location.href = `https://www.nexodev.org/docs/?cid=src`;
    });
  });
  return html`
    <div class="landing-container">
      <div class="content-wrapper">
        <h1 class="animated-text">
          <span class="greeting">Hello, World!</span>
          <span class="subtitle">Welcome to Our Platform</span>
        </h1>
        <div class="features">
          <div class="feature-card">
            <i class="icon">🚀</i>
            <h3>Fast &amp; Reliable</h3>
            <p>Lightning-fast performance with 99.9% uptime</p>
          </div>
          <div class="feature-card">
            <i class="icon">🎨</i>
            <h3>Beautiful UI</h3>
            <p>Modern and intuitive user interface</p>
          </div>
          <div class="feature-card">
            <i class="icon">⚡</i>
            <h3>Powerful Features</h3>
            <p>Everything you need in one place</p>
          </div>
        </div>
        <button class="cta-button get-started-button">
          Get Started
          <span class="button-icon">→</span>
        </button>
      </div>
    </div>
  `;
};

const CssDefaultThemes = [CssDefaultDark, CssDefaultLight];

window.onload = () =>
  Worker.instance({
    router: RouterDefault,
    template: DefaultTemplate,
    themes: CssDefaultThemes,
    translate: TranslateDefault,
    render: AppShellDefault,
    appStore: AppStoreDefault,
    socketPath: '/',
    session: {
      socket: SocketIoDefault,
      login: LogInDefault,
      signout: LogOutDefault,
      signup: SignUpDefault,
    },
  });
