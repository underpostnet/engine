import { BtnIcon } from '../core/BtnIcon.js';
import { getId } from '../core/CommonJs.js';
import { Css, Themes } from '../core/Css.js';
import { Modal } from '../core/Modal.js';
import { htmls, s } from '../core/VanillaJs.js';
import { Menu } from './Menu.js';

const LabGallery = {
  Tokens: {},
  View: [
    { title: 'UNDERPOST CUBE', path: 'cube.php' },
    { title: '3D PLOT DEMO', path: '3dplotdemo' },
    { title: 'PATH FINDING', path: 'pathfinding' },
    { title: 'SURVIVAL BALL GAME', path: 'survival' },
    { title: 'INFINITE LEVELS LABYRYNTH', path: 'laberinto' },
    { title: 'VIRTUAL ROLL DICE', path: 'dice' },
    { title: 'BOT VIRTUAL WORLD', path: 'bots' },
    { title: 'CELLULAR AUTOMATA SIMULATOR', path: 'life' },
    { title: 'VANILLAJS SNAKE', path: 'snake' },
  ],
  Render: async function () {
    const id = getId(this.Tokens, 'lab-gallery-');
    let render = '';
    let i = -1;
    for (const view of this.View) {
      i++;
      const viewLabId = `${id}-${i}`;
      setTimeout(() => {
        s(`.btn-${viewLabId}`).onclick = async () => {
          const { barConfig } = await Themes[Css.currentTheme]();
          await Modal.Render({
            barConfig,
            title: Menu.renderViewTitle({
              icon: html`<i class="fa-solid fa-photo-film"></i>`,
              text: view.title,
            }),
            id: `modal-${viewLabId}`,
            html: async () => {
              const url = `https://underpost.net/${view.path}`;
              return html` <iframe class="wfa iframe-gallery" src="${url}"> </iframe> `;
            },
            maximize: true,
            mode: 'view',
            slideMenu: 'modal-menu',
          });
        };
      });
      render += html`
        <div class="in">
          ${await BtnIcon.Render({
            class: `wfa btn-lab-gallery btn-${viewLabId}`,
            label: html`<i class="fa-solid fa-arrow-up-right-from-square"></i> &nbsp &nbsp${view.title}`,
          })}
        </div>
        <div class="in iframe-${viewLabId} hide"></div>
      `;
    }
    return render;
  },
};

export { LabGallery };
