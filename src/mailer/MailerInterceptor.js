import { MailerProvider } from './MailerProvider.js';

/**
 * General-purpose capture of everything {@link MailerProviderService#send}
 * delivers, built on the provider's send middleware.
 *
 * Assertions about mail are otherwise only possible against a real inbox. The
 * interceptor records the delivery context and the transport result of each
 * send, which is what lets a caller wait for a specific message and know
 * whether the transport actually accepted it.
 *
 * @module src/mailer/MailerInterceptor.js
 * @namespace MailerInterceptor
 */

/**
 * @typedef {object} InterceptedMail
 * @property {string} id - Mailer instance the message was sent through.
 * @property {object} sendOptions - Nodemailer options as the transport received them.
 * @property {object|undefined} info - Transport result; `undefined` when delivery failed.
 * @property {boolean} accepted - Whether the transport accepted the message.
 * @property {string} at - ISO timestamp of the delivery attempt.
 * @memberof MailerInterceptor
 */

/**
 * @method mailerInterceptorFactory
 * @description Installs a send interceptor and returns its recorder.
 *
 * The interceptor is transparent: it forwards every send to the transport and
 * records the outcome. `suppress` holds the message instead, for callers that
 * must exercise the send path without delivering.
 *
 * @param {object} [params]
 * @param {import('./MailerProvider.js').MailerProvider} [params.provider] - Provider to intercept.
 * @param {function(object): boolean} [params.filter] - Records only the contexts it accepts.
 * @param {boolean} [params.suppress=false] - Record without handing the message to the transport.
 * @returns {{messages: Array<InterceptedMail>, waitFor: function, close: function(): void}} Recorder.
 * @memberof MailerInterceptor
 */
const mailerInterceptorFactory = ({ provider = MailerProvider, filter, suppress = false } = {}) => {
  const messages = [];

  const dispose = provider.use(async (context, next) => {
    const matched = !filter || filter(context);
    const info = matched && suppress ? { messageId: `suppressed:${Date.now()}`, suppressed: true } : await next();
    if (matched)
      messages.push({
        id: context.id,
        sendOptions: context.sendOptions,
        info,
        accepted: Boolean(info),
        at: new Date().toISOString(),
      });
    return info;
  });

  return {
    messages,

    /**
     * Resolves with the first recorded message matching `predicate`.
     *
     * Polls rather than resolving on registration, because a send started
     * before the caller began waiting must still satisfy the wait.
     *
     * @param {function(InterceptedMail): boolean} predicate - Match to wait for.
     * @param {object} [options]
     * @param {number} [options.timeoutMs=60000] - Maximum wait.
     * @param {number} [options.intervalMs=250] - Poll interval.
     * @returns {Promise<InterceptedMail|undefined>} The match, or `undefined` on timeout.
     */
    async waitFor(predicate, { timeoutMs = 60000, intervalMs = 250 } = {}) {
      const deadline = Date.now() + timeoutMs;
      do {
        const match = messages.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } while (Date.now() < deadline);
      return messages.find(predicate);
    },

    close: dispose,
  };
};

export { mailerInterceptorFactory };
