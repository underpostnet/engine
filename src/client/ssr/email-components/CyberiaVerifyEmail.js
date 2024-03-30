SrrComponent = (render = { style: {}, renderStyle: () => '' }, options) =>
  html` <div
    style="${render.renderStyle(render.style['in'])}${render.renderStyle(render.style['cyberia-email-container'])}"
  >
    Email Confirmed<img
      style="display: none"
      src="http${options.transport.secure ? 's' : ''}://${options.host}${options.path}api/user/mailer/{{TOKEN}}"
    />
  </div>`;
