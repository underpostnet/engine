this.dogmadual_landing = {
    projects: [
        {
            name: 'underpost.net',
            link: 'https://underpost.net',
            img: '/assets/apps/dogmadual/projects/underpost_alpha.png',
            description: {
                en: `Virtual laboratory and Vanilla JS thin layer library development as core web client`,
                es: `Laboratorio virtual y desarrollo de una delgada capa de libreria vanilla-js como nucleo para clientes web`
            },
            id: 'underpost'
        },
        {
            name: 'nexdev.org',
            link: 'https://www.nexodev.org',
            img: '/assets/apps/dogmadual/projects/nexodev_alpha.png',
            description: {
                en: `Web hosting service for Wordpress, and precision devops as multiplatform applications development.`,
                es: `Servicio de hosting para Wordpress, y desarrollo a precisión de aplicaciones multiplataforma bajo modalidad devops`
            },
            id: 'nexodev'
        },
        {
            name: 'Cyberia Online',
            link: 'https://www.cyberiaonline.com',
            img: '/assets/apps/dogmadual/projects/cyberia_alpha.png',
            description: {
                en: `Multiplatform virtual world  with characteristics of a MMORPG
                (massively multiplayer online role-playing game) Complemented with the characteristics of modern social networks`,
                es: `Mundo virtual multiplataforma con características de un MMORPG
                (juego de rol multijugador masivo en línea) Complementado con las características de las redes sociales modernas`
            },
            id: null
        },
        {
            name: 'Crypto Koyn',
            link: 'https://www.cryptokoyn.net',
            img: '/assets/apps/dogmadual/projects/cryptokoyn.png',
            description: {
                en: `Decentralized network transactions for token items and cryptocurrency blockchain economy`,
                es: `Transacciones de red descentralizadas para item-tokens y economía blockchain de criptomonedas`
            },
            id: 'cryptokoyn'
        },
    ],
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'dogmadual_landing-' + s4());

        // setTimeout(() => {
        //     this.projects.map((dataProject, i) =>
        //         s(`.${this[IDS][0]}-${i}`).onclick = () =>
        //             location.href = dataProject.link);
        // });
        return /*html*/`      
         <style>
            .${this[IDS][0]} {
                cursor: pointer;
                transition: .3s;
            }
            .${this[IDS][0]}:hover {
                background: rgb(20, 20, 20); 
            }            
            .${this[IDS][1]} {
                 width: 290px;
                 margin: 15px;
                 margin: auto;
            }             
            .content-${this[IDS][1]} {
                 height: 100px;
            }             
            .title-${this[IDS][1]} {
                 padding: 10px;
                 text-align: center;
                 margin-bottom: 30px;
            }             
            .text-${this[IDS][1]} {
                 height: 150px;
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
                limit: 600,
                css: /*css*/`
                 .${this[IDS][0]} {
                     width: 50%;
                 }
             `},
            {
                limit: 1200,
                css: /*css*/`
                 .${this[IDS][0]} {
                     width: 25%;
                 }
             `}
        ])}
         <div class='fl container'>
                    <div class='in title' style='text-align: center; padding: 30px'>
                        ${renderLang({ es: 'Nuestros Proyectos', en: 'Our projects' })}
                    </div>
                    ${this.projects.map((dataProject, i) => /*html*/`
                    <a href='${dev && dataProject.id != null ? `/${dataProject.id}` : dataProject.link}'>
                        <div class='in fll ${this[IDS][0]} ${this[IDS][0]}-${i}'>
                            <div class='in'>
                              <!--  <div class='title title-${this[IDS][1]}'>${dataProject.name}</div> -->
                                <div class='in content-${this[IDS][1]}'>    
                                    <img class='in ${this[IDS][1]}' src='${dataProject.img}'>
                                </div> 
                                <div class='in text-${this[IDS][1]}'>        
                                ${renderLang(dataProject.description)}
                                </div>
                            </div>
                            <div class='abs' style='right: 10px; bottom: 10px'>
                                <i class='fa fa-external-link' aria-hidden='true'></i>
                            </div>
                        </div>  
                    </a>                   
                    `).join('')}                 
         </div>
        
        <div class='in container'>
            <div class='in title' style='text-align: center; padding: 30px'>
                ${renderLang({ es: 'Red de Tecnologias', en: 'Tech network' })}
            </div>
            <style>
                .tech-network {
                    width: 100%;
                    min-width:  800px;
                    margin: auto;
                }
            </style>
            <img class='in tech-network'src='/assets/apps/dogmadual/tech_network.svg'>
        </div>
     `
    }
};