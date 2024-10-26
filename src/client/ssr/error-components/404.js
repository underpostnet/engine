import { e404 } from '../common-components/Alert.js';
import { append } from '../common-components/SsrCore.js';
/*imports*/

window.onload = async () => {
  append('body', await e404());
};
