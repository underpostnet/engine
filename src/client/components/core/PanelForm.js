import { capFirst, getCapVariableName, newInstance, PublicRoutes, range, timer, uniqueArray } from './CommonJs.js';
import { append, getBlobFromUint8ArrayFile, getDataFromInputFile, getRawContentFile, htmls, s, sa } from './VanillaJs.js';
import { Panel } from './Panel.js';
import { NotificationManager } from './NotificationManager.js';
import { DocumentService } from '../../services/document/document.service.js';
import { FileService } from '../../services/file/file.service.js';
import { getSrcFromFileData } from './Input.js';
import { renderMarkdown } from './Content.js';
import { renderCssAttr, darkTheme, ThemeEvents, subThemeManager, lightenHex, darkenHex } from './Css.js';
import { Translate } from './Translate.js';
import { Modal } from './Modal.js';
import {
  RouterEvents,
  closeModalRouteChangeEvents,
  getProxyPath,
  getPublicRoute,
  getPublicRouteParam,
  navigate,
  navigatePublicRoute,
  presentPublicRoute,
  publicRoutePath,
  setDocTitle,
} from './Router.js';
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
class PanelForm {
  static Data = {};
  static async instance(
    options = {
      idPanel: '',
      defaultUrlImage: '',
      appStore: {},
      parentIdModal: undefined,
      route: 'home',
      entryHost: false,
      htmlFormHeader: async () => '',
      firsUpdateEvent: async () => {},
      share: {
        copyLink: false,
        copySourceMd: false,
      },
      showCreatorProfile: false,
    },
  ) {
    const { idPanel, defaultUrlImage, appStore } = options;
    // The panel hosting `/entry/:stableSlug` lists one entry while that route is current.
    const currentEntrySlug = () => (options.entryHost ? getPublicRouteParam('entry') || '' : '');
    const hostPath = () => `${getProxyPath()}${options.route === 'home' ? '' : options.route}`;
    // Authenticated users don't need 'public' tag - they see all their own posts
    // Only include 'public' for unauthenticated users (handled by backend)
    let prefixTags = [idPanel];
    PanelForm.Data[idPanel] = {
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
      await Panel.instance({
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
        entryPath: options.entryHost ? (entry) => publicRoutePath('entry', entry.stableSlug) : undefined,
        onClick: options.entryHost ? ({ payload }) => navigatePublicRoute('entry', payload.stableSlug) : undefined,
        callBackPanelRender: async function (options) {
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
                    ${Translate.instance('confirm-delete-item')}
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
              // The deleted entry was the one on screen: fall back to the panel's full listing.
              if (status === 'success' && currentEntrySlug()) {
                navigate(hostPath());
                return { status };
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
                      htmls(containerSelector, await renderLoadedPanels());
                      revealPanels();
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
                      revealPanels();
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
            // Do NOT clear the file input here - the file should remain as-is when entering edit mode.
            // If user wants to remove the file, they use the "clean file" button.
            // If user wants to replace the file, they select a new file.
            // Unconditionally clearing the file here would cause the server to receive fileId: null on save.
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
                html: Translate.instance('require-title-and-content-or-file'),
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
            baseNewDoc.mdFileId = hasMdContent
              ? `<div class="markdown-content">${renderMarkdown(data.mdFileId)}</div>`
              : null;
            baseNewDoc.userId = appStore.Data.user?.main?.model?.user?._id;
            // Ensure profileImageId is properly formatted as object with _id property
            const profileImageIdValue = appStore.Data.user?.main?.model?.user?.profileImageId;
            const formattedProfileImageId = profileImageIdValue
              ? typeof profileImageIdValue === 'string'
                ? { _id: profileImageIdValue }
                : profileImageIdValue
              : null;
            baseNewDoc.userInfo = {
              username: appStore.Data.user?.main?.model?.user?.username,
              email: appStore.Data.user?.main?.model?.user?.email,
              _id: appStore.Data.user?.main?.model?.user?._id,
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
              // Track whether the file input was explicitly cleared (null) vs never had a file (undefined)
              // In edit mode, null means user cleared the file - we need to tell server to remove it
              const isFileCleared = data.fileId === null && editId;
              await (async () => {
                // When file is null, no markdown content, and not clearing a file, skip upload
                if (!file && !isFileCleared && !hasMdContent) return;
                // When user cleared file in edit mode, set fileId=null so server removes the reference
                if (isFileCleared) {
                  fileId = null;
                  return;
                }
                const body = new FormData();
                // Only append md file if it was created (has content)
                if (md) body.append('md', md);
                if (file) body.append('file', file);
                const { status, data: uploadedFiles } = await FileService.post({ body });
                // await timer(3000);
                NotificationManager.Push({
                  html: Translate.instance(`${status}-upload-file`),
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
                stableSlug: documentData.stableSlug,
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
                    ? Translate.instance('success-edit-post')
                    : Translate.instance('success-add-post')
                  : message,
              status: status,
            });
            // The panel now shows only the saved documents: a single one is an entry with its own URL
            // — the slug the server derived from its (possibly new) title — and title; anything else
            // re-renders the listing on the next update.
            if (status === 'success') {
              if (options.entryHost && documents.length === 1) {
                presentPublicRoute('entry', documents[0].stableSlug, { idModal: options.parentIdModal });
                setDocTitle(PublicRoutes.entry.namespace, capFirst(`${documents[0].title}`.trim()));
                renderedEntrySlug = documents[0].stableSlug;
              } else renderedEntrySlug = null;
            }
            return { data: documents, status, message };
          },
        },
      });
    const getPanelData = async (isLoadMore = false) => {
      const panelData = PanelForm.Data[idPanel];
      logger.warn('getPanelData called, isLoadMore:', isLoadMore);
      try {
        const entrySlug = currentEntrySlug();
        // A single entry bypasses pagination and loading checks
        if (!entrySlug) {
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
        let result, documents, lastId;
        if (entrySlug) {
          // An unknown or unreadable entry renders the panel's empty state rather than an error.
          result = await DocumentService.getBySlug({ stableSlug: entrySlug, idPanel });
          documents = result.status === 'success' ? [result.data] : [];
          // The entry titles its path, as the server titled the shell it served for it.
          if (documents[0]?.title && getPublicRouteParam('entry') === entrySlug)
            setDocTitle(PublicRoutes.entry.namespace, capFirst(documents[0].title.trim()));
          lastId = null;
          result = { status: 'success' };
        } else {
          result = await DocumentService.get({
            params: { tags: prefixTags.join(','), skip: panelData.skip, limit: panelData.limit },
            id: 'public/',
          });
          documents = result.data?.data ?? [];
          lastId = result.data?.lastId ?? null;
        }
        if (result.status === 'success') {
          if (!isLoadMore) {
            panelData.originData = [];
            panelData.filesData = [];
            panelData.data = [];
          }
          panelData.originData.push(...newInstance(documents));
          panelData.lasIdAvailable = lastId;
          for (const documentObject of documents) {
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
                      parsedMarkdown = mdPlain ? `<div class="markdown-content">${renderMarkdown(mdPlain)}</div>` : '';
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
                  appStore.Data.user?.main?.model?.user?._id &&
                  documentObject.userId._id === appStore.Data.user.main.model.user._id,
                _id: documentObject._id,
                stableSlug: documentObject.stableSlug,
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
                  appStore.Data.user?.main?.model?.user?._id &&
                  documentObject.userId._id === appStore.Data.user.main.model.user._id,
                _id: documentObject._id,
                stableSlug: documentObject.stableSlug,
                totalCopyShareLinkCount: documentObject.totalCopyShareLinkCount || 0,
                isPublic: documentObject.isPublic || false,
              });
            }
          }
          if (!entrySlug) {
            panelData.skip += documents.length;
            panelData.hasMore = documents.length === panelData.limit;
          } else {
            // A single entry has nothing further to scroll to
            panelData.hasMore = false;
          }
          const lastItem = documents[documents.length - 1];
          if (documents.length === 0 || (lastItem && lastItem._id === panelData.lasIdAvailable)) {
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
    // Items fade down into place one after another, top to bottom, skeleton and loaded alike: each
    // starts hidden just above its slot and the next one begins a step later. Only items not yet
    // revealed take part, so a page the infinite scroll appends staggers from its own first item,
    // not from the top. The animation class comes off again once it has played, so a settled item
    // keeps no transform of its own (a filling animation would leave it as a containing block).
    // While the splash still covers the shell the reveal waits for it to lift, or it would play
    // unseen: the main body's skeleton at boot, and whatever loads before the splash goes.
    const PANEL_FADE_STEP_MS = 90;
    const panelFadeStyle = html`<style>
      .${idPanel}-fade-in {
        animation: ${idPanel}-fade-in 0.45s ease-out both;
      }
      @keyframes ${idPanel}-fade-in {
        from {
          opacity: 0;
          transform: translateY(-16px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .${idPanel}-fade-in {
          animation: none;
        }
      }
    </style>`;
    const revealPanels = () => {
      if (LoadingAnimation.splashScreenVisible()) {
        LoadingAnimation.onRemoveSplashScreen[idPanel] = revealPanels;
        return;
      }
      sa(`.${idPanel}-render > .${idPanel}:not(.${idPanel}-revealed)`).forEach((item, index) => {
        item.classList.add(`${idPanel}-revealed`, `${idPanel}-fade-in`);
        item.style.animationDelay = `${index * PANEL_FADE_STEP_MS}ms`;
        const onEnd = (e) => {
          // Animations inside the item (spinners, shimmers) bubble here too; only ours counts.
          if (e.target !== item || e.animationName !== `${idPanel}-fade-in`) return;
          item.removeEventListener('animationend', onEnd);
          item.classList.remove(`${idPanel}-fade-in`);
          item.style.animationDelay = '';
        };
        item.addEventListener('animationend', onEnd);
      });
    };
    // Skeleton shown while the panel loads: entry-shaped items with fixed line lengths — one for
    // a single entry, a page's worth for the listing — so it paints once and holds still until the
    // data replaces it.
    const skeletonLine = (width, height, margin = '0') =>
      html`<div
        class="inl ssr-shimmer-search-box"
        style="${renderCssAttr({ style: { width, height, margin, 'border-radius': '6px', 'vertical-align': 'middle' } })}"
      ></div>`;
    const renderSSRPanelData = async () =>
      html`<div class="in ${idPanel}-skeleton">
        ${panelFadeStyle}
        ${await panelRender({
          data: range(0, currentEntrySlug() ? 0 : PanelForm.Data[idPanel].limit - 1).map((id) => ({
            id,
            title: skeletonLine('60%', '20px'),
            createdAt: skeletonLine('35%', '12px'),
            mdFileId: html`<div class="in section-mp">
              ${['100%', '92%', '76%'].map((width) => skeletonLine(width, '14px', '6px 0')).join('')}
            </div>`,
            ssr: true,
          })),
        })}
      </div>`;
    // The loaded list: the fade rules, the rendered panels and the placeholder the spinner uses.
    const renderLoadedPanels = async () => html`
      ${panelFadeStyle}
      <div class="in">${await panelRender({ data: PanelForm.Data[idPanel].data })}</div>
      <div class="in panel-placeholder-bottom panel-placeholder-bottom-${idPanel}"></div>
    `;
    let firsUpdateEvent = false;
    // Entry slug the panel last rendered ('' for the listing); `null` forces the next update to render.
    let renderedEntrySlug = null;
    let lastUserId;
    let loadingGetData = false;
    // The panel's own routes: its listing route, and `/entry/…` when it hosts entries.
    const panelRoute = options.route === 'home' ? '' : options.route;
    const isPanelRoute = (route) => route === panelRoute || (options.entryHost && route === PublicRoutes.entry.namespace);
    const currentRoute = () => {
      const publicRoute = getPublicRoute();
      if (publicRoute) return publicRoute.namespace;
      return window.location.pathname.slice(getProxyPath().length).replace(/\/+$/, '');
    };
    // A view closing restores the path of whatever is now on top. Only refresh when that is this
    // panel: a settings view closing over a profile that sits over an entry must not re-list the
    // panel under the profile (and leave that listing there if the profile closes mid-load).
    closeModalRouteChangeEvents[idPanel] = () => {
      setTimeout(() => {
        if (!options.route || isPanelRoute(currentRoute())) PanelForm.Data[idPanel].updatePanel();
      });
    };
    PanelForm.Data[idPanel].updatePanel = async (...args) => {
      const _updatePanel = async (...args) => {
        try {
          const entrySlug = currentEntrySlug();
          const forceUpdate =
            appStore.Data.user.main.model &&
            appStore.Data.user.main.model.user &&
            appStore.Data.user.main.model.user._id &&
            lastUserId !== appStore.Data.user.main.model.user._id;
          logger.warn(
            {
              idPanel,
              entrySlug,
              forceUpdate,
            },
            appStore.Data.user?.main?.model?.user
              ? JSON.stringify(appStore.Data.user.main.model.user, null, 4)
              : 'No user data',
          );
          if (loadingGetData || (renderedEntrySlug === entrySlug && !forceUpdate)) return;
          loadingGetData = true;
          lastUserId = appStore.Data.user?.main?.model?.user?._id
            ? newInstance(appStore.Data.user.main.model.user._id)
            : null;
          renderedEntrySlug = entrySlug;
          logger.warn('instance render panel data');
          PanelForm.Data[idPanel] = {
            ...PanelForm.Data[idPanel],
            originData: [],
            data: [],
            filesData: [],
            limit: 3, // Load 5 items per page
            hasMore: true,
            loading: false,
          };
          PanelForm.Data[idPanel].skip = 0;
          const containerSelector = `.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`;
          if (!s(`${containerSelector} .${idPanel}-skeleton`)) {
            htmls(containerSelector, await renderSSRPanelData());
            revealPanels();
          }
          await getPanelData();
          htmls(containerSelector, await renderLoadedPanels());
          revealPanels();
          const lastOriginItem = PanelForm.Data[idPanel].originData[PanelForm.Data[idPanel].originData.length - 1];
          if (
            !PanelForm.Data[idPanel].lasIdAvailable ||
            !lastOriginItem ||
            PanelForm.Data[idPanel].lasIdAvailable !== lastOriginItem._id
          )
            LoadingAnimation.spinner.play(`.panel-placeholder-bottom-${idPanel}`, 'dual-ring-mini');
          const scrollContainerSelector = `.modal-${options.route}`;
          // Always remove old scroll event before setting new one
          if (PanelForm.Data[idPanel].removeScrollEvent) {
            PanelForm.Data[idPanel].removeScrollEvent();
          }
          if (entrySlug) {
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
                revealPanels();
              }
            }
          });
          PanelForm.Data[idPanel].removeScrollEvent = removeEvent;
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
      RouterEvents[`panel-form-${idPanel}`] = ({ route }) => {
        if (isPanelRoute(route)) setTimeout(() => PanelForm.Data[idPanel].updatePanel());
      };
      // A panel inside a view is created after the router rendered its route, so it loads itself.
      if (panelRoute) setTimeout(() => PanelForm.Data[idPanel].updatePanel());
      if (!options.parentIdModal)
        Modal.Data['modal-menu'].onHome[idPanel] = async () => {
          renderedEntrySlug = null;
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
          await PanelForm.Data[idPanel].updatePanel();
        };
    }
    if (options.parentIdModal) {
      htmls(`.html-${options.parentIdModal}`, await renderSSRPanelData());
      revealPanels();
      return '';
    }
    // The shell inserts this skeleton into the main body under the splash; it fades in once that lifts.
    LoadingAnimation.onRemoveSplashScreen[idPanel] = revealPanels;
    return await renderSSRPanelData();
  }
}
export { PanelForm };
