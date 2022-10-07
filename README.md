### underpost.net meta engine

Software development kit (SDK) and engine for developing web client graphical user interface and APIs.

Modular and stand-alone components client architecture.

#### Install

- `npm install`

- `node underpost`

- unit test `npm install --global mocha`

#### Usage

- run gui/api dev server `npm run dev`

- run gui/api prod server `npm start`

- generate www dev client build `npm run build-dev <optional-single-client-id-module>`

- generate www prod client build `npm run build-prod <optional-single-client-id-module>`

- run network CLI `node src/cli`

- run unit test `mocha`

#### Docker Usage

build dev docker image `docker build . -t <your username>/underpost-engine`

run dev image `docker run --name live-underpost-engine -p 41061:22 -p 41062:5500 -p 41063:5501 -d -v ~/vol:/usr/src/app underpost-engine`

ssh connection (default SSH password is 'root') `ssh root@localhost -p 41061`

get a shell terminal inside your container `docker exec -ti live-underpost-engine bash`

#### Features

- jwt auth

- asymmetric keys management

- session management

- markdown editor

- wysiwyg editor

- javascript live demo

- socket.io/peer audio-video media stream (WebRTC)

- cloud folder/files management

- audio player

- youtube mp3 downloader

- youtube api integration (video management and player)

- CLI for keys management, wallet, and blockchain miner

#### Current productions projects

- [dogmadual.com](https://www.dogmadual.com)

- [underpost.net](https://underpost.net)

- [cryptokoyn.net](https://www.cryptokoyn.net)

- [nexodev.org](https://www.nexodev.org)
