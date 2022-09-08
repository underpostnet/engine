

this.underpost_pre_footer = {
    init: function () {
        const renderPreFooter = /*html*/`        
        <style>
        .iframe-cube-underpost {
            margin: auto;
            background: none;
            width: 300px;
            height: 300px;
            border: none;
        }
        .github-widget {
            margin: auto;
            border: none !important;
        }
        </style>
           ${renderMediaQuery([
            {
                limit: 0,
                css: /*css*/`
                 .cell-upf {
                     width: 100%;
                 }
             `},
            {
                limit: mobileLimit,
                css: /*css*/`
                 .cell-upf {
                     width: 50%;
                 }
             `}
        ])}
        <div class='container fl'>
            <div class='in fll cell-upf' style='${rrb()}'>
                      <iframe class='in iframe-cube-underpost' src='https://underpost.net/cube.php'></iframe>
            </div>
            <div class='in fll cell-upf' style='${rrb()}'>
                      <div class='in github-widget' data-username='underpostnet'></div>
            </div>
        </div>
        `;
        setTimeout(() => append('main', renderPreFooter));
        return '';
    }
}