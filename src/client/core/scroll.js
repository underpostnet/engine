
document.onscroll = function (e) {

    // console.log('onscroll', e);

    if (!this.scrollPos) this.scrollPos = 0;
    const aux_scroll = -1 * s('html').getBoundingClientRect().top;

    let dataScroll = {};

    if (aux_scroll > this.scrollPos) {
        // console.log(('scroll ↓ ' + (aux_scroll) + ' + innerHeight: ' + window.innerHeight));
        dataScroll.down = true;
    } else {
        // console.log(('scroll ↑ ' + (aux_scroll) + ' + innerHeight: ' + window.innerHeight));
        dataScroll.down = false;
    }
    dataScroll.scroll = aux_scroll;

    viewPaths.map(pathData => {
        if (GLOBAL[pathData.component] && GLOBAL[pathData.component].onScroll) {
            GLOBAL[pathData.component].onScroll(dataScroll);
        }
    });

    this.scrollPos = newInstance(aux_scroll);
};