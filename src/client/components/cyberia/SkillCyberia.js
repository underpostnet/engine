import { BtnIcon } from '../core/BtnIcon.js';
import { floatRound, newInstance, range, setPad, timer } from '../core/CommonJs.js';
import { borderChar } from '../core/Css.js';
import { Keyboard } from '../core/Keyboard.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { SocketIo } from '../core/SocketIo.js';
import { append, getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { SkillCyberiaData, SkillCyberiaType, Stat } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';

const logger = loggerFactory(import.meta);

const SkillCyberia = {
  renderMainKeysSlots: async function () {
    // GameInputTestRender(s(`.main-skill-container`));

    let mainSkillContainerRender = '';
    for (const i of range(0, 3)) {
      mainSkillContainerRender += html`
        <div class="in fll main-skill-slot main-skill-slot-${i}">
          <img
            class="abs center main-skill-background-img main-skill-background-img-${i}"
            src="${getProxyPath()}assets/joy/btn.png"
          />
          <div class="main-skill-img-container-${i}"></div>
          <div class="abs center main-skill-cooldown main-skill-cooldown-${i}" style="display: none;">
            <div class="abs center main-skill-cooldown-delay-time-text main-skill-cooldown-delay-time-text-${i}"></div>
          </div>
          <div class="abs center main-skill-key-text main-skill-key-text-${i}"></div>
          ${await BtnIcon.RenderTouch({ id: `main-skill-touch-slot-${i}` })}
        </div>
      `;
    }

    append('body', html` <div class="abs main-skill-container">${mainSkillContainerRender}</div> `);
  },
  setMainKeysSkillCyberia: function () {
    let indexSkillCyberiaIteration = -1;
    Keyboard.Event['main-skill'] = {};
    ElementsCyberia.LocalDataScope['user']['main']['skill'] = {};

    for (const skillKey of Object.keys(ElementsCyberia.Data.user.main.skill.keys)) {
      indexSkillCyberiaIteration++;
      const indexSkillCyberia = indexSkillCyberiaIteration;
      let triggerSkillCyberia = () => null;
      let cooldownActive = false;
      htmls(`.main-skill-key-text-${indexSkillCyberia}`, SkillCyberiaType[skillKey].keyboard);

      if (ElementsCyberia.Data.user.main.skill.keys[skillKey]) {
        htmls(
          `.main-skill-img-container-${indexSkillCyberia}`,
          html` <img class="abs center main-skill-img main-skill-img-${indexSkillCyberia}" /> `,
        );
        s(`.main-skill-img-${indexSkillCyberia}`).src = `${getProxyPath()}assets/${
          SkillCyberiaData[ElementsCyberia.Data.user.main.skill.keys[skillKey]].folder
        }/${ElementsCyberia.Data.user.main.skill.keys[skillKey]}/animation.gif`;
        triggerSkillCyberia = (e, ms, headerRender = '', type) => {
          if (e && e.preventDefault) e.preventDefault();
          if (ElementsCyberia.Data.user.main.life <= 0 && type !== 'dead') return;
          if (!cooldownActive) {
            cooldownActive = true;
            if (type !== 'dead')
              SocketIo.Emit('skill', {
                status: 'create',
                skillKey,
              });
            const statData = Stat.get[ElementsCyberia.Data.user.main.skill.keys[skillKey]]();
            let currentCooldown = ms ? newInstance(ms) : newInstance(statData.cooldown);
            s(`.main-skill-cooldown-${indexSkillCyberia}`).style.display = 'block';
            const reduceCooldown = async () => {
              const cooldownDisplayValue = currentCooldown / 1000;
              htmls(
                `.main-skill-cooldown-delay-time-text-${indexSkillCyberia}`,
                `${headerRender}${setPad(setPad(floatRound(cooldownDisplayValue, 3), '0', 2, true), '0', 2)} s`,
              );
              await timer(50);
              currentCooldown -= 50;
              if (currentCooldown > 0) reduceCooldown();
              else {
                cooldownActive = false;
                s(`.main-skill-cooldown-${indexSkillCyberia}`).style.display = 'none';
              }
            };
            reduceCooldown();
          }
        };
      } else {
        htmls(`.main-skill-img-container-${indexSkillCyberia}`, '');
      }

      BtnIcon.TouchTokens[`main-skill-touch-slot-${indexSkillCyberia}`].Events[`main`] = triggerSkillCyberia;
      Keyboard.Event['main-skill'][SkillCyberiaType[skillKey].keyboard.toLowerCase()] = triggerSkillCyberia;
      Keyboard.Event['main-skill'][SkillCyberiaType[skillKey].keyboard.toUpperCase()] = triggerSkillCyberia;
      ElementsCyberia.LocalDataScope['user']['main']['skill'][indexSkillCyberia] = triggerSkillCyberia;
    }
  },
  renderDeadCooldown: function ({ type, id }) {
    if (ElementsCyberia.LocalDataScope[type][id].skill)
      for (const skillKey of Object.keys(ElementsCyberia.LocalDataScope[type][id].skill)) {
        ElementsCyberia.LocalDataScope[type][id].skill[skillKey](
          {},
          ElementsCyberia.Data[type][id].deadTime,
          html`<i class="inl fa-solid fa-ban" style="color: red; top: 10px; ${borderChar(2, 'black')}"></i> <br />`,
          'dead',
        );
      }
  },
};

export { SkillCyberia };
