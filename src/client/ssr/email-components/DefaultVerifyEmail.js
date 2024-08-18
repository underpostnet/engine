SrrComponent = (render = { style: {}, renderStyle: () => '' }, options) =>
  html`
    <div style="${render.renderStyle('body')}">
      <div style="${render.renderStyle('.container')}">
        <h1 style="${render.renderStyle('h1')}">{{H1}}</h1>
        <p style="${render.renderStyle('p')}">{{P1}}</p>
        <img
          src="http${options.transport.secure ? 's' : ''}://${options.host}${options.path === '/'
            ? ''
            : options.path}/api/user/mailer/{{TOKEN}}"
        />
        <!-- <p>Please click the button below to confirm your email address.</p> -->
        <!-- <a href="#" class="button">Confirm Email</a> -->
      </div>
      <div style="${render.renderStyle('.footer')}">
        <p>{{COMPANY}}</p>
      </div>
    </div>
  `;
