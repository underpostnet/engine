
const id = 'x' + s4()
const maxPadding = 30

append('body', `
<div class='in container' style='padding: ${maxPadding}px'>
    <${id} style='padding: ${maxPadding / 2}px; transition: .18s'></${id}>
</div>`)

const demo = () => setTimeout(() =>
(
    s(id).style.background = randomColor(),
    s(id).style.padding = random(0, maxPadding) + 'px',
    htmls(id, demo())
),
    200
)

demo()