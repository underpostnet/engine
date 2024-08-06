import { floatRound, newInstance, range, setPad, timer } from '../core/CommonJs.js';
import { borderChar } from '../core/Css.js';
import { GameInputs, GameInputTestRender } from '../core/GameInputs.js';
import { Keyboard } from '../core/Keyboard.js';
import { loggerFactory } from '../core/Logger.js';
import { Modal } from '../core/Modal.js';
import { SocketIo } from '../core/SocketIo.js';
import { append, getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { SkillCyberiaType, Stat } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';

const logger = loggerFactory(import.meta);

const SkillCyberia = {
  renderMainKeysSlots: async function () {
    // GameInputTestRender(s(`.main-skill-container`));

    if (getProxyPath().match('test')) {
      append(
        'body',
        html` <div class="abs main-skill-container" style="background: red">
          <canvas class="abs main-skill-slot main-skill-slot-0"> </canvas>
          <div class="abs center main-skill-slot-log-0"></div>
        </div>`,
      );
      s(`.main-skill-slot-0`).addEventListener('touchstart', () => {
        //  handleStart
        htmls(`.main-skill-slot-log-0`, 'Start');
      });
      s(`.main-skill-slot-0`).addEventListener('touchmove', () => {
        //  handleMove
        htmls(`.main-skill-slot-log-0`, 'Move');
      });
      s(`.main-skill-slot-0`).addEventListener('touchend', () => {
        //  handleEnd
        htmls(`.main-skill-slot-log-0`, 'End');
      });
      s(`.main-skill-slot-0`).addEventListener('touchcancel', () => {
        //  handleCancel
        htmls(`.main-skill-slot-log-0`, 'Cancel');
      });
      return;
    }
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
  },
  setMainKeysSkillCyberia: function () {
    if (getProxyPath().match('test')) return;
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
        s(`.main-skill-img-${indexSkillCyberia}`).src = `${getProxyPath()}assets/skill/${
          ElementsCyberia.Data.user.main.skill.keys[skillKey]
        }/animation.gif`;
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

      s(`.main-skill-slot-${indexSkillCyberia}`).onclick = triggerSkillCyberia;
      s(`.main-skill-slot-${indexSkillCyberia}`).onmouseover = () => {
        if (Modal.mobileModal()) triggerSkillCyberia();
      };
      Keyboard.Event['main-skill'][SkillCyberiaType[skillKey].keyboard.toLowerCase()] = triggerSkillCyberia;
      Keyboard.Event['main-skill'][SkillCyberiaType[skillKey].keyboard.toUpperCase()] = triggerSkillCyberia;
      ElementsCyberia.LocalDataScope['user']['main']['skill'][indexSkillCyberia] = triggerSkillCyberia;
    }
  },
  renderDeadCooldown: function ({ type, id }) {
    if (getProxyPath().match('test')) return;
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
