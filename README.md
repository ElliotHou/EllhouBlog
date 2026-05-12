# 个人博客

这是一个 GitHub Pages 友好的静态个人博客，用于发布 Markdown 笔记。页面左侧是笔记列表，右侧会自动生成当前笔记的小标题目录。

## 本地预览

```powershell
python -m http.server 4173
```

然后访问 <http://localhost:4173>。

## 添加笔记

1. 把 Markdown 文件放到 `notes/` 目录，例如 `notes/my-note.md`。
2. 编辑 `notes/manifest.json`，新增一条记录：

```json
{
  "title": "我的笔记",
  "file": "my-note.md",
  "date": "2026-05-12",
  "tags": ["学习"],
  "description": "这篇笔记的简短说明。"
}
```

3. 提交并推送到 GitHub。

## GitHub Pages 发布

1. 在 GitHub 创建一个新仓库。
2. 在本目录执行：

```powershell
git init
git add .
git commit -m "Initial personal blog"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

3. 打开 GitHub 仓库的 Settings -> Pages。
4. Build and deployment 选择 GitHub Actions。
5. 推送后等待 `Deploy GitHub Pages` 工作流完成。

发布后，访问地址通常是：

```text
https://你的用户名.github.io/你的仓库名/
```
