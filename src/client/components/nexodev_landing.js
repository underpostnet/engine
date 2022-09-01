this.nexodev_landing = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'nexodev_landing-' + s4());








        return /*html*/`      
            <style>
                .${this[IDS][1]} {
                    width: 200px;
                    margin: 15px;
                    filter: invert(100%);
                    margin: auto;
                }
                .content-${this[IDS][1]} {
                    height: 220px;
                }
                .title-${this[IDS][1]} {
                    padding: 10px;
                    text-align: center;
                    margin-bottom: 30px;
                }
                .text-${this[IDS][1]} {
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
                        <div class='title title-${this[IDS][1]}'>DevOps</div>
                        <div class='in content-${this[IDS][1]}'>    
                            <img class='in ${this[IDS][1]}' src='/assets/apps/nexodev/icon/dev.png'>
                        </div> 
                        <div class='in text-${this[IDS][1]}'>        
                            ${renderLang({
                                es: 'Desarrollo a precisión de aplicaciones web/móviles combinando la potencia de servidores nodejs/express y php/apache. Incluye SEO (Search Engine Optimization) y Soporte garantizado.',
                                en: 'Precision development of web/mobile applications combining the power of nodejs/express and php/apache servers. Includes SEO (Search Engine Optimization) and Guaranteed Support.'
                            })}
                        </div>
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in'>
                        <div class='title title-${this[IDS][1]}'>WordPress</div>
                        <div class='in content-${this[IDS][1]}'>    
                            <img class='in ${this[IDS][1]}' src='/assets/apps/nexodev/icon/wp.png'>
                         </div>
                         <div class='in text-${this[IDS][1]}'>         
                            ${renderLang({
                                es: 'Servicio de hosting para WordPress. Autoadministrable. Acceso a plugins, certificado SSL gratuito, integración a correo electrónico, y Soporte. Renovación anual.',
                                en: 'Hosting service for WordPress. Self-managed. Access to plugins, free SSL certificate, email integration, and Support. Annual renewal.'
                            })}
                         </div>
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in'>
                        <div class='title title-${this[IDS][1]}'>Newsletter</div>
                        <div class='in content-${this[IDS][1]}'>    
                            <img class='in ${this[IDS][1]}' src='/assets/apps/nexodev/icon/mailer.png'>
                        </div> 
                        <div class='in text-${this[IDS][1]}'> 
                            ${renderLang({
                                es: 'Incremente la efectividad de su marca a través del envío automatizado de boletines informativos, y así mantener una comunicación directa y personalizada con sus clientes.',
                                en: 'Increase the effectiveness of your brand through the automated sending of newsletters, and thus maintain direct and personalized communication with your customers.'
                            })}    
                        </div>
                    </div>
                </div>
                <div class='in fll ${this[IDS][0]}'>
                    <div class='in'>                          
                        <div class='title title-${this[IDS][1]}'>Data Science</div>
                        <div class='in content-${this[IDS][1]}'>    
                            <img class='in ${this[IDS][1]}' src='/assets/apps/nexodev/icon/ds.png'>
                        </div> 
                        <div class='in text-${this[IDS][1]}'>                                    
                            ${renderLang({
                                es: 'Conozca mejor a sus clientes, o desarrolle investigación, a través de nuestro servicio de tratamiento, análisis y visualización de datos. Utilizamos la calidad del entorno de tecnologias basadas en lenguajes Python & R.',
                                en: 'Get to know your customers better, or develop research, through our data treatment, analysis and visualization service. We use the quality of the environment of technologies based on Python & R languages.'
                            })}  
                        </div>
                    </div>
                </div>        
            </div>
        `
    }
};