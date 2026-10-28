# dsh-session-delete

给 **DeepSeek Harness** 补一个自带的会话操作里没有的动作：**删除**。

归档是藏起来，可以还原；删除是真的抹掉。

![](icon.svg)

## 你得到什么

- **侧边栏每个会话行多一个垃圾桶按钮**，和归档、置顶在同一个悬停按钮条里，位置就在归档和置顶之间（`archive` 100 → `delete` 150 → `pin` 200）。
- **一个确认弹窗**：说清删的是哪条、对话记录会从磁盘移除，`Esc` 取消，不再三确认。删的正好是你当前打开的会话时，弹窗会额外提示，并先关闭主面板。
- **悬停变红**，危险按钮不伪装成普通按钮。

没有设置页，没有配置项，没有多余入口。一个按钮，一个弹窗。

## 安装

### 让 agent 装（推荐）

把这个仓库地址丢进 DeepSeek Harness 的对话里，说一句"装一下这个"。仓库里的 [`AGENTS.md`](AGENTS.md) 就是为这种情况写的：它告诉 agent 具体调哪个 `plugin_manager` 动作、装完怎么验证、哪些破坏性操作不许自己动。

### 自己装

让 agent 执行，或者直接调 `plugin_manager` 工具：

```
action:  install_bundle
target:  github:<owner>/dsh-session-delete
```

装完把鼠标**悬停在任意会话行**上，垃圾桶按钮会出现在归档和置顶之间。一般不需要刷新页面，Web 运行时能热加载新的客户端 bundle。

### 装完怎么确认

两个只读检查，都不需要审批：

```
cordis_inspect_query  platform: client  provider: Slots
  method: listSubTree   input: { "root": "sidebar.workspaces.session.row.action" }
  → 应该看到 { "id": "delete", "order": 150, "active": true }

cordis_inspect_query  platform: client  provider: Slots
  method: listSubTree   input: { "root": "shell.overlay" }
  → 应该看到 { "id": "session-delete", "active": true }
```

## 删除到底做了什么

顺序是刻意设计的：

1. **先从工作区注册表里摘掉**——取消置顶、取消归档、从所有记录过它的工作区里 detach。每一步都会向侧边栏推送一帧，所以那一行会立刻消失。
2. **再删字节**——会话日志目录 `$DSH_HOME/sessions/<工作区代号>/<会话 id>/` 和它的投影缓存 `$DSH_HOME/storages/session_projcache/sessions/<会话 id>.json`。
3. **再通知已打开的页面**——发出 `api-session/removed` 这条路由事件（和宿主 dispose 会话时用的是同一条），避免页面里留下一条"未分组"的僵尸行。
4. **最后回答调用方**——失败会在弹窗里显示原因，而不是静默消失；注册表步骤和文件步骤分别汇报。

## 环境要求

| | |
|---|---|
| Harness | 带 Web GUI 的 DeepSeek Harness（`dsh-web-app` + `dsh-host-webserver` 在运行） |
| Profile | 任意 profile，装到跑 GUI 的那个 profile 里 |
| 平台 | macOS / Windows / Linux，宿主端是纯 Node，无原生模块 |
| 已验证 | DSH desktop `0.2.1-rc.3`，profile `desktop` |

## 安全边界

整个功能只有一条宿主路由 `POST /plugin/session-delete`：

- **只认本机**——对端地址不在 `127.0.0.1`、`::1`、`::ffff:127.0.0.1` 就返回 `403`；
- **只认 POST**——其他方法 `405`；
- **只认同源**——带了 `Origin` 就必须和请求的 `Host` 一致；
- **有大小上限**——请求体超过 4 KiB 直接拒；
- **只管一条**——只接受一个格式合法的会话 id，做不了别的事；
- **不泄露存在性**——它不列举会话，删一个不存在的 id 也返回 `200`。

无遥测、无外部网络请求、不读凭据、不碰 `$DSH_HOME` 以外的文件。

## 已知边界

- **不可恢复**。没有回收站，没有撤销。可能还要找回来的会话，请用归档。
- 正在打开的会话会先被关闭再删文件，那段对话不会保留在任何地方。
- 全文搜索索引（`session-query-sqlite`）是别的插件拥有的派生读模型，本插件不碰它。所以删除前做过的搜索，可能在索引重建前仍能命中被删会话的文字。
- `$DSH_HOME/attachments` 下是按引用寻址的不可变共享存储，本插件不动它，以免影响引用同一附件的其它会话。
- 删掉某个工作区最后一个会话后，`$DSH_HOME/sessions/` 下那个工作区目录会保留。它由持久化层按路径推导并负责，本插件不代为删除。
- 依赖 `session-persistence-jsonl` 与 `session-projection-cache` 的默认布局（`$DSH_HOME` 或 `<home>/.dsh`）。

## 卸载

```
action:  remove_bundle
target:  dsh-session-delete
```

装上的行和浏览器端一起消失；已经删掉的会话不会回来。

## 实现结构

```
lib/index.js      宿主行：删除路由、注册表记账、文件移除
lib/client.js     浏览器端：行内按钮 + 确认弹窗
cordis.patch.yml  插入宿主行的 bundle patch
locale/{en,zh}.json  插件管理里的标题与描述
icon.svg          图标
```

- 宿主行声明 `inject: ["webServer"]`，工作区注册表通过 `ctx.get("workspaceRegistry")` 取用；在没有工作区的组合里退化成"只删文件"，不会抛错。
- 浏览器端注册 `sidebar.workspaces.session.row.action` 和一条 `shell.overlay`。样式全部内联且只吃主题 token（`--dsw-alias-*`），所以跟随主题和明暗切换，自己不带样式表。
- 只依赖基线模块 `react`，不 import 其它 Harness 客户端包；这样组件库重构不会让按钮变空白。

## 许可

MIT，见 [LICENSE](LICENSE)。
