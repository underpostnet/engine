// https://underpost.net/cube.php

import { BtnIcon } from './BtnIcon.js';
import { getId, random } from './CommonJs.js';
import { dynamicCol } from './Css.js';
import { htmls, s } from './VanillaJs.js';

// https://css-loaders.com/3d/

const Polyhedron = {
  Tokens: {},
  Render: async function (options) {
    const id = options?.id ? options.id : getId(this.Tokens, 'polyhedron-');
    if (!this.Tokens[id])
      this.Tokens[id] = {
        cr: [-25, -57, 90],
        ct: [0, 0, 0],
        dim: 150,
        interval: null,
      };
    const renderTransform = () => {
      s(
        `.polyhedron-${id}`,
      ).style.transform = `rotateX(${this.Tokens[id].cr[0]}deg) rotateY(${this.Tokens[id].cr[1]}deg) rotateZ(${this.Tokens[id].cr[2]}deg)
      translateX(${this.Tokens[id].ct[0]}px) translateY(${this.Tokens[id].ct[1]}px) translateZ(${this.Tokens[id].ct[2]}px)`;
      s(`.polyhedron-${id}`).style.left = `${s(`.scene-${id}`).offsetWidth / 2 - this.Tokens[id].dim / 2}px`;
      s(`.polyhedron-${id}`).style.top = `${s(`.scene-${id}`).offsetHeight / 2 - this.Tokens[id].dim / 2}px`;
      s(`.polyhedron-${id}`).style.width = `${this.Tokens[id].dim}px`;
      s(`.polyhedron-${id}`).style.height = `${this.Tokens[id].dim}px`;
      /* rotate Y */
      s(`.face_front-${id}`).style.transform = `rotateY(0deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_back-${id}`).style.transform = `rotateY(-180deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_left-${id}`).style.transform = `rotateY(90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_right-${id}`).style.transform = `rotateY(-90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      /* rotate X */
      s(`.face_top-${id}`).style.transform = `rotateX(-90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
      s(`.face_bottom-${id}`).style.transform = `rotateX(90deg) translateZ(${this.Tokens[id].dim / 2}px)`;
    };
    if (this.Tokens[id].interval) clearInterval(this.Tokens[id].interval);
    this.Tokens[id].interval = setInterval(() => {
      if (s(`.polyhedron-${id}`)) renderTransform();
      else return clearInterval(this.Tokens[id].interval);
    }, 200);

    setTimeout(() => {
      renderTransform();
      s(`.polyhedron-${id}`).style.transition = `.4s`;

      s(`.btn-polyhedron-rotate-down-${id}`).onclick = () => {
        this.Tokens[id].cr[0] += 45;
      };
      s(`.btn-polyhedron-rotate-up-${id}`).onclick = () => {
        this.Tokens[id].cr[0] -= 45;
      };
      s(`.btn-polyhedron-rotate-left-${id}`).onclick = () => {
        this.Tokens[id].cr[1] += 45;
      };
      s(`.btn-polyhedron-rotate-right-${id}`).onclick = () => {
        this.Tokens[id].cr[1] -= 45;
      };

      s(`.btn-polyhedron-add-zoom-${id}`).onclick = () => {
        this.Tokens[id].dim += 25;
      };
      s(`.btn-polyhedron-remove-zoom-${id}`).onclick = () => {
        this.Tokens[id].dim -= 25;
      };
    });
    return html`
      <style>
        .scene-${id} {
          height: 500px;
          background: #c7c7c7;
          overflow: hidden;
          /* perspective: 10000px; */
        }
        .polyhedron-${id} {
          transform-style: preserve-3d;
          cursor: pointer;
        }
        .face-${id} {
          width: 100%;
          height: 100%;
        }

        ${options?.style?.face
          ? css`
              .face-${id} {
                ${Object.keys(options.style.face)
                  .map((styleKey) => `${styleKey} : ${options.style.face[styleKey]};`)
                  .join('')}
              }
            `
          : css``}
          ${options?.style?.scene
          ? css`
              .scene-${id} {
                ${Object.keys(options.style.scene)
                  .map((styleKey) => `${styleKey} : ${options.style.scene[styleKey]};`)
                  .join('')}
              }
            `
          : css``}
      </style>
      <!--
      <style class="polyhedron-animation-${id}"></style>
      -->

      ${dynamicCol({ containerSelector: options.idModal, id: `polyhedron-${id}` })}
      <div class="fl">
        <div class="in fll polyhedron-${id}-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-arrows-spin"></i> Rotate</div>
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

            <div class="in sub-title-modal"><i class="fa-solid fa-magnifying-glass"></i> Zoom</div>
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-add-zoom-${id}`,
              label: html`<i class="fa-solid fa-plus"></i>`,
            })}
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-polyhedron-remove-zoom-${id}`,
              label: html`<i class="fa-solid fa-minus"></i>`,
            })}
          </div>
        </div>
        <div class="in fll polyhedron-${id}-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-vector-square"></i> Render</div>
            <div class="in scene-${id}">
              <div class="abs polyhedron-${id}">
                <div class="abs face-${id} face_front-${id} ${id}-0"><div class="abs center">1</div></div>
                <div class="abs face-${id} face_bottom-${id} ${id}-1"><div class="abs center">2</div></div>
                <div class="abs face-${id} face_back-${id} ${id}-2"><div class="abs center">3</div></div>
                <div class="abs face-${id} face_top-${id} ${id}-3"><div class="abs center">4</div></div>
                <div class="abs face-${id} face_right-${id} ${id}-4"><div class="abs center">5</div></div>
                <div class="abs face-${id} face_left-${id} ${id}-5"><div class="abs center">6</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },
};

export { Polyhedron };
