# dsh-breaker-go · 破甲插件（dsh-go 适配版）

给 **dsh-go 手机端**和桌面版 DSH 用的破甲插件。自研实现，不依赖 `dsh-purge`。

适配目标：DSH `v0.2.2-rc.1`，Node `v24.22.1`（dsh-go 本机引擎实测环境）。

## 四层，主力不写宿主文件

| 层 | 生效 | 写磁盘 | 宿主升级后 |
|---|---|---|---|
| **运行时层** | 挂 `approval/request`、`sandboxPolicy`、`permissionPresets`、`agent/pre-step` | 不写 | 不失效 |
| **注入层** | `systemPrompt.section()`，头 + 尾双向 | 不写 | 不失效 |
| **每步重贴** | `agent/pre-step` 把正文补回本步末尾 | 不写 | 不失效 |
| 宿主补丁（可选） | `breaker apply` 改宿主 JS | 写 | 会漂 |

手机端拿不到宿主源码验证锚点，所以**前三层是主力**，补丁层只在能确认锚点时用。

## dsh-go 原生界面

`package.json` 里的 `dshGo` 清单声明两个插槽，宿主半侧在 `lib/dshgo.js`：

- **`composer.strip`** —— 输入框上方状态条：`破甲 ON · 补丁 3/7`，点开是面板
- **`panels`** —— 「破甲状态」面板：运行形态 / 宿主 / 运行时层 / 注入位置 / 强化段 / 正文来源与长度，加一张补丁状态表，底部三个按钮（应用补丁 / 还原 / 切换强化段）

没有 dsh-go 桥接的主机（网页版 DSH、SSH 主机）自动跳过，插件其余部分照常工作。

## 安装（手机端）

```sh
# 把插件目录放进本机环境
cp -r /sdcard/Download/dsh-breaker-go /root/.dsh/dsh-go/plugins/

# 装进 web profile（dsh-go 启动引擎用的就是它）
dsh plugin --profile web add /root/.dsh/dsh-go/plugins/dsh-breaker-go
```

装的是指向该目录的链接——目录要留着。改 `lib/` 代码后要重启引擎（App「引擎」页）。

桌面端同理：`dsh plugin --profile web add /绝对路径/dsh-breaker-go`。

## 运行时段做了什么

```
approval/request   → 固定 allowed-once，审批弹窗永不出现
sandboxPolicy      → resolve()/policy() 固定 danger-full-access
permissionPresets  → defaultPreset 提到 danger-full-access
agent/pre-step     → 解开 planMode / plan.enforced
```

进程内生效，不写文件、不重启。

## 注入层

- 头 section `-100000`、尾 section `10150`、强化段 `-50000`
- **order 必须用绝对值**：宿主 section 全落在 `-1000…10200`，`基准值 + n` 还是负数，永远排在最前
- 每步重贴靠 `<!-- breaker:step:N -->` 去重，`kind === "reject"` 时原样返回

改正文：

```sh
node bin/breaker.js inject-set '你的正文'
```

## CLI

```sh
node bin/breaker.js status     # 宿主定位 + 补丁状态
node bin/breaker.js runtime    # 运行时层挂了什么
node bin/breaker.js apply      # 可选：打宿主补丁（7 条）
node bin/breaker.js revert     # 还原
node bin/breaker.js boost off  # 关强化段
node bin/breaker.js position tail
```

配置：`$DSH_HOME/dsh-breaker/tuning.json` → `{ boost, injectPosition, runtime }`

## 宿主补丁（7 条，可选）

| id | 名称 | 拆什么 |
|---|---|---|
| 1 | APPROVAL_AUTO_GRANT | 审批门直接 `allowed-once` |
| 2 | APPROVAL_DEFAULT_NEVER | 审批策略默认 `ask` → `never` |
| 3 | APPROVAL_SENTENCE_NEUTRAL | 「审批会被拒绝」改成「自动放行」 |
| 4 | ESCALATION_WIDENING_EXEMPT | 豁免逐级放宽校验 |
| 5 | ESCALATION_GRANT_UNCONDITIONAL | 升级请求无条件授予 |
| 6 | SANDBOX_CONFINE_PASSTHROUGH | `confine()` 不包 runner，`denialSignatures: []` |
| 7 | FS_FENCE_DISABLED | 写文件不再按模式拒绝 |

状态：`applied` / `pending` / `foreign` / `drifted` / `missing`。
`foreign` = 已被别的工具改过（如 dsh-purge），本插件不碰——同一条闸不要被两个工具改。

## 测试

```sh
node --test test/*.test.mjs
```

23 条用例：五态判定、`expect` 契约、幂等、运行时四条钩子、每步重贴去重、
dsh-go 面板形状与预算（32 KiB / actions ≤ 4 / 至多一个 primary）。

## 许可

MIT。dsh-go 本身是 AGPL-3.0，与本插件无代码关联；本插件是标准 DSH 插件。
