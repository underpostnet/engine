import { SocketIo } from './components/core/SocketIo.js';
import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';
import { Modal } from './components/core/Modal.js';
import { BtnIcon } from './components/core/BtnIcon.js';
import { Translate } from './components/core/Translate.js';
import { ColorPalette } from './components/core/ColorPalette.js';
import { s } from './components/core/VanillaJs.js';
import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { newInstance } from './components/core/CommonJs.js';
import { ToggleSwitch } from './components/core/ToggleSwitch.js';
import { DropDown } from './components/core/DropDown.js';

import { Pixi } from './components/cyberia/Pixi.js';
import { Elements } from './components/cyberia/Elements.js';
import { Event } from './components/cyberia/Event.js';
import { Matrix } from './components/cyberia/Matrix.js';
import { TranslateCyberia } from './components/cyberia/TranslateCyberia.js';
import { Settings } from './components/cyberia/Settings.js';
import { TranslateCore } from './components/core/TranslateCore.js';
import { FullScreen } from './components/core/FullScreen.js';

await Css.Init();
await Css.fontawesome();
// await Css.default();
await Css['dark-light']();
await Css.retro();
await Css.cyberia();

await TranslateCore.Init();
await TranslateCyberia.Init();

const barButtonsIconEnabled = true;

const barConfig = {
  buttons: {
    close: {
      disabled: false,
      label: !barButtonsIconEnabled
        ? false
        : html`<img class="inl bar-default-modal-icon" src="${location.pathname}assets/icons/close.png" />`,
    },
    maximize: {
      disabled: false,
      label: !barButtonsIconEnabled
        ? false
        : html`<img class="inl bar-default-modal-icon" src="${location.pathname}assets/icons/maximize.png" />`,
    },
    minimize: {
      disabled: false,
      label: !barButtonsIconEnabled
        ? false
        : html`<img class="inl bar-default-modal-icon" src="${location.pathname}assets/icons/minimize.png" />`,
    },
    restore: {
      disabled: false,
      label: !barButtonsIconEnabled
        ? false
        : html`<img class="inl bar-default-modal-icon" src="${location.pathname}assets/icons/restore.png" />`,
    },
    menu: {
      disabled: false,
      label: !barButtonsIconEnabled
        ? false
        : html`<img class="inl bar-default-modal-icon" src="${location.pathname}assets/icons/menu.png" />`,
    },
  },
};

await SocketIo.Init({
  channels: Elements.Data,
});
await Keyboard.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await Elements.Init();
await Pixi.Init();
await Responsive.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await FullScreen.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await Matrix.InitCamera();

await NotificationManager.RenderBoard();

const barConfigModalMenu = newInstance(barConfig);
barConfigModalMenu.buttons.close.disabled = true;

await Modal.Render({
  id: 'modal-menu',
  html: `
  ${await BtnIcon.Render({ class: 'main-btn-bag', label: Translate.Render('bag') })}
  ${await BtnIcon.Render({ class: 'main-btn-colors', label: Translate.Render('pallet-colors') })}
  ${await BtnIcon.Render({ class: 'main-btn-settings', label: Translate.Render('settings') })}
  `,
  barConfig: barConfigModalMenu,
  title: 'menu',
  style: {
    top: '5px',
    left: '5px',
  },
});

// ${await ToggleSwitch.Render()}
// ${await ToggleSwitch.Render({
//   checked: true,
//   on: {
//     unchecked: () => console.log('uncheck'),
//     checked: () => console.log('checked'),
//   },
// })}
// ${await ToggleSwitch.Render()}
// ${await DropDown.Render({
//   head: {
//     value: 'Select option',
//     onClick: function () {
//       console.log('DropDown onClick', this.value);
//     },
//   },
//   list: [
//     {
//       value: 'a',
//       onClick: function () {
//         console.log('DropDown onClick', this.value);
//       },
//     },
//     {
//       value: 'b',
//       onClick: function () {
//         console.log('DropDown onClick', this.value);
//       },
//     },
//   ],
// })}
// ${await DropDown.Render({
//   head: {
//     value: 'Select option',
//     onClick: function () {
//       console.log('DropDown onClick', this.value);
//     },
//   },
//   list: [
//     {
//       value: 'c',
//       onClick: function () {
//         console.log('DropDown onClick', this.value);
//       },
//     },
//     {
//       value: 'd',
//       onClick: function () {
//         console.log('DropDown onClick', this.value);
//       },
//     },
//   ],
// })}

s(`.main-btn-settings`).onclick = async () =>
  await Modal.Render({
    id: 'modal-settings',
    barConfig,
    title: Translate.Render('settings'),
    html: await Settings.Render(),
  });

s(`.main-btn-bag`).onclick = async () =>
  await Modal.Render({ id: 'modal-bag', barConfig, title: Translate.Render('bag') });

const barConfigNotificationPalletColor = newInstance(barConfig);
barConfigNotificationPalletColor.buttons.maximize.disabled = true;
barConfigNotificationPalletColor.buttons.minimize.disabled = true;
barConfigNotificationPalletColor.buttons.restore.disabled = true;
barConfigNotificationPalletColor.buttons.menu.disabled = true;

s(`.main-btn-colors`).onclick = async () =>
  await Modal.Render({
    id: 'modal-pallet-colors',
    barConfig,
    title: Translate.Render('pallet-colors'),
    html: ColorPalette.Render({ barConfig: barConfigNotificationPalletColor }),
  });
