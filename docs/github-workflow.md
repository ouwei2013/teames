# GitHub 协作流程（Teames）

本文说明如何 Fork Teames、在本地修改，并向主仓库提交 Pull Request（PR）。适合第一次参与开源协作的同学。

**主仓库（维护者）：** https://github.com/ouwei2013/teames

**你的工作副本：** 先 Fork 到你自己的 GitHub 账号，再 Clone 到本机。

---

## 1. 一次性准备

### 1.1 需要安装的软件

| 软件 | 用途 |
|------|------|
| [Git for Windows](https://git-scm.com/download/win) | 版本管理与 GitHub 同步 |
| [GitHub 账号](https://github.com) | Fork、PR |
| （可选）[GitHub Desktop](https://desktop.github.com/) | 图形界面 Clone / Commit / Push |
| （可选）Cursor / VS Code | 编辑代码与文档 |

验证 Git 是否可用：

```powershell
git --version
```

### 1.2 Fork 主仓库

1. 打开 https://github.com/ouwei2013/teames
2. 点击右上角 **Fork**
3. 选择你的账号（例如 `Lusmirk/teames`）

Fork 后，GitHub 会在你的账号下复制一份仓库。你在自己这份上改代码，再通过 PR 请维护者合并回主仓库。

### 1.3 Clone 到本机

**命令行（将用户名换成你的 GitHub 用户名）：**

```powershell
cd D:\
git clone --depth 1 https://github.com/Lusmirk/teames.git teames
cd teames
```

网络不稳定时可多试几次，或使用 `git clone --depth 1` 只拉取最新提交。若 Git 传输经常失败，可改用 [GitHub Desktop](#14-使用-github-desktop) 或浏览器 **Download ZIP**（见 [常见问题](#6-常见问题)）。

建议目录名用 `teames`，不要与 Download ZIP 解压得到的 `teames-main` 混用。ZIP 下载**没有** Git 历史，无法直接 Push 和开 PR。

**GitHub Desktop：**

1. 打开 https://github.com/Lusmirk/teames
2. **Code → Open with GitHub Desktop**，或 Desktop 里 **File → Clone repository**
3. 本地路径例如 `D:\teames`
4. Fork 用途选择 **Contribute to the parent repository**（向父仓库贡献）

### 1.4 添加主仓库为 upstream（只需做一次）

```powershell
cd D:\teames
git remote add upstream https://github.com/ouwei2013/teames.git
git remote -v
```

应看到：

- `origin` → 你的 Fork（`Lusmirk/teames`）
- `upstream` → 主仓库（`ouwei2013/teames`）

---

## 2. 日常修改流程

### 2.1 开新分支

不要直接在 `main` 上改。每次任务新建分支，例如：

```powershell
cd D:\teames
git checkout main
git pull origin main
git checkout -b docs/my-change
```

**GitHub Desktop：** 点击 **Current branch → New branch**，例如 `docs/github-workflow`。

分支命名建议：

| 前缀 | 含义 |
|------|------|
| `docs/` | 文档 |
| `fix/` | 修 bug |
| `feat/` | 新功能 |

### 2.2 编辑并保存文件

用 Cursor 或 VS Code 修改仓库中的文件，保存。

### 2.3 查看改动

```powershell
git status
git diff
```

**GitHub Desktop：** 左侧 **Changes** 面板会列出修改的文件。

### 2.4 提交到本地仓库

```powershell
git add docs/github-workflow.md
git commit -m "docs: add GitHub workflow guide for contributors"
```

Commit 信息建议简短说明「改了什么」，例如：

- `docs: add GitHub workflow guide for contributors`
- `docs: fix Windows install steps in README`

**GitHub Desktop：** 填写左下角 **Summary**，点击 **Commit to \<branch\>**。

### 2.5 推送到你的 Fork

```powershell
git push -u origin docs/my-change
```

第一次推送该分支时需要 `-u`，之后同一分支可直接 `git push`。

**GitHub Desktop：** 点击 **Push origin** 或 **Publish branch**。

---

## 3. 创建 Pull Request（PR）

1. 打开浏览器，进入 **你的** Fork：`https://github.com/Lusmirk/teames`
2. 推送后页面常会提示 **Compare & pull request**，点击即可
3. 或手动：**Pull requests → New pull request**
   - **base repository：** `ouwei2013/teames`，分支 `main`
   - **head repository：** `Lusmirk/teames`，你的功能分支
4. 填写标题和说明，例如：

   **标题：** `docs: add GitHub workflow guide for contributors`

   **说明：**
   - 新增 `docs/github-workflow.md`，方便新同学 Fork、分支、PR
   - 不涉及代码逻辑变更

5. 点击 **Create pull request**，等待维护者 Review

合并后，你的改动会进入主仓库 `ouwei2013/teames`。

---

## 4. 同步主仓库的最新代码

维护者会继续更新主仓库。你的 Fork **不会自动更新**，需要手动同步：

```powershell
cd D:\teames
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

开始新任务前，建议先执行上述步骤，减少冲突。

若你在功能分支上工作，也可在更新 `main` 后：

```powershell
git checkout docs/my-change
git merge main
```

---

## 5. 安全与注意事项

### 不要提交密钥

以下文件**永远不要** `git add` / commit：

- `~/.hermes/.env`（API Key、Token）
- 任何含密码、私钥的文件

Teames 运行时配置在用户目录 `~/.hermes/`，不在仓库里；不要把本机密钥拷进项目目录再提交。

### Download ZIP 与 Git Clone 的区别

| | Download ZIP | `git clone` |
|---|--------------|-------------|
| Git 历史 | 无 | 有 |
| 推送到 GitHub | 不能（需额外 `git init`） | 能 |
| 开 PR | 麻烦 | 标准流程 |

参与协作请使用 **Fork + Clone**。

### 一个 PR 只做一件事

例如：只加一篇文档，或只修一处 README。小步提交便于审查。

---

## 6. 常见问题

**Q: `git clone` 报错 `curl 56` / `Connection was reset`？**

A: 多为网络不稳定。可尝试：`git clone --depth 1`、开 VPN 并为 Git 配置代理、换网络或手机热点、使用 GitHub Desktop。仅添加文档时，也可在 GitHub 网页上直接创建文件并开 PR。

**Q: `git push` 时要登录？**

A: 按提示在浏览器用 GitHub 登录，或使用 [Personal Access Token](https://github.com/settings/tokens)。

**Q: `Repository not found`？**

A: 确认 Fork 已完成，且 Clone 地址是你的用户名（`Lusmirk/teames`），不是维护者的。

**Q: PR 里出现很多无关文件的改动？**

A: 可能改在了错误的目录（例如旧的 `teames-main`）。应在 `git clone` 得到的 `teames` 目录工作，并用 `git status` 检查。

**Q: 和主仓库冲突了？**

A: 先按 [第 4 节](#4-同步主仓库的最新代码) 同步 `upstream/main`，再在你的分支上 `merge main` 或请维护者指导。

---

## 7. 相关链接

- Teames 主仓库：https://github.com/ouwei2013/teames
- Teames README（安装与运行）：仓库根目录 `README.md`
- 上游 Hermes 文档：https://hermes-agent.nousresearch.com/docs/
- GitHub 官方入门：https://docs.github.com/zh/get-started
