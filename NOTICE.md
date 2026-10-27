# 来源、署名与恢复范围 / Attribution and provenance

本项目恢复并维护 Binaryify 发布的 **NeteaseCloudMusicApi 4.32.0 npm 包中的源码**。恢复版维护者不是原作者，不代表 Binaryify，也不代表网易云音乐。已有接口实现、资源和原有说明应归于原项目及其贡献者，不能因仓库重新发布而视为恢复版维护者的原创。

This project restores and maintains source distributed in **Binaryify's NeteaseCloudMusicApi 4.32.0 npm package**. The restoration maintainers are not the original authors and do not represent Binaryify or NetEase. Republishing the package does not make its existing implementation or assets the original work of these maintainers.

## 原始发布 / Upstream release

| 字段 / Field | 内容 / Value |
| --- | --- |
| npm package | `NeteaseCloudMusicApi` |
| Baseline version | `4.32.0` |
| Author in release metadata | `binaryify` |
| License | `MIT` |
| Original copyright | `Copyright (c) 2013-2022 Binaryify` |
| npm metadata `gitHead` | `4d63e5562199115915f2ee855460ef8999873b53` |
| Original published file count | `425` |
| Tarball SHA-256 | `4a1a01856703b33292208e51bef8ca780477edd29e7542a29965a248dd95ca4d` |

原 npm tarball 的发布完整性值 / Published integrity value:

```text
sha512-yRDwpMcLZnOSkmR/flEpGEJpufNxOQVILb2+2mnSrKPZp/3PbIo2uIOuTa3SjGaAtK3dUKJdQBTkOn0POKDa+A==
```

来源链接 / Source links:

- [npm 4.32.0 发布元数据 / Release metadata](https://registry.npmjs.org/NeteaseCloudMusicApi/4.32.0)
- [npm 4.32.0 tarball](https://registry.npmjs.org/NeteaseCloudMusicApi/-/NeteaseCloudMusicApi-4.32.0.tgz)
- [原 GitHub 仓库 / Original GitHub repository](https://github.com/Binaryify/NeteaseCloudMusicApi)
- [上游 README 指向的 GitLab 地址 / GitLab address referenced by the upstream README](https://gitlab.com/Binaryify/NeteaseCloudMusicApi)

## 本地证据 / Included records

- [provenance/npm-release.json](provenance/npm-release.json)：本次基线的发布元数据、摘要和获取记录。
- [provenance/upstream-package.json](provenance/upstream-package.json)：上游包的原始 manifest。
- [provenance/upstream-sha256.json](provenance/upstream-sha256.json)：原发布包逐文件 SHA-256 清单。
- [provenance/UPSTREAM_README.md](provenance/UPSTREAM_README.md)：上游发布说明原文，作为来源记录保留。
- [LICENSE](LICENSE)：保留原 MIT 许可和版权声明。

这些原始文件摘要描述的是 **npm 基线**，不是经过修复后的工作树摘要。原 README 中的部署说明、旧依赖和第三方服务链接可能已经过时；本恢复版的运行方法以根目录 README 为准。

The original file hashes describe the **npm baseline**, not the modified working tree. The preserved upstream README is a provenance record and may contain outdated dependencies, deployment instructions or external links. Use the root README for this restoration's startup instructions.

## 恢复范围与修改 / Scope and modifications

本项目不声称恢复了原 Git 仓库的完整历史、全部开发资料或未发布文件。`gitHead` 是 npm 元数据给出的上游标识，不表示已经取得或验证该提交的完整 Git 对象。

恢复版在已发布源码上整理启动入口、更新依赖、修正本地请求缓存隔离，并增加默认回环监听、请求大小限制、日志约束和离线测试。具体实现可以在当前代码和本仓库后续提交中审阅。保留接口模块不等于担保所有网易云线上接口持续可用。

This restoration does not claim to reconstruct the original repository's full history, unpublished files or development material. The npm `gitHead` identifies upstream metadata; it is not proof that the full corresponding Git object was recovered. Restoration changes cover startup, dependencies, local cache isolation, local defaults, size limits, logging and offline tests. Retaining endpoint modules is not a guarantee of continued upstream availability.

## 再分发 / Redistribution

原代码继续按 [MIT LICENSE](LICENSE) 使用和再分发。请保留原版权与许可，不删除 Binaryify 及原贡献者的署名，也不要将本项目描述成原作者的新官方版本。依赖包仍分别适用各自的许可。

The original code remains available under the retained MIT license. Preserve its copyright and license notice, keep upstream attribution, and do not present this project as an official new release by the original author. Dependencies remain subject to their respective licenses.
