import { getApiBaseUrl } from '../../services/core/core.service.js';
import { DocumentService } from '../../services/document/document.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from './AgGrid.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { getSubpaths, uniqueArray } from './CommonJs.js';
import { Css, darkTheme, dynamicCol, renderCssAttr, Themes } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { fileFormDataFactory, Input, InputFile } from './Input.js';
import { loggerFactory } from './Logger.js';
import { Modal, renderViewTitle } from './Modal.js';
import { NotificationManager } from './NotificationManager.js';
import { RouterEvents } from './Router.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { copyData, downloadFile, s } from './VanillaJs.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams, listenQueryParamsChange } from './Router.js';

const logger = loggerFactory(import.meta);

class LoadFolderRenderer {
  eGui;

  async init(params) {
    console.log('LoadFolderRenderer created', params);
    // params.data._id

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`<i class="fas fa-folder"></i> ${params.data.location}`;
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadFolderRenderer refreshed', params);
    return true;
  }
}

class LoadFileNameRenderer {
  eGui;

  async init(params) {
    console.log('LoadFileNameRenderer created', params);
    // params.data._id

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`<i class="fas fa-file"></i> ${params.data.name}`;
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadFileNameRenderer refreshed', params);
    return true;
  }
}

class FolderHeaderComp {
  eGui;

  async init(params) {
    console.log('FolderHeaderComp created', params);
    // params.data._id

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`<i class="fas fa-file"></i>`;
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('FolderHeaderComp refreshed', params);
    return true;
  }
}

const FileExplorer = {
  Api: {},
  Render: async function (options = { idModal: '' }) {
    const { idModal } = options;
    FileExplorer.Api[idModal] = options;
    const gridFolderId = 'folder-explorer-grid';
    const gridFileId = 'file-explorer-grid';
    const idDropFileInput = 'file-explorer';
    let formBodyFiles;
    const query = getQueryParams();
    let location = query?.location ? this.locationFormat({ f: query }) : '/';
    let files, folders, documentId, documentInstance;

    // Simple pagination state
    const PAGE_SIZE = 5;
    let currentPage = query?.page ? parseInt(query.page) - 1 : 0;
    if (currentPage < 0) currentPage = 0;
    let displayedFiles = [];

    // Search filter state - initialize from URL query param
    let searchFilters = {
      title: query?.title || '',
      mdFile: query?.mdFile || '',
      file: query?.file || '',
    };
    let filteredFiles = [];
    let isProcessingQueryChange = false; // Prevent recursion during URL sync
    const queryParamsListenerId = `file-explorer-${idModal}`;
    const cleanData = () => {
      files = [];
      folders = [];
      documentId = '';
      documentInstance = [];
    };
    cleanData();
    const applySearchFilter = () => {
      filteredFiles = files;
    };

    const updatePaginationUI = () => {
      const paginationInfo = s(`.file-explorer-pagination-info`);
      const prevBtn = s(`.file-explorer-prev-btn`);
      const nextBtn = s(`.file-explorer-next-btn`);
      if (paginationInfo) {
        const totalPages = Math.ceil(filteredFiles.length / PAGE_SIZE);
        const showing =
          searchFilters.title || searchFilters.mdFile || searchFilters.file
            ? `${filteredFiles.length}/${files.length}`
            : `${files.length}`;
        paginationInfo.textContent = `${currentPage + 1} / ${totalPages || 1} (${showing} files)`;
      }
      if (prevBtn) {
        prevBtn.disabled = currentPage === 0;
        prevBtn.style.opacity = currentPage === 0 ? '0.5' : '1';
        prevBtn.style.cursor = currentPage === 0 ? 'not-allowed' : 'pointer';
      }
      if (nextBtn) {
        const isDisabled = (currentPage + 1) * PAGE_SIZE >= filteredFiles.length;
        nextBtn.disabled = isDisabled;
        nextBtn.style.opacity = isDisabled ? '0.5' : '1';
        nextBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
      }
    };

    const getPagedFiles = () => {
      const start = currentPage * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      return filteredFiles.slice(start, end);
    };

    FileExplorer.Api[idModal].displayList = async () => {
      if (!s(`.${idModal}`)) return;
      const query = getQueryParams();
      location = query?.location ? this.locationFormat({ f: query }) : '/';
      s(`.file-explorer-query-nav`).value = location;

      // Sync search filters from URL
      searchFilters = {
        title: query?.title || '',
        mdFile: query?.mdFile || '',
        file: query?.file || '',
      };

      if (s(`.file-explorer-search-title`)) s(`.file-explorer-search-title`).value = searchFilters.title;
      if (s(`.file-explorer-search-md-file`)) s(`.file-explorer-search-md-file`).value = searchFilters.mdFile;
      if (s(`.file-explorer-search-file`)) s(`.file-explorer-search-file`).value = searchFilters.file;

      const format = this.documentDataFormat({ document: documentInstance, location, searchFilters });
      files = format.files;
      folders = format.folders;
      applySearchFilter();
      const queryPage = query?.page ? parseInt(query.page) - 1 : 0;
      currentPage = queryPage >= 0 ? queryPage : 0;
      displayedFiles = getPagedFiles();
      AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
      AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
      updatePaginationUI();
    };
    FileExplorer.Api[idModal].updateData = async (optionsUpdate = { display: false }) => {
      if (!s(`.${idModal}`)) return;
      if (Auth.getToken()) {
        try {
          const { status, data: responseData } = await DocumentService.get({
            params: {
              searchTitle: searchFilters.title,
              searchMdFile: searchFilters.mdFile,
              searchFile: searchFilters.file,
              location,
            },
          });
          // Handle both old format (array) and new format with pagination
          const document = Array.isArray(responseData) ? responseData : responseData.data || [];
          const format = this.documentDataFormat({ document, location, searchFilters });
          files = format.files;
          documentId = format.documentId;
          folders = format.folders;
          documentInstance = document;
          applySearchFilter();
        } catch (error) {
          logger.error(error);
          NotificationManager.Push({
            html: error.message,
            status: 'error',
          });
        }
      } else cleanData();
      setTimeout(async () => {
        if (s(`.${idModal}`) && optionsUpdate && optionsUpdate.display) await FileExplorer.Api[idModal].displayList();
      });
    };

    RouterEvents['file-explorer'] = ({ path, pushPath, route }) => {
      if (route === 'cloud')
        setTimeout(async () => {
          // await this.Api[idModal].updateData();
          await FileExplorer.Api[idModal].displayList();
        });
    };

    // Listen for query param changes (browser back/forward navigation)
    listenQueryParamsChange({
      id: queryParamsListenerId,
      event: async (queryParams) => {
        if (!s(`.${idModal}`)) return;
        if (isProcessingQueryChange) return;

        const tab = queryParams?.tab || '';
        if (tab === 'upload') {
          s(`.file-explorer-nav`).style.display = 'none';
          s(`.file-explorer-uploader`).style.display = 'block';
        } else {
          s(`.file-explorer-nav`).style.display = 'block';
          s(`.file-explorer-uploader`).style.display = 'none';
        }

        const page = queryParams?.page ? parseInt(queryParams.page) - 1 : 0;
        if (page !== currentPage) {
          currentPage = page >= 0 ? page : 0;
          displayedFiles = getPagedFiles();
          if (AgGrid.grids[gridFileId]) {
            AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
          }
          updatePaginationUI();
        }

        const newFilters = {
          title: queryParams?.title || '',
          mdFile: queryParams?.mdFile || '',
          file: queryParams?.file || '',
        };

        if (
          newFilters.title !== searchFilters.title ||
          newFilters.mdFile !== searchFilters.mdFile ||
          newFilters.file !== searchFilters.file
        ) {
          isProcessingQueryChange = true;
          searchFilters = newFilters;

          if (s(`.file-explorer-search-title`)) s(`.file-explorer-search-title`).value = searchFilters.title;
          if (s(`.file-explorer-search-md-file`)) s(`.file-explorer-search-md-file`).value = searchFilters.mdFile;
          if (s(`.file-explorer-search-file`)) s(`.file-explorer-search-file`).value = searchFilters.file;

          await FileExplorer.Api[idModal].updateData({ display: true });

          setTimeout(() => {
            isProcessingQueryChange = false;
          }, 100);
        }
      },
    });

    // Pagination button event handlers
    setTimeout(() => {
      EventsUI.onClick(`.file-explorer-prev-btn`, (e) => {
        e.preventDefault();
        if (currentPage > 0) {
          setQueryParams({ page: currentPage }, { replace: false });
        }
      });

      EventsUI.onClick(`.file-explorer-next-btn`, (e) => {
        e.preventDefault();
        if ((currentPage + 1) * PAGE_SIZE < filteredFiles.length) {
          setQueryParams({ page: currentPage + 2 }, { replace: false });
        }
      });

      // Search input handlers
      let searchTimeout;

      const setupSearchInput = (selector, key) => {
        const el = s(selector);
        if (el) {
          if (searchFilters[key]) el.value = searchFilters[key];
          el.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
              const val = e.target.value.trim();
              if (val === searchFilters[key]) return;

              isProcessingQueryChange = true;
              searchFilters[key] = val;
              await FileExplorer.Api[idModal].updateData({ display: true });

              const queryParams = {};
              if (searchFilters.title) queryParams.title = searchFilters.title;
              if (searchFilters.mdFile) queryParams.mdFile = searchFilters.mdFile;
              if (searchFilters.file) queryParams.file = searchFilters.file;

              if (!searchFilters.title) queryParams.title = null;
              if (!searchFilters.mdFile) queryParams.mdFile = null;
              if (!searchFilters.file) queryParams.file = null;

              queryParams.page = 1;

              setQueryParams(queryParams, { replace: false });

              setTimeout(() => {
                isProcessingQueryChange = false;
              }, 100);
            }, 300);
          });
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.preventDefault();
          });
        }
      };

      setupSearchInput(`.file-explorer-search-title`, 'title');
      setupSearchInput(`.file-explorer-search-md-file`, 'mdFile');
      setupSearchInput(`.file-explorer-search-file`, 'file');

      // Submit search button
      EventsUI.onClick(`.file-explorer-search-submit`, async (e) => {
        e.preventDefault();
        clearTimeout(searchTimeout);

        const titleVal = s(`.file-explorer-search-title`)?.value.trim() || '';
        const mdFileVal = s(`.file-explorer-search-md-file`)?.value.trim() || '';
        const fileVal = s(`.file-explorer-search-file`)?.value.trim() || '';

        searchFilters = { title: titleVal, mdFile: mdFileVal, file: fileVal };

        isProcessingQueryChange = true;

        const queryParams = {};
        if (searchFilters.title) queryParams.title = searchFilters.title;
        if (searchFilters.mdFile) queryParams.mdFile = searchFilters.mdFile;
        if (searchFilters.file) queryParams.file = searchFilters.file;

        if (!searchFilters.title) queryParams.title = null;
        if (!searchFilters.mdFile) queryParams.mdFile = null;
        if (!searchFilters.file) queryParams.file = null;

        queryParams.page = 1;

        setQueryParams(queryParams, { replace: false });

        await FileExplorer.Api[idModal].updateData({ display: true });

        setTimeout(() => {
          isProcessingQueryChange = false;
        }, 100);
      });

      // Clear search button
      EventsUI.onClick(`.file-explorer-search-clear`, (e) => {
        e.preventDefault();

        if (!searchFilters.title && !searchFilters.mdFile && !searchFilters.file) return;

        isProcessingQueryChange = true;
        if (s(`.file-explorer-search-title`)) s(`.file-explorer-search-title`).value = '';
        if (s(`.file-explorer-search-md-file`)) s(`.file-explorer-search-md-file`).value = '';
        if (s(`.file-explorer-search-file`)) s(`.file-explorer-search-file`).value = '';

        searchFilters = { title: '', mdFile: '', file: '' };

        applySearchFilter();
        currentPage = 0;
        displayedFiles = getPagedFiles();
        AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
        updatePaginationUI();

        setQueryParams({ title: null, mdFile: null, file: null, page: 1 }, { replace: false });

        setTimeout(() => {
          isProcessingQueryChange = false;
        }, 100);
      });
    });

    setTimeout(async () => {
      FileExplorer.Api[idModal].updateData({ display: true });
      const formData = [
        {
          model: 'location',
          id: `file-explorer-query-nav`,
          rules: [], // { type: 'isEmpty' }
        },
      ];
      const validators = await Validator.instance(formData);

      EventsUI.onClick(`.btn-input-file-explorer`, async (e) => {
        e.preventDefault();

        // Check authentication before upload
        if (!Auth.getToken()) {
          return NotificationManager.Push({
            html: Translate.Render(`error-user-not-authenticated`),
            status: 'error',
          });
        }

        const { errorMessage } = await validators();
        if (!formBodyFiles)
          return NotificationManager.Push({
            html: Translate.Render(`warning-upload-no-selects-file`),
            status: 'warning',
          });
        if (errorMessage) return;
        let fileData;
        {
          const { status, data } = await FileService.post({ body: formBodyFiles });
          if (status === 'error' || !data) {
            return NotificationManager.Push({
              html: Translate.Render(`error-upload-file`),
              status: 'error',
            });
          }
          fileData = data;
        }
        {
          // const body = {};
          // for (const inputData of formData) {
          //   if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
          // }
          location = this.locationFormat({ f: { location: s(`.file-explorer-query-nav`).value } });
          let status = 'success';
          for (const file of fileData) {
            const result = await DocumentService.post({
              body: {
                fileId: file._id,
                location,
                title: file.name,
              },
            });
            if (result.status === 'success') documentInstance.push({ ...result.data, fileId: file });
            else if (status !== 'error') status = 'error';
          }
          const format = this.documentDataFormat({ document: documentInstance, location });
          files = format.files;
          folders = format.folders;
          applySearchFilter();
          currentPage = 0;
          displayedFiles = getPagedFiles();
          AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
          AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
          updatePaginationUI();
          NotificationManager.Push({
            html: Translate.Render(`${status}-upload-file`),
            status,
          });
          if (status === 'success') {
            // Clear the file input
            s(`.btn-clear-input-file-${idDropFileInput}`).click();
            // Switch to explorer view with the uploaded location
            setQueryParams({ tab: null, location: location }, { replace: false });
            // Show explorer view, hide upload view
            s(`.file-explorer-nav`).style.display = 'block';
            s(`.file-explorer-uploader`).style.display = 'none';
            s(`.file-explorer-query-nav`).value = location;
          }
        }
      });

      EventsUI.onClick(`.btn-input-go-explorer`, async (e) => {
        e.preventDefault();
        const newLocation = this.locationFormat({ f: { location: s(`.file-explorer-query-nav`).value } });
        if (newLocation === location) return;
        location = newLocation;
        setPath(`${window.location.pathname}?location=${location}`);
        s(`.file-explorer-query-nav`).value = location;
        // const format = this.documentDataFormat({ document: documentInstance, location });
        await FileExplorer.Api[idModal].updateData({ display: true });
      });
      EventsUI.onClick(`.btn-input-home-directory`, async (e) => {
        e.preventDefault();

        if (getQueryParams()?.tab === 'upload') {
          setQueryParams({ tab: null }, { replace: false });
          return;
        }

        let newLocation = '/';
        if (newLocation === location) return;
        location = newLocation;
        setPath(`${window.location.pathname}?location=${location}`);
        s(`.file-explorer-query-nav`).value = location;
        const format = this.documentDataFormat({ document: documentInstance, location });
        files = format.files;
        folders = format.folders;
        applySearchFilter();
        currentPage = 0;
        displayedFiles = getPagedFiles();
        AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
        updatePaginationUI();
      });
      EventsUI.onClick(`.btn-input-copy-directory`, async (e) => {
        e.preventDefault();
        await copyData(window.location.href);
        NotificationManager.Push({
          html: Translate.Render('success-copy-data'),
          status: 'success',
        });
      });
      EventsUI.onClick(`.btn-input-back-explorer`, async (e) => {
        e.preventDefault();
        window.history.back();
      });
      EventsUI.onClick(`.btn-input-forward-explorer`, async (e) => {
        e.preventDefault();
        window.history.forward();
      });
      EventsUI.onClick(`.btn-input-upload-file`, async (e) => {
        e.preventDefault();
        setQueryParams({ tab: 'upload' }, { replace: false });
      });
    });

    class LoadFileActionsRenderer {
      eGui;

      async init(params) {
        console.log('LoadFileActionsRenderer created', params);
        // params.data._id

        this.eGui = document.createElement('div');
        const isPublic = params.data.isPublic;
        const toggleId = `toggle-public-${params.data._id}`;
        this.eGui.innerHTML = html`
          <div class="fl">
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-download-${params.data._id}`,
              label: html` <i class="fas fa-download"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-delete-${params.data._id}`,
              label: html` <i class="fa-solid fa-circle-xmark"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-view-${params.data._id}`,
              label: html` <i class="fas fa-eye"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-copy-content-link-${params.data._id}`,
              label: html`<i class="fas fa-copy"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-edit-${params.data._id}`,
              label: html`<i class="fas fa-edit"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini ${toggleId}`,
              label: isPublic
                ? html`<i class="fas fa-globe" style="color: #4caf50;"></i>`
                : html`<i class="fas fa-lock" style="color: #9e9e9e;"></i>`,
              type: 'button',
            })}
          </div>
        `;

        setTimeout(() => {
          const uri = `${getProxyPath()}content/?cid=${params.data._id}`;
          const url = `${window.location.origin}${uri}`;

          const originObj = documentInstance.find((d) => d._id === params.data._id);
          const blobUri =
            originObj && originObj.fileId
              ? getApiBaseUrl({ id: originObj.fileId._id, endpoint: 'file/blob' })
              : undefined;

          if (!originObj) {
            s(`.btn-file-view-${params.data._id}`).classList.add('hide');
            s(`.btn-file-copy-content-link-${params.data._id}`).classList.add('hide');
          }

          EventsUI.onClick(`.btn-file-view-${params.data._id}`, async (e) => {
            e.preventDefault();
            if (location.href !== url) {
              setPath(uri);
              s(`.main-btn-content`).click();
            }
          });

          EventsUI.onClick(`.btn-file-copy-content-link-${params.data._id}`, async (e) => {
            e.preventDefault();
            await copyData(blobUri);
            NotificationManager.Push({
              html: Translate.Render('success-copy-data'),
              status: 'success',
            });
          });

          EventsUI.onClick(`.btn-file-download-${params.data._id}`, async (e) => {
            e.preventDefault();
            try {
              // Use FileService with blob/ prefix for centralized blob fetching
              const { data: blobArray, status } = await FileService.get({ id: `blob/${params.data.fileId}` });
              if (status === 'success' && blobArray && blobArray[0]) {
                downloadFile(blobArray[0], params.data.name);
              } else {
                throw new Error('Failed to fetch file blob');
              }
            } catch (error) {
              logger.error('Download failed:', error);
              NotificationManager.Push({
                html: 'Download failed',
                status: 'error',
              });
            }
          });
          EventsUI.onClick(
            `.btn-file-delete-${params.data._id}`,
            async (e) => {
              e.preventDefault();
              {
                const confirmResult = await Modal.RenderConfirm({
                  html: async () => {
                    return html`
                      <div class="in section-mp" style="text-align: center">
                        ${Translate.Render('confirm-delete-item')}
                        <br />
                        "${params.data.title}"
                      </div>
                    `;
                  },
                  id: `delete-${params.data._id}`,
                });
                if (confirmResult.status !== 'confirm') return;

                const { data, status, message } = await FileService.delete({
                  id: params.data.fileId,
                });
                NotificationManager.Push({
                  html: status,
                  status,
                });
                if (status === 'error') return;
              }
              const { data, status, message } = await DocumentService.delete({
                id: params.data._id,
              });
              NotificationManager.Push({
                html: status,
                status,
              });
              if (status === 'error') return;

              documentInstance = documentInstance.filter((f) => f._id !== params.data._id);
              const format = FileExplorer.documentDataFormat({ document: documentInstance, location });
              files = format.files;
              folders = format.folders;
              applySearchFilter();
              // AgGrid.grids[gridFileId].setGridOption('rowData', files);
              // const selectedData = gridApi.getSelectedRows();
              AgGrid.grids[gridFileId].applyTransaction({ remove: [params.data] });
              AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
              updatePaginationUI();
            },
            { context: 'modal' },
          );

          // Toggle public/private status
          EventsUI.onClick(
            `.${toggleId}`,
            async (e) => {
              e.preventDefault();

              // If document is currently private, show confirmation before making public
              if (!params.data.isPublic) {
                const confirmResult = await Modal.RenderConfirm({
                  html: async () => {
                    return html`
                      <div class="in section-mp" style="text-align: center">
                        ${Translate.Render('confirm-make-public')}
                        <br />
                        "${params.data.title}"
                      </div>
                    `;
                  },
                  id: `confirm-toggle-public-${params.data._id}`,
                });
                if (confirmResult.status !== 'confirm') return;
              }

              try {
                const { data, status } = await DocumentService.patch({
                  id: params.data._id,
                  action: 'toggle-public',
                });

                if (status === 'success') {
                  // Update local data
                  params.data.isPublic = data.isPublic;

                  // Update documentInstance
                  const docIndex = documentInstance.findIndex((d) => d._id === params.data._id);
                  if (docIndex !== -1) {
                    documentInstance[docIndex].isPublic = data.isPublic;
                  }

                  // Update button icon
                  const btnElement = s(`.${toggleId}`);
                  if (btnElement) {
                    const iconElement = btnElement.querySelector('i');
                    if (iconElement) {
                      if (data.isPublic) {
                        iconElement.className = 'fas fa-globe';
                        iconElement.style.color = '#4caf50';
                      } else {
                        iconElement.className = 'fas fa-lock';
                        iconElement.style.color = '#9e9e9e';
                      }
                    }
                  }

                  NotificationManager.Push({
                    html: data.isPublic
                      ? Translate.Render('document-now-public')
                      : Translate.Render('document-now-private'),
                    status: 'success',
                  });
                } else {
                  throw new Error('Failed to toggle public status');
                }
              } catch (error) {
                logger.error('Toggle public failed:', error);
                NotificationManager.Push({
                  html: Translate.Render('error-toggle-public'),
                  status: 'error',
                });
              }
            },
            { context: 'modal' },
          );

          // Edit document button
          EventsUI.onClick(
            `.btn-file-edit-${params.data._id}`,
            async (e) => {
              e.preventDefault();

              // Get the original document data from documentInstance
              const originDoc = documentInstance.find((d) => d._id === params.data._id);
              const editModalId = `edit-doc-${params.data._id}`;

              // Check file existence for proper UX
              const hasMdFile = !!(originDoc && originDoc.mdFileId);
              const hasGenericFile = !!(originDoc && originDoc.fileId);

              const mdFileMimetype = hasMdFile ? originDoc.mdFileId.mimetype : '';
              const genericFileMimetype = hasGenericFile ? originDoc.fileId.mimetype : '';

              const editFormHtml = async () => {
                return html`
                  <div class="in edit-document-form" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <!-- Header -->
                    <div
                      class="in"
                      style="text-align: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid rgba(128,128,128,0.3);"
                    >
                      <p style="color: #888; font-size: 14px; margin: 0;">
                        ${Translate.Render('editing')}: <strong style="color: inherit;">${params.data.title}</strong>
                      </p>
                    </div>

                    <!-- Document Title -->
                    <div class="in section-mp" style="margin-bottom: 20px;">
                      ${await Input.Render({
                        id: `edit-doc-title-${params.data._id}`,
                        type: 'text',
                        label: html`<i class="fas fa-heading"></i> ${Translate.Render('doc-title')}`,
                        containerClass: 'in section-mp input-container-width',
                        placeholder: true,
                        value: params.data.title || '',
                      })}
                    </div>

                    <!-- MD File Name -->
                    <div class="in section-mp" style="margin-bottom: 20px;">
                      ${hasMdFile
                        ? await Input.Render({
                            id: `edit-doc-md-file-${params.data._id}`,
                            type: 'text',
                            label: html`<i class="fas fa-file-code"></i> ${Translate.Render('md-file-name')}
                              <span style="font-size: 11px; color: #888; margin-left: 8px;">(${mdFileMimetype})</span>`,
                            containerClass: 'in section-mp input-container-width',
                            placeholder: true,
                            value: params.data.mdFileName || '',
                          })
                        : html`
                            <div class="in section-mp input-container-width" style="opacity: 0.6;">
                              <label style="display: block; margin-bottom: 5px;">
                                <i class="fas fa-file-code"></i> ${Translate.Render('md-file-name')}
                              </label>
                              <div
                                style="padding: 10px 12px; border: 1px dashed rgba(128,128,128,0.5); border-radius: 4px; color: #888; font-style: italic;"
                              >
                                <i class="fas fa-info-circle"></i> ${Translate.Render('no-md-file-attached')}
                              </div>
                            </div>
                          `}
                    </div>

                    <!-- Generic File Name -->
                    <div class="in section-mp" style="margin-bottom: 20px;">
                      ${hasGenericFile
                        ? await Input.Render({
                            id: `edit-doc-file-${params.data._id}`,
                            type: 'text',
                            label: html`<i class="fas fa-file"></i> ${Translate.Render('generic-file-name')}
                              <span style="font-size: 11px; color: #888; margin-left: 8px;"
                                >(${genericFileMimetype})</span
                              >`,
                            containerClass: 'in section-mp input-container-width',
                            placeholder: true,
                            value: params.data.fileName || '',
                          })
                        : html`
                            <div class="in section-mp input-container-width" style="opacity: 0.6;">
                              <label style="display: block; margin-bottom: 5px;">
                                <i class="fas fa-file"></i> ${Translate.Render('generic-file-name')}
                              </label>
                              <div
                                style="padding: 10px 12px; border: 1px dashed rgba(128,128,128,0.5); border-radius: 4px; color: #888; font-style: italic;"
                              >
                                <i class="fas fa-info-circle"></i> ${Translate.Render('no-generic-file-attached')}
                              </div>
                            </div>
                          `}
                    </div>

                    <!-- Location -->
                    <div class="in section-mp" style="margin-bottom: 25px;">
                      ${await Input.Render({
                        id: `edit-doc-location-${params.data._id}`,
                        type: 'text',
                        label: html`<i class="fas fa-folder"></i> ${Translate.Render('location')}`,
                        containerClass: 'in section-mp input-container-width',
                        placeholder: true,
                        value: params.data.location || '/',
                      })}
                    </div>

                    <!-- Buttons -->
                    <div
                      class="fl"
                      style="margin-top: 30px; border-top: 1px solid rgba(128,128,128,0.3); padding-top: 20px;"
                    >
                      <div class="in fll" style="width: 50%; padding: 5px;">
                        ${await BtnIcon.Render({
                          class: `in wfa btn-edit-doc-cancel-${params.data._id}`,
                          label: html`<i class="fas fa-times"></i> ${Translate.Render('cancel')}`,
                          type: 'button',
                        })}
                      </div>
                      <div class="in fll" style="width: 50%; padding: 5px;">
                        ${await BtnIcon.Render({
                          class: `in wfa btn-edit-doc-submit-${params.data._id}`,
                          label: html`<i class="fas fa-save"></i> ${Translate.Render('save')}`,
                          type: 'button',
                        })}
                      </div>
                    </div>
                  </div>
                `;
              };

              const { barConfig } = await Themes[Css.currentTheme]();

              await Modal.Render({
                id: editModalId,
                barConfig,
                title: renderViewTitle({
                  icon: html`<i class="fas fa-edit"></i>`,
                  text: Translate.Render('edit-document'),
                }),
                html: editFormHtml,
                handleType: 'bar',
                maximize: true,
                mode: 'view',
                slideMenu: 'modal-menu',
                RouterInstance: Modal.Data[options.idModal].options.RouterInstance,
                barMode: Modal.Data[options.idModal].options.barMode,
              });

              // Handle submit button
              setTimeout(() => {
                EventsUI.onClick(
                  `.btn-edit-doc-submit-${params.data._id}`,
                  async (ev) => {
                    ev.preventDefault();

                    const newTitle = s(`.edit-doc-title-${params.data._id}`).value.trim();
                    const newLocation = s(`.edit-doc-location-${params.data._id}`).value.trim();

                    // Get file names only if files exist
                    const newMdFileName = hasMdFile ? s(`.edit-doc-md-file-${params.data._id}`)?.value.trim() : null;
                    const newFileName = hasGenericFile ? s(`.edit-doc-file-${params.data._id}`)?.value.trim() : null;

                    if (!newTitle) {
                      NotificationManager.Push({
                        html: Translate.Render('error-title-required'),
                        status: 'error',
                      });
                      return;
                    }

                    const formattedLocation = FileExplorer.locationFormat({ f: { location: newLocation || '/' } });

                    try {
                      const updateBody = {
                        title: newTitle,
                        location: formattedLocation,
                      };

                      // Preserve existing fields from the original document
                      if (originDoc) {
                        if (originDoc.fileId) updateBody.fileId = originDoc.fileId._id || originDoc.fileId;
                        if (originDoc.mdFileId) updateBody.mdFileId = originDoc.mdFileId._id || originDoc.mdFileId;
                        if (originDoc.tags) updateBody.tags = originDoc.tags;
                        if (typeof originDoc.isPublic !== 'undefined') updateBody.isPublic = originDoc.isPublic;
                      }

                      // Include file name updates if files exist and names changed
                      if (hasMdFile && newMdFileName && newMdFileName !== params.data.mdFileName) {
                        updateBody.mdFileName = newMdFileName;
                      }
                      if (hasGenericFile && newFileName && newFileName !== params.data.fileName) {
                        updateBody.fileName = newFileName;
                      }

                      const { data, status } = await DocumentService.put({
                        id: params.data._id,
                        body: updateBody,
                      });

                      if (status === 'success') {
                        // Check if location changed
                        const locationChanged = formattedLocation !== params.data.location;

                        // Update local data
                        params.data.title = newTitle;
                        params.data.name = newTitle;
                        params.data.location = formattedLocation;
                        if (hasMdFile && newMdFileName) params.data.mdFileName = newMdFileName;
                        if (hasGenericFile && newFileName) params.data.fileName = newFileName;

                        // Update documentInstance
                        const docIndex = documentInstance.findIndex((d) => d._id === params.data._id);
                        if (docIndex !== -1) {
                          documentInstance[docIndex].title = newTitle;
                          documentInstance[docIndex].location = formattedLocation;
                          // Update file names in the referenced file objects
                          if (hasMdFile && newMdFileName && documentInstance[docIndex].mdFileId) {
                            documentInstance[docIndex].mdFileId.name = newMdFileName;
                          }
                          if (hasGenericFile && newFileName && documentInstance[docIndex].fileId) {
                            documentInstance[docIndex].fileId.name = newFileName;
                          }
                        }

                        // Refresh the grid with new location
                        const format = FileExplorer.documentDataFormat({ document: documentInstance, location });
                        files = format.files;
                        folders = format.folders;
                        applySearchFilter();
                        currentPage = 0;
                        displayedFiles = getPagedFiles();
                        AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
                        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
                        updatePaginationUI();

                        NotificationManager.Push({
                          html: Translate.Render('success-update-document'),
                          status: 'success',
                        });

                        // If location changed, navigate to the new location
                        if (!s(`.file-explorer-query-nav`)) s(`.main-btn-cloud`).click();

                        if (locationChanged)
                          setTimeout(() => {
                            location = formattedLocation;
                            setPath(`${window.location.pathname}?location=${location}`);
                            s(`.file-explorer-query-nav`).value = location;
                          });

                        Modal.removeModal(editModalId);
                      } else {
                        throw new Error('Failed to update document');
                      }
                    } catch (error) {
                      logger.error('Update document failed:', error);
                      NotificationManager.Push({
                        html: Translate.Render('error-update-document'),
                        status: 'error',
                      });
                    }
                  },
                  { context: 'modal' },
                );

                // Handle cancel button
                EventsUI.onClick(
                  `.btn-edit-doc-cancel-${params.data._id}`,
                  async (ev) => {
                    ev.preventDefault();
                    Modal.removeModal(editModalId);
                  },
                  { context: 'modal' },
                );
              });
            },
            { context: 'modal' },
          );
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        console.log('LoadFileActionsRenderer refreshed', params);
        return true;
      }
    }

    class LoadFolderActionsRenderer {
      eGui;

      async init(params) {
        console.log('LoadFolderActionsRenderer created', params);
        // params.data._id
        const id = params.data.locationId;

        this.eGui = document.createElement('div');
        this.eGui.innerHTML = html`
          <div class="fl">
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-folder-delete-${id}`,
              label: html` <i class="fa-solid fa-circle-xmark"></i>`,
              type: 'button',
            })}
          </div>
        `;

        setTimeout(() => {
          EventsUI.onClick(
            `.btn-folder-delete-${id}`,
            async (e) => {
              const confirmResult = await Modal.RenderConfirm({
                html: async () => {
                  return html`
                    <div class="in section-mp" style="text-align: center">
                      ${Translate.Render('confirm-delete-item')}
                      <br />
                      "${params.data.location}"
                    </div>
                  `;
                },
                id: `delete-${id}`,
              });
              if (confirmResult.status !== 'confirm') return;

              e.preventDefault();
              const idFilesDelete = [];
              for (const file of documentInstance.filter(
                (f) => FileExplorer.locationFormat({ f }) === params.data.location, // .startsWith(params.data.location),
              )) {
                {
                  const { data, status, message } = await FileService.delete({
                    id: file.fileId._id,
                  });
                }
                {
                  idFilesDelete.push(file._id);
                  const { data, status, message } = await DocumentService.delete({
                    id: file._id,
                  });
                }
              }
              NotificationManager.Push({
                html: Translate.Render('success-delete'),
                status: 'success',
              });
              documentInstance = documentInstance.filter((f) => !idFilesDelete.includes(f._id));
              const format = FileExplorer.documentDataFormat({ document: documentInstance, location });
              files = format.files;
              folders = format.folders;
              applySearchFilter();
              currentPage = 0;
              displayedFiles = getPagedFiles();
              AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
              AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
              updatePaginationUI();
            },
            { context: 'modal' },
          );
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        console.log('LoadFolderActionsRenderer refreshed', params);
        return true;
      }
    }

    return html`
      <form>
        <div class="fl">
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-home-directory',
            label: html`<i class="fas fa-home"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-back-explorer',
            label: html` <i class="fa-solid fa-circle-left"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-forward-explorer',
            label: html` <i class="fa-solid fa-circle-right"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-go-explorer',
            label: html`<i class="fas fa-sync-alt"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'submit',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-copy-directory',
            label: html`<i class="fas fa-copy"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-upload-file',
            label: html`<i class="fa-solid fa-cloud-arrow-up"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `file-explorer-query-nav`,
            type: 'text',
            label: html`<i class="fab fa-wpexplorer"></i> ${Translate.Render('current-path')}`,
            containerClass: 'in section-mp input-container-width',
            placeholder: true,
            value: location,
          })}
        </div>
        ${dynamicCol({
          containerSelector: 'file-explorer-search-container',
          id: 'file-explorer-search',
          type: 'search-inputs',
        })}
        <div class="fl file-explorer-search-container">
          <div class="in fll file-explorer-search-col-a">
            ${await Input.Render({
              id: `file-explorer-search-title`,
              type: 'text',
              label: html`<i class="fas fa-search"></i> ${Translate.Render('doc-title')}`,
              containerClass: 'in section-mp input-container-width',
              placeholder: true,
            })}
          </div>
          <div class="in fll file-explorer-search-col-b">
            ${await Input.Render({
              id: `file-explorer-search-md-file`,
              type: 'text',
              label: html`<i class="fas fa-file-code"></i> ${Translate.Render('md-file-name')}`,
              containerClass: 'in section-mp input-container-width',
              placeholder: true,
            })}
          </div>
          <div class="in fll file-explorer-search-col-c">
            ${await Input.Render({
              id: `file-explorer-search-file`,
              type: 'text',
              label: html`<i class="fas fa-file"></i> ${Translate.Render('generic-file-name')}`,
              containerClass: 'in section-mp input-container-width',
              placeholder: true,
            })}
          </div>
          <div
            class="in fll file-explorer-search-col-d"
            style="display: flex; align-items: center; justify-content: center; height: 100%;"
          >
            ${await BtnIcon.Render({
              class: 'in management-table-btn-mini file-explorer-search-submit',
              label: html`<i class="fas fa-search"></i>`,
              type: 'button',
              style: 'top: 10px; margin-right: 5px;',
            })}
            ${await BtnIcon.Render({
              class: 'in management-table-btn-mini file-explorer-search-clear',
              label: html`<i class="fas fa-broom"></i>`,
              type: 'button',
              style: 'top: 10px',
            })}
          </div>
        </div>
      </form>
      <div class="fl file-explorer-nav">
        <div class="in fll explorer-file-col">
          <div class="in explorer-file-sub-col section-mp">
            <div class="in">
              ${await AgGrid.Render({
                id: gridFolderId,
                darkTheme,
                // style: {
                //   height: '200px',
                // },
                gridOptions: {
                  defaultColDef: {
                    editable: false,
                    minWidth: 100,
                    filter: true,
                    autoHeight: true,
                  },
                  rowData: folders,
                  columnDefs: [
                    {
                      field: 'location',
                      headerName: 'Folder',
                      minWidth: 200,
                      flex: 1,
                      cellStyle: function (params) {
                        return { cursor: 'pointer' };
                      },
                      cellRenderer: LoadFolderRenderer,
                      onCellClicked: (event) => {
                        // console.warn('onCellClicked', event);
                        const newLocation = event.data.location;
                        if (newLocation === location) return;
                        location = newLocation;
                        setPath(`${window.location.pathname}?location=${location}`);
                        s(`.file-explorer-query-nav`).value = location;
                        const format = this.documentDataFormat({ document: documentInstance, location });
                        files = format.files;
                        folders = format.folders;
                        applySearchFilter();
                        currentPage = 0;
                        displayedFiles = getPagedFiles();
                        AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
                        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
                        updatePaginationUI();
                      },
                    },
                    {
                      // suppressHeaderMenuButton: true,
                      // sortable: false,
                      field: 'fileCount',
                      headerName: '🗎',
                      width: 60,
                      cellStyle: function (params) {
                        return { cursor: 'pointer' };
                      },
                      // headerComponent: FolderHeaderComp,
                      // headerComponentParams: {
                      //   menuIcon: 'fa-bars',
                      //   template: `test`,
                      // },
                    },
                    { headerName: '', width: 60, cellRenderer: LoadFolderActionsRenderer },
                  ],
                  rowSelection: 'single',
                  onSelectionChanged: (event) => {
                    return;
                    const selectedRows = AgGrid.grids[gridFolderId].getSelectedRows();
                    console.log('selectedRows', { event, selectedRows });
                    if (selectedRows[0]) {
                      const newLocation = selectedRows[0].location;
                      if (newLocation === location) return;
                      location = newLocation;
                      setPath(`${window.location.pathname}?location=${location}`);
                      s(`.file-explorer-query-nav`).value = location;
                      const format = this.documentDataFormat({ document: documentInstance, location });
                      files = format.files;
                      folders = format.folders;
                      applySearchFilter();
                      currentPage = 0;
                      displayedFiles = getPagedFiles();
                      AgGrid.grids[gridFileId].setGridOption('rowData', displayedFiles);
                      AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
                      updatePaginationUI();
                    }
                  },
                },
              })}
            </div>
          </div>
        </div>
        <div class="in fll explorer-file-col">
          <div class="in explorer-file-sub-col section-mp">
            <div class="in">
              ${await AgGrid.Render({
                id: gridFileId,
                darkTheme,
                // style: {
                //   height: '200px',
                // },
                gridOptions: {
                  defaultColDef: {
                    editable: false,
                    minWidth: 100,
                    filter: true,
                    autoHeight: true,
                  },
                  // rowData: files,
                  rowData: undefined,
                  columnDefs: [
                    { field: 'name', flex: 2, headerName: 'Title', cellRenderer: LoadFileNameRenderer },
                    { field: 'mdFileName', flex: 1, headerName: 'MD File Name' },
                    { field: 'fileName', flex: 1, headerName: 'Generic File Name' },
                    { headerName: '', width: 150, cellRenderer: LoadFileActionsRenderer },
                  ],
                },
              })}
            </div>
            <div class="fl file-explorer-pagination" style="padding: 5px 0;">
              <div class="in fll" style="width: 33.33%;">
                ${await BtnIcon.Render({
                  class: 'in wfa file-explorer-prev-btn',
                  label: html`<i class="fa-solid fa-chevron-left"></i> ${Translate.Render('previous')}`,
                  type: 'button',
                })}
              </div>
              <div class="in fll" style="width: 33.33%; text-align: center;">
                <span
                  class="file-explorer-pagination-info"
                  style="display: inline-block; padding: 8px 0; min-width: 100px;"
                  >1 / 1 (0 files)</span
                >
              </div>
              <div class="in fll" style="width: 33.33%;">
                ${await BtnIcon.Render({
                  class: 'in wfa file-explorer-next-btn',
                  label: html`${Translate.Render('next')} <i class="fa-solid fa-chevron-right"></i>`,
                  type: 'button',
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <form class="file-explorer-uploader" style="display: none">
        ${await InputFile.Render(
          {
            id: idDropFileInput,
            multiple: true,
          },
          {
            clear: () => {
              console.log('file explorer clear file');
              formBodyFiles = undefined;
            },
            change: (e) => {
              console.log('file explorer change file', e);
              formBodyFiles = fileFormDataFactory(e);
            },
          },
        )}
        <div class="in">
          ${await BtnIcon.Render({
            class: 'wfa section-mp btn-input-file-explorer',
            style: renderCssAttr({
              style: {
                'font-size': '25px',
                'text-align': 'center',
                padding: '20px',
              },
            }),
            label: html`<i class="fa-solid fa-cloud-arrow-up"></i> ${Translate.Render('upload')}`,
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
  locationFormat: function ({ f }) {
    if (f.location[0] !== '/') f.location = `/${f.location}`;
    if (f.location !== '/' && f.location[f.location.length - 1] === '/') f.location = f.location.slice(0, -1);
    return f.location;
  },
  documentDataFormat: function ({ document, location, searchFilters }) {
    let files = document.map((f) => {
      return {
        location: this.locationFormat({ f }),
        name: f.title,
        mdFileName: f.mdFileId?.name || '',
        fileName: f.fileId?.name || '',
        // Use the actual file ID for operations (prefer generic file, fallback to md file)
        fileId: f.fileId?._id || f.mdFileId?._id || null,
        _id: f._id,
        title: f.title,
        isPublic: f.isPublic || false,
        // Track file existence for edit form
        hasMdFile: !!f.mdFileId,
        hasGenericFile: !!f.fileId,
      };
    });
    let documentId = document._id;
    let folders = [];
    for (const folderPath of uniqueArray(files.map((f) => f.location)))
      folders = ['/'].concat(folders.concat(getSubpaths(folderPath)));
    folders = uniqueArray(folders).map((f, i) => {
      return {
        location: f,
        locationId: `loc-${i}`,
      };
    });

    const isSearching = searchFilters && (searchFilters.title || searchFilters.mdFile || searchFilters.file);

    if (!isSearching) {
      files = files.filter((f) => f.location === location);
      folders = folders
        .filter((f) => f.location.startsWith(location))
        .map((f) => {
          f.fileCount = document.filter((file) => file.location === f.location).length;
          return f;
        })
        .filter((f) => f.fileCount > 0);
    } else {
      folders = folders
        .map((f) => {
          f.fileCount = files.filter((file) => file.location === f.location).length;
          return f;
        })
        .filter((f) => f.fileCount > 0);
    }
    return { files, documentId, folders };
  },
};

export { FileExplorer };
