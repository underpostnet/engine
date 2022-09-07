// TODO: SITEMAP STATIC SETS LINKS

this.contracultura_cyberpunk = {
    init: function () {

        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'main_menu-' + s4());


        this.searchOpen = 'x' + s4();
        this.searchClose = 'x' + s4();
        this.containerBtnsSearch = 'x' * s4();
        this.searchBoxResultContainer = 'x' + s4();

        this.mainListContainer = 'x' + s4();


        const execSearchBox = (valueSearch) => {
            let resultSearch = [];

            sa('a').forEach((currentValue, currentIndex, listObj) => {
                // console.log(currentValue.innerHTML);
                // console.log(currentValue.href);

                valueSearch.split(' ').map(x => x.trim().toLowerCase()).map(x => {
                    if (currentValue.innerHTML.split(' ')
                        .map(y => y
                            .trim().toLowerCase()
                        ).includes(x)) {
                        if (!resultSearch.find(x => x.name == currentValue.innerHTML))
                            resultSearch.push({
                                name: currentValue.innerHTML,
                                link: currentValue.href
                            });
                    };
                });



            });

            console.log('result', resultSearch);

            if (resultSearch.length > 0) {

                const listAllId = 'x' + s4();

                setTimeout(() => {
                    s('.' + listAllId).onclick = () => {

                        s('.' + this.searchBoxResultContainer).style.display = 'none';
                        fadeIn(s('.' + this.mainListContainer));
                    };
                });

                s('.' + this.mainListContainer).style.display = 'none';

                htmls('.' + this.searchBoxResultContainer,
               /*html*/`
                <div class='in container title'>
                ${resultSearch.length} ${renderLang({ es: 'Resultados de Busqueda', en: 'Searchs Result' })}
                </div>
                <br><br>
               `+ resultSearch.map((resultData, i, a) => {
                    return /*html*/`
                    <b> ></b> <a target='_blank'  href='${resultData.link}'>${resultData.name}</a>
                    <br><br>
                    `;
                }).join('') + /*html*/`
                <button class='${listAllId}'><i class='fas fa-bars'></i> ${renderLang({ es: 'Listar Todos', en: 'List all' })}</button>
                <br><br>                        
                `);

                fadeIn(s('.' + this.searchBoxResultContainer));
            } else {
                append('body', renderFixModal({
                    id: 'mini-modal-' + s4(),
                    icon: errorIcon,
                    color: 'red',
                    content: renderLang({ es: 'No Existen Resultados para la busqueda', en: 'There are no results for the search' })
                }));
            }
        };

        setTimeout(() => {

            if (getQueryParams().type == 'blog')
                (htmls('top-banner', /*html*/`
                <style>
                a, .title {
                    color: #ff00ff;
                }
                </style>
                
                `+ initRenderCC), s('.simple-desc').style.display = 'none', s('main').style.display = 'none');


            if (getQueryParams().s)
                execSearchBox(getQueryParams().s);

            s('.' + this.containerBtnsSearch).onclick = () => {
                if (s('.' + this.searchOpen).style.display != 'none') {
                    s('.' + this.searchOpen).style.display = 'none';
                    fadeIn(s('.' + this.searchClose));
                    s('.cc-search-container').style.width = '90%';
                    s('.cc-search-container').style.height = '200px';
                    fadeIn(s('.' + this[IDS][0]));
                    setTimeout(() => s('.' + this[IDS][2]).focus());
                    setTimeout(() => s('.' + this[IDS][2]).focus(), 500);
                    return;
                }
                s('.' + this.searchClose).style.display = 'none';
                s('.cc-search-container').style.width = '80px';
                s('.cc-search-container').style.height = '70px';
                fadeIn(s('.' + this.searchOpen));
                fadeOut(s('.' + this[IDS][0]));
            };

            s('.' + this[IDS][4]).onclick = e => {

                e.preventDefault();
                console.log('cc search box submit');

                if (s('.' + this[IDS][2]).value != '') {
                    const querySearchUri = location.pathname + '?s=' + s('.' + this[IDS][2]).value;
                    if ((getURI() + location.search) != querySearchUri)
                        setURI(querySearchUri);

                    s('.' + this.containerBtnsSearch).click();
                    execSearchBox(s('.' + this[IDS][2]).value);

                }

            }
        });


        const initRenderCC =  /*html*/`  

        <style>
            .cc-search-container {          
                background: black;
                border-bottom: 3px solid ${mainColor};
                top: 10px;
                right: 10px;
                z-index: 2;
                transition: .3s;
            }
        </style>

        <div class='fix container cc-search-container' style='width: 80px; height: 70px;'>
            <div class='in'>
                <div class='in flr ${this.containerBtnsSearch}'>
                    <button style='display: block' class='${this.searchOpen}'><i class='fas fa-search'></i></button>
                    <button style='display: none' class='${this.searchClose}'><i class='fas fa-times'></i></button>
                </div>
            </div>
            <form class='${this[IDS][0]}' style='display: none;  overflow: hidden'>
                ${renderInput(this[IDS], renderLang({ es: `Buscar en Blog`, en: `Blog Search` }), [1, 2, 3])}        
                <button type='submit' class='${this[IDS][4]}'>${renderLang({
            es: 'Buscar',
            en: 'Search'
        })}<i class='fas fa-search'></i></button>        
            </form>
        </div>
        
        <div class='container'>
                <br /><br /><br /><img class='in' style="width: 330px; height: 115px; margin: auto;" src="https://underpost.net/img/alert.jpg" />
                <br /><br /><br />

                <div class='in title' style='text-align: center;'>
                    Contracultura Cyberpunk
                </div>
                <br /><br /><br />
                <div class='in ${this.searchBoxResultContainer}' style='display: none'>
                </div>
        <div class='in ${this.mainListContainer}' style='max-width: 500px; margin: auto;'>

                <b>Metacultural</b><br /><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/01/que-es-el-cyberpunk.html>¿Qué es el Cyberpunk?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/02/el-manifiesto-cyberpunk-extractos.html>El Manifiesto Cyberpunk, Extractos</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/12/sobre-el-ser-cyberpunk.html>Sobre el Ser Cyberpunk</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/03/cyberpunk-ciencia-ficcion-hecha-realidad.html>Cyberpunk, Ciencia Ficción Hecha Realidad</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/01/cyberpunk-mas-alla-de-matrix.html>Cyberpunk, Mas Alla de Matrix</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/12/la-contracultura-y-metacultura.html>La Contracultura y Metacultura</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2021/01/el-cyberpunk-en-el-tercer-mundo.html>El Cyberpunk en el Tercer Mundo</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/11/la-pastilla-azul-o-la-pastilla-roja.html>¿La pastilla Azul o la pastilla Roja?</a><br />

                <br /><b>Cultura Hacker</b><br /><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/03/el-decalogo-de-la-cultura-hacker.html>El Decálogo de la Cultura Hacker</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/07/el-manifiesto-hacker.html>El Manifiesto Hacker</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/07/el-emblema-hacker.html>El Emblema Hacker</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/01/que-es-anonymous.html>¿Qué es Anonymous?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/03/el-wirepunk.html>El Wirepunk</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2021/04/los-caballeros-del-calculo-lambda.html>Los Caballeros del cálculo lambda</a><br />

                <br /><b>Pospolítica, Punk, y Cibercultura</b><br /><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/10/entendiendo-el-fin-de-la-historia.html>Entendiendo el Fin de la Historia</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/12/el-objetivismo-de-ayn-rand.html>El Objetivismo de Ayn Rand</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/03/la-pospolitica-el-derecho-ser-diferente.html>La Pospolítica: El derecho a ser Diferente</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/08/anarquismo-el-renacer-gracias-la.html>Anarquismo el Renacer gracias a la Tecnología</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/11/los-dos-tipos-de-argumentos.html>Los tipos de argumento Políticamente Incorrecto</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/10/la-diferencia-entre-cybergoth-cyberpunk.html>La Diferencia entre Cyberpunk, Cybergoth, y Cyberdark</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/10/que-es-y-de-que-trata-el-manifiesto.html>Qué es y de que trata el Manifiesto Autoderterminista</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/05/la-zona-temporalmente-autonoma.html>La Zona Temporalmente Autónoma</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/08/los-tecnopaganos.html>Los TecnoPaganos</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/04/la-fundacion-scp.html>La Fundación SCP</a><br />

                <br /><b>Mundos Virtuales</b><br /><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/02/declaracion-de-independencia-del.html>Declaración de Independencia del Ciberespacio</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/12/los-mundos-virtuales.html>¿Qué son los Mundos Virtuales?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/06/que-son-los-metaversos.html>¿Qué son los Metaversos?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2021/03/ge-stell-simulacro-y-matrix.html>Ge-stell Simulacro y Matrix</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/07/la-llegada-del-tercer-vehiculo.html>La llegada del Tercer Vehículo</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/02/los-dos-mundos-serial-experiments-lain.html>Los Dos Mundos Serial Experiments Lain</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/08/las-drogas-virtuales.html>Las Drogas Virtuales</a><br />



                <br /><b>Información y Economía</b><br /><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/10/los-principios-del-anarco-capitalismo.html>Los principios del Anarco Capitalismo</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/08/cypherpunks-el-manifiesto.html>Cypherpunks: El Manifiesto CriptoAnarquista</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/02/por-que-libre-acceso-la-informacion.html>¿Por Qué Libre acceso a la Información?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/12/la-informacion-quiere-ser-libre.html>La información quiere ser Libre</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/01/julian-assange-antiguo-hacker-de-gran.html>Assange, el Libre Mercado y la Información</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/10/por-que-las-criptomonedas-tienen-valor.html>¿Por qué las criptomonedas tienen valor?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/02/bitocoin-el-valor-del-hash-y-mineria.html>Bitcoin, El valor del Hash y Minería Domestica</a><br /><br />

                <b>Ingeniería Social</b><br /><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/11/que-son-las-armas-silenciosas.html>
                ¿Qué son las "Armas Silenciosas"?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/11/que-es-el-utero-artificial.html>¿Qué es el "útero artificial"?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/11/que-es-la-noosfera-la-nueva-sociedad-red.html>¿Qué es la Noosfera? La nueva Sociedad Red</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/09/la-sociedad-del-cansancio.html>La Sociedad del Cansancio</a><br />

                <br /><b>Transhumanismo e Inteligencia Artificial</b><br /><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2018/10/los-beneficios-del-transhumanismo.html>Los beneficios del Transhumanismo</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/03/biohacking-el-primer-paso-hacia-el.html>Biohacking, el primer paso hacia el Transhumanismo</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2021/06/la-revolucion-artefactual.html>La Revolución Artefactual</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/11/dataismo-transhumanismo-y-metafisica-de.html>Dataismo, transhumanismo, y metafísica de la subjetividad.</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2020/06/la-conciencia-de-la-maquina.html>La Conciencia de la Máquina</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/06/que-es-la-singularidad-tecnologica.html>¿Qué es la Singularidad Tecnológica?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/06/que-es-la-hipotesis-de-simulacion.html>¿Qué es la Hipótesis de Simulación?</a><br />

                <b> > </b><a target='_blank'   href=https://contraculturacyberpunk.blogspot.com/2019/08/el-futuro-de-la-guerra-inteligencia.html
                >El Futuro de la Guerra: Inteligencia Artificial Militar</a><br />

                <br />


                <b>Literatura, Música, y Audio Visual</b><br /><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/02/distoxia.html>DISTOXIA</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2020/09/vigilados-todos-por-las-maquinas-de.html>Vigilados todos por las Máquinas de Amor y Gracia</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/12/como-lagrimas-bajo-la-lluvia.html>Como Lagrimas en la Lluvia</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/07/video-cortos-ambiente-y-estetica.html>Vídeo Cortos Ambiente y Estética Cyberpunk</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/07/las-tres-caras-del-miedo.html>Las Tres Caras del Miedo</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/01/netrunners.html>NetRunners</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/01/vivir-cyberpunk.html>Vivir Cyberpunk</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2020/09/travis.html>Travis</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2020/09/distopia.html>Distopía</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2018/12/cyberia-cafe-club.html>Cyberia, Cafe & Club</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2018/12/encrucijada-en-el-cielo.html>Encrucijada en el Cielo</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2018/12/las-manos-de-orlac.html>Las Manos de Orlac</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/08/la-magia-del-caos.html>La Magia del Caos</a><br />

                <b> > </b><a target='_blank'  href=https://contraculturacyberpunk.blogspot.com/2019/08/paranoid-android.html>Paranoid Android</a><br /><br />


                <b>Blogs de Interes</b><br /><br />


                <b> > </b><a target='_blank'   href=https://cyberpunkdatabase.net/>CyberpunkDataBase.net</a><br />
                <b> > </b><a target='_blank'   href=https://cybermedios.org/>cybermedios.org</a><br />
                <b> > </b><a target='_blank'   href=https://sayko2k20.wordpress.com/>Sayko2k20</a><br />
                <b> > </b><a target='_blank'   href=http://archivocyberpunk.blogspot.com/>Archivo Cyberpunk</a><br />
                <!--<b> > </b><a target='_blank'   href=https://tantractfall.blogspot.com/>tantractfall.blogspot.com</a><br />-->
                <b> > </b><a target='_blank'   href=https://www.despuesdelcyberpunk.com/>despuesDelCyberpunk.com</a><br />
                <b> > </b><a target='_blank'   href=http://www.quemandocromo.es/>QuemandoCromo.es</a><br />
                <b> > </b><a target='_blank'   href=https://8kun.top/cyber/index.html>8kun.top</a><br />
                <b> > </b><a target='_blank'   href=https://lainers.foroactivo.com/>lainers.foroactivo.com</a><br />
                <b> > </b><a target='_blank'   href=https://cyberia.club/>cyberia.club</a><br />
                <b> > </b><a target='_blank'   href=https://revista-lain.neocities.org/>revista-lain.neocities.org</a><br />
                <b> > </b><a target='_blank'   href=https://plex.neocities.org/>plex.neocities.org</a><br />
                <b> > </b><a target='_blank'   href=http://media.hyperreal.org/cyberia/>media.hyperreal.org</a><br />
                <b> > </b><a target='_blank'   href=http://wirepunk.space/>wirepunk.space</a><br />
                <b> > </b><a target='_blank'   href=https://rebelion.digital/>rebelion.digital</a><br />
                <b> > </b><a target='_blank'   href=https://filth.com.mx/>filth.com.mx</a><br />
                <b> > </b><a target='_blank'   href=https://cyberpunk-life.neocities.org/>cyberpunk-life.neocities.org</a><br />
                <b> > </b><a target='_blank'   href=https://hispagatos.org/>hispagatos.org</a><br />
                <b> > </b><a target='_blank'   href=https://imaginacionalpoder77.blogspot.com/>imaginacionalpoder77.blogspot.com</a><br />
                <b> > </b><a target='_blank'   href=http://www.habitantesdelcaos.com/>habitantesdelcaos.com</a><br />
                <b> > </b><a target='_blank'   href=http://scp-es.com/>Fundación SCP</a><br />
                <b> > </b><a target='_blank'   href=http://www.rinconsolidario.org/linux>RinconSolidario.org</a><br />
                <b> > </b><a target='_blank'   href=https://wp.sindominio.net/>SinDominio.net</a><br />
                <b> > </b><a target='_blank'   href=https://www.neonlights.top/>NeonLights</a><br />
                <b> > </b><a target='_blank'   href=https://wired-7.org/>wired-7.org</a><br />
                <b> > </b><a target='_blank'   href=http://futurocaduco.blogspot.com/>FuturoCaduco</a><br />
                <b> > </b><a target='_blank'   href=http://syti.net/>SYTI.net</a><br />
                <b> > </b><a target='_blank'   href=http://project.cyberpunk.ru/links.html>ProjectCyberpunk.ru</a><br />
                <b> > </b><a target='_blank'   href=https://ociointeligente.wordpress.com/>OcioInteligente.Wordpress.com</a><br />
                <b> > </b><a target='_blank'   href=http://www.escalofrio.com/>Escalofrio.com</a><br />
                <b> > </b><a target='_blank'   href=http://monje.tripod.com/>Monje.Tripod.com</a><br />
                <b> > </b><a target='_blank'   href=https://fauux.neocities.org/>Fauux.Neocities.org</a><br />
                <b> > </b><a target='_blank'   href=https://cyberpus2077.blogspot.com/>cyberpus2077.blogspot.com</a><br />
                <b> > </b><a target='_blank'   href=https://www.relatospulp.com/>RelatosPulp</a><br /><br />



                <b>PDF Cyberpunk</b><br /><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/El_Manifiesto_Cyberpunk.pdf'/>El Manifiesto Cyberpunk</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/nuestro-oscuro-futuro.pdf'/>Nuestro Oscuro Futuro</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/cyberpunk-y-necropolitica.pdf'/>Cyberpunk y Necropolitica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/Cypherpunk-Julian-Assange.pdf'/>Cypherpunks Julian Assange</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Moda_Cibernetica_y_literatura_Cyberpunk.pdf'/>Moda Cibernetica y literatura Cyberpunk</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Senda_de_la_Tecnomancia.pdf'/>Senda de la Tecnomancia</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Cyberpunk_Critica_a_la_Informatica.pdf'/>Cyberpunk Critica a la Informatica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Cyberpunk_Mas_alla_de_la_matrix.pdf'/>Cyberpunk Mas alla de la matrix</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Futurismo_negro_y_cyberpunk.pdf'/>Futurismo negro y cyberpunk</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Distopia_Musical_La Musica_en_el_Cyberpunk.pdf'/>Distopia Musical La Musica en el Cyberpunk</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/Apuntes%20para%20una%20poetica%20del%20subgenero.pdf'/>Apuntes del Subgenero Cyberpunk</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/analisis%20sleep%20dealer.pdf'/>Análisis Sleep Dealer</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/analisis%20ygdrasil.pdf'/>Análisis Ygdrasil</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/representacion%20del%20cuerpo%20futuro.pdf'/>Representación del Cuerpo del Futuro</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/sentido%20del%20cyberpunk%20en%20el%20cine.pdf'/>Sentido del Cyberpunk en el Cine</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/integracion-hombre-maquina-ciencia-ficcion.pdf'/>Integración Hombre Maquina en la Ciencia Ficción</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/si%20el%20computador%20funcionara%20como%20un%20humano.pdf'/>Si el Computador Funciona como un Humano</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/Nueromante%20el%20Futuro%20que%20llego.pdf'/>Neuromante el Futuro que Llego</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/cyberpunk-japones.pdf'/>Cyberpunk Japones</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/japon-de-los-cyborgs-tecno-orientalismo.pdf'/>Japón de los Cyborgs Tecno-Orientalismo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/la-estetica-cyberpunk.pdf'/>La Estetica Cyberpunk</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/del-cyberpunk-al-vaporwave.pdf'/>Del Cyberpunk al Vaporwave</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/cyberpunk-deconstruccion.pdf'/>Cyberpunk Deconstruccion</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/arte-online.pdf'/>El Arte On-Line</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/cibercultura-en-el-final-del-siglo.pdf'/>Velocidad de escape - Mark Dery</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/cibercultura-y-tecnologia-digital.pdf'/>Cibercultura y Tecnología Digital</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/Hackstory.es-Merce-Molist-Ferrer.pdf'/>Hackstory.es Merce Molist Ferrer</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/Nomadismos_Tecnologicos.pdf'/>Nomadismo Tecnologico</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/nuevas-narrativas-virtuales.pdf'/>Nuevas Narrativas Virtuales</a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/WIRED-WEIRD-La-volatilización-del-cuerpo.pdf'/>
                WIRED WEIRD La volatilización del cuerpo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/cyberpunk/cyberpunk-carne-y-maquina.pdf'/>
                Cyberpunk Carne y Maquina
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/cyberpunk/diseno-grafico-y-cyberpunk.pdf'/>
                Diseño Grafico y Cyberpunk
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/cyberpunk/drogas-y-cyberpunk-latinoamericano.pdf'/>
                Drogas y Cyberpunk Latinoamericano
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/cyberpunk/Mirrorshades-Una-antologia-ciberpunk.pdf'/>
                Mirrorshades Una antologia Cyberpunk
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/cyberpunk/snow_crash_analisis_identidad_posmoderna.pdf'/>
                Snow Crash analisis identidad Posmoderna
                </a><br />

                <br /><b>PDF PosModernidad</b><br />

                <br />Pospolítica <br /><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/El_Fin_De_la_Historia.pdf'/>El Fin de la Historia F. Fukuyama</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Argumentos_contra_la_procreacion.pdf'/>Argumentos contra la procreación</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/individulismo-modernidad-liquida.pdf'/>Individualismo y Modernidad Liquida</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/la-socieadad-del-cansancio_.pdf'/>Byung-Chul La Sociedad del Cansancio</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Armas_silenciosas_para_guerras_tranquilas.pdf'/>Armas silenciosas para guerras tranquilas</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/falacia%20del%20todo.pdf'/>La Falacia del Todo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/la-condicion-de-la-posmodernidad.pdf'/>La Condición de la Posmodernidad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/condicion_postmoderma-sobre-el-saber.pdf'/>Informe sobre el Saber</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/pillku%20amantes%20de%20la%20libertad.pdf'/>Pillku Amantes de la Libertad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/La%20Ciudad%20Sobre%20Expuesta.pdf'/>La Ciudad Sobre Expuesta</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/Puertas-y-umbrales-de-la-ciudad.pdf'/>Puertas y Umbrales de la Ciudad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/Tercera%20Piel%20Sociedad%20de%20la%20Imagen%20y%20la%20Conquista%20del%20Alma.pdf'/>Piel Sociedad de la Imagen y la conquista del Alma</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/Virilio-Paul-El-cibermundo-la-politica-de-lo-peor.pdf'/>La Política de lo Peor</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/Virilio_Paul_La_Maquina_de_Vision.pdf'/>La Maquina de Visión</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/velocidad%20tecnologia%20sociedad%20y%20poder.pdf'/>Velocidad Tecnología Sociedad y Poder</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/La-estructura-consecuencialista-del-utilitarismo.pdf'/>La Estructura Consecuencialista del Utilitarismo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/Utilitarismo-y-filosofia-politica-moderna.pdf'/>Utilitarismo y Filosofía Política Moderna</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/anarquismo/anarquismo-una-utopia-que-renace.pdf'/> Anarquismo una Utopía que Renace</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/hackers-software-libre-y-anarquismo.pdf'/>Hackers Software Libre y Anarquismo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/anarquismo/liberalismo-libertario-y-derechos-sociales.pdf'/> Liberalismo Libertario y Derechos Sociales</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posverdad/el-mundo-de-la-posverdad.pdf'/> El Mundo de la Posverdad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posverdad/en-los-pasillos-de-la-posverdad.pdf'/> En los pasillos de la Posverdad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posverdad/informacion-liquida-en-la-era-de-la-posverdad.pdf'/> Información Liquida en la era de la Posverdad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posverdad/mecanismos-de-la-posverdad.pdf'/> Mecanismos de la Posverdad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posverdad/posverdad-en-la-comunicacion.pdf'/> Posverdad en la Comunicación</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posverdad/posverdad-seguridad-y-defensa.pdf'/> Posverdad Seguridad y Defensa</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posverdad/relidad-y-percepcion-era-de-la-posverdad.pdf'/> Realidad y Percepción en la era de la Posverdad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/imperio-contracultural-del-rock-a-la-posmodernidad.pdf'/>Imperio Contracultural del Rock a la Posmodernidad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/contracultura-en-la-era-del-vacio.pdf'/>Contracultura en la era del Vacio</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/mili/derecho-a-la-libertad-legalizacion-de-drogas.pdf'/>Libertad y Legalización de las Drogas</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/mili/el-problema-de-las-drogas-prohibicion-y-libertad.pdf'/>El Problema de las Drogas: Prohibición y Libertad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/mili/etica-militar-y-robotica.pdf'/>Ética Militar y Robótica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/mili/inteligencia-artificial-y-poder.pdf'/>Inteligencia Artificial y Poder</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/anarquismo/PosAnarquismo-Anarquismo-en-movimiento.pdf'/>PosAnarquismo Anarquismo en movimiento</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/necropolitica-gobierno-privado-indirecto.pdf'/>Necropolítica Gobierno Privado Indirecto</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/Armas-de-destruccion-matematica.pdf'/>Armas de destrucción matemática Cathy O'Neil</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/La-algoritmificacion-de-nuestra-convivencia.pdf'/>La algoritmificación de nuestra convivencia</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/despotismo-tecnificado.pdf'/>El Despotismo Tecnificado</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/assange-criptopunks.pdf'/>Assange Criptopunks</a><br />

                <b> > </b><a target='_blank'  
                href='https://underpost.net/ir/pdf/11-09-21/pospolitica/imaginarios-de-la-muerte-en-la-posmodernidad.pdf'>
                Imaginarios de la Muerte En la Posmodernidad</a><br />

                <b> > </b><a target='_blank'  
                href='https://underpost.net/ir/pdf/11-09-21/pospolitica/Julian_Assange_Periodismo_cientifico_y_etica_hacker.pdf'>
                Julian Assange Periodismo cientifico y etica hacker</a><br />

                <b> > </b><a target='_blank'  
                href='https://underpost.net/ir/pdf/11-09-21/pospolitica/La-sociedad-del-riesgo-hacia-una-nueva-modernidad-BECK.pdf'>
                La sociedad de riesgo hacia una nueva modernidad BECK</a><br />

                <b> > </b><a target='_blank'  
                href='https://underpost.net/ir/pdf/11-09-21/pospolitica/posmodernidad-espacio-urbano.pdf'>
                Posmodernidad y Espacio Urbano</a><br />

                <b> > </b><a target='_blank'  
                href='https://underpost.net/ir/pdf/11-09-21/pospolitica/posmodernidad-tecnologia-y-comunicacion-humana.pdf'>
                Posmodernidad Tecnologia y comunicación Humana</a><br />

                <b> > </b><a target='_blank'  
                href='https://underpost.net/ir/pdf/11-09-21/pospolitica/sociologia-y-sociedad-de-riesgo.pdf'>
                Sociologia y sociedad de riesgo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/02-11-2021/convergencia_tecno_social.pdf'>
                Convergencia Tecno Social </a><br />

                <b> > </b><a target='_blank'  
                href='https://underpost.net/ir/pdf/02-11-2021/El_retorno_del_amo_en_tiempos_de_la_pospolítica.pdf'>
                El retorno del amo en tiempos de la pospolítica </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/06-09-2022/pospolitica/El_Estado_Post_Democratico_Extrapolitica_y_transhumanismo.pdf'>
                    Extrapolítica y Transhumanismo - El estado postdemocrático
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/06-09-2022/pospolitica/hiperinformacion-y-miedo-en-la-sociedad-del-conocimiento.pdf'>
                    Miedo he hiperinformación en la sociedad del conocimiento
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/06-09-2022/pospolitica/Teoria_Extrapolitica_y_Postpoliticismo.pdf'>
                    Teoría Extrapolítica y Postpoliticismo
                </a><br />

                <br /> Cibernética <br /><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cibernetica/introduccion-al-pensamiento-sistemico.pdf'/>Introducción al pensamiento Sistémico</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cibernetica/la-quinta-disciplina-pensamiento-sistemico.pdf'/>La Quinta Disciplina Pensamiento Sistémico</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/ciborg_coalicion_contracultural.pdf'/>Ciborg coalicion contracultural</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/El_Movimiento_Cibernetico.pdf'/>El Movimiento Cibernetico</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/ciberciudadanias.pdf'/>Ciberciudadanias</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/internet%20hackers%20y%20software%20libre.pdf'/>Internet, Hackers, y Software Libre</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/techno%20rebelde%20musica%20electronica.pdf'/>Techno Rebelde Un Siglo de Música Electrónica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/Internet-negro-el-lado-oscuro-de-la-red.pdf'/>Internet Negro el lado Oscuro de la Red</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/bienvenidos-a-cyberia-cibercultura.pdf'/>Bienvenidos a Cyberia Cibercultura</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/el-lector-en-el-ciberespacio.pdf'/>El Lector en el Ciberespacio</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/de-cyborg-a_mutante-tiempo-y-espacio-en-cyberia.pdf'/>De Cyborg a Mutante. Tiempo y Espacio en Cyberia</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/cibernetica/hipertrofia-tecnocientifica.pdf'/>Hipertrofia Tecnocientifica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/cibernetica/posverdad-y-teoria-de-sistemas.pdf'/>Posverdad Y Teoria de Sistemas</a><br />

                <br />Psicología <br /><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/27_Personajes_en_busca_del_ser.pdf'/>27 Personajes en busca del ser</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/psicologia-oscura-s-l-moore.pdf'/>Psicologia Oscura S.L. Moore</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/la-llave-maestra.pdf'/>La Llave Maestra Autoconocimiento</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/LA%20GLOBALIZACION%20DEL%20MIEDO.pdf'/>La Globalización del Miedo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/Nardone%20Mas%20alla%20del%20miedo.pdf'/>Nardone Mas alla del Miedo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/psicologia_de_la_adicciones.pdf'/>Psicología de las Adicciones</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/cibercriminologia-contemporanea.pdf'/>Cibercriminologia Contemporanea</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/dualismo/dualismo-cartesiano-el-cuerpo-como-maquina.pdf'/>Dualismo Cartesiano El Cuerpo como Maquina</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/dualismo/dualismo-mente-cuerpo-humano-animal-cartesiano.pdf'/>Dualismo Mente-Cuerpo Humano-Animal Cartesiano</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/dualismo/el-eterno-dualismo-antropologico-roto-por-lain.pdf'/>El eterno Dualismo Antropológico roto por Lain</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/dualismo/monismo-duallismo-y-pluralismo-naturaleza-y-libertad.pdf'/>Monismo Dualismo Pluralismo y Libertad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/dualismo/pulsion-de-muerte.pdf'/>La Pulsión de Muerte</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/La-psicologia-de-la-mentira.pdf'/>La Psicología de la Mentira</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/Psicologia_criminal.pdf'/>Psicología Criminal</a><br />


                <br />Filosofía <br /><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/06-09-2022/filosofia/Tres-Iniciados-El-Kybalion.pdf'>
                    Tres Iniciados - El Kybalion
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/El_Manifiesto_Nihilista.pdf'/>El Manifiesto Nihilista</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Manifiesto_Anticivilizacion.pdf'/>El Manifiesto Anticivilizacion</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/manifiesto-aceleracionista.pdf'/>El Manifiesto Aceleracionista</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/el-fin-de-la-modernidad-nihilismo-y-hermeneutica.pdf'/>Fin de la Modernidad Nihilismo y Hermenéutica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/hackers-filosofia.pdf'/>Hackers Filosofía</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/dualismo/Manifiesto-del-Unabomber.pdf'/>Manifiesto Unabomber Sociedad Industrial y su Futuro</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/la-zona-temporalmente-autonoma-hakim-bey.pdf'/>Zona Temporalmente Autónoma Hakim Bey</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/caos.pdf'/>Caos Hakim Bey</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/inmediatismo.pdf'/>Inmediatismo Hakim Bey</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/Del-Hedonismo-y-las-felicidades-efimeras.pdf'/>Del Hedonismo y las Felicidades efímeras</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/Etica-Hedonista-o-el-Arte-del-Buen-Vivir.pdf'/>Ética Hedonista o el Arte del Buen Vivir</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/Hedonismo-y-Fractura-de-la-Modernidad.pdf'/>Hedonismo Y Fractura de la Modernidad</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/La-Cultura-del-Narcisismo.pdf'/>La Cultura del Narcisismo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/la-sabiduria-estoica.pdf'/>La Sabiduría Estoica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/el-sabio-estoico-examen-de-la-virtud.pdf'/>El Sabio Estoico Examen de la Virtud</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/La-negacion-de-los-valores-y-el-nihilismo.pdf'/>La Negación de los Valores y el Nihilismo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/transhumanismo/transhumanismo-concepciones-alcances-y-tendencias.pdf'/>Transhumanismo Concepciones Alcances y Tendencias</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/transhumanismo/transhumanismo-propuestas-y-limites.pdf'/>Transhumanismo Propuestas y Limites</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/transhumanismo/transhumanismo-y-computacion-RAY-KURZWEIL.pdf'/>Transhumanismo y Computación Ray Kurzweil</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/transhumanismo/transhumanismo-y-singularidad-tecnologica.pdf'/>Transhumanismo y Singularidad Tecnológica</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/transhumanismo/trnshumanismo-libertad-he-identidad-humana.pdf'/>Transhumanismo Libertad e Identidad Humana</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/tecno-biopoder.pdf'/>Tecno BioPoder</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy2/Biopunk-y-etica-DIYBio.pdf'/>BioPunk y Ética DIYBio</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/filosofia/AION-KHRONOS-ZEITLICHKEIT.pdf'/>
                AION KHRONOS ZEITLICHKEIT
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/filosofia/transhumanismo-nietzscheano.pdf'/>
                Transhumanismo Nietzscheano
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/02-11-2021/jack_donovan_el_camino_de_los_hombres.pdf'>
                Jack Donovan - El Camino de los Hombres </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/02-11-2021/como_el_mundo_se_convirtio_en_una_fabula.pdf'>
                Como el mundo se convirtio en una Fabula
                </a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/21-12-2021/antropologia-humano-animal-cyborg.pdf'>
                Antropologia Humano Animal Cyborg
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/21-12-2021/aproximacion-general-al-transhumanismo.pdf'>
                Aproximación General al Transhumanismo
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/21-12-2021/bioetica-neuroetica-libertad-justicia.pdf'>
                Bioética Neuroética Libertad y Justicia
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/21-12-2021/desafios-bioeticos-de-las-tecnologias-emergentes.pdf'>
                DesafÍos Bioéticos de las Tecnologias Emergentes
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/21-12-2021/identitas.pdf'>
                Identitas
                </a><br />



                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/23-03-2022/actitud-ezquidoanalitica-ezquisoanalisis.pdf'/>Actitud esquizoanálitica. Esquizoanálisis</a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/23-03-2022/cuerpo-humano-arte-y-medios-de-masas.pdf'/>Cuerpo Humano Arte y Medios de Masas</a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/23-03-2022/los-adictos-maquinicos.pdf'/>Los Adictos Maquinicos</a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/23-03-2022/ontologia-maquinica-deleuze-guattari.pdf'/>Ontología maquínica de Deleuze y Guattari</a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/23-03-2022/ontologia-mundo-virtual-nicolai-hartmann.pdf'/>Ontología y Mundo Virtual Nicolai Hartmann</a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/21-12-2021/ultimo-suspiro-de-dios-filosofia-posthumanista-posmoderna.pdf'>
                Último suspiro de Dios Filosofia Posthumanista Posmoderna
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/06-09-2022/filosofia/sintomas-del-giro-martirial-del-sacrificio.pdf'>
                    Síntomas del giro martirial del sacrificio
                </a><br />

                <br />Economía <br /><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/El-Manifiesto-Libertario.pdf'/>El Manifiesto Libertario</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/manifiesto-neolibertario-samuel-edward-kokin-III.pdf'/>El Manifiesto Neolibertario Samuel Edward Konkin III</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/La-economia-utilitarista-del-libre-mercado.pdf'/>La Economía Utilitarista del Libre Mercado</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/anarquismo/la-teoría-del-caos-Anarquia-de-mercado.pdf'/>La teoría del Caos Anarquía de Mercado </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/industria4/cuarta-revolucion-indsutrial-deloitte.pdf'/>La Cuarta Revolución Industrial Deloitte</a><br />


                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/industria4/industria-4.0-fabricando-el-futuro.pdf'/>Industria 4.0 Fabricando el Futuro</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/industria4/cuarta-revolucion-industrial-y-materialismo.pdf'/>La Cuarta Revolución Industrial y Materialismo</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/industria4/digitalizacion-industria-4.0.pdf'/>Digitalización y Industria 4.0</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/industria4/infografia-revoluciones-industriales.pdf'/> Infografia Revoluciones Industriales</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/block/blockchain-economia-de-confianza.pdf'/> Blockchain Economía de Confianza</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/block/Guia-de-Criptomonedas.pdf'/> Guía Uso de Criptomonedas</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/block/blockchain-informe-equisoft.pdf'/> Blockchain Informe Equisoft</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/block/criptomonedas-infografia.pdf'/> Criptomonedas Infografia</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/economia/blockchain-comercio-internacional.pdf'/>
                Blockchain y Comercio Internacional
                </a><br />

                <br /><b>PDF Literatura</b><br /><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Sueñan_Androides_Ovejas_Electricas.pdf'/>Sueñan Androides Ovejas Electricas</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/Douglas-Rushkoff-Ciberia-La-Vida-en-Las-Trincheras-Del-Hiperespacio.pdf'/>Douglas Ciberia Vida en Las Trincheras Del Hiperespacio</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/la-caza-de-hackers.pdf'/>La Caza de Hackers Bruce Sterling</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/underground-haruki-murakami.pdf'/>Underground Haruki Murakami</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/Homo-Deus.pdf'/>Homo Deus Yuval Noah Harari</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/De-Animales-a-Dioses.pdf'/>De Animales a Dioses Yuval Noah Harari</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/La_Rebelion_de_Atlas.pdf'/>La Rebelion de Atlas</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cy3/ayn-rand-capitalismo-el-ideal-desconocido.pdf'/>Ayn Rand Capitalismo el Ideal Desconocido</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Debajo_de_la_Alfombra.pdf'/>Debajo de la Alfombra</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Odio_la_Escuela.pdf'/>Odio la Escuela</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/Palahniuk_Chuck-El_club_de_la_lucha.pdf'/>Palahniuk Chuck El club de la lucha</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/Ouspensky%20PD%20-%20Fragmentos%20de%20una%20ensenanza%20desconocida.pdf'/>Ouspensky Fragmentos de una enseñansa Desconocida</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/manifiesto_ciborg_dona_haraway.pdf'/>Manifiesto Ciborg Donna Haraway</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/pos2/testo_yonqui_beatriz_preciado.pdf'/>Testo Yonqui Beatriz Preciado</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/hedo/Enrique-Rojas-El-hombre-light.pdf'/>Enrique Rojas El Hombre Light</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/la-magia-del-caos.pdf'/>La Magia del Caos</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/cyberpunk/liber-null-Peter-J-Carroll.pdf'/>Liber Null Peter J. Carroll</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/06-09-2022/literatura/zona-de-caos-compilado-de-textos.pdf'/>Zona de Caos Compilado de Textos</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/posmodernidad/vigilar-y-castigar-michel-focault.pdf'/>Vigilar y Castigar Michel Foucault</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/anarquismo/necromicon-ilustrado.pdf'/>Necromicon Ilustrado</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/anarquismo/el-necromicon-libro-de-hechizos.pdf'/>El Necromicon Libro de Hechizos</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/celes/Numeros-que-Curan-Gregori-Grabovoi.pdf'/>Numeros que Curan Gregori Grabovoi</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/literatura/quemando-cromo-william-gibson.pdf'/>Quemando Cromo William Gibson</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/06-09-2022/literatura/politica-en-el-infierno-Dante-Alighieri-interpretacion-de-la-commedia.pdf'>
                    Política en el Infierno : Dante Alighieri y el develamiento de una interpretación de la Commedia
                </a><br />
            
               
                <br />


                <b>PDF Vida Artificial</b><br /><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Automatas%20Celulares%20generacion%20de%20Bits.pdf">Automatas Celulares generacion de Bits</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Automatas%20Celulares%20y%20Computacion.pdf">Automatas Celulares y Computacion</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Descripcion%20y%20Aplicacion%20Automatas%20Celulares.pdf">Descripcion y Aplicacion Automatas Celulares</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/El%20nuevo%20paradigma%20filosofico%20de%20la%20IA.pdf">El nuevo paradigma filosofico de la IA</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Geometria%20Fractal.pdf">Geometria Fractal</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Inteligencia%20Artificial%20El%20Futuro%20del%20Crecimiento.pdf">Inteligencia Artificial  El Futuro del Crecimiento</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Inteligencia%20Artificial%20Juegos.pdf">Inteligencia Artificial  Juegos</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Jugando%20a%20ser%20Dios%20Experimentos%20en%20Vida%20Artificial.pdf">Jugando a ser Dios Experimentos en Vida Artificial</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/La%20Vida%20Artificial%20Stefan%20Helmreich.pdf">La Vida Artificial Stefan Helmreich</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Sistemas%20Cognitivos%20Artificiales.pdf">Sistemas  Cognitivos Artificiales</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Sistemas%20Complejos%20Caos%20y%20Vida%20Artificial.pdf">Sistemas Complejos Caos y Vida Artificial</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Vida%20Artificial%20Biocomputaci%c3%b3n%20y%20Nanotecnologia.pdf">Vida Artificial Biocomputacion y Nanotecnologia</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Vida%20Artificial%20Jose%20Santos.pdf">Vida Artificial Jose Santos</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Vida%20Artificial%20Luis%20Carlos%20Ospina%20Romero.pdf">Vida Artificial Luis Carlos Ospina Romero</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Vida%20Artificial%20el%20Nuevo%20Paradigma.pdf">Vida Artificial el Nuevo Paradigma</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/Virus%20Informaticos%20Y%20Vida%20Artificial.pdf">Virus Informaticos Y Vida Artificial</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/artificial/automatas%20celulares%20y%20aplicaciones.pdf">Automatas Celulares y Aplicaciones</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/mili/defensa-militar-y-inteligencia-artificial.pdf">Defensa y Inteligencia Artificial</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/mili/robotica-e-inteligencia-artificial.pdf">Robótica e Inteligencia Artificial</a><br />

                <br />


                <b>PDF Hacking</b><br /><br />


                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/cy2/hacking-pruebas-de-penetracion-avanzada.pdf">Hacking Pruebas de Penetración Avanzada</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/cy2/metodologias-ing-social.pdf">Metodologías Ingeniería Social</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/21-12-2021/el-libro-blanco-del-hacker.pdf">El Libro Blanco del Hacker</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/cy3/el-libro-negro-del-programador.pdf">El Libro Negro del Programador</a><br />

                <br />


                <b>PDF Redes Neuronales</b><br /><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/ciencias_matematicas_redes_neuronales.pdf">Ciencias Matemáticas y Redes Neuronales</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/aprendizaje_de_sistemas_redes_neuronales.pdf">Redes Neuronales y Aprendizaje de Sistemas</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/redes_neuronales_basicas.pdf">Redes Neuronales Basicas</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/redes_neuronales_resumen.pdf">Resumen Redes Neuronales</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/redes_neuronales_retropropagacion.pdf">Redes Neuronales Retropropagación</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/redes_neuronales_y_finanzas.pdf">Redes Neuronales y Finanzas</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/redes_neuronales_y_programacion_lineal.pdf">Redes Neuronales y Programación Lineal</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/redes/redes_neurunales_y_aplicaciones.pdf">Redes Neuronales y Aplicaciones</a><br />

                <br />

                <b>PDF Desarrollo de Video Juegos</b><br />

                <br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/cy2/diseño-de-video-juegos.pdf">Diseño de Vídeo Juegos</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/interes/MMORPG_conceptos.pdf'/>MMORPG conceptos</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/arte_y_videojuegos.pdf">Arte y VideoJuegos</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/arte_y_videojuegos_cyberpunk.pdf">Arte y VideoJuegos Cyberpunk</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/contenidos_digitales_sociedad_conectada.pdf">Contenidos Digitales en la Sociedad Conectada</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/El_pixel_hace_la_fuerza_Narrativa_y_video_juegos.pdf">El Pixel hace la Fuerza Narrativa y VideoJuegos</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/El-videojuego-como-laboratorio.pdf">El VideoJuego como Laboratorio</a><br />


                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/HUMANIDADES_DIGITALES_Y_VIDEOJUEGOS.pdf">Humanidades Digitales y VideoJuegos</a><br />

                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/jugadores_y_cibernarrativas.pdf">Jugadores y Cibernarrativas</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/Ruta_epistemica_en_la_teoria_del_videojuego.pdf">Ruta Epistémica en la teoría del VideoJuego</a><br />
                <b> > </b><a target='_blank'   href="https://underpost.net/ir/pdf/videojuegos/teoria_practica_diseno_conceptual_videojuegos.pdf
                ">Diseño Conceptual de VideoJuegos</a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/videojuegos/factor-emocional-videojuegos-belicos.pdf'/>
                Factor Emocional en los Videojuegos Belicos
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/videojuegos/gamificacion-y-diseno-videojuegos.pdf'/>
                Gamificacion y diseno Videojuegos
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/11-09-21/videojuegos/videojuegos-y-ingenieria-social.pdf'/>
                videojuegos y Ingenieria Social
                </a><br />

                <b> > </b><a target='_blank'   href='https://underpost.net/ir/pdf/02-11-2021/videojuegos_y_cultura_visual.pdf'>
                Video Juegos y Cultura Visual
                </a><br />

                <br />

                <b>Documentación Desarrollo Web</b><br /><br />

                General:<br /><br />

                <b> > Oficial&nbsp;</b><a target='_blank'   href='https://www.w3schools.com/'/>w3schools.com</a><br />

                <b> > Guías&nbsp;</b><a target='_blank'   href='https://desarrolloweb.com/'/>desarrolloweb.com</a><br />

                <b> > Guías&nbsp;</b><a target='_blank'   href='https://www.geeksforgeeks.org/'/>geeksforgeeks.org</a><br />

                <b> > Guías&nbsp;</b><a target='_blank'   href='https://web.dev/'/>web.dev</a><br />

                <b> > Consultas&nbsp;</b><a target='_blank'   href='https://stackoverflow.com/'/>stackoverflow.com</a><br />

                <b> > Patrones de Diseño&nbsp;</b><a target='_blank'   href="https://refactoring.guru/">refactoring.guru</a><br />

                <b> > Utilidades&nbsp;</b><a target='_blank'   href="https://tutorialspoint.com/">tutorialspoint.com</a><br />

                <b> > Utilidades&nbsp;</b><a target='_blank'   href='https://manytools.org/'/>manytools.org</a><br />

                <br />Backend: Lenguajes<br /><br />

                <b> > PHP&nbsp;</b><a target='_blank'   href='https://www.php.net/manual/es/index.php'/>php.net</a><br />

                <b> > NodeJs&nbsp;</b><a target='_blank'   href='https://nodejs.org/es/'/>nodejs.org</a><br />

                <b> > TypeScript&nbsp;</b><a target='_blank'   href='https://www.typescriptlang.org/'/>typescriptlang.org</a><br />

                <b> > Python&nbsp;</b><a target='_blank'   href='https://www.python.org/'/>python.org</a><br />

                <b> > R&nbsp;</b><a target='_blank'   href='https://www.r-project.org/'/>r-project.org</a><br />

                <b> > Scheme&nbsp;</b><a target='_blank'   href='https://groups.csail.mit.edu/mac/projects/scheme/'/>groups.csail.mit.edu</a><br />

                <br />Backend: Bases de Datos<br /><br />

                <b> > SQL&nbsp;</b><a target='_blank'   href='https://mariadb.org/'/>mariadb.org</a><br />

                <b> > SQL&nbsp;</b><a target='_blank'   href='https://www.mysql.com/'/>mysql.com</a><br />

                <br />Backend: Framework<br /><br />

                <b> > PHP Apache&nbsp;</b><a target='_blank'   href='https://www.apachefriends.org/es/add-ons.html'/>apachefriends.org</a><br />

                <b> > PHP Ratchet&nbsp;</b><a target='_blank'   href='http://socketo.me/'/>socketo.me</a><br />

                <b> > NodeJS Express&nbsp;</b><a target='_blank'   href='https://expressjs.com/es/api.html'/>expressjs.com</a><br />

                <b> > NodeJS socket.io&nbsp;</b><a target='_blank'   href='https://socket.io/'/>socket.io</a><br />

                <b> > Scheme Racket&nbsp;</b><a target='_blank'   href='https://docs.racket-lang.org/'/>docs.racket-lang.org</a><br />

                <br />Backend: Gestor de Paquetes<br /><br />

                <b> > PHP&nbsp;</b><a target='_blank'   href='https://getcomposer.org/'/>getcomposer.org</a><br />

                <b> > NodeJS&nbsp;</b><a target='_blank'   href='https://www.npmjs.com/'/>npmjs.com</a><br />

                <b> > Python&nbsp;</b><a target='_blank'   href='https://pypi.org/'/>pypi.org</a><br />

                <b> > R&nbsp;</b><a target='_blank'   href='https://cran.r-project.org/'/>cran.r-project.org</a><br />

                <b> > Scheme&nbsp;</b><a target='_blank'   href='https://pkgs.racket-lang.org/'/>pkgs.racket-lang.org</a><br />

                <br />Frontend: Librerias<br /><br />

                <b> > JavaScript&nbsp;</b><a target='_blank'   href='http://vanilla-js.com/'/>vanilla-js.com</a><br />

                <b> > jQuery&nbsp;</b><a target='_blank'   href='https://api.jquery.com/'/>api.jquery.com</a><br />

                <b> > Canvas&nbsp;</b><a target='_blank'   href='https://konvajs.org/'/>konva.js</a><br />

                <br />Frontend: Framework<br /><br />

                <b> > Svelte&nbsp;</b><a target='_blank'   href='https://svelte.dev/'/>svelte.dev</a><br />

                <br /><br /><br /><br /><br />
        </div>

                <br />
                <img class='in' style="width: 280px; height: auto; margin: auto;" src="https://underpost.net/img/gbe.png" /><br /><br /><br /><br /><br />
                <br />
                <br /><br />

                        
        
        </div>
        
        `;

        if (getQueryParams().type == 'blog') return '';
        return initRenderCC;
    }
};