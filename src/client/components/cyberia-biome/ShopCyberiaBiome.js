import { BiomeCyberia } from '../cyberia-admin/BiomeCyberiaAdmin.js';

const ShopCyberiaBiome = {
  id: 'shop',
  render: async function () {
    return BiomeCyberia['grid-base']({
      type: 'shop',
    });
  },
};

export { ShopCyberiaBiome };
