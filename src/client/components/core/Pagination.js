const Pagination = {
  Render: async ({ id }) => {
    return html`
      <style>
        .pagination-container-${id} {
        }
      </style>

      <div class="in pagination-container-${id}">test pagination</div>
    `;
  },
};

export { Pagination };
