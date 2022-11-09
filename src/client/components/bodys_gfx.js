this.bodys_gfx = {
    init: function () {



        const zIndexBase = 100;

        const ARMS = constructor => {

            if (!constructor) constructor = {
                id: `x${s4()}`
            };

            let armRotateR = true;
            let armRotateL = true;
            const getDegLeg = type => {
                if (type != 'r') {
                    if (armRotateR) {
                        armRotateR = false;
                        return 45;
                    }
                    armRotateR = true;
                    return -25;
                } else {
                    if (armRotateL) {
                        armRotateL = false;
                        return -25;
                    }
                    armRotateL = true;
                    return 45;
                }
            };

            setInterval(() => {


                htmls(`.${constructor.id}-arm-r-animation`, /*css*/`
                    .${constructor.id}-arm-r {
                        transform: rotate(${getDegLeg('r')}deg);
                    }
                `);
                htmls(`.${constructor.id}-arm-l-animation`, /*css*/`
                    .${constructor.id}-arm-l {
                        transform: rotate(${getDegLeg('l')}deg);
                    }
                `);


            }, 500);

            return /*html*/`
            <arms-${constructor.id}>
                <style>
                    .${constructor.id}-arm-r, .${constructor.id}-arm-l {
                           background: yellow;
                           width: 10%;
                           height: 30%;
                           border-radius: 40%;
                           transition: .3s;
                           top: 30%;                
                           left: 45%;
                       }
                       .${constructor.id}-arm-l {
                           transform-origin: top left;
                           z-index: ${zIndexBase};
                       }
                       .${constructor.id}-arm-r {
                           transform-origin: top right;
                           z-index: ${zIndexBase + 2};
                       }
                   </style>
                   <style class='${constructor.id}-arm-r-animation'>
                       .${constructor.id}-arm-r {
                           transform: rotate(0deg);
                       }
                   </style>
                   <style class='${constructor.id}-arm-l-animation'> 
                       .${constructor.id}-arm-l {
                           transform: rotate(0deg);
                       }
                   </style>
           
                    <div class='abs ${constructor.id}-arm-r'></div>
                    <div class='abs ${constructor.id}-arm-l'></div>
            </arms-${constructor.id}> 
            
            `
        };

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
                    return -25;
                } else {
                    if (legRotateL) {
                        legRotateL = false;
                        return -25;
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
            <legs-${constructor.id}>
                <style>
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
                           z-index: ${zIndexBase};
                       }
                       .${constructor.id}-leg-r {
                           transform-origin: top right;
                           z-index: ${zIndexBase + 2};
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

        const BODY = constructor => {


            if (!constructor) constructor = {
                id: `x${s4()}`
            };




            return /*html*/`
            
            
            <body-${constructor.id}>

                <style>
                    .body-${constructor.id}  {
                        width: 20%;
                        height: 45%;
                        background: ${randomColor()};
                        border-radius: 45%;
                        z-index: ${zIndexBase + 1};
                        top: 48%;
                    }
                </style>
                <div class='abs center body-${constructor.id}'>

                </div>
            </body-${constructor.id}> 
            
            `

        };

        const HEAD = constructor => {


            if (!constructor) constructor = {
                id: `x${s4()}`
            };




            return /*html*/`
            
            
            <head-${constructor.id}>
        
                <style>
                    .head-${constructor.id}  {
                        width: 25%;
                        height: 25%;
                        background: ${randomColor()};
                        border-radius: 45%;
                        z-index: ${zIndexBase + 2};
                        top: 20%;
                    }
                </style>
                <div class='abs center head-${constructor.id}'>
        
                </div>
            </head-${constructor.id}> 
            
            `

        };


        const AVATAR = constructor => {









            return /*html*/`
            
            <avatar-${constructor.id} class='abs' style='
            top: ${constructor.top};
            left: ${constructor.left};
            '>
                <style>
                    avatar-${constructor.id} {
                        width: ${constructor.width}px;
                        height: ${constructor.height}px;
                        background: ${constructor.background};
                        margin: ${constructor.margin}px;
                    }
                </style>
                ${HEAD()}
                ${LEGS()}
                ${BODY()}
                ${ARMS()}
            </avatar-${constructor.id}> 
        `;


        };



        const maxIds = 4;
        const velMov = 3;
        const movAvatar = (id, diffValue) =>
            s(id).style.left =
            `${(parseFloat(s(id).style.left.slice(0, -1)) + diffValue)}%`;

        const keyLeft = startListenKey({
            key: 'ArrowLeft',
            vel: velMov,
            onKey: () => {
                range(0, maxIds).map(x => {
                    movAvatar(`avatar-${x}`, -0.4);
                });
            }
        });

        const keyRight = startListenKey({
            key: 'ArrowRight',
            vel: velMov,
            onKey: () => {
                range(0, maxIds).map(x => {
                    movAvatar(`avatar-${x}`, 0.4);
                });
            }
        });



        return /*html*/`
        

       <style>
         .matrix {
            min-height: 400px;
            overflow: hidden;
         } 
       </style>
       <div class='in container matrix'>
            ${range(0, maxIds).map(x => AVATAR({
            id: `${x}`,
            width: 100,
            height: 100,
            background: randomColor(),
            margin: 5,
            top: `10px`,
            left: `${random(10, 100)}%`
        })).join('')}
       </div>
        
        `
    }
};