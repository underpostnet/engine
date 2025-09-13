#!/usr/bin/env bash
set -euo pipefail

sudo dnf install -y neovim


sudo rm -rf ~/.config/nvim
sudo rm -rf ~/.local/share/nvim

mkdir -p ~/.config/nvim
mkdir -p ~/.local/share/nvim/site/autoload

# Install vim-plug for Neovim
curl -fLo ~/.local/share/nvim/site/autoload/plug.vim --create-dirs \
  https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim

# Create an init.vim with nvim-tree.lua + web-devicons + gruvbox (theme)
cat > ~/.config/nvim/init.vim <<'EOF'
" Minimal init.vim to use nvim-tree.lua + gruvbox theme via vim-plug

" --- vim-plug manager
call plug#begin('~/.local/share/nvim/plugged')

" file explorer (nvim-tree)
Plug 'nvim-tree/nvim-tree.lua'
Plug 'nvim-tree/nvim-web-devicons'    " optional: file icons

" colorscheme
Plug 'morhetz/gruvbox'

" sensible defaults, optional
Plug 'tpope/vim-sensible'

call plug#end()

" --- UI settings
syntax on
filetype plugin indent on
set number
set relativenumber
if has('termguicolors')
  set termguicolors
endif
set background=dark

" gruvbox options (optional)
let g:gruvbox_contrast_dark = 'soft'
colorscheme gruvbox

" --- nvim-tree configuration (Lua block)
lua << 'LUA'
-- safe require
local ok, tree = pcall(require, "nvim-tree")
if not ok then
  return
end
tree.setup{
  view = {
    width = 30,
    side = "left",
    preserve_window_proportions = true,
  },
  renderer = {
    indent_markers = { enable = true },
  },
  actions = {
    open_file = {
      quit_on_open = false,
    }
  }
}
LUA

" --- mappings: Ctrl-n toggles nvim-tree
nnoremap <C-n> :NvimTreeToggle<CR>

" Open nvim-tree on startup when opening nvim with no file args
autocmd StdinReadPre * let s:std_in=1
autocmd VimEnter * if argc() == 0 && !exists('s:std_in') | NvimTreeToggle | wincmd p | endif
EOF

# Fix permissions in case something was left owned by root (happens if you used sudo on these paths before)
sudo chown -R "$USER":"$USER" ~/.config/nvim ~/.local/share/nvim 2>/dev/null || true

# Install plugins automatically (non-interactive)
nvim +PlugInstall +qall

echo
echo "Done. Plugins installed."
echo "Run 'nvim' and press Ctrl-n to toggle the file tree."
echo "If colorscheme is not correct, ensure your terminal supports truecolor and TERM is xterm-256color."
