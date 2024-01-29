import { CommonValidationRules } from './CommonValidationRules.js';
import { renderStatus } from './Css.js';
import { loggerFactory } from './Logger.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const Validator = {
  instance: function (validators) {
    const validatorFunction = {};
    for (const validator of validators) {
      validatorFunction[validator.id] = async () => {
        logger.warn(validator.id, s(`.${validator.id}`).value);
        let error = false;
        let errorMessage = '';
        for (const rule of validator.rules) {
          let options;
          switch (rule.type) {
            case 'passwordMismatch':
              options = s(`.${rule.match}`).value;
              break;

            default:
              break;
          }
          if (!CommonValidationRules[rule.type](s(`.${validator.id}`).value, options)) {
            errorMessage += html` <div class="in">
              ${renderStatus('error', { class: 'inl' })} &nbsp
              <span style="color: red">${Translate.Render(rule.type)}</span>
            </div>`;

            error = true;
          }
        }

        if (!error)
          htmls(
            `.input-info-${validator.id}`,
            html` ${renderStatus('success', { class: 'inl' })} &nbsp
              <span style="color: green">ok</span>`,
          );
        else htmls(`.input-info-${validator.id}`, errorMessage);
        return { error, errorMessage };
      };

      s(`.${validator.id}`).oninput = validatorFunction[validator.id];
      s(`.${validator.id}`).onblur = validatorFunction[validator.id];
    }

    return async () => {
      let error = false;
      let errorMessage = '';
      for (const validator of Object.keys(validatorFunction)) {
        const result = await validatorFunction[validator]();
        errorMessage += result.errorMessage;
        if (!error && result.error) error = true;
      }
      return { error, errorMessage };
    };
  },
};

export { Validator };
