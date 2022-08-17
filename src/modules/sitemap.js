import fs from 'fs';

import { buildURL } from '../api/util.js';

const buildLocSitemap = (view, viewMetaData) => `
    <url>
          <loc>${buildURL(viewMetaData)}${view.path}</loc>
          <lastmod>${new Date().toISOString()}</lastmod>
          <changefreq>daily</changefreq>
          <priority>1</priority>
    </url>
`;

const renderSitemap = (app, sitemap, viewMetaData) => {

    const uri = `/${viewMetaData.clientID}/sitemap.xml`;

    let baseSitemap = fs.readFileSync(
        './underpost_modules/underpost-library/xml/sitemap.xml', 'utf-8')
        .split('</urlset>');
    sitemap = baseSitemap[0].replace(
        '{sitemap-xsl-url}',
        buildURL(viewMetaData) + uri.replace('xml', 'xsl')) + sitemap + '</urlset>';

    const xmlStyleData = fs.readFileSync(
        './underpost_modules/underpost-library/xml/sitemap.xsl', 'utf-8'
    ).replace('https://www.nexodev.org/api/sitemap', buildURL(viewMetaData) + '/xml');

    app.get(uri.replace('xml', 'xsl'), (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/vnd.ms-excel; charset=' + 'utf-8')
        });
        return res.end(xmlStyleData);
    });

    app.get(uri, (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/xml; charset=' + 'utf-8')
        });
        return res.end(sitemap);
    });
}

export { buildLocSitemap, renderSitemap };