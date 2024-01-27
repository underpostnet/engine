import { append } from './components/core/VanillaJs.js';
import { s4 } from './components/core/CommonJs.js';

import { TestComponent } from './components/test/Test.js';
import { Css } from './components/core/Css.js';

window.Routes = () => {
  return { '/test': {} };
};

await Css.Init();
append('body', html`<strong>Main Component ${s4()}</strong>`);
await TestComponent.Init();
