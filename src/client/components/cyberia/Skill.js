import { floatRound, newInstance, range, setPad, timer } from '../core/CommonJs.js';
import { Keyboard } from '../core/Keyboard.js';
import { SocketIo } from '../core/SocketIo.js';
import { append, getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { SkillType } from './CommonCyberia.js';
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
                  <div class="main-skill-img-container-${i}"></div>
                  <div class="abs center main-skill-cooldown main-skill-cooldown-${i}" style="display: none;">
                    <div
                      class="abs center main-skill-cooldown-delay-time-text main-skill-cooldown-delay-time-text-${i}"
                    ></div>
                  </div>
                  <div class="abs center main-skill-key-text main-skill-key-text-${i}"></div>
                </div>
              `,
            )
            .join('')}
        </div>
      `,
    );
    let indexSkillIteration = -1;
    Keyboard.Event['main-skill'] = {};
    for (const skillKey of Object.keys(Elements.Data.user.main.skill.keys)) {
      indexSkillIteration++;
      const indexSkill = indexSkillIteration;
      let triggerSkill = () => null;
      let cooldownActive = false;
      htmls(`.main-skill-key-text-${indexSkill}`, skillKey);
      if (Elements.Data.user.main.skill.keys[skillKey]) {
        if (!s(`.main-skill-img-${indexSkill}`))
          append(
            `.main-skill-img-container-${indexSkill}`,
            html` <img class="abs center main-skill-img main-skill-img-${indexSkill}" /> `,
          );
        s(`.main-skill-img-${indexSkill}`).src = `${getProxyPath()}assets/skill/${
          Elements.Data.user.main.skill.keys[skillKey]
        }/animation.gif`;
        triggerSkill = (e) => {
          if (e) e.preventDefault();
          if (!cooldownActive) {
            cooldownActive = true;
            SocketIo.Emit('skill', {
              status: 'create',
              skillKey,
            });
            let currentCooldown = newInstance(SkillType[Elements.Data.user.main.skill.keys[skillKey]].cooldown);
            s(`.main-skill-cooldown-${indexSkill}`).style.display = 'block';
            const reduceCooldown = async () => {
              const cooldownDisplayValue = currentCooldown / 1000;
              htmls(
                `.main-skill-cooldown-delay-time-text-${indexSkill}`,
                `${setPad(floatRound(cooldownDisplayValue, 3), '0', 4, true)} s`,
              );
              await timer(50);
              currentCooldown -= 50;
              if (currentCooldown > 0) reduceCooldown();
              else {
                cooldownActive = false;
                s(`.main-skill-cooldown-${indexSkill}`).style.display = 'none';
              }
            };
            reduceCooldown();
          }
        };
      }
      s(`.main-skill-slot-${indexSkill}`).onclick = triggerSkill;
      Keyboard.Event['main-skill'][skillKey.toLowerCase()] = triggerSkill;
      Keyboard.Event['main-skill'][skillKey.toUpperCase()] = triggerSkill;
    }
  },
};

export { Skill };
