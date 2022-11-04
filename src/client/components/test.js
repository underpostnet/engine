

this.test = {

    init: function () {

        const LEGS = constructor => {

            if (!constructor) constructor = {
                id: `x${s4()}`
            };

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


                htmls(`.${constructor.id}-leg-r-animation`, /*css*/`
                    .${constructor.id}-leg-r {
                        transform: rotate(${getDegLeg('r')}deg);
                    }
                `);
                htmls(`.${constructor.id}-leg-l-animation`, /*css*/`
                    .${constructor.id}-leg-l {
                        transform: rotate(${getDegLeg('l')}deg);
                    }
                `);


            }, 500);

            return /*html*/`
            <legs-${constructor.id} class='abs'>
                <style>
                    legs-${constructor.id} {
                        width: 100%;
                        height: 100%;
                        top: 0%;
                        left: 0%;
                    }
                    .${constructor.id}-leg-r, .${constructor.id}-leg-l {
                           background: yellow;
                           width: 10%;
                           height: 30%;
                           border-radius: 40%;
                           transition: .3s;
                           top: 60%;                
                           left: 45%;
                       }
                       .${constructor.id}-leg-l {
                           transform-origin: top left;
                       }
                       .${constructor.id}-leg-r {
                           transform-origin: top right;
                       }
                   </style>
                   <style class='${constructor.id}-leg-r-animation'>
                       .${constructor.id}-leg-r {
                           transform: rotate(0deg);
                       }
                   </style>
                   <style class='${constructor.id}-leg-l-animation'> 
                       .${constructor.id}-leg-l {
                           transform: rotate(0deg);
                       }
                   </style>
           
                    <div class='abs ${constructor.id}-leg-r'></div>
                    <div class='abs ${constructor.id}-leg-l'></div>
            </legs-${constructor.id}> 
            
            `
        };
        const AVATAR = constructor => {









            return /*html*/`
            
            <avatar-${constructor.id} class='abs'>
                <style>
                    avatar-${constructor.id} {
                        width: ${constructor.width}px;
                        height: ${constructor.height}px;
                        background: ${constructor.background};
                        margin: ${constructor.margin}px;
                        top: ${constructor.top};
                        left: ${constructor.left};
                    }
                </style>
                ${LEGS()}
            </avatar-${constructor.id}> 
        `;


        };




        return /*html*/`
        

       <style>
         .matrix {
            min-height: 400px;
         } 
       </style>
       <div class='in container matrix'>
            ${range(0, 9).map(x => AVATAR({
            id: `x${s4()}`,
            width: random(10, 200),
            height: random(10, 200),
            background: randomColor(),
            margin: 5,
            top: `${random(10, 200)}px`,
            left: `${random(10, 200)}px`
        })).join('')}
       </div>
        
        `
    }

};