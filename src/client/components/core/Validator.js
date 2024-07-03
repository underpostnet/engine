import { renderStatus } from './Css.js';
import { loggerFactory } from './Logger.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const Validator = {
  renderErrorMessage: function (rule) {
    return html` <div class="in">
      ${renderStatus('error', { class: 'inl' })} &nbsp
      <span style="color: red">${Translate.Render(rule.type)}</span>
    </div>`;
  },
  instance: function (validators) {
    const validatorFunction = {};
    for (const validatorData of validators) {
      validatorFunction[validatorData.id] = async () => {
        if (!s(`.${validatorData.id}`)) return;
        logger.warn(validatorData.id, s(`.${validatorData.id}`).value);
        let errorMessage = '';
        if (validatorData.rules)
          for (const rule of validatorData.rules) {
            switch (rule.type) {
              case 'isEmpty':
                if (validator.isEmpty(s(`.${validatorData.id}`).value, { ignore_whitespace: true }))
                  errorMessage += this.renderErrorMessage(rule);
                break;
              case 'isEmail':
                if (!validator.isEmail(s(`.${validatorData.id}`).value)) errorMessage += this.renderErrorMessage(rule);
                break;
              case 'passwordMismatch':
                if (!validator.equals(s(`.${validatorData.id}`).value, s(`.${rule.options}`).value))
                  errorMessage += this.renderErrorMessage(rule);
                break;
              case 'isLength':
                if (!validator.isLength(s(`.${validatorData.id}`).value, rule.options))
                  errorMessage += this.renderErrorMessage(rule);
                break;
              default:
                if (
                  validator[rule.type] &&
                  !validator[rule.type](s(`.${validatorData.id}`).value, rule?.options ? rule.options : undefined)
                )
                  errorMessage += this.renderErrorMessage(rule);
                break;
            }
          }
        if (s(`.input-info-${validatorData.id}`)) {
          if (!errorMessage) {
            if (s(`.${validatorData.id}`).value)
              htmls(
                `.input-info-${validatorData.id}`,
                html` ${renderStatus('success', { class: 'inl' })} &nbsp
                  <span style="color: green">ok</span>`,
              );
          } else htmls(`.input-info-${validatorData.id}`, errorMessage);
        }
        return { errorMessage };
      };
      if (s(`.${validatorData.id}`)) {
        s(`.${validatorData.id}`).oninput = validatorFunction[validatorData.id];
        s(`.${validatorData.id}`).onblur = validatorFunction[validatorData.id];
      }
    }

    return async () => {
      let errorMessage = '';
      for (const validatorKey of Object.keys(validatorFunction)) {
        const result = await validatorFunction[validatorKey]();
        if (result && result.errorMessage) errorMessage += result.errorMessage;
      }
      return { errorMessage };
    };
  },
};

export { Validator };
