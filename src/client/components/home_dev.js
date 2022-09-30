


this.home_dev = {
    init: function () {


        return /*html*/`
                    <div class='in container title' style='text-align: center'>
                        current projects
                    </div>
                    <style>
                        .icon-app {
                            width: 40px;
                            height: 40px;
                            top: 7px;
                        }
                    </style>
                    ${APPS.map((dataApp, i) => /*html*/ i != 0 ? `                    
                        <a href='${dataApp.baseHome}' style='text-decoration: none; font-size: 30px'>
                                <div class='in container main-card'>
                                    <img class='inl icon-app' src='${dataApp.viewMetaData.favicon.path}'>
                                    ${dataApp.viewMetaData.mainTitle}
                                </div>
                        </a>                    
                    `: '').join('')}
        
        `
    }
};