import { renderStatus } from './Css.js';
import { loggerFactory } from './Logger.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const validationRules = {
  emptyField: (value) => !value.trim(),
  invalidEmail: (value) => !/^\S+@\S+\.\S+$/.test(value),
  passwordMismatch: (value, password) => value !== password,
  invalidPhoneNumber: (value) => !/^\d{10}$/.test(value),
  invalidDate: (value) => !/^\d{4}-\d{2}-\d{2}$/.test(value),
  customValidator: (value) => true,
};

const Validator = {
  instance: function (validators) {
    const validatorFunction = {};
    for (const validator of validators) {
      validatorFunction[validator.id] = async () => {
        logger.warn(validator.id, s(`.${validator.id}`).value);

        for (const rule of validator.rules) {
          if (validationRules[rule](s(`.${validator.id}`).value)) {
            htmls(
              `.input-info-${validator.id}`,
              html` ${renderStatus('error', { class: 'inl' })} &nbsp
                <span style="color: red">${Translate.Render(rule)}</span>`,
            );
            return true;
          }
        }

        htmls(
          `.input-info-${validator.id}`,
          html` ${renderStatus('success', { class: 'inl' })} &nbsp
            <span style="color: green">ok</span>`,
        );
        return false;
      };

      s(`.${validator.id}`).oninput = validatorFunction[validator.id];
      s(`.${validator.id}`).onblur = validatorFunction[validator.id];
    }

    return async () => {
      let error = false;
      for (const validator of Object.keys(validatorFunction)) error = await validatorFunction[validator]();
      return error;
    };
  },
};

export { Validator, validationRules };
