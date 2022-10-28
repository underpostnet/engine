

this.test = {

    init: function () {





        const idAvatar = `avatar-${s4()}`;

        setInterval(() => {


            htmls(`.${idAvatar}-leg-r-animation`, /*css*/`
                .${idAvatar}-leg-r {
                    left: 60%;
                    transform: rotate(${random(-90, 90)}deg);
                }
            `);
            htmls(`.${idAvatar}-leg-l-animation`, /*css*/`
                .${idAvatar}-leg-l {
                    left: 40%;
                    transform: rotate(${random(-90, 90)}deg);
                }
            `);


        }, 1000);

        return /*html*/`
        <style>
            .${idAvatar}-content {
                width: 300px;
                height: 600px;
                border: 2px solid white;
                margin: 5px;
            }
            .${idAvatar}-leg-r, .${idAvatar}-leg-l {
                background: yellow;
                width: 10%;
                height: 30%;
                border-radius: 40%;
                transition: .3s;
                top: 60%;
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
                left: 60%;
                transform: rotate(0deg);
            }
        </style>
        <style class='${idAvatar}-leg-l-animation'> 
            .${idAvatar}-leg-l {
                left: 40%;
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