

this.femmenutrition_landing = {
    render3Blocks: dataBlocks => /*html*/`
    <div class='in fll cell-l2-a' style='${rrb()}'>

        <div class='in' style='height: 70px; ${rrb()}'>
            <div class='abs center' 
            style='
            font-size: 20px;
            font-weight: bold;'
            >${dataBlocks.title}</div>
        </div>
        
        <div class='in' style='height: 80px; ${rrb()}'>
            <img class='abs center' src='${dataBlocks.img}' style='width: 15%; max-width: 60px;'>
        </div>

        <div class='in' style='height: 100px; ${rrb()}'>
            <div class='abs center'
            style='font-size: 20px'
            >${dataBlocks.desc}</div>
        </div>

    </div>
    `,
    init: function () {


        const L2_DATA = [
            {
                title: 'Alta Calidad Nutricional',
                img: '/assets/apps/femmenutrition/l2-icons/tarjeta.png',
                desc: 'Productos formulados en base a estándares dietéticos'
            },
            {
                title: 'Formulado por Expertas ',
                img: '/assets/apps/femmenutrition/l2-icons/mujer.png',
                desc: 'Liderado por un equipo de mujeres profesionales y especialistas '
            },
            {
                title: 'Adecuado 100% para Nosotras',
                img: '/assets/apps/femmenutrition/l2-icons/lab.png',
                desc: 'Planificados para cubrir las necesidades nutricionales femeninas'
            }
        ];


        return /*html*/`
        <style>
        .img-l1 {
            width: 80%;
            margin: auto;
        }
        .btn-l1 {
            background: #FFD573;
            padding: 20px;
            border-radius: 20px;
            cursor: pointer;
        }
        </style>
        ${renderMediaQuery([
            {
                limit: 0,
                css: /*css*/`
                .cell-l1-a {
                    width: 100%;
                }
                .cell-l1-b {
                    width: 100%;
                }
                .cell-l2-a {
                    width: 100%;
                }
             `},
            {
                limit: mobileLimit,
                css: /*css*/`
                .cell-l1-a {
                    width: 60%;
                }
                .cell-l1-b {
                    width: 40%;
                }
                .cell-l2-a {
                    width: 33.3%;
                }
             `}
        ])}
        
            <div class='in container'>
                <div class='fl'>                
                        <div class='in fll cell-l1-a' style='${rrb()}'>
                                <div class='in' style='padding: 3% 15% 3% 15%; font-size: 30px'>
                                    NUTRICIÓN PARA <x${s4()} style='color: #FFD573'>NOSOTRAS</x${s4()}>
                                </div>
                                <div class='in' style='padding: 3% 15% 3% 15%;'>
                                        Suplementación nutricional femenina formulada especialmente para tí, 
                                        a manos de expertos en nutrición y actividad física.  
                                </div>
                                <div class='in' style='padding: 3% 15% 3% 15%;'>
                                        <div class='inl btn-l1'>
                                                ENCUENTRA TU SUPLEMENTO 
                                        </div>
                                </div>
                                <div class='in' style='padding: 3% 15% 3% 15%;'>
                                        <a href='javascript:null'>o contáctanos aquí </a> 
                                </div>
                        </div>
                        <div class='in fll cell-l1-b' style='${rrb()}'>
                                <img class='in img-l1' src='/assets/apps/femmenutrition/lp1.png'>
                        </div>
                </div>            
            </div>

            <div class='in container' style='background: #FFDEE1; color: #ed5c6b;'>
                <div class='fl'>
                    ${L2_DATA.map(x => this.render3Blocks(x)).join('')}
                </div>
            </div>
        
        `
    }
};