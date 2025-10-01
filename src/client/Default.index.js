'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInDefault } from './components/default/LogInDefault.js';
import { LogOutDefault } from './components/default/LogOutDefault.js';
import { SignUpDefault } from './components/default/SignUpDefault.js';
import { MenuDefault } from './components/default/MenuDefault.js';
import { RouterDefault } from './components/default/RoutesDefault.js';
import { TranslateDefault } from './components/default/TranslateDefault.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { DefaultParams } from './components/default/CommonDefault.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoDefault } from './components/default/SocketIoDefault.js';
import { ElementsDefault } from './components/default/ElementsDefault.js';
import { CssDefaultDark, CssDefaultLight } from './components/default/CssDefault.js';
import { EventsUI } from './components/core/EventsUI.js';
import { Modal } from './components/core/Modal.js';

const htmlMainBody = async () => {
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
            <h3>Fast & Reliable</h3>
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

window.onload = () =>
  Worker.instance({
    router: RouterDefault,
    render: async () => {
      await Css.loadThemes([CssDefaultLight, CssDefaultDark]);
      await TranslateCore.Init();
      await TranslateDefault.Init();
      await Responsive.Init();
      await MenuDefault.Render({ htmlMainBody });
      await SocketIo.Init({
        channels: ElementsDefault.Data,
        path: `/`,
      });
      await SocketIoDefault.Init();
      await LogInDefault();
      await LogOutDefault();
      await SignUpDefault();
      await Keyboard.Init({ callBackTime: DefaultParams.EVENT_CALLBACK_TIME });
      await Modal.RenderSeoSanitizer();
    },
  });
