import { e404 } from '../common/Alert.js';
import { append } from '../common/SsrCore.js';
/*imports*/

window.onload = async () => {
  append('body', await e404());
};
