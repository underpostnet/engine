this.dogmadual_landing = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'dogmadual_landing-' + s4());
        return /*html*/`      
            <style></style> 
            <div class='in container'>
                dogmadual_landing
            </div>
        `
    }
};