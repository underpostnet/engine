
this.clasic_card_game = {
    originData: [
        {
            "value": "2",
            "type": "Spade",
            "face": false
        },
        {
            "value": "3",
            "type": "Spade",
            "face": false
        },
        {
            "value": "4",
            "type": "Spade",
            "face": false
        },
        {
            "value": "5",
            "type": "Spade",
            "face": false
        },
        {
            "value": "6",
            "type": "Spade",
            "face": false
        },
        {
            "value": "7",
            "type": "Spade",
            "face": false
        },
        {
            "value": "8",
            "type": "Spade",
            "face": false
        },
        {
            "value": "9",
            "type": "Spade",
            "face": false
        },
        {
            "value": "10",
            "type": "Spade",
            "face": false
        },
        {
            "value": "J",
            "type": "Spade",
            "face": true
        },
        {
            "value": "Q",
            "type": "Spade",
            "face": true
        },
        {
            "value": "K",
            "type": "Spade",
            "face": true
        },
        {
            "value": "A",
            "type": "Spade",
            "face": true
        },
        {
            "value": "2",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "3",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "4",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "5",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "6",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "7",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "8",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "9",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "10",
            "type": "Diamond",
            "face": false
        },
        {
            "value": "J",
            "type": "Diamond",
            "face": true
        },
        {
            "value": "Q",
            "type": "Diamond",
            "face": true
        },
        {
            "value": "K",
            "type": "Diamond",
            "face": true
        },
        {
            "value": "A",
            "type": "Diamond",
            "face": true
        },
        {
            "value": "2",
            "type": "Club",
            "face": false
        },
        {
            "value": "3",
            "type": "Club",
            "face": false
        },
        {
            "value": "4",
            "type": "Club",
            "face": false
        },
        {
            "value": "5",
            "type": "Club",
            "face": false
        },
        {
            "value": "6",
            "type": "Club",
            "face": false
        },
        {
            "value": "7",
            "type": "Club",
            "face": false
        },
        {
            "value": "8",
            "type": "Club",
            "face": false
        },
        {
            "value": "9",
            "type": "Club",
            "face": false
        },
        {
            "value": "10",
            "type": "Club",
            "face": false
        },
        {
            "value": "J",
            "type": "Club",
            "face": true
        },
        {
            "value": "Q",
            "type": "Club",
            "face": true
        },
        {
            "value": "K",
            "type": "Club",
            "face": true
        },
        {
            "value": "A",
            "type": "Club",
            "face": true
        },
        {
            "value": "2",
            "type": "Heart",
            "face": false
        },
        {
            "value": "3",
            "type": "Heart",
            "face": false
        },
        {
            "value": "4",
            "type": "Heart",
            "face": false
        },
        {
            "value": "5",
            "type": "Heart",
            "face": false
        },
        {
            "value": "6",
            "type": "Heart",
            "face": false
        },
        {
            "value": "7",
            "type": "Heart",
            "face": false
        },
        {
            "value": "8",
            "type": "Heart",
            "face": false
        },
        {
            "value": "9",
            "type": "Heart",
            "face": false
        },
        {
            "value": "10",
            "type": "Heart",
            "face": false
        },
        {
            "value": "J",
            "type": "Heart",
            "face": true
        },
        {
            "value": "Q",
            "type": "Heart",
            "face": true
        },
        {
            "value": "K",
            "type": "Heart",
            "face": true
        },
        {
            "value": "A",
            "type": "Heart",
            "face": true
        }
    ],
    currentColor: 'yellow',
    currentOrder: [],
    shuffleCards: function () {
        this.currentColor = randomColor();
        return reOrderIntArray(range(0, this.originData.length - 1));
    },
    init: function () {
        console.log('this.originData.length', this.originData.length);
        console.log('this.shuffleCards', this.shuffleCards());
        return /*html*/`
        <style>
            .card-content {
                width: 200px;
                text-align: center;
                padding: 5px;
                margin: 5px;
                border: 2px solid ${this.currentColor};
                color: ${this.currentColor};
                font-size: 20px;
            }
        </style>
        
        <div class='in container'>
                ${this.shuffleCards().map(x => {

            return /*html*/`
                        <div class='inl card-content'>
                                <br><br>
                                ${this.originData[x].value} ${this.originData[x].type}
                                <br><br>
                                ${this.originData[x].face ? '&' : '#'}
                                <br><br>
                                ${this.originData[x].value} ${this.originData[x].type}
                                <br><br>
                        </div>
                    
                    `
        }).join('')}
        </div>
        
        `
    }
};