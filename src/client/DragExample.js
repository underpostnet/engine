// https://www.npmjs.com/package/@neodrag/vanilla

import { Draggable } from '@neodrag/vanilla';
import { append, s } from './components/core/VanillaJs.js';
import { Css } from './components/core/Css.js';

await Css.Init();
append(
  'body',
  html`
    <style>
      ${css`
        .drag-container {
          width: 200px;
          height: 200px;
          background: red;
          border: 2px solid black;
          font-size: 20px;
          color: white;
          top: 15px;
          left: 15px;
          cursor: pointer;
          font-family: arial;
          font-weight: bold;
        }
      `}
    </style>
    <div class="abs drag-container">
      <div class="abs center">Drag Me!</div>
    </div>
  `
);

const dragInstance = new Draggable(s('.drag-container'));
