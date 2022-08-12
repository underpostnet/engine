this.nexodev_landing = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'nexodev_landing-' + s4());








        return /*html*/`      
            <style>
                .nexodev-logo-services {
                    width: 200px;
                    margin: 15px;
                    filter: invert(100%);
                    margin: auto;
                }
                .content-nexodev-logo-services {
                    height: 220px;
                }
                .title-nexodev-logo-services {
                    padding: 10px;
                    text-align: center;
                    margin-bottom: 30px;
                }
                .text-nexodev-logo-services {
                    height: 170px;
                    padding: 10px;
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
                    <div class='in'>
                        <div class='title title-nexodev-logo-services'>DevOps</div>
                        <div class='in content-nexodev-logo-services'>    
                            <img class='in nexodev-logo-services' src='/assets/nexodev/devops.png'>
                        </div> 
                        <div class='in text-nexodev-logo-services'>        
                            Desarrollo a precisión de aplicaciones web/móviles combinando la potencia de servidores nodejs/express y php/apache. Incluye SEO (Search Engine Optimization) y Soporte garantizado.
                        </div>
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in'>
                        <div class='title title-nexodev-logo-services'>WordPress</div>
                        <div class='in content-nexodev-logo-services'>    
                            <img class='in nexodev-logo-services' src='/assets/nexodev/wordpress.png'>
                         </div>
                         <div class='in text-nexodev-logo-services'>         
                            Servicio de hosting para WordPress. Autoadministrable. Acceso a plugins, certificado SSL gratuito, integración a correo electrónico, y Soporte. Renovación anual.
                        </div>
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in'>
                        <div class='title title-nexodev-logo-services'>Newsletter</div>
                        <div class='in content-nexodev-logo-services'>    
                            <img class='in nexodev-logo-services' src='/assets/nexodev/newsletter.png'>
                        </div> 
                        <div class='in text-nexodev-logo-services'>        
                            Incremente la efectividad de su marca a través del envío automatizado de boletines informativos, y así mantener una comunicación directa y personalizada con sus clientes.
                        </div>
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in'>                          
                        <div class='title title-nexodev-logo-services'>Data Science</div>
                        <div class='in content-nexodev-logo-services'>    
                            <img class='in nexodev-logo-services' src='/assets/nexodev/datascience.png'>
                        </div> 
                        <div class='in text-nexodev-logo-services'>        
                            Conozca mejor a sus clientes, o desarrolle investigación, a través de nuestro servicio de tratamiento, análisis y visualización de datos. Utilizamos la calidad del entorno de tecnologias basadas en lenguajes Python & R.
                        </div>
                    </div>
                </div>        
            </div>
        `
    }
};