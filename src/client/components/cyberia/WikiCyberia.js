import { borderChar } from '../core/Css.js';
import { getProxyPath } from '../core/Router.js';

const WikiCyberia = {
  Render: async function () {
    const renderSection = ({ title, imgPath, body, color }) => {
      return html`
        <div class="fl wiki-container">
          <div class="in fll" style="width: 30%;">
            <div class="in section-mp">
              <img class="in wiki-logo" src="${imgPath}" />
            </div>
          </div>

          <div class="in fll" style="width: 70%">
            <div class="in section-mp">
              <div class="in section-mp wiki-text-2 wiki-text-2-shadow-${color}">${title}</div>
              <div class="in  m">${body}</div>
            </div>
          </div>
        </div>
      `;
    };
    return html`
      ${borderChar(2, 'red', ['.wiki-text-2-shadow-red'])} ${borderChar(2, 'yellow', ['.wiki-text-2-shadow-yellow'])}
      ${borderChar(2, 'blue', ['.wiki-text-2-shadow-blue'])}
      <style>
        .wiki-text-2 {
          font-size: 30px;
          color: black;
        }
        .wiki-container {
          font-size: 14px;
        }
        .wiki-logo {
          width: 100%;
        }
      </style>
      ${renderSection({
        title: `Zenith Empire`,
        color: 'red',
        imgPath: `${getProxyPath()}assets/lore/macro-factions/zenith-empire.jpeg`,
        body: html`<strong>Culture </strong> Militaristic and expansionist. They believe in the superiority of their
          civilization and the need to dominate space.
          <br />
          <strong> Characteristic:</strong> They develop advanced military technologies and have a large space fleet.
          Their population is primarily composed of genetically modified Colonists bred to be soldiers.
          <br />
          <strong>Alliance:</strong> They maintain strategic alliances with other technological powers, such as the Nova
          Republic.
          <br />
          <strong>Rivalries:</strong>Their primary rival is the Stellar Atlas Confederation, which they view as weak and
          indecisive. The Confederation's tolerance of Mutagenics, considered a biothreat by the Zenith Empire, further
          fuels this rivalry.
          <br />
          <br />
          <strong>key activities:</strong>
          <br />
          <br />
          ${'&nbsp'.repeat(4)}<strong>Military Industry:</strong> Manufacturing advanced weaponry and spacecraft for
          their military.
          <br />
          ${'&nbsp'.repeat(4)}<strong>Resource Exploitation:</strong> Exploiting resource-rich planets and asteroids to
          fuel their war machine.
          <br />
          ${'&nbsp'.repeat(4)}<strong>Synthetic Labor:</strong> Utilizing synthetic workers in various industries,
          reducing labor costs and increasing efficiency.
          <br />
          <br />`,
      })}
      ${renderSection({
        title: `Atlas Confederation`,
        color: 'yellow',
        imgPath: `${getProxyPath()}assets/lore/macro-factions/atlas-confederation.jpeg`,
        body: html`
          <strong>Culture:</strong> Based on peaceful exploration and cultural exchange. They value diversity and
          cooperation between species.
          <br />
          <strong>Characteristics:</strong> They dominate space exploration and planetary colonization technologies.
          Their population is a balanced mix of Colonists, Mutagens, and Synthetics living in harmony.
          <br />
          <strong>Alliances:</strong> They maintain diplomatic relations with most space powers, and above all with
          diversity of minor clans.
          <br />
          <strong>Rivalries:</strong> It often has conflicts with the Zenith Empire over substance and biological
          organisms trafficking, and by the policies of exploitation of planetary resources.
          <br />
          <br />
          <strong>key activities:</strong>
          <br />
          <br />
          ${'&nbsp'.repeat(4)}<strong>Exploration technologies:</strong> Renowned for its advanced exploration
          technologies and its ability to explore and terraform new worlds
          <br />
          ${'&nbsp'.repeat(4)}<strong>Bioengineering:</strong> Developing advanced bioengineering techniques to improve
          human capabilities and adapt to extreme environments.
          <br />
          ${'&nbsp'.repeat(4)}<strong>Mercenary Work:</strong> Providing specialized services, such as combat,
          infiltration, and survival skills, to other factions.
          <br />
          <br />
        `,
      })}
      ${renderSection({
        title: `Nova Republic`,
        color: 'blue',
        imgPath: `${getProxyPath()}assets/lore/macro-factions/nova-republic.jpeg`,
        body: html`
          <strong>Culture:</strong>
          Technological and elitist. They believe in the superiority of artificial intelligence and the need to control
          the universe.
          <br />
          <strong>Characteristics:</strong>
          They dominate advanced artificial intelligence and nanotechnology. Their population is primarily composed of
          Synthetics and a genetically modified elite of Colonists.
          <br />
          <strong>Alliances:</strong>
          They maintain strategic alliances with the Zenith Empire, sharing interests in territorial expansion.
          <br />
          <strong>Rivalries:</strong>
          They have a historical rivalry with hacker organizations and sometimes conflict with the Stellar Atlas
          Confederation and its Colonists.
          <br />
          <br />
          <strong>key activities:</strong>
          <br />
          <br />
          ${'&nbsp'.repeat(4)}<strong>Technological Innovation:</strong> Developing advanced AI systems for various
          purposes, and cutting-edge technologies for selling them to other factions.
          <br />
          ${'&nbsp'.repeat(4)}<strong>Corporate Domination:</strong> Monopolizing key industries and markets through
          strategic acquisitions and mergers.
          <br />
          ${'&nbsp'.repeat(4)}<strong>Virtual Reality:</strong> Developing and selling virtual reality experiences,
          entertainment, and training simulations.
          <br />
          <br />
        `,
      })}
    `;
  },
};

export { WikiCyberia };
