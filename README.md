### underpost.net meta engine

Software development kit (SDK) and engine for developing web client graphical user interface and APIs.

Modular and stand-alone components client architecture.

#### Install

Run terminal with administrator privileges.

- `npm install -g npm@latest`

- `npm install -g ipfs`

- `npm install`

- `node underpost`

- unit test `npm install -g mocha`

#### Usage

- run gui/api dev server `npm run dev`

- run gui/api prod server `npm start`

- generate www dev client build `npm run build-dev <optional-single-client-id-module>`

- generate www prod client build `npm run build-prod <optional-single-client-id-module>`

- run network CLI `node src/cli`

- run unit test `mocha`

#### Docker Usage

- build dev docker image `docker build . -t underpost-engine`

- create volume `docker volume create underpost-engine-vol` and `docker volume create underpost-engine-vol0`

- run dev image `docker run --name live-underpost-engine -p 41061:22 -p 41062:80 -p 41063:5500 -p 41064:5501 -d -v underpost-engine-vol:/www -v underpost-engine-vol0:/data underpost-engine` (-v :/opt/lampp/htdocs :/usr/src/app/data)

- ssh connection (default SSH password is 'root') `ssh root@localhost -p 41061`, verify /.ssh/known_hosts

- get a shell terminal inside your container `docker exec -ti live-underpost-engine bash`

#### K8s Usage

- create cluster `kind create cluster` or `kind create cluster --config=.\k8s.yaml`

- view clusters `kind get clusters` or `kubectl get all`

- load docker image `kind load docker-image underpost-engine:latest`

- get docker-images that are loaded `docker exec -it kind-control-plane crictl images`

- run pod `kubectl apply -f pod.yaml`

- status pod `kubectl describe pod underpost-engine` or `kubectl get pod underpost-engine`

- view logs `kubectl logs underpost-engine`

- get a shell terminal inside k8s container `kubectl exec --stdin --tty underpost-engine -- /bin/bash`

#### k8s Contour Ingress Usage

- create cluster `kind create cluster --config=.\k8s.yaml`

- Deploy Contour components `kubectl apply -f https://projectcontour.io/quickstart/contour.yaml`

- Verify the Contour pods are ready by running the following `kubectl get pods -n projectcontour -o wide` or `kubectl get po,svc,deploy,daemonset -n projectcontour`

- Verify services `kubectl -n projectcontour describe svc envoy` and `kubectl -n projectcontour describe svc contour`

#### Features

- jwt auth

- Ajv JSON schema validator

- asymmetric keys management

- session management

- markdown editor

- wysiwyg editor

- javascript live demo

- socket.io/peer audio-video media stream (WebRTC)

- IPFS integration

- cloud folder/files management

- audio player

- youtube mp3 downloader

- youtube api integration (video management and player)

- CLI for keys management, wallet, and blockchain miner

- Debian/nodejs/xampp runtime environment docker image

#### Current productions projects

- [dogmadual.com](https://www.dogmadual.com)

- [underpost.net](https://underpost.net)

- [cryptokoyn.net](https://www.cryptokoyn.net)

- [nexodev.org](https://www.nexodev.org)
