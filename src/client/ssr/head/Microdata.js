SrrComponent = ({ microdata }) => html`
  ${microdata
    .map(
      (jsonld) => html`
        <script type="application/ld+json">
          ${JSON.stringify(jsonld, null, 4)}
        </script>
      `,
    )
    .join(` `)}
`;
