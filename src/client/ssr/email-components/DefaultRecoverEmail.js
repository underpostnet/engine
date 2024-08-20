SrrComponent = (render = { style: {}, renderStyle: () => '' }, options) =>
  html`
    <div style="${render.renderStyle('body')}">
      <div style="${render.renderStyle('.container')}">
        <h1 style="${render.renderStyle('h1')}">{{H1}}</h1>
        <p style="${render.renderStyle('p')}">{{P1}}</p>
        <p style="${render.renderStyle('p')}">
          <a href="{{RECOVER_WEB_URL}}" style="${render.renderStyle('button')}"
            ><img
              src="http${options.transport.secure ? 's' : ''}://${options.host}${options.path === '/'
                ? ''
                : options.path}/api/user/recover/{{TOKEN}}"
            /><br />{{RECOVER_BTN_LABEL}}</a
          >
        </p>
      </div>
      <div style="${render.renderStyle('.footer')}">
        <p>{{COMPANY}}</p>
      </div>
    </div>
  `;
