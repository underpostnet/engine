SrrComponent = () => html`
  <style>
    body {
      margin: 0;
      padding: 0;
    }

    .ssr-fl {
      position: relative;
      display: flow-root;
    }

    .ssr-abs,
    .ssr-in {
      display: block;
    }

    .ssr-fll {
      float: left;
    }

    .ssr-flr {
      float: right;
    }

    .ssr-abs {
      position: absolute;
    }

    .ssr-in,
    .ssr-inl {
      position: relative;
    }

    .ssr-inl {
      display: inline-table;
      display: -webkit-inline-table;
      display: -moz-inline-table;
      display: -ms-inline-table;
      display: -o-inline-table;
    }

    .ssr-fix {
      position: fixed;
      display: block;
    }

    .ssr-stq {
      position: sticky;
      /* require defined at least top, bottom, left o right */
    }

    .ssr-wfa {
      width: fill-available;
      width: -webkit-fill-available;
      width: -moz-fill-available;
      width: -ms-fill-available;
      width: -o-fill-available;
    }

    .ssr-wft {
      width: fit-content;
      width: -webkit-fit-content;
      width: -moz-fit-content;
      width: -ms-fit-content;
      width: -o-fit-content;
    }

    .ssr-wfm {
      width: max-content;
      width: -webkit-max-content;
      width: -moz-max-content;
      width: -ms-max-content;
      width: -o-max-content;
    }

    .ssr-negative-color {
      filter: invert(1);
      -webkit-filter: invert(1);
      -moz-filter: invert(1);
      -ms-filter: invert(1);
      -o-filter: invert(1);
    }

    .ssr-no-drag {
      user-drag: none;
      -webkit-user-drag: none;
      -moz-user-drag: none;
      -ms-user-drag: none;
      -o-user-drag: none;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      -o-user-select: none;
    }

    .ssr-center {
      transform: translate(-50%, -50%);
      top: 50%;
      left: 50%;
      width: 100%;
      text-align: center;
    }
    .ssr-gray {
      filter: grayscale(1);
    }
  </style>
`;
