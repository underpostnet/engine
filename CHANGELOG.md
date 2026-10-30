# Changelog

## 2026-10-30

### test

- Take the site provisioning client from the default conf ([21686f367](https://github.com/underpostnet/engine/commit/21686f367359f21940d426c29e58122ad94eedd6))
- Colour the coverage reports by an 80 to 90 band and cover more sources ([c20557cfb](https://github.com/underpostnet/engine/commit/c20557cfb55c445b5e6bf06896669b3c69699d7f))
- Provide metadata every file in ssr body components ([619b1fcbf](https://github.com/underpostnet/engine/commit/619b1fcbf43caf9e08c4deabfbdc5b60e924eb2d))
- Skip the instance map payload tests without a content artifact ([05304a66f](https://github.com/underpostnet/engine/commit/05304a66f6206faeaff862e419c1052a38fa7064))
- Point the C client contract at its data directory ([00b15b4ac](https://github.com/underpostnet/engine/commit/00b15b4ac0dd01d5ec8958a6216f50242d0c602b))
- Measure only the sources that coverage can report ([e07d30948](https://github.com/underpostnet/engine/commit/e07d30948b800d703cce57f440376ad442b4bd96))
- Register the player, root state and session sources ([66ba832db](https://github.com/underpostnet/engine/commit/66ba832db58976bf380cd58a88d247328aa24574))
- Skip the Google sign-in suites where a sliced tree lacks the API ([6d65eebdb](https://github.com/underpostnet/engine/commit/6d65eebdbc6ef42d06cb3d82a63c4e33c143a455))

### server

- Count a zombie process and a zombie group as ended in the host lock ([337fb4d56](https://github.com/underpostnet/engine/commit/337fb4d5602464fea4b67dc90909cd4d96da3f07))
- Build the API document from the mounted routers at runtime ([ea4560fad](https://github.com/underpostnet/engine/commit/ea4560fad0bbc2d283dd8e537eb936bbc53a93c5))
- Run a release stage as a durable task that a timeout never loses ([72ea502c3](https://github.com/underpostnet/engine/commit/72ea502c36d0499c0b70c9d40a129b95c3eec7a2))
- Retry a domain read by one policy and mark an ambiguous write ([746ee144d](https://github.com/underpostnet/engine/commit/746ee144dfc0dcbe8d3da38c501ebd812ddf870a))
- Keep a cache read from joining a load that began before an invalidation ([e14a8fbe8](https://github.com/underpostnet/engine/commit/e14a8fbe876340c4ef8e0b175692ed9036be5065))
- Version the cache tokens and the client hints ([12401bd9b](https://github.com/underpostnet/engine/commit/12401bd9b42e57adf548ba36c7d0efee9b37f85c))
- Name a consumed domain by its owner API instead of a fixed list ([e4b7ba49e](https://github.com/underpostnet/engine/commit/e4b7ba49e76f44a337add0308bc749e4ab109dab))
- Log an expected controller error as one warning line ([61cd05ddd](https://github.com/underpostnet/engine/commit/61cd05ddd0eedc324bc74e07b19ec540e077b1c4))

### docs-graphify

- Update graphify code graph report ([03e0c57fe](https://github.com/underpostnet/engine/commit/03e0c57fe8751b808d2618190d4a2641c8e9f3f3))

### cli

- Retire bin/deploy.js into site, cluster, release and cmt commands ([adbb1af6d](https://github.com/underpostnet/engine/commit/adbb1af6dc02ee29ec1ca1fcd18a289bc9124567))
- Build and check the code graph of the engine and of each release repository ([34a181fad](https://github.com/underpostnet/engine/commit/34a181fada697de3021f5e5a8cc45899870b78ab))
- Limit the Socket audit to the free plan ([18a44cf62](https://github.com/underpostnet/engine/commit/18a44cf623f5319f6bd43d1624790e2f1e1dad23))
- Read the commit identity and the ACME email from the environment ([7e29814de](https://github.com/underpostnet/engine/commit/7e29814de2986ef98311a31f9e7411884f4e03ce))
- Drop the Git backup repositories from the cron jobs ([0219a9fed](https://github.com/underpostnet/engine/commit/0219a9fedbc127ecbc7369d584a58eb2ba32cc18))
- Delete a remote branch and fetch origin through the GitHub token ([e799420f7](https://github.com/underpostnet/engine/commit/e799420f728116fd35012d23492dc49b2508a0a2))
- Count the unpushed commits of a branch the origin does not have ([776e5bba2](https://github.com/underpostnet/engine/commit/776e5bba2eba9d44ac8d303dcb3d4c3dc47e8025))
- Give the test runner the shell environment ([8f6264039](https://github.com/underpostnet/engine/commit/8f6264039de324790dd54b48b810d27d4b2072ae))

### client

- Build the client once into an immutable bundle under a resource governor ([9cd8b233c](https://github.com/underpostnet/engine/commit/9cd8b233c59dc1ba176f706f4e6e95da00548c02))
- Scroll the confirm modal body and name its action ([8acfb55d6](https://github.com/underpostnet/engine/commit/8acfb55d65d6cdaf08e5c713cc18e37a74978f16))
- Replace the object layer palette panel with the modal palette ([dfa04a528](https://github.com/underpostnet/engine/commit/dfa04a5285d5249cef4398e5de1b95cfa3a84730))
- Act on a dropdown only while its instance owns the id ([ad9314d65](https://github.com/underpostnet/engine/commit/ad9314d65c61e614c374e93cfe251188fc7c94c0))
- Give the AG Grid viewport a finite width under a hidden parent ([41c13a832](https://github.com/underpostnet/engine/commit/41c13a832b50151629f8a3cc3b7499161562dae2))
- Page a list by cursor ([63ca2a2db](https://github.com/underpostnet/engine/commit/63ca2a2db9533af980f76f75aa98e8b90ce53dd0))
- Clone a document with its form values and answer a duplicate map code with 409 ([f1e821e58](https://github.com/underpostnet/engine/commit/f1e821e58884339e34a5730a0fd74591ff953ffd))
- Fix development reload combined mode watches client and API changes ([34b66bf45](https://github.com/underpostnet/engine/commit/34b66bf455b2aeb2a181ae1de35bdd354560a9b5))
- Dispose the editor and list pager state on leave ([bf41af039](https://github.com/underpostnet/engine/commit/bf41af039ab34570eda041b5a9626d2d3eb31422))
- Hold the session and theme state on the root element ([c1f0b418a](https://github.com/underpostnet/engine/commit/c1f0b418a9217b33eb8ecbf6c4b27f9837467119))
- Add the Google sign-in button to the log-in and sign-up forms ([0a21edc23](https://github.com/underpostnet/engine/commit/0a21edc2346f161f8debcf03affcc7632915be9d))
- Read the lists one page at a time with a shared pager ([dedb1ec47](https://github.com/underpostnet/engine/commit/dedb1ec473c657d43e55f61040222ea845c63e98))
- Share the grid query and the first-page rule of a filter change ([0ec499436](https://github.com/underpostnet/engine/commit/0ec499436e7d242b8f57379201802457d035979f))

### cyberia

- Scope the Google sign-in to the Cyberia deploy ([6de929621](https://github.com/underpostnet/engine/commit/6de9296214fa841aa529e08d5762153959ef0f0a))
- Read and write the render PNG with pngjs instead of jimp ([181d5a148](https://github.com/underpostnet/engine/commit/181d5a14812b9fc550f4e092c0dd18b7b3944f3e))
- Capture content baselines and resume a content release through durable publication tasks ([a73c4c1c4](https://github.com/underpostnet/engine/commit/a73c4c1c48854f455d979848913f0b5bf5d667fe))
- Save the population economy and the entity drafts in one Entity Studio save ([758dc3226](https://github.com/underpostnet/engine/commit/758dc3226d95ae0efdc88a3f0443767f934bcf56))
- Name the pending conf and the content database in a universe wallet defect ([33edfd3f3](https://github.com/underpostnet/engine/commit/33edfd3f3a8ffde2305545d342fd9ac19338b4d1))
- Add the working graph and the typed drafts to map populations ([0fb090680](https://github.com/underpostnet/engine/commit/0fb090680c691c488f34a4990dd1d7aef2b3418f))
- Keep the global content in the release database and the content artifact ([3f48cf745](https://github.com/underpostnet/engine/commit/3f48cf7459be20aac36ba156d50de2c76e2a9e2f))
- Import an Object Layer definition from its document alone ([e32a76a31](https://github.com/underpostnet/engine/commit/e32a76a318c2c7f67e74066b26eb80cf9c2c3739))
- Define the definition document format of the Cyberia profile ([6083c5c9b](https://github.com/underpostnet/engine/commit/6083c5c9bed154e4db1c415cad0ea0587142ad71))
- Add the population results lifecycle to the Procedural Engine ([7db06a51b](https://github.com/underpostnet/engine/commit/7db06a51b5c8c5cf6f497d574bca4c9ff3e0dc90))
- Import object layer definitions into the item catalog ([da13031a8](https://github.com/underpostnet/engine/commit/da13031a84d73c590e7807fd5e5617b7e105ba67))
- Add player moderation, restriction and batch operations to the Player Manager ([42790e418](https://github.com/underpostnet/engine/commit/42790e4188cfbb4b72bfd09c8590b159ba06af35))
- Add map populations and the sprite and floor generators to the Procedural Engine ([094588275](https://github.com/underpostnet/engine/commit/094588275619dfa1cd5f7042b28aa13963f3f135))
- Compose the map preview and the portal topology from map bounds ([6e9839975](https://github.com/underpostnet/engine/commit/6e983997559187a0a3cec270015176d973ee35e9))
- Rewrite the placed entities by the entity-type defaults they resolve to ([1089cb1ed](https://github.com/underpostnet/engine/commit/1089cb1ed6a91365b999fb7e5963d7d56df21b76))
- Export the live content into a release ([14ee42deb](https://github.com/underpostnet/engine/commit/14ee42deb95c2ea0198b9ee8d78af043f7712c24))
- Wire the economy, markets and player commits through the runtime ([d91aa1c72](https://github.com/underpostnet/engine/commit/d91aa1c72b9c5738fffed8c844da16f3a3c7fa4e))
- Add player session health, audit and the player manager ([9993dc013](https://github.com/underpostnet/engine/commit/9993dc013264f86cd5b485accacc8ceaef1526db))
- Add economy profiles, item policies, markets and world drops ([b6d7a9b4c](https://github.com/underpostnet/engine/commit/b6d7a9b4cc9bc5f619f6b6a7518965b682657931))
- Add the entry spawn and the action services to the instance map ([ecdec9824](https://github.com/underpostnet/engine/commit/ecdec9824d217faa37a3601946b62ddf3db5aa01))
- Sync the runtime indexes before the rollout and drop the legacy repairs ([2744ab2e7](https://github.com/underpostnet/engine/commit/2744ab2e7d03b69c3a96ffcf6606f3498fc91dc6))
- Compose the instance map from joined map bounds ([fcef54270](https://github.com/underpostnet/engine/commit/fcef5427079b27b8814c38935c3a31215c1711a0))
- Keep the instance map payload tests free of the content artifact ([d56a37be4](https://github.com/underpostnet/engine/commit/d56a37be474953a1500c6d6c63dc5d951c0eddf9))
- Wire universes, social and registries through the runtime ([4b3f14f94](https://github.com/underpostnet/engine/commit/4b3f14f9443b86c3e331bae1bed80d76b5f0f510))
- Compose the idle preview of a player identity ([9bc189c89](https://github.com/underpostnet/engine/commit/9bc189c89a869d057d8fdff9a6d2f23b15de270a))
- Serve the map registry and world previews ([a9cb1786c](https://github.com/underpostnet/engine/commit/a9cb1786cdc416d1bf6b3a88ec121d380c242a08))
- Move friendships into the social graph ([000a47854](https://github.com/underpostnet/engine/commit/000a4785422561f256c4da6b7b9763d253caa2ef))
- Add universe profiles and the server registry ([22e0a67ee](https://github.com/underpostnet/engine/commit/22e0a67eecc2fd690df59135f773468eaf12a775))
- Guard the live changes of a content release ([1e1c8480b](https://github.com/underpostnet/engine/commit/1e1c8480be2ff88b6d2b532cf720bea5d6a885ac))
- Mark the instance map POIs on the client and drop the dynamic endpoint ([f895dcd07](https://github.com/underpostnet/engine/commit/f895dcd07aa8963fcc9097c0bc8f27c0cfb302b3))
- Write the game origins into the instance env ([b060c06b6](https://github.com/underpostnet/engine/commit/b060c06b6f147e547755ba9f43dc60340c617a94))
- Add player profiles, game sessions, tickets and friendships ([e3c6f17c1](https://github.com/underpostnet/engine/commit/e3c6f17c1c0cb9a0ad9be8c37f3936bce57a4598))
- Define the friend limits and chat emoji in the shared defaults ([9f57564d1](https://github.com/underpostnet/engine/commit/9f57564d1a50fcbae7eee570bb1b22f540f48657))
- Generate the economy bounds and container rules into the stat contract ([e2c66f1bc](https://github.com/underpostnet/engine/commit/e2c66f1bc47edde5e587d04062c04168fb9b1180))
- Define the container capacity and party limits in the shared defaults ([085fb3e47](https://github.com/underpostnet/engine/commit/085fb3e4737e5fe0a83e8273444df454b338cce8))
- Bound the economy rules and drop the portal and crafting fees ([975e5d46c](https://github.com/underpostnet/engine/commit/975e5d46c7dc2353accf05ac1a1f54ff46a01605))
- Heal a held consumable with the zero-waste skill and drop the buff factors ([3bd5a5313](https://github.com/underpostnet/engine/commit/3bd5a531310fe6f665cf93b6ac900ccd06f5ad77))
- Add loot, consumables and destructible obstacles to the entity-type defaults ([621e34868](https://github.com/underpostnet/engine/commit/621e348681f63536cb577a9932b27e19fbcbf721))
- Set the respawn time on each map entity ([5ab5f9cda](https://github.com/underpostnet/engine/commit/5ab5f9cda40c3b746390d3ca00022a34d4585a9e))

### client-cyberia

- Remove the population label of the instance selection ([6f286df88](https://github.com/underpostnet/engine/commit/6f286df8881f88ac9c58757a526a61c6d5bd10a7))
- Settle the portal session before a launch resumes ([0738e75d3](https://github.com/underpostnet/engine/commit/0738e75d32f82356c89c764d0633b121a99dd878))
- Launch a world from the portal with the launch bridge ([6a74093d2](https://github.com/underpostnet/engine/commit/6a74093d27ddec7a8b5fcb9cff52d090fdbf2846))

### cli-db

- Back up the databases as sealed archives in the object store ([1f8817430](https://github.com/underpostnet/engine/commit/1f88174308ceedc5faceee84ee5c58816b52accf))
- Dump and restore the partition databases of a host ([779487eda](https://github.com/underpostnet/engine/commit/779487eda68ee542fc08241f156d99788f925ba0))

### object-layer

- Bound every IPFS request and check each answer ([1e4c07034](https://github.com/underpostnet/engine/commit/1e4c0703449e74db42ff035d2c2bcb313c7ecf0b))
- Bound and verify the IPFS gateway reads of an import ([023163de6](https://github.com/underpostnet/engine/commit/023163de6286e33b51543ad8861805252a2c4365))
- Rebuild a definition's materializations from its pinned render ([62c4b45ad](https://github.com/underpostnet/engine/commit/62c4b45ad38f4a6b6bdf6e4cabbfc8cd8a6df6e1))
- Serve the full definition projection and the authority host to an import ([d9daa57a5](https://github.com/underpostnet/engine/commit/d9daa57a5a1c188867fc4e5102045722c60956a3))
- Keep the render of a definition a player owns ([05fe0cf29](https://github.com/underpostnet/engine/commit/05fe0cf2983ed702cf6bd10d204c10dbec7fe5fe))

### client-core

- Keep the editor crud state per editor ([9ecd93295](https://github.com/underpostnet/engine/commit/9ecd9329532be1aa1de37f57d4627df8d9ae37e5))

### hardhat

- Add zod overrides dependencie to v4.6.6 ([ce6a7531b](https://github.com/underpostnet/engine/commit/ce6a7531b3411ca55d79d14a709380fe42dbddf0))
- Refresh the lock file ([da179938b](https://github.com/underpostnet/engine/commit/da179938bc4007bd23076dd511a83f14fdec273e))

### package

- Update dev socketsecurity dependencie to v1.1.66 ([dd2f4882f](https://github.com/underpostnet/engine/commit/dd2f4882f3448baa2f1cfb7ccf8832aaf47a2189))
- Pin shelljs to v0.8.5 ([bcf07a73f](https://github.com/underpostnet/engine/commit/bcf07a73fe9dbd9387ab719c58918face72e21c7))
- Pin shelljs to 0.8.5 ([a14ae13d6](https://github.com/underpostnet/engine/commit/a14ae13d6e2e310497107e24ceabd9e7be02fb50))

### deploy

- Fetch origin through the token before the dependabot merge ([8b026c63a](https://github.com/underpostnet/engine/commit/8b026c63a1b6df340dfac443805fda5f73883f0a))
- Resolve the deploy node from the control node of deploy/nodes ([7b8aa16b7](https://github.com/underpostnet/engine/commit/7b8aa16b7067e6f0c933104dcc68ed3b7e9ef3a8))
- Require the engine to serve its content release before the server rollout ([67b40e8cf](https://github.com/underpostnet/engine/commit/67b40e8cf688f4ce5c5e2159782d5826d23e0ebf))
- Name the development gRPC Service without the traffic colour ([bc13b0fb8](https://github.com/underpostnet/engine/commit/bc13b0fb8c323ac660af541f4f77a569193ecb64))
- Name the gRPC Service without the traffic colour ([5bc2a18ad](https://github.com/underpostnet/engine/commit/5bc2a18ad946c6ee357c134bc93df68bb4ca7d1e))
- Run the player commands in release jobs ([05d685197](https://github.com/underpostnet/engine/commit/05d685197a6c163b237e50c6958fc8cc8992c8e8))
- Set the pod count of a Cyberia deploy with REPLICAS ([9eb33ac6f](https://github.com/underpostnet/engine/commit/9eb33ac6fa39d8d794355e1d9dbe3709b70c1dc6))

### docs

- Describe map populations, the content artifact and the Studio painting ([98f6ef2ca](https://github.com/underpostnet/engine/commit/98f6ef2ca2d703059318e96b0a8b7bb9690942d1))
- Describe the economy, the player session and the quest navigation ([2b1a59636](https://github.com/underpostnet/engine/commit/2b1a59636e6d95ba68ac2d63fa9ca8148080ca58))
- Describe universes, social, registries and identity previews ([3725b5ee2](https://github.com/underpostnet/engine/commit/3725b5ee25763fd2719cfc962ea66f2a10f1afc1))
- Describe player accounts, persistence and the launch bridge ([894e7b3cc](https://github.com/underpostnet/engine/commit/894e7b3ccdbbd0c5189c6acf087f842dce2c827f))
- Describe the session player identity, containers and social systems ([ae56cd1f8](https://github.com/underpostnet/engine/commit/ae56cd1f8688a9f764f687a61ba7f3dc0cddcfcb))
- Add the Google sign-in configuration guide ([e95ba09e4](https://github.com/underpostnet/engine/commit/e95ba09e4320f4addd94dfb7bc38ee7e3de954df))
- Describe the joystick and the action cooldown of the Cyberia client ([21439662e](https://github.com/underpostnet/engine/commit/21439662ee6da74cca0816214ba9758358148c25))

### ci

- Install mongod in the coverage job ([8ec430eee](https://github.com/underpostnet/engine/commit/8ec430eeee756d723900b6897500bfba227fc447))
- Install git before the container jobs check out the repository ([863999e5b](https://github.com/underpostnet/engine/commit/863999e5b9b8ba268d2079181343c8d0dfd67016))

### client-build

- Link each client to the origins of the custom instances ([4f637674c](https://github.com/underpostnet/engine/commit/4f637674c2e53f52da32be562d236f52df9a2b7c))

### cli-cyberia

- Add the player maintenance commands ([b83675ecb](https://github.com/underpostnet/engine/commit/b83675ecbd9851286e6823c58c8925217488502f))

### grpc

- Serve the player service beside the data service ([a51a4de5f](https://github.com/underpostnet/engine/commit/a51a4de5f66c6b89fdc739202f09ba32688084a9))

### auth

- Store refresh tokens hashed, cap sessions and expire guests by id ([3602777ae](https://github.com/underpostnet/engine/commit/3602777ae25a3e433c675cbe06b1a66dae7d7b8c))

### metrics

- Share the Prometheus metric helpers ([804b36b0c](https://github.com/underpostnet/engine/commit/804b36b0c7088e46090e7cf8331ce38e94ae7d66))

### engine

- Register the Google sign-in sources in the test projects ([92673794f](https://github.com/underpostnet/engine/commit/92673794fc0f4574c946ee46343fa93ec48abf19))

### google-auth

- Add the Google sign-in API ([628c0ee8d](https://github.com/underpostnet/engine/commit/628c0ee8d95662ae2190ec5e3295f68ce82513e5))

### user

- Admit accounts without a password and answer a duplicate email or username with 409 ([2c1503d18](https://github.com/underpostnet/engine/commit/2c1503d189238d2bb335ec9d4498d2a7fc2e7964))

### logger

- Redact the code and state of an OAuth redirect ([b2cd29b3c](https://github.com/underpostnet/engine/commit/b2cd29b3c0f8e982ba245eab53f635f912047ae9))

### cli-run

- Read --replicas as a positive pod count ([a8ec5617a](https://github.com/underpostnet/engine/commit/a8ec5617aee62cdcaf92a75c11bdbfe9b9c1f6fd))

### Cyberia

- Event Replay - Delete snapshotRate, the server sends the state every tick ([d7f9df213](https://github.com/underpostnet/engine/commit/d7f9df213780e5b890783d87d24c3f15df3998da))
- Folders - Point the comments at the server content package ([f11a8635c](https://github.com/underpostnet/engine/commit/f11a8635c69898ee203f2b13901832c7b6939638))
- Folders - Write the server stat contract to game/content/ ([c3140ddcd](https://github.com/underpostnet/engine/commit/c3140ddcdc1be292a154dd71c29fafdc7a7c8338))
- Folders - Write the client stat contract header to src/content/ ([3551885bf](https://github.com/underpostnet/engine/commit/3551885bfac61fe40a81fcd1344f5ef1b4960ed7))

## New release v:3.5.0 (2026-10-11)

### test

- Drop the forward proxy test that fetches without an API key ([35ad8dada](https://github.com/underpostnet/engine/commit/35ad8dada2a989d882e1cf8a2c33d9f4ead6f1d8))
- Cover the consumed API declarations ([2ae09356c](https://github.com/underpostnet/engine/commit/2ae09356c9ec95f5ea6badcdada12367764e9074))
- Cover the deploy scaffolding commands ([6e62aa354](https://github.com/underpostnet/engine/commit/6e62aa354c0a60c27461aee7cb57d722c98bdcd8))
- Cover the runtime status contract ([1797e97b1](https://github.com/underpostnet/engine/commit/1797e97b1600ec3b74deac3db1d5e0241875d5b6))
- Cover the event notification provider checks and contract file ([6ce2ffa00](https://github.com/underpostnet/engine/commit/6ce2ffa001d762ca67cd14007fe51ed7eab0809b))
- Cover the forward proxy refusals of an https fetch ([17ca803e5](https://github.com/underpostnet/engine/commit/17ca803e52ed5eef369a0a44a0cda6aa16f39c6d))
- Check the listed components of every client in the default conf ([fd1804c7d](https://github.com/underpostnet/engine/commit/fd1804c7d625e09207861f72060c0279e73cb53f))
- Count a zombie process as dead in the runner suites ([efa9d7b91](https://github.com/underpostnet/engine/commit/efa9d7b915913d558ca33d88a95c8a3e2a2abc48))
- Skip the checks of dropped sources in a sliced template tree ([8301600f8](https://github.com/underpostnet/engine/commit/8301600f8ba90bd6432d326610fac4561c657d99))
- Count a zombie orphan as dead in the batch process test ([c351c5cab](https://github.com/underpostnet/engine/commit/c351c5cab98983bb6ccdca9e991c959ddb6775bc))
- Isolate the unconfigured-domain read from the local deploy environment ([2687d5ae4](https://github.com/underpostnet/engine/commit/2687d5ae4e338467fa6b2bd40fbb90a35f6ab88c))
- Skip the engine-tree checks where a sliced repository lacks their subject ([4e985d710](https://github.com/underpostnet/engine/commit/4e985d710ca0c1f4fc5858a383a8db6a941015af))
- Keep the content and private application assets out of Git ([22b25f6b6](https://github.com/underpostnet/engine/commit/22b25f6b6e7f39027c1ea46117ec2225ed02b2f2))
- Run each batch in a fresh process and merge its reports ([d12ebcc5e](https://github.com/underpostnet/engine/commit/d12ebcc5e0e9746e46b2c90e413e461c7b7f4cbb))
- Plan a test run into ordered batches under a footprint ([9a09fe398](https://github.com/underpostnet/engine/commit/9a09fe398d972dfe11d6a296a501247670c9bc3f))

### cli-test

- Lower the host memory reserve of the safe and balanced footprints ([2ca730ecb](https://github.com/underpostnet/engine/commit/2ca730ecb293db57e2bd003be38cd6d6128deff0))
- Run each test batch inside a host memory budget ([c734f62a5](https://github.com/underpostnet/engine/commit/c734f62a5dee7fb8efb2e8aaf0543bf8e39d5e86))

### client

- Serve the PWA icons from the public root of each client ([6ea25d95c](https://github.com/underpostnet/engine/commit/6ea25d95c32d9a3b14c8c43596c3b51b55d3f6da))
- Move the app shells onto the navigation drawer ([03be1f871](https://github.com/underpostnet/engine/commit/03be1f871675bed7e4e2c219cfb5683b3e02236b))
- Add the shell layout and navigation drawer core ([368d8cfac](https://github.com/underpostnet/engine/commit/368d8cfacb1d275c5f3944b185ef0d5e28de06e4))
- Keep the markdown edit box in a neutral font ([75dbb8baa](https://github.com/underpostnet/engine/commit/75dbb8baaa3b536fc49b88ab6d7134d1140239df))
- Share the page query and pager sync of the paged grids ([37985fccd](https://github.com/underpostnet/engine/commit/37985fccdc410ab63bd04bbe3853ffe4b6fe71ff))
- Show a no-render placeholder in the admin lists ([447f84fa6](https://github.com/underpostnet/engine/commit/447f84fa6d6b33358f611fd5e3f5de7ba28173e5))

### cli-run

- Stop template-deploy outside the engine package or on detected secrets ([d1ae0262f](https://github.com/underpostnet/engine/commit/d1ae0262feee9e6e21861a9db682742e6253f004))
- Forward the detected MongoDB primary pod in dev-cluster ([675df8c8b](https://github.com/underpostnet/engine/commit/675df8c8b2f8c473a130336767079fa79cfeb23b))

### client-cyberia

- Update stat ui-icons ([17c89237e](https://github.com/underpostnet/engine/commit/17c89237e6ba328edbdbda8177d477ea7e614cd6))
- Swap two map entities by index ([d2eb72621](https://github.com/underpostnet/engine/commit/d2eb72621d34639a78b87e6d765cc5b1f0f4744b))
- Update the registry icon ([3bb901fd6](https://github.com/underpostnet/engine/commit/3bb901fd639a65023dfa1134be5a7ae1b600cb7e))
- Keep the loaded map on any table page, reorder entities and follow the session role ([49d2c5f2c](https://github.com/underpostnet/engine/commit/49d2c5f2cffaa4d76eef21445fc45334a900d6c1))
- Add binding, preview column and URL paging to the item catalog ([e4b11e186](https://github.com/underpostnet/engine/commit/e4b11e1863f412b5e2ac6974144b51c2a94a9009))
- Show one foundation context panel in the editors and the viewer ([48e297510](https://github.com/underpostnet/engine/commit/48e297510a5894891eb5ac284c953c3b1655e379))
- Mount the document bar and tabs on the studio editors ([2de36362b](https://github.com/underpostnet/engine/commit/2de36362bfb8be1a717ffee7362c4a2f8d7a68d8))
- Remove the admin button from the cyberia portal menu ([26bf80d2d](https://github.com/underpostnet/engine/commit/26bf80d2d0a52f1ebfeac6883ab6c220b0eafc39))
- Edit the map audio in the studio map editor ([5b2cf6a4c](https://github.com/underpostnet/engine/commit/5b2cf6a4c58565050b9d19ee68e592dc2085b7d5))
- Add a global color replace to the object layer engine ([740638993](https://github.com/underpostnet/engine/commit/740638993ec54fc0961adba28d6b0d3398b097d4))
- Mutate imported frames in the object layer studio ([57e06325f](https://github.com/underpostnet/engine/commit/57e06325f5ab4b8e6b28f45fad37d0dbe7c1bd0c))
- Implement StudioCyberia main menu component ([bff040c3c](https://github.com/underpostnet/engine/commit/bff040c3c5ab94eca06c39861bbecfd0803ecd12))
- Rename object-layer to objectlayer-studio path component directory ([f7ef740ef](https://github.com/underpostnet/engine/commit/f7ef740ef10a7abd9bf9401443bdd96802276220))
- Open the editors from a cyberia-studio submenu ([26b2134a4](https://github.com/underpostnet/engine/commit/26b2134a4eee476f3637a1f1950ecea82b6c00cc))
- Add underpost and cyberia client PWA assets ([16b2d3c44](https://github.com/underpostnet/engine/commit/16b2d3c44d17e95bcbaea5251dff1b8717d872e0))

### ci

- Install a MongoDB server for the Cyberia coverage run ([7460bc340](https://github.com/underpostnet/engine/commit/7460bc340e0447a24b2db67d78f99ddb4a37d33f))
- Pass BUILD_MODE to the cyberia-client image as a build argument ([83e506cf6](https://github.com/underpostnet/engine/commit/83e506cf6ee21083e7179810fc5dd9895da5ef7f))
- Install git before the test workflows check out the repository ([5bb854c5c](https://github.com/underpostnet/engine/commit/5bb854c5c7c74338315b59b418261489d1bb9f16))
- Trust the checkout in git before the test workflows run ([0a0b794ae](https://github.com/underpostnet/engine/commit/0a0b794ae9fbe30f9c1edd9867c75522b22b37a9))

### cyberia

- Cover the stored frames and the palette remap of the Procedural API ([7ad586f7f](https://github.com/underpostnet/engine/commit/7ad586f7f5736347f00fc3840fb90056202e6785))
- List unbound items and rebuild the world when a binding changes ([c7a9e0d4b](https://github.com/underpostnet/engine/commit/c7a9e0d4b4ab20b15557d3c89aee88053c93b739))
- Import frames exactly as stored unless Mutate is on ([f30284498](https://github.com/underpostnet/engine/commit/f30284498e3d2265bebb69907c4e7f26589bbfdd))
- Show the Procedural Engine view to every role and notify on denied changes ([26bc1951b](https://github.com/underpostnet/engine/commit/26bc1951b241fdc60718776552bbe92fe7449985))
- Bind items to definitions through the catalog and split the project by capability ([2142711a3](https://github.com/underpostnet/engine/commit/2142711a3baa5013dad05632892fdbda7605579b))
- Add the Procedural Engine with templates and palettes from content ([0c10b3dd1](https://github.com/underpostnet/engine/commit/0c10b3dd1bd5cd9961e2e631285765bacdc7703f))
- Add the saga sync view and check its items against the catalog ([1ee6dc6fd](https://github.com/underpostnet/engine/commit/1ee6dc6fdb9c8956092dd00adbcc591b300de0e1))
- Build a content release from the content revision its deployment locks ([546f88e26](https://github.com/underpostnet/engine/commit/546f88e2617e835a9feda06991ef9ac33bfedb5f))
- Build the local Docker stack images from the workspace sources ([585088c5d](https://github.com/underpostnet/engine/commit/585088c5d23a4d06d8d5f9763608c19dd70502dc))
- Declare the release content of dd-cyberia in one module ([93d2b4fd9](https://github.com/underpostnet/engine/commit/93d2b4fd9002dfc4560369266e14c34ef515740b))
- Keep the other definitions of a label when a backup restores one ([c24f62cf8](https://github.com/underpostnet/engine/commit/c24f62cf8f4c79d55f6e041176c829cf00509aa3))
- Reload the game servers that serve a written database ([d78cb9a5c](https://github.com/underpostnet/engine/commit/d78cb9a5c66413740ba75cd5509838b2ae474410))
- Refresh the map preview a write touches ([8c30558d5](https://github.com/underpostnet/engine/commit/8c30558d565cbd5cd7dfec37c85ddd80889b3afc))
- Allow the object layer viewer on the itemledger client ([0682a1980](https://github.com/underpostnet/engine/commit/0682a198065170655ddb084843b9f5cc5e33bd2c))
- Route an audio binding stated without settings by its event ([dff963a77](https://github.com/underpostnet/engine/commit/dff963a77a112cb8ff02f580c23af7e58771f3e4))
- Seed the default audio of one map through the map audio API ([413662aea](https://github.com/underpostnet/engine/commit/413662aea6d186999ae828ee44555510bc4ada64))
- Add the overhead-occlusion foreground behavior ([b9bc2b017](https://github.com/underpostnet/engine/commit/b9bc2b017ca22dfcc97a6442f30c9086eaca3512))
- Resolve sagas through instance defaults and summons ([abf4514e9](https://github.com/underpostnet/engine/commit/abf4514e99f04e3dfa5f74d1fe74f1d34c88c425))
- Show the saga of every item and map in the studio ([e02ca69cb](https://github.com/underpostnet/engine/commit/e02ca69cbb187fb196f54caddc9591616250dc98))
- Rework the cyberia editors into the studio suite ([607e74599](https://github.com/underpostnet/engine/commit/607e74599f5bd08affdd2eecf04455bb40d0d009))
- Serve the authoring context of every map and item ([cbc449589](https://github.com/underpostnet/engine/commit/cbc449589ac167657b488efed12195a5f8aef3fa))
- Serve content from the external content artifact ([b323efdef](https://github.com/underpostnet/engine/commit/b323efdef5ecadbc3341aaa2b62d89a97692f4ac))

### document

- Draw a new stable slug when a write loses the slug race ([8ff24cf93](https://github.com/underpostnet/engine/commit/8ff24cf932ed74c66cba6faab79ca37917f1bbfb))

### docs

- Update ecosystem landscape doc ([5f4063db3](https://github.com/underpostnet/engine/commit/5f4063db316d4f34dc24dd90b5ac92a3881dee2f))
- Refresh the separate client and API servers guide ([2ea783d0a](https://github.com/underpostnet/engine/commit/2ea783d0aefb22b0d8a5e098d81a4cf69966502b))
- Regenerate the CLI references ([b95fb0844](https://github.com/underpostnet/engine/commit/b95fb08442ec9a85f67b2a15ccb009a78d1284b5))
- Fix the Socket badge URL in the readme ([35d107392](https://github.com/underpostnet/engine/commit/35d107392c911e39de582a617f175121cae0f071))
- Land each domain on its white paper ([a14de7c04](https://github.com/underpostnet/engine/commit/a14de7c041c3876ddc8fcff245bd78ba2db1f93b))
- Navigate each domain from one documentation view ([32e31670b](https://github.com/underpostnet/engine/commit/32e31670b8e291a5ee689382ffdf5e707b4451d6))

### engine-cyberia

- Install the dev dependencies of cyberia-content before the pack ([01e1d20e1](https://github.com/underpostnet/engine/commit/01e1d20e12da27df140016669c8838f3438eb9f7))

### cli

- Fetch the current branch with the GitHub token when counting unpushed commits ([f3f78e9c8](https://github.com/underpostnet/engine/commit/f3f78e9c8eda95b5ad17f8a02e448bd8f64c5335))
- Run dev-cluster with the selected cluster type ([3e4465fa0](https://github.com/underpostnet/engine/commit/3e4465fa0b1beb359a3128a243b4ebec38b20c71))
- Render a Docker Compose stack from the stack a project declares ([750341cc0](https://github.com/underpostnet/engine/commit/750341cc0067f32c3b75677dd2a813883179965b))
- Release a container image by the digest of an exact revision ([8d53b3ccb](https://github.com/underpostnet/engine/commit/8d53b3ccb932a35dc8f978b4fc2360201aee1bf2))
- Add the source-release command for source channels, mirrors and release jobs ([87cd3ab8b](https://github.com/underpostnet/engine/commit/87cd3ab8b018092dcc89133d063d5827df2f82fe))
- Project the keys of one configuration scope into its own Secret ([5a1e60999](https://github.com/underpostnet/engine/commit/5a1e60999ccbdf41ec5042564c7a9b27abd58e7f))
- Promote the colour that --traffic names ([9c2b6e790](https://github.com/underpostnet/engine/commit/9c2b6e790ceda81742223c7b7cbe48217c32961b))
- Remove the instance builds the topology no longer declares ([2a5755313](https://github.com/underpostnet/engine/commit/2a575531392782e4f2f105cfa7690f26d9fc3399))
- Add the footprint, batch timeout and diagnose options ([35cf45ca3](https://github.com/underpostnet/engine/commit/35cf45ca31a11f1009342eaa12c4f9f9d3866457))

### client-objectlayer

- Show the first frame when the editor opens ([1f46a0e06](https://github.com/underpostnet/engine/commit/1f46a0e06904b5135fbb64953e992b541b71a7cd))

### engine

- Resolve the underpost CLI with a PATH lookup ([3eebd5aa1](https://github.com/underpostnet/engine/commit/3eebd5aa105f9dc35f13a398d84d91716f6f197b))
- Replace nodemon with a shared source watcher ([307942884](https://github.com/underpostnet/engine/commit/30794288438a7274f91ec67195f55fb9fd1194f8))
- Defer a transient systemd unit behind a timer ([e735cdcf6](https://github.com/underpostnet/engine/commit/e735cdcf665aab60a637409d88d89d8351d33f60))
- Build the template with every public tree a client reads ([603eca5b7](https://github.com/underpostnet/engine/commit/603eca5b7753d45d80ab9f35e00d9d9a5da5b428))
- Run the suites a private test source publishes with it ([ab992504b](https://github.com/underpostnet/engine/commit/ab992504b26b4a222cf9505e7dfbc79b8da4863d))
- Fetch only the new history when publishing the private test source ([5a94027df](https://github.com/underpostnet/engine/commit/5a94027df220c386529f01e953d0b81d8b858171))
- Keep the staged CLI package out of the base template ([f9b125011](https://github.com/underpostnet/engine/commit/f9b12501168fd898f967e91766ab8121cfa7a815))
- Carry the Object Layer protocol in the base template ([846fd1c53](https://github.com/underpostnet/engine/commit/846fd1c53086cc44694e3d8e06abaaad356737d9))
- Extract the filter model and match no row on an empty set ([c2a1f26d4](https://github.com/underpostnet/engine/commit/c2a1f26d4362ec3331fa2031cfed32a629ed9854))

### mailer

- Verify SMTP certificates unless the transport sets tls ([c9d324c68](https://github.com/underpostnet/engine/commit/c9d324c688f0615f102651a838a2edf887310e5a))

### cli-db

- Quote every value in the MariaDB and MongoDB pod commands ([a38f1d21a](https://github.com/underpostnet/engine/commit/a38f1d21aef6058839ce437236d4b9a882866963))

### logger

- Redact credentials inside quoted sh -c commands ([17a70c3c8](https://github.com/underpostnet/engine/commit/17a70c3c8b3b38fbafc36976e172d4da0989ccde))

### cli-baremetal

- Accept bootstrap status events only for single path segments ([907f2b8c7](https://github.com/underpostnet/engine/commit/907f2b8c76c2526e984a5fa4788ab6eb0e15dbe9))

### file

- Refuse a missing or malformed file id and drop the id-less routes ([4c98303e9](https://github.com/underpostnet/engine/commit/4c98303e9569a08d26e0db8320c3e07e25631d09))

### package

- Drop nodemon, add httpxy and pin shelljs ([a3264de52](https://github.com/underpostnet/engine/commit/a3264de52dacc490764af5715c115a76b78938fd))
- Update proxy-addr and sharp transitive dependencia overrides ([7d941f0be](https://github.com/underpostnet/engine/commit/7d941f0be2e6c4d5e30e33764e6836acf3a18333))
- Keep the product checkouts out of the npm package ([0811e0229](https://github.com/underpostnet/engine/commit/0811e022993f09f2d907acc89644e0e152b9326f))
- Remove sharp override dependencie ([8c9b615aa](https://github.com/underpostnet/engine/commit/8c9b615aa887e0d68b379d4a888d69dcad50b35e))

### cluster

- Render each host once in the owned hosts block ([cbd460e26](https://github.com/underpostnet/engine/commit/cbd460e26fbaabbb0e8d82c6231775fa9843d3ec))
- Pin the control-plane address at bring-up ([ba4f70846](https://github.com/underpostnet/engine/commit/ba4f70846c2e9d96c808f0649457d179e3fff0c1))
- Keep the Kind node image across a cluster reset ([e6aa46942](https://github.com/underpostnet/engine/commit/e6aa46942bf605a2a5960edf79a87c092affb9f4))

### express

- Keep the public routes the client host can render ([9cd26c9b2](https://github.com/underpostnet/engine/commit/9cd26c9b28854442dc4d96680555e864b429f0b9))
- Declare the dynamic public routes of a host in its conf ([4e322acd4](https://github.com/underpostnet/engine/commit/4e322acd4fe810b82688527d307b3fc86e7129f0))

### server-proxy

- Serve the dev proxy through httpxy ([be9229a9c](https://github.com/underpostnet/engine/commit/be9229a9cb2b90305923c5549aea6c61e0c5ba57))
- Issue machine-local certificates from their own root ([26f0ab5f6](https://github.com/underpostnet/engine/commit/26f0ab5f691f827d10adc493eb8edaaff0741dee))

### scripts

- Pin the mkcert download to a verified build ([35ec21fb1](https://github.com/underpostnet/engine/commit/35ec21fb11d34967c48df49ed2bf0c1710013a37))
- Show the event dispatcher state in the event monitor ([41b8f2c2e](https://github.com/underpostnet/engine/commit/41b8f2c2e237095d32639aa5acfbfbde9995549f))

### runtime

- Change the working directory with process.chdir ([e3a32a5e5](https://github.com/underpostnet/engine/commit/e3a32a5e5f1b0673f0721f0b04061bbbedf475d6))

### cli-dns

- Pin the default interface IPv4 binding as a static profile ([e08cb6d9b](https://github.com/underpostnet/engine/commit/e08cb6d9b7b389274d302dfa30f3ce216d7fa976))

### event

- Warn of missing probe targets only for rules that read probes ([a5722b38e](https://github.com/underpostnet/engine/commit/a5722b38ecd72fd77efbc3e0dde202f1c93bd921))
- Strip terminal colour codes from remediation output ([e86a4b34e](https://github.com/underpostnet/engine/commit/e86a4b34ee85966a5914e6250014828e1d5f8668))
- Bind the dispatcher service to the shared webhook token ([07c418a2b](https://github.com/underpostnet/engine/commit/07c418a2bc37492b2afdba43310b0cb904d8b83e))
- Rebuild, restart and verify WireGuard in every tunnel repair ([1ef916e29](https://github.com/underpostnet/engine/commit/1ef916e290cc300dcdf2b4438a8a1f1c01abeeea))

### monitoring

- Prune the series of targets the configuration no longer renders ([6b0eb3dd5](https://github.com/underpostnet/engine/commit/6b0eb3dd57a406beb9fe19d439b6192f2b8b6ae9))
- Let the Blackbox Exporter ping through an unprivileged socket ([e11646633](https://github.com/underpostnet/engine/commit/e11646633322d05cec5f92bdbce95da0f5515184))
- Silence dependent alerts while the control-plane tunnel is down ([fb08c9015](https://github.com/underpostnet/engine/commit/fb08c90152f4c22e5528cd936a5ca54198036032))
- Verify that the dispatcher accepts the Alertmanager token ([9e06709ab](https://github.com/underpostnet/engine/commit/9e06709abacc55866ed8d9761c7a16fdc5372e28))

### cli-wireguard

- Leave an equivalent topology file unchanged ([4ad566ae8](https://github.com/underpostnet/engine/commit/4ad566ae8af70ee58f90898272095bc2c266d49b))
- Refuse a setup on a host with another node identity ([44684d33a](https://github.com/underpostnet/engine/commit/44684d33af864ad9ca25b7506c80142d1cfcbca6))

### cli-cron

- Load the scoped host configuration into the deploy environment ([6b947b8e6](https://github.com/underpostnet/engine/commit/6b947b8e62a329c77c88c24b3fee89f9d52d484e))

### deploy

- Remove the private-to-public mirror stage ([6daf072a5](https://github.com/underpostnet/engine/commit/6daf072a5645ce67e5bd2f31c466a520b25336d1))
- Pull the latest image on the public channel ([0270915a7](https://github.com/underpostnet/engine/commit/0270915a7d42374a26441a0dbcbafe6fa194c0ec))
- Ensure pull base image on cluster ([e21e80ea6](https://github.com/underpostnet/engine/commit/e21e80ea69caaafafa12479b2fb1cf559f474077))
- Skip the clone relocation when the pod clones the engine ([5094bd482](https://github.com/underpostnet/engine/commit/5094bd48266c6ded08df64d33c858c61a9d02eb1))
- Deploy the runtimes only when SKIP_CONTENT_RELEASE is set ([00ca8bbdf](https://github.com/underpostnet/engine/commit/00ca8bbdfb14fb386f664e1569a485f39997c24e))
- Release the Cyberia repositories from a source channel ([bfd74ea94](https://github.com/underpostnet/engine/commit/bfd74ea943682252fab617d4e2194ea6196bb888))
- Run the lampp deploy from its own source repository ([36810e827](https://github.com/underpostnet/engine/commit/36810e827b917af264d96e298c10225628cbd564))

### cyberia-catalog

- Update sharp version to v0.35.5 ([6138327c1](https://github.com/underpostnet/engine/commit/6138327c1e89a058d8d624a5afab6a09a274f5f2))

### object-layer

- Store definitions by CID on IPFS and let the publisher purge them ([3ee268823](https://github.com/underpostnet/engine/commit/3ee2688239f4253e1e672eafd6265d358ffe1cef))
- Leave the shared renders of a content release to its prune ([9eb8883fe](https://github.com/underpostnet/engine/commit/9eb8883feade49a8a75379cbc92c50b3f4175977))
- Lay out the object layer view in two columns ([cbf6d2b6e](https://github.com/underpostnet/engine/commit/cbf6d2b6ed2005659e5a42d0fc49d6c26af57d9a))
- Rebuild stored definitions in line with the current profile ([cdda6e46b](https://github.com/underpostnet/engine/commit/cdda6e46b9d0ceb827d657bf7a9b57676a3c0bb3))
- Share the object layer view button as a table column ([72b329b8d](https://github.com/underpostnet/engine/commit/72b329b8d12fc33a591372d2b4b863b8682d1766))
- Let the host name the list an object layer view leads back to ([f4f1edddf](https://github.com/underpostnet/engine/commit/f4f1edddf99a9125fc4384a5e17a7e1480bc96ab))
- Size the object layer view titles independently of the host theme ([faa5e611a](https://github.com/underpostnet/engine/commit/faa5e611a22385177b0192c11db8f1380984e4e6))
- Lay out the object layer view in two columns on wide screens ([18c465afb](https://github.com/underpostnet/engine/commit/18c465afb53ef246746803c0dc9ddae83b5d78f2))
- Keep the viewer button border on hover ([df320dd2b](https://github.com/underpostnet/engine/commit/df320dd2be6e4cb00517f1407824cc77bb9613e5))
- Scale the idle preview to its full size with no margin ([e26b7cb56](https://github.com/underpostnet/engine/commit/e26b7cb569e32583deb2c803eac4c432cef10382))
- Open each object layer view at its own path ([db89f7de6](https://github.com/underpostnet/engine/commit/db89f7de6fe6f44fbb12498106225c635f6d3bb0))
- Answer 404 for the metadata of an unknown definition ([3ff34008b](https://github.com/underpostnet/engine/commit/3ff34008b580b3ffb53f6bf24e6f1c623a1894a1))
- Describe each object layer page by its definition in the served shell ([7583e0e21](https://github.com/underpostnet/engine/commit/7583e0e2126d4ae531b9d7622cb4c9b2f2ea20bb))
- Declare the CID form in ObjectLayerProtocol ([24b1d95fb](https://github.com/underpostnet/engine/commit/24b1d95fb24ae6e484b2a50e1049bea5e01a64ac))
- Open each object layer in a viewer modal of its own ([6a19fc4b0](https://github.com/underpostnet/engine/commit/6a19fc4b094210e57f6157361dc9f9768256ebca))
- Paint the render editor source in the studio ([98468a422](https://github.com/underpostnet/engine/commit/98468a422b1a8a4b26490b2fce2f2534d52a1810))
- Store the render editor source as indexed pixel frames ([9275f11ab](https://github.com/underpostnet/engine/commit/9275f11ab5f27539660ffcc0890a31b9bd5b12b2))

### test-runner

- Report each failed test, batch log and gate failure at the end of a run ([98286a0ff](https://github.com/underpostnet/engine/commit/98286a0ff98c4afbac6984a3a5e7f51e456b1fea))

### client-core

- Use a file-question icon for the documentation entry ([32052ac0a](https://github.com/underpostnet/engine/commit/32052ac0a1bbe9d1ca02758199e39c6b14eb5997))
- Skip the file render when the requesting view is gone ([d91254795](https://github.com/underpostnet/engine/commit/d912547956434cce6afccc6b7173e68648fa478a))
- Name the build manifest where the repository identity travels ([bfa5d3082](https://github.com/underpostnet/engine/commit/bfa5d30825ca30b81e8765b6beb15e967296a573))
- Replace the render payload with the Underpost Build Manifest ([d2029e81d](https://github.com/underpostnet/engine/commit/d2029e81dcbad1603d7af480ca57d3edf94de422))
- Declare the retro font faces once for the shells ([55598778e](https://github.com/underpostnet/engine/commit/55598778ede546ce0eb34071437f5efd12df6de9))
- Share the document bar and tabs across the studio editors ([e793d8fa3](https://github.com/underpostnet/engine/commit/e793d8fa3c507f33c51323607d36e873c5c6cb09))
- Add the object layer public route ([bd3ac31b4](https://github.com/underpostnet/engine/commit/bd3ac31b4af763b95b600a7e777fd34c46fae2f7))
- Give the route to the view raised last when a view closes ([ba1769436](https://github.com/underpostnet/engine/commit/ba1769436a91d219427a569b7cba31fce4905df0))
- Share the submenu landing across the shells ([5b567a5fb](https://github.com/underpostnet/engine/commit/5b567a5fba75ee622dab7a4991a36800f900ee86))
- Share undo, drafts and layout across the studio editors ([b8566b16c](https://github.com/underpostnet/engine/commit/b8566b16c614f6746f323ca6089855701648658d))

### client-conf

- Ship every component the default client imports ([3bf9b0f75](https://github.com/underpostnet/engine/commit/3bf9b0f754902985a8a2d8e5d90eb969b90d0a4d))

### client-build

- Root the icon links and icon manifests at the base path of a sub-path build ([bf0ad6819](https://github.com/underpostnet/engine/commit/bf0ad68190047341f75d67795c4a56358d606d68))

### cyberia-cli

- Add the release commands for the product repositories and their lock ([c4fcc6eb8](https://github.com/underpostnet/engine/commit/c4fcc6eb8681c2691b86d9d2f659a1cf93ea59d3))
- Sync stored object layers through the profile ([eb2c3cb56](https://github.com/underpostnet/engine/commit/eb2c3cb5603cab54db60539540fcd72a16393053))
- Run both cleanup steps of import-content --clean ([6048e72a5](https://github.com/underpostnet/engine/commit/6048e72a5c3a74c35d50a530c970a1851d964404))
- Skip stored item ids when importing content ([89c69c0fe](https://github.com/underpostnet/engine/commit/89c69c0fe181fdab86a480694bc1df8de18c15cf))
- Remove semantic OL generator ([3de15b401](https://github.com/underpostnet/engine/commit/3de15b4015bcd389677fb445e50799e9c2b091e6))

### db

- Serve one content database to every reader ([203ccad6f](https://github.com/underpostnet/engine/commit/203ccad6fcd12e45da735b26ca3406093c67fa18))
- Retry a database connection that fails while the runtime starts ([181b0a5a3](https://github.com/underpostnet/engine/commit/181b0a5a381e66d6b2cd65fa7c3efd163c94c3d7))
- Close the Valkey connection of a short-lived process ([88b6caad9](https://github.com/underpostnet/engine/commit/88b6caad9069ec9d4183f04f3d0e54af8f26172f))
- Keep replica data on restore unless reset is explicit ([1e1bde64d](https://github.com/underpostnet/engine/commit/1e1bde64d6996b21ed955423395d23aa0df4ee36))
- Start mongod only after its member name resolves ([325f2f01b](https://github.com/underpostnet/engine/commit/325f2f01b206e1041a7ce30400749c18a70d7f0a))

### api

- Invalidate the client hints when an instance conf changes ([ed0efd5bc](https://github.com/underpostnet/engine/commit/ed0efd5bc0dbed1a65d8b257454733cb285a8d89))

### server

- Fail a definition removal when ItemLedger does not answer ([9dc6cc635](https://github.com/underpostnet/engine/commit/9dc6cc635a1c83a742f5bb2b5cfa3a6309e46673))
- Name the deploy host that owns an API in one helper ([9ae7c062d](https://github.com/underpostnet/engine/commit/9ae7c062df155e717dc3f58ea393e4ab64b06972))
- Extract the shell metadata shared by public route pages ([51ceafe1a](https://github.com/underpostnet/engine/commit/51ceafe1a96e5c57a9a004a7efc3902b245ca90c))

### client-itemledger

- Open the object layer of each registry row ([e682d9f4b](https://github.com/underpostnet/engine/commit/e682d9f4b7628936b8843af20578c40e05616e1b))
- Present object layer views at their own path ([b0696cead](https://github.com/underpostnet/engine/commit/b0696cead7644d7df67e4a45d392d0f4ed6d6975))

### cyberia-docker-compose

- Update cyberia docker compose stack with new instance codes ([dc5c56ec1](https://github.com/underpostnet/engine/commit/dc5c56ec12b50dc5e60df6d50f6cd9d7b1aeabec))

### deploy-cyberia

- Publish the deployment images under the images tree ([55bbd1f2c](https://github.com/underpostnet/engine/commit/55bbd1f2c6006f30214fd461f275612be22b408a))
- Deploy pinned content and drop public asset sync ([c7fb96e0d](https://github.com/underpostnet/engine/commit/c7fb96e0d5c52655b3ae4880d9d969b8b93aff3f))

### cyberia-docs

- Document the content artifact and retire the procedural saga ([0ec4ee838](https://github.com/underpostnet/engine/commit/0ec4ee838ed486b2eed20d424f61fc7596998ba7))

## New release v:3.4.5 (2026-09-25)

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

