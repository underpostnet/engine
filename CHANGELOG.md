# Changelog

## 2026-05-01

### bin-build

- Update build.js to replace jsdoc references with typedoc for documentation generation ([198f69d43](https://github.com/underpostnet/engine/commit/198f69d433fb76da8bfdb1581286a0ce5f2e6454))
- Update cyberia custom folder ([b03ad6dca](https://github.com/underpostnet/engine/commit/b03ad6dca6faa4ed339b3baa60aa15320fbcfcb7))

### docker-image

- Add Node.js installation to Dockerfiles for cyberia-client and WordPress ([c06748453](https://github.com/underpostnet/engine/commit/c06748453caf588a7801ebc7650945ebcab2dce2))
- Update Dockerfiles to enhance system package installation and cleanup ([13506d7b3](https://github.com/underpostnet/engine/commit/13506d7b39d9e674d5e790b8721cb63e1e9e5001))
- Remove conditional repository check from CI workflow files and add CI workflow copying logic in run.js ([0d9f1520c](https://github.com/underpostnet/engine/commit/0d9f1520c721d36ffda33aacbe4d3ee9d8b59486))
- Rename template-deploy-image method to docker-image and update workflow file reference ([75eb4b932](https://github.com/underpostnet/engine/commit/75eb4b9328ec05b815f12e416dc22186ec6f05d2))

### cli-run

- Enhance image pulling logic to skip local images and check for existing images in the cluster ([c3f33ed74](https://github.com/underpostnet/engine/commit/c3f33ed746674486ce302d014ed4ec406252de65))
- Refactor deployment manifest generation to improve clarity and structure; update Dockerfile paths and instance handling ([c99a67d95](https://github.com/underpostnet/engine/commit/c99a67d952e14e665a710507864e6b7ce907505f))
- Fix image pulling logic to prevent unnecessary Docker Hub requests for local images ([88556c528](https://github.com/underpostnet/engine/commit/88556c5281c7986479b1710a693b21592cc0ecd8))
- Add push-bundle and pull-bundle methods for zip file handling and deployment ([e82379907](https://github.com/underpostnet/engine/commit/e82379907267e483177e6be2374cb6c922aa42b2))
- Add pull-rocky-image method to pull Rocky Linux image via Podman ([59f7e6245](https://github.com/underpostnet/engine/commit/59f7e6245b2b5a49fbd14e28632915952f0cde00))

### cli-ssh

- Fix console log output ([2cd7e7a12](https://github.com/underpostnet/engine/commit/2cd7e7a12f53cdc03c79921d13c71d88276e55bc))

### bin-file

- Add guest.service.js to the list of files in the workflow configuration ([760a196a9](https://github.com/underpostnet/engine/commit/760a196a92853ac05b2765fb27df6894955aaaba))

### dockerfile

- Remove non-root user creation and unnecessary comments from Dockerfiles ([494194da2](https://github.com/underpostnet/engine/commit/494194da26d08b60b94789ad50a3183387a44847))

### package

- Add missing workbox-cacheable-response package ([0dd5cbe4f](https://github.com/underpostnet/engine/commit/0dd5cbe4f0cad214448ac537465041e4cc701d62))
- Remove legacy peer dependencies from package-lock.json ([60b4c70f0](https://github.com/underpostnet/engine/commit/60b4c70f05c62132ff3d27aa410bd9ec4914d4f0))

### docs

- Update README.md intro ([9672ca542](https://github.com/underpostnet/engine/commit/9672ca54281bbd50f30809fefce58dbe41334c36))
- Fix iframe handling in Docs component to maintain parent scroll position and synchronize layout on navigation ([032bd1a81](https://github.com/underpostnet/engine/commit/032bd1a8193a3386edd0fe28c63ea863c3ce6d16))
- Migrate from JSDoc to TypeDoc for documentation generation ([596bd8d46](https://github.com/underpostnet/engine/commit/596bd8d462f5b2b6a2f185285b555554e7440563))

### runtime

- Add Node.js installation and verification steps to Dockerfiles for cyberia-client, cyberia-server, express, and lampp ([58b2c2a51](https://github.com/underpostnet/engine/commit/58b2c2a513a54fdbf6188a2a7bb4ac74d78d8bcb))
- Refactor Dockerfiles to improve package installation clarity; update comments and streamline system package installations ([a64cf8881](https://github.com/underpostnet/engine/commit/a64cf8881f8675457b74ae9edbdbd619a636b6e6))

### cli-release

- Update image versions in conf.instances.json files during release process ([3af315b92](https://github.com/underpostnet/engine/commit/3af315b923621e74ae75640f8f782535350e7f41))
- Update Docker image version tags in release process to reflect new versioning scheme ([07a943f30](https://github.com/underpostnet/engine/commit/07a943f308679bbefffc22d284c832971a467f75))

### github-actions

- Add CI workflows for cyberia-client, cyberia-server, express, lampp, and wp; update deployment scripts for new image versions ([1d6d64d73](https://github.com/underpostnet/engine/commit/1d6d64d732bb311ee5aca6e8a680c83086c9b654))
- Refactor deployment commands to simplify sync and remove redundant npm installations ([9cce90390](https://github.com/underpostnet/engine/commit/9cce9039041ec5b160453a38e7b81ba72899b886))
- Update deployment configurations, service ports, and proxy settings for development environments ([07efd0975](https://github.com/underpostnet/engine/commit/07efd09750fd2976c89bbe37f500a0c9f439179b))
- Update container images and simplify base command in CLI sync function ([e5d22868d](https://github.com/underpostnet/engine/commit/e5d22868d610f11fc241bdfa3ddc4fb5eb39a18d))
- Fix deployment command to remove redundant sync flag in engine-cyberia workflow ([f4d959738](https://github.com/underpostnet/engine/commit/f4d9597383c39eeeb4b7742b4d3f3a554eb85585))
- Fix sync command in CI workflows to remove hardcoded image version for engine core and cyberia deployments ([1d6aa177b](https://github.com/underpostnet/engine/commit/1d6aa177b14362f6b2c7bcd81043738ad671277d))
- Update deployment commands in CI workflows to remove hardcoded image versions and enhance command execution ([5af414cc1](https://github.com/underpostnet/engine/commit/5af414cc13bc4448ff187277b1fd1f5f6740ffa9))
- Refactor deployment commands to comment out npm installations and adjust secret command execution based on environment options ([0a72d037e](https://github.com/underpostnet/engine/commit/0a72d037eb20ef45d53e84af8a54714314e3da11))

### engine-cyberia

- Add cyberia-server and cyberia-client to build and file copy paths ([124582559](https://github.com/underpostnet/engine/commit/12458255961a68c92fb1809cba7e2848fb30ec6d))
- Enhance Cyberia instance configuration handling by ensuring updatedAt is set during import and resolving missing config references with instanceCode lookup ([5b12e7f48](https://github.com/underpostnet/engine/commit/5b12e7f488273f7cceff5e781547d749448bd953))
- Update MongoDB findOneAndUpdate options to use 'returnDocument: after' for consistency ([90abee1ef](https://github.com/underpostnet/engine/commit/90abee1ef6be0972701f59b43a3be7b65d4a1337))
- Add randomization feature for stat inputs in ObjectLayerEngineModal ([b29f361a6](https://github.com/underpostnet/engine/commit/b29f361a6406f9bde350897f72970b72aba14935))
- Add item IDs management and dropdown functionality in InstanceEngineCyberia ([417c82cf4](https://github.com/underpostnet/engine/commit/417c82cf4534c0921b5eeafacbd1a6d951740d2b))
- Add direction preview functionality to ObjectLayerEngineModal ([5ef3c4489](https://github.com/underpostnet/engine/commit/5ef3c4489ff04e1e224b75ba0434d0e6413a583b))
- Add uniform opacity feature to ObjectLayerEngineModal ([c8830efb3](https://github.com/underpostnet/engine/commit/c8830efb32ce50b0a65e328fc2760c3b4fc4020e))
- Refactor canvas behavior handling and add mosaic types in ObjectLayerEngineModal ([08b9ea4b2](https://github.com/underpostnet/engine/commit/08b9ea4b2d5fda699687451fe5b562fc190ad92d))
- Implement distortion types and functionality in ObjectLayerEngineModal ([dbe9edc31](https://github.com/underpostnet/engine/commit/dbe9edc312dc023981b32e362653c9cf6d65d4eb))
- Refactor item and entity type handling in Cyberia components to utilize shared constants and improve dropdown functionality ([67b528675](https://github.com/underpostnet/engine/commit/67b528675689bcebb68f0b521924cb59ac984c19))
- Fix frame metadata assignment in AtlasSpriteSheetGenerator to correctly set frame index ([d17b30366](https://github.com/underpostnet/engine/commit/d17b30366574ed91a3797120e16b73c0ceb5afff))
- Add frame_duration property to AtlasSpriteSheet model and update related services for frame duration handling ([5ce0eef0f](https://github.com/underpostnet/engine/commit/5ce0eef0f12f318312475a460e912d30808b9f76))
- Remove is_stateless property from ObjectLayerRenderFrames model and related components for simplification ([f924f1f4f](https://github.com/underpostnet/engine/commit/f924f1f4f8600a43fb437a7829e8cb024f3775d5))
- Add ColorPaletteElement and integrate it into MapEngineCyberia and ObjectLayerEngineModal for enhanced color selection ([0403c362c](https://github.com/underpostnet/engine/commit/0403c362c48ceea77f03475117305b07f0ca1dbf))
- Enhance resource entity handling by adding dropItemIds and updating schemas for extraction logic ([72ccee238](https://github.com/underpostnet/engine/commit/72ccee238eb01944b872bb7c77f7d638f772aa5d))
- Add clone logic object layer modal engine ([b03c41b60](https://github.com/underpostnet/engine/commit/b03c41b60f45fa481e55f88256edbef6fa4d2729))
- Update entity status documentation and add 'resource-extracted' status icon ([7f1be1e3d](https://github.com/underpostnet/engine/commit/7f1be1e3d9e8c19fc36637131cf491d1ba26a585))
- Update skill logicEventId for atlas_pistol_mk2 and add projectile skill for hatchet ([1c1f36bf8](https://github.com/underpostnet/engine/commit/1c1f36bf87110a14e3b8665b87ccf00f40a245d5))
- Refactor skill configuration to use structured skills with detailed attributes ([5cb12ba46](https://github.com/underpostnet/engine/commit/5cb12ba4684a4884ee736183e955f06370c0cae8))
- Add resource semantic descriptors and shape generation for collectible resources ([a22c63b73](https://github.com/underpostnet/engine/commit/a22c63b730f5f9d57b38c7c9998f7f0775a2b031))
- Add versioning to instance response using SHA-256 hash of updatedAt timestamps ([ea2598386](https://github.com/underpostnet/engine/commit/ea2598386e48f3494fffaab02c210ed59095025b))
- Add parseRgba function to handle CSS rgba() color strings and update toEntityMsg to include RGBA components ([25aeb9572](https://github.com/underpostnet/engine/commit/25aeb957256e82687d5d9d60b2cd458e049d9b68))
- Refactor toInstanceConfig function for improved color merging logic and enhanced handling of entity defaults ([23adaab83](https://github.com/underpostnet/engine/commit/23adaab83701e1df2246cca9870a627e15e965c4))
- Implement Base Cyberia Achievement API with CRUD operations and service integration ([67faa4911](https://github.com/underpostnet/engine/commit/67faa49113bac62589d0d61c3b7c6cf527d7437c))

### client-sw

- Enhance service worker to distinguish between server downtime and offline status for improved error handling ([c32233e95](https://github.com/underpostnet/engine/commit/c32233e954c2b9f7029d44f6dc55d2b849c28d23))

### client-core

- Implement cache management and reset functionality in PWA worker and service worker ([6864157e7](https://github.com/underpostnet/engine/commit/6864157e709f05f47899950fa28206e6a4dfdd5e))
- Add resolveBrowserImportPath function and improve import rewriting logic ([ad796f1da](https://github.com/underpostnet/engine/commit/ad796f1da05804e4bfb13316017662e353165d1e))
- Refactor client build process to dynamically handle service files ([ec0ffb6e8](https://github.com/underpostnet/engine/commit/ec0ffb6e81dc1659f26552d894dcbd12f5159d02))
- Refactor Auth and Guest Services for Improved Token Management ([650ec6b61](https://github.com/underpostnet/engine/commit/650ec6b6162fc5db8f47cf74f433c399b2c2fdb9))
- Refactor management components to use instance methods instead of static RenderTable ([67382a9d5](https://github.com/underpostnet/engine/commit/67382a9d5576ac8dad54b36de4ea14730cda2fe0))
- Fix LoadingAnimation to correctly reference img tokens and simplify onload/onerror handlers in ObjectLayerManagement ([051bb65dc](https://github.com/underpostnet/engine/commit/051bb65dc5631dd96296ea8e254a1818576b10a8))
- Refactor Modal, Panel, PublicProfile, SearchBox, and ObjectLayerEngineModal components to use class syntax and static properties for improved structure and maintainability ([3e514e579](https://github.com/underpostnet/engine/commit/3e514e57913bc90475b7b8fc06bef43eb583428a))
- Remove JoyStick component and its associated functionality from the codebase ([e08173436](https://github.com/underpostnet/engine/commit/e08173436a3788f7fd8d80dc966973fec04f556d))
- Add Modal layout synchronization and streamline Docs component by removing unused Responsive references ([2fa05c3b9](https://github.com/underpostnet/engine/commit/2fa05c3b9a2cb2a1ecdf1ddbb433885a4b6d769d))
- Refactor Responsive event handlers in Docs and Modal ([2a2e0c90e](https://github.com/underpostnet/engine/commit/2a2e0c90ec7c7d5887cedb824bb0677bf7489b19))
- Update routing logic to use registered routes in getProxyPath and register routes in PwaWorker initialization ([c70544559](https://github.com/underpostnet/engine/commit/c7054455937636e84894a4b709ae5c73704becb1))
- Refactor routing structure by consolidating route definitions into dedicated Router files for Cryptokoyn, CyberiaPortal, Default, Dogmadual, Healthcare, Itemledger, Nexodev, and Underpost components. Removed legacy Routes files and updated imports accordingly. This change enhances code organization and maintainability. ([68d6accdb](https://github.com/underpostnet/engine/commit/68d6accdb15aca8fd58f5336eee8e4bfa570b588))
- FIx LoadingAnimation methods to use correct token storage for bar and spinner components ([3884039c3](https://github.com/underpostnet/engine/commit/3884039c3d36b097e1dd465917eb88be20bd38b2))
- Update default configuration to replace 'MenuDefault' with 'AppShellDefault' for improved clarity ([c0eae3962](https://github.com/underpostnet/engine/commit/c0eae3962476d4183555e9ef80e7048347b31bf0))
- Refactor event handling to use new event system across components for improved responsiveness and maintainability ([d3c33f71f](https://github.com/underpostnet/engine/commit/d3c33f71ffe12a8e695121aab027e61e41e96014))
- Refactor authentication components to use EventBus for login, logout, and signup events ([119104765](https://github.com/underpostnet/engine/commit/1191047652a0c51e6484eca40f931d9c7c3af49f))
- Refactor rendering methods to use 'instance' instead of 'Render' in various components and services for consistency and clarity ([4b9424f6d](https://github.com/underpostnet/engine/commit/4b9424f6d945183e0450bc527a41e2049f18e8a9))
- Fix to use const for event listener objects in Css, Router, and Valkey modules ([35b3987d5](https://github.com/underpostnet/engine/commit/35b3987d556e19d5dd92d3c707f3cb770d81e1b4))
- Refactor to ES6 class static methods ([6f5625594](https://github.com/underpostnet/engine/commit/6f5625594b6b1efd74ffb30f9e01b77a121c7bd2))
- Refactor entry point files to streamline initialization and improve structure ([97d833c20](https://github.com/underpostnet/engine/commit/97d833c20658c864c3c76665b2f0d94b21e8c939))
- Rename Menu to AppShell components with menu and routing functionality ([503aca7d9](https://github.com/underpostnet/engine/commit/503aca7d9620eaac43ed0eb67e753b794b44c284))
- Remove inline styles from RichText component ([8256212be](https://github.com/underpostnet/engine/commit/8256212be9cd50a1efd34f06a18d52cc6b334cdc))
- Add 'add-component' command to deploy script for dynamic component management ([ac166e3ca](https://github.com/underpostnet/engine/commit/ac166e3ca590237877fc49c02e7fa527f7dc3dfe))

### server-build

- Refactor client build process to enhance resource pre-caching logic and prioritize critical paths ([6566b9583](https://github.com/underpostnet/engine/commit/6566b9583e437242a98b3ab611bc9c3038899102))
- Enhance resource pre-caching logic by filtering out unnecessary files in client build process ([9543fdb3a](https://github.com/underpostnet/engine/commit/9543fdb3aa72e3a80660cc02b8535fb92c74dc49))

### conf

- Udate package.json for server entry point and script adjustments ([df84b5af2](https://github.com/underpostnet/engine/commit/df84b5af2975f718a841b58d7c6ed1ba98d5e581))
- Rename 'ClientEvent' to 'ClientEvents' for consistency in configuration ([bddd3daa0](https://github.com/underpostnet/engine/commit/bddd3daa0bf217d817ea05ce3d94e805900ab4b1))

### cli-client

- Add checks for replica context in repository and configuration handling ([a8d925ad3](https://github.com/underpostnet/engine/commit/a8d925ad37e57a1f99fc15826dc2ddd265d2c120))
- Add checks for replica context in repository and configuration handling ([c42462968](https://github.com/underpostnet/engine/commit/c424629688226e3b8b20a0828c0fe8e8a1003cc3))
- Add --merge-zip option and implement mergeClientBuildZip function for combining split ZIP parts ([15408be66](https://github.com/underpostnet/engine/commit/15408be66eb6fab1276a05625eb768baa9ae9ea4))

### engine-core

- Refactor DefaultManagement and ObjectLayerManagement to use instance properties instead of static properties for eGui and tokens ([2d7da8169](https://github.com/underpostnet/engine/commit/2d7da81695556d3404cca1ddbf8a794ac1a4c75d))
- Add cecinasmarcelina client assets ([045fe5add](https://github.com/underpostnet/engine/commit/045fe5adda88a3c0ce487ee3189611a718ce90fd))
- Add cecinasmarcelina base client ([d67924b1a](https://github.com/underpostnet/engine/commit/d67924b1a002cc2e55772f6334da86c010303ec8))

### bin-deploy

- Refactor 'add-component' command to support optional parameters and improve error handling for component addition ([3d5103d11](https://github.com/underpostnet/engine/commit/3d5103d11bcadeeee530cd32d8ad7ab342f4fc7e))

### engine

- Update deployment configurations and update service ports ([e0a78d38b](https://github.com/underpostnet/engine/commit/e0a78d38bfc87353ab3490de3b6824fd1cb991b4))
- Update moduleResolution in jsconfig to use 'bundler' ([307f5e106](https://github.com/underpostnet/engine/commit/307f5e1062edbb6b3356f0ccb0088cb90ee662cc))

### cli-fs

- Enhance zip file handling in deployment process to check for existence of bundles and parts ([0bda824f2](https://github.com/underpostnet/engine/commit/0bda824f247e315f3886f36d7f2cdbcec42c21cd))
- Enhance mergeClientBuildZip function to clean stale part files and improve part file handling ([963720fab](https://github.com/underpostnet/engine/commit/963720fab68e78a756552347c3259eb48091ee0e))
- Enhance pull method to support force option and improve zip file handling ([d6f5fa3f4](https://github.com/underpostnet/engine/commit/d6f5fa3f442fa641edbe200f27ba9e1ba2d1b92a))
- Add --omit-unzip option to pull command to retain downloaded zip files ([a5cf84b11](https://github.com/underpostnet/engine/commit/a5cf84b111aae533cc1fe5dc09809928695826d1))
- Refactor recursive removal logic in UnderpostFileStorage to improve path handling and logging ([f890ae6a8](https://github.com/underpostnet/engine/commit/f890ae6a8d7004a74ec96b219dd3f455db894183))
- Implement recursive removal of tracked storage keys and enhance logging for associated paths ([5cb5d7172](https://github.com/underpostnet/engine/commit/5cb5d71724ac2c687a105ed0a953a9d36e0fbc20))

### cli-start

- Enhance deployment options by adding --skip-full-build flag and updating deployment commands to support skipping full client bundle builds. ([62594bd32](https://github.com/underpostnet/engine/commit/62594bd3264465e2ebb52e12b396e50c64ed5086))

### client-build

- Add unzip functionality for client build zip files and enhance deployment commands ([3e8216ae6](https://github.com/underpostnet/engine/commit/3e8216ae6fc2b08c25f09f0d3188c485cdd42c40))
- Add support for splitting generated zip files into specified sizes ([9a5d46efc](https://github.com/underpostnet/engine/commit/9a5d46efc231c2760b9daf0bc201a1db06c6f248))
- Exclude .git directory from file copy operations in client build process ([ad99de0ac](https://github.com/underpostnet/engine/commit/ad99de0acb9fce275c1768b8940138e1d2ed78ac))
- Remove deprecated HTML website templates handling from client build process ([72e5462d0](https://github.com/underpostnet/engine/commit/72e5462d0e2f0ae887984a6129069e1a5b8fdd60))

### cli-deploy

- Update configMap method to use dynamic cronDeployId for secret creation ([f4e21e57b](https://github.com/underpostnet/engine/commit/f4e21e57b04da2527b7718b19ad07384116b9e14))
- Add 'clone-server' command to replicate server configurations between deployments ([d0f28a43c](https://github.com/underpostnet/engine/commit/d0f28a43ca94f819f5a0fafae1723ea5d388d678))
- Add 'add-server-client' command to streamline client configuration cloning ([2471506ec](https://github.com/underpostnet/engine/commit/2471506ec1215d02b287fb972757904e35ac6ebc))
- Add 'clone-client' command to duplicate client configurations and assets ([ae61478ca](https://github.com/underpostnet/engine/commit/ae61478cad677b83be83c0134dd80437afd57dad))

### cli-run-instance

- Enhance deployment functionality by adding debug port support and updating documentation for configuration parameters ([8af8c3eae](https://github.com/underpostnet/engine/commit/8af8c3eae2344c6afd2b91d30095e84fba0121a5))

### cli-cyberia

- Enhance --drop option to clarify its functionality and improve item deletion logic in import process ([800803cce](https://github.com/underpostnet/engine/commit/800803cce1d3a674ed5993fcb72d12e51e5e4077))
- Add --conf option to export/import for processing configuration files only ([43ee7fab5](https://github.com/underpostnet/engine/commit/43ee7fab5b79b63001786f81c36da590f0d91fd4))
- Enhance IPFS export process with resource type inference and backup payload handling ([ad07f788f](https://github.com/underpostnet/engine/commit/ad07f788fb95ab09ef359b3d3040484ddcd2445c))
- Add CyberiaDialogue support for export and import processes ([786c806fb](https://github.com/underpostnet/engine/commit/786c806fbf9963d7116596910ffe1295dd69ee78))
- Enhance IPFS client and export processes with new functionalities ([d174dc80d](https://github.com/underpostnet/engine/commit/d174dc80d5ed4970e0e0c85a8b01d3dca884cfb4))
- Enhance IPFS export process to infer resourceType from mfsPath and ObjectLayer references ([41eee660c](https://github.com/underpostnet/engine/commit/41eee660cc2204d9a63714a26973df98b8ef8f38))
- Enhance IPFS export and import processes to infer resourceType from mfsPath for legacy records, ensuring data integrity and preventing export errors. ([c78547777](https://github.com/underpostnet/engine/commit/c785477773cfcedb8ee71a7764c14208c70541ff))
- Enhance deletion logic in Cyberia CLI to handle additional metadata for AtlasSpriteSheet, ObjectLayer, and Ipfs entries ([abafcd65b](https://github.com/underpostnet/engine/commit/abafcd65befc669d7cd498435aea9f5ae8b4808b))

### cyberia-cli

- Add default creation logic for CyberiaInstanceConf during export process ([67aaea452](https://github.com/underpostnet/engine/commit/67aaea452c3fea636fe58645a45282da907cafe9))
- Add CyberiaInstanceConf handling for export and import processes in CLI ([febc2eb1a](https://github.com/underpostnet/engine/commit/febc2eb1a5aff31ac83266b7cc5330281c130f41))

### cyberia-map-engine

- Refactor thumbnail handling in cloneMap to prioritize fresh object-layer capture and update UI text for clarity ([1cbb98a61](https://github.com/underpostnet/engine/commit/1cbb98a61cd8dca5f767b4f4b0cd00ceaeff6967))
- Add functionality to rename Object Layer ItemIds for filtered entities ([532116d8b](https://github.com/underpostnet/engine/commit/532116d8bd8b69ec22b303edfdf8303098f12d5a))

### cyberia-semantic-engine

- Fix direction handling in semantic layer generator by correcting left/right template mirroring ([494882cef](https://github.com/underpostnet/engine/commit/494882cefa5dc73739d93cf7e47b47b34424217c))

### client-cyberia-conf

- Update ENTITY_TYPE_DEFAULTS to replace deprecated item IDs and add new entries ([f89a4186a](https://github.com/underpostnet/engine/commit/f89a4186ab79c35c40d7e15e593fdd8f4f24d5b8))

### hardhat

- Update hardhat to version 3.4.1 in package.json ([d2dff4b3a](https://github.com/underpostnet/engine/commit/d2dff4b3adaa2049b174538351959d49f26dc4a4))

### client-cyberia-map

- Implement entity history management with undo/redo functionality in MapEngineCyberia ([2dba89547](https://github.com/underpostnet/engine/commit/2dba89547604567060ea156f29ea9e59628aaff7))

### client-cyberia-instance

- Refactor instance persistence logic to improve notification handling and streamline save functionality ([45a6a3a32](https://github.com/underpostnet/engine/commit/45a6a3a32adc6dc4ed4e4b76ce48be3a81d576fb))

### client-cyberia-map-engine

- Implement entity filtering and randomization features in MapEngineCyberia ([70224f290](https://github.com/underpostnet/engine/commit/70224f290c8d4c0f20fe8c8995b4c2e7a641d529))

### api-cyberia-instance

- Refactor portal connection logic and procedural entity generation ([e670d387d](https://github.com/underpostnet/engine/commit/e670d387ddb99a676a1d1cffb3c97ec9aebe4c33))

### client

- Refactor MenuCecinasmarcelina styles for improved layout and responsiveness ([037acd2ce](https://github.com/underpostnet/engine/commit/037acd2ceca9199f532a0590d3964e651e613c49))
- Enhance cecinasmarcelina configuration and improve menu styles with new hover effects and responsive design ([1e26c5bb9](https://github.com/underpostnet/engine/commit/1e26c5bb97c0996ce6f1cfc17df33106276e8cdd))
- Update contact information in Cecinasmarcelina index ([8239df42e](https://github.com/underpostnet/engine/commit/8239df42ea3909306848771d56c9ce54d942413b))

### gitub-actions

- Update theme color and enhance service configurations for dd-core and dd-test deployments ([d03c4baf5](https://github.com/underpostnet/engine/commit/d03c4baf5f7a8ac74b5f731f27931c79084d97d8))

## New release v:3.2.5 (2026-04-16)

### cli-run

- Refactor cron command execution to improve flag handling and streamline deployment options ([1773b8e12](https://github.com/underpostnet/engine/commit/1773b8e12d1edccd99d21b231c47bbea647e9772))
- Add shellExec command for database operations in deployment process ([9de52cb7d](https://github.com/underpostnet/engine/commit/9de52cb7d69e2fe2a8e515e8bfb23a615c0974a6))

### cli-cron

- Enhance cron job commands with git option and streamline backup operations ([170c77ff4](https://github.com/underpostnet/engine/commit/170c77ff499712bce2fe443719c29528c52610e5))
- Refactor cron job commands to use 'underpost' CLI and remove secret run step ([e51cd0231](https://github.com/underpostnet/engine/commit/e51cd023195ef8855b36418b4076812ef677baaf))
- Refactor streamline cron deployment handling and add deploy-id resolver ([bb81fe80b](https://github.com/underpostnet/engine/commit/bb81fe80bcb6b7aa30604d65d0357b2e3e5e10ee))

### github-actions

- Fix sudo usage in package installation step ([8545a8e88](https://github.com/underpostnet/engine/commit/8545a8e88e10443d754bcadb1772c3e1acb369f9))

## New release v:3.2.4 (2026-04-15)

### cli-cron

- Update underpost container environment path for volume mount ([8fdfb5416](https://github.com/underpostnet/engine/commit/8fdfb54165f4ef7379fccbeb20e5c476320bc1f6))

### github-actions

- Add dispatch step for release CD in publish workflow ([8dc0e3ccd](https://github.com/underpostnet/engine/commit/8dc0e3ccd1a578f776edf215428d08640b44c3d1))

## New release v:3.2.3 (2026-04-15)

### cli-cron

- Remove is-inside-container dependency and implement isInsideContainer method in env module ([79d39ece0](https://github.com/underpostnet/engine/commit/79d39ece0db1f3acb65af22e3bc7f7c6a66487a9))

### github-actions

- Ensure deploy-release job runs only on successful build-and-publish ([08ba04632](https://github.com/underpostnet/engine/commit/08ba0463263f6cb2b6c14a6bd56e547c152a0a3a))

## New release v:3.2.2 (2026-04-15)

### docker-image

- Remove unnecessary directory creation and volume declaration for working directory in Dockerfile ([84f7f8950](https://github.com/underpostnet/engine/commit/84f7f8950d45512b6177c7523e4d278f2db25ef4))

### github-actions

- Update CronJob schedules and commands to include kubeadm flag ([2795d6a8a](https://github.com/underpostnet/engine/commit/2795d6a8a9cd552afbd22b16616c982227540dff))
- Add volume mounts for .env file in dd-cron backup and dns CronJobs ([76cd8a31b](https://github.com/underpostnet/engine/commit/76cd8a31b7d3686d87333bb5384c6648bfbaf066))
- Refactor deployment and cron job scripts for improved readability and maintainability ([34d38d077](https://github.com/underpostnet/engine/commit/34d38d077adde37d9665b699e642b2ce62bce7fc))
- Refactor deployment scripts to use environment variables for secret creation ([40165237c](https://github.com/underpostnet/engine/commit/40165237caa07386c71ae2db81894e0e7b1d6373))
- Update cron jobs and deployment scripts to use secrets and streamline environment variable handling ([3e3b0c3b0](https://github.com/underpostnet/engine/commit/3e3b0c3b013b012c37c076a71915c365047b989f))

### cli-cron

- Add support for k3s, kind, and kubeadm flags in CronJob configuration ([d7edd8dea](https://github.com/underpostnet/engine/commit/d7edd8dea0c978151f80130203686379beebac2c))
- Add environment variable volume and path for Kubernetes CronJob ([abe731634](https://github.com/underpostnet/engine/commit/abe7316348a90f4fbe8730150bd87a9ee56d8d5c))
- Refactor deployment scripts to create secrets from container environment variables and streamline environment handling ([e5589ec7f](https://github.com/underpostnet/engine/commit/e5589ec7f6ff67c4d99d49cf65e3261c190919c1))
- Enhance deployment and backup processes ([f58323077](https://github.com/underpostnet/engine/commit/f58323077dfb4449f22dc4719d07addf2e18d820))

### cli-db

- Add error handling and logging for database operations in UnderpostDB ([c0d935a0c](https://github.com/underpostnet/engine/commit/c0d935a0ce08d26490c997b284e72e3c7f728b76))
- Implement private engine repository management ([84719664a](https://github.com/underpostnet/engine/commit/84719664adac949b42a0731e408bbb467ed867bd))

### package

- Implement feature X to enhance user experience and fix bug Y in module Z ([8dea4a2f7](https://github.com/underpostnet/engine/commit/8dea4a2f7e53cb5f026bd52aa9adad7909cb01c1))
- Remove --force option from install:test script to prevent unintended package installations ([2aeeff179](https://github.com/underpostnet/engine/commit/2aeeff179a5bd508b38fd73bb1877d80c1caecb4))
- Remove force in coveralls-next install script ([5751a6d12](https://github.com/underpostnet/engine/commit/5751a6d126f043b43d90269fa79d0dc1164a5be1))

### runtime-wp

- Implement automatic commit and push of generated files to repository during provisioning ([d20f079ec](https://github.com/underpostnet/engine/commit/d20f079ec472c81960cccf5dcdbdefb3c8eb91e4))

### runtime-lampp

- Enhance .htaccess rules for WordPress and Lampp to protect sensitive files and directories ([1a455ec7b](https://github.com/underpostnet/engine/commit/1a455ec7bd5490603cf7d621d6703d8966a3ee2c))

### cli-deploy

- Refactor command construction in deployment and cron scripts for improved readability ([ceaf5012b](https://github.com/underpostnet/engine/commit/ceaf5012b2b16a52f16e816c178d8d4f5af1590d))

### gitub-actions

- Refactor CI workflows to streamline Docker build and release processes ([ab0875839](https://github.com/underpostnet/engine/commit/ab0875839ab1d174db8d8cff8daf3734282fce00))
- Refactor CI/CD workflows to streamline Docker build and release processes ([5330af102](https://github.com/underpostnet/engine/commit/5330af10280e7acf2a52b3e0ac17bc5dcd5050b4))

### client-core

- Add SocketIoHandler and AppStore to DefaultConf component list ([a55096889](https://github.com/underpostnet/engine/commit/a550968898ec9526ed3dceef48839ce6be3f1571))
- Refactor API path handling to introduce getApiBaseProxyPath function and streamline base path construction ([afb1b3532](https://github.com/underpostnet/engine/commit/afb1b35325187ef110b40f4a11f78bfd7e7dbb87))
- Enhance DropDown component to reset checkbox values and improve state management on click events ([b02a3fad4](https://github.com/underpostnet/engine/commit/b02a3fad4b9587b317f85c5763f34f806642a7ee))
- Refactor API path handling to introduce getApiBaseProxyPath function and simplify getApiBasePath logic ([0a18bce99](https://github.com/underpostnet/engine/commit/0a18bce996835a8152360a5f7b2f1b2afaea3423))

### cli-fs

- Enhance pull operation to log skipped files when they already exist ([7330aa012](https://github.com/underpostnet/engine/commit/7330aa0126dd67bedf75b847dc6c0794f2ecbf74))

### cli-env

- Refactor UnderpostSecret to streamline environment file handling and remove existing global .env file ([c510f7cff](https://github.com/underpostnet/engine/commit/c510f7cff1aeb3ae26e037000efcee53bcfe6b4b))

### server-start

- Add cleanup command to production deployment process ([5bf5530e3](https://github.com/underpostnet/engine/commit/5bf5530e34b97a6fc1a240a10604d4f5abe2f8cb))

### conf

- Add SocketIoHandler and AppStore to default configuration ([d155277a3](https://github.com/underpostnet/engine/commit/d155277a38359d32d5cd78be20453990585d5d00))

## New release v:3.2.0 (2026-04-13)

### cli-repository

- Refactor GitHub URL handling to centralize authentication logic and improve repository accessibility checks ([4783e25bd](https://github.com/underpostnet/engine/commit/4783e25bd85d0c6260b4733bbbb09e811979605c))
- Update GitHub token usage to use x-access-token format in repository URLs ([8a9506d97](https://github.com/underpostnet/engine/commit/8a9506d9754ae41220e40bd72d1cf9023ec1813d))
- Update GitHub token usage to use OAuth2 format for repository URLs ([e71530fcc](https://github.com/underpostnet/engine/commit/e71530fcca079bc86048283f151f7e5c02c18b91))
- Add remote repository accessibility check and unzip to Dockerfile ([be32ecebe](https://github.com/underpostnet/engine/commit/be32ecebe49eab3f39019c5eead74699406d9c99))
- Refactor UnderpostRepository and UnderpostRun: streamline unpushed commit detection and enhance commit message propagation logic ([f96e3a674](https://github.com/underpostnet/engine/commit/f96e3a6746d745ce1528b598ff36a3dc847f386e))
- Refactor git repository initialization: streamline repo setup and user configuration using environment variables across multiple modules ([146cb2181](https://github.com/underpostnet/engine/commit/146cb218163e3b27e24357167296378767b776f7))
- Fix getHistory and related methods to support repository path, enhancing command execution context ([ee79f636f](https://github.com/underpostnet/engine/commit/ee79f636f2081a943026600d4cbaff52d2997958))
- Add --unpush option to automatically detect unpushed commits for log display ([9c7ca3ca5](https://github.com/underpostnet/engine/commit/9c7ca3ca52abf927a54708e938a71c98b4edb179))
- Add Git branch reflog and commit hash options to CLI ([c69e8aeca](https://github.com/underpostnet/engine/commit/c69e8aecaa6bccd2085cb5de49ca0e6e0e659867))

### runtime-wp

- Enhance remote repository accessibility checks by preventing credential prompts and improving logging ([abf48b28f](https://github.com/underpostnet/engine/commit/abf48b28fad233a3f166c8f14f3f222b6d4e6061))
- Prepend XAMPP's bin directory to PATH for WP-CLI calls ([a1449e380](https://github.com/underpostnet/engine/commit/a1449e380f47e0187a9f8f9bfcbde603d89e6685))
- Add WP-CLI installation check and ensure safe.directory for git operations ([414e8743e](https://github.com/underpostnet/engine/commit/414e8743e18b1f36edf5113da9a03b6a0261a318))
- Enhance backup functionality: add GitHub organization support and streamline WordPress backup handling ([717004bb0](https://github.com/underpostnet/engine/commit/717004bb0d2e8dac3b1653505b6d9180b34ea364))
- Enhance WpService: inject WP Mail SMTP plugin configuration into wp-config.php for improved email handling ([10188d104](https://github.com/underpostnet/engine/commit/10188d1042e81402ee2e612e58cd3bb4ba9d3b32))
- Update .htaccess handling for WordPress subdirectories: append scoped rewrite rules to prevent conflicts between multiple installs. ([409572dab](https://github.com/underpostnet/engine/commit/409572dab2327fe0802e9fa67718de7beca7c641))
- Refactor database creation logic: drop and recreate MariaDB database for fresh installs to ensure a clean state. ([e370b0b21](https://github.com/underpostnet/engine/commit/e370b0b21ad74de3e20668547fa967b787fb33c5))
- Enhance WpService and runtime configuration: add WordPress install options to support custom titles, admin credentials, and integrate with server configuration. ([deae03d84](https://github.com/underpostnet/engine/commit/deae03d8431fc9bdc4283e0c359df893625cfa90))
- Ensure parent directory exists before moving WordPress files: add check and create directory if missing. ([3661681f8](https://github.com/underpostnet/engine/commit/3661681f8785c46ab3df9e7feaa534398b21c6a0))
- Enhance deployment scripts and Dockerfiles: update image references to use PHP 8.3, add XAMPP binaries to PATH, and modify WpService to support redirect options in createApp method. ([6c782a07d](https://github.com/underpostnet/engine/commit/6c782a07d6ec3eef0f88206775ad7f9ef877e69b))
- Add WordPress provisioning support with WP-CLI integration: enhance WpService to install WordPress and activate the Wordfence plugin non-interactively; update configuration for subdirectory support in Dockerfile. ([e183f06fc](https://github.com/underpostnet/engine/commit/e183f06fc65542c1fa4c6e32912df5516a1c6e72))
- Enhance WpService for subdirectory support: modify provisioning methods to handle WordPress installations in subdirectories, including .htaccess generation for URL rewriting. ([38704bf37](https://github.com/underpostnet/engine/commit/38704bf374fc6ba896f7f7a24196f023f40fb55c))
- Update Dockerfile and Lampp.js to install XAMPP 8.2; add WpService for WordPress management ([ee7cb66de](https://github.com/underpostnet/engine/commit/ee7cb66de35b9f7e46e7ab557ad4a7c0675c67aa))

### server-start

- Clear environment variables during production deployment cleanup ([a6cc07699](https://github.com/underpostnet/engine/commit/a6cc076996b0b891d1179042d35835977dc3c1b2))
- Add production environment cleanup in deployment process ([69c07f7f6](https://github.com/underpostnet/engine/commit/69c07f7f6befe6c591bc3b4fcd18c0cb22da974c))

### dependencie

- Add is-inside-container package to dependencies ([ba558dea5](https://github.com/underpostnet/engine/commit/ba558dea53a7a21fa84619c986978def994bdaaa))

### engine

- Remove unused CERTBOT_LIVE_PATH variables from environment configuration ([1b47da9ba](https://github.com/underpostnet/engine/commit/1b47da9ba3013d1fd9fb4cda9b4924e2b8cef8e4))

### engine-lampp

- Update WordPress configuration for environment variables and add GitHub authentication for private repositories ([aa0c605ea](https://github.com/underpostnet/engine/commit/aa0c605ead84860e9c7e43167c3e7085e4c7a58d))

### engine-test

- Add SMTP configuration to DefaultConf and update deployment manifests with deploy-id labels ([3bd19e174](https://github.com/underpostnet/engine/commit/3bd19e174f3a114ff1b70ffeb465445ca42cf9b4))

### release

- Refactor killDevServers function for improved process management during builds and deployments ([a21689bdd](https://github.com/underpostnet/engine/commit/a21689bdd7d777c143576709340539d5a9c54c34))

### package

- Remove unnecessary peer dependencies for Babel packages ([560bf8c6b](https://github.com/underpostnet/engine/commit/560bf8c6be2affacd3a88e98bc8ff192020e820d))
- fix: correct typo in install:test script for coveralls installation ([a466daeb6](https://github.com/underpostnet/engine/commit/a466daeb63d2e504bd369dfcba86ec2cfa1eebec))

### api-cyberia-instance

- Add border color support to status icons and update gRPC server handling ([214ef8825](https://github.com/underpostnet/engine/commit/214ef8825f73cc8e23f3ea4f5e4c8507734c7ff5))
- Enhance portal functionality by introducing portal subtypes and occupancy grid for better entity placement ([93b75c563](https://github.com/underpostnet/engine/commit/93b75c563edc3aa42c2ffc66e17a9155bdd6125c))
- Implement fallback world generation and API integration for CyberiaInstance ([0657979de](https://github.com/underpostnet/engine/commit/0657979de3fcf18bae9b94f0441575f1f1b424d1))
- Implement central portal connector and procedural entity generation for CyberiaInstance ([6146ada76](https://github.com/underpostnet/engine/commit/6146ada7638aa4192d749b720ce7174f79923466))
- Refactor schema to directed graph model (PortalEdgeSchema) ([a4c0d62a7](https://github.com/underpostnet/engine/commit/a4c0d62a750bf9cf1cd3d1169a2ca5e113063840))
- Implement CyberiaInstance API with CRUD operations and service integration ([2fa7fde33](https://github.com/underpostnet/engine/commit/2fa7fde33b149fa4718316c2354079ba8303ffdf))

### engine-cyberia

- Add Entity Status Indicator (ESI) registry and update gRPC server to handle status icons ([4c5ec09d5](https://github.com/underpostnet/engine/commit/4c5ec09d51b6abc87cbb6d82343682ea0ecfc8fd))
- Refactor Cyberia item definitions: update DefaultCyberiaItems structure and enhance import functionality ([d59279a6d](https://github.com/underpostnet/engine/commit/d59279a6d9aaaabc9bdd3c0fa74671f09345575b))
- Add 'cyberia-dialogue' to DefaultConf: include dialogue module in configuration ([bb7293875](https://github.com/underpostnet/engine/commit/bb729387572a466046bf595b0f2bbcdef4d3eb26))
- Add equipment rules and refactor object layer schemas for clarity ([f852e2d9b](https://github.com/underpostnet/engine/commit/f852e2d9b219203e5f40af1bef63ee9819c3608d))
- Add semantic layer generator files and update configuration ([7bde7856e](https://github.com/underpostnet/engine/commit/7bde7856e04bcd4db9bc5e050c554abf7b2d20f3))
- Refactor enhance Semantic Layer Generator with modular structure and improved documentation ([522ee230c](https://github.com/underpostnet/engine/commit/522ee230cbf2a9631a3ac160731c4c7da3436333))
- Refactor entity schemas to include defaultObjectLayers for enhanced inventory management and streamline entity initialization ([7ca2116eb](https://github.com/underpostnet/engine/commit/7ca2116ebd30c65620c3906e1d9029936b99fd03))
- Implement Fountain & Sink economy model with detailed configuration in defaults and schema ([bd0725156](https://github.com/underpostnet/engine/commit/bd0725156f1a2d30f29754c33ea8a769cccdea5f))
- Enhance bot generation by introducing weapon chance and adjusting entity count ranges for obstacles and foregrounds to improve gameplay variability. ([b22aa71a8](https://github.com/underpostnet/engine/commit/b22aa71a82ed30c51cabfc0a2ffcafee1665a0a8))
- Refactor fallback world generation to use random counts for bots, obstacles, and foregrounds, enhancing procedural variability. ([2829d9952](https://github.com/underpostnet/engine/commit/2829d99524586c6d9a0515f7511843580c38d5b6))
- Refactor Cyberia instance configuration to replace single item ID fields with arrays for live and dead item IDs, enhancing flexibility and consistency across schemas. ([ed7697afb](https://github.com/underpostnet/engine/commit/ed7697afbe5c94c6994bdec4cb6b9f44833268fc))
- Refactor skill rules in Cyberia instance configuration to replace 'bullet' terminology with 'projectile', enhancing clarity and consistency across schemas ([ec88c4bc4](https://github.com/underpostnet/engine/commit/ec88c4bc40c3eb2fd43b2fcea622441d7a9b6f6f))
- Refactor Cyberia instance configuration to utilize defaults for entity types and skill rules, enhancing maintainability and consistency across schemas ([39b0c9c29](https://github.com/underpostnet/engine/commit/39b0c9c292595dda0bdd7dcdf6f8840c0a9f762c))
- Enhance Cyberia instance configuration with default values and auto-upsert logic for CyberiaInstanceConf ([703603d57](https://github.com/underpostnet/engine/commit/703603d5712bf0cf9e093e52a573905253bf3970))
- Refactor Cyberia instance configuration to use separate model and enhance skill configuration handling ([6c8c5abe3](https://github.com/underpostnet/engine/commit/6c8c5abe391fce7288c49a4767a53efb068d0d20))
- Update skill configuration to use logicEventIds instead of logicEventId and remove spawnedItemIds ([38d27602f](https://github.com/underpostnet/engine/commit/38d27602fe39a2d054c4f05c5a015bef0e262054))
- Enhance skill configuration and fallback instance handling in gRPC server ([987691fa0](https://github.com/underpostnet/engine/commit/987691fa0dd8991365f5278b1e2dfc9fa74b3b6e))
- Enhance gRPC server with game server configuration and fallback instance handling ([3f2bf5e43](https://github.com/underpostnet/engine/commit/3f2bf5e4302cca881e1c3e57cf26931ff38a9765))
- Refactor Cyberia dependencies management by removing overrides and patching logic ([74ee9984e](https://github.com/underpostnet/engine/commit/74ee9984e19549dc0fee5854cb8fc880541896d0))
- Update patchCyberiaDependencies to handle file-type import changes for ESM and CommonJS ([4514e6d48](https://github.com/underpostnet/engine/commit/4514e6d48103c2dc0b9a553df6f974317ea6c45d))
- Add CyberiaDependenciesOverrides for enhanced dependency management in Cyberia portal ([d1783287c](https://github.com/underpostnet/engine/commit/d1783287cb54af8779ccd63a0283eb333fb29bf6))
- Add MapEngineCyberia grid rendering and interactive cell selection ([b798ae61c](https://github.com/underpostnet/engine/commit/b798ae61c4a7b690060786904df84d85ce498a04))
- fix: Enhance build process by missing copying jsdoc file with specific name and improve error handling in CLI ([56d9300d3](https://github.com/underpostnet/engine/commit/56d9300d30a163a4b456489a36227a5f39e974fc))

### grpc-cyberia

- Remove AtlasSpriteSheet handling from gRPC server: delete unused functions and RPC handlers ([c8dd39728](https://github.com/underpostnet/engine/commit/c8dd39728a8f890e5798e051ddd9448dd23e579b))

### bin-deploy

- Add 'add-api' command to deploy script: implement API addition to server and client configurations ([17811367b](https://github.com/underpostnet/engine/commit/17811367ba0a0e3238c77e9332e0dccd298667cf))

### api-cyberia-dialogue

- Add Cyberia dialogue functionality: implement CRUD operations, enhance dialogue model, and create seed dialogues ([4514545c3](https://github.com/underpostnet/engine/commit/4514545c3037a254c08d06cc25679294b1a10800))
- Implement Cyberia Dialogue API: add controller, service, model, and router for CRUD operations ([dc463616c](https://github.com/underpostnet/engine/commit/dc463616cc5b07cba2cdc5dd5d1fa4999a7a95f4))

### hardhat

- Enhance coverage build process to support Hardhat 3 output structure ([61b90edbe](https://github.com/underpostnet/engine/commit/61b90edbe18d5a0ff5bd777411fb4745037a2a53))
- Upgrade to hardhat v3 and fix vulnerabilities ([80ced86ef](https://github.com/underpostnet/engine/commit/80ced86ef1de566574ebeea41e25c4c9fcf5daa4))

### cli-release

- Enhance UnderpostRelease: update local repo initialization to configure worktree and ensure changes are staged before commit ([c552dbc42](https://github.com/underpostnet/engine/commit/c552dbc4214f84d44ac1aabae53785db1f3093d9))
- Add pwa method to update and push pwa-microservices-template repository ([752adea13](https://github.com/underpostnet/engine/commit/752adea13a332e78b46cdaa8369bdac273115876))
- Add CI push options to release command and implement local CI workflow ([4249540dc](https://github.com/underpostnet/engine/commit/4249540dc246670048d41f7ead94f4291190943d))
- Add release orchestrator command and update GitHub workflows ([615a6941f](https://github.com/underpostnet/engine/commit/615a6941f9f226b49398b1bdd824c72578b39b89))

### cli-run

- Add random password generator run id ([76f6be0a9](https://github.com/underpostnet/engine/commit/76f6be0a9221306767296fb1314cc3c1d890472f))
- Refactor release and run modules: update commit handling to return command strings for improved execution flow ([0ff930428](https://github.com/underpostnet/engine/commit/0ff930428d78e407db3ae56c1818a29502d1df88))
- Enhance commit message handling: update logic to capture and sanitize last N commit messages from the engine repository for CI push and PWA build commands ([114fda529](https://github.com/underpostnet/engine/commit/114fda5291b9fa73b1adb397cd5a67db4ac2fdad))
- Update gRPC service traffic handling to reflect current parent deploy traffic ([754b8f770](https://github.com/underpostnet/engine/commit/754b8f7708acaccae9a5ef5e0fed28767a107285))
- Add local deployment method for templates without GitHub Actions ([62c3ff18a](https://github.com/underpostnet/engine/commit/62c3ff18a9ec0968bcc53dcbcddeb8ab77ec44cb))
- feat: add docker-image method to dispatch Docker image CI workflow ([97737c3ab](https://github.com/underpostnet/engine/commit/97737c3ab39448db333db0a557f3d0f1a144c351))
- Add git clean option for deployment processes and enhance cluster context handling ([a59df7402](https://github.com/underpostnet/engine/commit/a59df7402de1c365d73b9614177b6d4e91e1470a))
- Refactor Docker image handling in CLI: Replace direct shell commands with Underpost.image.pullDockerHubImage for improved clarity and maintainability ([6d656bec8](https://github.com/underpostnet/engine/commit/6d656bec8882d22d2e333a913d482a1321acc727))

### wp-runtime

- Refactor WpService and BackUp: initialize git repository for WordPress sites and link to remote repository during backup operations ([220fa61af](https://github.com/underpostnet/engine/commit/220fa61afa87dead743e9938480190f5321ec5b4))
- Update LamppService and WpService: adjust Apache user/group ownership to current user for improved plugin compatibility ([2bea96a70](https://github.com/underpostnet/engine/commit/2bea96a70c632300a59b1f458ebec82abaa83c4d))
- Enhance Dockerfiles and WpService: update PATH for XAMPP binaries, add no-op sendmail, and adjust permissions for writable site configuration ([5f6e34103](https://github.com/underpostnet/engine/commit/5f6e3410337da94b19553c28ab00975dde867387))
- Fix virtual host configuration: update ServerName directive and disable UseCanonicalName for improved routing. ([bd9137cab](https://github.com/underpostnet/engine/commit/bd9137cab0d353e41388f9e64aedd959607427bd))

### cli-db

- Enhance database management in UnderpostDB: ensure database creation for MariaDB and MongoDB; improve error handling for missing SQL and BSON files. Update WpService to verify remote repository accessibility before cloning, falling back to fresh install if necessary. ([3f7beda29](https://github.com/underpostnet/engine/commit/3f7beda29e569376988eed62ddd50f6a1c2acd3d))

### cli-kubectl

- Refactor Kubernetes CLI operations: centralize pod management and file transfer in a new kubectl module; update db and deploy modules to utilize the new API ([e31597512](https://github.com/underpostnet/engine/commit/e3159751232e47bb1e0bc5a14ff59ccc1bba0916))

### cli-deploy

- Add host parameter to buildGrpcServiceManifest for targeted gRPC port scanning ([f33d6a52a](https://github.com/underpostnet/engine/commit/f33d6a52ad02ca471f599ba4e27203312e73a839))
- Add gRPC service deployment support in the deploy module ([456a32076](https://github.com/underpostnet/engine/commit/456a32076d458bc67eea239c2bbf257a5e75fee8))
- Enhance gRPC service manifest to support traffic color switching during deployment ([daf79cce8](https://github.com/underpostnet/engine/commit/daf79cce8b2e48abbefadf3aa2eb64b834bc3dd5))

### bin-build

- Copy .gitignore to the deployment directory during build process ([fbd53450e](https://github.com/underpostnet/engine/commit/fbd53450e3642082051fb595e27f74d3cfa19759))
- Update build process to conditionally copy jsdoc and deployment manifests for development ([a5b61e906](https://github.com/underpostnet/engine/commit/a5b61e9061511935ba2ddee7531d0e408e91a8af))

### api-atlas-sprite-sheet

- Add metadata endpoints for AtlasSpriteSheet API to retrieve item metadata ([18dfae3e1](https://github.com/underpostnet/engine/commit/18dfae3e1f93154112c2b5374239bcc02f04f801))
- Add blob endpoint and service for retrieving atlas sprite sheet data ([5c5f60d2b](https://github.com/underpostnet/engine/commit/5c5f60d2b18e8d13b5d53449749c5eb694c18b96))

### cli-cyberia-semantic

- Update default values generate-semantic-examples examples ([b97625211](https://github.com/underpostnet/engine/commit/b9762521182f85aaae88236a5f8ee3fc576b79f5))

### grpc

- Fix gRPC server initialization condition to check for root path ([1efd33b4b](https://github.com/underpostnet/engine/commit/1efd33b4b63f8419a1ba3a8d00b8e854133ada63))

### cyberia-semantic-engine

- Refactor hair zone calculation for improved accuracy in skin generation ([9eb644ed2](https://github.com/underpostnet/engine/commit/9eb644ed272e10352724a6063a82b1f194286243))
- Refactor hair zone calculation for improved accuracy in skin generation ([4c2e666e3](https://github.com/underpostnet/engine/commit/4c2e666e38b8ae4b7dac0cd5a9e4f6f3a4b1b66b))
- Refactor skin and hair generation logic for improved readability and maintainability ([a2dd47768](https://github.com/underpostnet/engine/commit/a2dd477680fa1d122c65d9bb544327f18b3aae63))
- Add command to generate semantic examples with customizable options ([45dbb38d7](https://github.com/underpostnet/engine/commit/45dbb38d77b8fceedca8013b7069745a9717cfdf))
- Enhance skin generation with subtype support for varied tones and hair styles ([4549be1e7](https://github.com/underpostnet/engine/commit/4549be1e732736afd64e3f05657f78a880dcefa6))
- Add border extraction and hair depth control to skin template generation ([03b6e45b8](https://github.com/underpostnet/engine/commit/03b6e45b88f8bea347b68723bba11e3ee392327d))

### client-cyberia-ol-viewer

- Refactor WebP display logic to prevent layout flicker and improve control state updates ([4e9843554](https://github.com/underpostnet/engine/commit/4e9843554e7834f22f7bfefcb77bb0ac2873290d))

### playwright

- Update Playwright image version to v1.59.0 for improved features and stability ([3aa4a281a](https://github.com/underpostnet/engine/commit/3aa4a281a1200251fc140639e2df1dbecde88fd9))

### cli-cyberia-instance

- Refactor skillConfig seeding logic to ensure idempotency and improve error handling for missing CyberiaInstance ([0afe4e899](https://github.com/underpostnet/engine/commit/0afe4e899a5f6e4f5edea768a37d136b85a95787))
- feat: enhance unpin logging for IPFS Cluster to handle 404 status ([5ca839926](https://github.com/underpostnet/engine/commit/5ca839926e123862d4d5d937458d8c62c4f6cc7e))

### api-ipfs

- Refactor IPFS pinning logic to enhance CID registry management and remove userId dependency ([986520b68](https://github.com/underpostnet/engine/commit/986520b6813d49b23a20f5e56d3ccd5559ba7772))

### client-cyberia-instance

- Implement portal connection feature in Cyberia instance with error handling and UI integration ([46a98148f](https://github.com/underpostnet/engine/commit/46a98148fc9f0ff84723e15563aca51be5610970))
- Add portal management features to InstanceEngineCyberia component ([ef7a1f1d0](https://github.com/underpostnet/engine/commit/ef7a1f1d05429e45743746d9e0fafae130ee8f0d))
- Add InstanceEngineCyberia and integrate with CyberiaInstance API ([5c03603f7](https://github.com/underpostnet/engine/commit/5c03603f79e3049d8dd20a478fad9f6843e23a1c))

### api-cyberia-global

- Implement Cyberia Global Map Code Registry API with CRUD operations ([2bb06f1c4](https://github.com/underpostnet/engine/commit/2bb06f1c46630abcc7c8423b4befadd807faabfc))

### cyberia-instance-conf

- Implement Cyberia instance configuration API with CRUD operations ([00312d6d0](https://github.com/underpostnet/engine/commit/00312d6d0d3095d75c145995d3f96b8fcd050e6a))

### runtime-express

- implement gRPC server integration and configuration in Express service ([5029c962c](https://github.com/underpostnet/engine/commit/5029c962c688b4a25034f8f2bd12383ef09620d9))

### gprc-cyberia

- feat: add gRPC support with server implementation and update dependencies ([07b552c1c](https://github.com/underpostnet/engine/commit/07b552c1c0b6815b281de590789bb3edb9b6c979))

### github-actions

- Update clean steps for client public directories in deployment process ([b5e9b5edc](https://github.com/underpostnet/engine/commit/b5e9b5edc034c708a5632c9f9f3f90f5dc2cefe0))
- Update workflow dependencies for Dockerhub and release processes ([5f8aa62e0](https://github.com/underpostnet/engine/commit/5f8aa62e06111f5299088320e594a1379c29af0e))
- feat: streamline CI workflows by removing redundant GITHUB_TOKEN configuration steps ([dc61ed92b](https://github.com/underpostnet/engine/commit/dc61ed92b1fd6c4a705b721cd7425b362b999cba))
- fix: remove coveralls uninstallation from CI workflows and update install:test script ([dee0cbc3e](https://github.com/underpostnet/engine/commit/dee0cbc3e825ddbed19a72739b8f69fb4f8250cc))
- refactor: Simplify CI workflows by removing unnecessary conditions and enhancing dispatch logic ([f7bcb4cc9](https://github.com/underpostnet/engine/commit/f7bcb4cc9792c114befa0f97512212dff095b6dc))

### client-stream

- Enhance user tracking in stream channel by notifying existing users on join ([01702e5d3](https://github.com/underpostnet/engine/commit/01702e5d36712b84612bead2081c5e7bd3c31f04))
- Refactor: enhance Stream class for improved PeerJS management and simplify StreamNexodev integration ([bc470740b](https://github.com/underpostnet/engine/commit/bc470740b5f5570e51b5f77df7d4345cd8a7aba9))

### api-cyberia-map

- feat: enforce unique constraints on code fields in CyberiaInstance and CyberiaMap schemas ([6ea0fe2ee](https://github.com/underpostnet/engine/commit/6ea0fe2ee7c2684c02580032ca1b6a033f8f6a36))
- feat: Implement Cyberia map CRUD operations with controller, service, and router ([dd21f6b08](https://github.com/underpostnet/engine/commit/dd21f6b08d1bf2275c75a77fc02bf3860e392982))

### cli-cyberia-instace

- Add export/import functionality for Cyberia instances and related documents ([9b64825cc](https://github.com/underpostnet/engine/commit/9b64825cc0826dc5f5e76d4de941c959a835263c))

### client-cyberia-map

- feat: add option to capture object layer thumbnail on save/update ([824d15aee](https://github.com/underpostnet/engine/commit/824d15aee190e353ae219f67444e0d820a77908a))
- feat: add variation preserve input for entity dimension adjustments ([d6bafbaba](https://github.com/underpostnet/engine/commit/d6bafbababef22495727e28fa7b9f87409c0a8d8))
- feat: ensure new thumbnail upload for cloned maps and handle auto-capture fallback ([06468e028](https://github.com/underpostnet/engine/commit/06468e028b934edc4018f7ebd9dc5562f6f4cd37))
- feat: add entity variation generation and flip functionality in MapEngineCyberia ([815c9ecde](https://github.com/underpostnet/engine/commit/815c9ecdee73f874e8a90689e66dfe084cf0d78d))
- feat: implement clone map functionality with thumbnail upload and auto-capture ([ed28d7f9f](https://github.com/underpostnet/engine/commit/ed28d7f9ffc971119982cd206d685c971c83e95b))
- Add grid dimensions to CyberiaMap schema and update MapEngineCyberia to handle grid parameters ([bd3613ecc](https://github.com/underpostnet/engine/commit/bd3613eccd93e9cc6d72dff62a99fcef14136d31))
- feat: add random dimension feature for entities and implement UI controls ([d24f7e55f](https://github.com/underpostnet/engine/commit/d24f7e55f3d2093c4ea7fe0cc6fe4eaa07bd15d8))
- Add object layer image loading and toggle functionality in MapEngineCyberia ([087377409](https://github.com/underpostnet/engine/commit/08737740992c6b8f29c348d8b57a44f2f1c5a067))
- Add toggle for adding entities on click and display cell coordinates in MapEngineCyberia ([d77967d72](https://github.com/underpostnet/engine/commit/d77967d7272a70802b8faabe0d4ba96f9b747178))
- Add entity filtering functionality to MapEngineCyberia component ([d58f68ef9](https://github.com/underpostnet/engine/commit/d58f68ef91bb3777277b8884545dda1125f6b0a5))
- Enhance DropDown and MapEngineCyberia components with badge rendering and grid visibility toggle functionality ([b60eb8fb0](https://github.com/underpostnet/engine/commit/b60eb8fb08c4f2da0b12bbf3c4b749247f6dcac8))
- Refactor DropDown and MapEngineCyberia to integrate object layer item selection and thumbnail capture functionality ([34988386a](https://github.com/underpostnet/engine/commit/34988386a9cab4c27ad34a009efd0da8a5b9f1de))
- Add search-item-ids endpoint and implement autocomplete for object layer item IDs ([ec066a757](https://github.com/underpostnet/engine/commit/ec066a7575dd1ba2f839b4a53177bad6dc66bae5))
- feat: Enhance Cyberia map management with admin role checks for update and delete operations ([e62b121d4](https://github.com/underpostnet/engine/commit/e62b121d4b1ffb99516d97d770e7978600113bb1))
- feat: Enhance Cyberia map management with additional fields, user authentication, and thumbnail support ([0023ba3ec](https://github.com/underpostnet/engine/commit/0023ba3ec4570a79b70944aac5ccc90709f3b63d))
- feat: Enhance Cyberia map management with load map functionality and notifications ([71aab98e9](https://github.com/underpostnet/engine/commit/71aab98e9760da91a1c262e66256e54acc627909))
- feat: Implement Cyberia map management with CRUD operations and integrate into MapEngineCyberia ([f6bb13ecc](https://github.com/underpostnet/engine/commit/f6bb13eccc0db73c57510a483de05e8774dd51aa))
- feat: Enhance Cyberia entity management with CRUD operations and integrate with MapEngineCyberia ([bc3146f2f](https://github.com/underpostnet/engine/commit/bc3146f2f93c32e821a21e6dcd5847b4f48a7526))

### gitub-actions

- Remove coveralls uninstallation from CI workflows ([68eee857c](https://github.com/underpostnet/engine/commit/68eee857ca34a2251d07efee6f9ef48efb28022f))

### coveralls

- Update Coveralls upload step to use direct command instead of GitHub Action ([b0c6712f3](https://github.com/underpostnet/engine/commit/b0c6712f3f97d7d3cb4a8e150991b2e8965aaeaa))

### github-actios

- fix: add bash to required packages and implement retry logic for database connections ([d44c0d52e](https://github.com/underpostnet/engine/commit/d44c0d52edf6e675fffa21cdfd05ae44c7e75e51))

### websocket

- Refactor: update SocketIoHandler to SocketIoHandlerProvider and add AppStore references across multiple configuration files ([0811b67cf](https://github.com/underpostnet/engine/commit/0811b67cf3c9bfe1a2f488106e67572397e0367e))
- Refactor: streamline WebSocket channel management by consolidating channel logic and removing deprecated management files ([23e024554](https://github.com/underpostnet/engine/commit/23e024554ec7f32074eb69ce591067c2a659e0d3))

### client

- Refactor: remove BaseElement dependencies and simplify AppStore instantiation across multiple components ([f0fa9011e](https://github.com/underpostnet/engine/commit/f0fa9011eb444d5dc9e3583bb5dfc599bef6dd25))
- Refactor components to utilize AppStore for state management ([9436d91ca](https://github.com/underpostnet/engine/commit/9436d91cad1e3855f3c81d245847b4c0f07909b1))
- Refactor: replace uglify-js with esbuild for JavaScript minification and import rewriting ([759d8269b](https://github.com/underpostnet/engine/commit/759d8269b54b4d4fddfc0fe8e6ec206fb69aea7b))
- Refactor parameter handling in multiple components: Remove unused EVENT_CALLBACK_TIME parameters and simplify Keyboard initialization ([491303dcd](https://github.com/underpostnet/engine/commit/491303dcdc939f838e71fc418ccd99c1dcb648ab))

### client-ws

- Refactor: streamline SocketIo handlers and enhance WebSocket management for improved clarity and maintainability ([c2d135072](https://github.com/underpostnet/engine/commit/c2d135072f2ec0cbb64bf651c4198438f2882931))

### cli-cyberia

- Enhance README.md: Add new features for drop and cleanup, static asset management, IPFS and blockchain integration, and update import commands for clarity ([cf433a4e6](https://github.com/underpostnet/engine/commit/cf433a4e6cbc43b0c0d4df88321e84f16b1fd68e))
- Enhance IPFS cleanup process in Cyberia CLI: collect and unpin CIDs, remove MFS paths for ObjectLayer items ([0984e0fbb](https://github.com/underpostnet/engine/commit/0984e0fbb9048520b766605ed3f7c088a8476709))
- Enhance Object Layer and Atlas Sprite Sheet Management: Implement cut-over consistency for staging CIDs, streamline IPFS integration, and improve thumbnail handling in Cyberia services. ([9b92cdec7](https://github.com/underpostnet/engine/commit/9b92cdec78611e0fc47168470270359d457346c4))
- Refactor CLI commands for object layer import: update flags from `--import` to `--import-types` for clarity ([3ef65f6c7](https://github.com/underpostnet/engine/commit/3ef65f6c78daeb65fe9c4cc9804b8a930b21d80b))
- Add development environment option and enhance ObjectLayer upsert logic in Cyberia CLI ([87ae2f471](https://github.com/underpostnet/engine/commit/87ae2f471ec7d3582958ad8ea383135c1ad470e7))
- Add default Object Layer items and import command to Cyberia CLI ([4905b91c8](https://github.com/underpostnet/engine/commit/4905b91c84a98e389f558a93feb65d1bf143a79e))
- Enhance import functionality in Cyberia CLI: support specific item imports and batch imports by type ([6c4c567a6](https://github.com/underpostnet/engine/commit/6c4c567a6db185287b40cd54495a0d6198291f9b))

### object-layer-engine

- Update ObjectLayerEngineModal to dynamically set cell dimensions based on loaded data ([6b304e6e3](https://github.com/underpostnet/engine/commit/6b304e6e3f0db6888231503570ed7274cbdeec70))

### conf

- Update deployment configurations and proxy settings for dd-core and dd-cyberia environments ([a97862864](https://github.com/underpostnet/engine/commit/a97862864855601794f21330c198b14f54d75067))

### cli-client

- Refactor syncEnvPort and singleReplica operations for improved clarity and error handling ([751ef4ffd](https://github.com/underpostnet/engine/commit/751ef4ffde6058daa7d8af4cbb74be2a31b5ec60))

### dependabot

- feat: Enhance dependabot branch management with stashing, merging, and cleanup operations ([06a42f4bd](https://github.com/underpostnet/engine/commit/06a42f4bddf1614bab684dc7dfca38e4b3a9c15d))

### coverage

- feat: Add coverageOutputDir to documentation configuration for custom coverage output path ([ea630ecc4](https://github.com/underpostnet/engine/commit/ea630ecc4dab0d5e086a769b0a952a64b8579aae))

### api-cyberia-entity

- feat: Implement Cyberia entity CRUD operations and service integration ([56629ee17](https://github.com/underpostnet/engine/commit/56629ee1706d06f91375ac6919763c30d073dc73))

## New release v:3.1.3 (2026-03-17)

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

