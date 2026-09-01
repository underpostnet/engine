# Changelog

## 2026-09-01

### test

- Fix coverall template CI failures by handling stripped product surfaces ([fb14840d4](https://github.com/underpostnet/engine/commit/fb14840d4c42856e21e2dadba0a864f799693934))
- Move rerouted plain reads to the cyberia app tier ([944ea302e](https://github.com/underpostnet/engine/commit/944ea302eb7a80f77b69a1c603755aaca554aa12))
- Add unit suites for the propagation message resolution ([78ac60a09](https://github.com/underpostnet/engine/commit/78ac60a09b0a8b4d32887b233d02d044bc85e85a))
- Fix coverall post-migration secret source resolution ([dedb70980](https://github.com/underpostnet/engine/commit/dedb70980e2487db0086dd08e730055127c98897))
- Fix coverall config-scope and cron job previousEnv scope ([d3d07e13b](https://github.com/underpostnet/engine/commit/d3d07e13bfe68724a304df8de46699fda83979d9))
- Move rerouted plain reads to the integration tier ([b59fd9734](https://github.com/underpostnet/engine/commit/b59fd973458b835768ae7de35951e9889c869cd2))
- Fake the system node candidates under a temp root ([fcd3c8300](https://github.com/underpostnet/engine/commit/fcd3c8300272619accfcd88f363898db1c556cbe))
- Fix cyberia coverall base repository case ([d470fb1e4](https://github.com/underpostnet/engine/commit/d470fb1e498314160809a7d87712bb0951fe3a01))
- Fix  cyberia CLI assertion  in build workflow ([43df85d86](https://github.com/underpostnet/engine/commit/43df85d86175a3ff9037bd582d5067038eaacd82))
- Cover the sync source guard ([90b965ef4](https://github.com/underpostnet/engine/commit/90b965ef4b170868afb5541ce8facdf1bd714be6))
- Add unit suites for the execution profiles and offline build workflow ([c86cdaab7](https://github.com/underpostnet/engine/commit/c86cdaab7c5c130927c087cc46558c214e0b224e))
- Extended the suites for the node URIs and deploy logging changes ([354c9efba](https://github.com/underpostnet/engine/commit/354c9efba236c829ff5f61f1855e1cc8f5db6fc4))
- Extended suites for the state, image build and fallback capture changes ([355169317](https://github.com/underpostnet/engine/commit/3551693170f9f90571890573d2d14344e31ff1d2))
- Fix coveralls: hardhat module dependencie scope ([2f7dbb8bd](https://github.com/underpostnet/engine/commit/2f7dbb8bd5fc9f8aae851bed8d5f68e20f298efb))
- Fix coveralls: event-targets alertmanager webhook receiver ([b201c6dd7](https://github.com/underpostnet/engine/commit/b201c6dd76178b7686f714d8c014f683c48f672c))
- Add infra and unit suites and raise the coverage gate ([22d11215a](https://github.com/underpostnet/engine/commit/22d11215a159012056ebf2a59559707f47da2148))
- Fix coverage calculation excludes ([87ce13fdd](https://github.com/underpostnet/engine/commit/87ce13fddf62e624f431b3f3a942887340a1547d))
- Run the API test suite against an in-process server ([8ed062470](https://github.com/underpostnet/engine/commit/8ed062470a2cc916034beedab06c6607821aeb26))
- Move suites into tiered unit, integration and e2e layouts ([c17bf2e37](https://github.com/underpostnet/engine/commit/c17bf2e37e613f9774adf25929e48ae659581c5a))
- Replace Mocha and c8 with the Vitest tiered runner ([cb648a10b](https://github.com/underpostnet/engine/commit/cb648a10b5763d9db9a2f78ebffd8ecb82efab5f))
- Update coverall execution order list ([9a9ea3db7](https://github.com/underpostnet/engine/commit/9a9ea3db768d1eadbac71249d50c0a7578afe5a5))
- Add mocha test runner configuration ([ab4e84bb1](https://github.com/underpostnet/engine/commit/ab4e84bb141ab878c2275edfaf166f7cd7e70684))

### github-actions

- Drop the engine repo from cyberia-scoped CI jobs ([7e3dccd32](https://github.com/underpostnet/engine/commit/7e3dccd3269da4a2319fe3b10371750be0a5e4aa))
- Resolve propagation payloads through cmt --propagate-msg ([bfecdf73e](https://github.com/underpostnet/engine/commit/bfecdf73e9c304e3e194ddee5ff7436ef396d31d))
- Point CI image flows at the package command ([fffb75db1](https://github.com/underpostnet/engine/commit/fffb75db1cfc976c54dfe70ddca6b4d981d07a8e))
- Align CD workflow comments with the renamed deploy logging library ([1cfe400e4](https://github.com/underpostnet/engine/commit/1cfe400e47b34a4652f8d14d7371b6916e65401c))
- Carried the GitHub Actions runner marker through the deploy ([b54fffa4f](https://github.com/underpostnet/engine/commit/b54fffa4f7bfe839447dfc44a46a9116b9472c7d))
- Add export RUN_QUIET_CI for github runner ([fd34bf4ec](https://github.com/underpostnet/engine/commit/fd34bf4ec08182295858b8de9ac68d5cd68f2af4))
- Align CD workflow comments with current secrets ([756bac9eb](https://github.com/underpostnet/engine/commit/756bac9ebff054f61430fe85900c858508933d2e))
- Rename the template test workflow to unit and infra ([e1cf38135](https://github.com/underpostnet/engine/commit/e1cf38135dfbdbf7f55a990c68065462afef484d))
- Run the tiered Vitest suites in the test pipelines ([6ea5288e3](https://github.com/underpostnet/engine/commit/6ea5288e3152cf07660c084b8fc5d1062eea6902))

### cli-repository

- Add --propagate-msg resolution to the cmt command ([f3491fec4](https://github.com/underpostnet/engine/commit/f3491fec4e3fcbdc30d5e23c2089df376c508148))
- Add fastForwardEnginePair method ([8db5d2d69](https://github.com/underpostnet/engine/commit/8db5d2d69b6eda6472b86726970bd704c6f20c3a))
- Keep GitHub credentials out of child Git commands ([329d8a177](https://github.com/underpostnet/engine/commit/329d8a177e3aef6caa96c58928e9077c0f63093d))
- Derived the private conf repo from the engine sync pair ([8d8a5b0bc](https://github.com/underpostnet/engine/commit/8d8a5b0bcd08c9d964c0309f8ac1acc43589f9eb))
- Derive the private repo name from the shared factory ([34b5f17e4](https://github.com/underpostnet/engine/commit/34b5f17e4d83fa44dcb3428308fdea095a1dc02c))
- Fix bare clone path removal in repository clone ([b8df8ac25](https://github.com/underpostnet/engine/commit/b8df8ac258e3be61b5535c60d21936f989498398))
- Scope deployment builds to the requested instances ([00aeafa9e](https://github.com/underpostnet/engine/commit/00aeafa9e621b122c5c44dfe1e06f75367fb2f9b))
- Skip backup commit when no changes are pending ([022ef2f3d](https://github.com/underpostnet/engine/commit/022ef2f3db1a34ef20d35169929f80a0bb4cac93))

### package

- Remove clean script ([809f225d7](https://github.com/underpostnet/engine/commit/809f225d78f5e843aaca54d8a5fa06f6e77a3f1c))

### cli-host

- Fix traceback env ([d1fd667d5](https://github.com/underpostnet/engine/commit/d1fd667d56a50fcfa21a70e0a67a29facee81b39))

### build

- FIx host environment entrypoint env scope ([af8bfbee9](https://github.com/underpostnet/engine/commit/af8bfbee90fce1371fa5e325a3eb0c9c53fc3853))

### docs

- Document configuration scopes and node capability boundaries ([4cebdacbe](https://github.com/underpostnet/engine/commit/4cebdacbe6365d1cde9b7ea3f4bbf984acda7212))
- Document the package command and fleet sync flows ([56622044c](https://github.com/underpostnet/engine/commit/56622044c068d7f78f39ae0cd5e1431006487132))
- Regenerate the CLI references for the execution profile and DB flag changes ([604d65eba](https://github.com/underpostnet/engine/commit/604d65ebabc8ceb5b7ae72c73f0230b61cb54c55))
- Documented the node-based connection URIs across the CLI references ([1c0eee0db](https://github.com/underpostnet/engine/commit/1c0eee0dbe4ed35f55118fdd0a317beae9d306e2))
- Documented the CLI domains, staged image builds and fallback capture ([c46dbe4fd](https://github.com/underpostnet/engine/commit/c46dbe4fdf7146c301a6b0d90c93a5c73b7d5b75))
- Document the host, app, and state CLI domains ([d9bc0bc2a](https://github.com/underpostnet/engine/commit/d9bc0bc2a953fd5c27754c00b04c4d45ce79b758))
- Update and normalize dynamic status badges across repositories ([51be9cf00](https://github.com/underpostnet/engine/commit/51be9cf009471f9b0256cc63568b381cb0c23316))
- Add Hybrid-Edge Cloud Distributed Infrastructure Scope document ([80f9040ba](https://github.com/underpostnet/engine/commit/80f9040ba1121efb6d464a9d7bb99676bc81ebe3))
- Add the repository contribution and testing conventions ([9b861e27f](https://github.com/underpostnet/engine/commit/9b861e27f33467c033763c50b71b984afbcf6ba5))
- Document the tiered Vitest runner and the test command ([aba90c472](https://github.com/underpostnet/engine/commit/aba90c472dbdce5b4bd050e755b67eeb0c595644))
- Normalize markdown formatting in observability reference ([8c586e9bb](https://github.com/underpostnet/engine/commit/8c586e9bba47040df9ec5dd6608ad8cb067f2493))
- Update nexodev reference docs for observability and cluster scoped users ([2c0d6259b](https://github.com/underpostnet/engine/commit/2c0d6259bc54593c9b86dfb79b437f332c266d23))

### engine

- Deliver cron environments from scoped projections and injected keys ([b9262c9e8](https://github.com/underpostnet/engine/commit/b9262c9e8c459ed9564c4de4d0d2ae461a426234))
- Gate cluster operations on a node role capability table ([a6c71588e](https://github.com/underpostnet/engine/commit/a6c71588e633006139203c3652dfa28162164cf8))
- Split the host configuration into scoped durable sources ([46bba77b5](https://github.com/underpostnet/engine/commit/46bba77b597fe6725c207601313c315475f69e9e))
- Keep the selected NODE_ENV through the OCI env overlay ([99c738905](https://github.com/underpostnet/engine/commit/99c738905cc7c39be733c4f422e3a46637cc8f17))
- Collapse the start bootstrap into one source pull ([4ee41e393](https://github.com/underpostnet/engine/commit/4ee41e3935093f8d105d75d12cb6da3bd8d41006))
- Harden command logging around credentials ([3899bcba2](https://github.com/underpostnet/engine/commit/3899bcba2bcf0f1596b591341d456dc76a3672f0))
- Bundle the test coverage report into deployed artifacts ([6b7ebaaed](https://github.com/underpostnet/engine/commit/6b7ebaaed83e1b0791f355da442cc1fc40a051b9))
- Serve CronJobs from a labeled engine mirror ([687322acb](https://github.com/underpostnet/engine/commit/687322acb92974ddd9e022086022e12c66429bb0))
- Pin database PVs down to one claim under /data ([97a53cbd6](https://github.com/underpostnet/engine/commit/97a53cbd6325c776beabed0527994a98224b8af1))
- Prepare container storage for host-mounted volumes ([3b5470a3d](https://github.com/underpostnet/engine/commit/3b5470a3d96b0755ea901b7afff08274bf426ca4))
- Add deploy package manifest generation and the package CLI ([3ec0b5265](https://github.com/underpostnet/engine/commit/3ec0b526512547e5ee3f8a87ca936dea445476f8))
- Add execution profiles and the offline command gate ([4e9b80d67](https://github.com/underpostnet/engine/commit/4e9b80d679e0a71920c53aea653f729cdaaeabd6))
- Dropped the stale baked-CLI comments from the runtime Dockerfiles ([26a328fbb](https://github.com/underpostnet/engine/commit/26a328fbb56df0af4eef0f9002385dcb0a88315c))
- Guarded the optional cron conf mirror in the private repo sync ([b7e987f18](https://github.com/underpostnet/engine/commit/b7e987f18415e95c03973e519a6832500f8c1a0b))
- Awaited the deployment build steps so the status endpoint stays live ([6190fda26](https://github.com/underpostnet/engine/commit/6190fda26885269e209302891089d821dddc1db7))
- Captured the in-memory fallback world as a persisted instance ([971ff629a](https://github.com/underpostnet/engine/commit/971ff629a8830da644bf7edf7d0121c5230b7e38))
- Baked the runtime CLI into the images from a staged archive ([ca46e5f5f](https://github.com/underpostnet/engine/commit/ca46e5f5f7f2d8a69cf40d36d57e3631d1d3cd92))
- Add OCI runtime env  overlay context ([8c625e42d](https://github.com/underpostnet/engine/commit/8c625e42d593ea043270e557f18de0b1f2bdfb69))
- Move container runtime status into a dedicated state store ([b331c4ea7](https://github.com/underpostnet/engine/commit/b331c4ea78525d66517bf89f3b9cd3eb1a4fbd52))
- Drop stale API documentation comment headers ([77b82ee74](https://github.com/underpostnet/engine/commit/77b82ee74b1dd85f2fa1fc1ce2acb34d3bd9834d))
- Ignore the .underpost directory in Docker builds ([148d07a59](https://github.com/underpostnet/engine/commit/148d07a593d6897db423b543c4d0bafc13a9e5c5))
- Rebuild the template before each deploy id assembly ([39b09cd0f](https://github.com/underpostnet/engine/commit/39b09cd0ffa62fc0702c0e2ef7705080c26ffb11))
- Guard the template checkout and prune stale sources on build ([1034ca412](https://github.com/underpostnet/engine/commit/1034ca412c467eb81a44059b72fa791554ab5ece))
- Move Valkey adapter to database layer ([cce8cdb20](https://github.com/underpostnet/engine/commit/cce8cdb20553688e5ae7781ac15c25969668c889))
- Organize server modules by domain ([4178f40b4](https://github.com/underpostnet/engine/commit/4178f40b4bdd81a34fb96677ed7282a562ee4759))
- Build product manifests declaratively ([27c228299](https://github.com/underpostnet/engine/commit/27c228299037aca19aa7c9cccdda38c9f8484e5d))
- Ignore the local environment and test report directories ([231eb84f1](https://github.com/underpostnet/engine/commit/231eb84f1c316aae440a638436fbae9a62b84aa8))
- Harden server framing and CSP security headers ([cb5f7a005](https://github.com/underpostnet/engine/commit/cb5f7a0058f77fc0ccc8fe709525262f6a2da3d1))
- Resolve repository identity in shared server and client modules ([1bd92d6d8](https://github.com/underpostnet/engine/commit/1bd92d6d8fba75a386a0290bae3bcbb0f7fb58cb))
- Extract systemd probe helpers and redact shell credentials ([211ae10cc](https://github.com/underpostnet/engine/commit/211ae10ccb305b7783222f5c2631aaf346f4e957))
- Extract deploy route registry into dedicated router module ([4bd7bd3a7](https://github.com/underpostnet/engine/commit/4bd7bd3a73866a704df00d96fa2de811a78b71b2))
- Verify nftables egress block chains and policies ([4168f699d](https://github.com/underpostnet/engine/commit/4168f699d6c5edb5227bed6a78bf5057ca729b31))
- Harden database backup pipeline with exec-readiness gates and bounded retries ([0ed2917b8](https://github.com/underpostnet/engine/commit/0ed2917b83512b1c2c5ff06d8c49c0d7d07bcc25))

### cli

- Report the underpost reroute at info level ([b9c798b4b](https://github.com/underpostnet/engine/commit/b9c798b4b293d82bd0aa2cb9ea7334f0dbd87cbf))
- Add a build-only mode to the sync-cluster command ([8d3ce9879](https://github.com/underpostnet/engine/commit/8d3ce98799b3b5704f29842562728459f11e46b5))
- Mirror generated deployment manifests into the project tree ([225da8bc9](https://github.com/underpostnet/engine/commit/225da8bc982bf3a9e612e420f6353ad2e3b6a268))
- Keep the node sync off the machine it runs from ([4fbb9376a](https://github.com/underpostnet/engine/commit/4fbb9376a27dc016f9ad0bc87d1609a020ebf268))
- Pin re-entrant commands to executing package location ([151ce5a10](https://github.com/underpostnet/engine/commit/151ce5a10016fa50f87e73425d9cfabaaf75d54d))
- Centralize underpost resolution and drop the stale DB pod-ensure flag ([3c1b61866](https://github.com/underpostnet/engine/commit/3c1b618660344ed4b3f355b42ec8d479788ee15c))
- Streamed the state domain as a live pod table with runtime telemetry ([a6a25a24d](https://github.com/underpostnet/engine/commit/a6a25a24dc9bb77f9e32d32c085799d63e5648f7))
- Added a net-tables diagnostic run workflow ([191febeef](https://github.com/underpostnet/engine/commit/191febeefb69b7f8fed62d3c72d6b571cad3d12a))
- Applied the per-deployment OCI env overlay before manifest builds ([b39768b99](https://github.com/underpostnet/engine/commit/b39768b9910a89d7526367df819cbfdec9b8cb6e))
- Resolved connection URIs by node name through the edge targets ([9bb6285ff](https://github.com/underpostnet/engine/commit/9bb6285ffdc40a1cc8f3ecd9556ed6eb1e3dbdd1))
- Carried the sub-configuration through the client build ([951eb9740](https://github.com/underpostnet/engine/commit/951eb974013afefa30dbfaa76d2a022c68caf111))
- Reworked the state command into a runtime status domain ([0a6c55a99](https://github.com/underpostnet/engine/commit/0a6c55a99a0cf2ef166079b18c2a659d43b9ec39))
- Folded the env and config commands into the host configuration store ([1acb5babf](https://github.com/underpostnet/engine/commit/1acb5babf89dd81344e332c6a0b64100ba4077f2))
- Report caught CLI errors to stderr instead of stdout ([205fe6fea](https://github.com/underpostnet/engine/commit/205fe6fea47de31623499ce534b9eb2ea080bafa))
- Add host, app, and state domains migrating the config commands ([1ef280b3f](https://github.com/underpostnet/engine/commit/1ef280b3f8e1a80eed7cb2fb2bbbceca8500f4b7))
- Remove test CLI module and prune client assets ([36750f961](https://github.com/underpostnet/engine/commit/36750f9617921f65c8c332b5f887c7ce3f0c5754))

### scripts

- Restrict node setup to RHEL hosts with a system Node ([e8f4a13b2](https://github.com/underpostnet/engine/commit/e8f4a13b272bb6f7850464517b9726056e3cbf00))
- Targeted instance flags in the test deploy monitor ([5dcbeb0d8](https://github.com/underpostnet/engine/commit/5dcbeb0d83e9100c4cf2f2622b6c877a18a8421a))
- Remove the stale local underpost CLI link script ([c3c1d2b46](https://github.com/underpostnet/engine/commit/c3c1d2b46390de536c4407d4561e0cba4dbd5877))
- Add graceful node shutdown and auto-restore script ([3a5958c00](https://github.com/underpostnet/engine/commit/3a5958c00527954fc693fed6ac6651010eef8024))
- Update event monitor script with wireguard and envoy logs ([14c83ec68](https://github.com/underpostnet/engine/commit/14c83ec68c0b5e93a1f936273bed0aa055faf038))

### cli-secrets

- Rotate the GitHub token and seed cron env secrets ([441b81a3f](https://github.com/underpostnet/engine/commit/441b81a3f97849b15c7bc69fb6be9f57ca3ab75e))
- Rework the secret CLI around the shared domain actions ([afa84003d](https://github.com/underpostnet/engine/commit/afa84003d7c15723b9d7eec133f438489dd102e5))
- Publish underpost-config only through the secret layer ([588af5f06](https://github.com/underpostnet/engine/commit/588af5f0693d251d65a499efb06b21966e0efeb1))
- Add SOPS setup and status onboarding commands ([ceb717e2b](https://github.com/underpostnet/engine/commit/ceb717e2b3e220ee0d362fd41ab7197532b0e9bc))

### event

- Report why a dispatcher Node binary is rejected ([b615b9a80](https://github.com/underpostnet/engine/commit/b615b9a80eea70f2bcbf1d65982b2b9edbd541c0))
- Report unreadable cluster as unknown in deployed event state ([e184e6c2e](https://github.com/underpostnet/engine/commit/e184e6c2ecafc7d937063de4ca48a9004a3cfcb5))

### cli-wireguard

- Reconcile per-node-role services on fleet sync ([bc03d54c8](https://github.com/underpostnet/engine/commit/bc03d54c894531d61edb0d51b92a74f074c85032))
- Add restart dispatcher on wireguard sync and update ingress recovery wait in  ENGINE_SYNC_STEPS scripts steps ([74936a404](https://github.com/underpostnet/engine/commit/74936a404719e4469b54878117c77223284a309d))
- Refactor edge state into deployment topology ([0b457088d](https://github.com/underpostnet/engine/commit/0b457088d9eaf1eaaa894367f8b4d124a5078cb8))
- Report peer public keys and unregistered identities in status ([10ef0d140](https://github.com/underpostnet/engine/commit/10ef0d14097f8e25bce18427316b0dcc593d4c07))

### deploy

- Add per-deploy package scripts and shared host preparation ([076388a72](https://github.com/underpostnet/engine/commit/076388a72b4965d8443ae521fc60c5d9d20ba189))
- FIx deploy npm install order ([665c37f16](https://github.com/underpostnet/engine/commit/665c37f1636313fb9bae355995261bd9454db9ce))
- FIx treat missing target-colour deployment as normal blue/green state ([aa3097210](https://github.com/underpostnet/engine/commit/aa3097210d98c31ee5e086987ab8b6d10fff1a4e))
- Add the optional per-deployment env secret overlay to the dev manifests ([a830b0213](https://github.com/underpostnet/engine/commit/a830b0213fea2fd9d3321831d72f0dfa24e5c280))
- Streamed the runtime state and stamped the bootstrap container status ([89a45ad30](https://github.com/underpostnet/engine/commit/89a45ad3088f201289ce7f7bf090e71b478ead3e))
- Renamed the deploy logging library to the GitHub Actions variant ([10bce1a4a](https://github.com/underpostnet/engine/commit/10bce1a4a83d23a5ab6df20b60c6bb56d871309e))
- All in invocations now use one flag per \-continued line ([cb3adbec0](https://github.com/underpostnet/engine/commit/cb3adbec093468be5ab530eadca17a0b641cabba))
- Converted the deploy scripts to the shared deploy-step log contract ([de350d199](https://github.com/underpostnet/engine/commit/de350d1999ebd52eb5c132f5e05e2d5d12f49900))
- Add CD Node Source Pull pipeline logic ([7f20ea0d5](https://github.com/underpostnet/engine/commit/7f20ea0d578261d59c25d195b1012b32aeac0adb))
- Fix cyberia deployment entry point script with cli surface scope ([ed16da715](https://github.com/underpostnet/engine/commit/ed16da7150760d41b9dfd040dd7835fa78e46ebf))
- Consolidate host prep and update pod start commands ([104ac9c38](https://github.com/underpostnet/engine/commit/104ac9c3829a539f814b27bfa2f396de48f1df89))
- Add a dd-core remote sync and deploy helper script ([736fe2ec9](https://github.com/underpostnet/engine/commit/736fe2ec968b352b7ab3c2d809026e0519762c91))
- Resolve the deployment environment from --env and --dev flags ([1e04b3e00](https://github.com/underpostnet/engine/commit/1e04b3e0095118e414cb902d85280f1044aca825))
- Rename run secret command to secret --from-cron-env in deploy scripts ([101c77526](https://github.com/underpostnet/engine/commit/101c77526e0ad8a92ed0c8d0abde640720da3710))

### cyberia-cli

- Add related instance deploy paths in cyberia catalog ([dec9e1175](https://github.com/underpostnet/engine/commit/dec9e11751715b688d744f4c59804ec51ba3cf7b))

### client-core

- Fix Resolve Swagger UI 404 and incorrect API target in specs ([aa6ba8606](https://github.com/underpostnet/engine/commit/aa6ba8606df8f272604e08759363577d04cfdd0d))

### client

- Fix typo SSRComponent ([e92751afe](https://github.com/underpostnet/engine/commit/e92751afeef08acb37713fc34e9ea3c91e00245e))
- Served the fullcalendar global build bundle ([164cb0706](https://github.com/underpostnet/engine/commit/164cb07064b4eb792c587a636fe672a8d452cb1a))
- Rename FullScreen.js to ViewModeController.js ([35e250bd3](https://github.com/underpostnet/engine/commit/35e250bd35a510f99e93062265f3a65055997157))
- Drop dead code from the wallet, file explorer and nexodev shell ([9b4ec76dc](https://github.com/underpostnet/engine/commit/9b4ec76dce5ff10a87c827dda7528c7ae622176d))
- Refresh the service worker and its cache policy ([e0a270b35](https://github.com/underpostnet/engine/commit/e0a270b353be5ef8718e52b6f1bafbef217abb2c))
- Rework the calendar, docs and translation surfaces ([511afcc5e](https://github.com/underpostnet/engine/commit/511afcc5ed3d84e32e631f72a15befa82c049a1c))

### cli-cyberia

- Resolve underpost invocations through the shared CLI resolver ([04989793e](https://github.com/underpostnet/engine/commit/04989793ed09f4f099a6855ffad28ee8f8e04472))

### lampp

- Implement shared provisioning contract repositories ([1730cced3](https://github.com/underpostnet/engine/commit/1730cced3585a19ef25b07f127d1b022f57e34ee))

### monitoring

- Refactor binary availability metrics to state timeline and stat panels ([ae1f39223](https://github.com/underpostnet/engine/commit/ae1f39223abe8c8bc7be6745fc60c770d174fc4a))
- Document node exporter provisioning and role relabeling in observability docs ([de8a72b56](https://github.com/underpostnet/engine/commit/de8a72b5677d69727289bd8ef1e6d35cec82628c))
- Provision node exporter on hubs and relabel node roles in dashboards ([7454ec408](https://github.com/underpostnet/engine/commit/7454ec4082ac5a43329b069f112f21bd1da392d0))
- Add Node Metrics dashboard, Node Exporter, and 5 cluster threshold alerts ([40c3d6e71](https://github.com/underpostnet/engine/commit/40c3d6e71a9877b63c0f276a4e646937f5ee5b9c))

### conf

- Restore dev API config generation and CORS origin mapping ([afaebcf16](https://github.com/underpostnet/engine/commit/afaebcf16cbd498a4b0bf57c3e58e9ec9b8b043d))

### server-start

- Hand off the build through a linked underpost CLI ([42ae75c08](https://github.com/underpostnet/engine/commit/42ae75c08f917dbfd696431c08f5f299139dc24c))

### cli-client

- Extract the client build into a dedicated CLI module ([86c38d8a2](https://github.com/underpostnet/engine/commit/86c38d8a2e53d09dda5e444713d7df7b42557f03))

### cli-cron

- Fix vultr cronjob mounts collector host path ([c674e1114](https://github.com/underpostnet/engine/commit/c674e1114832e19ea48e37c47f56fbd2f187ac33))

### release

- Add bump version pattern target ([52c30bf82](https://github.com/underpostnet/engine/commit/52c30bf82bc8316ed12080a730f5cb97cbf90a3d))

### engine-cyberia

- Align the cyberia module with the tiered test runner ([4ad1a9ea5](https://github.com/underpostnet/engine/commit/4ad1a9ea5d91cfd2e206195525e891e7b44f204a))
- Update sharp dependencie to sharp v0.35.3 ([44b5df725](https://github.com/underpostnet/engine/commit/44b5df72535891cb589fac8098c52e6bd87e8eef))

### server-conf

- Default missing conf files and gate dev subconfigs to development ([612d52577](https://github.com/underpostnet/engine/commit/612d52577f7de156bc67125b812a3469e6024e52))

### cli-run

- Show probe count in get-traffic index column ([efd2adc25](https://github.com/underpostnet/engine/commit/efd2adc25da7e2623213a169a3dda5442047b360))
- Add index column `#` as the first column of the get-traffic host table in run.js ([3540071e4](https://github.com/underpostnet/engine/commit/3540071e4038614156d279c3edb3b6b096aed9f8))

### cli-new

- Add clusterDeployFactory method to generate  base cluster deploy folder engine-private/deploy ([8f2a070bf](https://github.com/underpostnet/engine/commit/8f2a070bfdfd863e1cb2f181ece00923718ae4d0))

### pwa-microservices-template

- Add default template assets including favicons, splash screens, and PWA manifest ([f7ab699f2](https://github.com/underpostnet/engine/commit/f7ab699f2f69dabe5009d431cb5c0f00761352fc))

### cluster

- Converge observability stack and provision secrets from cron env ([944fb9882](https://github.com/underpostnet/engine/commit/944fb98820d6810214ca9d4495ec3a67e059d2d3))

### cli-dns

- Add ingress port block and unblock workflows ([28ee09f93](https://github.com/underpostnet/engine/commit/28ee09f936d3c036fbe5e5539a2a8ab9735a1b19))

### cli-ssh

- Make SSH users cluster scoped with shared registry ([ba35a2c4d](https://github.com/underpostnet/engine/commit/ba35a2c4dc04629ac7638b9e1709ffabed460081))

### monitor

- Add cluster observability stack and operational event dispatcher ([4fd2097d0](https://github.com/underpostnet/engine/commit/4fd2097d0ca0130f19770162bba3e54f21666fe3))

### cron

- Fix resolved deployId list related job defualt in cron main callback method ([4d88f472a](https://github.com/underpostnet/engine/commit/4d88f472aa190a15c7ff47734bf74df1738a295f))

## New release v:3.3.0 (2026-08-18)

### github-actions

- Add workflow_dispatch trigger event handling in .github/workflows/ghpkg.ci.yml ([e21320cf7](https://github.com/underpostnet/engine/commit/e21320cf7542680823758f331bd34d619ca185cd))
- Reorder coverall test list ([eb20336b2](https://github.com/underpostnet/engine/commit/eb20336b29e87f4371528f78099768e8ee36b586))
- Replace default npm coverall test with scripts/coverall-test.sh ([3471f3009](https://github.com/underpostnet/engine/commit/3471f3009391a3f8a1a66cedd1e4761fe5f76712))
- Refactor move CD workflow commands into deployment scripts with run_quiet wrapper ([222a18d71](https://github.com/underpostnet/engine/commit/222a18d719f33fd678a72f9b05639f86ec4037cd))
- Update .github/workflows/engine-test.cd.yml ([94e42e58e](https://github.com/underpostnet/engine/commit/94e42e58ee4f9eb6542a010e96899000458f3a7b))
- Add import-default-items steps to cyberia CD ([350444f9f](https://github.com/underpostnet/engine/commit/350444f9fb4b34cd15541458c1897299fed7b287))
- Update.github/workflows/engine-cyberia.cd.yml ([53e9da171](https://github.com/underpostnet/engine/commit/53e9da17127a850aebaa0e5e0e90b593ee0ac03d))
- Update base node in engine-core CD pipeline ([fa039f257](https://github.com/underpostnet/engine/commit/fa039f25763bb719496b73dd8044af4570be859e))

### cli-cyberia

- Include deploy strategies in generated projects ([66bc733eb](https://github.com/underpostnet/engine/commit/66bc733eb22bd74aff5ff249dade0959c876cdae))
- Refactor make data.item.id is now a unique index for every case ([1391efce3](https://github.com/underpostnet/engine/commit/1391efce32f96f56271a1060304bb7b26556b80d))
- Add WebSocket load test runner command ([eebec67ed](https://github.com/underpostnet/engine/commit/eebec67edd1bfda0bf6f8205305a90cd73441e4c))

### engine

- Expand server module JSDoc annotations ([213a55191](https://github.com/underpostnet/engine/commit/213a55191dc388d227315f07116148d5b731b883))
- Move writeEnv helper into environment module ([9c57e3629](https://github.com/underpostnet/engine/commit/9c57e3629a682da0c7aa45e0cb24d24d3af3cdab))
- Fix SELinux host paths mounts logic and definition ([6cf8dda11](https://github.com/underpostnet/engine/commit/6cf8dda113b92fea011e3825035147ae33a1bc7f))
- Extract environment and cron deploy helpers into dedicated modules ([6ba3fa4c3](https://github.com/underpostnet/engine/commit/6ba3fa4c372a2eb1afe87c6fc5c0681209a96b07))
- Enforce SELinux across cluster, SSH, and provisioning ([9d57a359d](https://github.com/underpostnet/engine/commit/9d57a359dd94067dfb48fceab9006e3ef3d7d502))

### cli-wireguard

- Add SSH forwarding via VPS edge ([54de1e6e5](https://github.com/underpostnet/engine/commit/54de1e6e5dddccad5c056da152cb32712ab3ba25))
- Extract forward proxy and systemd helpers into server modules ([97be08d10](https://github.com/underpostnet/engine/commit/97be08d107e825c2ff5a97382ebb9367a6ad3523))
- Implement HTTP/CONNECT forward proxy for WireGuard ([a95163df2](https://github.com/underpostnet/engine/commit/a95163df2797bbfa86d3d1f422fe0afd224b72b3))
- Implement idempotent in Restart, reconnect, and reset pipeline ([65710c3bd](https://github.com/underpostnet/engine/commit/65710c3bd3056b1f2cc49e3b82517d081f7f25df))
- Implement Edge Hub WireGuard and HAProxy CLI module ([2e293b875](https://github.com/underpostnet/engine/commit/2e293b87540a43489bb535e2ab731581809b1848))

### catalog-cyberia

- Add coverall cyberia trigger script ([c8e59eed0](https://github.com/underpostnet/engine/commit/c8e59eed08c113d39a99f5151d8d6b4af96fb4e9))

### scripts

- Mark scripts as executable ([8f04cbc70](https://github.com/underpostnet/engine/commit/8f04cbc700e2bc17b917ea49450efabc766e27ed))

### release

- Fix missing file bump version scopes ([4aa983a5d](https://github.com/underpostnet/engine/commit/4aa983a5d8aea7983295ee01799c358ed1b9c2bc))

### deploy

- Mark deploy scripts as executable ([b18151bfa](https://github.com/underpostnet/engine/commit/b18151bfaa52c17b2540e0a2706b79a8850fee84))

### hardhat

- Update hardhat npm module version to sync current project scope v3.2.90 ([8fc717b99](https://github.com/underpostnet/engine/commit/8fc717b9913c69a41c2c9e88b2b7f720a4a7cb09))
- Update undici override dependency to v6.28.0 ([fb2d2aa3b](https://github.com/underpostnet/engine/commit/fb2d2aa3b502b5552212f63d9a01f23d2333b296))

### dependabot

- Disable typescript autoupdate ([8bd761833](https://github.com/underpostnet/engine/commit/8bd7618336423a1df1d4ca77cd138aef51902d6c))

### cli-client

- Add only ssr build workload flag option and logic ([92026a66e](https://github.com/underpostnet/engine/commit/92026a66ec3c403219af62bfc5bcc78917d537ed))

### cli-cron

- Fix cron CLI setup flag and single job execution ([84eab73d9](https://github.com/underpostnet/engine/commit/84eab73d9a618244b46e699ba65b469940d1a267))

### cli-repository

- Add getDefaultBranch resolve in switchRemote method ([04bc8743b](https://github.com/underpostnet/engine/commit/04bc8743b6f4c5f9edd891276137183fa444d447))

### cli-ssh

- Add initializeDefaultSshConfig method ([84f5f8698](https://github.com/underpostnet/engine/commit/84f5f8698810596f084e632487208ea909feddfd))

### cli-vultr

- Add Vultr Bandwidth Monitor cron job CLI Module ([22fb9249a](https://github.com/underpostnet/engine/commit/22fb9249ad40ba24a8cd87da43d742b1972c4fbb))

### cli-dns

- Add blokc/unblock ingress/egress workflow handling ([980fab35a](https://github.com/underpostnet/engine/commit/980fab35aba6a279b94701550edfd765c8b422a2))

### underpost-ingress

- Enable response compression in ingress and gateway ([7763f9da2](https://github.com/underpostnet/engine/commit/7763f9da2b81128042cef2a73ca5570938dcd3f5))

### test

- Fix missing pngjs import in object-layer test pipeline ([20c1f24d8](https://github.com/underpostnet/engine/commit/20c1f24d865d5cdeb70a365c93f8c797c28fe960))
- Add WebSocket load test for cyberia-server ([e3ff27772](https://github.com/underpostnet/engine/commit/e3ff277725e33dace3ed3268e6f60299ea146f59))

### engine-cyberia

- Remove eiri from entity default inventory ([e8f8d03c7](https://github.com/underpostnet/engine/commit/e8f8d03c7e326fac012722f659def7d7a7da882c))
- Add fallback world default items staging and hot reload ([e646c430d](https://github.com/underpostnet/engine/commit/e646c430d72ea7a319cf1640bd4c7505cbb40b87))
- Add playerBaseSpeed field to instance config defaults ([7cdbd23d2](https://github.com/underpostnet/engine/commit/7cdbd23d255bb47e253e60f7ec0cc6c3600d5678))
- Add WebSocket connection limit env to cyberia-server ([c6f834c7d](https://github.com/underpostnet/engine/commit/c6f834c7dc7bcae24d4f493a005cdb2d1b76a73d))

### client-cyberia

- Add Fallback World Engine editor view ([cf61dfe8e](https://github.com/underpostnet/engine/commit/cf61dfe8e7eec7556f5bd07e445d6759d9b432e4))
- Implement IPFS cid filters in ObjectLayerEngineViewer component ([93eb69928](https://github.com/underpostnet/engine/commit/93eb69928bf8ea6915f70b1ca4307fa582cc17b6))

### docs

- Document moveAck reconciliation and move coalescing in Cyberia replication ([24b14ca4e](https://github.com/underpostnet/engine/commit/24b14ca4ee4c9ef0ce4dc9e3135e4990ed0a8274))

## New release v:3.2.90 (2026-08-11)

### cli-run

- Add version parameter in cluster runner cmd lines ([bd909bc04](https://github.com/underpostnet/engine/commit/bd909bc046f77f5c36d601116d2f94291ca6aa0a))
- Handle multi-recipient keys in sops runners ([92ecdc151](https://github.com/underpostnet/engine/commit/92ecdc1518d645faa913d0897288a5f6e27e075d))
- Trim ipfs expose to core host ports ([dc473d4fa](https://github.com/underpostnet/engine/commit/dc473d4faa1221f0102ce88ee6fff866941d0f3b))
- Add sops setup and status runners ([a29fd3947](https://github.com/underpostnet/engine/commit/a29fd3947637ca64398040deaea30d0fab624263))
- Fix sub path handling probes in get-traffic runner ([b65d0fe4e](https://github.com/underpostnet/engine/commit/b65d0fe4e73b370a627efbb8b2e23386deff7f74))
- Add restore mongo statefulset runner ([e9e1b224b](https://github.com/underpostnet/engine/commit/e9e1b224b964a713f5d6aedbf05d11b41e15a98c))
- In get-traffic runner retains every configured host row matching the input ([a16542254](https://github.com/underpostnet/engine/commit/a16542254c92f9d1564a9a817b990ecbe061459d))
- Rework get-traffic runner with CURRENT and OPPOSITE color state deployment ([34e4a7234](https://github.com/underpostnet/engine/commit/34e4a7234784dec5ac6af20bd785a830f9f238bf))
- Rework expose runner to port list options ([b6fe9cfe4](https://github.com/underpostnet/engine/commit/b6fe9cfe46e07cf8776157e66d6006341902b616))
- Add status and expose runners ([0d383e7d9](https://github.com/underpostnet/engine/commit/0d383e7d9a6bdbc062060635c279821e559a6473))
- Drop redundant rollout restart after node-move patch ([b5399b134](https://github.com/underpostnet/engine/commit/b5399b1342b6c3932b065eb4d6c6b01f7f361e10))
- Load project instance env builder by convention ([8b226d073](https://github.com/underpostnet/engine/commit/8b226d07367e1f5e7a93ffc3ced17c0ebd953f99))
- Route instances through stable traffic Service ([65c674e05](https://github.com/underpostnet/engine/commit/65c674e05c280bba50e6ab6c6bfdda0480e72d67))
- Refactor stop runner logic introduce stopPlanFactory method ([aa972f120](https://github.com/underpostnet/engine/commit/aa972f12008ceb49e3ee3cd053f47b525c344fbd))
- Remove direct ssh remote  runners ([79ecee892](https://github.com/underpostnet/engine/commit/79ecee8926e4ccf63f1d8a8fc023e359e750072f))
- Integrate underpost gateway into run ([ce02c3282](https://github.com/underpostnet/engine/commit/ce02c3282721f02d89e6af76380ace95a8bfa424))
- Add Gateway API HTTPRoute rules for instance runners ([c85c48e43](https://github.com/underpostnet/engine/commit/c85c48e434c65437bb9704a019c4945c1620e317))

### test-secrets

- Fix rotate and apply manifest test workflow ([5f0be40c5](https://github.com/underpostnet/engine/commit/5f0be40c51440bf6496a7da66a5d9edb78d6de0d))

### hardhat

- Update transitive dependencies ([59f18f31b](https://github.com/underpostnet/engine/commit/59f18f31bd2490904c4ead85ca8a0dd9d50d1459))

### engine-cyberia

- Implement storageSlots capability workload in fallback world ([c6bceef0b](https://github.com/underpostnet/engine/commit/c6bceef0b6d8c4d64e8f02f87ed2fb20abf3e287))
- Implement storageSlots capability workload in fallback world ([e5f4d1c9a](https://github.com/underpostnet/engine/commit/e5f4d1c9a979f87d53cbc9c7ddef4dd2d6e747e3))
- Add assembler craft recipes to cyberia action system ([c50724523](https://github.com/underpostnet/engine/commit/c5072452309a51882283568650098eebf87620ff))
- Add vendor shop catalog to cyberia action system ([748533a0c](https://github.com/underpostnet/engine/commit/748533a0c68e57c25f9f9c5844fc27f545c2cae6))
- Preserve variant base path through ingress ([3daa9a181](https://github.com/underpostnet/engine/commit/3daa9a18190f41bef20b9a590b04ae51f150a7fc))
- Normalize instance topology and dispatch env builders ([cd0309ae4](https://github.com/underpostnet/engine/commit/cd0309ae425c59c957eed5357cabdbc27ad3ffe6))
- Refactor gateway static to underpost gateway ([9f35a007d](https://github.com/underpostnet/engine/commit/9f35a007d5cf444f4d84c7eccf446d46b4208e0f))
- Fix minor besu genesis generator update ([6680d5a16](https://github.com/underpostnet/engine/commit/6680d5a16b9936c6995812b3b9f99415d72636c0))
- Fix sum stat response in fall back world static instance map endpoint ([84ea1e4ca](https://github.com/underpostnet/engine/commit/84ea1e4ca39bf8046736703951857ba3f91b6965))
- Add seeded random source for deterministic fallback world generation ([747411872](https://github.com/underpostnet/engine/commit/7474118721a446a53077a2a4aa243eefc95abb96))

### dependencies

- Update transitive dependencies ([9c12f8fde](https://github.com/underpostnet/engine/commit/9c12f8fde0739131fa9dc42ccf142e7351ab4295))

### github-actions

- Set dd-cyberia env before build manifest ([3ec1c8e46](https://github.com/underpostnet/engine/commit/3ec1c8e46bca4d31097f7d80b62c7276ef5974bd))
- Update build and deployment manifests ([b8aad9359](https://github.com/underpostnet/engine/commit/b8aad9359dafaf0c6aea08b6e9925e3b0425592f))
- Wait for underpost-gateway rollout ([57fc7c22f](https://github.com/underpostnet/engine/commit/57fc7c22ff1bbc4f45f042e11d86d73348746915))
- Update engine-test CD deploy workflow ([712cc9e17](https://github.com/underpostnet/engine/commit/712cc9e17a581ed20a27923b169405824f05e759))
- Update build and deployment manifests ([149653332](https://github.com/underpostnet/engine/commit/149653332980e66ab8d49f9bc496f5b32f89c211))
- Update engine-cyberia docker-compose build and deployment manifests ([8dcb10ab2](https://github.com/underpostnet/engine/commit/8dcb10ab22c7942d51fa6b94d5a1d09b62fc1930))
- Update engine-cyberia docker-compose build and deployment manifests ([1cf4f753f](https://github.com/underpostnet/engine/commit/1cf4f753f899fa995b5b25aba74792f39da6055f))
- Update build and deployment manifests ([ba4f4a173](https://github.com/underpostnet/engine/commit/ba4f4a17321771873f04f2782ff43bce9811bd9e))
- Update build and deployment manifests ([9874b895d](https://github.com/underpostnet/engine/commit/9874b895df5f4904b6b5ab6c016a6f8487e24ef9))
- Update build and deployment manifests ([c3a4ec9f1](https://github.com/underpostnet/engine/commit/c3a4ec9f154be351d4fffec78d31f55b8119ba94))
- Update build and deployment manifests ([a8bdbf050](https://github.com/underpostnet/engine/commit/a8bdbf0503e437237750bb1257c50aca9b92bfe5))
- Update engine-cyberia CD add prebuild manifest workflow ([a1f4954f7](https://github.com/underpostnet/engine/commit/a1f4954f7accfdcf354afcf2c602960bedeca1c5))
- Fix 404 page location in cyber ua-client docker image workflow ([b52bdf89e](https://github.com/underpostnet/engine/commit/b52bdf89e50597bb03f325e6f1bec127005af406))
- Disable publish branch and sha docker images versions ([12a37a468](https://github.com/underpostnet/engine/commit/12a37a468a39083e07c13406d1882905eb3d05da))

### test

- Cover store adoption and recipient registration ([e570d6472](https://github.com/underpostnet/engine/commit/e570d6472c2f9e87613d109bc88ddabb2acefd38))
- Cover sops encrypted secret store ([7c41910bd](https://github.com/underpostnet/engine/commit/7c41910bd48d4ddbee5ff1698fd678e9c03f0606))
- Cover expose and curl status chain ([c19471ae2](https://github.com/underpostnet/engine/commit/c19471ae2dc3c38df89a911708679ed12cb13812))
- Add deployment node placement tests ([390e0aa7d](https://github.com/underpostnet/engine/commit/390e0aa7d0b05e4410d7c62da2990bac3546bb29))
- Fix test/cluster-instances.test.js ([481740db8](https://github.com/underpostnet/engine/commit/481740db8cd24108bc4a599180626d8e3f23c118))
- Remove buildCyberiaMmoInstanceEnv tests in test/cluster-instances.test.js ([46afd8aed](https://github.com/underpostnet/engine/commit/46afd8aed83a023cbc8e3153d7123aee748079e9))

### docs

- Document joining a store created on another host ([25a85b6ce](https://github.com/underpostnet/engine/commit/25a85b6cee4b04dec73016782f61ba9ab7d84e49))
- Document shop transaction flow in action system ([7091a506a](https://github.com/underpostnet/engine/commit/7091a506a644f7c1a8c0a62526ced91ed568af0c))
- Document sops age secret management ([6b538a2f6](https://github.com/underpostnet/engine/commit/6b538a2f6241f47a1ff2e039e8593bddc3328216))
- Document expose port list examples ([f9ba18083](https://github.com/underpostnet/engine/commit/f9ba18083ebd013fa83ef660e5150dbd9934ff03))
- Document run status and expose runners ([bf9a83b42](https://github.com/underpostnet/engine/commit/bf9a83b423834ed7647b5d84ff2bee53b55cd66e))
- Update node-move mechanics for template patch rollout ([fb8d36f89](https://github.com/underpostnet/engine/commit/fb8d36f8974c9f5079a3cce373e0634dbc3bf0e4))

### cli-secret

- Add store adoption pre-flight and recipient registration ([2d634dbbb](https://github.com/underpostnet/engine/commit/2d634dbbb503ec00db3df61a1925a888b8c83288))
- Add managed secrets and repair creation rules ([4661114a0](https://github.com/underpostnet/engine/commit/4661114a03836074ab3cad51559b660a88a55290))
- Add sops age encrypted secret store ([8de77fdd6](https://github.com/underpostnet/engine/commit/8de77fdd6b2e82fcbeabcedba9305bb15f881418))

### server-conf

- Derive remote ports from host ports in expose plan ([45bec1ad9](https://github.com/underpostnet/engine/commit/45bec1ad9735794ad57c672a43e76ac2fc9861d2))
- Add replica count and secure password factories ([83320d061](https://github.com/underpostnet/engine/commit/83320d061b192dc883ab8b6ccadd171989c9659e))
- Add expose port list and plan factories ([928ad8350](https://github.com/underpostnet/engine/commit/928ad8350426a93d0d8c84f0eee7b8730a538d97))
- Add curl status chain factory ([dfeef123b](https://github.com/underpostnet/engine/commit/dfeef123b33253205c70f0a437323179e590a229))
- Support idempotent hosts blocks in etcHostFactory ([aa45f40ac](https://github.com/underpostnet/engine/commit/aa45f40ace07b6508e0f7a09f2de4ba8a82b3bb9))

### ipfs

- Prefer sops store for cluster credentials ([62f402649](https://github.com/underpostnet/engine/commit/62f402649454e5fbb049dde070a3f392d55b1963))

### engine

- Generate per-replica mongo volumes with static storage class ([703b8bbac](https://github.com/underpostnet/engine/commit/703b8bbacc16c73d0fb96586ea71406d8c723afb))

### cli-cluster

- Prefer sops store in cluster secret seeding ([7be50059a](https://github.com/underpostnet/engine/commit/7be50059a724b5fad9cb600cf540e69141dd30da))
- Hot-reload shared ingress host table ([d6328a5e0](https://github.com/underpostnet/engine/commit/d6328a5e06237232f492777eca680cf8afd839f7))
- Add shared underpost ingress front for dual ingress stacks ([041debe99](https://github.com/underpostnet/engine/commit/041debe99e0082412798960ec0be3be3229144c2))
- Update Gateway API versions and integrate underpost gateway ([12eefb86e](https://github.com/underpostnet/engine/commit/12eefb86e6434da8b55a16ffeb28ac267fe62d05))
- Add Gateway API control plane and CRI socket resolution ([97565eea7](https://github.com/underpostnet/engine/commit/97565eea7d4bab91838321a3a96cd058d8496249))

### underpost-gateway

- Fix path replicas handling in deploy pwa workfloads ([702f48e4b](https://github.com/underpostnet/engine/commit/702f48e4b04c1a9b4458361ed0d33f0b72815c08))
- Validate and rollback gateway config on reload failure ([4f7ce8795](https://github.com/underpostnet/engine/commit/4f7ce8795ef2a46a47bd6d0f49fd0a941cadcca8))

### cli-deploy

- Add resolveSchedulableNode method ([c62ee86d0](https://github.com/underpostnet/engine/commit/c62ee86d024e9797f279396d647431a97a399f50))
- Fix merged Gateway listener isolation ([a34f0b936](https://github.com/underpostnet/engine/commit/a34f0b9363a7b16f7d1bf704f27617f7411f2087))
- Remove expose and status options ([e55227eb0](https://github.com/underpostnet/engine/commit/e55227eb0ce75fd308cd72a0f3331a62a08ae0ab))
- Add node placement to deployment manifest ([9487ad169](https://github.com/underpostnet/engine/commit/9487ad169e79c1ed4c2d1eb05b1e36ff46defe8d))
- Add stable traffic Service for blue/green routing ([838d1ec0c](https://github.com/underpostnet/engine/commit/838d1ec0c1d9d2d9ff35c529180593efcf341203))
- Fall back to other ingress stack for traffic colour ([3115cc84b](https://github.com/underpostnet/engine/commit/3115cc84b02aa091927b25ae09de41879bf012d3))
- Fix deploy status workflow logic ([35e1af024](https://github.com/underpostnet/engine/commit/35e1af02484e9d6abeb6f031b33589534fe77665))
- Integrate underpost gateway into deploy ([e95a46d64](https://github.com/underpostnet/engine/commit/e95a46d64897fc92ba2fbb3b5da07c51a0abb729))
- Add gateway.yaml and httproute.yaml to build manifest mirror ([afb7bcf9d](https://github.com/underpostnet/engine/commit/afb7bcf9d8a902d744d6030c72c07d1814f45940))
- Add Gateway API deploy manifests and gateway static utility ([073231ca5](https://github.com/underpostnet/engine/commit/073231ca5a44b860420373035628ad22cc0435d8))

### scripts

- Use run expose in test monitor ([b19c49318](https://github.com/underpostnet/engine/commit/b19c49318728b92a8fcf6f7e50e90b5b0e808b0d))
- Add firewall UDP range for QUIC/HTTP3 to nat-iptables ([3bdacec35](https://github.com/underpostnet/engine/commit/3bdacec350caa1776b418ac44dd3b1e95e259196))

### cli

- Update run and deploy option flags ([0dfb9ce6c](https://github.com/underpostnet/engine/commit/0dfb9ce6cbfef8f5d990a6fa8287902de20500f2))

### underpost-ingress

- Add multi node work load handling ([3dccb3de3](https://github.com/underpostnet/engine/commit/3dccb3de3c9a795096613adcca56389c71291c8b))

### cli-cyberia

- Add testPaths in dev-env runner ([b087f4afd](https://github.com/underpostnet/engine/commit/b087f4afd226a2fefd0cb344a60ac3b945073a40))
- Install Docker host aliases in compose workflows ([a9fb75070](https://github.com/underpostnet/engine/commit/a9fb750709a4e94f9dd299ff7b62784bb728ad2a))

### docker-compose

- Implement project-agnostic docker-compose workflow ([e0d07689c](https://github.com/underpostnet/engine/commit/e0d07689ceb9cf34a930c5f4120d8d5ab05f6ae8))
- Update subpath handling logic ([69fb72fcb](https://github.com/underpostnet/engine/commit/69fb72fcb7f7ac87f67f71314d0580ec6a8052f8))

### bin-deploy

- Fix add --ignore-not-found in 'pw-conf' runner ([2f14d2ab6](https://github.com/underpostnet/engine/commit/2f14d2ab66357eb032266487e2dee5b614d1b697))

### cyberia-docs

- Update docs for gateway and CLI changes ([c064f82ad](https://github.com/underpostnet/engine/commit/c064f82ad3c315fec5ad7cbdd322d577bc311abf))
- Document edge tier architecture and CLI updates ([72760e40e](https://github.com/underpostnet/engine/commit/72760e40eb9ea96999b94b5c7d916a21c04ac8ef))

### cyberia-cli

- Refactor SSH port wait to shared utility ([cdf4c4f92](https://github.com/underpostnet/engine/commit/cdf4c4f922ee7980cf43111db1ef1c81578ad2a3))
- Add status page build and instance project resolution ([b1b0a840e](https://github.com/underpostnet/engine/commit/b1b0a840e5cd7f7edf084bf86323dfdee7d56fd7))
- Fix SSR html views locations path ([1bf2843c8](https://github.com/underpostnet/engine/commit/1bf2843c87607e5b9648f8ec98b35efca5d79b4a))
- Remove redundant logs ([3adba85fe](https://github.com/underpostnet/engine/commit/3adba85fe5199972a8a0cd49f6be005c989f2145))

### cli-image

- Implement crictlCommandFactory in image build ([69d24d668](https://github.com/underpostnet/engine/commit/69d24d66848fc27a2503193f82a31ef84435252f))

### db

- Fix MongoDB replica set orphan recovery and improve bootstrap ([71b5f1a3e](https://github.com/underpostnet/engine/commit/71b5f1a3e032f34c29a9a6b9251aac328c951872))

### cyberia-client

- Fix instance selection play URL for default instance code ([efec4a34e](https://github.com/underpostnet/engine/commit/efec4a34edbfb3aae780a42b02ad64d4d93791a1))

## New release v:3.2.80 (2026-07-23)

### engine-cyberia

- Implement dynamically build cyberia instance package.json full reference ([4127836f0](https://github.com/underpostnet/engine/commit/4127836f0f2cf2d74f1762fb1379921b283c3429))
- Fix missing add cyberia dependency in engine-cyberia docker image ([b3d6c4dec](https://github.com/underpostnet/engine/commit/b3d6c4decc23b72ede1958cd158a82a356f10b70))
- Fix dynamic build instance codes logic ([cb380b335](https://github.com/underpostnet/engine/commit/cb380b3354eaa720ee225c66e17270737616f081))
- Refactor INSTANCE_CODES Dynamic build inputs access docker image workflows ([bf1cb6c74](https://github.com/underpostnet/engine/commit/bf1cb6c7466415982b34176b70050622a6681acf))
- Add map preview PNG rendering and preview route in instance map API ([82150a18a](https://github.com/underpostnet/engine/commit/82150a18ad627f29425cb60aaa08850762f18f69))
- Add multi-instance code support in Dockerfiles with saga copying ([6b902ba86](https://github.com/underpostnet/engine/commit/6b902ba860b235d00b0b69244f9f25c6f589d128))
- Add multi-instance topology and per-variant compose routing ([4336c024c](https://github.com/underpostnet/engine/commit/4336c024cb3f98e394cc06f5bab038a93d9b3e4b))
- Add hot reload endpoint and map preview route ([3c7658911](https://github.com/underpostnet/engine/commit/3c76589115d907a74d42081c753fd7f3bf5be946))
- Add map preview caching for fallback world nodes ([55052ec54](https://github.com/underpostnet/engine/commit/55052ec54119ccb06366dae712f23cd503de91f0))
- Fix demo quests with actions quest related ([c41feae1a](https://github.com/underpostnet/engine/commit/c41feae1a408b7b9ec56abdd29978b0177c44dfa))
- Add REST boot fallback endpoints for gRPC CyberiaDataService ([57b698836](https://github.com/underpostnet/engine/commit/57b6988369a0492c18c2df3155630af5a2e8fbb6))
- Add portalSubtype field and refactor instance map with presence POI system ([fa551a11d](https://github.com/underpostnet/engine/commit/fa551a11dba7cedf18f1cca1bcdb0c11d7a1b57f))
- Add map preview for Instance Map node backgrounds ([849095cf2](https://github.com/underpostnet/engine/commit/849095cf21fc52e7666be102054b7abfd3b7e738))
- Add instance map REST endpoints (static graph + dynamic provider activity) ([dc83f8dc0](https://github.com/underpostnet/engine/commit/dc83f8dc03a1ed4aeea606bc3b2aed746cc09336))
- Update cyberia base lore and introduce Fragmentation concept and refactor  weakness narrative of nova faction ([823d69cc9](https://github.com/underpostnet/engine/commit/823d69cc99fb410e5d4a7161baeff28b4f9f6684))
- Add more demo quests to fallback world ([d0de569bd](https://github.com/underpostnet/engine/commit/d0de569bd2ab987ff7881263f80ab8953ef4f241))
- Increase portalHoldTimeMs default value ([5d8028120](https://github.com/underpostnet/engine/commit/5d802812012c53942f699763dba24948865f4936))

### cli-release

- Add cyberia docker-compose bump version file match ([f3eeefeea](https://github.com/underpostnet/engine/commit/f3eeefeeabe377fe4c5db65e1d2d480841f9d2cd))

### cyberia-client

- Add instance selection view and portal navigation ([9f8ebc5d1](https://github.com/underpostnet/engine/commit/9f8ebc5d147225e0710923392f9b659e20725e60))
- Improve cyberia portal landing ([57dbaed22](https://github.com/underpostnet/engine/commit/57dbaed228b2ae58202729b6ac9d751c0405a93f))
- Add Instance sub-path dashboard prefix handle ([958f65929](https://github.com/underpostnet/engine/commit/958f65929a42084c0d4cf3876d3a4fef1fdc7236))
- Add hot reload UI in instance editor ([ee90a2018](https://github.com/underpostnet/engine/commit/ee90a20180fa8c88f249f3efec0a7fb6258f9e5f))
- Replace stat icons with PNG images in object layer engine ([7f03972ef](https://github.com/underpostnet/engine/commit/7f03972efcae0ce99493cf65ed96333a59616320))
- Add center action button to menu modal ([f70ba2d3c](https://github.com/underpostnet/engine/commit/f70ba2d3cb8022f3f2873f0c36fe1cd792dd29d2))
- Update default fontFamily in SharedDefaultsCyberia module ([868dffa9f](https://github.com/underpostnet/engine/commit/868dffa9f8effb15f694cb8e3f5dd135410243dc))

### cyberia-api

- Add fallback TEST world to instance selection list ([b93f30586](https://github.com/underpostnet/engine/commit/b93f3058694eafc384ac5b50d24093f4a30f6f00))

### github-actions

- Fix cyberia github package publish workflow ([fc1bac41d](https://github.com/underpostnet/engine/commit/fc1bac41daf1029962b71d45e73d32780c3b45a5))
- Fix cyberia-client 404 page build ([a55bcb797](https://github.com/underpostnet/engine/commit/a55bcb797166ecb6d93ccb0ac6814b7b31c6138e))
- Update engine-cyberia.cd.yml clean assets directory ([ce365cf77](https://github.com/underpostnet/engine/commit/ce365cf77c325a69df1d3614332f9f584c6cd0e3))
- Update engine-cyberia CD workflow add pull storage assets ([0ee2404f1](https://github.com/underpostnet/engine/commit/0ee2404f1506ce8f4221602b3c73b4a704a1a44d))
- Fix npm install command in engine-cyberia CD workflow ([7974ab422](https://github.com/underpostnet/engine/commit/7974ab422d64c482a53a745a834b58b3e623d85d))
- Add image-pull-policy Always in cyberia-server and cyberia-client CD pipeline ([a134c5be2](https://github.com/underpostnet/engine/commit/a134c5be23b067e9fcc7ed8589243d341ca9607a))
- Set default variant of underpost engine docker image in release workflow ([f3e47bdc6](https://github.com/underpostnet/engine/commit/f3e47bdc660d1074ab04a48a769e9cbf512eb4f8))

### cli-cyberia

- Add multi-instance sub-path support to hot reload trigger ([f0e0fda7a](https://github.com/underpostnet/engine/commit/f0e0fda7aa23e38466024c0258a17e94386fab9c))
- Add build-cyberia-404 workflow and 404 page ([51d35594f](https://github.com/underpostnet/engine/commit/51d35594f76e15b4385084d3b7a1d696b0faaf8d))
- Add Dynamically resolve instance codes in build-manifest runner ([97997df14](https://github.com/underpostnet/engine/commit/97997df14d16ff485fd30001a54f99cc9227b69b))
- Refactor multi-instance conf structure and respective workflows ([0e607e4c5](https://github.com/underpostnet/engine/commit/0e607e4c5d269fb1048b0ab510e2a90174c4520b))
- Add --reset option to dev-env runner ([77f17140c](https://github.com/underpostnet/engine/commit/77f17140c7399470d700126fd0d5ccd583fa8323))
- Add revert option and multi-instance publish support with default-items asset copy ([0913117af](https://github.com/underpostnet/engine/commit/0913117af06d034387c5958bf73c0e652316e94e))
- Add UNDERPOST_DEPLOY_NODE env for deterministic deploy node resolution ([41bb08ffb](https://github.com/underpostnet/engine/commit/41bb08ffb1e75721962ae2c69414e7adb5266c46))
- Add in import-default-items runner import FOREST dev instance ([d3bf87a1f](https://github.com/underpostnet/engine/commit/d3bf87a1f72ee97b9cc67bc131a21e9169f7eb11))

### client-cyberia

- Redesign server metrics dashboard with pixel-art assets and theme toggle ([563783093](https://github.com/underpostnet/engine/commit/5637830934d1f684c04eddbed2eb01030f3ae28b))
- Update location href of enter button in landing cyberia portal ([1c9efd550](https://github.com/underpostnet/engine/commit/1c9efd5505a161c2de83b77dac16f6a81065263a))
- Improve cyberia portal landing with new hero section ([024d76b62](https://github.com/underpostnet/engine/commit/024d76b62faee3f04d70c4d303ac486697e40876))

### cli-run

- Fix instance promote handle multi variant paths ([c23e75021](https://github.com/underpostnet/engine/commit/c23e75021d4bbf6e24cdb45102b344743712b3a6))
- Add flag 'branch' in default runner options ([4e7a63dfb](https://github.com/underpostnet/engine/commit/4e7a63dfbb8c492e31e53bafbb23586a46aa59ad))

### cli-repository

- Add init local repo in cmt cli ([0255eb053](https://github.com/underpostnet/engine/commit/0255eb05354edd33741721311f012b339351370b))

### cli-deploy

- Fix multi-instance blue/green deployment build manifests ([99a9b5265](https://github.com/underpostnet/engine/commit/99a9b5265257856a6df2ed2d9425ddaba834d8bf))

### cli-fs

- Remove redundant logs ([23761d607](https://github.com/underpostnet/engine/commit/23761d607bbc62a1d6a892faa66a448496ece8d7))

### hardhat

- Update supply-chain dependency: overrides adm-zip to version 0.6.0 ([fe5d98996](https://github.com/underpostnet/engine/commit/fe5d989964e768911d0c2eaa62d8d918f5421025))

### cyberia-docs

- Document OFF-CHAIN economy players + bots, any victim loot ([dbc4efa36](https://github.com/underpostnet/engine/commit/dbc4efa365c0e61b6dff32dd00ee5593aa064968))
- Document path-based multi-instance deployments ([b028657f4](https://github.com/underpostnet/engine/commit/b028657f4c79280d53674e034e396e44e9d8eae4))
- Document REST boot fallback and gRPC transport refactor ([a4b8006cc](https://github.com/underpostnet/engine/commit/a4b8006cc3240f65ff22fff8b089277032c21add))
- Update docs to reflect presence POI architecture and instance map changes ([140568b80](https://github.com/underpostnet/engine/commit/140568b808f32a83037841cbe741c18af2b0b743))
- Document instance map API, data flow and client overlay integration ([a8f7c8ea5](https://github.com/underpostnet/engine/commit/a8f7c8ea58848b92cbe9ce0febb3a8bcc9692524))
- Update Off chain economy concepts from transfer to loot drop race ([e93cafc83](https://github.com/underpostnet/engine/commit/e93cafc836d58148d4439126a650a20e7ff5d5ce))

### client

- Fix slide menu title style in dark/light themes ([22c1224d5](https://github.com/underpostnet/engine/commit/22c1224d5b4d50ad466c2988bb2c5e6cd7c30860))
- FIx center action button to menu modal ([94d6940ed](https://github.com/underpostnet/engine/commit/94d6940ed5d9e7eff72c039f6e22cc64e47d1a90))

### cyberia-saga

- Add persistInstance helper for saga instance persistence ([3f124c8b5](https://github.com/underpostnet/engine/commit/3f124c8b57f6a4f75051cfa9771c38cf9989aa75))

### cyberia-cli

- Migrate IPFS registry to mfsPath unique key ([e15cfda51](https://github.com/underpostnet/engine/commit/e15cfda511c674a4c0f8e77901f7df4d59a6e50d))
- Add clean option in import default items in runner ([9cca28ab9](https://github.com/underpostnet/engine/commit/9cca28ab93178cf2ee06f4d5e7b199a612f9e360))
- Improve import default items add base saga collection ingestion ([ffe822423](https://github.com/underpostnet/engine/commit/ffe822423c60ce3c103d533be00200ae9a406aa2))
- Add publish cross repositories push operation workflow ([69e39292e](https://github.com/underpostnet/engine/commit/69e39292e614d577eae4ad8362e8ec80e1282b9a))
- Fix build-manifest copy docker-compose related files ([b3e252fc7](https://github.com/underpostnet/engine/commit/b3e252fc7d61c2b91f65a199351a32dfb05d87ff))

### ci

- Add latest tag to Docker image build and push workflows ([36dc44fc3](https://github.com/underpostnet/engine/commit/36dc44fc304eafcd67ad4b2743c2c3254b72b9a0))

### grpc-cyberia

- Refactor gRPC server to delegate world-load to shared instance-data module ([740577994](https://github.com/underpostnet/engine/commit/7405779948cbd82383efb18efc928fc10ba0341e))
- Fix itemsId load in fallback world to ensure based in Own-model collections (CyberiaSkill, CyberiaEntityTypeDefault) ([ca4ffbb95](https://github.com/underpostnet/engine/commit/ca4ffbb956cb1e6f19601e35c3ceee8ca71ab49b))

### api

- Centralize Express middleware and controller/router helpers for engine APIs in src/server/middlewares.js ([1dda3de9d](https://github.com/underpostnet/engine/commit/1dda3de9ddd016acbe5f33d239d0a547445cf6c6))

### dependencies

- Update typescript version for compatibility with typedocs ([433b68207](https://github.com/underpostnet/engine/commit/433b6820757cce0c8eadb4cca3b64425cdfa9c05))

### docs

- Update README.md Rocky badge to v9.8 ([f7f31a1aa](https://github.com/underpostnet/engine/commit/f7f31a1aa9257db338c02d2a57d718136216b5f1))

### cluster

- Fix Helm installation in node bin cluster init host workflow ([f7e141c71](https://github.com/underpostnet/engine/commit/f7e141c71d2c6284cb798a985c1f318e77b5293e))

## New release v:3.2.70 (2026-07-06)

### release

- Enhance buildVersionBumpTargets patterns scope ([510abdd94](https://github.com/underpostnet/engine/commit/510abdd94faaa121b7f81a21450beba484de654b))

### cli-repository

- Add default branch resolution ([c5074d31c](https://github.com/underpostnet/engine/commit/c5074d31cac7046280d24d12e30a87ad2db86285))
- FIx commit message propagation in CI engines workflows ([4b5458d83](https://github.com/underpostnet/engine/commit/4b5458d834efa88a1cf81ae32d517a71a4bb58f2))
- Add runtimeRepo logic in  resolveInstanceRepo method ([1ef3ad279](https://github.com/underpostnet/engine/commit/1ef3ad27908989f3ab7f620500257b6e9ff76f4b))

### github-actions

- Clean comments ([785e9d55d](https://github.com/underpostnet/engine/commit/785e9d55d27351ad4d529e38f60d3962f9439fee))
- Fix typo engine cyberia cd cmd command, and clean comments in cyberia-engine related dockerfiles ([d93dbf54a](https://github.com/underpostnet/engine/commit/d93dbf54a2ec44e1c1b4c01abd21e1baa0cf7fbc))
- Fix add missing install dependencies in cyberia github package workflow ([8897dcdbb](https://github.com/underpostnet/engine/commit/8897dcdbbea619687165438f3ac64702480f4d23))
- Add cyberia cli github package workflow ([6ae0ac5f7](https://github.com/underpostnet/engine/commit/6ae0ac5f76c08643171b4b3853c874ed26b423c1))
- Add cyberia-server and cyberia-client CD workflows ([c92a6c278](https://github.com/underpostnet/engine/commit/c92a6c27810738c2c6a87962c6fefaf98060cb70))
- Fix engine-cyberia CD  and engine-prototype CI manifests workflows ([3ca123dbf](https://github.com/underpostnet/engine/commit/3ca123dbf9d4d0cfbc1d504e6b0c847abd2f8757))
- Add single source of truth for the underpost image version in ci dockerhub workflows ([97585e735](https://github.com/underpostnet/engine/commit/97585e735c1cd48c80e8c7af8601e14a79e233fd))
- Update engine-cyberia default deployment node ([b181a5bd5](https://github.com/underpostnet/engine/commit/b181a5bd5254d2a692579c9c7d188161ae351e59))

### engine-cyberia

- Add sudo in engine-cyberia runtime dockerfiles ([3c3da0fcc](https://github.com/underpostnet/engine/commit/3c3da0fccc5b91c01722d3224146ae37ebcc6a27))
- Update production engine-cyberia Dockerfile ([e1a9330e9](https://github.com/underpostnet/engine/commit/e1a9330e9c3325a8a1ee41318bbe48714deaf3a2))
- Refactor Dockerfile and deployment configurations for production and development environments ([4901a3f92](https://github.com/underpostnet/engine/commit/4901a3f925ce038ede03b5e08c6b06eb03bc1617))
- Refactor separate engine-cybera public engine URL from internal cyberia-server api engine base url endpoint ([48923d900](https://github.com/underpostnet/engine/commit/48923d90062dc934228c049a33f619dcdacd5cbc))
- Add in runtime engine-cyberia module docker-compose env file related ([ae30329d4](https://github.com/underpostnet/engine/commit/ae30329d4e80d4911c3129ad042c623f74110462))
- Add centralized node version arg and update to v24.15.0 id dockerfiles related ([64a649a1b](https://github.com/underpostnet/engine/commit/64a649a1b29a941b10d91879207e8a7ff76f48a2))
- Update Dockerfile.dev use canonical repository ([12e439122](https://github.com/underpostnet/engine/commit/12e4391225ee207dd5e3edff93af4cfe667982dd))
- Add ipfs cluster service in cyberia docker-compose deployment ([8ee19a3fa](https://github.com/underpostnet/engine/commit/8ee19a3fa5792ed800b03f45a0a677b0d6244450))
- Move ffmpeg to runtime stage in docker-image build pipeline ([1fcca3783](https://github.com/underpostnet/engine/commit/1fcca3783add20e42c3c80a14dfdf9a9ff2b08a9))
- Add engine-cyberia runtime module, docker-compose cyberia mmo ecosystem, and docker-image engine-cyberia dockerhub pipeline ([df2162b7d](https://github.com/underpostnet/engine/commit/df2162b7d755a814d36bd2da322c3e554496daa2))
- Add behavior field, entity behavior vocabulary, and skill logic validation ([6ac9bcaf5](https://github.com/underpostnet/engine/commit/6ac9bcaf5eede564ae80ce74498c91eb9a4e4b20))
- Refactor entity-type-default to subset matching resolution ([bf0aa9fe6](https://github.com/underpostnet/engine/commit/bf0aa9fe65523d0817d18b8796ce71b9be858955))
- Add fontFamily+fontFactorSize;  in RENDER_DEFAULTS  and buildClientHints passthrough; client-hints model fields related logic ([34a1ee78b](https://github.com/underpostnet/engine/commit/34a1ee78bf8eba5ed1ffca5bad3c92f5eef5c4fd))
- Add transport status definition for portal entities ([4cf015892](https://github.com/underpostnet/engine/commit/4cf015892eaafd58e6d65f19c7aeeaec3eccfb5e))
- Implement cyberia-entity-type-default model and EntityEngineCyberia and related logic ([96c8c94ec](https://github.com/underpostnet/engine/commit/96c8c94ec4a0faf506232d3a1059e0c84f83edc6))
- Add cyberia saga amethyst-strata-expansion custom resources ([6422570ab](https://github.com/underpostnet/engine/commit/6422570ab33b686016bed5f338cbbf8a0395f285))
- Refactor questCodes field in cyberia-saga model and add actionCodes references ([93ffb7f0b](https://github.com/underpostnet/engine/commit/93ffb7f0bc8097769d3b9f3c4ffbf1c8359af18a))
- Fix  idempotency consistency in atlasSpriteSheetId ref in export / import instance pipeline ([05e62ebbe](https://github.com/underpostnet/engine/commit/05e62ebbe0fc8284ee468b458818e19fc77298bb))
- Add cyberia-saga documents in import / export cyberia instance pipelines ([e77583fc8](https://github.com/underpostnet/engine/commit/e77583fc8b129a875270ef8d7e1c40d61ecc7a18))
- Update CLI and saga documentation for skills ([1655a5c87](https://github.com/underpostnet/engine/commit/1655a5c877c712210cbe83a35848896cdc5e4125))
- CLI seed-skills, import/export, and server defaults skill config ([b2215cce2](https://github.com/underpostnet/engine/commit/b2215cce22c5499579a2df63db0ac301a0553feb))
- Action engine skill editor with CyberiaSkill CRUD ([7a3f3b8d7](https://github.com/underpostnet/engine/commit/7a3f3b8d71272eee9a3c4fb9218d9152b2023776))
- Saga generator skills stage and instance persistence ([669d991ca](https://github.com/underpostnet/engine/commit/669d991cac09dedf60b60c7261cb045cb7dd7f71))
- Skill system - DefaultSkillConfig, gRPC server, CRUD API, and client service ([2e1997ebc](https://github.com/underpostnet/engine/commit/2e1997ebceb03723ea7ffd15ea61d950a3723414))
- Instance model itemIds schema with defaultPlayerInventory flag ([342df03c3](https://github.com/underpostnet/engine/commit/342df03c3612cc82131b287e1f7545e3fcd7f9f8))
- Add static entity type and shared direction/stat constants ([86ab2ffca](https://github.com/underpostnet/engine/commit/86ab2ffca38851ce870ee72c37221cbf260e5bd8))

### cli-fs

- Isolate Git tracking from JSON storage ([2f9145be9](https://github.com/underpostnet/engine/commit/2f9145be92456124118f9c7d74726bdff82dc5f3))

### cli-run

- Add typedef UnderpostRunDefaultOptions in cli runner module ([8a3580109](https://github.com/underpostnet/engine/commit/8a3580109d8f70a10c4ac2d216fbd35844e09541))
- Add resolve runtimeRepo logic in  ssh-deploy runner ([1d4c26002](https://github.com/underpostnet/engine/commit/1d4c26002ac513fcde86c8839445e2b82fd55e50))
- Add generate sibling manifests (pv-pvc, proxy, grpc-service) in instance-build-manifest runner ([36bf33b4b](https://github.com/underpostnet/engine/commit/36bf33b4b2ec34bac3925a4330b4eb5606cf8876))
- Add dev mode in runner docker-image to trigger dev variant docker hub push ([bc1e23ac0](https://github.com/underpostnet/engine/commit/bc1e23ac0ce5c705e3d2f7b3e47546e1e3c583bb))
- Fix custom instance artifact generator add custom --trafic flag inteast ([d6873f3c3](https://github.com/underpostnet/engine/commit/d6873f3c300d09f34cf5399f671b86ac5f4b8d55))
- Add deploy key runner ([6164b0190](https://github.com/underpostnet/engine/commit/6164b0190e59510bdd51bb60d3064ba3a9c32a7b))
- Add kubernetes-sigs metrics server runner setup ([4761c6351](https://github.com/underpostnet/engine/commit/4761c6351482fe27e84f47d4cf53946f8f04caa6))

### cyberia-cli

- Add missing deployment manifests copy to build cyberia-instance dir ([ee71573ee](https://github.com/underpostnet/engine/commit/ee71573eea0e979d883238744bee97714cf0b224))
- Add publishing functionality for cyberia instances ([aaf8485bf](https://github.com/underpostnet/engine/commit/aaf8485bfd003a39dec59760c5dd2b2ffb051f3d))
- Add method to fill empty fields  in Instance Conf Defaults export process ([6e1c268ae](https://github.com/underpostnet/engine/commit/6e1c268ae755b240abdfcd60ff0f26d2c35a9fe3))
- Add docker-compose-dev-env-up runner workflow ([9e765185a](https://github.com/underpostnet/engine/commit/9e765185ad782f34cddddbc2862981416a830de4))
- Add drop-db workflow to clear only cyberia collections ([5b741c22c](https://github.com/underpostnet/engine/commit/5b741c22cda0cf7c9ee531903769d466826cf133))
- Add sync-src to engine runner logic ([a777e5ad6](https://github.com/underpostnet/engine/commit/a777e5ad69b1069eadb04846010a6d34508ce7c5))
- Remove seed default dialogues in export instance logic ([1cbcb9e52](https://github.com/underpostnet/engine/commit/1cbcb9e52f1441ae10abb046bf356b49dd7fcfd2))
- In cyberia instance export / import disabling overlaps queries for now because they can be very expensive and are not strictly necessary for a backup ([b7d7858d6](https://github.com/underpostnet/engine/commit/b7d7858d619edb9feac968c6fce2ac99d5978d24))

### cyberia-api

- Add moderator auth guard in cyberia api CRUD operations endpoints ([0373a052f](https://github.com/underpostnet/engine/commit/0373a052f257577b7afec887d18c982938b8de02))

### client-cyberia

- Add moderator guard for CRUD operations in cyberia components ([f746ea9ce](https://github.com/underpostnet/engine/commit/f746ea9ced0a0dac113129fb26f2d7f6df763f26))

### cli-cyberia

- Add cyberia run-workflow docker-image local tar builder runner ([a953dec8f](https://github.com/underpostnet/engine/commit/a953dec8f108a4d53d9fde07fae7149f5f0e2dd4))

### cli-image

- Add --import-tar flag option and logic ([5f00f64c9](https://github.com/underpostnet/engine/commit/5f00f64c9b9c41b6c6220c09c42345f378caee90))
- Refactor and simplifi image build logic, and add support to load local tar in docker-compose ([f87523253](https://github.com/underpostnet/engine/commit/f8752325363bde9f8d18cefb0b348e570c00d9f9))

### cluster

- Enhance cluster and disk clean logic ([d9a079f7d](https://github.com/underpostnet/engine/commit/d9a079f7de4add9d7b30c0493d367f620c837d7b))

### catalog

- Add copies and moves options in catalog build logic ([b1940e067](https://github.com/underpostnet/engine/commit/b1940e067a9961581998e9adfd6ba39c62f35735))

### engine-prototype

- Remove ssr prototype components from base engine ([4f3e04f4b](https://github.com/underpostnet/engine/commit/4f3e04f4b5fcaca831139f4cdcd6ce871b50297d))

### grpc-cyberia

- Add behavior passthrough in entity defaults merge ([7998df262](https://github.com/underpostnet/engine/commit/7998df26276de1693054bbf3eb00a368edccfb67))
- Fix merge entity defaults logic, preventing cross-instance entity defaults overlap ([0d64d6b8f](https://github.com/underpostnet/engine/commit/0d64d6b8ff40a1a889df9c767aa90052a08656f5))

### cyberia-instance-engine

- Implement handler for authoritative initial spawn for new players connections logic and aoi radius customization in intance engine component ([89d68aca0](https://github.com/underpostnet/engine/commit/89d68aca0152d1800d6632cddbd428409845a58a))

### cyberia-map-engine

- Add checkbox removeOnClick and enhance ui / ux ([5b557256f](https://github.com/underpostnet/engine/commit/5b557256fd17790913e9628440bd6e125d92ee0d))
- Add in client component MapEngineCyberia.js renameFilteredObjectLayerItemId with random factor ([c6519a1c0](https://github.com/underpostnet/engine/commit/c6519a1c0b3dfab9ba7856e3dd03914bd14a846a))

## New release v:3.2.30 (2026-06-25)

### server

- Add only build client in development mode in normal server run start up ([a332ae458](https://github.com/underpostnet/engine/commit/a332ae458f79458c7911a4a158037ada250d3af6))

### cli-start

- Add start-container-status in start pipeline to insulate readinessProbe monitor server status, prevent external overwritten status ([75f67cf3f](https://github.com/underpostnet/engine/commit/75f67cf3fcbc07716415caac4e67ab91abb05985))

### cyberia-cli

- Enhance cyberia-saga variety theme separate custom prompt of random subject theme ([1945a2553](https://github.com/underpostnet/engine/commit/1945a2553780d1d3b5fa20e40eedcc7d0b1ecd9c))
- Enhance cyberia-saga variety theme handle and prompt seed customization ([a335d3e20](https://github.com/underpostnet/engine/commit/a335d3e20025f8e714ff98fdc27d7895970187b5))

### db

- Improve wait status ready mongo pods in bootstrap methods ([6805e35c2](https://github.com/underpostnet/engine/commit/6805e35c22e43315c14dc9e7457ca3d599877ea8))

### cli-env

- Add keepKeys array options in clean env method ([5b3be0bca](https://github.com/underpostnet/engine/commit/5b3be0bca14a0ccfa64740aff12d2af17a7c29ce))

### repository

- Add getRemoteUrl and switchRemote repository methods in repository cli ([0412b9986](https://github.com/underpostnet/engine/commit/0412b998683a8369833eb363f8c9953744ae1a3a))

### deploy

- Enhance node customization in default deployment and custom instance workloads ([31c6b6d3b](https://github.com/underpostnet/engine/commit/31c6b6d3b397229b0216f82b8aef29b6941e474e))
- Fix node affinity assignment in volume mount factory ([9ec1ef931](https://github.com/underpostnet/engine/commit/9ec1ef9313ac0dbb5993cd3f158d2d01eae7dec5))

### cli-run

- Add flag ssh key path to customize key usage for ssh operations in deployments pipelines ([861cd7373](https://github.com/underpostnet/engine/commit/861cd73734d3442783419af4403bbb8e88711f19))

### start-cli

- Improve underpost container status persistence ([bff2e8f8d](https://github.com/underpostnet/engine/commit/bff2e8f8d65c6a2fe8572fe0bc9c42b9566db918))

