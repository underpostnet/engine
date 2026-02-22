# Changelog

## 2026-02-22

### engine-core

- Add ENABLE_FILE_LOGS env ([8657e35f](https://github.com/underpostnet/engine/commit/8657e35f2dab6cf1507a9b3f9146df45ab07d0dd))

### docs

- Rename cli.md -> CLI-HELP.md ([18e18689](https://github.com/underpostnet/engine/commit/18e18689349227b2c8769eec9f4e1ebeb85b8cf0))
- Apply fix in swagger-autogen@2.9.2 bug: getResponsesTag missing __¬¬¬__ decode ([2b0d27db](https://github.com/underpostnet/engine/commit/2b0d27db38307d9276b14651083b0ac0c20ecaed))
- Remove unused jsdocs sections ([ec06f338](https://github.com/underpostnet/engine/commit/ec06f338cca5d656f46629b8957e3ded183ecff7))

### bin-zed

- Move zed settings file tod zed js bin module ([ba32abea](https://github.com/underpostnet/engine/commit/ba32abeaff4d198c79bcd92ab0fc0120bb41d9d5))

### client-core

- Fix clear filter user management ([a1d79661](https://github.com/underpostnet/engine/commit/a1d796612654f0e03a4d64ad16dfed403ad0a771))

### package

- Fix resolve npm minimatch ReDoS vulnerability ([4739fea1](https://github.com/underpostnet/engine/commit/4739fea18407b88e407f7b4be109f2ecc3a3435e))
- Apply npm audit fix ([9496c5c7](https://github.com/underpostnet/engine/commit/9496c5c77980102fcb402aae29de3f72337adcc4))
- Apply npm audit fix versions packages ([a1ed004e](https://github.com/underpostnet/engine/commit/a1ed004eecc1219e612027e9bc1f2fab4c717517))

### server-client-build-docs

- Apply Swagger autogen syntax error fix of version v2.9.2 ([7c8da2ff](https://github.com/underpostnet/engine/commit/7c8da2ff7ffd55e7b0492f019a2b44294137ab39))

### vscode

- Remove vs deprecated settings conf, and remove vs extension to minimal and remove comments of vs extensions in vanilla js ([b2aec354](https://github.com/underpostnet/engine/commit/b2aec354e757f136265b564a86cd1744bd460d88))

### cli-ipfs

- Implements base ipfs underpost dedicated module ([7f4f27f9](https://github.com/underpostnet/engine/commit/7f4f27f9c63ff149c5dd4de57952961a2b3498d0))

### cli-cluster

- Add Main IPFS Cluster StatefulSet Integration ([53dd0903](https://github.com/underpostnet/engine/commit/53dd09038b47d1a8330ff1e72b0087d2600c93b9))
- Add --exposePort custom flag ([a29185fe](https://github.com/underpostnet/engine/commit/a29185fe6f48c3babaa66d142d042909ca8b0889))
- Refactor pullImage load docker pull images to kind nodes ([3bdd5e78](https://github.com/underpostnet/engine/commit/3bdd5e787c242318cbab032816adf0008e9ab9dd))
- Add --replicas custom option ([70bdc6cd](https://github.com/underpostnet/engine/commit/70bdc6cdc0cf2aa3b2025133a5438f55d7e1ad18))
- Centralize pullImage for k3s kubeadm kind ([873b20d5](https://github.com/underpostnet/engine/commit/873b20d5a24b07afea39a95e0f705d1f8f01050b))
- Add snap install on init host workflow and cluster safeReset refactor ([48b4c33d](https://github.com/underpostnet/engine/commit/48b4c33d59166d54042fc5f96b5b524eccbdf1ec))

### server-logger

- Add optional file logging to logger factory ([ef18a29e](https://github.com/underpostnet/engine/commit/ef18a29e6e31e24e0e705446ca3cdf8804bda6ef))

### cli-lxd

- Refactor lxd module and workflows to vm cluster with k3s control and worker node integration ([812d5cdd](https://github.com/underpostnet/engine/commit/812d5cdd86f3055c448b594c218ae6e99c365e38))

### bin-deploy

- Clean up legacy logic ([d3cb1139](https://github.com/underpostnet/engine/commit/d3cb1139b3670915f6c612fd127541debb717d86))

### github-actions

- Add ref to checkout for provenance in cyberia publish workflow package ([6e0f9b59](https://github.com/underpostnet/engine/commit/6e0f9b5939103a366d28c4940e859d545cabdc34))
- Add ref to checkout for provenance ([0512ebec](https://github.com/underpostnet/engine/commit/0512ebecf65d1379d29c2c0e2377733a4265c06f))
- Remove copying of MariaDB.js to underpost directory. ([d64c64ee](https://github.com/underpostnet/engine/commit/d64c64ee99b015dd1e956f6ccc9055fcb73057f9))
- Fix package-pwa-microservices-template-ghpkg commit message propagation logic ([c8ef2ea8](https://github.com/underpostnet/engine/commit/c8ef2ea8d89d1a37c4dacef4d2538304605369fc))

## New release v:2.99.8 (2026-02-18)

### github-actions

- Fix last commit message in npmpkg workflow ([6dd0f484](https://github.com/underpostnet/engine/commit/6dd0f48452fd9810eeb3f535d8859d7e92a418fd))
- Fix MariaDB import in CI workflows ([2002c11f](https://github.com/underpostnet/engine/commit/2002c11f312293be00c6434e4ba64a81a370e1df))
- Fix GitHub Actions commit message ([e36c4fb6](https://github.com/underpostnet/engine/commit/e36c4fb6592d17e4d3ffca1e8eede90105a5847b))

### dockerfile

- Underpost image dockerfiles file formats and clean comment ([6e22157c](https://github.com/underpostnet/engine/commit/6e22157c3d276aab9dc328165e7bc686a339663b))

### conf

- Fix repository README logic builder ([d88c5317](https://github.com/underpostnet/engine/commit/d88c5317e32b18b8d180d028e4ef9388ce6db78a))

### db

- Fix MariaDB import ([6edf3719](https://github.com/underpostnet/engine/commit/6edf3719bf4ee71ebe30fb1e7e5a9767aaefe352))

### cli-static

- Fix module js doc path ([6b10a929](https://github.com/underpostnet/engine/commit/6b10a9295422425863ef24f6eb7d76c67b248385))

## New release v:2.99.7 (2026-02-17)

### cli-ssh

- Fix batch remote execution ([3658db14](https://github.com/underpostnet/engine/commit/3658db140b550914b0c331723d7a8cd11999514a))

### cli-cron

- Change order exec createJobNow logic ([524b8b80](https://github.com/underpostnet/engine/commit/524b8b802dc40220cef8380dd9b7a80eb3055821))
- Fix error prepare subPath in cronjob subPath mount ([33bedaff](https://github.com/underpostnet/engine/commit/33bedaff2a7e815e3522f4921e937384ee0b7750))
- Fix engine path definition and remove old cmd job in ci core sync command ([dbc5b6e6](https://github.com/underpostnet/engine/commit/dbc5b6e6e863b6c11f6c186d3a6f52781920c2be))
- Refactor run sync cron and remove redundant cron runner ([5885a747](https://github.com/underpostnet/engine/commit/5885a747acb16dc422b6d4007bfe403bbc896660))
- Add SSH flag to remote cron exec ([4339fb9d](https://github.com/underpostnet/engine/commit/4339fb9d32dea3dc4d47da19d554347a6a5ab070))
- Add underpost cron jobs config env persistence ([d8d15eda](https://github.com/underpostnet/engine/commit/d8d15eda887465300b58b6775d5c2b8d241010f8))

### cron-cli

- Enable createJobNow in cron setup-start ([bdce5ca0](https://github.com/underpostnet/engine/commit/bdce5ca0df705daa25255b55ce15c1483bc8a717))

### cli-run

- Improve message commit clean on logic propagate in template-deploy runnner ([dfa64105](https://github.com/underpostnet/engine/commit/dfa641052bc71ad3c5c8c461651d1947dc5f21c0))
- Add replaceNthNewline logic in template-deploy runner ([282faf73](https://github.com/underpostnet/engine/commit/282faf73ef32dc65e1b140af6f4e7609e964a503))

### github-actions

- Replace split logic ')' character, to simply deletes the first line and keeps everything from the second line ([6c1fbdf1](https://github.com/underpostnet/engine/commit/6c1fbdf1193cbf0f32cdfa9bccd11228d9f889f4))

### cli-repo

- Fix propagation message logic ([9ff035f1](https://github.com/underpostnet/engine/commit/9ff035f157b8433d5b236f46e54abc895b7ff626))
- Add logic to propagate integration commit message between repos ([4f7201c9](https://github.com/underpostnet/engine/commit/4f7201c945d1c0e95a604ff680bc2a64ac2e4c8d))
- Add --changelog-no-hash flag and logic ([d71cfe06](https://github.com/underpostnet/engine/commit/d71cfe062fe2a1a6b1f8678b64ee24faed4751f4))
- Add changelog commits logic to sub repo builds ([c8e94c32](https://github.com/underpostnet/engine/commit/c8e94c32fdad0a68eeadd9ab599d640c7cdd3f51))
- Remove redundant --msg flag in cmt command ([59b529bb](https://github.com/underpostnet/engine/commit/59b529bb6ecd5bf8ff14d5d686e96a1d9e6911a5))

### cli-system

- Fix missing fs import ([94bbd4ec](https://github.com/underpostnet/engine/commit/94bbd4ec7aa5a154f12ae55657a77c7320ae3739))
- Add cli system module as a SystemProvisionig OS instructions provider ([d8e629e7](https://github.com/underpostnet/engine/commit/d8e629e71dcc580cf0d3997e88457a35466333a1))

### bin-deploy

- Add sync start scripts of each deploy id dd.router ([3d40afa8](https://github.com/underpostnet/engine/commit/3d40afa8b84fa4329624177e242c9105519fe6e8))

### docs

- JSDoc name, descriptions, and render logic improvements ([01a288ab](https://github.com/underpostnet/engine/commit/01a288abcf25876c357678996913e4702487de28))

### cli

- Chore exports and ssh command description ([589f0403](https://github.com/underpostnet/engine/commit/589f0403e9d20ccb3404a1980da956dd181b204a))

## New release v:2.99.6 (2026-02-15)

### cli-cron

- Add update envs with ip in dns job logic ([ab685064](https://github.com/underpostnet/engine/commit/ab6850645b7c70af87cd9350863951ccafc95d89))
- Migrate PM2 cronjobs to Kubernetes cronjobs ([968361a2](https://github.com/underpostnet/engine/commit/968361a23d2a0c68df685641f10f0d3d4b0ed29c))

### build

- Fix remove dd-core cron files exclusive copy ([cb7b594f](https://github.com/underpostnet/engine/commit/cb7b594f9feeb1062edf3cdfe41f85eb2c57e867))

### docs

- Improve cluster lifecycle and cron ref ([a15e9a8d](https://github.com/underpostnet/engine/commit/a15e9a8d85e6168e581ff9a4d34e0efac6ff8e5f))
- chore main cluster lifecycle commands ([144db5f9](https://github.com/underpostnet/engine/commit/144db5f98a1829698867b7fe66ba55007d493eec))

### manifests

- Add k8s base engine core cron jobs yamls ([8c2e54a5](https://github.com/underpostnet/engine/commit/8c2e54a56b8e17a0de2da45a90d9e124be7c00ba))

### cli-static

- Add --run-sv flag to run http server to preview the static build ([bd73bdd0](https://github.com/underpostnet/engine/commit/bd73bdd08f174a75d2b687b587f93d110b165d60))

### cli-baremetal

- Fix nfs root directoy build cleanup logic ([302879a7](https://github.com/underpostnet/engine/commit/302879a7c075175b95d29d70008370042e9da7bc))
- Add kickstart  commissioning workflow logic and Cloud init and kickstart bootstrap http server enhancements ([c0fecb91](https://github.com/underpostnet/engine/commit/c0fecb911c2f6a04a41673067c675f76fd7e3c0b))
- Fix ipxeBuildIso method with forceRebuild parameter ([b79f030c](https://github.com/underpostnet/engine/commit/b79f030c059a0f7927507b0a54cadb82305a9d74))
- Add iso-ram rocky9 kickstart anaconda logic workflow ([2607edf2](https://github.com/underpostnet/engine/commit/2607edf222624295e9c96ff8a005c159c19bde49))
- Remove redundate logic and, add silent on run kill http bootstrap port ([95b7b990](https://github.com/underpostnet/engine/commit/95b7b990aebccf2ba218457213837830683834a0))
- Add bootstrapHttpServerRun flag in baremetal callback for standalone http bootstrap run server options workflow ([e360a7d9](https://github.com/underpostnet/engine/commit/e360a7d91b9b7f7bcfc1d1749fbb7a99599b26dd))
- Remove machine system id in kernel params ([6a706392](https://github.com/underpostnet/engine/commit/6a706392b6b09d5aabe2f0cd9d09efd774f22c4f))
- Add nfs server reset optional flag ([a42e76b5](https://github.com/underpostnet/engine/commit/a42e76b541858819662f563bf83b8fe0dda334a8))
- Remove chroot enlistment cloud init script ([c153b186](https://github.com/underpostnet/engine/commit/c153b1860132f3b4e7aaaf20f7f2a4fd8c08fda5))

### client-core

- Fix iframe docs component inconsistent modals positions on pwa app cycle ([fe716235](https://github.com/underpostnet/engine/commit/fe716235fbdac09c9fe80c5541af265b236ca06d))

### scripts

- MAAS DHCP dynamic range fix ([b89b577d](https://github.com/underpostnet/engine/commit/b89b577d5d2717537ce6e280b89ea09d54bb4e05))

## New release v:2.99.5 (2026-02-11)

### client-docs

- Remove legacy static generator site guide docs ([cdb67b86](https://github.com/underpostnet/engine/commit/cdb67b865205abe28aec9c0ac433afce4a1003a1))

### cli-baremetal

- Add enable ssh in cloud init config in commission workflow ([9c3dee4f](https://github.com/underpostnet/engine/commit/9c3dee4f4a67de92f24fb6087f0dbaad0e6de26f))
- Refactor commission workflow with cloud init cmd run commission enlist request ([2d908f76](https://github.com/underpostnet/engine/commit/2d908f76148821686afaa6c3601aee65aed96255))
- Add to IPXE build iso method iso-nfs commission workflow type support ([76476eb9](https://github.com/underpostnet/engine/commit/76476eb9c3e30c555b7cb4f01bb4aa1f47a3c4eb))
- Add --ipxe-build-iso workflow ([4b305884](https://github.com/underpostnet/engine/commit/4b3058849c0fb71a7ef3b2c3da75d39c8e5e9b6c))
- Fix baremetal machineFactory method and add fallbackArchitecture for commission arch handle ([7e921fee](https://github.com/underpostnet/engine/commit/7e921fee2584038bea20aaa93239991b081103f0))
- Add hp-envy-iso-ram baremetal commissioning workflow ([c9a00a3c](https://github.com/underpostnet/engine/commit/c9a00a3c78d228a10d7e0e1e3f0a69ef9f310cc8))
- Create maasCliExec method and apply centralized implementation ([752833c8](https://github.com/underpostnet/engine/commit/752833c8dff81139f7166fba4b5e10430d81db36))

### cli-static

- Chore remoe redundant comments ([b8fb0259](https://github.com/underpostnet/engine/commit/b8fb0259ddbc5f6ee20e3531b82a39cec0bce5e9))
- Simplified static example README.md and remove unused params build ([3ac1cc2c](https://github.com/underpostnet/engine/commit/3ac1cc2c83913f4cbf8ed40364357c4f8cefb1ed))

### server-logger

- Refactor logger factory with log level and skip arg function param ([56394e5e](https://github.com/underpostnet/engine/commit/56394e5ea35809e00028a84721bbc0fdb6a8eed7))

### cli-image

- Remove un legacy secretDockerInput ([8dc8e7a2](https://github.com/underpostnet/engine/commit/8dc8e7a280ef358f7f1f360afb68f2c5084e72c0))
- Remove legacy docker secrets logic ([4580efac](https://github.com/underpostnet/engine/commit/4580efacacbec019dda566d039f37c84405a2d35))

### cli-cloud-init

- Fix kernelParamsFactory missing mac address arg ([207647c4](https://github.com/underpostnet/engine/commit/207647c4d33b89f122e2be42745db649742d2434))
- Create kernerParamsFactory cloud init method ([57945e9a](https://github.com/underpostnet/engine/commit/57945e9a2ce447a70625fa275514115591d381c5))

### cli-repo

- Add index from head in cmt --log flag history ([d3f9cb69](https://github.com/underpostnet/engine/commit/d3f9cb69715df648751ad2cbe0ebc98dee444211))

### package

- Remove --clear-discovered --remove-machines in default baremetal script ([276ff4e4](https://github.com/underpostnet/engine/commit/276ff4e4ce7dffa8c5662ce6c1ba9c418e45ee3b))

### cli-run

- Add list disk devices runner ([14dc4d7e](https://github.com/underpostnet/engine/commit/14dc4d7e11ef201e5782fb9dc2f0f8963d776e1e))

### src-index

- Add required nodejs major version warning ([c6ef0afd](https://github.com/underpostnet/engine/commit/c6ef0afd32c1d3c278a8f76c5757139ae3339aae))

### cli-secrets

- Remove legacy docker secrets api ([7db58689](https://github.com/underpostnet/engine/commit/7db58689c1d6bec538a7a49d8b48f916f77aba7e))

### bin-deploy

- Rename build/syncs envs batch workflows ([c2e89cf8](https://github.com/underpostnet/engine/commit/c2e89cf8d9f5cb24ff505afc3b6fbf38760d7cb4))

### server-tls

- Chore js docs path module ([50e795a0](https://github.com/underpostnet/engine/commit/50e795a05a3b8f17f15d1380545f043a64b6fbff))
- Rename comments module to `UnderpostTLS` namespace ([9a4ed608](https://github.com/underpostnet/engine/commit/9a4ed608856853137f2a02f22fa7b149c9be61d1))

### cli-config

- Add copy option to get operations ([5837f55f](https://github.com/underpostnet/engine/commit/5837f55fc2da8e200ffa036bf353e07802841d8c))

### engine-core

- Rename default toPath in playwright workflow ([348e4cd6](https://github.com/underpostnet/engine/commit/348e4cd6c0ed78d8e64e8761a67d5587533c1b04))

## New release v:2.99.4 (2026-02-03)

### cli-deploy

- Smplified existsContainerFile remove legacy useKindDockerPod ([ff877519](https://github.com/underpostnet/engine/commit/ff877519e17726567d3eb33445e2a0f34782d70c))
- Refactor existsContainerFile and add useKindDockerPodlogic and remove legacy tf-vae-test monitor runner ([a7ab0866](https://github.com/underpostnet/engine/commit/a7ab086691d070613b305ec4e742486d73d72732))

### engine-core

- Add base playwright deployment ([8e020cd6](https://github.com/underpostnet/engine/commit/8e020cd64f64c0ff258a024765c25c36948edcba))
- Fix js docs params types and descriptions ([9c50af10](https://github.com/underpostnet/engine/commit/9c50af103ec7c2bd938aee620d62abeb2c061269))
- Revert compiler js options and set checkJs false to vs code problems ([e4566c6c](https://github.com/underpostnet/engine/commit/e4566c6c33b3f862d7a75864d4930721af597050))
- Fix fas api load image with latest underpost cli version ([ac785df4](https://github.com/underpostnet/engine/commit/ac785df467d6b22df59ab3ec43bf73ec5b58f9a2))
- Fix: js config import meta module option ([58b22b73](https://github.com/underpostnet/engine/commit/58b22b7348c2924b70858f07cf39d248a89c1e4e))
- chore: License year ([987a1dc6](https://github.com/underpostnet/engine/commit/987a1dc6b38e525376a8a030f39875774b5e55f1))
- Add volume in exclude js config and checkJs attribute ([e6bdd41a](https://github.com/underpostnet/engine/commit/e6bdd41a397175d5d62ee622f824a4146b1b35db))

### client-core

- Fix user timestamps and CLI flags ([61109e3a](https://github.com/underpostnet/engine/commit/61109e3adce4e918325bd1137ae6cb8c3c2a5156))
- Add Polyhedron immersive particle color palettes ([40471fab](https://github.com/underpostnet/engine/commit/40471fabbf899b4019008d21b16dea93af43accd))
- Add Polyhedron component immersive fullscreen image faces mode effects ([8a00a8d7](https://github.com/underpostnet/engine/commit/8a00a8d7999bfb7de1d62c9201fe33c047d16a66))
- Chore missing translate key ([43a6c807](https://github.com/underpostnet/engine/commit/43a6c807ea448c7887109f0e9abedff5b238b714))

### cli-baremetal

- Change args to options for more readable cli docs ([401f82b2](https://github.com/underpostnet/engine/commit/401f82b2521f65f91e846c9cba9ace79b420b945))

### server-proxy

- Fix tls base ref ([20afc368](https://github.com/underpostnet/engine/commit/20afc3684e186a186353c1b8b3e548b098d4a40e))

### server-process

- Improve process.js run openTerminal with graphical as root ([298b265c](https://github.com/underpostnet/engine/commit/298b265ca4ddaae6a2e0eb18b74f39b2ff7d3384))
- Fix openTerminal DBUS_SESSION_BUS_ADDRESS env ([58a24816](https://github.com/underpostnet/engine/commit/58a2481635e2778184210696204f3af95d0fe712))

### cli-run

- Add options.logs customization in git-conf runner ([2ae5d3cc](https://github.com/underpostnet/engine/commit/2ae5d3cc39c87ebeab5218c3b1f5c3b04b87fd57))
- Add --logs and --monitor-status flags options customization ([1c395cc6](https://github.com/underpostnet/engine/commit/1c395cc6ef21f3c156fd80295e665a4ea3576f9c))

### server-tls

- Add Underpost tls Namespace ([cc31c8ee](https://github.com/underpostnet/engine/commit/cc31c8ee3d5be67e76f95948374d617980efe855))

### server-logger

- Refactor loggerFactory to custom underpostLogger with merge 'setUpInfo' interface typedef scope ([34ae041a](https://github.com/underpostnet/engine/commit/34ae041aa2ae3dc19f78e131a5834753cc1be375))

### scripts

- Remove ([41af6e99](https://github.com/underpostnet/engine/commit/41af6e9988c036def7bbeb2c4ec3802a718ccd33))

### client-underpost

- Add base Polyhedron component view ([aefb59be](https://github.com/underpostnet/engine/commit/aefb59bede3117459d4d4d6d0bf5b74a0e0133e2))

## New release v:2.99.1 (2026-01-29)

### cli-run

- In sync runner add cmd customization ([056564e5](https://github.com/underpostnet/engine/commit/056564e51cbfb90df60d5fa7a8b0331b3e972956))
- Add missin name space in ssh-deploy runners and add shh-deploy-db-status runner ([56b017e7](https://github.com/underpostnet/engine/commit/56b017e78cbae85feaa18e33116925bcb51a7aa2))
- Fix missing dev case in deploy runner ([6e928c0b](https://github.com/underpostnet/engine/commit/6e928c0b4aa8d229d475e75f2e3b8d7824a97f00))

### engine-cyberia

- Fix handle missing atlas sprite fileId ([dc1adbc4](https://github.com/underpostnet/engine/commit/dc1adbc418b397b1413be118ec39c787edc018d2))

### github-actions

- Add init workflow deployment dd-core, dd-lampp, and dd-test ([1a56deb2](https://github.com/underpostnet/engine/commit/1a56deb2570571af4badc5294dd28dac9771aa8a))
- Add ssh-init-engine-cyberia worflow to dd-cyberia cd ([5478f7d7](https://github.com/underpostnet/engine/commit/5478f7d764ab5ed1747fc4ba0b82d339009c88cb))

### cli-ssh

- Add sshRemoteRunner for runner exec arbitrary shell commands on a remote server via SSH with proper credential handling ([3764291a](https://github.com/underpostnet/engine/commit/3764291a90dc2361662409c602e74bb88c1f8269))

### cli-monitor

- Add multiple version async monitor support and rename version to versions for cli flag compatibility ([03a56097](https://github.com/underpostnet/engine/commit/03a560970db6b7a59e8b31f8b80d554101bbbaf7))
- Add readyDeployment monitor mode ([1e7a4fa9](https://github.com/underpostnet/engine/commit/1e7a4fa9c7accd93a5c9fbbf820219cbf7d355ff))

### cli-deploy

- Fix ternary custom image handle on manifest build ([b02ba105](https://github.com/underpostnet/engine/commit/b02ba105624c7455a082f6ddac233c05525aa9c0))

### cli-env

- Chore js docs comments in build param set method ([9c66cdfc](https://github.com/underpostnet/engine/commit/9c66cdfcf8106a2d567475df1f2469529abc2226))

## New release v:2.99.0 (2026-01-28)

### cli-run

- Add custom etc-hosts runner ([541dbb0b](https://github.com/underpostnet/engine/commit/541dbb0b003a346229c378726aba2b0cd00d7990))
- Fix runner sync deploy handle custom versions ([983feae4](https://github.com/underpostnet/engine/commit/983feae4cf06ff3fff6f77baf0ad1c02cd34f84d))
- Add 'crypto-policy' runner to DEFAULT:SHA1 for compatibility ([cd24992e](https://github.com/underpostnet/engine/commit/cd24992e238394b2aea3af769dea8de14c5994d8))
- Add top customers ps and headers in ps runner ([d221b8a8](https://github.com/underpostnet/engine/commit/d221b8a8cb756dc97fded2b4429771a43d78b32c))
- Add top-consumers custom path to run ps (Displays running processes) ([c07e29be](https://github.com/underpostnet/engine/commit/c07e29be495fdc62a9a2f458eff3ba0267b264f9))
- Add missing --timeout-response in monitor command ([a1f02fb4](https://github.com/underpostnet/engine/commit/a1f02fb4f5f44bcd28b8da8325eb1a21618dc848))
- Add missing switchTraffic options object args, and centralize monitor switchTraffic ([314db030](https://github.com/underpostnet/engine/commit/314db03081f4193ef32828a4623d65c509d4cb8b))

### auth

- Fix cookieOptionsFactory in development etc hosts session persistence case ([ab242ee3](https://github.com/underpostnet/engine/commit/ab242ee3c99125d1608e71ca133f51101b21acaa))

### cli-config

- Add batch build deploy id envs in set method ([bb5857c3](https://github.com/underpostnet/engine/commit/bb5857c32a4c5587184772dde4f085abdba1e9be))

### cli-cluster

- Increment await time valkey-service status monitor ([a33d30fe](https://github.com/underpostnet/engine/commit/a33d30fe1367ef96d59a8211f75548dba48dd09c))

### github-actions

- Update base underpost image version deploy from v2.8.846 to v2.98.3 ([dcbb9e83](https://github.com/underpostnet/engine/commit/dcbb9e8361cc395ab90e730a9a7951e7c5590980))

### server-dns

- Fix missing class ref getLocalIPv4Address and UnderpostDns export ([bf311240](https://github.com/underpostnet/engine/commit/bf3112401131a1f1c3c1a9506d861072339016e4))

### cli-monitor

- Simplify and change to etc hosts test in development case monitor ([b2bbff6a](https://github.com/underpostnet/engine/commit/b2bbff6a28c709faa6ce321ae124771d046024ca))
- Remove monitor-init-callback-script ([c95e759c](https://github.com/underpostnet/engine/commit/c95e759c4c73c4ac92092314a89c51294047eba9))
- Simplify and improve monitor input runtime methods ([a68a4333](https://github.com/underpostnet/engine/commit/a68a43333877183d718398af9690bd24413d9d4f))

### cli-deploy

- Add flag --underpost-quickly-install in default cmd run deployments yaml ([04c16a94](https://github.com/underpostnet/engine/commit/04c16a94302f6a107c3e264adefa902d02179d3d))
- Add and centralize timeout response proxy flags ([e89a6e3f](https://github.com/underpostnet/engine/commit/e89a6e3f2cf0dea7926743426d2e804ecb92aeb7))
- Add HTTPProxy response timeout option cutomization ([e9132794](https://github.com/underpostnet/engine/commit/e9132794e1ad941bed69920d456a5f7d23189b27))

### engine-core

- Refactor and improve underpost modules and exports to Underpost index main class ([7865e95d](https://github.com/underpostnet/engine/commit/7865e95d4a03cc9f32479de68c29463f17c1be45))

### cli

- Remove un used script command ([f79d65f3](https://github.com/underpostnet/engine/commit/f79d65f34b6d10a585b178c9486830e1a0457f84))

### engine-cyberia

- Remove duplicate comments ([923cc103](https://github.com/underpostnet/engine/commit/923cc103b60c6cbc0d9d00badd89c39ac1470ac0))
- chore comments object layer component ([1cdf2e79](https://github.com/underpostnet/engine/commit/1cdf2e7924df9fa79cd5a9e0f62237e7ddc1dcf5))
- Add object layer api/component atlas sprite sheet integration ([499479a4](https://github.com/underpostnet/engine/commit/499479a48fd54a88169718ed367d8bac566e3326))
- Add in object layer viewer check if modal is open and DOM element exists before trying to render ([d3e4c75f](https://github.com/underpostnet/engine/commit/d3e4c75f380fb0a18140b108e77f99a6c540c93e))
- Fix object layer viewer full grid reload on navigation router events ([3edb984f](https://github.com/underpostnet/engine/commit/3edb984fabb0aee71f3f2e3e9853a5db5be0427d))

### cli-cyberia

- Add git clean assets directory on drop option ([7bddac9c](https://github.com/underpostnet/engine/commit/7bddac9cbe2621295afe05dffe74cd6c191116c7))

## New release v:2.98.3 (2026-01-23)

### client-core

- Fix and robust Fullscreen Component for PWA for cross compatibility ([f303c1d5](https://github.com/underpostnet/engine/commit/f303c1d52ebd8d100209587291856d1d6b12b81d))
- Fix add restrict markdown link handlers to file on panel form component ([f498cc6e](https://github.com/underpostnet/engine/commit/f498cc6e4fe5d9f9988c4fe57865645d7cb364b2))
- Add missing markdown-source-copied translate data ([8ee364b2](https://github.com/underpostnet/engine/commit/8ee364b2c0e20be0f172be76f7c5c280d7c4a88c))

### engine-cyberia

- Fix object layer viewer prevent full grid reload on navigation ([50d9a20d](https://github.com/underpostnet/engine/commit/50d9a20da32663948a9beb115ddfc85e5196a5bb))

### cli-cyberia

- Add command to install cyberia dedicated dependencies ([a817e316](https://github.com/underpostnet/engine/commit/a817e3161b64a204235949d0df049e7bfc0f7671))

## New release v:2.98.1 (2026-01-23)

### bin-deploy

- Add router default-conf build in version-build logic ([196b0c6f](https://github.com/underpostnet/engine/commit/196b0c6f138dd9391e3b51facf5586bfee9b6a2f))

### scripts

- Rocky Linux setup script simplification ([06255c17](https://github.com/underpostnet/engine/commit/06255c17d7bfdba7acc893c854f82820ba55225e))

### client-core

- Add PanelForm copy markdown option ([8e65564a](https://github.com/underpostnet/engine/commit/8e65564a64728469df1bbb58cfc03fc828e400e4))
- Add PanelForm Markdown Link Click Handling ([1152759b](https://github.com/underpostnet/engine/commit/1152759b388adffa30cfb7a179bf7f948cc06027))
- Fix document service search response bug ([04a4e3dc](https://github.com/underpostnet/engine/commit/04a4e3dccc204b0a1dfe1b3743856eb74e3c6194))
- Remove unused services ([5be25ec9](https://github.com/underpostnet/engine/commit/5be25ec9fcef5dbeda3171ea1be35cddf7ba8a9e))
- Add Default Management Clear Filter Button and related event listener and logic ([f0a55bab](https://github.com/underpostnet/engine/commit/f0a55bab0dc4362914b8f4a6b6a1ddd9cd90ee79))
- Fix duplicate notification default management ([e74f9646](https://github.com/underpostnet/engine/commit/e74f964622fb942fec156d261e805334aa5642fa))

### cli-run

- Chore reorder runners keys in static runners attr ([7bebd622](https://github.com/underpostnet/engine/commit/7bebd6221073318bff5c88109e6c1961c45ff860))

### cli-repository

- Chore rename g8 -> G8 comments and default options ([a624ffdd](https://github.com/underpostnet/engine/commit/a624ffddb8a63ec6367cd9f6ea7429a39d051caa))
- Fix -g8 flag and related logic ([aef3575b](https://github.com/underpostnet/engine/commit/aef3575b11846fd6a50c88cec01bc243789de4cf))

### cli-cluster

- Fix unused kind-config-cuda conf on kind cluster ([e0b0cb2e](https://github.com/underpostnet/engine/commit/e0b0cb2eb1b0eafecdb8d0e83a497236d989d5b8))

### bin-build

- Fix origin package json sub repo builder switch case ([67505c5f](https://github.com/underpostnet/engine/commit/67505c5f24247141c199422670166f0c8e520fca))

### dependencie

- Remove systeminformation and cyberia module dependencies of base core engine ([b81b0a8d](https://github.com/underpostnet/engine/commit/b81b0a8ddaa282a7fece263b26d7ce9d8aa4df5f))
- Add fast-json-stable-stringify dependencie ([7a0cd142](https://github.com/underpostnet/engine/commit/7a0cd142d601a6f6285925bcec4d54c044569788))

### engine-cyberia

- Add ObjectLayer modal frame validation fallback ([3f6fe3dd](https://github.com/underpostnet/engine/commit/3f6fe3ddcf7cea48e6946a863dd95b984cdc6f2c))
- Fix Filter New Object Layer Highlight ([f076e6c2](https://github.com/underpostnet/engine/commit/f076e6c2ff7b7388b9770ccfb2297203e5da1a04))
- Clean up cyberia client legacy components ([ef85e18b](https://github.com/underpostnet/engine/commit/ef85e18b9e9cfc818977bb93dd74a1ac6b985567))
- Refactor object layer model schema and add atlas cli sprite sheet generation and API support, with new object-layer-render-frames and atlas-sprite-sheet related models ([f7044c63](https://github.com/underpostnet/engine/commit/f7044c639d93f2b11168ce512bcddc2aff961c10))

### engine-core

- Fix default management new item filter in default management component ([a0ae66bd](https://github.com/underpostnet/engine/commit/a0ae66bd2653f4fddeaa926471467b6f7b30576c))

### engine

- Converted all the static field initializers to getter methods in package main index.js ([fe11f692](https://github.com/underpostnet/engine/commit/fe11f692414bfef514f27360f8cd23e8ebbd721e))

## New release v:2.98.0 (2026-01-14)

### client-core

- In file explorer add missing nav path after upload files ([22b9d3e3](https://github.com/underpostnet/engine/commit/22b9d3e33954ff067853928ea9d5ef12987b0e75))
- Simplify fileexplorer mimetype file info display from table files to edit modal ([ae441743](https://github.com/underpostnet/engine/commit/ae44174343ff059d8bb3439afa2d890936c29e29))
- Implements file explorer document edit feature ([e5a8a84e](https://github.com/underpostnet/engine/commit/e5a8a84edda93d7009fb3920b0d69bc93249a4cb))
- Implements Minimal Custom Pagination for File Explorer ([acf953b7](https://github.com/underpostnet/engine/commit/acf953b734a9af26f9ba63422cd6b0a2d9a2eade))
- Add clean search box history on logout event ([ffb07e12](https://github.com/underpostnet/engine/commit/ffb07e12e0c407dc1d17410d4fb2a844cdc18124))
- Filter Document Search by idPanel Tag ([4f473489](https://github.com/underpostnet/engine/commit/4f473489a2703ea0fb155b6fa04eccd0dfb85d40))
- Cleanup document model and streamline search logic ([9e3eebc7](https://github.com/underpostnet/engine/commit/9e3eebc75c8120949df22ebcfa62c9248a1d7897))
- Fix Epiphany responsive screen orientation compatibility ([c0e42ccd](https://github.com/underpostnet/engine/commit/c0e42ccdd1baa71f77fd41cfbbedf5b60a1ea0cc))
- Implement preventing Orphaned Files in Document Service ([2f35476d](https://github.com/underpostnet/engine/commit/2f35476dd94baf46e533005a9d20ab3e4512a064))
- Implement filter query default management browser navigation handler ([31dc83ba](https://github.com/underpostnet/engine/commit/31dc83bac5bb2bc2e8cea523890e9d161c89cae6))
- Fix auto save on cell edit in Default Management ([607d0085](https://github.com/underpostnet/engine/commit/607d00858198db401876a88a790a322c33d407c3))

## New release v:2.97.5 (2026-01-12)

### cli-db

- Implements orphaned file clean collections workflow. ([c69763c0](https://github.com/underpostnet/engine/commit/c69763c0c4b04c98cb88011e77ca48668a157c8b))
- Add missing js docs comments ([e85df3ec](https://github.com/underpostnet/engine/commit/e85df3ec02468ae4241f97c3b301982ec0f0dd50))

### client-core

- Add js docs comments in src/client/services/core/core.service.js ([a81a1ad8](https://github.com/underpostnet/engine/commit/a81a1ad85556ab706179fee175e7b6c2a95c1945))
- Centralizing Query Param Handling in Services with generic abstract method ([2ac38972](https://github.com/underpostnet/engine/commit/2ac38972edacd643d6c33f4a7d700fcb2e1e4f82))
- Implements file explorer public toggle document switch ([580831d7](https://github.com/underpostnet/engine/commit/580831d7af37276b70449ccff96ec2da45828c0d))
- Rename @private to @method js docs ([8e85094c](https://github.com/underpostnet/engine/commit/8e85094ca86b7dad373faa6ef2acd911cdce9170))
- Implements base server data query SSRM pagination ([6341984c](https://github.com/underpostnet/engine/commit/6341984c2c54c39c9933a10a5dca844937283d83))
- Remove unused /sh core api path ([47e47526](https://github.com/underpostnet/engine/commit/47e4752655eddf06d264aa7d4c7ab1a6ffc8fd5f))
- Implement client file service get blob by id generic switch use case with data defualt mode ([64686b61](https://github.com/underpostnet/engine/commit/64686b615232c5c59591c358962c64b2c846fcbe))
- Implements in api service file document ownership authorization validation ([d6663ca1](https://github.com/underpostnet/engine/commit/d6663ca1e70dd67ea9bb4848caf7b3e5dacab456))
- Fix urlFactory abstraction method ([3cbe674f](https://github.com/underpostnet/engine/commit/3cbe674f5d8774437dd5235a5e1cee7bc34a5da0))
- Improve cloud component transfer files to content componentn to render logic ([167f6a0d](https://github.com/underpostnet/engine/commit/167f6a0d9cd3ca141be9d4240eecaebca53c8e57))
- Improve user profile image logic render ([451ffdf6](https://github.com/underpostnet/engine/commit/451ffdf613d4a44f9d09a112852cc1485c0a6973))
- Remove getDefaultProfileImageId, and simplify case use static resource avatar. ([1b64f824](https://github.com/underpostnet/engine/commit/1b64f824e45ad95938f93aa3a5b35b42499cf263))
- Remove dotenv on object-layer module ([cf5173d9](https://github.com/underpostnet/engine/commit/cf5173d95199470a9314173403cad479d0372d67))
- Refactor and improve ux SPA public profile navigation consistency ([04d16bb6](https://github.com/underpostnet/engine/commit/04d16bb6565f8387e061df4fa06e33c88ebb9513))
- Fix chat socket io sub path connections ([b2aade8a](https://github.com/underpostnet/engine/commit/b2aade8a2ca0151ecb3e1ee4fee67b64ed9343e1))
- Refactor public profile routing and user info handling ([cc6080a5](https://github.com/underpostnet/engine/commit/cc6080a5900b86b94def226b099777d642dde092))
- Remove unused pathOptions in setQueryPath ([4691f33e](https://github.com/underpostnet/engine/commit/4691f33eb3392ddca92fa097ab1e74e7c0a37fb1))
- Implement and simplify dynamic public profile modal update ([30e9f2a8](https://github.com/underpostnet/engine/commit/30e9f2a82a40bbc71a7fd6a64e3ca0298b8e93d5))
- Implement public profile SPA navigation ([01d1061e](https://github.com/underpostnet/engine/commit/01d1061e032085182b128bcf34750ee40dc14028))
- Fix panel component: Add conditional onclick clean-file event ([3056c767](https://github.com/underpostnet/engine/commit/3056c76724d1703e9cdad54d24c3cd092952449d))
- Add public profile view in underpost client ([ca459d3b](https://github.com/underpostnet/engine/commit/ca459d3b30d2f3010dd4522f3325d6b1f5afe25f))
- Implements username URI-Safe validator ([d0a17614](https://github.com/underpostnet/engine/commit/d0a17614a47213245a4c53aedecbe0887edbb644))
- Implement PublicProfile onObserverListener ([935f43f6](https://github.com/underpostnet/engine/commit/935f43f6c85aab826fc1c59b0a0f8baed84d0dd8))
- Add public profile public api endpoint ([2a419dff](https://github.com/underpostnet/engine/commit/2a419dffc8a60a8864128459efac5533d480004f))
- Add PublicProfile component and user profile settings ([60dee0a8](https://github.com/underpostnet/engine/commit/60dee0a82dfcf1a779bb41c0909db09433bd4c6d))
- Add public profile and brewDescription in user model and account update related logic. ([6700fc5e](https://github.com/underpostnet/engine/commit/6700fc5e4046d91122d7a1e597ead742a9f75119))
- Refactor SearchBox.RecentResults to ensure only serializable data is persisted to localStorage (excluding DOM elements). ([896480c2](https://github.com/underpostnet/engine/commit/896480c25ab4aa70691c3fdf8d33176a96945e91))
- Implements historySearchBox with SearchBox.RecentResults consistency ([e9088ccf](https://github.com/underpostnet/engine/commit/e9088ccf1f6f22dcf2ea76989b9fc5347b3de189))
- Refactor underpost panel utf8 file handling and improve panel form file upload and header render user logic ([89ffa667](https://github.com/underpostnet/engine/commit/89ffa6677ea8088717427faccc33548cc44acdbe))
- Improve PanelForm uploader avatar username render ([acfa25b6](https://github.com/underpostnet/engine/commit/acfa25b6601178621e0b5cdfed2f26c97a2b10f2))
- Rename panel form profile label ([fcd14d5c](https://github.com/underpostnet/engine/commit/fcd14d5c8dc84ca73d796155f419d1bccc1efab1))

### clinet-core

- Improve public profile RouterEvents logic ([3e0ad850](https://github.com/underpostnet/engine/commit/3e0ad850dfdfeb3433be081177b1ced2fb13a22e))

## New release v:2.97.1 (2026-01-04)

### conf

- Update default confs js with the last deploys conf changes ([f73782bf](https://github.com/underpostnet/engine/commit/f73782bf829dd7d07075d0ba34691c936e096c4e))

### client-core

- Improve profile Image Avatar Implementation logic render ux/ui ([cd094651](https://github.com/underpostnet/engine/commit/cd09465133b8f5ff941a8ff376f7a036d4b56499))
- Improve Public Tag Visibility and auth logic ([58d20ef7](https://github.com/underpostnet/engine/commit/58d20ef7078df2688abbc6941c19f4d90e2eb235))
- Fix Search Box scroll tracking logic on pointer search box history ([abc91914](https://github.com/underpostnet/engine/commit/abc91914a47e7e60ce8f3c7ae9be6b8950d5f86f))
- Improve styles logic Search Box Icon and Panel Title ([b7093e31](https://github.com/underpostnet/engine/commit/b7093e31324316daf5c955849232abc7f3406821))
- Improve document search service with Optimization Strategy regex ([6ac9a165](https://github.com/underpostnet/engine/commit/6ac9a165ea8efd29fdbdd1de55b08053d2780918))
- Improve Unified Active/Selected States style panel form tags ([59d0fa67](https://github.com/underpostnet/engine/commit/59d0fa676627734a57a386047b373d612f9963db))
- Improve panel form styles ([4931fa45](https://github.com/underpostnet/engine/commit/4931fa4507a4d3c82fd321a23fcbc71821d15009))
- SearchBox Refactoring add auth search box Security rules ([ee547ad9](https://github.com/underpostnet/engine/commit/ee547ad99f9a7a97e4c6e9cb0212f8d015ce026d))
- Implement and Abstract Modal SearchBox Core Component, and custom document search provider for underpost client. ([afdbfbc4](https://github.com/underpostnet/engine/commit/afdbfbc41eb654c1296c6189e0c8998a8ed3b8e7))

### client-clore

- Implement PanelForm creator avatar username option render ([424a4a05](https://github.com/underpostnet/engine/commit/424a4a05f463dd722d8062d29f55743dbff369dc))

### cli-baremetal

- Improve Ubunut and Rocky chroot Linux Provisioning steps ([704a4e3b](https://github.com/underpostnet/engine/commit/704a4e3b66215cb45cc8307f041270be26120f24))
- Refactor the `downloadUbuntuLiveISO` function to a generic `downloadISO` ([fc8e7a5e](https://github.com/underpostnet/engine/commit/fc8e7a5e538a564da865db69a23d56598f4fe9b7))
- Reorder options workflow run tasks ([650c4f2a](https://github.com/underpostnet/engine/commit/650c4f2a7f821ebfc20ca7b9860ee47c5740d6b7))
- Add rockyTools flags to Provisioning steps for Rocky Linux-based systems. ([e57c3cdc](https://github.com/underpostnet/engine/commit/e57c3cdcdb56278687b1bb813f5703c979f2bba7))
- Refactored the baremetal kernel boot parameter construction to use OS family identification (`osIdLike`) from workflow configuration instead of hostname pattern matching. Also renamed the `chroot` type to `chroot-debootstrap` for clarity. ([775c70ad](https://github.com/underpostnet/engine/commit/775c70ad9569c0301583e209d3127163367e9482))
- Implements Dracut NFS multiple version options ([700b407a](https://github.com/underpostnet/engine/commit/700b407a20c94f32f59dda912df42bc9cadead12))
- Improve PXE iPXE kernel load workflow ([650440e0](https://github.com/underpostnet/engine/commit/650440e0aa47aa4e88efb26038a4a58d0c90dc7d))
- Improve mountBinfmtMisc mountCmds and unMountCmds logic ([231b245b](https://github.com/underpostnet/engine/commit/231b245b0bbad1cc529d105459cc0fcff28d2d33))
- Implement ipxeEfiFactory and improve iPXE shouldRebuild logic after cleanup tftp directory ([10511e3c](https://github.com/underpostnet/engine/commit/10511e3c0e621ba384d87507a635dfaa7d4b8ab0))
- Implements base Rocky9 ARM64 NFS Chroot Workflow ([b642f225](https://github.com/underpostnet/engine/commit/b642f22557ab42cf6a7b6d9a0da5203ec70c9752))
- Implements base rpi4mbarm64-chroot-rocky9 commission workflow ([d9524632](https://github.com/underpostnet/engine/commit/d95246327095889b04db88b478601ab266d2127b))

