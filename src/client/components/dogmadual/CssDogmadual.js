class CssDogmadualDark {
  static theme = 'dogmadual-dark';
  static dark = true;
  static render = async () => html` <style></style> `;
}
class CssDogmadualLight {
  static theme = 'dogmadual-light';
  static dark = false;
  static render = async () => html` <style></style> `;
}
export { CssDogmadualDark, CssDogmadualLight };
