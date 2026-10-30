import { Translate } from '../core/Translate.js';

class TranslateGoogleAuth {
  static async instance() {
    Translate.Data['or'] = { en: 'or', es: 'o' };
    Translate.Data['continue-with-google'] = { en: 'Continue with Google', es: 'Continuar con Google' };
    Translate.Data['google-auth-cancelled'] = {
      en: 'Google sign-in was cancelled.',
      es: 'Se canceló el inicio de sesión con Google.',
    };
    Translate.Data['google-auth-link'] = {
      en: 'Log in with your password once to link your Google account. Forgot it? Use Forgot Password.',
      es: 'Inicie sesión una vez con su contraseña para vincular su cuenta de Google. ¿La olvidó? Use Olvidé mi contraseña.',
    };
    Translate.Data['google-auth-linked'] = {
      en: 'Your Google account is linked. Next time, continue with Google.',
      es: 'Su cuenta de Google quedó vinculada. La próxima vez, continúe con Google.',
    };
    Translate.Data['google-auth-link-expired'] = {
      en: 'The Google link request expired. Continue with Google again.',
      es: 'La solicitud para vincular Google expiró. Continúe con Google de nuevo.',
    };
    Translate.Data['google-auth-conflict'] = {
      en: 'This Google account cannot be linked to that account. Log in with your password, or recover the account with Forgot Password.',
      es: 'Esta cuenta de Google no se puede vincular a esa cuenta. Inicie sesión con su contraseña, o recupere la cuenta con Olvidé mi contraseña.',
    };
    Translate.Data['google-auth-unverified-email'] = {
      en: 'Google has not verified the email of this account. Verify it with Google, then try again.',
      es: 'Google no ha verificado el correo de esta cuenta. Verifíquelo con Google e intente de nuevo.',
    };
    Translate.Data['google-auth-error'] = {
      en: 'Google sign-in failed. Please try again.',
      es: 'Falló el inicio de sesión con Google. Por favor, intente de nuevo.',
    };
  }
}

export { TranslateGoogleAuth };
