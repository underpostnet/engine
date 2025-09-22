import { BtnIcon } from '../core/BtnIcon.js';
import { getId } from '../core/CommonJs.js';
import { Css, Themes } from '../core/Css.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { listenQueryPathInstance, setQueryPath } from '../core/Router.js';
import { s } from '../core/VanillaJs.js';

const LabGalleryUnderpost = {
  Tokens: {},
  View: [
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
          const ModalId = `modal-${viewLabId}`;
          const { barConfig } = await Themes[Css.currentTheme]();
          setQueryPath({ path: 'lab-gallery', queryPath: view.path });
          await Modal.Render({
            barConfig,
            title: renderViewTitle({
              icon: html`<i class="fa-solid fa-photo-film"></i>`,
              text: view.title,
            }),
            id: ModalId,
            html: async () => {
              const url = `https://underpost.net/${view.path}`;
              return html` <iframe class="wfa iframe-gallery" src="${url}"> </iframe> `;
            },
            maximize: true,
            mode: 'view',
            slideMenu: 'modal-menu',
            query: true,
          });
        };
      });
      render += html`
        <style>
          .iframe-gallery {
            border: none;
            min-height: 400px;
          }
        </style>
        <div class="in">
          ${await BtnIcon.Render({
            class: `wfa btn-lab-gallery btn-${viewLabId}`,
            label: html`<i class="fa-solid fa-arrow-up-right-from-square"></i> &nbsp &nbsp${view.title}`,
          })}
        </div>
        <div class="in iframe-${viewLabId} hide"></div>
      `;
    }
    listenQueryPathInstance({
      id,
      routeId: 'lab-gallery',
      event: (path) => {
        const indexView = this.View.findIndex((view) => view.path === path);
        if (indexView > -1) {
          const viewLabId = `${id}-${indexView}`;
          if (s(`.btn-${viewLabId}`)) s(`.btn-${viewLabId}`).click();
        }
      },
    });

    return render;
  },
};

export { LabGalleryUnderpost };
