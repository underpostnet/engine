import { range } from '../core/CommonJs.js';
import { SocketIo } from '../core/SocketIo.js';
import { append, getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';

const Skill = {
  renderMainKeysSlots: async function () {
    append(
      'body',
      html`
        <div class="abs main-skill-container">
          ${range(0, 3)
            .map(
              (i) => html`
                <div class="in fll main-skill-slot main-skill-slot-${i}">
                  <img
                    class="abs center main-skill-background-img main-skill-background-img-${i}"
                    src="${getProxyPath()}assets/joy/btn.png"
                  />
                  <div class="abs center main-skill-key-text main-skill-key-text-${i}"></div>
                </div>
              `,
            )
            .join('')}
        </div>
      `,
    );
    let indexSkill = -1;
    for (const skillKey of Object.keys(Elements.Data.user.main.skill.keys)) {
      indexSkill++;
      let triggerSkill = () => null;
      htmls(`.main-skill-key-text-${indexSkill}`, skillKey);
      if (Elements.Data.user.main.skill.keys[skillKey]) {
        if (!s(`.main-skill-img-${indexSkill}`))
          append(
            `.main-skill-slot-${indexSkill}`,
            html` <img class="abs center main-skill-img main-skill-img-${indexSkill}" /> `,
          );
        s(`.main-skill-img-${indexSkill}`).src = `${getProxyPath()}assets/skill/${
          Elements.Data.user.main.skill.keys[skillKey]
        }/animation.gif`;
        triggerSkill = (e) => {
          e.preventDefault();
          SocketIo.Emit('skill', {
            status: 'create',
            skillKey,
          });
        };
      }
      s(`.main-skill-slot-${indexSkill}`).onclick = triggerSkill;
    }
  },
};

export { Skill };
