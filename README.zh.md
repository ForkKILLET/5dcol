# 5DC OL

[English](./README.md) | [中文](./README.zh.md)

5DC OL 是由粉丝制作的开源在线网页版
[《5D Chess With Multiverse Time Travel》](https://store.steampowered.com/app/1349230/5D_Chess_With_Multiverse_Time_Travel/)。

项目目标是在浏览器中提供更易访问、游玩、查看、修改和扩展的 5D
Chess，同时尽量贴近原游戏的界面和手感。原作作者为 Conor Petersen /
Thunkspace。

在线站点：<https://icelava.top/5dcol/>

## 当前状态

5DC OL 目前支持本地对局、在线房间、5dpgn 导入/导出、观战和回放。项目仍在活跃开发中，规则、网络和 UI 细节会继续打磨。

## 功能

- 在浏览器中游玩 5D Chess，界面和手感尽量接近原游戏。
- 本地对局和在线房间。
- 公开房间、私密分享链接房间、未结束在线对局重连、玩家在线状态。
- 支持允许观战/回放的房间。
- 实时查看对手未提交小步、激活棋盘落子范围预览、放弃对局和棋钟。
- 实时 5dpgn 记谱面板，支持游标导航、导入/导出、回溯、分支，以及从历史位置推演。
- 支持包含分支的树形记谱导出，也支持到当前游标为止的线性导出。
- 面向阅读的 5dpgn 显示选项，包括棋子符号、穿越符号、吃子符号、将军/将杀符号和升变符号。
- 英文和中文界面。
- 音效、设置持久化、触屏友好控制和主菜单动画。

## 包结构

- `@5dcol/core`：游戏状态模型、规则、走法生成、受将检测、将杀检测和 5dpgn 导入/导出工具。
- `@5dcol/frontend`：Vue/Vite 浏览器前端、DOM UI、Canvas/WebGL 渲染、i18n、音效、本地持久化、记谱树 UI 和匹配房间 UI。
- `@5dcol/shared`：前后端共享的协议类型和 Zod 运行时 schema。
- `@5dcol/backend`：在线对局后端，负责房间状态更新、CORS、权威回合提交、用户/会话恢复，以及 Drizzle + SQLite 持久化。

## 开发

安装依赖：

```bash
pnpm install
```

按需运行各包的开发任务：

```bash
pnpm -F @5dcol/core dev
pnpm -F @5dcol/shared dev
pnpm -F @5dcol/backend dev
pnpm -F @5dcol/frontend dev
```

后端调试服务器默认监听 `localhost:5161`。可用以下环境变量配置：

- `PORT`：后端端口。
- `HOST`：后端 host。
- `NAME`：展示给客户端的服务器名称。
- `MATCH_DATABASE_FILE`：SQLite 数据库路径。
- `MATCH_LEGACY_DATA_FILE`：可选的旧 JSON 房间数据路径，用于迁移。

常用定向检查：

```bash
pnpm -F @5dcol/core exec tsc -p tsconfig.json --noEmit
pnpm -F @5dcol/shared exec tsc -p tsconfig.json --noEmit
pnpm -F @5dcol/backend exec tsc -p tsconfig.json --noEmit
pnpm -F @5dcol/frontend exec vue-tsc --noEmit
```

## 后端部署

先构建后端：

```bash
pnpm install
pnpm -F @5dcol/backend build
```

### PM2

```bash
HOST=0.0.0.0 pm2 start ./packages/backend/dist/main.js --name 5dcol-backend --update-env
```

常用环境变量：

- `PORT=5161`
- `HOST=0.0.0.0`
- `NAME="5DC OL Server"`
- `MATCH_DATABASE_FILE=/path/to/rooms.sqlite`

### Docker

```bash
docker build \
  --build-arg GIT_COMMIT="$(git rev-parse --short=12 HEAD)" \
  --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -f docker/Dockerfile \
  -t 5dcol-backend \
  .
docker run -d \
  --name 5dcol-backend \
  -p 5161:5161 \
  -e HOST=0.0.0.0 \
  -e PORT=5161 \
  -v 5dcol-backend-data:/app/packages/backend/data \
  5dcol-backend
```

### Docker Compose

```bash
GIT_COMMIT="$(git rev-parse --short=12 HEAD)" \
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  docker compose -f docker/docker-compose.yml up -d --build
```

如果你的反向代理或部署环境需要额外的端口、卷或网络，请按需修改 compose 文件。

## 致谢

超立方体将杀算法参考了
[ftxi/5dchess_engine](https://github.com/ftxi/5dchess_engine)
中的实现与思路。

5DC OL 是非官方粉丝项目，与 Thunkspace 或原 5D Chess 团队没有从属关系。

## 许可证

[MIT](./LICENSE)
