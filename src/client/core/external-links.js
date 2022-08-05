
// render external links

setTimeout(() =>
    viewMetaData.externalRouter.map(externaLinkData =>
        append(externaLinkData.type, /*html*/`
            <button onclick='location.href="${externaLinkData.link}"' >
                ${renderLang(externaLinkData.name)}
            </button>`
        )
    )
);