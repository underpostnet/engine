# Changelog

## 2026-03-17

### cli-run

- feat: Add 'pid-info' and 'background' methods to enhance process management in CLI ([30afedf4d](https://github.com/underpostnet/engine/commit/30afedf4d17aca20d91f5ad065d979bd42951741))

### server-start

- feat: Add option to skip pulling base code in build process and update configuration for error handling ([3f8d7b09b](https://github.com/underpostnet/engine/commit/3f8d7b09b70270de9b0213b74d9683aad125d732))

### github-actions

- feat: Update CI workflows to improve commit message handling and deployment conditions ([2a4884a1e](https://github.com/underpostnet/engine/commit/2a4884a1e3cbf04eeb4999b1ff38e2c8b4cf41cc))
- feat: Add deploy_type option to CI workflows and enhance changelog message propagation ([d222753ec](https://github.com/underpostnet/engine/commit/d222753ec66cbb1ce3cccc54d7eebea3f144e8b8))

### docs

- feat: Update changelog, CLI help, and documentation with new commands and options ([124c8b2af](https://github.com/underpostnet/engine/commit/124c8b2aff6aae21b57abeca66281cdfba3aaaf8))
- feat: Update CLI documentation and enhance README with versioning and command index ([e6eb668d4](https://github.com/underpostnet/engine/commit/e6eb668d4007dc828f1b946c36ea369aaea6e2d4))
- feat: Enhance documentation configuration and remove obsolete options in build processes ([3437e1488](https://github.com/underpostnet/engine/commit/3437e14884d54202c8a0bbdcef47edfa03528fb7))

### client-underpost

- feat: Refactor styles in RichText and CssUnderpost components for improved typography ([ee1d12335](https://github.com/underpostnet/engine/commit/ee1d123354afb0826ef5f942a07feeeb6eb40c7b))

### client-core

- feat: Update links to open in the top frame and enhance iframe sandboxing ([8ec50df8d](https://github.com/underpostnet/engine/commit/8ec50df8d2eaaf210254930351a783c1d4409d5d))

### cli-client

- feat: Add sync-conf command and enhance build options for client assets ([ad8b96242](https://github.com/underpostnet/engine/commit/ad8b96242431b9a23b3cf3b4345294938552784f))

### swagger

- fix: update security middleware to ensure correct CSP headers for Swagger UI ([ef7dd5243](https://github.com/underpostnet/engine/commit/ef7dd52434191f4f910a7192007ebca5af16932b))

### scripts

- Add missing package installation command in ports-ls.sh ([e13253366](https://github.com/underpostnet/engine/commit/e13253366f5dfd029f2a12e031b5f995efb269ac))

## New release v:3.1.2 (2026-03-15)

### cli-run

- Fix streamline deployment logic prevent override env files and redundant build workflows ([048fb8ff1](https://github.com/underpostnet/engine/commit/048fb8ff1cbb895c3c04cf8a84daa921fcbe6bf5))

### engine-cyberia

- fix: update error handling for underpost passthrough to include 'env' command ([402a96176](https://github.com/underpostnet/engine/commit/402a961768db9753c2cdd7b067c548edcbd2f0b7))

## New release v:3.1.1 (2026-03-14)

### cli-index

- fix: add quiet option to dotenv config for improved error handling ([975448eb4](https://github.com/underpostnet/engine/commit/975448eb4d710cc8248a783240ce818b5fb9b891))

### cli-secrets

- fix: add missing dotenv import in secrets module ([7f83e26c4](https://github.com/underpostnet/engine/commit/7f83e26c44dfe176b6cc524e7b117f322a62bf32))

### cli-repository

- fix: enhance environment variable checks for GITHUB_TOKEN retrieval ([d097c6c1f](https://github.com/underpostnet/engine/commit/d097c6c1f02edcab1e76dca226f129e334dbd453))

## New release v:3.1.0 (2026-03-14)

### docs

- Add documentation for Baremetal and LXD management, including command references and quick start guides ([3569b5150](https://github.com/underpostnet/engine/commit/3569b5150f375467bf5cdb03247897e2849e45ce))
- feat: update documentation with new command options for database and deployment management ([707ef0e4d](https://github.com/underpostnet/engine/commit/707ef0e4d522392b9d658402bbcd04f8c47dc7ec))

### github-actions

- feat: add optional commit message input for workflow_dispatch in CI configurations ([2314de8c6](https://github.com/underpostnet/engine/commit/2314de8c61bb309a1fe0aa42863243744aec54bc))
- Fix cloud explorer underpost session and underpost install in deployments workflows ([746547206](https://github.com/underpostnet/engine/commit/74654720635a04df3dda7785157332b401b3ebd3))
- Add npm install for update packages in deployments engine workflows ([5549a3f5d](https://github.com/underpostnet/engine/commit/5549a3f5d71f8476f0ee8b57e8c9e5c1bc316a10))
- Remove temporal --underpost-quickly-install in deployments workflows ([777b39a2e](https://github.com/underpostnet/engine/commit/777b39a2e07aaab0ac16ddaa01f5df2b4d50f175))

### cli-repository

- feat: enhance CI/CD workflows with workflow_dispatch support and input options ([b311866fa](https://github.com/underpostnet/engine/commit/b311866faab0872ca9e2f6f3041f1a97784cf362))

### package

- fix: add production image script to package.json ([fe0ca63df](https://github.com/underpostnet/engine/commit/fe0ca63df51df703cc2323ad2b697df1adb3d795))
- Add deploy js dependabot branch merge deploy script ([cdc7e90c3](https://github.com/underpostnet/engine/commit/cdc7e90c340e7fb8a35c906719a0e0e8fb728625))
- Fix packages vulnerabilities ([492a3963a](https://github.com/underpostnet/engine/commit/492a3963a54c3ed882fbe0078a6ab353cb2d636b))

### run-deploy

- feat dd security check for secrets before template deployment ([50b6b9ba6](https://github.com/underpostnet/engine/commit/50b6b9ba6d2f49eec1343c70ce7740f87f5cbbc1))

### bin-deploy

- feat(deploy): add 'conf' case to load configuration based on arguments ([28d3e8bf5](https://github.com/underpostnet/engine/commit/28d3e8bf590c35f5c77129400a77b5687bcb05db))
- Add temporal fallback underpost legacy version handling ([ad74d2ef6](https://github.com/underpostnet/engine/commit/ad74d2ef689a95edab80401514f192bb13226e94))
- separate cyberia-hardhat case deploy script ([3cd032785](https://github.com/underpostnet/engine/commit/3cd03278549a89dfffd04298bc7a53880099a51e))

### server-logger

- fix(logger): update json-colorizer import and color definitions ([2b89456df](https://github.com/underpostnet/engine/commit/2b89456df3d78e49bed257068f93639542f0e9b8))
- Fix colorize import logger ([d7c01ccc2](https://github.com/underpostnet/engine/commit/d7c01ccc29b4c6403b024f83a46bd29986260688))

### gitleaks

- fix: update gitleaks configuration title and add new ignore entries for sensitive tokens ([408cad0a4](https://github.com/underpostnet/engine/commit/408cad0a4de273cbec9f97f9b8b93c98246602fd))

### server-conf

- feat: add loadCronDeployEnv function to manage deployment-specific environment variables across modules ([19de5ea13](https://github.com/underpostnet/engine/commit/19de5ea13c121d6ad8b64982f14562ab16fb9d09))
- feat: enhance environment variable file generation with template support ([467f3a348](https://github.com/underpostnet/engine/commit/467f3a348d6bca994829f5fb51034e8b6c0e5c0e))
- refactor: update configuration loading logic and enhance environment variable handling ([bbda63807](https://github.com/underpostnet/engine/commit/bbda638076f2bb48b39ce1e52624064afecc8e30))

### cli-client

- feat: refactor deployment process to use new client command and streamline build operations ([c854da41a](https://github.com/underpostnet/engine/commit/c854da41a9d545c1d718e23ffb37e3188c849da7))

### env

- feat: integrate loadEnv function to manage deploy-specific environment variables in CLI and server modules ([47a1560be](https://github.com/underpostnet/engine/commit/47a1560bee093ed2fdc395d70c911fcaca106763))

### template

- fix: update deployment script to build template and adjust logging configuration ([30c3a830b](https://github.com/underpostnet/engine/commit/30c3a830b02097fd11538c7b5d46db35ad479c58))

### server-client

- fix: improve error logging for nodemon crashes in client development server ([a0ece9770](https://github.com/underpostnet/engine/commit/a0ece97700797565dd992f2320d41814fd1e9113))

### package-script

- feat: add clean script to package.json for environment cleanup ([1516217a8](https://github.com/underpostnet/engine/commit/1516217a8311b3e303a433ebeb70c2306369ee39))

### cli-repo

- feat: add sync-start option to synchronize start scripts in package.json for deploy IDs ([59ebb8c1c](https://github.com/underpostnet/engine/commit/59ebb8c1cb681bc3a12f17e2588198119cad2964))
- feat: add option to display current Git branch name ([8492f7a2b](https://github.com/underpostnet/engine/commit/8492f7a2b8bfe8db50b060d2659a8e059f8d4329))

### cli-run

- Fix runner ide vs code ([70b34ea3d](https://github.com/underpostnet/engine/commit/70b34ea3d3bbf2432882dbe6a9cef87b9af5cf5e))

### server-env

- refactor: centralize environment variable loading ([3c2709aec](https://github.com/underpostnet/engine/commit/3c2709aecf04111ccff716ac929180e93d0edbb9))

### bin-vs

- Improve vs code ide runner handling ([2b1a8b326](https://github.com/underpostnet/engine/commit/2b1a8b326129c5e44fac6691d006991be1eb6097))

### engine

- Refactor security deploy conf logic and handle ([7d6592c43](https://github.com/underpostnet/engine/commit/7d6592c438c6107c10108a0bf78b33b8849a8036))
- Silencing dotenv injection logs ([56b8e8e80](https://github.com/underpostnet/engine/commit/56b8e8e80f945c508c4cbc277a1f33c9f3977f6d))

### engine-cyberia

- Add development pv pvc dd-cyberia manifests ([ca4d3d342](https://github.com/underpostnet/engine/commit/ca4d3d3420e1d6a3801430e5c1a28e6377f39a0a))
- Fix object layer model Mongoose pre save next error ([506fb719c](https://github.com/underpostnet/engine/commit/506fb719cbd875e3ffdd1168cf2155bb0f083ba4))
- Add missing ethers packahge in CyberiaDependencies scope ([5f11cafe6](https://github.com/underpostnet/engine/commit/5f11cafe64abde831e497ed06be825a589e7ce23))
- Add Customize Docs release URL and MenuCyberiaPortal GitHub ([e879c2240](https://github.com/underpostnet/engine/commit/e879c22401af13d21056f0cd146f0292ae39fc31))
- Fix Hardhat CI npm audit failure ([3ea9ed486](https://github.com/underpostnet/engine/commit/3ea9ed486ebbc7e5e3879a61a26fcb2fa5071148))
- Update hardhat config evm version ([816e1d7d0](https://github.com/underpostnet/engine/commit/816e1d7d0594abd34f344c483fad1a62f0238cf0))
- Cyberia Portal Docs Modal Fixes ([9bd9eb1e4](https://github.com/underpostnet/engine/commit/9bd9eb1e493cb8136e47c73de3a8dbbb1393fe44))
- Add Cyberia portal docs build integration ([9d8abe001](https://github.com/underpostnet/engine/commit/9d8abe0017249002e13f8f7c1dde4a9b24e5348f))
- Kubeadm Underpost Cluster Besu Integration ([1df6cfbfb](https://github.com/underpostnet/engine/commit/1df6cfbfb32621243fb2be39de9aba8ebafbde6f))
- Fix Hardhat Web Integration Canonical CID ([bb2a81fab](https://github.com/underpostnet/engine/commit/bb2a81fab558f9f3c493e9cbae6f029ca9a1b404))
- Cryptokoyn and Itemledger metadata client and seo injects ([db8c9b337](https://github.com/underpostnet/engine/commit/db8c9b3372d29f84a27b5b40003f09d5956cefd2))
- Cyberia NPM Dependency Installer hardhat on main module override ([a43cc25ea](https://github.com/underpostnet/engine/commit/a43cc25ea59f6e36a1a52f53fcd1b6b1544168cc))
- Apply mermaid on diagrams in WHITE-PAPER.md ([0bb230e14](https://github.com/underpostnet/engine/commit/0bb230e14fe3639a9fe026e0c1f2da585856c04c))
- Hardhat Cyberia CKY Token Lifecycle ([514bdafae](https://github.com/underpostnet/engine/commit/514bdafaee5d345a7fa43d6b1aab2cd6917d5cee))
- Hardhat Ethers v6 Upgrade Audit ([114e42f7d](https://github.com/underpostnet/engine/commit/114e42f7dd7f549cda21b873461558fc8ce7c7ba))
- Hardhat ES6 refactor for Cyberia ([9b9f85693](https://github.com/underpostnet/engine/commit/9b9f85693cb7256e433b1184fd8dbf1739a3dbd9))
- Object Layer Token Ethereum Refactor ([82076eb9e](https://github.com/underpostnet/engine/commit/82076eb9e311ee003b7d91e38e60829f9e3b0f2c))
- Rename cyberkoyn reference to cryptokoyn ([ae5949337](https://github.com/underpostnet/engine/commit/ae5949337c5a27f4367cc93247023b1448491c9f))
- Refactor Object Layer White Paper and ERC1155 Besu Integration ([8cb6f59c2](https://github.com/underpostnet/engine/commit/8cb6f59c23a66265d5b663bec37ac0c402ffffad))

### cli-deploy

- Fix Kubernetes PVC Manifest Inconsistencies ([6839bccca](https://github.com/underpostnet/engine/commit/6839bccca30723e1cbd4664b31b0cede1ff63c90))
- Fix Kubernetes PVC Manifest Inconsistencies builder ([d6f311c60](https://github.com/underpostnet/engine/commit/d6f311c608217401ec145e70aab04206147a743e))

### client-core

- Fix AgGrid Theme Events Rendering ([4b37681f1](https://github.com/underpostnet/engine/commit/4b37681f19a102da5068c20998c0353bae604d54))
- Add logic to custom ui-icon in content component ([b380703c8](https://github.com/underpostnet/engine/commit/b380703c8a52abb3d37f390725a54ed6b88e5fcc))
- Fix sitemap generation logic ([7cfb23d01](https://github.com/underpostnet/engine/commit/7cfb23d01988d1f4ff288e8ce17d350c1d3af633))
- Fix sitemap builder defaul url sitemap ([c39f1e070](https://github.com/underpostnet/engine/commit/c39f1e07055f035da4f737f8ec6f2acfd621ca80))

### client-underpost

- Add File Explorer Cloud Menu Auth ([f3cc57e28](https://github.com/underpostnet/engine/commit/f3cc57e2818e36e56f34bc41f81846b64e48e2a8))

### api-core

- Fix deprecated Mongoose pre save next error ([bee1a5829](https://github.com/underpostnet/engine/commit/bee1a582926a0264be0cfb8ddf87f4ef01413a19))

### conf

- Add SwaggerDarkMode in dd-cyberia conf ([69d4c54f1](https://github.com/underpostnet/engine/commit/69d4c54f1e354e9f45b1b401796ca9702ac95698))

### bin-build

- Fix jsdocs cyberia json build ([20dbe54dd](https://github.com/underpostnet/engine/commit/20dbe54dd7f1e6559b231971afdba694a37315ca))

### cli-core

- Update -g8 option flag ([d1779a1da](https://github.com/underpostnet/engine/commit/d1779a1da5a2883408962fa231dad6342f8fe6d3))

## New release v:3.0.3 (2026-03-06)

### client-underpost

- Add volume src assets container path ([db4c3f292](https://github.com/underpostnet/engine/commit/db4c3f29242d2dee6b9510d1d7ecf5a2fd6611cd))
- Add ui icons images ([9bab63eaa](https://github.com/underpostnet/engine/commit/9bab63eaa62e069371a109199940f9dea236b5c8))
- Remove underpost public assets folder ([9b6130a98](https://github.com/underpostnet/engine/commit/9b6130a98202a7638dd194c8587fb95859cd088d))

### engine-cyberia

- Remove object layer base data.seed attribute ([e9044a337](https://github.com/underpostnet/engine/commit/e9044a3371a5de02a35c27a7ef9e4d3ce50a78b6))
- Pwa retro styles improve ([d9893c0ca](https://github.com/underpostnet/engine/commit/d9893c0cae4f514d4948df048b77bd96ae97f7a7))
- Fix object layer js docs commetns and css label direction improve in object layer engine ([c438eb329](https://github.com/underpostnet/engine/commit/c438eb329b7d7e94a6a278f6efc15df8cdbd0d72))
- Improve direction code labels in bar directions in object layer engine client component ([82a2c04fe](https://github.com/underpostnet/engine/commit/82a2c04fe930e35fbb2dd6b6f38e79d9cd4bd21b))
- Add Ledger Type and Render Metadata CID to object layer management table ([e75206bb1](https://github.com/underpostnet/engine/commit/e75206bb10b6bf31ec6e800ca0b91fcb67d925c4))
- Add ledger control view card in object layer viewer ([5afc50a94](https://github.com/underpostnet/engine/commit/5afc50a9427b13dc6082b96b7e62bda7a2f82e91))
- Remove _id of LedgerSchema ([82ded44b5](https://github.com/underpostnet/engine/commit/82ded44b530b42f67e34429da72e765d57dd618f))
- Implements data.render.metadataCid workflow to ref atlas sprite sheet render metada ([5df29b5cb](https://github.com/underpostnet/engine/commit/5df29b5cbfd51b69ebe5e1cc980a395ccbf8e961))
- ObjectLayer model render schema refactor ([dcc9e7287](https://github.com/underpostnet/engine/commit/dcc9e72872267900e731928f441c6546940a9c05))
- Add LedgerSchema and atlasSpriteSheetMetadataCid to object layer base data model ([b63e8a7f8](https://github.com/underpostnet/engine/commit/b63e8a7f8de49ba8178e54f86bae306fdbd3261e))

### engine

- Move underpost client to dd-cyberia conf ([b8dfbbb30](https://github.com/underpostnet/engine/commit/b8dfbbb30a43a8e5fa432f6c2b2d7c089d065fad))

### cli-run

- Implements CLI deploy job hostAliases support ([fbe7da801](https://github.com/underpostnet/engine/commit/fbe7da801910fc6ea7bffd8dfc3c3a7aaf40df1a))

### client-core

- Add RouterReady logic in Router component ([32bdb815e](https://github.com/underpostnet/engine/commit/32bdb815e9eb9cc70844c644dc54ea73f0e7a817))

## New release v:3.0.2 (2026-03-01)

### engine-cyberia

- Add test in engine-cyberia cd workflow ([642d7e361](https://github.com/underpostnet/engine/commit/642d7e36155b6db5dbd36e19767dd95f146ceaf5))
- Add build dd-cyberia shape generator exclusive module files ([188f563a6](https://github.com/underpostnet/engine/commit/188f563a61d7f6bf36bef93cdd18d4e1304f9747))
- Fix ObjectLayerEngineViewer return to list button click ([aeaead6f5](https://github.com/underpostnet/engine/commit/aeaead6f5c67a03449c63c584976e9a73ccc953d))
- Improve static generations assets in object layer generation CLI ([06694d92e](https://github.com/underpostnet/engine/commit/06694d92ea1ad849e745f561b8ec9a48bfa66056))
- Implements deterministic object layer generation CLI ([f70c9841e](https://github.com/underpostnet/engine/commit/f70c9841ef2efc9187c87427cc465505487766db))
- Implement shape generator module ([5741a38bc](https://github.com/underpostnet/engine/commit/5741a38bcfb8c1c4e0ef5053a2a6a73ff50a3879))
- Fix remove of ag grid table delete object layer delete logic ([e98953cd2](https://github.com/underpostnet/engine/commit/e98953cd29767ca44c2362997f0af40cd538371b))
- Centralize Object Layer Logic and add js docs ([ff8eefed0](https://github.com/underpostnet/engine/commit/ff8eefed08349a1e3390379f760c0d9eb20aecca))
- ObjectLayer Engine Viewer Enhancements ([0ee052e52](https://github.com/underpostnet/engine/commit/0ee052e5231f7b55576595a817742970c90cd056))
- Add metada json editor of object layers ([abe7448f5](https://github.com/underpostnet/engine/commit/abe7448f5ed7429ba1f5c5d01ed94c5c70323638))
- Remove helia pyntype logic ([2b443d1c0](https://github.com/underpostnet/engine/commit/2b443d1c0ed2261e27d5be54903c9a37cff29dd5))
- Object Layer Deletion Cleanup IPFS ([a2dcdf238](https://github.com/underpostnet/engine/commit/a2dcdf238c32d5b5237f0650232aca0c0823f044))
- Add Public GET Access for File Object Atlas ([826317fe2](https://github.com/underpostnet/engine/commit/826317fe21dfd0b77196ef343b31461c45b5eb72))
- Allow Cross-Origin on GET methods file, object-layer, and atlas-sprite-sheet api. ([6801839cc](https://github.com/underpostnet/engine/commit/6801839cc461dbec6ca205b035ea844415779e85))
- Add DISABLE_API_RATE_LIMIT env option ([ae72885c1](https://github.com/underpostnet/engine/commit/ae72885c1178846067db52b62455d804dbe4eeba))

### client-core

- Fix main-body-btn-container hide logic ([221f8bfc2](https://github.com/underpostnet/engine/commit/221f8bfc262048e1ca226f66f0dfab9891db3fd5))

### runtime-express

- Fix express rate limit trust proxy ([ed19e729e](https://github.com/underpostnet/engine/commit/ed19e729eafb59d46504fb1ebe89e4bd91c05d7e))

### cli-cluster

- Remove unused full flag ([13df39f50](https://github.com/underpostnet/engine/commit/13df39f508d65b61378ccfca4f7bfc427dcf5fa5))

### ipfs

- Add ipfs client stable json stringify in addJsonToIpfs method ([c2aaf56a4](https://github.com/underpostnet/engine/commit/c2aaf56a4bfc4f06147818ec5681567e27967f41))
- Fix config map IPFS Cluster daemon bind ([7e6df963b](https://github.com/underpostnet/engine/commit/7e6df963ba6da1fdc96ac5b6ab844a789901f61b))
- server ipfs client and object layer atlas sprite sheet ipfs integration ([781e35c49](https://github.com/underpostnet/engine/commit/781e35c4903380df9e7dce7cf5d9275387a46029))
- Implement ipfs api user-pin and client component service ([1b12e8df6](https://github.com/underpostnet/engine/commit/1b12e8df6af21e1dd2edc156e176072f25c9a433))

### cli-run

- Implements expose-ipfs runner ([765772b8f](https://github.com/underpostnet/engine/commit/765772b8fb1e7b397560464d1dc6dea0b70a9b7f))

### engine-core

- Clean up legacy logic and json file model ref ([b4c62a2cf](https://github.com/underpostnet/engine/commit/b4c62a2cfe4fea0212be644ce333464a81056f6f))

### bin-build

- Add missing       packagejson overrides on dd-cyberia build repository workflow ([7ece9ed55](https://github.com/underpostnet/engine/commit/7ece9ed5500e83a1baedc4d78fd889bca6ecac3c))

## New release v:3.0.1 (2026-02-22)

### engine-core

- Remove ENABLE_FILE_LOGS to default dev adn test env ([727486dc4](https://github.com/underpostnet/engine/commit/727486dc4030921c9d1f6a7035eb1a240569fa74))

### gitlab

- Fix package json lock template build ([e674ec6be](https://github.com/underpostnet/engine/commit/e674ec6be61d7a170ab468d473d0e545401b765a))
- Fix mirror push to GitLab ([9585aa50e](https://github.com/underpostnet/engine/commit/9585aa50ee481fa49084c0edd44cc28b4b2561e8))

### bin-file

- Add missing gitlab.ci.yml build to pwa-microservices-template ([ec49ded0a](https://github.com/underpostnet/engine/commit/ec49ded0ac3fbfcba1e7e10b0ed1dcfc13a8da87))

### client-core

- Add missing keyboard focus search box on iframes docs ([c5b0f86c7](https://github.com/underpostnet/engine/commit/c5b0f86c7acc0d2c964cc1ef80625693241e6d62))
- Add VanillaJs get selector in iframe ([e37fa3403](https://github.com/underpostnet/engine/commit/e37fa34037cff9924bc747f1ee11190ee2e1164b))

### giblab

- Add .gitlab-ci.yml ([a795bd5f3](https://github.com/underpostnet/engine/commit/a795bd5f3526257c858ec70ee27feb8bfd793baf))

### docs

- Add VanillaJs get selector in iframe sync darkTheme in docs component. ([5b2ba08f3](https://github.com/underpostnet/engine/commit/5b2ba08f3b0df3a6072aa49ca55efd223f72a95c))

### server-client-build-docs

- Enable Swagger UI Dark Light Mode ([eaadad70c](https://github.com/underpostnet/engine/commit/eaadad70cd74bcd9f7990dd63834bbd69bffcbae))

### github-actions

- Add gitlab mirror CI repository integration ([3d6acdefe](https://github.com/underpostnet/engine/commit/3d6acdefeea72f26a733975e822dbcf2b4e793e3))
- Fix GitHub Actions npm provenance ([cd31b8f0e](https://github.com/underpostnet/engine/commit/cd31b8f0ed202ed376016d3fc4b9fc63152f5186))

### cli-run

- Fix missing cluster type on runners id cluster and gpu env ([ddd72d2e3](https://github.com/underpostnet/engine/commit/ddd72d2e32e448b8956862f0719d5ab2d2ea7606))

### package

- Resolve npm ci lock mismatch ([357b4e816](https://github.com/underpostnet/engine/commit/357b4e81611541a0d979bc95cb587343bf540604))

### cli-repo

- Fix Changelog error due to type integration message ([750656e1c](https://github.com/underpostnet/engine/commit/750656e1cbee5dbb3e73d9d5cdd4d94ed049a4f1))

### cli-ipfs

- Fix underpost ipfs syntax import in main src index ([f7bebb655](https://github.com/underpostnet/engine/commit/f7bebb6555a85df35aed3e248dd0b304c00fd008))

## New release v:3.0.0 (2026-02-22)

### engine-core

- Add ENABLE_FILE_LOGS env ([8657e35f2](https://github.com/underpostnet/engine/commit/8657e35f2dab6cf1507a9b3f9146df45ab07d0dd))

### docs

- Rename cli.md -> CLI-HELP.md ([18e186893](https://github.com/underpostnet/engine/commit/18e18689349227b2c8769eec9f4e1ebeb85b8cf0))
- Apply fix in swagger-autogen@2.9.2 bug: getResponsesTag missing __¬¬¬__ decode ([2b0d27db3](https://github.com/underpostnet/engine/commit/2b0d27db38307d9276b14651083b0ac0c20ecaed))
- Remove unused jsdocs sections ([ec06f338c](https://github.com/underpostnet/engine/commit/ec06f338cca5d656f46629b8957e3ded183ecff7))

### bin-zed

- Move zed settings file tod zed js bin module ([ba32abeaf](https://github.com/underpostnet/engine/commit/ba32abeaff4d198c79bcd92ab0fc0120bb41d9d5))

### client-core

- Fix clear filter user management ([a1d796612](https://github.com/underpostnet/engine/commit/a1d796612654f0e03a4d64ad16dfed403ad0a771))

### package

- Fix resolve npm minimatch ReDoS vulnerability ([4739fea18](https://github.com/underpostnet/engine/commit/4739fea18407b88e407f7b4be109f2ecc3a3435e))
- Apply npm audit fix ([9496c5c77](https://github.com/underpostnet/engine/commit/9496c5c77980102fcb402aae29de3f72337adcc4))
- Apply npm audit fix versions packages ([a1ed004ee](https://github.com/underpostnet/engine/commit/a1ed004eecc1219e612027e9bc1f2fab4c717517))

### server-client-build-docs

- Apply Swagger autogen syntax error fix of version v2.9.2 ([7c8da2ff7](https://github.com/underpostnet/engine/commit/7c8da2ff7ffd55e7b0492f019a2b44294137ab39))

### vscode

- Remove vs deprecated settings conf, and remove vs extension to minimal and remove comments of vs extensions in vanilla js ([b2aec354e](https://github.com/underpostnet/engine/commit/b2aec354e757f136265b564a86cd1744bd460d88))

### cli-ipfs

- Implements base ipfs underpost dedicated module ([7f4f27f9c](https://github.com/underpostnet/engine/commit/7f4f27f9c63ff149c5dd4de57952961a2b3498d0))

### cli-cluster

- Add Main IPFS Cluster StatefulSet Integration ([53dd09038](https://github.com/underpostnet/engine/commit/53dd09038b47d1a8330ff1e72b0087d2600c93b9))
- Add --exposePort custom flag ([a29185fe6](https://github.com/underpostnet/engine/commit/a29185fe6f48c3babaa66d142d042909ca8b0889))
- Refactor pullImage load docker pull images to kind nodes ([3bdd5e787](https://github.com/underpostnet/engine/commit/3bdd5e787c242318cbab032816adf0008e9ab9dd))
- Add --replicas custom option ([70bdc6cdc](https://github.com/underpostnet/engine/commit/70bdc6cdc0cf2aa3b2025133a5438f55d7e1ad18))
- Centralize pullImage for k3s kubeadm kind ([873b20d5a](https://github.com/underpostnet/engine/commit/873b20d5a24b07afea39a95e0f705d1f8f01050b))
- Add snap install on init host workflow and cluster safeReset refactor ([48b4c33d5](https://github.com/underpostnet/engine/commit/48b4c33d59166d54042fc5f96b5b524eccbdf1ec))

### server-logger

- Add optional file logging to logger factory ([ef18a29e6](https://github.com/underpostnet/engine/commit/ef18a29e6e31e24e0e705446ca3cdf8804bda6ef))

### cli-lxd

- Refactor lxd module and workflows to vm cluster with k3s control and worker node integration ([812d5cdd8](https://github.com/underpostnet/engine/commit/812d5cdd86f3055c448b594c218ae6e99c365e38))

### bin-deploy

- Clean up legacy logic ([d3cb1139b](https://github.com/underpostnet/engine/commit/d3cb1139b3670915f6c612fd127541debb717d86))

### github-actions

- Add ref to checkout for provenance in cyberia publish workflow package ([6e0f9b593](https://github.com/underpostnet/engine/commit/6e0f9b5939103a366d28c4940e859d545cabdc34))
- Add ref to checkout for provenance ([0512ebecf](https://github.com/underpostnet/engine/commit/0512ebecf65d1379d29c2c0e2377733a4265c06f))
- Remove copying of MariaDB.js to underpost directory. ([d64c64ee9](https://github.com/underpostnet/engine/commit/d64c64ee99b015dd1e956f6ccc9055fcb73057f9))
- Fix package-pwa-microservices-template-ghpkg commit message propagation logic ([c8ef2ea8d](https://github.com/underpostnet/engine/commit/c8ef2ea8d89d1a37c4dacef4d2538304605369fc))

## New release v:2.99.8 (2026-02-18)

### github-actions

- Fix last commit message in npmpkg workflow ([6dd0f4845](https://github.com/underpostnet/engine/commit/6dd0f48452fd9810eeb3f535d8859d7e92a418fd))
- Fix MariaDB import in CI workflows ([2002c11f3](https://github.com/underpostnet/engine/commit/2002c11f312293be00c6434e4ba64a81a370e1df))
- Fix GitHub Actions commit message ([e36c4fb65](https://github.com/underpostnet/engine/commit/e36c4fb6592d17e4d3ffca1e8eede90105a5847b))

### dockerfile

- Underpost image dockerfiles file formats and clean comment ([6e22157c3](https://github.com/underpostnet/engine/commit/6e22157c3d276aab9dc328165e7bc686a339663b))

### conf

- Fix repository README logic builder ([d88c5317e](https://github.com/underpostnet/engine/commit/d88c5317e32b18b8d180d028e4ef9388ce6db78a))

### db

- Fix MariaDB import ([6edf3719b](https://github.com/underpostnet/engine/commit/6edf3719bf4ee71ebe30fb1e7e5a9767aaefe352))

### cli-static

- Fix module js doc path ([6b10a9295](https://github.com/underpostnet/engine/commit/6b10a9295422425863ef24f6eb7d76c67b248385))

## New release v:2.99.7 (2026-02-17)

### cli-ssh

- Fix batch remote execution ([3658db140](https://github.com/underpostnet/engine/commit/3658db140b550914b0c331723d7a8cd11999514a))

### cli-cron

- Change order exec createJobNow logic ([524b8b802](https://github.com/underpostnet/engine/commit/524b8b802dc40220cef8380dd9b7a80eb3055821))
- Fix error prepare subPath in cronjob subPath mount ([33bedaff2](https://github.com/underpostnet/engine/commit/33bedaff2a7e815e3522f4921e937384ee0b7750))
- Fix engine path definition and remove old cmd job in ci core sync command ([dbc5b6e6e](https://github.com/underpostnet/engine/commit/dbc5b6e6e863b6c11f6c186d3a6f52781920c2be))
- Refactor run sync cron and remove redundant cron runner ([5885a747a](https://github.com/underpostnet/engine/commit/5885a747acb16dc422b6d4007bfe403bbc896660))
- Add SSH flag to remote cron exec ([4339fb9d3](https://github.com/underpostnet/engine/commit/4339fb9d32dea3dc4d47da19d554347a6a5ab070))
- Add underpost cron jobs config env persistence ([d8d15eda8](https://github.com/underpostnet/engine/commit/d8d15eda887465300b58b6775d5c2b8d241010f8))

### cron-cli

- Enable createJobNow in cron setup-start ([bdce5ca0d](https://github.com/underpostnet/engine/commit/bdce5ca0df705daa25255b55ce15c1483bc8a717))

### cli-run

- Improve message commit clean on logic propagate in template-deploy runnner ([dfa641052](https://github.com/underpostnet/engine/commit/dfa641052bc71ad3c5c8c461651d1947dc5f21c0))
- Add replaceNthNewline logic in template-deploy runner ([282faf73e](https://github.com/underpostnet/engine/commit/282faf73ef32dc65e1b140af6f4e7609e964a503))

### github-actions

- Replace split logic ')' character, to simply deletes the first line and keeps everything from the second line ([6c1fbdf11](https://github.com/underpostnet/engine/commit/6c1fbdf1193cbf0f32cdfa9bccd11228d9f889f4))

### cli-repo

- Fix propagation message logic ([9ff035f15](https://github.com/underpostnet/engine/commit/9ff035f157b8433d5b236f46e54abc895b7ff626))
- Add logic to propagate integration commit message between repos ([4f7201c94](https://github.com/underpostnet/engine/commit/4f7201c945d1c0e95a604ff680bc2a64ac2e4c8d))
- Add --changelog-no-hash flag and logic ([d71cfe062](https://github.com/underpostnet/engine/commit/d71cfe062fe2a1a6b1f8678b64ee24faed4751f4))
- Add changelog commits logic to sub repo builds ([c8e94c32f](https://github.com/underpostnet/engine/commit/c8e94c32fdad0a68eeadd9ab599d640c7cdd3f51))
- Remove redundant --msg flag in cmt command ([59b529bb6](https://github.com/underpostnet/engine/commit/59b529bb6ecd5bf8ff14d5d686e96a1d9e6911a5))

### cli-system

- Fix missing fs import ([94bbd4ec7](https://github.com/underpostnet/engine/commit/94bbd4ec7aa5a154f12ae55657a77c7320ae3739))
- Add cli system module as a SystemProvisionig OS instructions provider ([d8e629e71](https://github.com/underpostnet/engine/commit/d8e629e71dcc580cf0d3997e88457a35466333a1))

### bin-deploy

- Add sync start scripts of each deploy id dd.router ([3d40afa8b](https://github.com/underpostnet/engine/commit/3d40afa8b84fa4329624177e242c9105519fe6e8))

### docs

- JSDoc name, descriptions, and render logic improvements ([01a288abc](https://github.com/underpostnet/engine/commit/01a288abcf25876c357678996913e4702487de28))

### cli

- Chore exports and ssh command description ([589f0403e](https://github.com/underpostnet/engine/commit/589f0403e9d20ccb3404a1980da956dd181b204a))

## New release v:2.99.6 (2026-02-15)

### cli-cron

- Add update envs with ip in dns job logic ([ab6850645](https://github.com/underpostnet/engine/commit/ab6850645b7c70af87cd9350863951ccafc95d89))
- Migrate PM2 cronjobs to Kubernetes cronjobs ([968361a23](https://github.com/underpostnet/engine/commit/968361a23d2a0c68df685641f10f0d3d4b0ed29c))

### build

- Fix remove dd-core cron files exclusive copy ([cb7b594f9](https://github.com/underpostnet/engine/commit/cb7b594f9feeb1062edf3cdfe41f85eb2c57e867))

### docs

- Improve cluster lifecycle and cron ref ([a15e9a8d8](https://github.com/underpostnet/engine/commit/a15e9a8d85e6168e581ff9a4d34e0efac6ff8e5f))
- chore main cluster lifecycle commands ([144db5f98](https://github.com/underpostnet/engine/commit/144db5f98a1829698867b7fe66ba55007d493eec))

### manifests

- Add k8s base engine core cron jobs yamls ([8c2e54a56](https://github.com/underpostnet/engine/commit/8c2e54a56b8e17a0de2da45a90d9e124be7c00ba))

### cli-static

- Add --run-sv flag to run http server to preview the static build ([bd73bdd08](https://github.com/underpostnet/engine/commit/bd73bdd08f174a75d2b687b587f93d110b165d60))

### cli-baremetal

- Fix nfs root directoy build cleanup logic ([302879a7c](https://github.com/underpostnet/engine/commit/302879a7c075175b95d29d70008370042e9da7bc))
- Add kickstart  commissioning workflow logic and Cloud init and kickstart bootstrap http server enhancements ([c0fecb911](https://github.com/underpostnet/engine/commit/c0fecb911c2f6a04a41673067c675f76fd7e3c0b))
- Fix ipxeBuildIso method with forceRebuild parameter ([b79f030c0](https://github.com/underpostnet/engine/commit/b79f030c059a0f7927507b0a54cadb82305a9d74))
- Add iso-ram rocky9 kickstart anaconda logic workflow ([2607edf22](https://github.com/underpostnet/engine/commit/2607edf222624295e9c96ff8a005c159c19bde49))
- Remove redundate logic and, add silent on run kill http bootstrap port ([95b7b990a](https://github.com/underpostnet/engine/commit/95b7b990aebccf2ba218457213837830683834a0))
- Add bootstrapHttpServerRun flag in baremetal callback for standalone http bootstrap run server options workflow ([e360a7d91](https://github.com/underpostnet/engine/commit/e360a7d91b9b7f7bcfc1d1749fbb7a99599b26dd))
- Remove machine system id in kernel params ([6a706392b](https://github.com/underpostnet/engine/commit/6a706392b6b09d5aabe2f0cd9d09efd774f22c4f))
- Add nfs server reset optional flag ([a42e76b54](https://github.com/underpostnet/engine/commit/a42e76b541858819662f563bf83b8fe0dda334a8))
- Remove chroot enlistment cloud init script ([c153b1860](https://github.com/underpostnet/engine/commit/c153b1860132f3b4e7aaaf20f7f2a4fd8c08fda5))

### client-core

- Fix iframe docs component inconsistent modals positions on pwa app cycle ([fe716235f](https://github.com/underpostnet/engine/commit/fe716235fbdac09c9fe80c5541af265b236ca06d))

### scripts

- MAAS DHCP dynamic range fix ([b89b577d5](https://github.com/underpostnet/engine/commit/b89b577d5d2717537ce6e280b89ea09d54bb4e05))

## New release v:2.99.5 (2026-02-11)

### client-docs

- Remove legacy static generator site guide docs ([cdb67b865](https://github.com/underpostnet/engine/commit/cdb67b865205abe28aec9c0ac433afce4a1003a1))

### cli-baremetal

- Add enable ssh in cloud init config in commission workflow ([9c3dee4f4](https://github.com/underpostnet/engine/commit/9c3dee4f4a67de92f24fb6087f0dbaad0e6de26f))
- Refactor commission workflow with cloud init cmd run commission enlist request ([2d908f761](https://github.com/underpostnet/engine/commit/2d908f76148821686afaa6c3601aee65aed96255))
- Add to IPXE build iso method iso-nfs commission workflow type support ([76476eb9c](https://github.com/underpostnet/engine/commit/76476eb9c3e30c555b7cb4f01bb4aa1f47a3c4eb))
- Add --ipxe-build-iso workflow ([4b3058849](https://github.com/underpostnet/engine/commit/4b3058849c0fb71a7ef3b2c3da75d39c8e5e9b6c))
- Fix baremetal machineFactory method and add fallbackArchitecture for commission arch handle ([7e921fee2](https://github.com/underpostnet/engine/commit/7e921fee2584038bea20aaa93239991b081103f0))
- Add hp-envy-iso-ram baremetal commissioning workflow ([c9a00a3c7](https://github.com/underpostnet/engine/commit/c9a00a3c78d228a10d7e0e1e3f0a69ef9f310cc8))
- Create maasCliExec method and apply centralized implementation ([752833c8d](https://github.com/underpostnet/engine/commit/752833c8dff81139f7166fba4b5e10430d81db36))

### cli-static

- Chore remoe redundant comments ([b8fb0259d](https://github.com/underpostnet/engine/commit/b8fb0259ddbc5f6ee20e3531b82a39cec0bce5e9))
- Simplified static example README.md and remove unused params build ([3ac1cc2c8](https://github.com/underpostnet/engine/commit/3ac1cc2c83913f4cbf8ed40364357c4f8cefb1ed))

### server-logger

- Refactor logger factory with log level and skip arg function param ([56394e5ea](https://github.com/underpostnet/engine/commit/56394e5ea35809e00028a84721bbc0fdb6a8eed7))

### cli-image

- Remove un legacy secretDockerInput ([8dc8e7a28](https://github.com/underpostnet/engine/commit/8dc8e7a280ef358f7f1f360afb68f2c5084e72c0))
- Remove legacy docker secrets logic ([4580efaca](https://github.com/underpostnet/engine/commit/4580efacacbec019dda566d039f37c84405a2d35))

### cli-cloud-init

- Fix kernelParamsFactory missing mac address arg ([207647c4d](https://github.com/underpostnet/engine/commit/207647c4d33b89f122e2be42745db649742d2434))
- Create kernerParamsFactory cloud init method ([57945e9a2](https://github.com/underpostnet/engine/commit/57945e9a2ce447a70625fa275514115591d381c5))

### cli-repo

- Add index from head in cmt --log flag history ([d3f9cb697](https://github.com/underpostnet/engine/commit/d3f9cb69715df648751ad2cbe0ebc98dee444211))

### package

- Remove --clear-discovered --remove-machines in default baremetal script ([276ff4e4c](https://github.com/underpostnet/engine/commit/276ff4e4ce7dffa8c5662ce6c1ba9c418e45ee3b))

### cli-run

- Add list disk devices runner ([14dc4d7e1](https://github.com/underpostnet/engine/commit/14dc4d7e11ef201e5782fb9dc2f0f8963d776e1e))

### src-index

- Add required nodejs major version warning ([c6ef0afd3](https://github.com/underpostnet/engine/commit/c6ef0afd32c1d3c278a8f76c5757139ae3339aae))

### cli-secrets

- Remove legacy docker secrets api ([7db58689c](https://github.com/underpostnet/engine/commit/7db58689c1d6bec538a7a49d8b48f916f77aba7e))

### bin-deploy

- Rename build/syncs envs batch workflows ([c2e89cf8d](https://github.com/underpostnet/engine/commit/c2e89cf8d9f5cb24ff505afc3b6fbf38760d7cb4))

### server-tls

- Chore js docs path module ([50e795a05](https://github.com/underpostnet/engine/commit/50e795a05a3b8f17f15d1380545f043a64b6fbff))
- Rename comments module to `UnderpostTLS` namespace ([9a4ed6088](https://github.com/underpostnet/engine/commit/9a4ed608856853137f2a02f22fa7b149c9be61d1))

### cli-config

- Add copy option to get operations ([5837f55fc](https://github.com/underpostnet/engine/commit/5837f55fc2da8e200ffa036bf353e07802841d8c))

### engine-core

- Rename default toPath in playwright workflow ([348e4cd6c](https://github.com/underpostnet/engine/commit/348e4cd6c0ed78d8e64e8761a67d5587533c1b04))

## New release v:2.99.4 (2026-02-03)

### cli-deploy

- Smplified existsContainerFile remove legacy useKindDockerPod ([ff877519e](https://github.com/underpostnet/engine/commit/ff877519e17726567d3eb33445e2a0f34782d70c))
- Refactor existsContainerFile and add useKindDockerPodlogic and remove legacy tf-vae-test monitor runner ([a7ab08669](https://github.com/underpostnet/engine/commit/a7ab086691d070613b305ec4e742486d73d72732))

### engine-core

- Add base playwright deployment ([8e020cd64](https://github.com/underpostnet/engine/commit/8e020cd64f64c0ff258a024765c25c36948edcba))
- Fix js docs params types and descriptions ([9c50af103](https://github.com/underpostnet/engine/commit/9c50af103ec7c2bd938aee620d62abeb2c061269))
- Revert compiler js options and set checkJs false to vs code problems ([e4566c6c3](https://github.com/underpostnet/engine/commit/e4566c6c33b3f862d7a75864d4930721af597050))
- Fix fas api load image with latest underpost cli version ([ac785df46](https://github.com/underpostnet/engine/commit/ac785df467d6b22df59ab3ec43bf73ec5b58f9a2))
- Fix: js config import meta module option ([58b22b734](https://github.com/underpostnet/engine/commit/58b22b7348c2924b70858f07cf39d248a89c1e4e))
- chore: License year ([987a1dc6b](https://github.com/underpostnet/engine/commit/987a1dc6b38e525376a8a030f39875774b5e55f1))
- Add volume in exclude js config and checkJs attribute ([e6bdd41a3](https://github.com/underpostnet/engine/commit/e6bdd41a397175d5d62ee622f824a4146b1b35db))

### client-core

- Fix user timestamps and CLI flags ([61109e3ad](https://github.com/underpostnet/engine/commit/61109e3adce4e918325bd1137ae6cb8c3c2a5156))
- Add Polyhedron immersive particle color palettes ([40471fabb](https://github.com/underpostnet/engine/commit/40471fabbf899b4019008d21b16dea93af43accd))
- Add Polyhedron component immersive fullscreen image faces mode effects ([8a00a8d79](https://github.com/underpostnet/engine/commit/8a00a8d7999bfb7de1d62c9201fe33c047d16a66))
- Chore missing translate key ([43a6c807e](https://github.com/underpostnet/engine/commit/43a6c807ea448c7887109f0e9abedff5b238b714))

### cli-baremetal

- Change args to options for more readable cli docs ([401f82b25](https://github.com/underpostnet/engine/commit/401f82b2521f65f91e846c9cba9ace79b420b945))

### server-proxy

- Fix tls base ref ([20afc3684](https://github.com/underpostnet/engine/commit/20afc3684e186a186353c1b8b3e548b098d4a40e))

### server-process

- Improve process.js run openTerminal with graphical as root ([298b265ca](https://github.com/underpostnet/engine/commit/298b265ca4ddaae6a2e0eb18b74f39b2ff7d3384))
- Fix openTerminal DBUS_SESSION_BUS_ADDRESS env ([58a248163](https://github.com/underpostnet/engine/commit/58a2481635e2778184210696204f3af95d0fe712))

### cli-run

- Add options.logs customization in git-conf runner ([2ae5d3cc3](https://github.com/underpostnet/engine/commit/2ae5d3cc39c87ebeab5218c3b1f5c3b04b87fd57))
- Add --logs and --monitor-status flags options customization ([1c395cc6e](https://github.com/underpostnet/engine/commit/1c395cc6ef21f3c156fd80295e665a4ea3576f9c))

### server-tls

- Add Underpost tls Namespace ([cc31c8ee3](https://github.com/underpostnet/engine/commit/cc31c8ee3d5be67e76f95948374d617980efe855))

### server-logger

- Refactor loggerFactory to custom underpostLogger with merge 'setUpInfo' interface typedef scope ([34ae041aa](https://github.com/underpostnet/engine/commit/34ae041aa2ae3dc19f78e131a5834753cc1be375))

### scripts

- Remove ([41af6e998](https://github.com/underpostnet/engine/commit/41af6e9988c036def7bbeb2c4ec3802a718ccd33))

### client-underpost

- Add base Polyhedron component view ([aefb59bed](https://github.com/underpostnet/engine/commit/aefb59bede3117459d4d4d6d0bf5b74a0e0133e2))

## New release v:2.99.1 (2026-01-29)

### cli-run

- In sync runner add cmd customization ([056564e51](https://github.com/underpostnet/engine/commit/056564e51cbfb90df60d5fa7a8b0331b3e972956))
- Add missin name space in ssh-deploy runners and add shh-deploy-db-status runner ([56b017e78](https://github.com/underpostnet/engine/commit/56b017e78cbae85feaa18e33116925bcb51a7aa2))
- Fix missing dev case in deploy runner ([6e928c0b4](https://github.com/underpostnet/engine/commit/6e928c0b4aa8d229d475e75f2e3b8d7824a97f00))

### engine-cyberia

- Fix handle missing atlas sprite fileId ([dc1adbc41](https://github.com/underpostnet/engine/commit/dc1adbc418b397b1413be118ec39c787edc018d2))

### github-actions

- Add init workflow deployment dd-core, dd-lampp, and dd-test ([1a56deb25](https://github.com/underpostnet/engine/commit/1a56deb2570571af4badc5294dd28dac9771aa8a))
- Add ssh-init-engine-cyberia worflow to dd-cyberia cd ([5478f7d76](https://github.com/underpostnet/engine/commit/5478f7d764ab5ed1747fc4ba0b82d339009c88cb))

### cli-ssh

- Add sshRemoteRunner for runner exec arbitrary shell commands on a remote server via SSH with proper credential handling ([3764291a9](https://github.com/underpostnet/engine/commit/3764291a90dc2361662409c602e74bb88c1f8269))

### cli-monitor

- Add multiple version async monitor support and rename version to versions for cli flag compatibility ([03a560970](https://github.com/underpostnet/engine/commit/03a560970db6b7a59e8b31f8b80d554101bbbaf7))
- Add readyDeployment monitor mode ([1e7a4fa9c](https://github.com/underpostnet/engine/commit/1e7a4fa9c7accd93a5c9fbbf820219cbf7d355ff))

### cli-deploy

- Fix ternary custom image handle on manifest build ([b02ba1056](https://github.com/underpostnet/engine/commit/b02ba105624c7455a082f6ddac233c05525aa9c0))

### cli-env

- Chore js docs comments in build param set method ([9c66cdfcf](https://github.com/underpostnet/engine/commit/9c66cdfcf8106a2d567475df1f2469529abc2226))

## New release v:2.99.0 (2026-01-28)

### cli-run

- Add custom etc-hosts runner ([541dbb0b0](https://github.com/underpostnet/engine/commit/541dbb0b003a346229c378726aba2b0cd00d7990))
- Fix runner sync deploy handle custom versions ([983feae4c](https://github.com/underpostnet/engine/commit/983feae4cf06ff3fff6f77baf0ad1c02cd34f84d))
- Add 'crypto-policy' runner to DEFAULT:SHA1 for compatibility ([cd24992e2](https://github.com/underpostnet/engine/commit/cd24992e238394b2aea3af769dea8de14c5994d8))
- Add top customers ps and headers in ps runner ([d221b8a8c](https://github.com/underpostnet/engine/commit/d221b8a8cb756dc97fded2b4429771a43d78b32c))
- Add top-consumers custom path to run ps (Displays running processes) ([c07e29be4](https://github.com/underpostnet/engine/commit/c07e29be495fdc62a9a2f458eff3ba0267b264f9))
- Add missing --timeout-response in monitor command ([a1f02fb4f](https://github.com/underpostnet/engine/commit/a1f02fb4f5f44bcd28b8da8325eb1a21618dc848))
- Add missing switchTraffic options object args, and centralize monitor switchTraffic ([314db0308](https://github.com/underpostnet/engine/commit/314db03081f4193ef32828a4623d65c509d4cb8b))

### auth

- Fix cookieOptionsFactory in development etc hosts session persistence case ([ab242ee3c](https://github.com/underpostnet/engine/commit/ab242ee3c99125d1608e71ca133f51101b21acaa))

### cli-config

- Add batch build deploy id envs in set method ([bb5857c32](https://github.com/underpostnet/engine/commit/bb5857c32a4c5587184772dde4f085abdba1e9be))

### cli-cluster

- Increment await time valkey-service status monitor ([a33d30fe1](https://github.com/underpostnet/engine/commit/a33d30fe1367ef96d59a8211f75548dba48dd09c))

### github-actions

- Update base underpost image version deploy from v2.8.846 to v2.98.3 ([dcbb9e836](https://github.com/underpostnet/engine/commit/dcbb9e8361cc395ab90e730a9a7951e7c5590980))

### server-dns

- Fix missing class ref getLocalIPv4Address and UnderpostDns export ([bf3112401](https://github.com/underpostnet/engine/commit/bf3112401131a1f1c3c1a9506d861072339016e4))

### cli-monitor

- Simplify and change to etc hosts test in development case monitor ([b2bbff6a2](https://github.com/underpostnet/engine/commit/b2bbff6a28c709faa6ce321ae124771d046024ca))
- Remove monitor-init-callback-script ([c95e759c4](https://github.com/underpostnet/engine/commit/c95e759c4c73c4ac92092314a89c51294047eba9))
- Simplify and improve monitor input runtime methods ([a68a43333](https://github.com/underpostnet/engine/commit/a68a43333877183d718398af9690bd24413d9d4f))

### cli-deploy

- Add flag --underpost-quickly-install in default cmd run deployments yaml ([04c16a943](https://github.com/underpostnet/engine/commit/04c16a94302f6a107c3e264adefa902d02179d3d))
- Add and centralize timeout response proxy flags ([e89a6e3f2](https://github.com/underpostnet/engine/commit/e89a6e3f2cf0dea7926743426d2e804ecb92aeb7))
- Add HTTPProxy response timeout option cutomization ([e9132794e](https://github.com/underpostnet/engine/commit/e9132794e1ad941bed69920d456a5f7d23189b27))

### engine-core

- Refactor and improve underpost modules and exports to Underpost index main class ([7865e95d4](https://github.com/underpostnet/engine/commit/7865e95d4a03cc9f32479de68c29463f17c1be45))

### cli

- Remove un used script command ([f79d65f34](https://github.com/underpostnet/engine/commit/f79d65f34b6d10a585b178c9486830e1a0457f84))

### engine-cyberia

- Remove duplicate comments ([923cc103b](https://github.com/underpostnet/engine/commit/923cc103b60c6cbc0d9d00badd89c39ac1470ac0))
- chore comments object layer component ([1cdf2e792](https://github.com/underpostnet/engine/commit/1cdf2e7924df9fa79cd5a9e0f62237e7ddc1dcf5))
- Add object layer api/component atlas sprite sheet integration ([499479a48](https://github.com/underpostnet/engine/commit/499479a48fd54a88169718ed367d8bac566e3326))
- Add in object layer viewer check if modal is open and DOM element exists before trying to render ([d3e4c75f3](https://github.com/underpostnet/engine/commit/d3e4c75f380fb0a18140b108e77f99a6c540c93e))
- Fix object layer viewer full grid reload on navigation router events ([3edb984fa](https://github.com/underpostnet/engine/commit/3edb984fabb0aee71f3f2e3e9853a5db5be0427d))

### cli-cyberia

- Add git clean assets directory on drop option ([7bddac9cb](https://github.com/underpostnet/engine/commit/7bddac9cbe2621295afe05dffe74cd6c191116c7))

## New release v:2.98.3 (2026-01-23)

### client-core

- Fix and robust Fullscreen Component for PWA for cross compatibility ([f303c1d52](https://github.com/underpostnet/engine/commit/f303c1d52ebd8d100209587291856d1d6b12b81d))
- Fix add restrict markdown link handlers to file on panel form component ([f498cc6e4](https://github.com/underpostnet/engine/commit/f498cc6e4fe5d9f9988c4fe57865645d7cb364b2))
- Add missing markdown-source-copied translate data ([8ee364b2c](https://github.com/underpostnet/engine/commit/8ee364b2c0e20be0f172be76f7c5c280d7c4a88c))

### engine-cyberia

- Fix object layer viewer prevent full grid reload on navigation ([50d9a20da](https://github.com/underpostnet/engine/commit/50d9a20da32663948a9beb115ddfc85e5196a5bb))

### cli-cyberia

- Add command to install cyberia dedicated dependencies ([a817e3161](https://github.com/underpostnet/engine/commit/a817e3161b64a204235949d0df049e7bfc0f7671))

## New release v:2.98.1 (2026-01-23)

### bin-deploy

- Add router default-conf build in version-build logic ([196b0c6f1](https://github.com/underpostnet/engine/commit/196b0c6f138dd9391e3b51facf5586bfee9b6a2f))

### scripts

- Rocky Linux setup script simplification ([06255c17d](https://github.com/underpostnet/engine/commit/06255c17d7bfdba7acc893c854f82820ba55225e))

### client-core

- Add PanelForm copy markdown option ([8e65564a6](https://github.com/underpostnet/engine/commit/8e65564a64728469df1bbb58cfc03fc828e400e4))
- Add PanelForm Markdown Link Click Handling ([1152759b3](https://github.com/underpostnet/engine/commit/1152759b388adffa30cfb7a179bf7f948cc06027))
- Fix document service search response bug ([04a4e3dcc](https://github.com/underpostnet/engine/commit/04a4e3dccc204b0a1dfe1b3743856eb74e3c6194))
- Remove unused services ([5be25ec9f](https://github.com/underpostnet/engine/commit/5be25ec9fcef5dbeda3171ea1be35cddf7ba8a9e))
- Add Default Management Clear Filter Button and related event listener and logic ([f0a55bab0](https://github.com/underpostnet/engine/commit/f0a55bab0dc4362914b8f4a6b6a1ddd9cd90ee79))
- Fix duplicate notification default management ([e74f96462](https://github.com/underpostnet/engine/commit/e74f964622fb942fec156d261e805334aa5642fa))

### cli-run

- Chore reorder runners keys in static runners attr ([7bebd6221](https://github.com/underpostnet/engine/commit/7bebd6221073318bff5c88109e6c1961c45ff860))

### cli-repository

- Chore rename g8 -> G8 comments and default options ([a624ffddb](https://github.com/underpostnet/engine/commit/a624ffddb8a63ec6367cd9f6ea7429a39d051caa))
- Fix -g8 flag and related logic ([aef3575b1](https://github.com/underpostnet/engine/commit/aef3575b11846fd6a50c88cec01bc243789de4cf))

### cli-cluster

- Fix unused kind-config-cuda conf on kind cluster ([e0b0cb2eb](https://github.com/underpostnet/engine/commit/e0b0cb2eb1b0eafecdb8d0e83a497236d989d5b8))

### bin-build

- Fix origin package json sub repo builder switch case ([67505c5f2](https://github.com/underpostnet/engine/commit/67505c5f24247141c199422670166f0c8e520fca))

### dependencie

- Remove systeminformation and cyberia module dependencies of base core engine ([b81b0a8dd](https://github.com/underpostnet/engine/commit/b81b0a8ddaa282a7fece263b26d7ce9d8aa4df5f))
- Add fast-json-stable-stringify dependencie ([7a0cd142d](https://github.com/underpostnet/engine/commit/7a0cd142d601a6f6285925bcec4d54c044569788))

### engine-cyberia

- Add ObjectLayer modal frame validation fallback ([3f6fe3ddc](https://github.com/underpostnet/engine/commit/3f6fe3ddcf7cea48e6946a863dd95b984cdc6f2c))
- Fix Filter New Object Layer Highlight ([f076e6c2f](https://github.com/underpostnet/engine/commit/f076e6c2ff7b7388b9770ccfb2297203e5da1a04))
- Clean up cyberia client legacy components ([ef85e18b9](https://github.com/underpostnet/engine/commit/ef85e18b9e9cfc818977bb93dd74a1ac6b985567))
- Refactor object layer model schema and add atlas cli sprite sheet generation and API support, with new object-layer-render-frames and atlas-sprite-sheet related models ([f7044c639](https://github.com/underpostnet/engine/commit/f7044c639d93f2b11168ce512bcddc2aff961c10))

### engine-core

- Fix default management new item filter in default management component ([a0ae66bd2](https://github.com/underpostnet/engine/commit/a0ae66bd2653f4fddeaa926471467b6f7b30576c))

### engine

- Converted all the static field initializers to getter methods in package main index.js ([fe11f6924](https://github.com/underpostnet/engine/commit/fe11f692414bfef514f27360f8cd23e8ebbd721e))

## New release v:2.98.0 (2026-01-14)

### client-core

- In file explorer add missing nav path after upload files ([22b9d3e33](https://github.com/underpostnet/engine/commit/22b9d3e33954ff067853928ea9d5ef12987b0e75))
- Simplify fileexplorer mimetype file info display from table files to edit modal ([ae4417434](https://github.com/underpostnet/engine/commit/ae44174343ff059d8bb3439afa2d890936c29e29))
- Implements file explorer document edit feature ([e5a8a84ed](https://github.com/underpostnet/engine/commit/e5a8a84edda93d7009fb3920b0d69bc93249a4cb))
- Implements Minimal Custom Pagination for File Explorer ([acf953b73](https://github.com/underpostnet/engine/commit/acf953b734a9af26f9ba63422cd6b0a2d9a2eade))
- Add clean search box history on logout event ([ffb07e12e](https://github.com/underpostnet/engine/commit/ffb07e12e0c407dc1d17410d4fb2a844cdc18124))
- Filter Document Search by idPanel Tag ([4f473489a](https://github.com/underpostnet/engine/commit/4f473489a2703ea0fb155b6fa04eccd0dfb85d40))
- Cleanup document model and streamline search logic ([9e3eebc75](https://github.com/underpostnet/engine/commit/9e3eebc75c8120949df22ebcfa62c9248a1d7897))
- Fix Epiphany responsive screen orientation compatibility ([c0e42ccdd](https://github.com/underpostnet/engine/commit/c0e42ccdd1baa71f77fd41cfbbedf5b60a1ea0cc))
- Implement preventing Orphaned Files in Document Service ([2f35476dd](https://github.com/underpostnet/engine/commit/2f35476dd94baf46e533005a9d20ab3e4512a064))
- Implement filter query default management browser navigation handler ([31dc83bac](https://github.com/underpostnet/engine/commit/31dc83bac5bb2bc2e8cea523890e9d161c89cae6))
- Fix auto save on cell edit in Default Management ([607d00858](https://github.com/underpostnet/engine/commit/607d00858198db401876a88a790a322c33d407c3))

## New release v:2.97.5 (2026-01-12)

### cli-db

- Implements orphaned file clean collections workflow. ([c69763c0c](https://github.com/underpostnet/engine/commit/c69763c0c4b04c98cb88011e77ca48668a157c8b))
- Add missing js docs comments ([e85df3ec0](https://github.com/underpostnet/engine/commit/e85df3ec02468ae4241f97c3b301982ec0f0dd50))

### client-core

- Add js docs comments in src/client/services/core/core.service.js ([a81a1ad85](https://github.com/underpostnet/engine/commit/a81a1ad85556ab706179fee175e7b6c2a95c1945))
- Centralizing Query Param Handling in Services with generic abstract method ([2ac38972e](https://github.com/underpostnet/engine/commit/2ac38972edacd643d6c33f4a7d700fcb2e1e4f82))
- Implements file explorer public toggle document switch ([580831d7a](https://github.com/underpostnet/engine/commit/580831d7af37276b70449ccff96ec2da45828c0d))
- Rename @private to @method js docs ([8e85094ca](https://github.com/underpostnet/engine/commit/8e85094ca86b7dad373faa6ef2acd911cdce9170))
- Implements base server data query SSRM pagination ([6341984c2](https://github.com/underpostnet/engine/commit/6341984c2c54c39c9933a10a5dca844937283d83))
- Remove unused /sh core api path ([47e475265](https://github.com/underpostnet/engine/commit/47e4752655eddf06d264aa7d4c7ab1a6ffc8fd5f))
- Implement client file service get blob by id generic switch use case with data defualt mode ([64686b615](https://github.com/underpostnet/engine/commit/64686b615232c5c59591c358962c64b2c846fcbe))
- Implements in api service file document ownership authorization validation ([d6663ca1e](https://github.com/underpostnet/engine/commit/d6663ca1e70dd67ea9bb4848caf7b3e5dacab456))
- Fix urlFactory abstraction method ([3cbe674f5](https://github.com/underpostnet/engine/commit/3cbe674f5d8774437dd5235a5e1cee7bc34a5da0))
- Improve cloud component transfer files to content componentn to render logic ([167f6a0d9](https://github.com/underpostnet/engine/commit/167f6a0d9cd3ca141be9d4240eecaebca53c8e57))
- Improve user profile image logic render ([451ffdf61](https://github.com/underpostnet/engine/commit/451ffdf613d4a44f9d09a112852cc1485c0a6973))
- Remove getDefaultProfileImageId, and simplify case use static resource avatar. ([1b64f824e](https://github.com/underpostnet/engine/commit/1b64f824e45ad95938f93aa3a5b35b42499cf263))
- Remove dotenv on object-layer module ([cf5173d95](https://github.com/underpostnet/engine/commit/cf5173d95199470a9314173403cad479d0372d67))
- Refactor and improve ux SPA public profile navigation consistency ([04d16bb65](https://github.com/underpostnet/engine/commit/04d16bb6565f8387e061df4fa06e33c88ebb9513))
- Fix chat socket io sub path connections ([b2aade8a2](https://github.com/underpostnet/engine/commit/b2aade8a2ca0151ecb3e1ee4fee67b64ed9343e1))
- Refactor public profile routing and user info handling ([cc6080a59](https://github.com/underpostnet/engine/commit/cc6080a5900b86b94def226b099777d642dde092))
- Remove unused pathOptions in setQueryPath ([4691f33eb](https://github.com/underpostnet/engine/commit/4691f33eb3392ddca92fa097ab1e74e7c0a37fb1))
- Implement and simplify dynamic public profile modal update ([30e9f2a82](https://github.com/underpostnet/engine/commit/30e9f2a82a40bbc71a7fd6a64e3ca0298b8e93d5))
- Implement public profile SPA navigation ([01d1061e0](https://github.com/underpostnet/engine/commit/01d1061e032085182b128bcf34750ee40dc14028))
- Fix panel component: Add conditional onclick clean-file event ([3056c7672](https://github.com/underpostnet/engine/commit/3056c76724d1703e9cdad54d24c3cd092952449d))
- Add public profile view in underpost client ([ca459d3b3](https://github.com/underpostnet/engine/commit/ca459d3b30d2f3010dd4522f3325d6b1f5afe25f))
- Implements username URI-Safe validator ([d0a17614a](https://github.com/underpostnet/engine/commit/d0a17614a47213245a4c53aedecbe0887edbb644))
- Implement PublicProfile onObserverListener ([935f43f6c](https://github.com/underpostnet/engine/commit/935f43f6c85aab826fc1c59b0a0f8baed84d0dd8))
- Add public profile public api endpoint ([2a419dffc](https://github.com/underpostnet/engine/commit/2a419dffc8a60a8864128459efac5533d480004f))
- Add PublicProfile component and user profile settings ([60dee0a82](https://github.com/underpostnet/engine/commit/60dee0a82dfcf1a779bb41c0909db09433bd4c6d))
- Add public profile and brewDescription in user model and account update related logic. ([6700fc5e4](https://github.com/underpostnet/engine/commit/6700fc5e4046d91122d7a1e597ead742a9f75119))
- Refactor SearchBox.RecentResults to ensure only serializable data is persisted to localStorage (excluding DOM elements). ([896480c25](https://github.com/underpostnet/engine/commit/896480c25ab4aa70691c3fdf8d33176a96945e91))
- Implements historySearchBox with SearchBox.RecentResults consistency ([e9088ccf1](https://github.com/underpostnet/engine/commit/e9088ccf1f6f22dcf2ea76989b9fc5347b3de189))
- Refactor underpost panel utf8 file handling and improve panel form file upload and header render user logic ([89ffa6677](https://github.com/underpostnet/engine/commit/89ffa6677ea8088717427faccc33548cc44acdbe))
- Improve PanelForm uploader avatar username render ([acfa25b66](https://github.com/underpostnet/engine/commit/acfa25b6601178621e0b5cdfed2f26c97a2b10f2))
- Rename panel form profile label ([fcd14d5c8](https://github.com/underpostnet/engine/commit/fcd14d5c8dc84ca73d796155f419d1bccc1efab1))

### clinet-core

- Improve public profile RouterEvents logic ([3e0ad850d](https://github.com/underpostnet/engine/commit/3e0ad850dfdfeb3433be081177b1ced2fb13a22e))

## New release v:2.97.1 (2026-01-04)

### conf

- Update default confs js with the last deploys conf changes ([f73782bf8](https://github.com/underpostnet/engine/commit/f73782bf829dd7d07075d0ba34691c936e096c4e))

### client-core

- Improve profile Image Avatar Implementation logic render ux/ui ([cd0946513](https://github.com/underpostnet/engine/commit/cd09465133b8f5ff941a8ff376f7a036d4b56499))
- Improve Public Tag Visibility and auth logic ([58d20ef70](https://github.com/underpostnet/engine/commit/58d20ef7078df2688abbc6941c19f4d90e2eb235))
- Fix Search Box scroll tracking logic on pointer search box history ([abc91914a](https://github.com/underpostnet/engine/commit/abc91914a47e7e60ce8f3c7ae9be6b8950d5f86f))
- Improve styles logic Search Box Icon and Panel Title ([b7093e313](https://github.com/underpostnet/engine/commit/b7093e31324316daf5c955849232abc7f3406821))
- Improve document search service with Optimization Strategy regex ([6ac9a165e](https://github.com/underpostnet/engine/commit/6ac9a165ea8efd29fdbdd1de55b08053d2780918))
- Improve Unified Active/Selected States style panel form tags ([59d0fa676](https://github.com/underpostnet/engine/commit/59d0fa676627734a57a386047b373d612f9963db))
- Improve panel form styles ([4931fa450](https://github.com/underpostnet/engine/commit/4931fa4507a4d3c82fd321a23fcbc71821d15009))
- SearchBox Refactoring add auth search box Security rules ([ee547ad99](https://github.com/underpostnet/engine/commit/ee547ad99f9a7a97e4c6e9cb0212f8d015ce026d))
- Implement and Abstract Modal SearchBox Core Component, and custom document search provider for underpost client. ([afdbfbc41](https://github.com/underpostnet/engine/commit/afdbfbc41eb654c1296c6189e0c8998a8ed3b8e7))

### client-clore

- Implement PanelForm creator avatar username option render ([424a4a05f](https://github.com/underpostnet/engine/commit/424a4a05f463dd722d8062d29f55743dbff369dc))

### cli-baremetal

- Improve Ubunut and Rocky chroot Linux Provisioning steps ([704a4e3b6](https://github.com/underpostnet/engine/commit/704a4e3b66215cb45cc8307f041270be26120f24))
- Refactor the `downloadUbuntuLiveISO` function to a generic `downloadISO` ([fc8e7a5e5](https://github.com/underpostnet/engine/commit/fc8e7a5e538a564da865db69a23d56598f4fe9b7))
- Reorder options workflow run tasks ([650c4f2a7](https://github.com/underpostnet/engine/commit/650c4f2a7f821ebfc20ca7b9860ee47c5740d6b7))
- Add rockyTools flags to Provisioning steps for Rocky Linux-based systems. ([e57c3cdcd](https://github.com/underpostnet/engine/commit/e57c3cdcdb56278687b1bb813f5703c979f2bba7))
- Refactored the baremetal kernel boot parameter construction to use OS family identification (`osIdLike`) from workflow configuration instead of hostname pattern matching. Also renamed the `chroot` type to `chroot-debootstrap` for clarity. ([775c70ad9](https://github.com/underpostnet/engine/commit/775c70ad9569c0301583e209d3127163367e9482))
- Implements Dracut NFS multiple version options ([700b407a2](https://github.com/underpostnet/engine/commit/700b407a20c94f32f59dda912df42bc9cadead12))
- Improve PXE iPXE kernel load workflow ([650440e0a](https://github.com/underpostnet/engine/commit/650440e0aa47aa4e88efb26038a4a58d0c90dc7d))
- Improve mountBinfmtMisc mountCmds and unMountCmds logic ([231b245b0](https://github.com/underpostnet/engine/commit/231b245b0bbad1cc529d105459cc0fcff28d2d33))
- Implement ipxeEfiFactory and improve iPXE shouldRebuild logic after cleanup tftp directory ([10511e3c0](https://github.com/underpostnet/engine/commit/10511e3c0e621ba384d87507a635dfaa7d4b8ab0))
- Implements base Rocky9 ARM64 NFS Chroot Workflow ([b642f2255](https://github.com/underpostnet/engine/commit/b642f22557ab42cf6a7b6d9a0da5203ec70c9752))
- Implements base rpi4mbarm64-chroot-rocky9 commission workflow ([d95246327](https://github.com/underpostnet/engine/commit/d95246327095889b04db88b478601ab266d2127b))

