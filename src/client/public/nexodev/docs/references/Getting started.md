# Getting started

The project has three layers. Keep this model in mind before writing any code:

1. Underpost Platform owns the toolchain, deploy surface, and operational infrastructure.
2. The PWA layer owns SSR views, fallback shells, and service-worker generation.
3. Cyberia adds a three-service MMO runtime on top: `engine-cyberia`, `cyberia-server`, and `cyberia-client`.

If you are working on the MMO stack, keep the command split clear:

- use `underpost` for platform, build, deploy, and operations
- use `cyberia` for content, instance, chain, and presentation-hint workflows

---

## Installation

### 1. Install nvm

```bash
curl -o- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.40.1/install.sh | bash
```

or with wget:

```bash
wget -qO- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.40.1/install.sh | bash
```

### 2. Configure your terminal profile

In `~/.bash_profile`, `~/.zshrc`, `~/.profile`, or `~/.bashrc`, add:

```bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### 3. Install and use Node 24.15.0

```bash
nvm install 24.15.0
nvm use 24.15.0
```

### 4. Install the underpost CLI

```bash
npm install -g underpost
```

### 5. Create a new project

```bash
underpost new app-name
```

The server starts at `http://localhost:4001` after bootstrap.

### 6. Install VS Code

Download from `https://code.visualstudio.com/download` (Windows / Linux).

Open the project's root directory in VS Code and edit the `Hello World!` string in `src/client/Default.index.js`. The change is reflected on the app homepage immediately.

---

## Split local development

Run the API and client in separate processes:

```bash
npm run dev:api ...
npm run dev:client ...
```
