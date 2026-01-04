import { getId, isValidDate, newInstance } from './CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Validator } from '../core/Validator.js';
import { Input } from '../core/Input.js';
import { darkTheme, ThemeEvents, subThemeManager, lightenHex, darkenHex } from './Css.js';
import { append, copyData, getDataFromInputFile, htmls, s, sa } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Translate } from './Translate.js';
import { DropDown } from './DropDown.js';
import { dynamicCol } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { RichText } from './RichText.js';
import { loggerFactory } from './Logger.js';
import { Badge } from './Badge.js';
import { Content } from './Content.js';
import { DocumentService } from '../../services/document/document.service.js';
import { NotificationManager } from './NotificationManager.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';

const logger = loggerFactory(import.meta);

const Panel = {
  Tokens: {},
  Render: async function (
    options = {
      idPanel: '',
      parentIdModal: '',
      scrollClassContainer: '',
      htmlFormHeader: async () => '',
      formData: [],
      data: [],
      originData: () => [],
      filesData: () => [],
      onClick: () => {},
      share: {
        copyLink: false,
      },
      showCreatorProfile: false,
    },
  ) {
    const idPanel = options?.idPanel ? options.idPanel : getId(this.Tokens, `${idPanel}-`);
    if (options.formData)
      options.formData = options.formData.map((formObj) => {
        formObj.id = `${idPanel}-${formObj.id}`;
        return formObj;
      });
    const { scrollClassContainer, formData, data } = options;

    const titleObj = formData.find((f) => f.panel && f.panel.type === 'title');
    const titleKey = titleObj ? titleObj.model : '';

    const subTitleObj = formData.find((f) => f.panel && f.panel.type === 'subtitle');
    const subTitleKey = subTitleObj ? subTitleObj.model : '';

    const fileNameInputExtDefaultContent = html` <div class="abs center">
      <i style="font-size: 25px" class="fa-solid fa-cloud"></i>
    </div>`;

    const openPanelForm = () => {
      s(`.${idPanel}-form-body`).classList.remove('hide');
      s(`.btn-${idPanel}-add`).classList.add('hide');
      // s(`.${scrollClassContainer}`).style.overflow = 'hidden';
      if (options.customButtons) {
        let customBtnIndex = -1;
        for (const dataBtn of options.customButtons) {
          customBtnIndex++;
          const customBtnIndexFn = customBtnIndex;
          const btnSelector = `btn-${idPanel}-custom${customBtnIndexFn}`;
          s(`.${btnSelector}`).classList.add('hide');
        }
      }
      setTimeout(() => {
        s(`.${idPanel}-form-body`).style.opacity = 1;
      });
    };

    const renderPanel = async (payload) => {
      const obj = newInstance(payload);
      if ('_id' in obj) obj.id = obj._id;
      const { id } = obj;

      setTimeout(async () => {
        if (!s(`.${idPanel}`)) return;
        LoadingAnimation.spinner.play(`.${idPanel}-img-spinner-${id}`, 'dual-ring');
        if (options && options.callBackPanelRender)
          await options.callBackPanelRender({
            data: obj,
            fileRender: async (options = { file: '', style: {}, class: '' }) => {
              await Content.RenderFile({ container: `.${idPanel}-cell-col-a-${id}`, ...options });
              s(`.${idPanel}-img-spinner-${id}`).classList.add('hide');
            },
            htmlRender: async ({ render }) => {
              htmls(`.${idPanel}-cell-col-a-${id}`, render);
            },
          });
        if (options.share && options.share.copyLink) {
          EventsUI.onClick(
            `.${idPanel}-btn-copy-share-${id}`,
            async (e) => {
              try {
                const shareUrl = `${window.location.origin}${window.location.pathname}?cid=${obj._id}`;
                await copyData(shareUrl);
                await NotificationManager.Push({
                  status: 'success',
                  html: html`<div>${Translate.Render('link-copied')}</div>`,
                });
                // Track the copy share link event
                await DocumentService.patch({ id: obj._id, action: 'copy-share-link' });
                // Update the count in the UI - read current value from span first
                const countSpan = s(`.${idPanel}-share-count-${id}`);
                if (countSpan) {
                  const currentCount = parseInt(countSpan.textContent) || 0;
                  const newCount = currentCount + 1;
                  htmls(`.${idPanel}-share-count-${id}`, newCount);
                } else {
                  // Create count badge if it didn't exist before (was 0)
                  const btn = s(`.${idPanel}-btn-copy-share-${id}`);
                  if (btn) {
                    const countBadge = document.createElement('span');
                    countBadge.className = `${idPanel}-share-count-${id}`;
                    countBadge.style.cssText =
                      'position: absolute; top: -4px; right: -4px; background: #666; color: white; border-radius: 10px; padding: 1px 5px; font-size: 10px; font-weight: bold; min-width: 16px; text-align: center;';
                    countBadge.textContent = '1';
                    btn.appendChild(countBadge);
                  }
                }
              } catch (error) {
                logger.error('Error copying share link:', error);
                await NotificationManager.Push({
                  status: 'error',
                  html: html`<div>${Translate.Render('error-copying-link')}</div>`,
                });
              }
            },
            { context: 'modal' },
          );

          // Add tooltip hover effect
          setTimeout(() => {
            const btn = s(`.${idPanel}-btn-copy-share-${id}`);
            const tooltip = s(`.${idPanel}-share-tooltip-${id}`);
            if (btn && tooltip) {
              btn.addEventListener('mouseenter', () => {
                tooltip.style.opacity = '1';
              });
              btn.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
              });
            }
          });
        }
        EventsUI.onClick(
          `.${idPanel}-btn-delete-${id}`,
          async (e) => {
            logger.warn('delete', obj);
            const { status } = await options.on.remove({ e, data: obj });
            if (status === 'error') return;
            if (s(`.${idPanel}-${id}`)) s(`.${idPanel}-${id}`).remove();
          },
          { context: 'modal' },
        );
        EventsUI.onClick(`.${idPanel}-btn-edit-${id}`, async () => {
          logger.warn('edit', obj);
          const searchId = String(obj._id || obj.id);

          if (obj._id) Panel.Tokens[idPanel].editId = obj._id;
          else if (obj.id) Panel.Tokens[idPanel].editId = obj.id;

          s(`.btn-${idPanel}-label-edit`).classList.remove('hide');
          s(`.btn-${idPanel}-label-add`).classList.add('hide');

          openPanelForm();
          // s(`.${scrollClassContainer}`).scrollTop = 0;
          const originData = options.originData();
          const filesData = options.filesData();

          // Convert IDs to strings for comparison to handle ObjectId vs string issues
          const foundOrigin = originData.find((d) => String(d._id || d.id) === searchId);
          const foundFiles = filesData.find((d) => String(d._id || d.id) === searchId);

          if (!foundOrigin) {
            logger.error('Could not find origin data for ID:', searchId);
            logger.error(
              'Available originData IDs:',
              originData.map((d) => String(d._id || d.id)),
            );
          }

          if (!foundFiles) {
            logger.error('Could not find files data for ID:', searchId);
            logger.error(
              'Available filesData IDs:',
              filesData.map((d) => String(d._id || d.id)),
            );
          }

          // Clear previous form values then populate with the current item's data
          Input.cleanValues(formData);
          Input.setValues(formData, obj, foundOrigin, foundFiles);
          if (options.on.initEdit) await options.on.initEdit({ data: obj });
        });
        s(`.a-${payload._id}`).onclick = async (e) => {
          e.preventDefault();
          if (options.onClick) await options.onClick({ payload });
        };
        s(`.container-${idPanel}-${id}`).onclick = async (e) => {
          e.preventDefault();
          // if (options.onClick) await options.onClick({ payload });
        };

        // Add theme change handler for creator profile header
        if (options.showCreatorProfile && obj.userInfo) {
          const updateCreatorProfileTheme = () => {
            const profileHeader = s(`.creator-profile-header-${id}`);
            if (profileHeader) {
              profileHeader.style.borderBottom = `1px solid ${darkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`;
              profileHeader.style.background = `${darkTheme ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}`;

              // Update avatar border if it's an image
              const avatarImg = profileHeader.querySelector('.creator-avatar');
              if (avatarImg && avatarImg.tagName === 'IMG') {
                avatarImg.style.border = `2px solid ${darkTheme ? 'rgba(102, 126, 234, 0.5)' : 'rgba(102, 126, 234, 0.3)'}`;
              }

              // Update username color
              const username = profileHeader.querySelector('.creator-username');
              if (username) {
                username.style.color = `${darkTheme ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)'}`;
              }

              // Update "Creator" label color
              const creatorLabel = username?.nextElementSibling;
              if (creatorLabel) {
                creatorLabel.style.color = `${darkTheme ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'}`;
              }
            }
          };

          // Register theme change handler
          const profileThemeHandlerId = `${id}-creator-profile-theme`;
          ThemeEvents[profileThemeHandlerId] = updateCreatorProfileTheme;
        }
      });
      if (s(`.${idPanel}-${id}`)) s(`.${idPanel}-${id}`).remove();

      // Check if document is public (from obj.isPublic field)
      const isPublic = obj.isPublic === true;
      // Visibility icon: globe for public, padlock for private
      const visibilityIcon = isPublic
        ? '<i class="fas fa-globe" title="Public document"></i>'
        : '<i class="fas fa-lock" title="Private document"></i>';

      return html` <div class="in box-shadow ${idPanel} ${idPanel}-${id}" style="position: relative;">
        <div class="fl ${idPanel}-tools session-fl-log-in  ${obj.tools ? '' : 'hide'}">
          ${await BtnIcon.Render({
            class: `in flr main-btn-menu action-bar-box ${idPanel}-btn-tool ${idPanel}-btn-delete-${id}`,
            label: html`<div class="abs center"><i class="fas fa-trash"></i></div>`,
            useVisibilityHover: true,
            tooltipHtml: await Badge.Render({
              id: `tooltip-${idPanel}-${id}`,
              text: `${Translate.Render(`delete`)}`,
              classList: '',
              style: { top: `-22px`, left: '-13px' },
            }),
          })}
          ${await BtnIcon.Render({
            class: `in flr main-btn-menu action-bar-box ${idPanel}-btn-tool ${idPanel}-btn-edit-${id}`,
            label: html`<div class="abs center"><i class="fas fa-edit"></i></div>`,
            useVisibilityHover: true,
            tooltipHtml: await Badge.Render({
              id: `tooltip-${idPanel}-${id}`,
              text: `${Translate.Render(`edit`)}`,
              classList: '',
              style: { top: `-22px`, left: '-5px' },
            }),
          })}
        </div>
        <div class="in container-${idPanel}-${id}">
          <div class="panel-visibility-icon">${visibilityIcon}</div>
          ${options.showCreatorProfile && obj.userInfo
            ? html`<div
                class="creator-profile-header creator-profile-header-${id}"
                style="padding: 10px 12px; margin-bottom: 10px; border-bottom: 1px solid ${darkTheme
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(0,0,0,0.08)'}; display: flex; align-items: center; gap: 10px; background: ${darkTheme
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(0,0,0,0.02)'}; border-radius: 4px 4px 0 0;"
              >
                ${obj.userInfo.profileImageId && obj.userInfo.profileImageId._id
                  ? html`<img
                      class="creator-avatar"
                      src="${getApiBaseUrl({ id: obj.userInfo.profileImageId._id, endpoint: 'file/blob' })}"
                      alt="${obj.userInfo.username || obj.userInfo.email}"
                      style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid ${darkTheme
                        ? 'rgba(102, 126, 234, 0.5)'
                        : 'rgba(102, 126, 234, 0.3)'}; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15);"
                      title="${obj.userInfo.email || obj.userInfo.username}"
                    />`
                  : html`<div
                      class="creator-avatar"
                      style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15);"
                      title="${obj.userInfo.email || obj.userInfo.username}"
                    >
                      ${(obj.userInfo.username || obj.userInfo.email || 'U').charAt(0).toUpperCase()}
                    </div>`}
                <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                  <span
                    class="creator-username"
                    style="font-size: 14px; font-weight: 600; color: ${darkTheme
                      ? 'rgba(255,255,255,0.9)'
                      : 'rgba(0,0,0,0.85)'}; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                  >
                    ${obj.userInfo.username || obj.userInfo.email || 'Unknown'}
                  </span>
                  <span
                    style="font-size: 11px; color: ${darkTheme
                      ? 'rgba(255,255,255,0.5)'
                      : 'rgba(0,0,0,0.45)'}; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;"
                    >Uploader</span
                  >
                </div>
              </div>`
            : ''}
          <div class="in ${idPanel}-head">
            <div class="in ${idPanel}-title">
              ${options.titleIcon}
              <a href="?cid=${payload._id}" class="a-title-${idPanel} a-${payload._id}">
                ${titleKey ? obj[titleKey] : ''}</a
              >
            </div>
            <div class="in ${idPanel}-subtitle">
              ${subTitleKey ? obj[subTitleKey] : ''} <span class="tag-render-${id}"></span>
            </div>
            <!--  <div class="in ${idPanel}-tags"></div> -->
          </div>
          <div class="fl">
            <div class="in fll ${idPanel}-cell ${idPanel}-cell-col-a ${idPanel}-cell-col-a-${id}">
              <div class="abs center ${idPanel}-img-spinner-${id}"></div>
            </div>
            <div class="in fll ${idPanel}-cell ${idPanel}-cell-col-b">
              ${Object.keys(obj)
                .map((infoKey) => {
                  if (infoKey === 'id') return html``;
                  const formObjData = formData.find((f) => f.model === infoKey);
                  const valueIcon = formObjData?.panel?.icon?.value ? formObjData.panel.icon.value : '';
                  const keyIcon = formObjData?.panel?.icon?.key ? formObjData.panel.icon.key : '';

                  if (formObjData && ['datetime-local'].includes(formObjData.inputType) && isValidDate(obj[infoKey])) {
                    obj[infoKey] = `${obj[infoKey]}`.replace('T', ' ').replace('.000Z', '');
                  }

                  if (formData.find((f) => f.model === infoKey && f.panel && f.panel.type === 'tags')) {
                    // Function to render tags with current theme
                    const renderTags = async () => {
                      let tagRender = html``;
                      for (const tag of obj[infoKey]) {
                        // Use subThemeManager colors for consistent theming
                        const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
                        const hasThemeColor = themeColor && themeColor !== null;

                        let tagBg, tagColor;
                        if (darkTheme) {
                          tagBg = hasThemeColor ? darkenHex(themeColor, 0.6) : '#4a4a4a';
                          tagColor = hasThemeColor ? lightenHex(themeColor, 0.7) : '#ffffff';
                        } else {
                          tagBg = hasThemeColor ? lightenHex(themeColor, 0.7) : '#a2a2a2';
                          tagColor = hasThemeColor ? darkenHex(themeColor, 0.5) : '#ffffff';
                        }

                        tagRender += await Badge.Render({
                          text: tag,
                          style: { color: tagColor },
                          classList: 'inl panel-tag-clickable',
                          style: {
                            margin: '3px',
                            background: tagBg,
                            color: tagColor,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          },
                        });
                      }
                      if (s(`.tag-render-${id}`)) {
                        htmls(`.tag-render-${id}`, tagRender);

                        // Add click handlers to tags for search integration
                        setTimeout(() => {
                          const tagElements = sa(`.tag-render-${id} .panel-tag-clickable`);
                          tagElements.forEach((tagEl) => {
                            tagEl.onclick = (e) => {
                              e.stopPropagation();
                              const tagText = tagEl.textContent.trim();

                              // Open search bar if closed
                              if (
                                !s('.main-body-btn-ui-bar-custom-open').classList.contains('hide') ||
                                !s(`.main-body-btn-ui-open`).classList.contains('hide')
                              )
                                s('.main-body-btn-bar-custom').click();

                              // Find and populate search box if it exists
                              const searchBox = s('.top-bar-search-box');
                              if (searchBox) {
                                searchBox.value = tagText;
                                searchBox.focus();

                                // Trigger input event to start search
                                const inputEvent = new Event('input', { bubbles: true });
                                searchBox.dispatchEvent(inputEvent);

                                logger.info(`Tag clicked: ${tagText} - search triggered`);
                              }
                            };
                          });
                        }, 100);
                      }
                    };

                    // Initial render
                    setTimeout(renderTags);

                    // Add theme change handler for this tag set
                    const tagThemeHandlerId = `${id}-tags-${infoKey}-theme`;
                    ThemeEvents[tagThemeHandlerId] = renderTags;

                    return html``;
                  }
                  {
                    const formDataObj = formData.find((f) => f.model === infoKey && f.panel && f.panel.type === 'list');
                    if (obj[infoKey] && obj[infoKey].length > 0 && formDataObj)
                      return html`<div class="in ${idPanel}-row">
                        <span class="${idPanel}-row-key capitalize ${formObjData.label?.disabled ? 'hide' : ''}">
                          ${keyIcon} ${Translate.Render(infoKey)}:</span
                        >
                        <span class="${idPanel}-row-value"
                          >${valueIcon} ${obj[infoKey].map((k) => Translate.Render(k)).join(', ')}</span
                        >
                      </div> `;
                  }

                  {
                    const formDataObj = formData.find(
                      (f) => f.model === infoKey && f.panel && f.panel.type === 'info-row-pin',
                    );
                    if (obj[infoKey] && formDataObj)
                      return html`<div class="in ${idPanel}-row">
                        <span class="${idPanel}-row-pin-key capitalize ${formObjData.label?.disabled ? 'hide' : ''}">
                          ${keyIcon}
                          ${formDataObj.translateCode
                            ? Translate.Render(formDataObj.translateCode)
                            : Translate.Render(infoKey)}:</span
                        >
                        <span class="${idPanel}-row-pin-value">${valueIcon} ${obj[infoKey]}</span>
                      </div> `;
                  }

                  {
                    const formDataObj = formData.find(
                      (f) => f.model === infoKey && f.panel && f.panel.type === 'info-row',
                    );
                    if (obj[infoKey] && formDataObj)
                      return html`<div class="in ${idPanel}-row">
                        <span class="${idPanel}-row-key capitalize ${formObjData.label?.disabled ? 'hide' : ''}">
                          ${keyIcon}
                          ${formDataObj.translateCode
                            ? Translate.Render(formDataObj.translateCode)
                            : Translate.Render(infoKey)}:</span
                        >
                        <span class="${idPanel}-row-value"> ${valueIcon} ${obj[infoKey]}</span>
                      </div> `;
                  }

                  return html``;
                })
                .join('')}
            </div>
          </div>
        </div>
        ${options.share && options.share.copyLink
          ? html`<div
              class="${idPanel}-share-btn-container ${idPanel}-share-btn-container-${id}"
              style="position: absolute; bottom: 8px; right: 8px; z-index: 2;"
            >
              <button
                class="btn-icon ${idPanel}-btn-copy-share-${id}"
                style="background: transparent; color: #888; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; transition: all 0.3s ease;"
              >
                <i class="fas fa-link" style="font-size: 20px;"></i>
                ${obj.totalCopyShareLinkCount && obj.totalCopyShareLinkCount > 0
                  ? html`<span
                      class="${idPanel}-share-count-${id}"
                      style="position: absolute; top: -4px; right: -4px; background: #666; color: white; border-radius: 10px; padding: 1px 5px; font-size: 10px; font-weight: bold; min-width: 16px; text-align: center;"
                      >${obj.totalCopyShareLinkCount}</span
                    >`
                  : ''}
              </button>
              <div
                class="${idPanel}-share-tooltip-${id}"
                style="position: absolute; bottom: 50px; right: 0; background: rgba(0,0,0,0.8); color: white; padding: 6px 10px; border-radius: 4px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.3s ease;"
              >
                ${Translate.Render('copy-share-link')}
              </div>
            </div>`
          : ''}
      </div>`;
    };

    let render = '';
    let renderForm = html` <div class="in modal" style="top: 0px; z-index: 1; padding-bottom: 5px">
        ${await BtnIcon.Render({
          class: `inl section-mp btn-custom btn-${idPanel}-close`,
          label: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
          type: 'button',
        })}
      </div>
      ${options?.htmlFormHeader ? await options.htmlFormHeader() : ''}`;

    for (const modelData of formData) {
      if (modelData.disableRender) continue;
      switch (modelData.inputType) {
        case 'dropdown-checkbox': {
          renderForm += html`<div class="in section-mp">
            ${await DropDown.Render({
              id: `${modelData.id}`,
              label: html`${Translate.Render(modelData.model)}`,
              type: 'checkbox',
              value: modelData.dropdown.options[0],
              resetOption: true,
              containerClass: `${idPanel}-dropdown-checkbox`,
              data: modelData.dropdown.options.map((dKey) => {
                return {
                  value: dKey,
                  data: dKey,
                  checked: false,
                  display: html`${Translate.Render(dKey)}`,
                  onClick: function () {
                    logger.info('DropDown onClick', this.checked);
                  },
                };
              }),
            })}
          </div>`;
          break;
        }
        case 'dropdown':
          renderForm += html` <div class="in section-mp">
            ${await DropDown.Render({
              id: `${modelData.id}`,
              label: html`${Translate.Render(modelData.model)}`,
              containerClass: `${idPanel}-dropdown`,
              // type: 'checkbox',
              value: modelData.dropdown.options[0].replaceAll(' ', '-').toLowerCase(),
              data: modelData.dropdown.options.map((dKey) => {
                const key = dKey.replaceAll(' ', '-').toLowerCase();
                return {
                  value: key,
                  data: dKey,
                  // checked: true,
                  display: html`${Translate.Render(dKey)}`,
                  onClick: function () {},
                };
              }),
            })}
          </div>`;
          break;
        case 'md': {
          renderForm += html`<div class="in section-mp">
            ${await RichText.Render({ id: modelData.id, parentIdModal: options.parentIdModal })}
          </div>`;
          break;
        }

        case 'checkbox-on-off':
          {
            setTimeout(() => {
              s(`.toggle-form-container-${modelData.id}`).onclick = () => {
                ToggleSwitch.Tokens[`${modelData.id}`].click();
              };
            });
            renderForm += html`<div
              class="in section-mp toggle-form-container toggle-form-container-${modelData.id} hover"
              style="height: 82px;"
            >
              <div class="fl">
                <div class="in fll" style="width: 70%">
                  <div class="in">
                    ${modelData.panel && modelData.panel.icon ? modelData.panel.icon : ''}
                    ${Translate.Render(modelData.model)}
                  </div>
                </div>
                <div class="in fll" style="width: 30%">
                  ${await ToggleSwitch.Render({
                    id: `${modelData.id}`,
                    containerClass: 'inl',
                    disabledOnClick: true,
                    checked: false,
                    on: {
                      unchecked: () => {},
                      checked: () => {},
                    },
                  })}
                </div>
              </div>
            </div>`;
          }
          break;
        case 'file':
          setTimeout(() => {
            s(`.${modelData.id}`).fileNameInputExtDefaultContent = fileNameInputExtDefaultContent;
            s(`.${modelData.id}`).onchange = async (e) => {
              if (!Object.keys(e.target.files).length) return;
              s(`.${modelData.id}`).inputFiles = e.target.files;
              let htmlFileRender = '';
              for (const fileKey of Object.keys(e.target.files)) {
                const file = e.target.files[fileKey];
                htmlFileRender += html`${await Content.RenderFile({
                    url: URL.createObjectURL(file),
                    file: {
                      mimetype: file.type,
                      name: file.name,
                      data: {
                        data: await getDataFromInputFile(file),
                      },
                    },

                    raw: true,
                  })}
                  <div class="in" style="overflow: hidden">${file.name}</div>`;
              }
              htmls(`.file-name-render-${modelData.id}`, htmlFileRender);
            };
          });
          renderForm += `${await Input.Render({
            inputClass: 'hide',
            id: `${modelData.id}`,
            type: modelData.inputType,
            multiple: true,
            // autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-file-arrow-up"></i> ${Translate.Render('select')}
              ${Translate.Render('file')}`,
            containerClass: 'in section-mp width-mini-box input-container',
            placeholder: true,
            extension: () =>
              html`<div class="file-name-render-${modelData.id}" style="min-height: 50px">
                ${fileNameInputExtDefaultContent}
              </div>`,
            // disabled: true,
            // disabledEye: true,
          })}
          ${await BtnIcon.Render({
            class: `inl section-mp btn-custom btn-${idPanel}-clean-file`,
            label: html`<i class="fa-solid fa-file-circle-xmark"></i> ${Translate.Render('clear-file')}`,
            type: 'button',
          })}`;
          break;
        default:
          renderForm += `${await Input.Render({
            id: `${modelData.id}`,
            type: modelData.inputType,
            // autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render(modelData.model)}`,
            containerClass: 'in section-mp width-mini-box input-container',
            placeholder: true,
            // disabled: true,
            // disabledEye: true,
          })}`;
          break;
      }
    }
    let renderFormBtn = html`
      ${await BtnIcon.Render({
        class: `inl section-mp btn-custom btn-${idPanel}-submit`,
        label: html`<span class="btn-${idPanel}-label-add"><i class="fas fa-plus"></i> ${Translate.Render('add')}</span
          ><span class="btn-${idPanel}-label-edit hide"><i class="fas fa-edit"></i> ${Translate.Render('edit')}</span>`,
        type: 'submit',
      })}
      ${await BtnIcon.Render({
        class: `inl section-mp btn-custom btn-${idPanel}-clean`,
        label: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
        type: 'button',
      })}
    `;

    setTimeout(async () => {
      const validators = await Validator.instance(formData);

      s(`.${idPanel}-form`).onsubmit = (e) => {
        e.preventDefault();
        s(`.btn-${idPanel}-submit`).click();
      };
      EventsUI.onClick(`.btn-${idPanel}-submit`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const obj = Input.getValues(formData);
        obj.id = `${data.length}`;
        let documents;
        if (options && options.on && options.on.add) {
          const { status, data } = await options.on.add({ data: obj, editId: Panel.Tokens[idPanel].editId });
          if (status === 'error') return;
          documents = data;
        }
        s(`.btn-${idPanel}-clean`).click();
        if (Panel.Tokens[idPanel].editId && s(`.${idPanel}-${Panel.Tokens[idPanel].editId}`))
          s(`.${idPanel}-${Panel.Tokens[idPanel].editId}`).remove();
        if (Array.isArray(documents)) {
          htmls(`.${idPanel}-render`, '');
          for (const doc of documents) {
            append(`.${idPanel}-render`, await renderPanel(doc));
          }
        } else htmls(`.${idPanel}-render`, await renderPanel({ ...obj, ...documents }));
        Input.cleanValues(formData);
        s(`.btn-${idPanel}-close`).click();
        s(`.${scrollClassContainer}`).scrollTop = 0;
        if (s(`.${scrollClassContainer}`)) s(`.${scrollClassContainer}`).style.overflow = 'auto';
      });
      s(`.btn-${idPanel}-clean`).onclick = () => {
        Input.cleanValues(formData);
      };
      s(`.btn-${idPanel}-clean-file`).onclick = () => {
        // Clear file input specifically
        const fileFormData = formData.find((f) => f.inputType === 'file');
        if (fileFormData && s(`.${fileFormData.id}`)) {
          s(`.${fileFormData.id}`).value = '';
          s(`.${fileFormData.id}`).inputFiles = null;
          htmls(`.file-name-render-${fileFormData.id}`, `${fileNameInputExtDefaultContent}`);
        }
      };
      s(`.btn-${idPanel}-close`).onclick = (e) => {
        e.preventDefault();
        s(`.${idPanel}-form-body`).style.opacity = 0;
        s(`.btn-${idPanel}-add`).classList.remove('hide');
        s(`.${scrollClassContainer}`).style.overflow = 'auto';
        if (options.customButtons) {
          let customBtnIndex = -1;
          for (const dataBtn of options.customButtons) {
            customBtnIndex++;
            const customBtnIndexFn = customBtnIndex;
            const btnSelector = `btn-${idPanel}-custom${customBtnIndexFn}`;
            s(`.${btnSelector}`).classList.remove('hide');
          }
        }
        s(`.${idPanel}-form-body`).classList.add('hide');
      };
      s(`.btn-${idPanel}-add`).onclick = async (e) => {
        e.preventDefault();

        // Clean all form inputs and reset data scope
        Input.cleanValues(formData);

        // Clean file input specifically
        const fileFormData = formData.find((f) => f.inputType === 'file');
        if (fileFormData && s(`.${fileFormData.id}`)) {
          s(`.${fileFormData.id}`).value = '';
          s(`.${fileFormData.id}`).inputFiles = null;
          htmls(`.file-name-render-${fileFormData.id}`, `${fileNameInputExtDefaultContent}`);
        }

        // Reset edit ID to ensure we're in "add" mode
        Panel.Tokens[idPanel].editId = undefined;

        // Update button labels
        s(`.btn-${idPanel}-label-add`).classList.remove('hide');
        s(`.btn-${idPanel}-label-edit`).classList.add('hide');

        // Scroll to top
        s(`.${scrollClassContainer}`).scrollTop = 0;

        openPanelForm();
        if (options.on.initAdd) await options.on.initAdd();
      };
      if (s(`.${scrollClassContainer}`)) s(`.${scrollClassContainer}`).style.overflow = 'auto';
    });

    if (data.length > 0) for (const obj of data) render += await renderPanel(obj);
    else {
      render += html`<div class="in" style="min-height: 200px">
        <div class="abs center"><i class="fas fa-exclamation-circle"></i> ${Translate.Render(`no-result-found`)}</div>
      </div>`;

      if (options.on.noResultFound) setTimeout(options.on.noResultFound);
    }

    this.Tokens[idPanel] = { idPanel, scrollClassContainer, formData, data, titleKey, subTitleKey, renderPanel };

    let customButtonsRender = '';
    if (options && options.customButtons) {
      let customBtnIndex = -1;
      for (const dataBtn of options.customButtons) {
        customBtnIndex++;
        const customBtnIndexFn = customBtnIndex;
        const btnSelector = `btn-${idPanel}-custom${customBtnIndexFn}`;
        if (dataBtn.onClick)
          setTimeout(() => {
            s(`.${btnSelector}`).onclick = () => dataBtn.onClick();
          });
        customButtonsRender += ` ${await BtnIcon.Render({
          class: `inl section-mp btn-custom ${btnSelector}`,
          label: dataBtn.label,
          type: 'button',
        })}`;
      }
    }

    // Add theme change handler
    const themeChangeHandler = () => {
      const styleElement = s(`.${idPanel}-styles`);
      if (styleElement) {
        styleElement.textContent = darkTheme
          ? getDarkStyles(idPanel, scrollClassContainer)
          : getLightStyles(idPanel, scrollClassContainer);
      }

      // Update tag hover styles
      const tagStyleElement = s(`.${idPanel}-tag-styles`);
      if (tagStyleElement) {
        const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
        const hasThemeColor = themeColor && themeColor !== null;
        let hoverBg;
        if (darkTheme) {
          hoverBg = hasThemeColor ? darkenHex(themeColor, 0.5) : '#5a5a5a';
        } else {
          hoverBg = hasThemeColor ? lightenHex(themeColor, 0.6) : '#8a8a8a';
        }

        tagStyleElement.textContent = css`
          .panel-tag-clickable:hover {
            background: ${hoverBg} !important;
            transform: scale(1.05);
          }
          .panel-tag-clickable:active {
            transform: scale(0.98);
          }
        `;
      }
    };

    // Add theme change listener
    ThemeEvents[`${idPanel}-theme`] = themeChangeHandler;

    // Initial styles
    setTimeout(ThemeEvents[`${idPanel}-theme`]);

    return html`
      <style>
        .${idPanel}-head {
          /* background: white; */
          margin-bottom: 10px;
        }
        .img-${idPanel} {
          width: 100%;
        }
        .${idPanel}-title {
          color: ${(() => {
            const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
            const hasThemeColor = themeColor && themeColor !== null;
            if (hasThemeColor) {
              return darkTheme ? lightenHex(themeColor, 0.3) : darkenHex(themeColor, 0.2);
            } else {
              return darkTheme ? '#8a85ff' : 'rgba(109, 104, 255, 1)';
            }
          })()};
          font-size: 24px;
          padding: 5px;
        }
        .a-title-${idPanel} {
          color: ${(() => {
            const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
            const hasThemeColor = themeColor && themeColor !== null;
            if (hasThemeColor) {
              return darkTheme ? lightenHex(themeColor, 0.3) : darkenHex(themeColor, 0.2);
            } else {
              return darkTheme ? '#8a85ff' : 'rgba(109, 104, 255, 1)';
            }
          })()};
        }
        .a-title-${idPanel}:hover {
          color: ${(() => {
            const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
            const hasThemeColor = themeColor && themeColor !== null;
            if (hasThemeColor) {
              return darkTheme ? lightenHex(themeColor, 0.5) : lightenHex(themeColor, 0.3);
            } else {
              return darkTheme ? '#ffb74d' : '#e89f4c';
            }
          })()};
        }
        .${idPanel}-row {
          padding: 5px;
          margin: 5px;
          font-size: 16px;
        }
        .${idPanel}-subtitle {
          font-size: 17px;
          margin-left: 20px;
          top: -7px;
        }
        .${idPanel}-tags {
          font-size: 17px;
          margin-left: 10px;
          top: -7px;
        }

        .${idPanel}-row-key {
        }
        .${idPanel}-row-value {
        }
        .${idPanel}-row-pin-key {
        }
        .${idPanel}-row-pin-value {
          font-size: 20px;
          color: rgb(19 190 84);
        }
        .${idPanel}-form-header {
        }
        .${idPanel}-form-body {
          transition: 0.3s;
        }
        .btn-${idPanel}-add {
          padding: 10px;
          font-size: 20px;
        }
        .${idPanel}-dropdown {
          min-height: 100px;
        }
        .${idPanel}-btn-tool {
          background: none !important;
          color: #c4c4c4 !important;
        }
        .${idPanel}-btn-tool:hover {
          color: #000000 !important;
          font-size: 17px !important;
        }
        .${idPanel}-share-btn-container button:hover {
          background: transparent !important;
          transform: scale(1.1);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4) !important;
        }
        .${idPanel}-share-btn-container button:focus {
          outline: none;
          background: transparent !important;
        }
        .${idPanel}-share-btn-container button:focus {
          outline: none;
          background: transparent !important;
        }
        .${idPanel}-share-btn-container button:active {
          transform: scale(0.95);
        }
        .${idPanel}-share-btn-container span[class*='share-count'] {
          animation: ${idPanel}-share-pulse 2s infinite;
        }
        @keyframes ${idPanel}-share-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }
      </style>
      <style class="${idPanel}-styles"></style>
      <style class="${idPanel}-tag-styles">
        .panel-tag-clickable:hover {
          background: ${(() => {
            const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
            const hasThemeColor = themeColor && themeColor !== null;
            if (darkTheme) {
              return hasThemeColor ? darkenHex(themeColor, 0.5) : '#5a5a5a';
            } else {
              return hasThemeColor ? lightenHex(themeColor, 0.6) : '#8a8a8a';
            }
          })()} !important;
          transform: scale(1.05);
        }
        .panel-tag-clickable:active {
          transform: scale(0.98);
        }
      </style>
      <div class="${idPanel}-container">
        <div class="in modal ${idPanel}-form-container ${options.formContainerClass ? options.formContainerClass : ''}">
          <div class="in ${idPanel}-form-header">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-${idPanel}-add ${
                options?.role?.add ? (!options.role.add() ? 'hide' : '') : ''
              }`,
              label: html`<i class="fas fa-plus"></i> ${Translate.Render('add')}`,
              type: 'button',
            })}
            <!-- pagination component -->
            ${customButtonsRender}
          </div>
          <div class="in ${idPanel}-form-body hide" style="opacity: 0">
            <form class="in ${idPanel}-form">
              <div class="fl">${renderForm}</div>
              <div class="in">${renderFormBtn}</div>
              <br /><br />
            </form>
          </div>
        </div>
        ${dynamicCol({
          id: `${idPanel}-cell`,
          containerSelector: `${idPanel}-render`,
          limit: 500,
          type: 'a-50-b-50',
        })}
        <div class="in ${idPanel}-render">${render}</div>
      </div>
    `;
  },
};

// Function to generate base styles
function getBaseStyles(idPanel, scrollClassContainer) {
  return css`
    .${scrollClassContainer} {
      scroll-behavior: smooth;
    }
    .${idPanel}-form-container {
      padding-bottom: 20px;
      top: 0px;
      z-index: 1;
      overflow: auto;
    }
    .${idPanel}-form {
      max-width: 900px;
    }
    .${idPanel}-cell {
      min-height: 200px;
    }
    .${idPanel}-container {
    }
    .${idPanel} {
      margin: 10px;
      transition: 0.3s;
      border-radius: 10px;
      padding: 10px;
      min-height: 400px;
    }
    .${idPanel}-head {
      margin-bottom: 10px;
    }
    .img-${idPanel} {
      width: 100%;
    }
    .${idPanel}-row {
      padding: 5px;
      margin: 5px;
      font-size: 16px;
    }
    .${idPanel}-subtitle {
      font-size: 17px;
      margin-left: 20px;
      top: -7px;
    }
    .${idPanel}-tags {
      font-size: 17px;
      margin-left: 10px;
      top: -7px;
    }
    .${idPanel}-form-body {
      transition: 0.3s;
    }
    .btn-${idPanel}-add {
      padding: 10px;
      font-size: 20px;
    }
    .${idPanel}-dropdown {
      min-height: 100px;
    }
    .panel-visibility-icon {
      position: absolute;
      top: 34px;
      left: 0px;
      font-size: 14px;
      opacity: 0.7;
      transition: opacity 0.2s ease;
      pointer-events: none;
      z-index: 10;
    }
    .${idPanel}:hover .panel-visibility-icon {
      opacity: 1;
    }
  `;
}

// Function to generate light theme styles
function getLightStyles(idPanel, scrollClassContainer) {
  return css`
    ${getBaseStyles(idPanel, scrollClassContainer)}

    .${idPanel} {
      background: #f6f6f6;
      color: black;
    }
    .${idPanel}:hover {
      background: #ffffff;
    }
    .${idPanel}-title {
      color: ${(() => {
        const themeColor = subThemeManager.lightColor;
        const hasThemeColor = themeColor && themeColor !== null;
        return hasThemeColor ? darkenHex(themeColor, 0.2) : 'rgba(109, 104, 255, 1)';
      })()};
      font-size: 24px;
      padding: 5px;
    }
    .a-title-${idPanel} {
      color: ${(() => {
        const themeColor = subThemeManager.lightColor;
        const hasThemeColor = themeColor && themeColor !== null;
        return hasThemeColor ? darkenHex(themeColor, 0.2) : 'rgba(109, 104, 255, 1)';
      })()};
    }
    .a-title-${idPanel}:hover {
      color: ${(() => {
        const themeColor = subThemeManager.lightColor;
        const hasThemeColor = themeColor && themeColor !== null;
        return hasThemeColor ? lightenHex(themeColor, 0.3) : '#e89f4c';
      })()};
    }
    .${idPanel}-row-pin-value {
      font-size: 20px;
      color: rgb(19 190 84);
    }
    .${idPanel}-btn-tool {
      background: none !important;
      color: #c4c4c4 !important;
    }
    .${idPanel}-btn-tool:hover {
      color: #000000 !important;
      font-size: 17px !important;
    }
    .panel-visibility-icon .fa-globe,
    .panel-visibility-icon .fa-lock {
      color: #666;
    }
  `;
}

// Function to generate dark theme styles
function getDarkStyles(idPanel, scrollClassContainer) {
  return css`
    ${getBaseStyles(idPanel, scrollClassContainer)}

    .${idPanel} {
      background: #2d2d2d;
      color: #e0e0e0;
    }
    .${idPanel}:hover {
      background: #3a3a3a;
    }
    .${idPanel}-title {
      color: ${(() => {
        const themeColor = subThemeManager.darkColor;
        const hasThemeColor = themeColor && themeColor !== null;
        return hasThemeColor ? lightenHex(themeColor, 0.3) : '#8a85ff';
      })()};
      font-size: 24px;
      padding: 5px;
    }
    .a-title-${idPanel} {
      color: ${(() => {
        const themeColor = subThemeManager.darkColor;
        const hasThemeColor = themeColor && themeColor !== null;
        return hasThemeColor ? lightenHex(themeColor, 0.3) : '#8a85ff';
      })()};
    }
    .a-title-${idPanel}:hover {
      color: ${(() => {
        const themeColor = subThemeManager.darkColor;
        const hasThemeColor = themeColor && themeColor !== null;
        return hasThemeColor ? lightenHex(themeColor, 0.5) : '#ffb74d';
      })()};
    }
    .${idPanel}-row-pin-value {
      font-size: 20px;
      color: #4caf50;
    }
    .${idPanel}-btn-tool {
      background: none !important;
      color: #666666 !important;
    }
    .${idPanel}-btn-tool:hover {
      color: #ffffff !important;
      font-size: 17px !important;
    }
    .panel-visibility-icon .fa-globe,
    .panel-visibility-icon .fa-lock {
      color: #999;
    }
  `;
}

export { Panel };
