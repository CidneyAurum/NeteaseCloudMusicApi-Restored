# NeteaseCloudMusicApi Restored

[English](README.en.md) · [接口快速开始](docs/API-QUICKSTART.md) · [来源与署名](NOTICE.md)

这是 **Binaryify 的 NeteaseCloudMusicApi npm 4.32.0 发布源码恢复版**，不是原作者发布的新版本，也不是从零编写的音乐 API。项目保留该发布包中的接口模块，并整理启动入口、依赖和离线测试，使这份源码能够继续审阅、运行和维护。

仓库：<https://github.com/CidneyAurum/NeteaseCloudMusicApi-Restored>。

原 GitHub 仓库目前已归档，其 README 指向 GitLab；npm 上仍有 4.32.0 发布包。本项目的来源是该 npm 包，不包含原仓库完整 Git 历史或未随包发布的文件。来源元数据、原始说明和文件校验清单保存在 [provenance/](provenance/)，具体说明见 [NOTICE.md](NOTICE.md)。

## 本恢复版做了什么

- 保留上游发布包中的接口模块和原 MIT 许可、署名。
- 默认只监听 `127.0.0.1:3000`，启动不依赖联网版本检查，也不等待匿名账号注册。
- 匿名令牌缓存缺失时创建空缓存，保留已有缓存内容。
- 更新 Node.js 运行依赖，修正 POST 请求参数和账号会话之间的缓存隔离。
- 默认关闭跨源访问和代理信任，限制请求体与上传大小，访问日志只记录方法、路径和状态。
- 提供离线测试；它们验证本地实现，不代表每个网易云线上接口都已逐一验证。

本项目不属于网易云官方服务，也不提供会员、付费歌曲或 DRM 绕过能力。接口是否可用仍受网易云协议、账号权限、地区和服务状态影响。

## 启动

需要 **Node.js 22 或更新版本**及 npm。在项目目录执行：

```sh
npm ci
npm start
```

服务默认地址为 `http://127.0.0.1:3000`。检查本机服务：

```sh
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/inner/version
```

Windows PowerShell 中请使用 `curl.exe`，以免调用同名别名。

改变端口时可设置进程环境变量：

```sh
HOST=127.0.0.1 PORT=3001 npm start
```

PowerShell 写法：

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
npm start
```

[.env.example](.env.example) 列出可用设置。需要使用 `.env` 文件时，可复制模板后运行 `node --env-file=.env app.js`；普通 `npm start` 读取进程环境变量，不承诺自动加载 `.env`。

## 搜索歌曲与“声音”

歌曲搜索：

```sh
curl --get --data-urlencode 'keywords=Mili Hero' --data 'type=1' --data 'limit=5' http://127.0.0.1:3000/search
```

“声音”栏目包含用户上传的音频与播客节目，搜索类型为 `2000`：

```sh
curl --get --data-urlencode 'keywords=世界上最小的大果' --data 'type=2000' --data 'limit=5' http://127.0.0.1:3000/search
```

歌曲 ID、声音节目 ID 和节目中的 `mainSong.id` 代表不同资源，不能互换。请检查标题、歌手或上传者、版本与时长，不要直接把第一条结果当成用户要找的内容。返回结构和节目详情示例见 [接口快速开始](docs/API-QUICKSTART.md)。

## 配置与本机使用

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `3000` | 监听端口 |
| `CORS_ALLOWED_ORIGINS` | 空 | 允许的浏览器来源，以逗号分隔；空值不允许跨源访问 |
| `TRUST_PROXY` | `false` | 只有显式设为 `true` 时才信任代理 |

JSON 请求体上限为 1 MiB，上传上限为 10 MiB；初版不通过环境变量调整这两个限额。

公开搜索示例不需要把登录 Cookie 写入仓库。需要登录态的接口应使用你有权使用的账号，并在本机单次请求或调用程序中提供 Cookie；不要把 Cookie、二维码登录结果、令牌或带签名的媒体地址提交到 Git。若需要给其他机器使用，应先完成访问控制和部署配置。

## 测试

```sh
npm test
npm run verify:source
```

`npm run verify:source` 会核对全部 425 个发布文件，列出恢复版修改的文件，并确认原许可与
来源记录完整保留。`npm run smoke:public` 另行执行真实歌曲／声音元数据搜索，不读取本机
Cookie，也不下载音频；它会访问网易云，不属于默认离线测试。

默认测试不依赖真实网易云账号或线上网络。真实服务的协议变化和账号权限问题，需要另行用明确授权的本机请求检查。

## 来源与许可

基础版本：`NeteaseCloudMusicApi@4.32.0`，原作者 **Binaryify**。npm 发布元数据中的 `gitHead` 为 `4d63e5562199115915f2ee855460ef8999873b53`；这不是本恢复版的 Git 提交号。

本仓库保留 [MIT LICENSE](LICENSE) 原文。请在再分发时保留原版权声明和许可；恢复版的来源、完整性摘要和边界说明见 [NOTICE.md](NOTICE.md)。
