

this.femmenutrition_landing = {
    init: function () {


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
        
        `
    }
};