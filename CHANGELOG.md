# Changelog

## 2026-09-25

### cli-cyberia

- Replace complete security workflow to only secrets ci workflow run in e2e-build command ([7a62232fe](https://github.com/underpostnet/engine/commit/7a62232fec857d4a7d919fffaa324271464805e6))

### test

- Skip tree-completeness checks in sliced template trees ([2530e48f1](https://github.com/underpostnet/engine/commit/2530e48f1cf2017b3a6c65f2464707297efaeedf))
- Gate platform suites that load Cyberia modules on the product context ([7d4af40bd](https://github.com/underpostnet/engine/commit/7d4af40bdee223ceb2373949d3fda56e7314c5b9))
- Run product test projects only in their product context ([bea8961f7](https://github.com/underpostnet/engine/commit/bea8961f79c2f22d3082be73639e9a7108286aa1))
- Move the remaining tests under their domain and level directories ([b700fdfe9](https://github.com/underpostnet/engine/commit/b700fdfe99c7bd82255d893407adc93281881f60))
- Pin every app shell to its docs submenu and domain overview ([d89c18ca8](https://github.com/underpostnet/engine/commit/d89c18ca8d20088358a35e2e2d7e2771229292da))
- Select tests by domain and level with change-impact selection ([27d174656](https://github.com/underpostnet/engine/commit/27d1746564355381d16a92e0102b5d9d52169a03))
- Share the binary lookup for suite requirements ([11684b26c](https://github.com/underpostnet/engine/commit/11684b26c9583ccbb51b89ecd84a3d66eb04e37c))

### package

- Keep dev dependencies when installing the deploy catalog pins ([421793b3b](https://github.com/underpostnet/engine/commit/421793b3b246c994b6188d71bef99e97b57ca4ac))
- Remove the socketsecurity prepare hook ([7df7bc558](https://github.com/underpostnet/engine/commit/7df7bc55808993aa03020504b711de6defa91ca3))
- Lock ethers and canonicalize, drop fast-json-stable-stringify ([cd1961037](https://github.com/underpostnet/engine/commit/cd196103738f43e32b01cb96aba4ccd60e038e34))

### hardhat

- Pin undici through the @actions/http-client override ([3ff1c2364](https://github.com/underpostnet/engine/commit/3ff1c23640596b42ff208f897369b66a92b05822))
- Key ObjectLayerToken by content hash instead of item id ([13d7c0784](https://github.com/underpostnet/engine/commit/13d7c07845fa2cfb3646e2119bd033a5bcbabdcb))

### docs

- Fix migrated rename underpost conf module, replace conf.dd to underpost.config.dd ([59c278f48](https://github.com/underpostnet/engine/commit/59c278f4893a720f3228d72aa22e1b506b24811c))
- Add object-layer, item-ledger, cryptokoyn, and underpost domain documentation ([da7236cab](https://github.com/underpostnet/engine/commit/da7236cab2d5dd6629f434815e269320fc4a32c4))
- Move nexodev documentation under the domain tree ([c49f1674e](https://github.com/underpostnet/engine/commit/c49f1674ecb03a23be0de45952d1b4d61e7e420c))
- Move Cyberia documentation under the domain tree ([a1fbf3e93](https://github.com/underpostnet/engine/commit/a1fbf3e93e2716b5b60ff90434dd7eeb2d6f2426))
- Build documentation navigation from the authored docs tree ([e17f7ba4e](https://github.com/underpostnet/engine/commit/e17f7ba4e51eb6ffa159c5b3392a1c363beda622))

### release

- Fix underpost config clean artifacts ([5fa88b0b7](https://github.com/underpostnet/engine/commit/5fa88b0b753d7f15d5cb4312cc08438cc3db795e))

### github-actions

- Select CI tests through the domain and level projects ([bf77aa647](https://github.com/underpostnet/engine/commit/bf77aa647ecd65030058d59f7d5b3d096c9f53c1))
- Reference the renamed underpost.config.js in CI ([485798e22](https://github.com/underpostnet/engine/commit/485798e22505398b8a8dfe162c1198f413796865))
- Update repository owner gitlab CI ([086bcb4d9](https://github.com/underpostnet/engine/commit/086bcb4d94d8a3de3bca6f74b696d57ce09f631c))
- Add already published guard before every npm publish ([fad2fd108](https://github.com/underpostnet/engine/commit/fad2fd108dae3ad1af93054c3a9596867ea5e355))
- Mirror scope trimmed to ghpkg-only ([81fdefde6](https://github.com/underpostnet/engine/commit/81fdefde665ebbb6c7068ec01f8f5c9bf195eab2))

### api

- Name the versioned API path in the boot data comments ([40f60a523](https://github.com/underpostnet/engine/commit/40f60a52356e1a8f1a3fab9a2bd3d7089055847f))
- Name the versioned API path in Cyberia comments and preview URLs ([9d5964607](https://github.com/underpostnet/engine/commit/9d5964607fdd08de591f7a94032ebb60d9822a6c))
- Build API paths from the versioned contract ([1dc99703f](https://github.com/underpostnet/engine/commit/1dc99703f3d9677bb0cec5f53deedaa2daabf01a))
- Cache instance, map, and client-hints reads through CacheService ([c0fc8ac55](https://github.com/underpostnet/engine/commit/c0fc8ac55742ac8b003e92d9355a694f8e668cf6))
- Enforce owner-or-admin on instance and map writes ([f6bf1924f](https://github.com/underpostnet/engine/commit/f6bf1924f380c9fa11d8fbadafb00273969d6882))
- Restore default write guards on audio and global map registry routes ([e101112ce](https://github.com/underpostnet/engine/commit/e101112ce63d24fe797d4e2989eca1db48cf1363))
- Add the versioned API path contract ([2c4155e9d](https://github.com/underpostnet/engine/commit/2c4155e9db79ccbec430dbeed31dbecb8d1cb05c))
- Move the stable slug with the title on edits ([243e738b9](https://github.com/underpostnet/engine/commit/243e738b9de532173f18566b8de407c746fd089a))
- Resolve public profiles by username ([71ecc0aa7](https://github.com/underpostnet/engine/commit/71ecc0aa7a2f6fed2dbaf73c503889ab5637b786))
- Assign every created document a public stable slug ([73730892b](https://github.com/underpostnet/engine/commit/73730892b987d207368841d928def3ca5bd5908f))

### deploy

- Regenerate the deployment manifests for the objectlayer host and the v1 API ([964cab45a](https://github.com/underpostnet/engine/commit/964cab45a4958d0e4f76a37f9899921e0945533a))
- Sync the cyberia product checkouts beside the engine ([792e51da2](https://github.com/underpostnet/engine/commit/792e51da224bc42f789b2787a4a33c285dd851aa))

### server

- Bound valkey memory with LRU eviction ([752d54d56](https://github.com/underpostnet/engine/commit/752d54d5645fa5b2a4669da54b4b10e246b02c52))
- Derive host ports and development origins from one port map ([cd3288f66](https://github.com/underpostnet/engine/commit/cd3288f667564ca6f146343681ee4a39ad877b4c))
- Import fs-extra consistently for filesystem access ([2a45c3c8d](https://github.com/underpostnet/engine/commit/2a45c3c8d7c304e7eaeb0ea911fd2e8df65f47fb))
- Add a Valkey-backed cache-aside service ([505db2695](https://github.com/underpostnet/engine/commit/505db2695fcb0ad7dacef0005bc7978a480edab0))
- Add cross-domain read/write infrastructure and service-key auth ([bd543fbe0](https://github.com/underpostnet/engine/commit/bd543fbe0738b3d3a6147fc2a5040e73c5aeeb71))

### deploy-cyberia

- Build, validate, promote, and prune content releases in the sync deploy ([dcd150c58](https://github.com/underpostnet/engine/commit/dcd150c58cfdec563ca9567c8ebd4bb63c78bf86))
- Backfill stable slugs in the sync deploy ([45da440c2](https://github.com/underpostnet/engine/commit/45da440c28c072f9d8c8cedc9782ac612c1144b2))

### cyberia-cli

- Wire the item catalog, ledger, content releases, and CID identity through the Cyberia CLI ([b5f3ca981](https://github.com/underpostnet/engine/commit/b5f3ca98117d1f02bbdcf23fb7346019b5aca4ab))

### engine

- Wire the API contract, domain consumption, and docs publishing through the runtime and client build ([0116ed294](https://github.com/underpostnet/engine/commit/0116ed29404b469dbe4a279285014df849c0539f))
- Render entry metadata into the served shell ([397bd5944](https://github.com/underpostnet/engine/commit/397bd5944473eefd410efeb1d45fe3d48f35cb8f))
- Serve the PWA shell for dynamic public routes ([722aecab0](https://github.com/underpostnet/engine/commit/722aecab0caddc2f450c15a057d37f9d6e04fa4b))

### cyberia

- Resolve instance-map item types through the item catalog ([2ae233b6e](https://github.com/underpostnet/engine/commit/2ae233b6e505174a010718ee91d13213057d9dbc))
- Serve boot content through the item catalog, ledger bindings, and content view ([995586acb](https://github.com/underpostnet/engine/commit/995586acbd464e38b855701802e26481b54d2c76))
- Declare which domain owns each host and API of the deploy ([e7b94c92b](https://github.com/underpostnet/engine/commit/e7b94c92bf90cca422864f6ce35565a5c8d62cef))
- Add versioned content releases with promote and rollback ([805d6d123](https://github.com/underpostnet/engine/commit/805d6d123d18c6152477c286ff4ac000589e9f84))
- Read the server key from the shared guard module ([94e299e07](https://github.com/underpostnet/engine/commit/94e299e07bb74ab3092579cd3efc123b89f20202))
- Guard quest progress writes with the server key ([701717376](https://github.com/underpostnet/engine/commit/701717376569cd8977878f27ff0cf6f3090225a3))
- Stop offering a draining server from the registry ([db1c72d6d](https://github.com/underpostnet/engine/commit/db1c72d6daf9dc58f52d5af39cd3cd5413ad2b8a))
- Guard the server registry with the shared server key ([c10f7629c](https://github.com/underpostnet/engine/commit/c10f7629cad56d9cb6ebcee09c8025faa8e83235))
- Add a shared server-key guard for engine to game-server routes ([ed00ed6a7](https://github.com/underpostnet/engine/commit/ed00ed6a7a843198ceeec1d3e2d8e6114bb4eb30))
- Rework atlas-sprite-sheet around CID-addressed renders ([64f33601e](https://github.com/underpostnet/engine/commit/64f33601e1f7ba2c19c3fd0ed81e6230c2d76364))
- Bind Cyberia item labels to Object Layer definitions ([7caee1a9e](https://github.com/underpostnet/engine/commit/7caee1a9eb9449a021ab671dc315e5ac39964311))

### client

- Normalize the cryptokoyn and itemledger PWA icon sets and metadata ([486dfeeac](https://github.com/underpostnet/engine/commit/486dfeeac2e4b6cee5cf835811467d4e2aea0d14))
- Enable the top and bottom bar layout in the default and dogmadual shells ([e9de7101f](https://github.com/underpostnet/engine/commit/e9de7101fd72585b1758c437dc2ca46b34c615b0))
- Point the menu GitHub entry at the organization ([1bc113d61](https://github.com/underpostnet/engine/commit/1bc113d615964639fb03c0970913e298a266b092))
- Add the admin-only user-management menu entry ([24a0dff43](https://github.com/underpostnet/engine/commit/24a0dff432fffa0d3e0baf3a3383cfe48f65bcae))
- Paint the SSR splash in the loaded app theme ([43db105a2](https://github.com/underpostnet/engine/commit/43db105a26953ba53fcf6f55e5d98bfbc56a26a4))

### client-objectlayer

- Scaffold the objectlayer PWA client app ([907771c1e](https://github.com/underpostnet/engine/commit/907771c1e6b3ace8ac50ef5a588b86ae28f57812))

### client-itemledger

- Add the item-ledger registry view and documentation submenu ([9afc51b6c](https://github.com/underpostnet/engine/commit/9afc51b6c46190164d3a4bd069ee9232530fc4de))

### client-cryptokoyn

- Add the documentation submenu and wallet view styling ([3989ce1c1](https://github.com/underpostnet/engine/commit/3989ce1c118b67d7bc7dccd7a516de03632481ee))

### client-cyberia

- Inject the Cyberia profile into the object-layer views and wire documentation icons ([9c644e4ee](https://github.com/underpostnet/engine/commit/9c644e4ee27d32723a6d93826bf973a7219bcab0))

### client-nexodev

- Remove the retired wallet entry from the nexodev shell ([cf3d8e587](https://github.com/underpostnet/engine/commit/cf3d8e58706cf234ce956f8f6cb1e9c408040a12))

### client-underpost

- Reuse the shared markdown styles and drop the inline splash background toggle ([2e71d6a01](https://github.com/underpostnet/engine/commit/2e71d6a019056b6ad4ec8e7bfaba36b92feb6fe8))

### client-core

- Show the account role and add wallet and panel translations ([a0d923595](https://github.com/underpostnet/engine/commit/a0d923595eb6ba81216c6b3175d04784f4eea9ec))
- Build the profile image URL with getApiBaseUrl ([6f40710d4](https://github.com/underpostnet/engine/commit/6f40710d4bc89d94caefbe0ad92764e6ed218e05))
- Style panels through theme-scoped classes ([bbfb18b72](https://github.com/underpostnet/engine/commit/bbfb18b72a7dd93e60a1834feba08ce70cecee62))
- Paint the SSR splash in the theme the app loads ([214c009e3](https://github.com/underpostnet/engine/commit/214c009e38f75b6b5e734f1698e79909baeaea50))
- Add an in-app documentation viewer and submenu plumbing ([c8cc852f6](https://github.com/underpostnet/engine/commit/c8cc852f69a7547b564e13a192c5d56d9e9df4ae))
- Resolve release and organization URLs from the repository identity ([e07d69414](https://github.com/underpostnet/engine/commit/e07d69414133954f3396ce04b78d71423130268e))
- Surface service failures instead of empty results ([14940fa11](https://github.com/underpostnet/engine/commit/14940fa11dde22ae8dbe1fab31575cc8c96a9858))
- Validate grid pages against the route that owns them ([5e923dceb](https://github.com/underpostnet/engine/commit/5e923dceb7f2551dca3ed25a5804518786c36060))
- Animate modal maximize and confirm transitions ([307a6afd4](https://github.com/underpostnet/engine/commit/307a6afd47dc5354d8b2026e3eb0c3c53bdfb34b))
- Sanitize user markup before it renders ([d95880be3](https://github.com/underpostnet/engine/commit/d95880be32f3f241c9446a05580534d5482e47cc))
- Title public routes for the resource they present ([89d269809](https://github.com/underpostnet/engine/commit/89d2698095ccd6bf4e7f1f61c38da61b61d97e67))
- Refactor the dynamic column width rules ([e88611d61](https://github.com/underpostnet/engine/commit/e88611d61033435226391b43399cc623271cec61))
- Navigate public routes by canonical path ([82dce41e8](https://github.com/underpostnet/engine/commit/82dce41e839b85655989281b8e7cf7e38cc222f9))

### mailer

- Link email templates through the versioned API path ([d06d009fc](https://github.com/underpostnet/engine/commit/d06d009fcaf2818c2f6c3257dfc7fee656b42aea))

### object-layer

- Drop the direction table now owned by ObjectLayerProtocol ([3d50d3e8a](https://github.com/underpostnet/engine/commit/3d50d3e8ad438e5eff641c5088e6ef38daba7d64))
- Rework Object Layer to a CID-keyed canonical identity ([26361dde8](https://github.com/underpostnet/engine/commit/26361dde80e52e6f088e01a9dde20f9856f7a640))

### engine-cyberia

- Publish every host port and build without the cyberia-server clone ([02e8ec978](https://github.com/underpostnet/engine/commit/02e8ec9783097634fc70c64222cbfdeaa444603e))

### grpc

- Serve the CyberiaDataService schema from the engine ([95011517a](https://github.com/underpostnet/engine/commit/95011517a8d87326ee17bc302c8612720dd30611))

### item-ledger

- Add the ItemLedger domain projecting ObjectLayerToken events ([f68bc117e](https://github.com/underpostnet/engine/commit/f68bc117e4b2fa26d7163cd6136c14fc33421575))

### ipfs

- Move the Cyberia IPFS client into the generic ipfs domain ([90facfbe9](https://github.com/underpostnet/engine/commit/90facfbe92a0e30ba095fe42ded40edcdf81c9c6))

### wallet

- Add SIWE wallet sign-in, replacing the WebCrypto identity ([9c1d76a33](https://github.com/underpostnet/engine/commit/9c1d76a338d33dc946519f1c530ca6c72ab20207))

### db

- Add content-view partitions to serve versioned Cyberia content ([9751cd1c6](https://github.com/underpostnet/engine/commit/9751cd1c6a0dcacc2d25df950c145225f40793f9))

### cli

- Fall back to local files when --tracked selects nothing to upload ([83d2dfbc3](https://github.com/underpostnet/engine/commit/83d2dfbc3d07f152c9b74965afa3f1235f9d3080))
- Consolidate inotify limit tuning into one sysctl file ([2c3db4ead](https://github.com/underpostnet/engine/commit/2c3db4eadf56ee629c0f2e71b9936bd824167d21))
- Apply Kubernetes manifests server-side ([fa6e5a5a6](https://github.com/underpostnet/engine/commit/fa6e5a5a61c0c6ae5b4960b9425c07ab77183421))
- Wrap shell-interpolated values in shellArgumentFactory ([e53c064c9](https://github.com/underpostnet/engine/commit/e53c064c9b8d30d22f178ac49f718b32dbb9f20c))
- Rename conf.js to underpost.config.js ([3b9e845cd](https://github.com/underpostnet/engine/commit/3b9e845cd8e71908788ea6dd42d1b409363cccf3))
- Add the stable-slug migration to the db command ([e74d71946](https://github.com/underpostnet/engine/commit/e74d719465914fb8f8734d5bb0dff9b1443e2b18))

## New release v:3.4.0 (2026-09-15)

### github-actions

- Remove Git LFS from GitLab mirror push pipeline ([8be008098](https://github.com/underpostnet/engine/commit/8be008098439082de109e4b702d3c9b8b786064d))
- Drop the template Pages auto-enablement and owner build override ([c6e9dfd08](https://github.com/underpostnet/engine/commit/c6e9dfd08648d09ff2b21594467538339d2486f1))
- Publish the template Pages under the triggering owner ([bbdbce2e4](https://github.com/underpostnet/engine/commit/bbdbce2e460e8f7b4a345b9580172dc65225fb9a))
- Scope the template package publish to the underpostnet owner ([7bea0bdee](https://github.com/underpostnet/engine/commit/7bea0bdee5479d48dbae55edd251c41bd2e0f195))
- Add new owner repository scope based on organization ([7d9fdde93](https://github.com/underpostnet/engine/commit/7d9fdde9345b6dc6681e7b27be3f536246bc03c9))
- Dispatch the org mirror per pushed repository ([cdc80e951](https://github.com/underpostnet/engine/commit/cdc80e951b090832b6edc6ea103215e9f8bdd97a))
- Reject staged node_modules in the template package publish ([2040f7717](https://github.com/underpostnet/engine/commit/2040f7717fc7a0a1ba02d80e5bd3ba57194848f9))
- Mirror releases to the organization with owner-scoped packages ([34eaadaf8](https://github.com/underpostnet/engine/commit/34eaadaf8545f6878b9a76759a5510f14d8469e8))

### engine-cyberia

- Add the GitHub org name to the compose environment ([4331754f1](https://github.com/underpostnet/engine/commit/4331754f1003247610ac09f62e120e90139250f4))

### cyberia-docs

- Document the wasm-driver stream diagnostic flags ([9f4e122ef](https://github.com/underpostnet/engine/commit/9f4e122efd6f01305adbdb03ef9793c8b913e6fd))
- Reflow the economy and platform architecture docs ([f7ce74cd2](https://github.com/underpostnet/engine/commit/f7ce74cd202cd9617698188b2e6265ff7c94c66e))

### ssr-cyberia

- Keep the Cyberia 404 page on the requested URI ([3449cf79d](https://github.com/underpostnet/engine/commit/3449cf79d3e60bb63a9f04a6a166cc4f463b787c))

### client

- Add a default NotFound status page for PWA clients ([6d646ded8](https://github.com/underpostnet/engine/commit/6d646ded8431dc8e44bd6be25267e5ce62f76cd2))
- Mirror the Underpost 50px top and bottom bars in the SSR splash ([7cc74f207](https://github.com/underpostnet/engine/commit/7cc74f2071863836a48ae877d13dc70c7c318dc4))

### deploy

- Pin the per-deploy engine source repositories in the sync deploys ([e0d01e2c1](https://github.com/underpostnet/engine/commit/e0d01e2c16f224cf7766b8e4aafa0429dca9a02c))
- Open the merged stream before the error stream in run_quiet ([ce2b9eba9](https://github.com/underpostnet/engine/commit/ce2b9eba997792f27ecfc621c551f15ad58896b6))

### cli-release

- Run security audit and clean deploy ID artifacts in release pipeline ([4163efe74](https://github.com/underpostnet/engine/commit/4163efe745025a70de1b64f1e30294bf1ec29db7))

### package

- Move nodemon to base dependencies ([7732e00ad](https://github.com/underpostnet/engine/commit/7732e00adbddc2a56f8d2f918accc1316cd687b1))

### deploy-cyberia

- Simplify sync-deploy script using build conf ([65b5d8c05](https://github.com/underpostnet/engine/commit/65b5d8c05d47f43d8e49fa6eb8a4644b85b57f2e))

### engine

- Keep non-literal dynamic imports out of the esbuild graph walk ([9b5634567](https://github.com/underpostnet/engine/commit/9b5634567f2d13e534b694ec733f0c420234d3b0))
- Walk the runtime import graph with esbuild instead of regexes ([067c86467](https://github.com/underpostnet/engine/commit/067c8646715fbcf39b194c9b7a0c3c5b4b845313))
- Generate the template .gitignore from the engine rules ([4f12f11e0](https://github.com/underpostnet/engine/commit/4f12f11e0070db426cec2f8fe8f4708278087029))
- Log the copied clipboard length instead of its content ([6541792db](https://github.com/underpostnet/engine/commit/6541792dba3366b2fbb3db5cd229c99adb38cfc8))

### client-core

- Shell the Underpost menu around the sliding top and bottom bars ([a748e88b9](https://github.com/underpostnet/engine/commit/a748e88b987b4d36a8b5ff50bb4896c42c5b85b8))
- Add updateBarCustomVisibility to home button toggle to restore top scroll ([451e5ce62](https://github.com/underpostnet/engine/commit/451e5ce62542c47ab574970c2446f3fd60ea0747))

### cli

- Redact the Maas token secret from the baremetal log ([4f8c55c76](https://github.com/underpostnet/engine/commit/4f8c55c76f278d059e730bfe95f5193fb1d41cee))
- Quote host command arguments in repository writes and pod exec ([ce5b59260](https://github.com/underpostnet/engine/commit/ce5b5926087980664f09ab516dfcc5a5d130034a))
- Add the Socket.dev supply-chain audit command ([8294fb557](https://github.com/underpostnet/engine/commit/8294fb557ac19e65627b6534509c1b31c7231f30))

### api

- Gate the full file listing behind the admin guard ([32872740a](https://github.com/underpostnet/engine/commit/32872740ab91e2c3986bef843c6a5b931e222af3))

### cli-secrets

- Rotate GitHub Actions secrets under user and org targets ([3676dcdf5](https://github.com/underpostnet/engine/commit/3676dcdf5f5b194ccaedfabb9fdeea32658e082c))

## New release v:3.3.77 (2026-09-13)

### test

- Add cyberia instance data unit tests ([2517a5d21](https://github.com/underpostnet/engine/commit/2517a5d217eecaaca6a32663fc0876306db9a3c7))

### client-core

- Rework the collapsed menu badge, tooltip, and hamburger chrome ([0b4bca3f4](https://github.com/underpostnet/engine/commit/0b4bca3f4567081296078283712e22329fd8af2b))

### engine

- Build the deploy sources with coverage from release and CI ([b0fd53698](https://github.com/underpostnet/engine/commit/b0fd53698c5d522467a3d78046fa570162d86607))
- Withdraw the host traces with force inside the container ([e09a23a9d](https://github.com/underpostnet/engine/commit/e09a23a9d44f7c9a0dc20fb24b25a0ad00d78cff))
- Read the fallback document body through the gateway pod ([7d1151db5](https://github.com/underpostnet/engine/commit/7d1151db5c72a2fc7bb6db39ce077ea0ed09899a))

### test-unit

- Skip the catalog tier suites a sliced tree does not ship ([d8280cb4e](https://github.com/underpostnet/engine/commit/d8280cb4e97cd93318b007736da13a700800d01b))

### deploy

- Keep the applied manifest echo off the sync output ([ba3e915d8](https://github.com/underpostnet/engine/commit/ba3e915d8a31a3a5f9a4796e1368511418ceec1e))
- Sweep the legacy per-host Gateway API objects ([a3f1890f5](https://github.com/underpostnet/engine/commit/a3f1890f5c014cbd1bcd728a1dde9529d65a4fe2))
- Apply the Lets Encrypt issuer through the Gateway API solver ([fc42bec8e](https://github.com/underpostnet/engine/commit/fc42bec8e2ace5c770e1ce50c4a46c28471d6d75))
- Pin the pod bootstrap source repos in the prototype sync ([1328bed08](https://github.com/underpostnet/engine/commit/1328bed089481770b15b30fcb70947d2552630f2))
- Remove test variation in pod_bootstrap_cmd repository default ([33513cd0a](https://github.com/underpostnet/engine/commit/33513cd0a4ddee26d9b6b96f23b8c6f0adeb6e24))

### cli

- Mirror deploy id source paths back into their public repos ([9debaad02](https://github.com/underpostnet/engine/commit/9debaad0237cd259f03f9fce03ba5fa510321289))
- Compare the gateway status probe answer by status code ([b7ce8de9c](https://github.com/underpostnet/engine/commit/b7ce8de9cf486b9d9d89b5dbf86782cdd96ee566))

## New release v:3.3.76 (2026-09-12)

### test-unit

- Skip cyberia product suites where the tree does not ship them ([96d1de9e5](https://github.com/underpostnet/engine/commit/96d1de9e57c1f1e33b2df62bdbe2587a5f7ca309))

### client-core

- Add top-left hamburger menu button while the top bar is collapsed ([b91f72210](https://github.com/underpostnet/engine/commit/b91f722100b01e08eae254dae908ed4ad3e4f2ae))

### Cyberia

- Fix minified atlas sprite sheet workload and validations ([b64cbf23a](https://github.com/underpostnet/engine/commit/b64cbf23a48229804996c7a95d544f96e64bfbf7))
- Reuse authored cells when importing an object layer ([117e0e620](https://github.com/underpostnet/engine/commit/117e0e620394f6c4508222c75ee5220f1e9ca0b0))
- Stage direction frames at one uniform size for webp ([82b4acac6](https://github.com/underpostnet/engine/commit/82b4acac60dff445c02756ff049005adb23cb5e0))
- Preview items and entity maps by the atlas idle still ([c5fb8ae62](https://github.com/underpostnet/engine/commit/c5fb8ae621eb04e55f8fa399435eb7e513cbd066))
- Cut an idle-preview still from each atlas render ([0402a1243](https://github.com/underpostnet/engine/commit/0402a12437dab4652be58a085eed5b6fb0fdfc96))
- Wire signed stats and entity levels through boot payloads ([56000de95](https://github.com/underpostnet/engine/commit/56000de95ccd9120f3fefa874c49a43570a59a90))
- Add entity levels and progression rules to the game defaults ([208530c45](https://github.com/underpostnet/engine/commit/208530c4568b91c30d478c7daac88457080f0cd1))
- Sign stat modifiers in the shared contract ([29df5fc49](https://github.com/underpostnet/engine/commit/29df5fc492efa0ab6128e0513a492225e9e5ff31))
- Preview both atlas renders in the object-layer viewer ([8e8441f6e](https://github.com/underpostnet/engine/commit/8e8441f6e3565db1d050bd05f482d349c7c06c04))
- Read the audio File fields from the reference registry ([0e3ca2903](https://github.com/underpostnet/engine/commit/0e3ca29035e77c79851f5de1d8423be75e815785))
- Take the atlas renders when collapsing duplicate layers ([8dcc9ed1a](https://github.com/underpostnet/engine/commit/8dcc9ed1a5c5fc5b9670eb5c56514c2b0e193235))
- Purge an atlas and its renders through the store ([943e9e4c5](https://github.com/underpostnet/engine/commit/943e9e4c585d26a1e68cf193824df035ef3d7a3f))
- Add the File reference registry module ([6b7610101](https://github.com/underpostnet/engine/commit/6b76101013de960c4d16b7daab04ebd98b041d9e))
- Navigate editors by instance code and item id ([d87a56818](https://github.com/underpostnet/engine/commit/d87a568188d01f04b2b083205a9118e282f9742c))
- Store two atlas renders and refresh the minified one ([73ffe183e](https://github.com/underpostnet/engine/commit/73ffe183e913111f98e30c16117139ecfb9da112))
- Bind item-pickup and craft audio events ([3b0f1069d](https://github.com/underpostnet/engine/commit/3b0f1069d0134d504572f1270d6865f408670255))
- Add dropChance to entity-type-default overrides ([5014c7e33](https://github.com/underpostnet/engine/commit/5014c7e338cb58c8c57f5d354dfb858e9df78017))
- Generate pixel-faithful sprite sheet atlases ([dfba47760](https://github.com/underpostnet/engine/commit/dfba47760f30bc667a83afe7d06f5414c4173404))
- Resolve object-layer item identity and map previews ([2bd4f88d1](https://github.com/underpostnet/engine/commit/2bd4f88d161689f2b83d3ddf539fd10dc41b4323))
- Reference entity-type defaults by id and derive skills from content ([f669fa94f](https://github.com/underpostnet/engine/commit/f669fa94f18afa91762ae7662fe443a101cd65a5))
- Add audio assets and per-map audio configuration ([3ec20cb33](https://github.com/underpostnet/engine/commit/3ec20cb336a320b6167250aac7bca11a629babc9))
- Fix mentions of wasm-driver.py ([d748d11dc](https://github.com/underpostnet/engine/commit/d748d11dc584a7640742b57e641d3619b18c4d46))
- Cleared coments ([602f984a0](https://github.com/underpostnet/engine/commit/602f984a0c4d78ab79a9b054d080469b988b4d3f))

### cyberia-client

- Surface featured worlds on the portal landing ([90c528be5](https://github.com/underpostnet/engine/commit/90c528be5ab45b906558f85cac3894a6368d6143))

### object-layer-engine

- Add axis rulers and cursor readout to the pixel canvas ([cd4955c6b](https://github.com/underpostnet/engine/commit/cd4955c6baec17f58bda37d84bbd387949b50093))
- Add cut, copy, paste, and scale tools with toolbar UI fixes ([e215b3583](https://github.com/underpostnet/engine/commit/e215b3583fd73557c803b7d321e2054ffb85e620))

### cyberia-docs

- Document the idle-preview still ([4344d73b9](https://github.com/underpostnet/engine/commit/4344d73b952cf1baea6f05c2ca0f12e37ffcc205))
- Document the signed stat contract and progression ([b7a4c3301](https://github.com/underpostnet/engine/commit/b7a4c33018636557ec8a12c921fb6a16fd790868))
- Reflow the audio option table and emphasis ([8358fe5e8](https://github.com/underpostnet/engine/commit/8358fe5e8c5ee7d5edfca81e6ac2ed7a0215f3f0))
- Document the ol atlas renders and rebuild options ([888c7bcbf](https://github.com/underpostnet/engine/commit/888c7bcbf58b8c430e2ab13f4b6d68614a974051))
- Reflow tables and emphasis across the architecture docs ([64c7e3a2d](https://github.com/underpostnet/engine/commit/64c7e3a2d17e77baac1af791be15c03ecce43acc))
- Document the Data Server URL as a required command-line flag ([28c4a51e4](https://github.com/underpostnet/engine/commit/28c4a51e40d78801dde85af4d10eac0e43f5f805))
- Document Data Server flags and manifest CLI ([74a09d397](https://github.com/underpostnet/engine/commit/74a09d3977a5c40037ca66b0db5fa4b4d6e15e47))

### cyberia-cli

- Carry the idle still through ol minify and backups ([f41f66f52](https://github.com/underpostnet/engine/commit/f41f66f52fc5cf59f7cc5c55f8dbd1e27e2a67c8))
- Require an explicit source for the ol import commands ([b7c759a2e](https://github.com/underpostnet/engine/commit/b7c759a2ec58e44830a3ce02b6cfd3bfaa68b958))
- Implement restore OL backup workflow for a single itemId version instance and related document ([293a62db2](https://github.com/underpostnet/engine/commit/293a62db207e55027ed23343ee5c35c14f297c02))
- Add copy manifests in cyberia-instance repository build workflow ([0f40c2b82](https://github.com/underpostnet/engine/commit/0f40c2b8245ca3e9a7c3e28ea6732228766d820e))
- Rework sync-src as a bidirectional dry-run mirror ([6f05a7dc6](https://github.com/underpostnet/engine/commit/6f05a7dc6ccfc3a801e6542a0a9321f5de5ab9d9))
- Integrated the cyberia public assets folders module into the cyberia repo's publish workflows ([7e5c0e0a7](https://github.com/underpostnet/engine/commit/7e5c0e0a729463e981339cb98336399f0925598a))
- Integrated the cyberia-audio project module into the cyberia repo publish workflows ([07993ee93](https://github.com/underpostnet/engine/commit/07993ee934fd5c8dc781c886d1b6dc0b20819f57))

### engine

- Publish per-suite coverage reports as deploy artifacts ([f37be7ba6](https://github.com/underpostnet/engine/commit/f37be7ba6ed145e17713e8ba136c26b25dabc8f9))
- Resolve instances and maps by their codes ([2daca38b8](https://github.com/underpostnet/engine/commit/2daca38b8a118ed229d672367b43cc32a3c91468))
- Lower the default request timeouts to ten seconds ([9fbb5c844](https://github.com/underpostnet/engine/commit/9fbb5c8448cc3b6ab86d952f0be611bd26789950))
- Publish products with the engine runtime dependency set ([8bd9a12a3](https://github.com/underpostnet/engine/commit/8bd9a12a38d419cf475f9d881906d44abd92c51f))
- Redact adjacent credentials in service error messages ([e8ad83ae6](https://github.com/underpostnet/engine/commit/e8ad83ae65f74f9159df412056a0dbca7113fc5b))
- Fail downloads that stop short of their declared length ([2cb52c254](https://github.com/underpostnet/engine/commit/2cb52c254ba8d2de89cbc1103807361e45733c36))
- Replace adm-zip with jszip and shared archive helpers ([14e4857c4](https://github.com/underpostnet/engine/commit/14e4857c4ccc52707c5f08fc686d1e7d25ac2a53))
- Allow cross-origin reads on CRUD controllers ([7100c5ee4](https://github.com/underpostnet/engine/commit/7100c5ee40aa6a175de1e24eb0f79b485767df6d))

### test

- Fix cyberia stat-contract coverall ([faf4f4378](https://github.com/underpostnet/engine/commit/faf4f4378c54bc9fb6ca8e405d08b904a7f023d6))
- Move sprite atlas and object-layer minify tests to the cyberia tier ([931d98277](https://github.com/underpostnet/engine/commit/931d9827777b49ac01a81b961281ca51c2ff6e0f))

### cli-cyberia

- Add the stat balancing policies and contract generation to the CLI ([d6f477f59](https://github.com/underpostnet/engine/commit/d6f477f59ac18cd16cfd42c9e4a61b1d73282953))
- Route drops and imports through the atlas store purge ([0a103f6e8](https://github.com/underpostnet/engine/commit/0a103f6e8bb2f56946ec9a61e9bfa17194076734))
- Rework the ol command on the stored atlas renders ([73b5c2fa2](https://github.com/underpostnet/engine/commit/73b5c2fa2362d4415d0f95b3431d5f17a4b7ec07))
- Sync the cyberia-instances checkout on publish with cmt --switch-repo ([66ffde978](https://github.com/underpostnet/engine/commit/66ffde9787b055f6f2d48866ccff602b6f02873a))
- Keep CLI-name arguments through the underpost reroute ([e898bf498](https://github.com/underpostnet/engine/commit/e898bf4982e98b3368e784be65abc8aec1c70033))
- Add ol --minify reprocessing scoped to instances ([9b19bfc1e](https://github.com/underpostnet/engine/commit/9b19bfc1eaf2c93d4f0c7001eca1c64ada5ca9a3))

### docs

- Regenerate the CLI references for the storage and bundle options ([4ce71e989](https://github.com/underpostnet/engine/commit/4ce71e989d72343bc4dbe9c11b1325a56fa9a6f7))

### cli

- Warn when a container resolves no OCI env overlay ([20dcb3897](https://github.com/underpostnet/engine/commit/20dcb3897a39858d5fddb76c0953193b569cf692))
- Rework push-bundle and pull-bundle as one client bundle transport ([ead02902b](https://github.com/underpostnet/engine/commit/ead02902be3cb0f05d3ef583824513c984b2a1e5))
- Rework fs selection around storage manifests ([26471a64b](https://github.com/underpostnet/engine/commit/26471a64bf604473499c9d7c928a28e02020bb37))
- Resolve instance root path from conf in instance-build-manifest ([fd08a771b](https://github.com/underpostnet/engine/commit/fd08a771bc520023643d95bd37f752a37cc64aa2))
- Deploy Mongo Express through the cluster command ([4a9d03fbb](https://github.com/underpostnet/engine/commit/4a9d03fbb1c04432b60d609243f35b8dd42b1154))

### cli-wireguard

- Install the landed source before any step runs it ([96db68293](https://github.com/underpostnet/engine/commit/96db682935569eb7bbb556d7bc97b3499e936cae))

### deploy

- Consolidate deploy scripts on shared constants and bundle sync ([dd9d1d368](https://github.com/underpostnet/engine/commit/dd9d1d3682569ed4f86055ba41613ab2cb06d327))
- Stream the deploy log verbatim in a new debug mode ([1d41af6c0](https://github.com/underpostnet/engine/commit/1d41af6c01c51d79de468d6002dd42c31b19c20c))
- Fix git track storage in dd-cyberia sync-deploy ([3ed3c297d](https://github.com/underpostnet/engine/commit/3ed3c297df5172edc2b6c5111a270b8bd522bf2a))

### runtime-cyberia-server

- Upgrade go version v1.25 ([2a14dd26a](https://github.com/underpostnet/engine/commit/2a14dd26ac32fb109c7b1b0c833956bca12c70eb))
- Pass Data Server endpoints to cyberia-server as flags ([c8b4a1b54](https://github.com/underpostnet/engine/commit/c8b4a1b54174954a864301b062caea81c06e9762))

### runtime-cyberia-client

- Add CYBERIA_DATA_SERVER_URL on cyberia-client dockerfiles runtime ([99738cc80](https://github.com/underpostnet/engine/commit/99738cc809a56e716d3cb2729c63aa7495033d3c))

### package

- Update qs version >= 6.16.0 via overrides ([b7697d52b](https://github.com/underpostnet/engine/commit/b7697d52b87589edbf5ba36f44e7b8db2195cd16))

## New release v:3.3.73 (2026-09-01)

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

