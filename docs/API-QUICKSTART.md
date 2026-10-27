# 接口快速开始

本文只演示公开元数据查询：单曲搜索、声音搜索和节目详情。先按 [README](../README.md) 启动服务。示例地址为 `http://127.0.0.1:3000`；使用自定义端口时请一并替换。

以下使用系统 `curl`。Windows PowerShell 请写成 `curl.exe`。

## 1. 确认本机服务

```sh
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/inner/version
```

健康检查不代表已经验证登录状态或所有网易云线上接口。`/inner/version` 只读取当前服务的软件版本。

## 2. 搜索单曲

```sh
curl --get --data-urlencode 'keywords=Mili Hero' --data 'type=1' --data 'limit=5' http://127.0.0.1:3000/search
```

参数 `type=1` 表示单曲，`limit` 控制候选数量。通常从 `result.songs` 读取结果；每条检查：

- `id`：歌曲 ID。
- `name`：标题。
- `artists` 或 `ar` 中的 `name`：歌手。
- `alias`、`alia` 等别名：可能包含版本信息。

返回字段取决于上游当前响应，不应假设首条结果就是目标歌曲。相同歌名可能对应不同歌手、翻唱、现场或混音版本。

## 3. 搜索“声音”或播客节目

```sh
curl --get --data-urlencode 'keywords=世界上最小的大果' --data 'type=2000' --data 'limit=5' http://127.0.0.1:3000/search
```

`type=2000` 查询声音栏目，不要求内容出现在单曲搜索中。本基线通常返回 `data.resources`；其中 `resourceType` 为 `voice` 的条目，其 `baseInfo` 包含节目元数据。

| 字段 | 含义 |
| --- | --- |
| `resourceId` 或 `baseInfo.id` | 声音节目 ID |
| `baseInfo.name` | 上传内容标题 |
| `baseInfo.dj.nickname` | 上传者昵称 |
| `baseInfo.radio.name` | 所属播客或电台 |
| `baseInfo.duration` | 时长，通常以毫秒计 |
| `baseInfo.mainSong.id` | 节目关联音频 ID；搜索结果可能未提供，需查详情 |

上传者不等于原唱，标题也可能包含剪辑、配音或混音信息。请保留这些区别供用户选择。

## 4. 查询已选声音的节目详情

把上一步真实返回的节目 ID 填入 `id`：

```sh
curl --get --data 'id=PROGRAM_ID_FROM_SEARCH' http://127.0.0.1:3000/dj/program/detail
```

`PROGRAM_ID_FROM_SEARCH` 是占位符，运行前须替换为十进制节目 ID。详情通常位于 `program`：

```text
program.id            节目 ID
program.name          节目标题
program.duration      时长（毫秒）
program.mainSong.id   节目关联音频 ID
```

声音节目 ID 应传给 `/dj/program/detail`；不要把它直接作为单曲 ID 使用。先确认实际返回的标题、上传者和时长，再由调用程序按账号具有的权限处理后续操作。本文不提供付费权限或 DRM 绕过方案。

## 5. 用 Node.js 读取元数据

Node.js 22 可直接使用 `fetch`，不需要额外 HTTP 客户端：

```js
const url = new URL('http://127.0.0.1:3000/search')
url.search = new URLSearchParams({
  keywords: 'Mili Hero',
  type: '1',
  limit: '5',
}).toString()

const response = await fetch(url)
if (!response.ok) throw new Error(`Local API HTTP ${response.status}`)
const result = await response.json()
if (result.code !== 200) throw new Error('Upstream search did not succeed')
console.log(result.result?.songs ?? [])
```

这段代码使用顶层 `await`，可保存为 `.mjs` 文件运行。查询声音时将 `type` 改为 `'2000'`，并从 `data.resources` 解析结果。

## 常见问题

**连接被拒绝或超时**：先确认 `npm start` 进程仍在、`HOST` 和 `PORT` 与请求地址一致，再检查 `/healthz`。启动时不会等待联网版本检查；启动成功与网易云上游网络可达是两件事。

**歌曲搜索没有内容，但声音栏目能找到**：使用 `type=2000`，展示声音候选，不要假设它和同名歌曲是同一资源。

**浏览器请求被跨源策略拦截**：服务默认不开放跨源访问。需要本机前端时，显式设置 `CORS_ALLOWED_ORIGINS` 为实际前端来源；不要把 Cookie 放进公开前端代码。

**接口提示需要登录或没有权限**：使用你有权使用的账号在本机提供合法登录态，或停止该操作。Cookie、登录结果和带签名的地址都不应写进提交、示例文件或公开日志。

更多原有接口模块保留在 `module/`。来源说明见 [NOTICE](../NOTICE.md)，原发布说明存档见 [provenance/UPSTREAM_README.md](../provenance/UPSTREAM_README.md)。原说明中的外链与旧部署方式不构成本恢复版的可用性承诺。
