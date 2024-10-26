import { e404 } from '../common/Alert.js';
import { append } from '../common/SsrCore.js';
import { Translate } from '../common/Translate.js';
import { Worker } from '../common/Worker.js';
/*imports*/

window.onload = () =>
  Worker.instance({
    render: async () => {
      append('.page-render', await e404({ Translate }));
    },
  });
