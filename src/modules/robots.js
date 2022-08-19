
import robotstxt from 'generate-robotstxt';
import dotenv from 'dotenv';
import { baseStaticClient, buildURL } from '../api/util.js';
import { logger } from './logger.js';

dotenv.config();

const renderRobots = (app, viewMetaData) =>
    new Promise((resolve, reject) => {

        const BSC = baseStaticClient(viewMetaData);

        robotstxt({
            policy: [
                // {
                //     userAgent: "Googlebot",
                //     allow: "/",
                //     disallow: "/search",
                //     crawlDelay: 2,
                // },
                // {
                //     userAgent: "OtherBot",
                //     allow: ["/allow-for-all-bots", "/allow-only-for-other-bot"],
                //     disallow: ["/admin", "/login"],
                //     crawlDelay: 2,
                // },
                // {
                //     userAgent: "*",
                //     allow: "/",
                //     disallow: "/search",
                //     crawlDelay: 10,
                //     cleanParam: "ref /articles/",
                // },
            ],
            sitemap: `${buildURL(viewMetaData)}${BSC}/sitemap.xml`,
            host: `${buildURL(viewMetaData)}${BSC}`,
        })
            .then((content) => {
                app.get(`/${viewMetaData.clientID}/robots.txt`, (req, res) => {
                    res.writeHead(200, {
                        'Content-Type': ('text/plain; charset=utf-8')
                    });
                    return res.end(content);
                });
                return resolve();
            })
            .catch((error) => {
                logger.error(error);
                return reject(error);
            });

    });

export {
    renderRobots
}