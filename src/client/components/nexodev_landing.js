this.nexodev_landing = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'nexodev_landing-' + s4());








        return /*html*/`      
            <style>
                .nexodev-logo-services {
                    width: 90%;
                    margin: auto;
                    filter: invert(100%);
                }
            </style> 
            ${renderMediaQuery([
            {
                limit: 0,
                css: /*css*/`
                    .${this[IDS][0]} {
                        width: 100%;
                    }
                `},
            {
                limit: 800,
                css: /*css*/`
                    .${this[IDS][0]} {
                        width: 50%;
                    }
                `},
            {
                limit: 1400,
                css: /*css*/`
                    .${this[IDS][0]} {
                        width: 25%;
                    }
                `}
        ])}
            <div class='fl container'>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in container'>
                        <div class='title'>DevOps</div>
                        <img class='in nexodev-logo-services' src='/assets/nexodev/devops.png'>
                                    
                        Desarrollo a precisión de aplicaciones web/móviles combinando la potencia de servidores nodejs/express y php/apache. Incluye SEO (Search Engine Optimization) y Soporte garantizado.
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in container'>
                        <div class='title'>WordPress</div>
                        <img class='in nexodev-logo-services' src='/assets/nexodev/wordpress.png'>
                                  
                        Servicio de hosting para WordPress. Autoadministrable. Acceso a plugins, certificado SSL gratuito, integración a correo electrónico, y Soporte. Renovación anual.
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in container'>
                        <div class='title'>Newsletter</div>
                        <img class='in nexodev-logo-services' src='/assets/nexodev/newsletter.png'>
                                   
                        Incremente la efectividad de su marca a través del envío automatizado de boletines informativos, y así mantener una comunicación directa y personalizada con sus clientes.
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in container'>                          
                        <div class='title'>Data Science</div>
                        <img class='in nexodev-logo-services' src='/assets/nexodev/datascience.png'>
                               
                        Conozca mejor a sus clientes, o desarrolle investigación, a través de nuestro servicio de tratamiento, análisis y visualización de datos. Utilizamos la calidad del entorno de tecnologias basadas en lenguajes Python & R.
                    </div>
                </div>        
            </div>
        `
    }
};