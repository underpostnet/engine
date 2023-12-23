// https://underpost.net/cube.php

import { random } from './CommonJs.js';
import { htmls, s } from './VanillaJs.js';

const Polyhedron = {
  Render: async function () {
    const config = {
      cr: [45, 45, 45],
      ct: [0, 0, 0],
      dim: 100,
    };
    const renderTransform = () => {
      config.cr = config.cr.map((r) => r + random(-50, 50));
      htmls(
        `.polyhedron-animation`,
        css`
          .polyhedron {
            transform: rotateX(${config.cr[0]}deg) rotateY(${config.cr[1]}deg) rotateZ(${config.cr[2]}deg)
              translateX(${config.ct[0]}px) translateY(${config.ct[1]}px) translateZ(${config.ct[2]}px);
            left: ${s(`.scene`).offsetWidth / 2 - config.dim / 2}px;
            top: ${s(`.scene`).offsetHeight / 2 - config.dim / 2}px;
          }
        `,
      );
    };
    this.interval = setInterval(() => {
      if (s(`.polyhedron`)) s(`.polyhedron`).style.transform = renderTransform();
      else return clearInterval(this.interval);
    }, 1500);
    setTimeout(() => {
      s(`.polyhedron`).style.transition = `1s`;
      s(`.polyhedron`).style.transform = renderTransform();
    });
    return html`
      <style>
        .scene {
          height: 500px;
          background: #c7c7c7;
          /* perspective: 10000px; */
        }
        .polyhedron {
          width: ${config.dim}px;
          height: ${config.dim}px;
          transform-style: preserve-3d;
        }
        .face {
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid #620000ff;
        }
        /* rotate Y */
        .face_front {
          transform: rotateY(0deg) translateZ(${config.dim / 2}px);
        }
        .face_back {
          transform: rotateY(-180deg) translateZ(${config.dim / 2}px);
        }
        .face_left {
          transform: rotateY(90deg) translateZ(${config.dim / 2}px);
        }
        .face_right {
          transform: rotateY(-90deg) translateZ(${config.dim / 2}px);
        }
        /* rotate X */
        .face_top {
          transform: rotateX(-90deg) translateZ(${config.dim / 2}px);
        }
        .face_bottom {
          transform: rotateX(90deg) translateZ(${config.dim / 2}px);
        }
      </style>
      <style class="polyhedron-animation"></style>
      <div class="in scene">
        <div class="abs polyhedron">
          <div class="abs face face_front"></div>
          <div class="abs face face_back"></div>
          <div class="abs face face_left"></div>
          <div class="abs face face_right"></div>
          <div class="abs face face_top"></div>
          <div class="abs face face_bottom"></div>
        </div>
      </div>
    `;
  },
};

export { Polyhedron };
