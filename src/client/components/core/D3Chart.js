import { connectedScatterplotChart } from '../chart/connectedScatterplotChart.js';

// https://takanori-fujiwara.github.io/d3-gallery-javascript/

const D3Chart = {
  Render: async function () {
    setTimeout(async () => {
      const driving = await d3.csv('/data/driving.csv', d3.autoType);

      const button = d3.select('.chart-panel').append('div').append('button').attr('type', 'button').text('Replay');

      const play = () => {
        const chart = connectedScatterplotChart(driving, {
          svgId: 'connected-scatterplot',
          x: (d) => d.miles,
          y: (d) => d.gas,
          title: (d) => d.year,
          orient: (d) => d.side,
          yFormat: '.2f',
          xLabel: 'Miles driven (per capita per year) →',
          yLabel: '↑ Price of gas (per gallon, adjusted average $)',
          width: 1000,
          height: 720,
          duration: 5000, // for the intro animation; 0 to disable
        });
        d3.select('#connected-scatterplot').remove();
        d3.select('.chart-container').append(() => chart);
      };

      play();

      // replay
      button.on('click', () => {
        play();
      });
    });
    return html`
      <div class="in chart-container"></div>
      <div class="in chart-panel"></div>
    `;
  },
};

export { D3Chart };
