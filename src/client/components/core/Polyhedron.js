// https://underpost.net/cube.php

import { BtnIcon } from './BtnIcon.js';
import { getId, random } from './CommonJs.js';
import { dynamicCol } from './Css.js';
import { htmls, s } from './VanillaJs.js';

const Polyhedron = {
  Tokens: {},
  Render: async function (options) {
    const id = options?.id ? options.id : getId(this.Tokens, 'polyhedron-');
    this.Tokens[id] = {};
    const config = {
      cr: [-25, -57, 90],
      ct: [0, 0, 0],
      dim: 150,
    };
    const renderTransform = () => {
      // config.cr = config.cr.map((r) => r + random(-50, 50));
      htmls(
        `.polyhedron-animation-${id}`,
        css`
          .polyhedron-${id} {
            transform: rotateX(${config.cr[0]}deg) rotateY(${config.cr[1]}deg) rotateZ(${config.cr[2]}deg)
              translateX(${config.ct[0]}px) translateY(${config.ct[1]}px) translateZ(${config.ct[2]}px);
            left: ${s(`.scene-${id}`).offsetWidth / 2 - config.dim / 2}px;
            top: ${s(`.scene-${id}`).offsetHeight / 2 - config.dim / 2}px;
          }
        `,
      );
    };
    if (this.Tokens[id].interval) clearInterval(this.Tokens[id].interval);
    this.Tokens[id].interval = setInterval(() => {
      if (s(`.polyhedron-${id}`)) s(`.polyhedron-${id}`).style.transform = renderTransform();
      else return clearInterval(this.Tokens[id].interval);
    }, 200);

    setTimeout(() => {
      s(`.polyhedron-${id}`).style.transform = renderTransform();
      s(`.polyhedron-${id}`).style.transition = `.4s`;

      s(`.btn-polyhedron-rotate-down-${id}`).onclick = () => {
        config.cr[0] += 45;
      };
      s(`.btn-polyhedron-rotate-up-${id}`).onclick = () => {
        config.cr[0] -= 45;
      };
      s(`.btn-polyhedron-rotate-left-${id}`).onclick = () => {
        config.cr[1] += 45;
      };
      s(`.btn-polyhedron-rotate-right-${id}`).onclick = () => {
        config.cr[1] -= 45;
      };
    });
    return html`
      <style>
        .scene-${id} {
          height: 500px;
          background: #c7c7c7;
          /* perspective: 10000px; */
        }
        .polyhedron-${id} {
          width: ${config.dim}px;
          height: ${config.dim}px;
          transform-style: preserve-3d;
          cursor: pointer;
        }
        .face-${id} {
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid #620000ff;
          font-size: 30px;
        }
        /* rotate Y */
        .face_front-${id} {
          transform: rotateY(0deg) translateZ(${config.dim / 2}px);
        }
        .face_back-${id} {
          transform: rotateY(-180deg) translateZ(${config.dim / 2}px);
        }
        .face_left-${id} {
          transform: rotateY(90deg) translateZ(${config.dim / 2}px);
        }
        .face_right-${id} {
          transform: rotateY(-90deg) translateZ(${config.dim / 2}px);
        }
        /* rotate X */
        .face_top-${id} {
          transform: rotateX(-90deg) translateZ(${config.dim / 2}px);
        }
        .face_bottom-${id} {
          transform: rotateX(90deg) translateZ(${config.dim / 2}px);
        }
      </style>
      <style class="polyhedron-animation-${id}"></style>

      ${dynamicCol({ containerSelector: options.idModal, id: `polyhedron-${id}` })}
      <style class="style-polyhedron-${id}-col"></style>
      <div class="fl">
        <div class="in fll polyhedron-${id}-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-arrows-spin"></i> Rotate</div>
            <div class="in">
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-polyhedron-rotate-up-${id}`,
                label: html`<i class="fa-solid fa-angle-up"></i>`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-polyhedron-rotate-down-${id}`,
                label: html`<i class="fa-solid fa-angle-down"></i>`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-polyhedron-rotate-left-${id}`,
                label: html`<i class="fa-solid fa-angle-left"></i>`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-polyhedron-rotate-right-${id}`,
                label: html`<i class="fa-solid fa-angle-right"></i>`,
              })}
            </div>
          </div>
        </div>
        <div class="in fll polyhedron-${id}-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-vector-square"></i> Render</div>
            <div class="in scene-${id}">
              <div class="abs polyhedron-${id}">
                <div class="abs face-${id} face_front-${id} ${id}-1"><div class="abs center">1</div></div>
                <div class="abs face-${id} face_bottom-${id} ${id}-2"><div class="abs center">2</div></div>
                <div class="abs face-${id} face_back-${id} ${id}-3"><div class="abs center">3</div></div>
                <div class="abs face-${id} face_top-${id} ${id}-4"><div class="abs center">4</div></div>
                <div class="abs face-${id} face_right-${id} ${id}-5"><div class="abs center">5</div></div>
                <div class="abs face-${id} face_left-${id} ${id}-6"><div class="abs center">6</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },
};

export { Polyhedron };
