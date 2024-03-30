import { BlockChainService } from '../../services/blockchain/blockchain.service.js';
import { BtnIcon } from './BtnIcon.js';
import { dynamicCol } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { Input } from './Input.js';
import { Translate } from './Translate.js';

const BlockChainManagement = {
  Render: async function (options) {
    setTimeout(() => {
      EventsUI.onClick(`.btn-upload-blockchain`, async () => {
        // const { result, status } = new BlockChainService.post();
      });
    });
    return html` ${dynamicCol({ containerSelector: options.idModal, id: 'blockchain' })}
      <div class="fl">
        <div class="in fll blockchain-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-sliders"></i> ${Translate.Render('config')}</div>
            <div class="in">
              ${await Input.Render({
                id: `blockchain-seed`,
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('blockchain-seed')}`,
                containerClass: 'section-mp width-mini-box input-container',
                placeholder: true,
              })}
              ${await BtnIcon.Render({
                class: `section-mp btn-custom btn-upload-blockchain`,
                label: html`<i class="fas fa-plus"></i> ${Translate.Render(`create`)}`,
              })}
            </div>
          </div>
        </div>
        <div class="in fll blockchain-col-b">
          <div class="in section-mp"></div>
        </div>
      </div>`;
  },
};

export { BlockChainManagement };
