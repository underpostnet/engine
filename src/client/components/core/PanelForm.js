import { getCapVariableName, newInstance, random, range, timer, uniqueArray } from './CommonJs.js';
import { marked } from 'marked';
import { append, getBlobFromUint8ArrayFile, getDataFromInputFile, getRawContentFile, htmls, s } from './VanillaJs.js';
import { Panel } from './Panel.js';
import { NotificationManager } from './NotificationManager.js';
import { DocumentService } from '../../services/document/document.service.js';
import { FileService } from '../../services/file/file.service.js';
import { getSrcFromFileData } from './Input.js';
import { imageShimmer, renderCssAttr, darkTheme, ThemeEvents, subThemeManager, lightenHex, darkenHex } from './Css.js';
import { Translate } from './Translate.js';
import { Modal } from './Modal.js';
import { closeModalRouteChangeEvents, listenQueryPathInstance, setQueryPath, getQueryParams } from './Router.js';
import { Scroll } from './Scroll.js';
import { LoadingAnimation } from './LoadingAnimation.js';
import { loggerFactory } from './Logger.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';

const logger = loggerFactory(import.meta, { trace: true });

function sanitizeFilename(title, options = {}) {
  const { replacement = '-', maxLength = 255, preserveExtension = true } = options;

  if (typeof title !== 'string' || title.trim() === '') {
    return 'untitled';
  }

  // 1) Extract extension (optional)
  let name = title;
  let ext = '';
  if (preserveExtension) {
    const match = title.match(/(\.[^.\s]{1,10})$/u);
    if (match) {
      ext = match[1];
      name = title.slice(0, -ext.length);
    }
  }

  // 2) Normalize Unicode and remove diacritics
  name = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // 3) Remove control characters and null bytes
  name = name.replace(/[\x00-\x1f\x7f]/g, '');

  // 4) Remove forbidden filename characters (Windows / POSIX)
  name = name.replace(/[<>:"/\\|?*\u0000]/g, '');

  // 5) Collapse whitespace and replace with separator
  name = name.replace(/\s+/g, replacement);

  // 6) Collapse multiple separators
  const escaped = replacement.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  name = name.replace(new RegExp(`${escaped}{2,}`, 'g'), replacement);

  // 7) Trim dots and separators from edges
  name = name.replace(new RegExp(`^[\\.${escaped}]+|[\\.${escaped}]+$`, 'g'), '');

  // 8) Protect against Windows reserved names
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
    name = '_' + name;
  }

  // 9) Enforce max length
  const maxNameLength = Math.max(1, maxLength - ext.length);
  if (name.length > maxNameLength) {
    name = name.slice(0, maxNameLength);
  }

  // 10) Fallback
  if (!name) name = 'untitled';

  return name + ext;
}

const userInfoFactory = (userDoc) => ({
  username: userDoc.userId.username,
  email: userDoc.userId.email,
  _id: userDoc.userId._id,
  profileImageId: userDoc.userId.profileImageId,
  briefDescription: userDoc.userId.briefDescription,
});

const PanelForm = {
  Data: {},
  instance: async function (
    options = {
      idPanel: '',
      defaultUrlImage: '',
      Elements: {},
      parentIdModal: undefined,
      route: 'home',
      htmlFormHeader: async () => '',
      firsUpdateEvent: async () => {},
      share: {
        copyLink: false,
      },
      showCreatorProfile: false,
    },
  ) {
    const { idPanel, defaultUrlImage, Elements } = options;

    // Authenticated users don't need 'public' tag - they see all their own posts
    // Only include 'public' for unauthenticated users (handled by backend)
    let prefixTags = [idPanel];
    this.Data[idPanel] = {
      originData: [],
      data: [],
      filesData: [],
      skip: 0,
      limit: 3, // Load 5 items per page
      hasMore: true,
      loading: false,
      lasIdAvailable: null,
    };

    const formData = [
      {
        id: 'panel-title',
        model: 'title',
        inputType: 'text',
        rules: [],
        panel: { type: 'title' },
      },
      {
        id: 'panel-createdAt',
        model: 'createdAt',
        inputType: 'datetime-local',
        panel: { type: 'subtitle' },
        rules: [{ type: 'isEmpty' }],
        disableRender: true,
      },
      {
        id: 'panel-fileId',
        model: 'fileId',
        inputType: 'file',
        rules: [],
        panel: {},
      },
      {
        id: 'panel-tags',
        model: 'tags',
        label: {
          disabled: true,
        },
        inputType: 'text',
        panel: { type: 'tags' },
        // panel: {
        //   type: 'info-row-pin',
        //   icon: {
        //     value: html``,
        //   },
        // },
        rules: [],
      },
      {
        id: 'panel-mdFileId',
        model: 'mdFileId',
        inputType: 'md',
        panel: { type: 'info-row' },
        rules: [],
        label: {
          disabled: true,
        },
      },
    ];

    const titleIcon = html`<i class="fa-solid fa-quote-left title-icon-${idPanel}"></i>`;
    const panelRender = async ({ data }) =>
      await Panel.Render({
        idPanel,
        formData,
        data,
        htmlFormHeader: options.htmlFormHeader,
        parentIdModal: options.parentIdModal,
        originData: () => PanelForm.Data[idPanel].originData,
        filesData: () => PanelForm.Data[idPanel].filesData,
        scrollClassContainer: options.scrollClassContainer ? options.scrollClassContainer : 'main-body',
        titleIcon,
        route: options.route,
        formContainerClass: 'session-in-log-in',
        share: options.share,
        showCreatorProfile: options.showCreatorProfile,
        onClick: async function ({ payload }) {
          if (options.route) {
            setQueryPath({ path: options.route, queryPath: payload._id });
            if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;
            if (PanelForm.Data[idPanel].updatePanel) await PanelForm.Data[idPanel].updatePanel();
          }
        },
        callBackPanelRender: async function (options) {
          if (options.data.ssr) {
            return await options.htmlRender({
              render: imageShimmer(),
            });
          }

          // Get the filesData for this item
          const filesDataItem = PanelForm.Data[idPanel].filesData.find((f) => f._id === options.data._id);

          // Priority 1: Check if there's an actual file (not markdown content)
          // fileId array defaults to [null] for batch upload logic
          const fileBlob = filesDataItem?.fileId?.fileBlob;
          if (fileBlob) {
            return await options.fileRender({
              file: fileBlob,
              style: {
                overflow: 'auto',
                width: '100%',
                height: 'auto',
              },
            });
          }

          // Priority 2: If no actual file, show default image
          // (Don't show markdown content in file area - mdFileId stays in content area)
          return await options.htmlRender({
            render: html`
              <img
                class="abs center"
                style="${renderCssAttr({
                  style: {
                    width: '100px',
                    height: '100px',
                    opacity: 0.2,
                  },
                })}"
                src="${defaultUrlImage}"
              />
            `,
          });
        },
        on: {
          remove: async function ({ e, data }) {
            e.preventDefault();
            const confirmResult = await Modal.RenderConfirm({
              html: async () => {
                return html`
                  <div class="in section-mp" style="text-align: center">
                    ${Translate.Render('confirm-delete-item')}
                    <br />
                    "${data.title}"
                  </div>
                `;
              },
              id: `delete-${idPanel}`,
            });
            if (confirmResult.status === 'confirm') {
              const { status, message } = await DocumentService.delete({
                id: data._id,
              });
              NotificationManager.Push({
                html: status,
                status,
              });

              // Handle cid query param update (supports comma-separated list)
              if (status === 'success') {
                const currentCid = getQueryParams().cid;

                if (currentCid) {
                  // Parse cid as comma-separated list
                  const cidList = currentCid
                    .split(',')
                    .map((id) => id.trim())
                    .filter((id) => id);

                  // Remove the deleted panel's id from the list
                  const updatedCidList = cidList.filter((id) => id !== data.id);

                  if (updatedCidList.length !== cidList.length) {
                    // Wait for DOM cleanup before updating query

                    if (updatedCidList.length === 0) {
                      // No cids remain, clear query and reload panels with limit
                      logger.warn('All cids removed, clearing query');
                      setQueryPath({ path: options.route, queryPath: '' });

                      if (options.parentIdModal) Modal.Data[options.parentIdModal].query = window.location.search;
                      if (PanelForm.Data[idPanel].updatePanel) await PanelForm.Data[idPanel].updatePanel();
                    } else {
                      // Update query params with remaining cids only (without ?cid= prefix)
                      const cidValue = updatedCidList.join(',');
                      setQueryPath({ path: options.route, queryPath: cidValue });
                      const actualQuery = window.location.search;
                      if (options.parentIdModal) Modal.Data[options.parentIdModal].query = actualQuery;
                    }
                  }

                  // Return early to skip smart deletion logic when cid is present
                  return { status };
                }
              }

              // Smart deletion: remove from arrays and intelligently load more if needed
              if (status === 'success') {
                const panelData = PanelForm.Data[idPanel];

                // Remove the deleted item from all data arrays
                const indexInOrigin = panelData.originData.findIndex((d) => d._id === data._id);
                const indexInData = panelData.data.findIndex((d) => d._id === data._id);
                const indexInFiles = panelData.filesData.findIndex((d) => d._id === data._id);

                if (indexInOrigin > -1) panelData.originData.splice(indexInOrigin, 1);
                if (indexInData > -1) panelData.data.splice(indexInData, 1);
                if (indexInFiles > -1) panelData.filesData.splice(indexInFiles, 1);

                // Adjust skip count since we removed an item
                if (panelData.skip > 0) panelData.skip--;

                // If panels are below limit and there might be more, load them
                if (panelData.data.length < panelData.limit && panelData.hasMore && !panelData.loading) {
                  const oldDataCount = panelData.data.length;
                  const needed = panelData.limit - panelData.data.length; // Calculate exact number needed
                  const originalLimit = panelData.limit;

                  // Temporarily set limit to only fetch what's needed (1-to-1 replacement)
                  panelData.limit = needed;
                  await getPanelData(true); // Load only the needed items
                  panelData.limit = originalLimit; // Restore original limit

                  const newItems = panelData.data.slice(oldDataCount);

                  if (oldDataCount === 0) {
                    // List was empty, render all panels
                    if (panelData.data.length > 0) {
                      const containerSelector = `.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`;
                      htmls(
                        containerSelector,
                        html`
                          <div class="in">${await panelRender({ data: panelData.data })}</div>
                          <div class="in panel-placeholder-bottom panel-placeholder-bottom-${idPanel}"></div>
                        `,
                      );

                      // Show spinner if there's potentially more data
                      const lastOriginItem = panelData.originData[panelData.originData.length - 1];
                      if (
                        !panelData.lasIdAvailable ||
                        !lastOriginItem ||
                        panelData.lasIdAvailable !== lastOriginItem._id
                      )
                        LoadingAnimation.spinner.play(`.panel-placeholder-bottom-${idPanel}`, 'dual-ring-mini');
                    } else {
                      // No more data available, show empty state
                      const containerSelector = `.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`;
                      htmls(
                        containerSelector,
                        html`
                          <div class="in">${await panelRender({ data: [] })}</div>
                          <div class="in panel-placeholder-bottom panel-placeholder-bottom-${idPanel}"></div>
                        `,
                      );
                    }
                  } else {
                    // List had some panels, append new ones
                    if (newItems.length > 0) {
                      for (const item of newItems)
                        append(`.${idPanel}-render`, await Panel.Tokens[idPanel].renderPanel(item));
                    }
                  }
                }
              }

              return { status };
            }
            return { status: 'error' };
          },
          initAdd: async function () {
            setTimeout(() => {
              s(`.modal-${options.route}`).scrollTo({ top: 0, behavior: 'smooth' });
            }, 50);
          },
          initEdit: async function ({ data }) {
            // Clear file input when entering edit mode
            const fileFormData = formData.find((f) => f.inputType === 'file');
            if (fileFormData && s(`.${fileFormData.id}`)) {
              s(`.${fileFormData.id}`).value = '';
              s(`.${fileFormData.id}`).inputFiles = null;
              htmls(
                `.file-name-render-${fileFormData.id}`,
                `<div class="abs center"><i style="font-size: 25px" class="fa-solid fa-cloud"></i></div>`,
              );
            }
            setTimeout(() => {
              s(`.modal-${options.route}`).scrollTo({ top: 0, behavior: 'smooth' });
            }, 50);
          },
          noResultFound: async function () {
            LoadingAnimation.spinner.stop(`.panel-placeholder-bottom-${idPanel}`);
          },
          add: async function ({ data, editId }) {
            // Validate that either mdFileId has content OR fileId has files
            const hasMdContent = data.mdFileId && data.mdFileId.trim().length > 0;
            const hasFiles = data.fileId && data.fileId.length > 0;

            if (!data.title || (!hasMdContent && !hasFiles)) {
              NotificationManager.Push({
                html: Translate.Render('require-title-and-content-or-file'),
                status: 'error',
              });
              return { data: [], status: 'error', message: 'Must provide either content or attach a file' };
            }

            // Sanitize title for filename - normalize UTF-8 string
            // In browser, strings are already UTF-16, just ensure valid characters
            const sanitizedTitle = sanitizeFilename(data.title);

            let mdFileId;
            const mdFileName = `${getCapVariableName(sanitizedTitle)}.md`;
            const location = `${prefixTags.join('/')}`;

            // Only create markdown file if there's actual content
            let md = null;
            let mdBlob = null;
            let mdPlain = null;

            if (hasMdContent) {
              // Markdown content is already UTF-16 in browser, use as-is
              const blob = new Blob([data.mdFileId], { type: 'text/markdown' });
              md = new File([blob], mdFileName, { type: 'text/markdown' });

              mdBlob = {
                data: {
                  data: await getDataFromInputFile(md),
                },
                mimetype: md.type,
                name: md.name,
              };
              mdPlain = await getRawContentFile(getBlobFromUint8ArrayFile(mdBlob.data.data, mdBlob.mimetype));
            }

            // Parse and normalize tags
            // Note: 'public' tag is automatically extracted by the backend and converted to isPublic field
            // It will be filtered from the tags array to keep visibility control separate from content tags
            const tags = data.tags
              ? uniqueArray(
                  data.tags
                    .replaceAll('/', ',')
                    .replaceAll('-', ',')
                    .replaceAll(' ', ',')
                    .split(',')
                    .map((t) => t.trim())
                    .filter((t) => t)
                    .concat(prefixTags),
                )
              : prefixTags;
            let originObj, originFileObj, indexOriginObj;
            if (editId) {
              indexOriginObj = PanelForm.Data[idPanel].originData.findIndex((d) => d._id === editId);
              if (indexOriginObj > -1) {
                originObj = PanelForm.Data[idPanel].originData[indexOriginObj];
                originFileObj = PanelForm.Data[idPanel].filesData.find((d) => d._id === editId);
              }
            }

            const baseNewDoc = newInstance(data);
            baseNewDoc.tags = tags.filter((t) => !prefixTags.includes(t));
            baseNewDoc.mdFileId = hasMdContent ? marked.parse(data.mdFileId) : null;
            baseNewDoc.userId = Elements.Data.user?.main?.model?.user?._id;

            // Ensure profileImageId is properly formatted as object with _id property
            const profileImageIdValue = Elements.Data.user?.main?.model?.user?.profileImageId;
            const formattedProfileImageId = profileImageIdValue
              ? typeof profileImageIdValue === 'string'
                ? { _id: profileImageIdValue }
                : profileImageIdValue
              : null;

            baseNewDoc.userInfo = {
              username: Elements.Data.user?.main?.model?.user?.username,
              email: Elements.Data.user?.main?.model?.user?.email,
              _id: Elements.Data.user?.main?.model?.user?._id,
              profileImageId: formattedProfileImageId,
            };
            baseNewDoc.tools = true;

            const documents = [];
            let message = '';
            let status = 'success';
            let indexFormDoc = -1;

            const inputFiles = data.fileId ? data.fileId : [null];

            for (const file of inputFiles) {
              indexFormDoc++;
              let fileId = undefined; // Reset for each iteration - only set if user uploaded a file

              await (async () => {
                const body = new FormData();
                // Only append md file if it was created (has content)
                if (md) body.append('md', md);
                if (file) body.append('file', file);
                const { status, data: uploadedFiles } = await FileService.post({ body });
                // await timer(3000);
                NotificationManager.Push({
                  html: Translate.Render(`${status}-upload-file`),
                  status,
                });
                if (status === 'success' && uploadedFiles && Array.isArray(uploadedFiles)) {
                  // CRITICAL DIFFERENTIATION:
                  // - mdFileId: markdown file GENERATED FROM rich text editor content
                  // - fileId: file UPLOADED BY USER (could be .md, .pdf, image, etc.)
                  //
                  // Both can be markdown files, but we must distinguish:
                  // Rich text editor content → mdFileId
                  // User-uploaded file → fileId

                  for (const uploadedFile of uploadedFiles) {
                    if (hasMdContent && uploadedFile.name === mdFileName) {
                      // This is the markdown file created FROM rich text editor
                      mdFileId = uploadedFile._id;
                      logger.info(`Assigned rich text markdown to mdFileId: ${mdFileName}`);
                    } else if (!hasMdContent || uploadedFile.name !== mdFileName) {
                      // This is a file uploaded by user (even if it's an .md file)
                      fileId = uploadedFile._id;
                      logger.info(`Assigned user-uploaded file to fileId: ${uploadedFile.name}`);
                    }
                  }

                  // Validation: mdFileId should exist only if rich text content was provided
                  if (hasMdContent && !mdFileId) {
                    logger.error(
                      `ERROR: No markdown content file found. Expected: ${mdFileName}, Got: ${uploadedFiles.map((f) => f.name).join(', ')}`,
                    );
                  }
                }
              })();
              // Backend will automatically extract 'public' from tags and set isPublic field
              const body = {
                location,
                tags,
                fileId,
                mdFileId,
                title: data.title,
              };
              const {
                status: documentStatus,
                message: documentMessage,
                data: documentData,
              } = originObj && indexFormDoc === 0
                ? await DocumentService.put({ id: originObj._id, body })
                : await DocumentService.post({
                    body,
                  });

              const newDoc = {
                ...baseNewDoc,
                fileId: file ? URL.createObjectURL(file) : undefined,
                _id: documentData._id,
                id: documentData._id,
                createdAt: documentData.createdAt,
                // Use server response data - backend has already processed tags and isPublic
                isPublic: documentData.isPublic || false,
                tags: (documentData.tags || []).filter((t) => !prefixTags.includes(t)),
                // Ensure userInfo is present for profile header rendering
                userInfo:
                  baseNewDoc.userInfo ||
                  (documentData.userId && typeof documentData.userId === 'object'
                    ? userInfoFactory(documentData)
                    : null),
              };

              if (documentStatus === 'error') status = 'error';
              if (message) message += `${indexFormDoc === 0 ? '' : ', '}${documentMessage}`;

              const filesData = {
                id: documentData._id,
                _id: documentData._id,
                mdFileId: mdBlob && mdPlain ? { mdBlob, mdPlain } : null,
                fileId: {
                  fileBlob: file
                    ? {
                        data: {
                          data: await getDataFromInputFile(file),
                        },
                        mimetype: file.type,
                        name: file.name,
                      }
                    : undefined,
                  filePlain: undefined,
                },
              };

              if (originObj && indexFormDoc === 0) {
                PanelForm.Data[idPanel].originData[indexOriginObj] = documentData;
                PanelForm.Data[idPanel].data[indexOriginObj] = newDoc;
                PanelForm.Data[idPanel].filesData[indexOriginObj] = filesData;
              } else {
                PanelForm.Data[idPanel].originData.push(documentData);
                PanelForm.Data[idPanel].data.push(newDoc);
                PanelForm.Data[idPanel].filesData.push(filesData);
              }
              documents.push(newDoc);
            }

            NotificationManager.Push({
              html:
                status === 'success'
                  ? originObj
                    ? Translate.Render('success-edit-post')
                    : Translate.Render('success-add-post')
                  : message,
              status: status,
            });

            setQueryPath({ path: options.route, queryPath: documents.map((d) => d._id).join(',') });
            if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;

            return { data: documents, status, message };
          },
        },
      });

    const getPanelData = async (isLoadMore = false) => {
      const panelData = PanelForm.Data[idPanel];
      logger.warn('getPanelData called, isLoadMore:', isLoadMore);
      try {
        const cidQuery = getQueryParams().cid;

        // When cid query exists, bypass pagination and loading checks
        if (!cidQuery) {
          if (panelData.loading || !panelData.hasMore) {
            logger.warn('getPanelData early return - loading:', panelData.loading, 'hasMore:', panelData.hasMore);
            return;
          }
        }

        panelData.loading = true;

        if (!isLoadMore) {
          // Reset for a fresh load
          panelData.skip = 0;
          panelData.hasMore = true;
        }

        // When cid query exists, don't apply skip/limit pagination
        const params = {
          tags: prefixTags.join(','),
          ...(cidQuery && { cid: cidQuery }),
        };

        // Only apply pagination when there's no cid query
        if (!cidQuery) {
          params.skip = panelData.skip;
          params.limit = panelData.limit;
        }

        const result = await DocumentService.get({
          params,
          id: 'public/',
        });

        if (result.status === 'success') {
          if (!isLoadMore) {
            panelData.originData = [];
            panelData.filesData = [];
            panelData.data = [];
          }

          panelData.originData.push(...newInstance(result.data.data));
          panelData.lasIdAvailable = result.data.lastId;

          for (const documentObject of result.data.data) {
            let mdFileId, fileId;
            let mdBlob, fileBlob;
            let mdPlain, filePlain;
            let parsedMarkdown = '';

            try {
              // Fetch markdown content if mdFileId exists
              if (documentObject.mdFileId) {
                const mdFileIdValue = documentObject.mdFileId._id || documentObject.mdFileId;
                try {
                  // Get markdown content from blob endpoint using FileService
                  const { data: blobArray, status } = await FileService.get({ id: `blob/${mdFileIdValue}` });
                  if (status === 'success' && blobArray && blobArray[0]) {
                    mdPlain = await blobArray[0].text();
                    // Parse markdown with proper error handling
                    try {
                      parsedMarkdown = mdPlain ? marked.parse(mdPlain) : '';
                    } catch (parseError) {
                      logger.error('Error parsing markdown for document:', documentObject._id, parseError);
                      parsedMarkdown = `<p><strong>Error rendering markdown:</strong> ${parseError.message}</p>`;
                    }
                  } else {
                    logger.warn('Failed to fetch markdown blob content');
                    parsedMarkdown = '';
                  }
                } catch (fetchError) {
                  logger.error('Error fetching markdown content:', mdFileIdValue, fetchError);
                  parsedMarkdown = '';
                }
              }

              // Handle optional fileId
              if (documentObject.fileId) {
                const fileIdValue = documentObject.fileId._id || documentObject.fileId;
                try {
                  // Get file metadata for display
                  const { data: fileArray } = await FileService.get({ id: fileIdValue });
                  if (fileArray && fileArray[0]) {
                    fileBlob = fileArray[0];
                    fileId = getSrcFromFileData(fileArray[0]);
                  }
                } catch (fetchError) {
                  logger.error('Error fetching file metadata:', fileIdValue, fetchError);
                }
              }

              // Store file metadata and references
              panelData.filesData.push({
                id: documentObject._id,
                _id: documentObject._id,
                mdFileId: { mdBlob, mdPlain },
                fileId: { fileBlob, filePlain },
              });

              // Add to data array for display - use pre-parsed markdown
              panelData.data.push({
                id: documentObject._id,
                title: documentObject.title,
                createdAt: documentObject.createdAt,
                // Backend filters 'public' tag automatically - it's converted to isPublic field
                tags: documentObject.tags.filter((t) => !prefixTags.includes(t)),
                mdFileId: parsedMarkdown,
                userId:
                  documentObject.userId && typeof documentObject.userId === 'object'
                    ? documentObject.userId._id
                    : documentObject.userId,
                userInfo:
                  documentObject.userId && typeof documentObject.userId === 'object'
                    ? userInfoFactory(documentObject)
                    : null,
                fileId,
                tools:
                  documentObject.userId &&
                  typeof documentObject.userId === 'object' &&
                  Elements.Data.user?.main?.model?.user?._id &&
                  documentObject.userId._id === Elements.Data.user.main.model.user._id,
                _id: documentObject._id,
                totalCopyShareLinkCount: documentObject.totalCopyShareLinkCount || 0,
                isPublic: documentObject.isPublic || false,
              });
            } catch (fileError) {
              logger.error('Error processing files for document:', documentObject._id, fileError);
              // Still add the document to originData even if file fetching fails
              // Add minimal data without file references
              panelData.filesData.push({
                id: documentObject._id,
                _id: documentObject._id,
                mdFileId: { mdBlob: null, mdPlain: '' },
                fileId: { fileBlob: null, filePlain: undefined },
              });

              panelData.data.push({
                id: documentObject._id,
                title: documentObject.title,
                createdAt: documentObject.createdAt,
                tags: documentObject.tags.filter((t) => !prefixTags.includes(t)),
                mdFileId: '',
                userId:
                  documentObject.userId && typeof documentObject.userId === 'object'
                    ? documentObject.userId._id
                    : documentObject.userId,
                userInfo:
                  documentObject.userId && typeof documentObject.userId === 'object'
                    ? userInfoFactory(documentObject)
                    : null,
                fileId: null,
                tools:
                  documentObject.userId &&
                  typeof documentObject.userId === 'object' &&
                  Elements.Data.user?.main?.model?.user?._id &&
                  documentObject.userId._id === Elements.Data.user.main.model.user._id,
                _id: documentObject._id,
                totalCopyShareLinkCount: documentObject.totalCopyShareLinkCount || 0,
                isPublic: documentObject.isPublic || false,
              });
            }
          }

          // Only update pagination when not using cid query
          if (!cidQuery) {
            panelData.skip += result.data.data.length;
            panelData.hasMore = result.data.data.length === panelData.limit;
          } else {
            // When cid query is used, disable infinite scroll
            panelData.hasMore = false;
          }

          const lastItem = result.data.data[result.data.data.length - 1];
          if (result.data.data.length === 0 || (lastItem && lastItem._id === panelData.lasIdAvailable)) {
            LoadingAnimation.spinner.stop(`.panel-placeholder-bottom-${idPanel}`);
            panelData.hasMore = false;
          }
        } else {
          NotificationManager.Push({
            html: result.message,
            status: result.status,
          });
          panelData.hasMore = false;
        }
      } catch (error) {
        logger.error(error);
      }

      await timer(250);
      panelData.loading = false;
      LoadingAnimation.spinner.stop(`.panel-placeholder-bottom-${idPanel}`);
    };
    const renderSrrPanelData = async () =>
      await panelRender({
        data: range(0, 0).map((i) => ({
          id: i,
          title: html`<div class="fl">
            <div
              class="in fll ssr-shimmer-search-box"
              style="${renderCssAttr({
                style: {
                  width: '80%',
                  height: '30px',
                  top: '-13px',
                  left: '10px',
                },
              })}"
            ></div>
          </div>`,
          createdAt: html`<div class="fl">
            <div
              class="in fll ssr-shimmer-search-box"
              style="${renderCssAttr({
                style: {
                  width: '50%',
                  height: '30px',
                  left: '-5px',
                },
              })}"
            ></div>
          </div>`,
          mdFileId: html`<div class="fl section-mp">
            <div
              class="in fll ssr-shimmer-search-box"
              style="${renderCssAttr({
                style: {
                  width: '80%',
                  height: '30px',
                },
              })}"
            ></div>
          </div>`.repeat(random(2, 4)),
          ssr: true,
        })),
      });
    let firsUpdateEvent = false;
    let lastCid;
    let lastUserId;
    let loadingGetData = false;
    closeModalRouteChangeEvents[idPanel] = () => {
      setTimeout(() => {
        this.Data[idPanel].updatePanel();
      });
    };
    this.Data[idPanel].updatePanel = async (...args) => {
      const _updatePanel = async (...args) => {
        try {
          const cid = getQueryParams().cid ? getQueryParams().cid : '';
          const forceUpdate =
            Elements.Data.user.main.model &&
            Elements.Data.user.main.model.user &&
            Elements.Data.user.main.model.user._id &&
            lastUserId !== Elements.Data.user.main.model.user._id;

          logger.warn(
            {
              idPanel,
              cid,
              forceUpdate,
            },
            Elements.Data.user?.main?.model?.user
              ? JSON.stringify(Elements.Data.user.main.model.user, null, 4)
              : 'No user data',
          );

          // Normalize empty values for comparison (undefined, null, '' should all be treated as empty)
          const normalizedCid = cid || '';
          const normalizedLastCid = lastCid || '';

          if (loadingGetData || (normalizedLastCid === normalizedCid && !forceUpdate)) return;
          loadingGetData = true;
          lastUserId = Elements.Data.user?.main?.model?.user?._id
            ? newInstance(Elements.Data.user.main.model.user._id)
            : null;
          lastCid = cid;

          logger.warn('Init render panel data');

          this.Data[idPanel] = {
            ...this.Data[idPanel],
            originData: [],
            data: [],
            filesData: [],
            limit: 3, // Load 5 items per page
            hasMore: true,
            loading: false,
          };

          // Always reset skip to 0 when reloading (whether cid exists or not)
          this.Data[idPanel].skip = 0;

          const containerSelector = `.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`;
          htmls(containerSelector, await renderSrrPanelData());

          await getPanelData();

          htmls(
            containerSelector,
            html`
              <div class="in">${await panelRender({ data: this.Data[idPanel].data })}</div>
              <div class="in panel-placeholder-bottom panel-placeholder-bottom-${idPanel}"></div>
            `,
          );

          const lastOriginItem = this.Data[idPanel].originData[this.Data[idPanel].originData.length - 1];
          if (
            !this.Data[idPanel].lasIdAvailable ||
            !lastOriginItem ||
            this.Data[idPanel].lasIdAvailable !== lastOriginItem._id
          )
            LoadingAnimation.spinner.play(`.panel-placeholder-bottom-${idPanel}`, 'dual-ring-mini');

          const scrollContainerSelector = `.modal-${options.route}`;

          // Always remove old scroll event before setting new one
          if (this.Data[idPanel].removeScrollEvent) {
            this.Data[idPanel].removeScrollEvent();
          }

          if (cid) {
            LoadingAnimation.spinner.stop(`.panel-placeholder-bottom-${idPanel}`);
            return;
          }

          const { removeEvent } = Scroll.setEvent(scrollContainerSelector, async (payload) => {
            const panelData = PanelForm.Data[idPanel];
            if (!panelData) return;

            // Infinite scroll: load more items at bottom
            if (payload.atBottom && panelData.hasMore && !panelData.loading) {
              const oldDataCount = panelData.data.length;
              await getPanelData(true); // isLoadMore = true
              const newItems = panelData.data.slice(oldDataCount);
              if (newItems.length > 0) {
                for (const item of newItems)
                  append(`.${idPanel}-render`, await Panel.Tokens[idPanel].renderPanel(item));
              }
            }
          });
          this.Data[idPanel].removeScrollEvent = removeEvent;

          if (!firsUpdateEvent && options.firsUpdateEvent) {
            firsUpdateEvent = true;
            await options.firsUpdateEvent();
          }
        } catch (error) {
          logger.error(error);
        }
      };

      await _updatePanel(...args);
      loadingGetData = false;
    };
    if (options.route) {
      listenQueryPathInstance({
        id: options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body',
        routeId: options.route,
        event: async (path) => {
          // Don't manually clear arrays - updatePanel() will handle it if needed
          await PanelForm.Data[idPanel].updatePanel();
        },
      });
      if (!options.parentIdModal)
        Modal.Data['modal-menu'].onHome[idPanel] = async () => {
          lastCid = undefined;
          lastUserId = undefined;
          PanelForm.Data[idPanel] = {
            ...PanelForm.Data[idPanel],
            originData: [],
            data: [],
            filesData: [],
            skip: 0,
            limit: 3, // Load 5 items per page
            hasMore: true,
            loading: false,
          };
          setQueryPath({ path: options.route, queryPath: options.route === 'home' ? '?' : '' });
          await PanelForm.Data[idPanel].updatePanel();
        };
    }

    if (options.parentIdModal) {
      htmls(`.html-${options.parentIdModal}`, await renderSrrPanelData());
      return '';
    }

    return await renderSrrPanelData();
  },
};

export { PanelForm };
