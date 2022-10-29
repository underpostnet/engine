

this.test = {

    init: function () {





        const idAvatar = `avatar-${s4()}`;

        let legRotateR = true;
        let legRotateL = true;
        const getDegLeg = type => {
            if (type == 'r') {
                if (legRotateR) {
                    legRotateR = false;
                    return 45;
                }
                legRotateR = true;
                return 0;
            } else {
                if (legRotateL) {
                    legRotateL = false;
                    return 0;
                }
                legRotateL = true;
                return 45;
            }
        };
        setInterval(() => {


            htmls(`.${idAvatar}-leg-r-animation`, /*css*/`
                .${idAvatar}-leg-r {
                    transform: rotate(${getDegLeg('r')}deg);
                }
            `);
            htmls(`.${idAvatar}-leg-l-animation`, /*css*/`
                .${idAvatar}-leg-l {
                    transform: rotate(${getDegLeg('l')}deg);
                }
            `);


        }, 500);

        return /*html*/`
        <style>
            .${idAvatar}-content {
                width: 150px;
                height: 200px;
                background: gray;
                margin: 5px;
            }
            .${idAvatar}-leg-r, .${idAvatar}-leg-l {
                background: yellow;
                width: 10%;
                height: 30%;
                border-radius: 40%;
                transition: .3s;
                top: 60%;                
                left: 45%;
            }
            .${idAvatar}-leg-l {
                transform-origin: top left;
            }
            .${idAvatar}-leg-r {
                transform-origin: top right;
            }
        </style>
        <style class='${idAvatar}-leg-r-animation'>
            .${idAvatar}-leg-r {
                transform: rotate(0deg);
            }
        </style>
        <style class='${idAvatar}-leg-l-animation'> 
            .${idAvatar}-leg-l {
                transform: rotate(0deg);
            }
        </style>


        <div class='in container'>


                 <div class='in ${idAvatar}-content'>
                            <div class='abs ${idAvatar}-leg-r'></div>
                            <div class='abs ${idAvatar}-leg-l'></div>
                 </div>


        </div>
        
        `
    }

};