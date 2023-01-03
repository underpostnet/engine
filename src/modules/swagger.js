

import * as swaggerUi from 'swagger-ui-express';

const swaggerMod = (app) => {
    const _swaggerDocument = {
        "swagger": "2.0",
        "info": {
            "title": "Blah",
            "description": "",
            "version": "1.0"
        },
        "produces": ["application/json"],
        "paths": {
            "/test": {
                "post": {
                    "x-swagger-router-controller": "home",
                    "operationId": "index",
                    "tags": ["/test"],
                    "description": "[Login 123](https://www.google.com)",
                    "parameters": [{
                        "name": "test",
                        "in": "formData",
                        "type": "array",
                        "collectionFormat": "multi",
                        "items": {
                            "type": "integer"
                        }
                    },
                    { "name": "profileId", "in": "formData", "required": true, "type": "string" },
                    { "name": "file", "in": "formData", "type": "file", "required": "true" }],
                    "responses": {}
                }
            },
            "/bar": {
                "get": {
                    "x-swagger-router-controller": "bar",
                    "operationId": "impossible",
                    "tags": ["/test"],
                    "description": "",
                    "parameters": [],
                    "responses": {}
                }
            }
        }
    };

    const uniquePaths = [];
    const formatRoutes = app._router.stack
        .map((v, i, a) => {
            if (v.route && v.route.path && !uniquePaths.includes(v.route.path)) {
                uniquePaths.push(v.route.path);
            }
            const dataRoute = {
                index: i,
                path: v.route ? v.route.path : undefined,
                methods: v.route ? Object.keys(v.route.methods).join('|') : undefined
            };
            if (dataRoute.path) return dataRoute;
            return null;
        }).filter(x => x != null);

    const paths = {};

    uniquePaths.map(uniquePath => {
        paths[uniquePath] = {};
        formatRoutes.map(x => {
            if (x.path == uniquePath) {
                paths[uniquePath][x.methods] = {
                    description: `Path index: ${x.index}`
                }
            }
        });
    });
    // console.log('paths', paths);

    const swaggerDocument = {
        "swagger": "2.0",
        "info": {
            "title": "underpost.net engine",
            "description": "underpost.net api docs",
            "version": "1.0.3"
        },
        "produces": ["application/json"],
        paths
    };

    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

};

export { swaggerMod };