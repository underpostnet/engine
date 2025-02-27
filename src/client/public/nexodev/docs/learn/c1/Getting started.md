### 1.0 Getting started

**1.1** Install node version manager <a target='_top' href='https://github.com/nvm-sh/nvm'>nvm</a>:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

```bash
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

**1.2** In your terminal profile file (`~/.bash_profile`, `~/.zshrc`, `~/.profile`, or `~/.bashrc`) set:

```bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
```

**1.3** Install node v23.8.0:

```bash
nvm install 23.8.0
```

**1.4** Set node version:

```bash
nvm use 23.8.0
```

**1.5** Install underpost environment:

```bash
npm install -g underpost
```

**1.6** Create new app:

```bash
underpost new app-name
```

After installation, the server will run on <a target='_top' href='http://localhost:4001'>localhost:4001</a>

**1.7** Install vscode: <a target='_top' href='https://code.visualstudio.com/download'>https://code.visualstudio.com/download</a> win/linux

**1.8** Open VS Code in the project's root directory and edit the `Hello World!` string located in `src/client/Default.index.js`. The change will be reflected on the app's homepage.
