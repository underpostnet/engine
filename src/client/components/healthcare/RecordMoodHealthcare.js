import { BtnIcon } from '../core/BtnIcon.js';
import { range } from '../core/CommonJs.js';
import { Css, Themes } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Modal } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';

const RecordMoodHealthcare = {
  Render: async function ({ idModal }) {
    const cellDim = 120;
    const renderStyle = (wFactorContainer) => {
      return html`<style>
        .record-mood-emotion-cell-container {
          width: ${cellDim * wFactorContainer}px;
        }
      </style>`;
    };
    setTimeout(() => {
      Modal.Data['modal-record-mood'].onObserverListener['observer'] = () => {
        if (s(`.modal-record-mood`).offsetWidth > cellDim * 3.1) {
          htmls(`.record-mood-emotion-cell-style`, renderStyle(3));
          return;
        }
        htmls(`.record-mood-emotion-cell-style`, renderStyle(2));
      };
      Modal.Data['modal-record-mood'].onObserverListener['observer']();
    });
    return html` <style>
        .record-mood-emotion-cell-container {
          margin: auto;
        }
        .record-mood-emotion-cell {
          width: ${cellDim}px;
          height: ${cellDim}px;
        }
        .record-mood-emotion-cell-img {
          width: ${cellDim * 0.9}px;
          height: ${cellDim * 0.9}px;
          box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
          border-radius: 50%;
          cursor: pointer;
          transition: 0.3s;
        }
        .record-mood-emotion-cell-img:hover {
          box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.3), 0 6px 20px 0 rgba(0, 0, 0, 0.35);
          width: ${cellDim * 0.97}px;
          height: ${cellDim * 0.97}px;
        }
      </style>
      <div class="record-mood-emotion-cell-style">${renderStyle()}</div>

      <div class="in">
        <br /><br />
        <div class="in home-h1-font-container">${Translate.Render('record-mood-title')}</div>
      </div>
      <div class="fl record-mood-emotion-cell-container">
        ${range(0, 5)
          .map((emotionIndex) => {
            const btnId = `btn-record-mood-emotion-${emotionIndex + 1}`;
            setTimeout(() => {
              EventsUI.onClick(`.${btnId}`, async () => {
                const { barConfig } = await Themes[Css.currentTheme]();
                barConfig.buttons.restore.disabled = true;
                barConfig.buttons.minimize.disabled = true;

                await Modal.Render({
                  // route: 'record-mood-' + (emotionIndex + 1),
                  id: `modal-${btnId}`,
                  barConfig,
                  title: '',
                  html: html` <style>
                      .modal-body-img-${btnId} {
                        width: 300px;
                        height: 300px;
                        box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
                        border-radius: 50%;
                        transition: 0.3s;
                      }
                      .modal-body-img-${btnId}:hover {
                        box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.3), 0 6px 20px 0 rgba(0, 0, 0, 0.35);
                      }
                      .${btnId}-thank-msg-container {
                        max-width: 300px;
                        font-size: 30px;
                        font-family: 'cursive';
                        text-align: center;
                      }
                    </style>
                    <div class="in modal-body-${btnId}">
                      <div class="abs center">
                        <img
                          class="inl modal-body-img-${btnId}"
                          src="${getProxyPath()}assets/emotions/${emotionIndex + 1}.gif"
                        />
                        <br />
                        <br />
                        <div class="inl ${btnId}-thank-msg-container">${Translate.Render('record-mood-thank')}</div>
                        <br />
                        <br />
                        ${await BtnIcon.Render({
                          label: html`${Translate.Render('add-notes')}`,
                          class: 'b0-panel-sub-container add-note-btn',
                        })}
                      </div>
                    </div>`,
                  mode: 'view',
                  slideMenu: 'modal-menu',
                  maximize: true,
                  dragDisabled: true,
                  observer: true,
                  // RouterInstance,
                });
                Modal.Data[`modal-${btnId}`].onObserverListener['observer'] = () => {
                  s(`.modal-body-${btnId}`).style.height = `${s(`.modal-${btnId}`).offsetHeight * 0.95}px`;
                };
                Modal.Data[`modal-${btnId}`].onObserverListener['observer']();
              });
            });
            return html` <div class="in fll record-mood-emotion-cell ${btnId}">
              <img
                class="abs center no-drag record-mood-emotion-cell-img"
                src="${getProxyPath()}assets/emotions/${emotionIndex + 1}.gif"
              />
            </div>`;
          })
          .join('')}
      </div>`;
  },
};

export { RecordMoodHealthcare };
