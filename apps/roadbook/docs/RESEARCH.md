# 旅游路书模块升级：竞品与平台能力调研报告

- 调研日期：2026-11-20
- 时间范围：2025 年下半年 – 2026 年 11 月（iOS 26 已普及，iOS 27 于 2026 年 9 月发布，iOS 27.2 已推送，iOS 27.3 在测试中）
- 读者：路书模块的产品设计者（iPhone App，用户场景以日本/大阪为主）

> **方法与可信度说明**
> 1. 本报告主要靠网络检索写成。抓取 blog.google、9to5mac.com 等原文页面时，被当前环境的网络策略拦截，所以这部分事实来自搜索引擎对原文的摘要。每条都附了原文 URL，可以点开复核。
> 2. 找不到可靠来源的内容标「**未核实**」。来源之间互相矛盾的，两种说法并列写出（标「**来源冲突**」）。
> 3. 只写有来源的功能，不推测产品功能。属于"我方推断"的地方会明确标出。
> 4. 中文正文里，日文名称第一次出现时括注日文原文；英文术语第一次出现时括注英文原文。

---

## 一、结论摘要（5 条）

1. **"聊天→结构化行程"已经是标配，拉开差距的是"定稿时的真实性校验"。** Google 问地图（Ask Maps）在 2026-11-16 上线行程规划：生成带编号图钉的逐日行程，出发时显示实时路况、店铺是否营业。NAVITIME Travel 在 2026-09-15 推出 AI 对话导入（AI会話インポート）：把 ChatGPT、Gemini、Claude 的聊天文本解析成地点，和自家地点库比对后显示真实营业时间，再按时刻表排出公交版和自驾版的 1 日行程。我方路书的"定稿"一步，必须做三件事：把地点落到实体 ID（Place ID）、检查营业时间冲突、检查交通是否走得通。
2. **"灵感导入"是 2025–2026 年各家竞争的焦点。** 截图、链接、视频、聊天记录、邮件都能变成候选地点。例子有 Mindtrip 的随处开始（Start Anywhere）、Google 地图的截图存地点、Tripsy 的智能导入（Smart Import，2026-09）、Polarsteps 的邮件转发、NAVITIME 的 AI 对话导入、马蜂窝的截图订餐厅、第三方工具"路敢敢"从小红书笔记提取景点。
3. **行中"此刻情境"做得最好的是地图类产品，路书类产品普遍缺位。** Google 的 Gemini 导航支持沿途问答和地标指路；高德的"导航 Live"（2026-09）可以在导航中口头改计划、用镜头识别周边并讲解，另有"避雷指南"；NAVITIME 能在锁屏显示所乘列车的停靠站。路书/行程类产品里，没找到 TripIt、Tripsy 支持实时活动（Live Activities）的证据，App Store 上还有 TripIt 用户在要这个功能。这是**明显的空白机会**。
4. **2026 年 iPhone 的平台能力明显变强。** iOS 26 的实时活动可以定时启动，并显示在 CarPlay、Mac 菜单栏和 Apple Watch 上；新增闹钟框架（AlarmKit）；App 意图（App Intents）支持交互式片段，也能接入视觉智能（Visual Intelligence）。iOS 27 的 Siri AI 能通过 App Intents 读取 App 内的内容，日语自 iOS 27.2 起可用，**简体中文暂未列入**。端侧模型框架（Foundation Models）的上下文窗口只有 4096 token（中日文约 1 字 1 token）。WWDC26 新增了私有云计算（PCC）服务器模型：32K 上下文，小开发者免费使用。
5. **日本公共交通路线是最大的技术风险。** MapKit 的公交（transit）路线请求有开发者报告不可用。Google Routes API 在日本的公交覆盖**未能核实**，另有开发者报告旧版 Directions API 在日本查公交返回 ZERO_RESULTS。稳妥做法有两条：跳转 Apple 地图、Google 地图或 NAVITIME 去导航；或者接入日本本地的付费 API，如 NAVITIME API、Ekispert（駅すぱあと）API、Jorudan（ジョルダン）乗換案内Biz。

---

## 二、国际产品逐个分析

### 2.1 Wanderlog

**定位：** 多人协作的"行程 + 地图"工作台，AI 只是附加功能。

**标志性功能：**
- **AI 助手：** 聊天中提到的地点会在地图上高亮，一键就能加入清单或逐日行程。这个功能 2023-05 以 beta 形式在 Product Hunt 发布，当时只有 Web 端，开发者称移动端在开发中。[来源](https://www.producthunt.com/p/wanderlog/wanderlog-ai-travel-assistant)
- **路线优化器（route optimizer）：** 自动重排地点顺序，节省路上时间。有用户反馈重排结果不合逻辑。[来源](https://apps.apple.com/us/app/wanderlog/id1476732439)
- **预订导入：** 转发确认邮件，或连接 Gmail 自动导入。Gmail 连接是否属于 Pro 功能，**来源冲突**：一处商店页写"Pro 可连接 Gmail"，开发者又称"核心功能已免费"。[来源](https://apps.apple.com/app/id1476732439)
- **自动离线保存、实时多人协作。** [来源](https://apps.apple.com/us/app/wanderlog/id1476732439)

**UX 模式：** 每加一个地点，就立刻钉到基于 Google 地图的行程地图上，"列表 + 地图"双视图同步。

### 2.2 TripIt

**定位：** 以预订凭证为核心的"自动行程整理器"。

**标志性功能：**
- **2026-04，Apple Intelligence 自动化：** TripIt Pro 可以把截图、PDF、票据照片转成行程项。商店说明称，它用新的端侧模型把"未归档项目"转成行程，需要设备开启 Apple Intelligence。[来源](https://www.tripit.com/web/blog/news-culture/automate-travel-plans-tripit-pro-apple-intelligence)、[App Store](https://apps.apple.com/us/app/-/id311035142)
- **出发提醒（Go Now）：** 航班前 24 小时，根据当前位置、航班状态、路况和用户偏好的到达时间，给出建议出发时间，出发前 10 分钟推送提醒。[来源](https://help.tripit.com/en/support/solutions/articles/103000063349-go-now)
- **交通选项（Navigator）：** 在航班、酒店、租车的详情页里，列出从 A 到 B 的交通方式。[来源](https://www.tripit.com/web/blog/news-culture/announcing-go-now-more-new-tripit-features)
- **风险提醒（Risk Alerts）：** 航司或机场发生可能影响行程的事件时提醒（2025-10 博客提到）；另有安检排队时间，2018 年推出，覆盖机场有限。[来源](https://www.tripit.com/web/blog/travel-tips/navigating-holiday-travel-2025)、[来源](https://www.tripit.com/web/blog/news-culture/security-wait-times)
- **小组件：** 2023 年推出交互式小组件。**实时活动：** App Store 上有用户评论要求支持，没找到官方支持的证据（现状**未核实**）。[来源](https://tripit.com/web/blog/news-culture/tripit-widgets-ios)

**UX 模式：** "零输入"：后台自动整理，只在关键时刻推送提醒。

### 2.3 Mindtrip

**定位：** 对话式 AI、交互地图、逐日行程、收藏集一体的规划工作台。[来源](https://www.analyticsinsight.net/artificial-intelligence/best-ai-travel-planners-in-2026-features-prices-and-what-they-offer)

**标志性功能：**
- **随处开始（Start Anywhere，2024-07）：** 从一张照片、截图、博客链接、YouTube 视频（读字幕）、TikTok 链接或 Google 地图列表开始规划。上传订单截图或转发确认邮件，可以按日期和地点自动生成行程。[TechCrunch](https://techcrunch.com/2024/07/31/travel-startup-mindtrips-new-feature-lets-you-build-an-itinerary-from-a-screenshot-youtube-or-tiktok-video)、[Axios](https://www.axios.com/2024/07/31/ai-trip-planner-travel-itinerary-mindtrip)、[PR](https://prnewswire.com/news-releases/mindtrip-launches-start-anywhere-a-powerful-new-way-to-build-travel-itineraries-from-any-point-of-inspiration-302210025.html)
- **群聊（Group Chat，2024-09）：** 同行者在行程内群聊，@Mindtrip 让它给出照顾所有人口味的建议，再把每个人的偏好合并成一个行程。[来源](https://globetrender.com/?p=71548)、[官网](https://mindtrip.ai/)
- **移动 App 定位为"行中伴侣"（on-trip companion）。** [来源](https://www.phocuswire.com/mindtrip-launches-mobile-app-ai-trip-planner)
- **代理式机票预订：** 据二手来源，2026-05-06 与 Sabre、PayPal 合作推出代理式（agentic）机票预订。（只有二手来源）[来源](https://felloai.com/cs/best-travel-apps/)
- **局限：** 有实测者反映，它同时满足多个条件（如"靠近公交且约 $400/晚"）的能力弱。（具体出处页**未核实**）

**UX 模式：** 输入不限形式；"聊天 → 收藏 → 行程"三段式。

### 2.4 Layla

**标志性功能：**
- 输入目的地、日期、预算、兴趣，生成逐日行程，含机票、住宿、租车和活动。[来源](https://apps.apple.com/app/id6447275100)
- 结果按"行程 / 路线 / 交通 / 住宿 / 活动"分标签页展示。[来源](https://screensdesign.com/showcase/layla-ai-trip-planner)
- 可以替换活动、换酒店、调路线；可分享 PDF；不注册也能查看。[来源](https://www.pilotplans.com/compare/layla-ai-alternative-feature-comparison)
- **来源冲突：** 能否直接预订，官方商店页称包含预订，竞品对比页称"只出草稿，需另行预订"。
- "下雨时主动推荐室内替代方案"只见于弱来源，**未核实**。
- 价格：App Store 显示 $9.99/月、$49.99/年。

### 2.5 Stippl

**标志性功能：**
- 描述一下旅行风格，AI 几秒内生成完整行程，以及每个目的地的逐日计划。[来源](https://apps.stippl.io/ai-travel-planner)、[博客](https://go.stippl.io/blog/unlock-effortless-travel-planning-with-stippl-s-travel-ai-features)
- 生成后进入可视化规划器继续编辑，可加预订、协作者、笔记。
- 周边工具：预算、打包清单、住宿预订（Nuitee）、eSIM、旅行轨迹、旅行短片（Travel Reel）、相册书、离线、团体规划。（第三方汇总）[来源](https://freedom251.com/apps/stippl/)
- **来源冲突：** AI 是否免费，官方称"完全免费"；第三方称首个行程免费、无限生成和路线优化要 Pro；竞品称 AI 和离线都在 Pro（约 $25/年）。[竞品对比](https://www.pilotplans.com/compare/stippl-alternative-feature-comparison)

### 2.6 Polarsteps

**定位：** "计划 → 自动记录轨迹 → 行后故事"闭环。

**标志性功能：**
- **2025 年：** 在地图上直接生成多目的地 AI 行程；把住宿确认邮件转发到 plan@polarsteps.app，会自动进入行程；新增旅行短片（Trip Reel）。[来源](https://news.polarsteps.com/releases/planning-update-2025)、[来源](https://www.polarsteps.com/news/polarsteps-summer-2025-release-is-here)
- **2026 夏季版：** 搜索航班并加入行程；Web 端规划；探索中发现的地点可直接加入计划。[来源](https://www.polarsteps.com/news/polarsteps-launches-summer-2026-release-new-tools-for-planning-privacy-and-sharing)
- **旅行轨迹：** 后台用"面包屑"方式记录，不实时同步；离线也能记录；全天后台记录约耗电 4%；iOS 上不主动开 GPS，依赖系统分发的位置更新。[来源](https://support.polarsteps.com/article/80-how-does-the-travel-tracker-work-does-it-use-gps)、[耗电](https://support.polarsteps.com/article/81-will-my-battery-survive-the-day)、[离线](https://support.polarsteps.com/article/115-does-polarsteps-work-offline)
- **付费层 Polarsteps Plus。** [来源](https://www.polarsteps.com/stories/introducing-polarsteps-plus)

### 2.7 Roadtrippers

**标志性功能：**
- **自动驾驶规划（Autopilot，2024-04）：** 面向汽车和房车（RV）的 AI 公路旅行规划。[来源](https://roadtrippers.com/media-center/new-ai-trip-planner-autopilot/)
- **重新混排（Remix，2025-04）：** 对 AI 推荐的停靠点做局部调整，不用整体重来。[来源](https://www.newswire.com/news/roadtrippers-supercharges-autopilot-tm-the-ai-trip-planner-you-loved-22560717)
- 可以在 AI 行程里加自定义途经点；按车辆类型规划路线、推荐营地；依托 3800 万次行程和 420 亿英里的数据。[来源](https://www.newswire.com/news/roadtrippers-unveils-updates-to-its-1-trip-planning-app-enhancing-the-22481162)
- 仅限 Premium 会员。[来源](https://roadtrippers.com/autopilot)

**UX 模式：** 局部重新生成 + 用户手动插入点，AI 草稿可以一点点改。

### 2.8 Tripadvisor

- **AI 助手：** 生成的逐日行程可编辑、可重排、可分享，推荐附带实时价格和库存。[来源](https://www.tripadvisor.com/AIAssistant)
- **2026 GTC 大会展示"视频 → 行程"原型：** 尚未上线，仍在测试用户反应。[来源](https://www.altexsoft.com/travel-industry-news/tripadvisor-debuts-ai-planner-for-video-based-trips/)
- **2026-04 分发进第三方 AI：** ChatGPT 里的 Tripadvisor App（可在对话中用地图比较酒店）、Alexa+，并接入 Claude。[来源](https://tripadvisor.mediaroom.com/2026-04-23-How-AI-Is-Changing-the-Way-We-Plan-Travel?asPDF=1)
- 2023 年公测的 Trips 行程生成器是这些能力的基础。[来源](https://www.hospitalitynet.org/news/4117380/tripadvisor-launches-ai-powered-travel-planning-product)

### 2.9 Google（地图 + 搜索）

**(a) Gemini 导航（2025-11-05，美国先行，iOS/Android）**
- 开车时免手操作、可多轮追问。官方例子：先问"沿途几英里内有素食选项的平价餐厅"，再问"那里停车方便吗"；也可以问沿途充电桩。
- 用"看得见的地标"指路：分析 2.5 亿个地点，并与街景图像交叉比对。
- 镜头（Lens）模式：用摄像头加语音询问眼前的地点。
- [TechCrunch](https://techcrunch.com/2025/11/05/google-maps-bakes-in-gemini-to-improve-navigation-and-hands-free-use)、[Google](https://blog.google/products/maps/gemini-navigation-features-landmark-lens/)

**(b) 问地图（Ask Maps；日文名 マップに相談）**
- 2026-03 在美国、印度上线。[MacRumors](https://www.macrumors.com/2026/03/12/google-maps-gemini-integration/)
- **2026-08-07 起在日本逐步提供日语版。** 官方示例问题："能买咖啡又能充电的地方""去目的地路上有什么推荐"。[Impress Watch](https://www.watch.impress.co.jp/docs/news/2131621.html)、[Google 日本](https://blog.google/intl/ja-jp/products/connect-communicate/japanese-ask-maps/)

**(c) 问地图行程规划（2026-11-16）**
- 生成逐日行程，附每站小贴士和编号图钉。
- 可以口头要求调整，如加一个观景点、加午餐站。
- **出发时显示实时路况、店铺是否营业，以及下一站的"氛围"描述。**
- 聊天记录里的行程带"itinerary"徽章，方便找回；可分享，桌面端可导出到 Google 文档。
- 收藏列表可以用 Gemini 搜索。
- 行程规划和收藏搜索在 200 多个国家推出（**是否包含日本/日语未核实**）；"出发前须知"和预约查找只在美国。
- [Google](https://blog.google/products-and-platforms/products/maps/ask-maps-holiday-travel-features-2026/)、[Digital Trends](https://digitaltrends.com/phones/google-maps-can-now-organize-multi-day-trips-and-call-businesses-to-check-appointments)

**(d) 搜索 AI 模式的画布（Canvas）旅行规划（2025-11）**
- 在侧栏生成行程，追问即更新，引用实时航班和酒店信息。
- 分享给别人后，对方可以点"Customize Canvas"修改后发回。
- **来源冲突：** 可用范围一说"仅限美国桌面端、加入 Labs 的用户"，一说"美国全体用户"。
- [Google](https://blog.google/products/search/agentic-plans-booking-travel-canvas-ai-mode/)、[Android Authority](https://www.androidauthority.com/google-ai-mode-travel-planning-canvas-3616391)

**(e) 截图存地点（2025-03 宣布，2025-05 登陆 iPhone）**
- Gemini 从截图的文字中识别地名，存进"Screenshots"列表，地图上用相机图标标出。
- 默认关闭，可授权自动扫描相册，也可以手动上传。
- [Google 帮助](https://support.google.com/maps/answer/16278054)、[MacRumors](https://www.macrumors.com/2025/05/08/google-maps-scan-screenshots-for-places/)

**(f) iOS 实时活动：** Google 地图已在 iPhone 锁屏和灵动岛（Dynamic Island）上显示导航，包括公共交通。[9to5Google](https://9to5google.com/2024/07/17/google-maps-live-activities-iphone/)

### 2.10 Apple 地图（Apple Maps）

**iOS 26（2025-09）**
- **已访问地点（Visited Places）：** 用端侧 Apple Intelligence 识别去过的商店、餐厅、景点；需用户主动开启，数据存在设备上，端到端加密。[MacRumors](https://www.macrumors.com/guide/ios-26-maps/)
- **偏好路线（Preferred Routes）：** 学习用户常走的路线，遇到封路或拥堵时主动提醒并给出替代路线。[MacRumors](https://www.macrumors.com/guide/ios-26-maps/)
- 钱包里的登机牌可以作为实时活动显示；iPhone 上的实时活动会自动出现在 CarPlay 主屏。[9to5Mac](https://9to5mac.com/2025/12/04/ios-26-made-live-activities-even-better-on-iphone-heres-whats-new/)、[Yahoo](https://tech.yahoo.com/ai/apple-intelligence/articles/ios-26-enhanced-boarding-passes-115008609.html)
- iOS 26.5 新增推荐地点（Suggested Places）。[9to5Mac](https://9to5mac.com/2026/07/29/apple-maps-in-ios-27-makes-my-favorite-recent-feature-even-better/)

**iOS 27（2026-09）**
- AI 增强的 3D 俯瞰（Flyover），覆盖 350 多个城市。
- 本地清单（Local Lists，**仅美国**）、热门餐厅（Trending Restaurants）。
- **自然语言路线搜索**，例如"避开收费路"。
- 推荐地点可以横滑，最多约 10 个。
- 已访问地点和指南（Guides）扩展到更多国家（**国家列表未核实**）。
- 离线地图有改进（Apple 未公布细节）。
- Apple Watch 智能叠放（Smart Stack）新增停车位置小组件。
- [MacRumors](https://www.macrumors.com/2026/06/11/apple-maps-to-get-these-10-new-features-in-ios-27/)、[MacRumors 指南](https://www.macrumors.com/guide/ios-27-maps/)、[Cult of Mac](https://www.cultofmac.com/news/every-notable-apple-maps-upgrade-in-ios-27)

**长期能力**
- **离线地图（iOS 17 起）：** 在下载区域内，驾车、步行、骑行、公交都能离线逐向导航，也能看营业时间和评分。iPhone 在附近时，Apple Watch 也能用离线地图。[Apple 支持](https://support.apple.com/en-us/HT213829)、[MacRumors](https://www.macrumors.com/how-to/download-offline-maps-ios-apple-maps/)
- **东京实时公交（2024-08）：** 覆盖 20 多条铁路、公交、电车线路，数据来自公共交通开放数据中心（ODPT）。[MacRumors](https://www.macrumors.com/2024/08/07/apple-maps-real-time-transit-info-tokyo/)

**UX 模式：** 隐私优先的个性化，靠端侧计算加端到端加密。

### 2.11 其他值得关注的产品（含新入局者）

- **Tripsy（iOS 原生行程 App）**
  - 3.10 版（2026-09）新增智能导入（Smart Import）：把链接、截图、PDF、邮件、粘贴的文本、部分 Instagram/TikTok 帖子，以及 Google 地图和 Apple 地图的列表/指南，转成地点和预订。**智能导入用的是自家服务器上的模型。**
  - 智能洞察（Smart Insights）**用 Apple 端侧 Foundation Models** 分析附件和邮件，提取行李额、早餐、停车、取消政策、费用等。
  - 支持 iOS 27 的超大小组件。
  - Pro：$39/年，或 $199 买断。
  - 2025-05 已加入 Apple Intelligence、ChatGPT 规划和快捷指令（Shortcuts）自动化。
  - 搜索摘要称 Apple 在 WWDC26 的 Siri AI 环节展示过 Tripsy（原文**未核实**）。
  - [9to5Mac](https://9to5mac.com/2026/09/16/tripsys-ios-27-update-includes-smarter-imports-on-device-ai-insights-more/)、[iThinkDifferent](https://www.ithinkdiff.com/tripsy-3-10-smart-import-ai-insights/)、[AlternativeTo](https://alternativeto.net/news/2025/5/tripsy-adds-apple-intelligence-chatgpt-travel-planning-and-shortcuts-automation)
- **Flighty（实时活动标杆）**
  - Apple 开发者专题称它的灵动岛和锁屏实时活动是"best-in-class"。
  - 设计借鉴机场信息牌，灵动岛内容随航程阶段变化。
  - 获 Apple 设计奖（Interaction 类）。
  - [Apple Developer](https://developer.apple.com/news/?id=mis6swzt)、[TravelDailyNews](https://www.traveldailynews.com/technology/flighty-wins-apple-design-award/)
- **Trip.com 行程规划器（Trip.Planner，2025-08）**
  - 回答三个问题（目的地、天数、风格）即生成行程，可在交互地图上预览。
  - 接入实时交通价格和库存；可导入已有订单。
  - 画布式编辑：改名、重排、替换、删除、加笔记；有悬浮 AI 按钮。
  - 宣称遇到延误或天气变化会自动调整（**未经独立验证**）。
  - [Skift](https://skift.com/2025/08/28/trip-com-groups-ai-shrinks-planning-work-answer-three-questions-get-a-bookable-trip/)、[AltexSoft](https://www.altexsoft.com/travel-industry-news/trip-com-launches-ai-trip-planner-for-custom-itineraries/)
- **Boop（2025-11）：** 把社交推荐变成可预订的行程，别人可以复制后再个性化。[TechCrunch](https://techcrunch.com/2025/11/18/boops-new-app-turns-social-recommendations-into-bookable-itineraries)
- **Airial（2025-06）：** 前 Meta 工程师创立，主打用 AI 解决出行衔接规划。（仅依据 TechCrunch 标题，功能细节**未核实**）[TechCrunch](https://techcrunch.com/2025/06/30/former-meta-engineers-airial-travel-tool-helps-travelers-solve-logistics-planning-with-ai)

---

## 三、日本产品

### 3.0 "旅行手册"（旅のしおり）文化，及其对路书的意义

- **是什么：** 一本记录行程、想去的景点、要带的物品、想吃的东西和各种点子的小册子，由同行者全员共享。过去多用于修学旅行（修学旅行）、员工旅行等团体旅行，近年自己做手册的个人旅行者也在增加。[来源](https://travelist.jp/column/?p=2213)
- **历史：**
  - 修学旅行一般认为始于 1886 年，目前是学习指导要领中规定的"特别活动"。[来源](https://www.his-j.com/corp/column/educationaltrip_02/)
  - 北海道大学资料记载，札幌农学校约在 1885 年把修学旅行定为例行活动，1890 年留下了最早能看清行程的记录。[来源](https://150th.hokudai.ac.jp/wp/wp-content/uploads/2026/04/SCENE6_Vol.58.pdf)
  - 新潟县上越市的资料里，有把行程写在封面内侧的旧手册实例。[来源](https://www.city.joetsu.niigata.jp/uploaded/attachment/268177.pdf)
- **"旅行手册"作为纸质册子何时定型，未找到资料（未核实）。**
- **对产品的意义（我方推断）：** 在日本，"旅行手册"不只是计划，而是**要交给同行者的成品**：时间表、集合地点、要带的东西、注意事项，可以打印、可以分发。tabiori 支持在便利店打印，NAVITIME Travel 支持"把计划存成图片分享"，都说明这个需求真实存在。

### 3.1 NAVITIME 系列

**NAVITIME Travel**（App Store 名：旅のしおり作成・旅行計画 - NAVITIME Travel）
- **2024-03，生成式 AI"NAVITIME Travel AI"：** 选出发地、目的地和兴趣主题，AI 按最佳顺序生成 1 日观光计划。[来源](https://www.travelvoice.jp/20240329-155386)
- **2024-11-28，PC 版聊天式旅行咨询：** 用自然语言搜索、推荐景点，并加入已有计划。免费会员每天 10 次，付费会员每天 30 次。[来源](https://www.travelvoice.jp/20241129-156738)
- **2025-02，选定番景点即生成计划：** 可以按公交、自驾、自行车、步行对比不同计划。[来源](https://www.travelvoice.jp/20250228-157255)、[AppBank](https://www.appbank.net/2025/03/02/iphone-application/2759736.php)
- **2026-09-15，AI 对话导入（AI会話インポート）：**
  1. 把与 ChatGPT、Gemini、Claude 的对话文本整段粘贴进来。
  2. 自动解析出其中的景点，批量导入 App。
  3. **与 NAVITIME 地点库自动比对，显示真实存在的景点及营业时间。**
  4. 利用时刻表、车站、高速出入口（IC）数据计算游览顺序，分别给出公交版和自驾版 1 日计划。
  5. 停留时间和顺序可以手动改；可以存成图片分享给同行者。
  [来源](https://www.travelvoice.jp/20260916-160522)、[DX Magazine](https://dxmagazine.jp/news/2653ota09/)
- 多人同时编辑（付费）、编辑部的模型路线、住宿预订。[App Store](https://apps.apple.com/app/id1279724919)、[app-liv](https://app-liv.jp/4586200/)

**NAVITIME / 换乘NAVITIME（乗換NAVITIME）**
- **锁屏停靠站提示（停車駅案内をロック画面に表示）：** 在"仅电车"或"步行 + 电车"的路线结果页按这个按钮，就能根据路线和定位，在锁屏上实时显示所乘列车的停靠站。支持 iOS 17 及以上；免费会员可用 3 次，付费会员不限次数。是否同时显示在灵动岛：**未核实**。[AppBank](https://www.appbank.net/?p=2795391)

**Japan Travel by NAVITIME（面向访日游客）**
- AI 旅行计划：可设定停留 3–10 天，计划考虑交通。[Travel Voice（英）](https://travelvoice.jp/english/navitime-japan-a-leading-navigation-app-provider-adds-an-ai-based-travel-planning-function-on-the-navigation-website-for-inbound-travelers)
- 由在日外国作者写的指南、路线检索、地图、离线景点搜索、时间轴规划；运行中断时的替代路线是付费功能。[App Store](https://apps.apple.com/CA/app/id686373726)
- 2026-02 面向地方政府和目的地营销组织（DMO）推出生成式 AI 观光导览，支持 5 种语言。[来源](https://www.travelvoice.jp/20260206-159216)

### 3.2 Jorudan 换乘案内（ジョルダン 乗換案内）

- **2024 年 AI 语音输入：** 可以用口语检索，例如"今天下午 5 点到涩谷！"。[来源](https://kyodonewsprwire.jp/release/202406071931)
- **2025-03 西新宿模式（西新宿モード）：** 通过聊天了解用户属性，推荐西新宿区域景点的 AI 礼宾。[来源](https://kyodonewsprwire.jp/release/202503045089)
- **2026-08-06 多语言版"全多模态路线检索"：** 铁路、公交、共享单车、出租车、按需交通组合检索，支持 12 种语言。日语版在 2024-05-08 发布的 version 6 已支持该功能。[来源](https://kyodonewsprwire.jp/release/202608033593)
- 2026 年名称里带"AI"的新功能：未找到。

### 3.3 雅虎换乘案内（Yahoo!乗換案内）

- **2026-08-26 起，iOS 版路线结果显示共享单车：** 支持 docomo bike share、HELLO CYCLING、LUUP 三家。Android 版上线时间未定。[DIME](https://dime.jp/genre/2148921/)
- 与 JR 东日本合作提供列车实时拥挤度（只见到标题，日期**未核实**）。[来源](https://k-tai.watch.impress.co.jp/img/ktw/docs/2057/769/html/main_o.png.html)
- iOS 版公交时刻表（年份**未核实**）。2026-03-12 支持地域联合 IC 卡票价（只见到标题）。
- 实时活动：**未找到相关信息**。

### 3.4 其他换乘 App（实时提醒相关）

- **站探（駅探）换乘案内：** 有"换乘闹钟"（乗換アラーム），在出发、换乘、到达前提醒；另有"末班车闹钟"（終電アラーム）。[App Store](https://apps.apple.com/jp/app/id524306589)
- **换乘MAP导航（乗換MAPナビ）：** 用导航方式显示发车时间、站台、方便换乘的车厢位置和当前位置。[App Store](https://apps.apple.com/jp/app/%E4%B9%97%E6%8F%9Bmap%E3%83%8A%E3%83%93-%E5%85%A8%E5%9B%BD%E3%81%AE%E5%85%AC%E5%85%B1%E4%BA%A4%E9%80%9A%E6%83%85%E5%A0%B1%E3%82%92%E7%B6%B2%E7%BE%85%E3%81%97%E3%81%9F%E7%B7%8F%E5%90%88%E3%83%8A%E3%83%93%E3%82%A2%E3%83%97%E3%83%AA/id1050153420)

### 3.5 Holiday（ホリデー）

- 每月 400 多万人使用；可以保存想去的地方、浏览别人的计划。
- 切到"行程模式"即可排日程；可邀请朋友共同编辑。
- 收录日本国内约 1 万个区域的出行计划信息；可搜附近景点；覆盖国内和韩国旅行。
- 有用户批评信息千篇一律、UI 难用。
- [App Store](https://apps.apple.com/jp/app/id962231929)、[app-liv](https://app-liv.jp/2131560/)
- **AI 功能：未找到（未核实）。**

### 3.6 tabiori（可共享的旅行手册，-tabiori- 共有できる旅のしおり）

- 日程、待带物品、位置、照片实时同步；同行者共同编辑；扫二维码或点链接就能分享。
- **离线阅读**；可在罗森、全家、Seicomart 的便利店复印机上**打印手册**。
- 付费月卡包括去广告、视频分享、便利店打印、贴纸等。
- 有用户评论称浏览器版功能受限。
- [App Store](https://apps.apple.com/JP/app/id1193502519)、[app-liv](https://app-liv.jp/4270295/)

### 3.7 NEWT（ニュート）

- **旅行规划器（Travel Planner，beta，2025-06）：** 以用户在 NEWT 订的旅行团行程表为底，AI 生成推荐计划，可按主题定制。[ASCII](https://ascii.jp/elem/000/004/363/4363410/)
- **NEWT MCP：** 一个 MCP 服务器，让 Claude 等 AI 代理实时检索 NEWT 的旅行团和酒店，查询库存和价格。[来源](https://www.tv-tokyo.co.jp/plus/external-pr/entry/139391.html)
- NEWT Chat：面向旅游服务业的 AI 客服，可与 LINE 官方账号对接。[来源](https://www.wantedly.com/companies/reiwatravel/post_articles/1026440)
- 名为"旅行手册"的功能：未找到。

### 3.8 OTA 与出版

- **乐天旅行（楽天トラベル）：**
  - 2025-09 推出 AI 找酒店代理（楽天トラベルAIホテル探索）。
  - **2026-04-30 升级为"Rakuten AI"并加入预订功能：** 用自然语言提需求；最多同时对比 30 家酒店，可在地图上显示；登录后显示含积分的价格，免填个人和支付信息；能理解"下周末订老地方那家"这类请求，从历史订单里推荐。
  - 只覆盖住宿，不做整段行程编排。
  - [Web担当者Forum](https://webtan.impress.co.jp/n/2026/05/01/52592)、[ネットショップ担当者フォーラム](https://netshop.impress.co.jp/n/2026/05/07/16020)
- **Jalan（じゃらん）：** AI 生成行程的功能**未核实**。有个人开发者文章提到 Jalan 有按条件推荐酒店的 AI 聊天，底层模型未核实。2025-02，Jalan 研究中心（じゃらんリサーチセンター）在热海做了生成式 AI 观光营销的实证实验。[Zenn](https://zenn.dev/microcms/articles/b4f571a8c916bf)、[訪日ラボ](https://honichi.com/news/2025/02/28/jalan_ai)
- **JTB / Rurubu（るるぶ）：** 没找到 JTB 自己面向消费者的 AI 行程 App（**未核实**）。2025-02，JTB 出版正式推出 LINE 官方账号"Rurubu + AI 聊天"（るるぶ+AIチャット），根据用户需求和历史对话推荐目的地。[Travel Voice](https://www.travelvoice.jp/20250218-157158)
- **co-Trip（ことりっぷ）：** 可以把文章和景点"剪藏"进想去清单；可创建计划、获取模型计划；付费版可多人实时编辑；没找到 AI 生成功能。[app-liv](https://app-liv.jp/2139000/)
- **Nicody（ニコディ，音译）：** 登记目的地后，把收藏的景点拖动排序就能组成手册，支持多人协作。[app-liv](https://app-liv.jp/5342149/)
- **新入局者：** Tripia（AI旅行計画）称排程时考虑距离、时刻表、交通状况和换乘时间；AVA Travel（アバトラベル）根据输入的需求生成计划并在地图上显示路线。两者均为 2026-06 更新的商店页信息。[Tripia](https://apps.apple.com/jp/app/id6741425738)、[AVA Travel](https://apps.apple.com/jp/app/id6470335943)

### 3.9 日本用户对 AI 旅行的态度（JTB 综合研究所调查）

- 2025-07 调查：每周至少用一次生成式 AI 的人里，**77.8% 用 AI 做过与旅行相关的事**。
- 最想用的功能前三名：**"制定行程和路线建议"**、"查询和预订交通"、"查当地美食"。
- 最大的顾虑：**"信息可能不准确"**。
- 2026-01 发布的调查：把生成式 AI 当作信息检索手段的比例，从 2024 年的 9.7% 升到 28.8%。
- [Travel Voice](https://www.travelvoice.jp/20250822-158242)、[Travel Voice 2026](https://www.travelvoice.jp/20260127-159031)
- **启示：** 在日本做 AI 路书，"可信度可视化"（营业时间已核实、时刻表已核实）本身就是卖点。

---

## 四、中国产品（只写上文没有的补充点）

- **高德地图 2026（2026-09-16 发布）**
  - **导航 Live（导航Live）：** 把自然对话、多模态感知和空间理解融进驾车、步行、景区游览。
    - 行程中临时改安排，直接说出需求，系统结合当前位置和路线调整方案，**不用退出导航重新搜索**。
    - 可以按行程时长生成个性化播客。
    - 用手机镜头识别周边建筑、路口、文物古迹，用于步行指引和讲解。
  - **避雷指南：** 从营业时间、行程节奏、停车提示、拥挤程度等 **15 个维度**，提前识别时间冲突、拥堵、闭店等风险。
  - AI 对话会把模糊需求拆成"找地点、规划路线"等步骤；多人聚会时综合时间、路况、天气，生成可直接导航的方案。
  - [凤凰网](https://i.ifeng.com/c/8wVwE2CJtMI)、[unwire.hk](https://unwire.hk/2026/09/18/amapnavigationlive2026/ai/)、[品玩](https://www.pingwest.com/w/317481)
  - 已有工具：DIY 地图（多人共建、一键导航、组队出行）；用画笔"标记想走/不走"的路段来定制路线。[IT之家](https://www.ithome.com/0/570/908.htm)
  - **专门的"路书"功能：未找到，未核实。**
- **携程 TripGenie / Trip.Planner**
  - TripGenie 用 Google AI，已升级为覆盖行前、行中、行后的旅行伙伴；约 60% 的提问与预订有关。
  - 2026 年 AI 辅助订单同比增长 400%，菜单助手、实时翻译等实时工具使用量增长约 300%。
  - [Travolution](https://www.travolution.com/news/trip.com-sets-out-three-years-of-contrasting-ai-use-in-travel/)、[Google Cloud](https://cloud.google.com/customers/intl/zh-cn/tripgenie)
  - 携程 Apple Watch 版支持抬腕看行程、登机提醒、值机柜台/登机口/行李转盘信息。灵动岛和实时活动的支持情况**未核实**。[App Store](https://apps.apple.com/us/app/-/id688037240)
  - 垂直大模型"携程问道"：没找到具体的行程功能。[界面](https://www.jiemian.com/article/13209951.html)
- **马蜂窝 AI 路书（据报道 7 月 11 日向全体用户开放，年份按报道时间推断为 2025 年，未核实）**
  - **主动追问：** 先用选择题追问细节，再生成行程、住宿、交通、预算和贴士。
  - **旅行性格诊断：** 生成偏好标签，持续学习（例如记住"少走路"）。
  - **一键联系当地真人"指路人"。**
  - AI 小蚂：**截图识别日本餐厅并代打电话预订**，支持 7 种语言的实时翻译和菜单拍照识别。
  - [凤凰网](https://tech.ifeng.com/c/8ku3FD2ELtD)、[AIbase](https://www.aibase.com/zh/news/19633)、[DoNews](https://www.donews.com/news/detail/1/5850503.html)
- **小红书**
  - 官方"一键生成路线"功能：**未找到，未核实**。
  - 第三方 App"路敢敢"（原名"识途"）可以一键提取小红书笔记等链接里的景点，规划路线并导出 PDF。[App Store](https://apps.apple.com/cn/app/%E8%AF%86%E9%80%94-%E6%97%85%E8%A1%8C%E5%9C%B0%E5%9B%BE-%E4%B8%80%E7%AB%99%E5%BC%8F%E6%99%BA%E8%83%BD%E6%97%85%E6%B8%B8%E8%A7%84%E5%88%92%E5%B7%A5%E5%85%B7/id6739447521)
  - 小红书 2025 年启动"路书计划"，是内容营销项目，没看到工具层面的内容。[B站专栏](https://www.bilibili.com/read/cv43776572)
- **飞猪**
  - **问一问（2025-04）：** 多个大模型加多个智能体协同；依托机票、酒店的实时库存，从规划直接走到预订；改签等售后环节较弱。[潮新闻](https://tidenews.com.cn/news.html?id=3531067)、[人人都是产品经理](https://www.woshipm.com/ai/6207978.html)
  - **飞猪帮帮（2026-08-10）：** 能力从对话延伸到值机、退改签、酒店升房，嵌入 App 的搜索、行程和订单页面。[潮新闻](https://tidenews.com.cn/news.html?id=3531067)

---

## 五、平台与 API 能力核实表

| 能力 | 苹果 / 谷歌 / 日本 API | 现状（截至 2026-11） | 来源 |
|---|---|---|---|
| 地点稳定 ID | Apple：地点 ID（Place ID），即 `MKMapItem.identifier` 加 `MKMapItemRequest` | WWDC24 推出，可存 rawValue 后重新取回地点。identifier 是可选值，有开发者反映只有通过 MKLocalSearch 拿到的地点才可靠地带 ID。WWDC25 新增 `PlaceDescriptor`（GeoToolbox 框架），可以在没有 ID 时描述地点 | https://developer.apple.com/videos/play/wwdc2024/10097/ ；https://developer.apple.com/forums/thread/770291 ；https://developer.apple.com/videos/play/wwdc2025/204 |
| 原生地点详情卡 | Apple：SwiftUI 的 `mapItemDetailSheet` / `mapItemDetailPopover` | 可以直接弹出 Apple 地图样式的地点卡。最低系统版本以官方文档为准（**未逐一核实**） | https://developer.apple.com/tutorials/data/documentation/mapkit/mapkit-for-swiftui.md |
| 街景（Look Around） | Apple：`LookAroundPreview`、`MKLookAroundSceneRequest`（可用坐标或地点创建）、`lookAroundViewer` | 可用。大阪等地的覆盖情况**未核实**。macOS 上有交互问题的报告 | https://developer.apple.com/documentation/mapkit/lookaroundpreview.md ；https://developer.apple.com/documentation/mapkit/mklookaroundscenerequest.md ；https://developer.apple.com/forums/thread/773877 |
| 可点选的 POI / 附近搜索 | Apple：`MapFeature` / `MapSelection`；MKLocalSearch；官方教程"Interacting with nearby points of interest" | 可用。"点选地图要素 → 街景"之间的衔接代码要自己写 | https://developer.apple.com/tutorials/data/documentation/mapkit/interacting-with-nearby-points-of-interest.md |
| 地址 / 地理编码 | Apple：`MKAddress`、`MKGeocodingRequest`、`MKReverseGeocodingRequest`（iOS 26） | iOS 26 新增；MKPlacemark 相关的 API 被标为弃用 | https://developer.apple.com/documentation/updates/mapkit.md ；https://developer.apple.com/forums/thread/795687 |
| 驾车 / 步行 / 骑行路线 | Apple：MKDirections | 支持驾车、步行；**iOS 26 新增骑行路线和到达时间** | https://developer.apple.com/documentation/updates/mapkit.md |
| **公交路线（App 内计算）** | Apple：`MKDirectionsTransportType.transit` | **枚举里有 transit，但多名开发者报告请求失败或返回 DirectionsNotFound**，没找到官方说明。可行替代：用启动选项跳转 Apple 地图显示公交路线 | https://developer.apple.com/forums/thread/766568 ；https://developer.apple.com/forums/thread/833669 ；https://developer.apple.com/documentation/mapkit/directions-mode-values.md |
| **公交路线（Google）** | Google Routes API，`travelMode: TRANSIT` | 文档支持，但公交路线不能设途经点。**日本覆盖未核实**（覆盖页没能读到日本行）。有开发者报告在日本用旧版 Directions API 查公交返回 ZERO_RESULTS，开车、步行、骑行都正常 | https://developers.google.com/maps/documentation/routes/transit-route?hl=ja ；https://developers.google.com/maps/documentation/routes/coverage ；https://discuss.google.dev/t/directions-api-transit-mode-returns-zero-results/378267 |
| 日本公交 API① | NAVITIME 路线 API（Route totalnavi，在 RapidAPI 上） | 提供 `/route_transit`、`/shape_transit`、`/fare_table`、`/fare_comparison`（公交加步行的门到门路线和票价）。**价格未核实**。另有企业合同制的 NAVITIME API，2026-05 有新功能 | https://rapidapi.com/navitimejapan-navitimejapan/api/navitime-route-totalnavi ；https://api-sdk.navitime.co.jp/information |
| 日本公交 API② | Ekispert（駅すぱあと）API，原名"駅すぱあとWebサービス" | 2024-02-22 改名，同时推出免注册的 Playground。免费计划需要申请（旧文章称无期限）。路线图 API 免费计划每天 100 次会话。**路线检索 API 的现行价格未核实** | https://www.bcnretail.com/market/detail/20240226_404198.html ；https://qiita.com/chocode/items/01e3d9762112dcdc598c |
| 日本公交 API③ | Jorudan 乗換案内Biz API | 面向企业的合同制多语言路线检索。2016 年通过合作方提供的报价为初始 40 万日元、月费 5 万日元加按量计费。**现行价格未核实** | https://kyodonewsprwire.jp/release/201607212683 ；https://jorudan.co.jp/company/data/pdf_pr/20131119_biz.pdf |
| 日本公交开放数据 | 公共交通开放数据中心（ODPT） | 以 REST/JSON 提供时刻表、运行信息、列车位置（如都营地铁、都电荒川线）。Apple 地图东京实时公交也用这套数据。**现行条款和费用未核实** | https://www.kotsu.metro.tokyo.jp/pickup_information/news/subway/2019/sub_p_201905318600_h.html ；https://www.macrumors.com/2024/08/07/apple-maps-real-time-transit-info-tokyo/ |
| Google 地点数据 | Places API (New) | 2025-03-01 起取消每月 $200 赠额，改为每个 SKU 单独的免费额度：Essentials 每月 1 万次、Pro 5000 次、Enterprise 1000 次 | https://developers.google.com/maps/billing-and-pricing/march-2025 |
| Google AI 地点摘要 | Places API (New)：`reviewSummary`、`generativeSummary` | 必须显示"Summarized with Gemini"。地点摘要目前列出的是美国和印度的英语，**日本是否可用未核实**（推测暂不可用） | https://developers.google.com/maps/documentation/places/web-service/place-summaries ；https://developers.google.com/maps/documentation/places/web-service/review-summaries |
| Google 数据使用条款 | Maps Platform 服务专属条款 | **Place ID 可以无限期缓存**；地点名称等内容不得在会话外留存。Directions、Places 等 API 的内容**不得与非 Google 地图一起使用**。**来源冲突：** 某版 JS 政策给出了"在非 Google 地图上清晰标注 Google 归属"的示例 | https://cloud.google.com/maps-platform/terms/maps-service-terms ；https://developers.google.com/maps/documentation/javascript/policies |
| LLM 接入地图数据 | Gemini API 的地图事实依据（Grounding with Google Maps） | 2025-10 正式可用（GA）；覆盖 2.5 亿多个地点；返回内容带 Maps 引用标注；可与搜索事实依据同时使用 | https://ai.google.dev/gemini-api/docs/maps-grounding ；https://developers.googleblog.com/en/your-ai-is-now-a-local-expert-grounding-with-google-maps-is-now-ga/ |
| Apple Web/服务器地图额度 | MapKit JS / Apple Maps Server API | 每个开发者账号免费额度：25 万次地图浏览加 2.5 万次服务调用。**来源冲突：** 按日还是按月计算说法不一；超出返回 429，可申请扩容。原生 MapKit 是否有调用额度：**未核实** | https://developer.apple.com/maps/mapkitjs/pricing ；https://developer.apple.com/forums/thread/818109 |
| 实时活动 | ActivityKit | 最长活跃 8 小时。**来源冲突：** 苹果技术支持（DTS）称锁屏最多可停留 12 小时（8 小时后不再更新）。高优先级推送消耗设备的推送预算，优先级 5 不消耗。**iOS 26 新增定时启动**（`start:` 参数），会计入同时存在的活动数量上限 | https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities.md ；https://developer.apple.com/forums/thread/797676 ；https://developer.apple.com/documentation/activitykit/activity/request(attributes:content:pushtype:style:alertconfiguration:start:).md |
| 实时活动上手表/车机/Mac | iOS 18/watchOS 11 起自动出现在手表的智能叠放；用 `supplementalActivityFamilies(.small)` 定制手表布局。iOS 26 起显示在 CarPlay 和 Mac 菜单栏 | 可用；手表端不需要单独的 Watch App | https://developer.apple.com/wwdc24/10068 ；https://9to5mac.com/2025/12/04/ios-26-made-live-activities-even-better-on-iphone-heres-whats-new/ |
| 闹钟 / 倒计时 | AlarmKit（iOS 26） | 第三方 App 可以设闹钟和倒计时，显示在锁屏、灵动岛、待机显示（StandBy）上，倒计时界面用自定义实时活动。有密集排程时闹钟延迟的报告 | https://developer.apple.com/wwdc25/230 ；https://developer.apple.com/forums/thread/825427 |
| App 意图 / Siri | App Intents（iOS 26：交互式片段、Spotlight、视觉智能接入） | 片段可以在 Siri、Spotlight、快捷指令里直接操作。视觉智能通过 `IntentValueQuery` 加 `SemanticContentDescriptor` 返回 App 内的实体 | https://developer.apple.com/videos/play/wwdc2025/275 ；https://developer.apple.com/videos/play/wwdc2025/281 ；https://developer.apple.com/documentation/appintents/visual-intelligence.md |
| Siri AI（iOS 27） | App Intents 加应用模式（App schemas） | Siri 可以读取 App 内的内容并跨 App 编排操作。**没找到"旅行"模式。来源冲突：** Macworld 称部分扩展仍是预览、暂时不能上架。**日语自 iOS 27.2（约 2026-10-27）起可用**，繁体中文在 27.3 beta，**简体中文未列入**；欧盟不可用；需 iPhone 15 Pro 及以上；每天有使用次数限制 | https://developer.apple.com/videos/play/wwdc2026/240 ；https://macworld.com/article/3276244/with-ios-27-3-the-siri-ai-floodgates-are-about-to-open.html ；https://www.apple.com/newsroom/2026/10/siri-ai-is-available-in-more-languages-starting-today/ ；https://gori.me/?p=171770 |
| Apple Intelligence 语言 | 系统级 | iOS 26 起支持日语和简体中文（beta），iOS 26.1 又加了繁体中文等语言。中国大陆不可用 | https://www.apple.com/ie/newsroom/2025/09/apple-today-released-new-apple-intelligence-features/ ；https://9to5mac.com/2025/11/11/ios-26-1-brings-apple-intelligence-to-these-eight-new-languages/ |
| 端侧大模型 | Foundation Models（iOS 26） | 约 30 亿参数；`@Generable` 引导式生成（Guided Generation）；工具调用（Tool Calling）。**每个会话上下文 4096 token，中日文约 1 字 1 token**。iOS 26.4 新增 `contextSize` 和 token 计数接口。技术报告称支持 16 种语言，**是否含中日文未逐一核实**（Apple Intelligence 本身支持中日文） | https://developer.apple.com/documentation/foundationmodels/managing-the-context-window.md ；https://developer.apple.com/tutorials/data/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window.md ；https://infoq.com/news/2026/03/apple-foundation-models-context |
| 云端大模型（Apple） | WWDC26：`PrivateCloudComputeLanguageModel` | 32K 上下文，带推理能力。加入"小企业计划"且首次下载量少于 200 万的 App 免费使用。可以通过统一协议接 Claude、Gemini 等第三方云模型；框架开源；watchOS 27 可用 | https://developer.apple.com/videos/play/wwdc2026/241 ；https://developer.apple.com/wwdc26/guides/machine-learning/ |
| 语音转写 | SpeechAnalyzer / SpeechTranscriber（iOS 26） | 完全端侧运行，面向长语音和远距离说话。第三方图片说明列出的语言包括日语、中文、粤语（**以官方列表为准，未核实**）。不支持的语言可退回 DictationTranscriber；watchOS 不支持 | https://developer.apple.com/videos/play/wwdc2025/277/ ；https://blog.addpipe.com/apple-speechanalyzer-api/ |
| 地理围栏 | CoreLocation 的 CLMonitor（iOS 17+） | **每个 App 最多同时监控 20 个条件**；有效最小半径约 100 米（非官方数据）；有后台事件不触发的报告 | https://developer.apple.com/forums/thread/769113 ；https://developer.apple.com/forums/thread/806783 |
| 天气 | WeatherKit | 每个开发者账号每月含 50 万次调用；100 万次/月 $49.99 起 | https://developer.apple.com/weatherkit/get-started/ |
| 离线地图 | Apple 地图 App（iOS 17+） | 用户可以在 Apple 地图 App 里下载区域地图。**第三方 MapKit 有没有"下载离线区域"的公开 API：未核实** | https://support.apple.com/en-us/HT213829 |
| NFC 交通卡 | Core NFC（iOS 13+，FeliCa） | 第三方 App 可以读取 Suica、PASMO 等卡的余额和乘车记录（已有多款上架 App） | https://apps.apple.com/jp/app/id1478703111 ；https://www.watch.impress.co.jp/docs/news/1208468.html |
| 屏幕/截图理解（系统级） | 视觉智能（iOS 26） | 从截图提取日期、地点并"添加到日历"，可问 ChatGPT、用 Google 以图搜图。需 iPhone 15 Pro 及以上 | https://www.macrumors.com/guide/ios-26-visual-intelligence/ |

---

## 六、给路书升级的设计启示（15 条，可直接转成功能）

> 每条格式：**功能名**：做什么 → 依据或参考。日本公共交通的路线来源请先看第 4 条。

1. **"草稿聊天 → 定稿路书"两段式：** 聊天区是可随意改的"草稿画布"；点"定稿"后生成标准化结构（日期 / 站点 / 时间窗 / 交通段 / 备注 / 来源）。定稿后再改，用"差异预览"（新增、删除、移动一目了然）。→ 参考 Google 画布（Canvas）与问地图的行程徽章、Trip.Planner 的画布式编辑、Roadtrippers 的局部重生成（Remix）。
2. **定稿校验器（"可信度标签"）：** 定稿时自动把每个站点落到 Apple Place ID（必要时加 Google Place ID），核对营业时间和定休日、站点间移动时间、换乘余量、雨天风险，标出"已核实 / 有冲突 / 未核实"。→ 参考 NAVITIME AI 对话导入的地点库比对、高德避雷指南的 15 个维度；JTB 调查显示用户最担心"不准确"。
3. **万能灵感导入：** 支持截图、相册、链接（小红书、Instagram、YouTube）、ChatGPT 对话、预订邮件和 PDF 导入，先进"候选池"，用户确认后才进路书。→ 参考 Mindtrip 随处开始、Google 截图存地点、Tripsy 智能导入、NAVITIME AI 对话导入、Polarsteps 邮件转发。
4. **交通层分级（日本优先）：** 步行、驾车、骑行用 MapKit 在 App 内画线；公交只显示"估算时间 + 一键跳转"（Apple 地图 / Google 地图 / 换乘 App）。中期评估接入 NAVITIME API 或 Ekispert（駅すぱあと）API，拿到准确的时刻、票价和站台。→ 依据：MapKit 公交请求不可靠，Google 在日本的公交覆盖未核实。
5. **"今日路书"实时活动：** 锁屏和灵动岛显示下一站、到达时间、"最晚出发时间"、要坐的线路和站台。用 iOS 26 定时启动在当天早上自动开启；受 8 小时上限限制，按"上午 / 下午 / 晚上"分段续开；手表和 CarPlay 会自动同步显示。→ 参考 Flighty 的设计、TripIt 出发提醒（Go Now）、NAVITIME 锁屏停靠站；路书类竞品普遍没做。
6. **出发 / 末班车闹钟：** 用 AlarmKit 设"该出发了"和"末班车倒计时"闹钟，在静音模式下也能可靠响铃。→ 参考站探的换乘闹钟和末班车闹钟、AlarmKit。
7. **到站自动弹出站点卡：** 只用 CLMonitor 动态监控"接下来 N 个站点"（不超过 20 个条件的上限）。进入围栏时推送站点卡：原生地点详情、街景、我的备注、门票/预约凭证、推荐菜。→ 参考 MapKit 的 `mapItemDetailSheet`、LookAroundPreview。
8. **"此刻附近"问答：** 行中浮动按钮，默认带上"当前位置 + 下一站 + 剩余时间"作为上下文，回答"附近能充电的咖啡馆""去下一站路上顺便吃什么"，结果可一键插入路书。→ 参考 Google 问地图（日本已上线）、Gemini 沿途问答、Trip.Planner 的悬浮 AI 按钮。
9. **行中口述改计划：** 一句话"下午太累，把 X 挪到明天"，AI 生成改动方案，先预览差异，确认后才写入，不打断导航。→ 参考高德导航 Live。
10. **Siri / 快捷指令 / Spotlight 入口：** 把"站点、行程日、预订"暴露为 App Intents 实体，支持"下一站是哪""还要多久""把这家店加到明天"，配交互式片段。日语 Siri AI 已可用，简体中文暂不可用，需保留文字入口。→ 依据：WWDC25 交互式片段、WWDC26 Siri AI 接入 App 内容。
11. **拍照识别 → 匹配路书：** 接入视觉智能，对着店招或菜单拍照，返回路书中匹配的站点或候选地点。→ 依据：App Intents 的视觉智能接口（IntentValueQuery）、高德镜头识别讲解、马蜂窝的截图订餐厅。
12. **语音对话规划：** 用 SpeechAnalyzer 做端侧中文和日文转写（语言以官方列表为准）。规划这类长上下文任务交给云端模型（PCC 免费额度或第三方）；端侧 Foundation Models 只做抽取、改写、摘要等小任务（受 4096 token 限制）。→ 参考 Jorudan 口语检索、Tripsy 端侧智能洞察。
13. **生成"旅行手册"成品：** 一键生成可分享、可打印的手册：封面、日程表、集合点、持物清单、注意事项、二维码；支持 PDF、图片和链接分享，以及同行者共同编辑。→ 参考日本旅行手册文化、tabiori 便利店打印、NAVITIME 存图分享、Holiday 共同编辑、Layla 的 PDF。
14. **离线优先：** 行前自动缓存当日路书（站点卡、凭证、地图截图），提示用户在 Apple 地图下载离线区域。遵守 Google 条款，只长期保存 Place ID。→ 参考 Wanderlog 和 tabiori 的离线、Apple 离线地图、Google 缓存条款。
15. **主动追问 + 偏好记忆 + 多人合并：** 规划前用 3–5 个选择题追问（节奏、步行量、预算、必去），生成"旅行性格"标签并长期记住（如"少走路"）；同行者各自提需求，AI 合并成一个方案并标出冲突。→ 参考马蜂窝 AI 路书、Trip.Planner 的三个问题、Mindtrip 群聊。

> 补充（排在 15 条之外，优先级较低）：天气感知的备选方案（WeatherKit 判断下雨后推荐室内替代，参考 Trip.Planner、Layla 的宣称）；用 NFC 读取交通卡余额和乘车记录，生成行程花销（Core NFC + FeliCa）；行后用"已访问地点"式的自动记录加相册，生成回顾短片（参考 Polarsteps Trip Reel、Stippl Travel Reel，后台记录每天约耗电 4%）。

---

## 七、来源列表

### 国际

- [国际] Wanderlog AI 助手（Product Hunt）: https://www.producthunt.com/p/wanderlog/wanderlog-ai-travel-assistant
- [国际] Wanderlog App Store: https://apps.apple.com/us/app/wanderlog/id1476732439
- [国际] TripIt Pro + Apple Intelligence: https://www.tripit.com/web/blog/news-culture/automate-travel-plans-tripit-pro-apple-intelligence
- [国际] TripIt App Store: https://apps.apple.com/us/app/-/id311035142
- [国际] TripIt 出发提醒（Go Now）帮助页: https://help.tripit.com/en/support/solutions/articles/103000063349-go-now
- [国际] TripIt 出发提醒与交通选项公告: https://www.tripit.com/web/blog/news-culture/announcing-go-now-more-new-tripit-features
- [国际] TripIt 2025 假期出行（风险提醒）: https://www.tripit.com/web/blog/travel-tips/navigating-holiday-travel-2025
- [国际] TripIt 安检排队时间: https://www.tripit.com/web/blog/news-culture/security-wait-times
- [国际] TripIt 交互式小组件: https://tripit.com/web/blog/news-culture/tripit-widgets-ios
- [国际] Mindtrip 随处开始（TechCrunch）: https://techcrunch.com/2024/07/31/travel-startup-mindtrips-new-feature-lets-you-build-an-itinerary-from-a-screenshot-youtube-or-tiktok-video
- [国际] Mindtrip（Axios）: https://www.axios.com/2024/07/31/ai-trip-planner-travel-itinerary-mindtrip
- [国际] Mindtrip 随处开始新闻稿: https://prnewswire.com/news-releases/mindtrip-launches-start-anywhere-a-powerful-new-way-to-build-travel-itineraries-from-any-point-of-inspiration-302210025.html
- [国际] Mindtrip 群聊: https://globetrender.com/?p=71548
- [国际] Mindtrip 官网: https://mindtrip.ai/
- [国际] Mindtrip 移动 App（PhocusWire）: https://www.phocuswire.com/mindtrip-launches-mobile-app-ai-trip-planner
- [国际] Mindtrip 代理式订票（二手来源）: https://felloai.com/cs/best-travel-apps/
- [国际] AI 行程规划器对比 2026（Analytics Insight）: https://www.analyticsinsight.net/artificial-intelligence/best-ai-travel-planners-in-2026-features-prices-and-what-they-offer
- [国际] Layla App Store: https://apps.apple.com/app/id6447275100
- [国际] Layla 界面分析: https://screensdesign.com/showcase/layla-ai-trip-planner
- [国际] Pilot vs Layla（竞品对比）: https://www.pilotplans.com/compare/layla-ai-alternative-feature-comparison
- [国际] Stippl AI 规划器: https://apps.stippl.io/ai-travel-planner
- [国际] Stippl 博客: https://go.stippl.io/blog/unlock-effortless-travel-planning-with-stippl-s-travel-ai-features
- [国际] Stippl 第三方汇总: https://freedom251.com/apps/stippl/
- [国际] Pilot vs Stippl（竞品对比）: https://www.pilotplans.com/compare/stippl-alternative-feature-comparison
- [国际] Polarsteps 2026 夏季版: https://www.polarsteps.com/news/polarsteps-launches-summer-2026-release-new-tools-for-planning-privacy-and-sharing
- [国际] Polarsteps 2025 规划更新: https://news.polarsteps.com/releases/planning-update-2025
- [国际] Polarsteps 2025 夏季版: https://www.polarsteps.com/news/polarsteps-summer-2025-release-is-here
- [国际] Polarsteps 轨迹记录原理: https://support.polarsteps.com/article/80-how-does-the-travel-tracker-work-does-it-use-gps
- [国际] Polarsteps 耗电: https://support.polarsteps.com/article/81-will-my-battery-survive-the-day
- [国际] Polarsteps 离线: https://support.polarsteps.com/article/115-does-polarsteps-work-offline
- [国际] Polarsteps Plus: https://www.polarsteps.com/stories/introducing-polarsteps-plus
- [国际] Roadtrippers Autopilot 发布: https://roadtrippers.com/media-center/new-ai-trip-planner-autopilot/
- [国际] Roadtrippers Remix: https://www.newswire.com/news/roadtrippers-supercharges-autopilot-tm-the-ai-trip-planner-you-loved-22560717
- [国际] Roadtrippers 更新: https://www.newswire.com/news/roadtrippers-unveils-updates-to-its-1-trip-planning-app-enhancing-the-22481162
- [国际] Roadtrippers Autopilot 页面: https://roadtrippers.com/autopilot
- [国际] Tripadvisor AI 助手: https://www.tripadvisor.com/AIAssistant
- [国际] Tripadvisor 视频转行程原型: https://www.altexsoft.com/travel-industry-news/tripadvisor-debuts-ai-planner-for-video-based-trips/
- [国际] Tripadvisor 2026-04 AI 战略: https://tripadvisor.mediaroom.com/2026-04-23-How-AI-Is-Changing-the-Way-We-Plan-Travel?asPDF=1
- [国际] Tripadvisor 2023 Trips: https://www.hospitalitynet.org/news/4117380/tripadvisor-launches-ai-powered-travel-planning-product
- [国际] Google 地图 Gemini 导航（TechCrunch）: https://techcrunch.com/2025/11/05/google-maps-bakes-in-gemini-to-improve-navigation-and-hands-free-use
- [国际] Google 地图 Gemini 导航（Google）: https://blog.google/products/maps/gemini-navigation-features-landmark-lens/
- [国际] 问地图上线（MacRumors）: https://www.macrumors.com/2026/03/12/google-maps-gemini-integration/
- [国际] 问地图行程规划（Google）: https://blog.google/products-and-platforms/products/maps/ask-maps-holiday-travel-features-2026/
- [国际] 问地图行程规划（Digital Trends）: https://digitaltrends.com/phones/google-maps-can-now-organize-multi-day-trips-and-call-businesses-to-check-appointments
- [国际] AI 模式画布旅行规划（Google）: https://blog.google/products/search/agentic-plans-booking-travel-canvas-ai-mode/
- [国际] AI 模式画布（Android Authority）: https://www.androidauthority.com/google-ai-mode-travel-planning-canvas-3616391
- [国际] Google 截图存地点帮助页: https://support.google.com/maps/answer/16278054
- [国际] Google 截图存地点（MacRumors）: https://www.macrumors.com/2025/05/08/google-maps-scan-screenshots-for-places/
- [国际] Google 地图 iOS 实时活动: https://9to5google.com/2024/07/17/google-maps-live-activities-iphone/
- [国际] Apple 地图 iOS 26 指南: https://www.macrumors.com/guide/ios-26-maps/
- [国际] iOS 26 实时活动改进: https://9to5mac.com/2025/12/04/ios-26-made-live-activities-even-better-on-iphone-heres-whats-new/
- [国际] iOS 26 登机牌实时活动: https://tech.yahoo.com/ai/apple-intelligence/articles/ios-26-enhanced-boarding-passes-115008609.html
- [国际] Apple 地图 iOS 27 十项新功能: https://www.macrumors.com/2026/06/11/apple-maps-to-get-these-10-new-features-in-ios-27/
- [国际] Apple 地图 iOS 27 指南: https://www.macrumors.com/guide/ios-27-maps/
- [国际] Apple 地图 iOS 27（Cult of Mac）: https://www.cultofmac.com/news/every-notable-apple-maps-upgrade-in-ios-27
- [国际] 推荐地点（9to5Mac）: https://9to5mac.com/2026/07/29/apple-maps-in-ios-27-makes-my-favorite-recent-feature-even-better/
- [国际] Apple 离线地图支持页: https://support.apple.com/en-us/HT213829
- [国际] Apple 离线地图操作（MacRumors）: https://www.macrumors.com/how-to/download-offline-maps-ios-apple-maps/
- [国际] Apple 地图东京实时公交: https://www.macrumors.com/2024/08/07/apple-maps-real-time-transit-info-tokyo/
- [国际] Tripsy 3.10（9to5Mac）: https://9to5mac.com/2026/09/16/tripsys-ios-27-update-includes-smarter-imports-on-device-ai-insights-more/
- [国际] Tripsy 3.10（iThinkDifferent）: https://www.ithinkdiff.com/tripsy-3-10-smart-import-ai-insights/
- [国际] Tripsy 2025-05 更新: https://alternativeto.net/news/2025/5/tripsy-adds-apple-intelligence-chatgpt-travel-planning-and-shortcuts-automation
- [国际] Flighty 灵动岛专题（Apple）: https://developer.apple.com/news/?id=mis6swzt
- [国际] Flighty 获设计奖: https://www.traveldailynews.com/technology/flighty-wins-apple-design-award/
- [国际] Trip.com 行程规划器（Skift）: https://skift.com/2025/08/28/trip-com-groups-ai-shrinks-planning-work-answer-three-questions-get-a-bookable-trip/
- [国际] Trip.com 行程规划器（AltexSoft）: https://www.altexsoft.com/travel-industry-news/trip-com-launches-ai-trip-planner-for-custom-itineraries/
- [国际] Boop: https://techcrunch.com/2025/11/18/boops-new-app-turns-social-recommendations-into-bookable-itineraries
- [国际] Airial: https://techcrunch.com/2025/06/30/former-meta-engineers-airial-travel-tool-helps-travelers-solve-logistics-planning-with-ai
- [国际] TripGenie 三周年（Travolution）: https://www.travolution.com/news/trip.com-sets-out-three-years-of-contrasting-ai-use-in-travel/
- [国际] TripGenie 案例（Google Cloud）: https://cloud.google.com/customers/intl/zh-cn/tripgenie
- [国际] MapKit 地点 ID（WWDC24）: https://developer.apple.com/videos/play/wwdc2024/10097/
- [国际] 地点 ID 获取讨论（Apple 论坛）: https://developer.apple.com/forums/thread/770291
- [国际] MapKit WWDC25: https://developer.apple.com/videos/play/wwdc2025/204
- [国际] MapKit for SwiftUI 文档: https://developer.apple.com/tutorials/data/documentation/mapkit/mapkit-for-swiftui.md
- [国际] LookAroundPreview 文档: https://developer.apple.com/documentation/mapkit/lookaroundpreview.md
- [国际] MKLookAroundSceneRequest 文档: https://developer.apple.com/documentation/mapkit/mklookaroundscenerequest.md
- [国际] 附近 POI 交互教程: https://developer.apple.com/tutorials/data/documentation/mapkit/interacting-with-nearby-points-of-interest.md
- [国际] MapKit 更新记录: https://developer.apple.com/documentation/updates/mapkit.md
- [国际] 反向地理编码讨论（Apple 论坛）: https://developer.apple.com/forums/thread/795687
- [国际] transit 不可用讨论（Apple 论坛）: https://developer.apple.com/forums/thread/766568
- [国际] 公交路线讨论（Apple 论坛）: https://developer.apple.com/forums/thread/833669
- [国际] 地图启动方向模式文档: https://developer.apple.com/documentation/mapkit/directions-mode-values.md
- [国际] Google Routes 公交路线: https://developers.google.com/maps/documentation/routes/transit-route?hl=ja
- [国际] Google Routes 覆盖范围: https://developers.google.com/maps/documentation/routes/coverage
- [国际] 日本 Directions transit 返回 ZERO_RESULTS（开发者论坛）: https://discuss.google.dev/t/directions-api-transit-mode-returns-zero-results/378267
- [国际] Google 2025-03 计费变更: https://developers.google.com/maps/billing-and-pricing/march-2025
- [国际] Google AI 地点摘要: https://developers.google.com/maps/documentation/places/web-service/place-summaries
- [国际] Google AI 评价摘要: https://developers.google.com/maps/documentation/places/web-service/review-summaries
- [国际] Google 服务专属条款: https://cloud.google.com/maps-platform/terms/maps-service-terms
- [国际] Google Maps JS 政策: https://developers.google.com/maps/documentation/javascript/policies
- [国际] 地图事实依据文档: https://ai.google.dev/gemini-api/docs/maps-grounding
- [国际] 地图事实依据正式可用: https://developers.googleblog.com/en/your-ai-is-now-a-local-expert-grounding-with-google-maps-is-now-ga/
- [国际] MapKit JS 价格: https://developer.apple.com/maps/mapkitjs/pricing
- [国际] MapKit JS 额度讨论（Apple 论坛）: https://developer.apple.com/forums/thread/818109
- [国际] 实时活动文档: https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities.md
- [国际] 实时活动时长（Apple 论坛）: https://developer.apple.com/forums/thread/797676
- [国际] 实时活动定时启动 API: https://developer.apple.com/documentation/activitykit/activity/request(attributes:content:pushtype:style:alertconfiguration:start:).md
- [国际] 实时活动上 Apple Watch（WWDC24）: https://developer.apple.com/wwdc24/10068
- [国际] AlarmKit（WWDC25）: https://developer.apple.com/wwdc25/230
- [国际] AlarmKit 延迟讨论（Apple 论坛）: https://developer.apple.com/forums/thread/825427
- [国际] App Intents（WWDC25 275）: https://developer.apple.com/videos/play/wwdc2025/275
- [国际] App Intents 设计（WWDC25 281）: https://developer.apple.com/videos/play/wwdc2025/281
- [国际] App Intents 视觉智能文档: https://developer.apple.com/documentation/appintents/visual-intelligence.md
- [国际] Siri AI 与 App Intents（WWDC26 240）: https://developer.apple.com/videos/play/wwdc2026/240
- [国际] iOS 27.3 Siri AI（Macworld）: https://macworld.com/article/3276244/with-ios-27-3-the-siri-ai-floodgates-are-about-to-open.html
- [国际] Siri AI 新增语言（Apple 新闻稿）: https://www.apple.com/newsroom/2026/10/siri-ai-is-available-in-more-languages-starting-today/
- [国际] Siri AI 语言扩展（9to5Mac）: https://9to5mac.com/2026/11/03/ios-27-3-expands-siri-ai-to-these-new-languages/
- [国际] Apple Intelligence 语言（Apple 新闻稿）: https://www.apple.com/ie/newsroom/2025/09/apple-today-released-new-apple-intelligence-features/
- [国际] iOS 26.1 新语言: https://9to5mac.com/2025/11/11/ios-26-1-brings-apple-intelligence-to-these-eight-new-languages/
- [国际] Foundation Models 上下文窗口: https://developer.apple.com/documentation/foundationmodels/managing-the-context-window.md
- [国际] TN3193 上下文窗口技术说明: https://developer.apple.com/tutorials/data/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window.md
- [国际] Foundation Models 上下文（InfoQ）: https://infoq.com/news/2026/03/apple-foundation-models-context
- [国际] Foundation Models（WWDC26 241）: https://developer.apple.com/videos/play/wwdc2026/241
- [国际] WWDC26 机器学习指南: https://developer.apple.com/wwdc26/guides/machine-learning/
- [国际] SpeechAnalyzer（WWDC25 277）: https://developer.apple.com/videos/play/wwdc2025/277/
- [国际] SpeechAnalyzer 第三方评测: https://blog.addpipe.com/apple-speechanalyzer-api/
- [国际] CLMonitor 20 条件上限（Apple 论坛）: https://developer.apple.com/forums/thread/769113
- [国际] CLMonitor 事件频率（Apple 论坛）: https://developer.apple.com/forums/thread/806783
- [国际] WeatherKit 入门: https://developer.apple.com/weatherkit/get-started/
- [国际] iOS 26 视觉智能: https://www.macrumors.com/guide/ios-26-visual-intelligence/

### 日本

- [日本] Google 地图"问地图"日本上线（Google 日本）: https://blog.google/intl/ja-jp/products/connect-communicate/japanese-ask-maps/
- [日本] Google 地图"问地图"日本上线（Impress Watch）: https://www.watch.impress.co.jp/docs/news/2131621.html
- [日本] NAVITIME AI 对话导入（Travel Voice）: https://www.travelvoice.jp/20260916-160522
- [日本] NAVITIME AI 对话导入（DX Magazine）: https://dxmagazine.jp/news/2653ota09/
- [日本] NAVITIME Travel AI（2024-03）: https://www.travelvoice.jp/20240329-155386
- [日本] NAVITIME 聊天式咨询（2024-11）: https://www.travelvoice.jp/20241129-156738
- [日本] NAVITIME AI 计划（2025-02）: https://www.travelvoice.jp/20250228-157255
- [日本] NAVITIME AI 计划（AppBank）: https://www.appbank.net/2025/03/02/iphone-application/2759736.php
- [日本] NAVITIME 面向自治体/DMO 的生成式 AI 导览: https://www.travelvoice.jp/20260206-159216
- [日本] NAVITIME Travel App Store: https://apps.apple.com/app/id1279724919
- [日本] NAVITIME Travel（app-liv）: https://app-liv.jp/4586200/
- [日本] NAVITIME 锁屏停靠站提示（AppBank）: https://www.appbank.net/?p=2795391
- [日本] Japan Travel by NAVITIME AI 计划（Travel Voice 英文版）: https://travelvoice.jp/english/navitime-japan-a-leading-navigation-app-provider-adds-an-ai-based-travel-planning-function-on-the-navigation-website-for-inbound-travelers
- [日本] Japan Travel by NAVITIME App Store: https://apps.apple.com/CA/app/id686373726
- [日本] Jorudan AI 语音输入: https://kyodonewsprwire.jp/release/202406071931
- [日本] Jorudan 西新宿模式: https://kyodonewsprwire.jp/release/202503045089
- [日本] Jorudan 多语言多模态路线检索: https://kyodonewsprwire.jp/release/202608033593
- [日本] Yahoo!换乘案内 共享单车（DIME）: https://dime.jp/genre/2148921/
- [日本] Yahoo!换乘案内 拥挤度（图片页）: https://k-tai.watch.impress.co.jp/img/ktw/docs/2057/769/html/main_o.png.html
- [日本] 站探换乘案内 App Store: https://apps.apple.com/jp/app/id524306589
- [日本] 换乘MAP导航 App Store: https://apps.apple.com/jp/app/%E4%B9%97%E6%8F%9Bmap%E3%83%8A%E3%83%93-%E5%85%A8%E5%9B%BD%E3%81%AE%E5%85%AC%E5%85%B1%E4%BA%A4%E9%80%9A%E6%83%85%E5%A0%B1%E3%82%92%E7%B6%B2%E7%BE%85%E3%81%97%E3%81%9F%E7%B7%8F%E5%90%88%E3%83%8A%E3%83%93%E3%82%A2%E3%83%97%E3%83%AA/id1050153420
- [日本] Holiday App Store: https://apps.apple.com/jp/app/id962231929
- [日本] Holiday（app-liv）: https://app-liv.jp/2131560/
- [日本] tabiori App Store: https://apps.apple.com/JP/app/id1193502519
- [日本] tabiori（app-liv）: https://app-liv.jp/4270295/
- [日本] NEWT 旅行规划器（ASCII）: https://ascii.jp/elem/000/004/363/4363410/
- [日本] NEWT MCP: https://www.tv-tokyo.co.jp/plus/external-pr/entry/139391.html
- [日本] NEWT Chat（Wantedly）: https://www.wantedly.com/companies/reiwatravel/post_articles/1026440
- [日本] 乐天 Rakuten AI 预订（Web担当者Forum）: https://webtan.impress.co.jp/n/2026/05/01/52592
- [日本] 乐天 Rakuten AI（ネットショップ担当者フォーラム）: https://netshop.impress.co.jp/n/2026/05/07/16020
- [日本] Jalan AI 聊天（个人开发者文章，Zenn）: https://zenn.dev/microcms/articles/b4f571a8c916bf
- [日本] Jalan 生成式 AI 实证实验（訪日ラボ）: https://honichi.com/news/2025/02/28/jalan_ai
- [日本] Rurubu + AI 聊天: https://www.travelvoice.jp/20250218-157158
- [日本] JTB 综研 AI 旅行调查 2025: https://www.travelvoice.jp/20250822-158242
- [日本] JTB 综研手机使用调查 2025: https://www.travelvoice.jp/20260127-159031
- [日本] co-Trip（app-liv）: https://app-liv.jp/2139000/
- [日本] 旅行手册类 App 推荐（Nicody 等，app-liv）: https://app-liv.jp/5342149/
- [日本] Tripia App Store: https://apps.apple.com/jp/app/id6741425738
- [日本] AVA Travel App Store: https://apps.apple.com/jp/app/id6470335943
- [日本] 旅行手册的定义（travelist）: https://travelist.jp/column/?p=2213
- [日本] 修学旅行的历史（HIS）: https://www.his-j.com/corp/column/educationaltrip_02/
- [日本] 札幌农学校修学旅行（北海道大学资料）: https://150th.hokudai.ac.jp/wp/wp-content/uploads/2026/04/SCENE6_Vol.58.pdf
- [日本] 上越市修学旅行资料: https://www.city.joetsu.niigata.jp/uploaded/attachment/268177.pdf
- [日本] NAVITIME 路线 API（RapidAPI）: https://rapidapi.com/navitimejapan-navitimejapan/api/navitime-route-totalnavi
- [日本] NAVITIME API 开发者信息: https://api-sdk.navitime.co.jp/information
- [日本] Ekispert（駅すぱあと）API 改名（BCN）: https://www.bcnretail.com/market/detail/20240226_404198.html
- [日本] Ekispert（駅すぱあと）API 免费计划（Qiita）: https://qiita.com/chocode/items/01e3d9762112dcdc598c
- [日本] Jorudan 乗換案内Biz 合作报价: https://kyodonewsprwire.jp/release/201607212683
- [日本] Jorudan 乗換案内Biz API 资料: https://jorudan.co.jp/company/data/pdf_pr/20131119_biz.pdf
- [日本] ODPT 开放数据（东京都交通局）: https://www.kotsu.metro.tokyo.jp/pickup_information/news/subway/2019/sub_p_201905318600_h.html
- [日本] Siri AI 日语版上线（gori.me）: https://gori.me/?p=171770
- [日本] IC 卡读取 App（App Store）: https://apps.apple.com/jp/app/id1478703111
- [日本] IC 卡读取 iOS 版发布（Impress Watch）: https://www.watch.impress.co.jp/docs/news/1208468.html

### 中文

- [中文] 高德地图 2026 发布（凤凰网）: https://i.ifeng.com/c/8wVwE2CJtMI
- [中文] 高德导航 Live（unwire.hk）: https://unwire.hk/2026/09/18/amapnavigationlive2026/ai/
- [中文] 高德避雷指南（品玩）: https://www.pingwest.com/w/317481
- [中文] 高德自定义路线（IT之家）: https://www.ithome.com/0/570/908.htm
- [中文] 携程问道（界面）: https://www.jiemian.com/article/13209951.html
- [中文] 携程 App Store（Apple Watch 功能）: https://apps.apple.com/us/app/-/id688037240
- [中文] 马蜂窝 AI 路书（凤凰网）: https://tech.ifeng.com/c/8ku3FD2ELtD
- [中文] 马蜂窝 AI 路书（AIbase）: https://www.aibase.com/zh/news/19633
- [中文] 马蜂窝 AI 路书（DoNews）: https://www.donews.com/news/detail/1/5850503.html
- [中文] 路敢敢（原识途）App Store: https://apps.apple.com/cn/app/%E8%AF%86%E9%80%94-%E6%97%85%E8%A1%8C%E5%9C%B0%E5%9B%BE-%E4%B8%80%E7%AB%99%E5%BC%8F%E6%99%BA%E8%83%BD%E6%97%85%E6%B8%B8%E8%A7%84%E5%88%92%E5%B7%A5%E5%85%B7/id6739447521
- [中文] 小红书路书计划（B站专栏）: https://www.bilibili.com/read/cv43776572
- [中文] 飞猪问一问、飞猪帮帮（潮新闻）: https://tidenews.com.cn/news.html?id=3531067
- [中文] 飞猪问一问评测（人人都是产品经理）: https://www.woshipm.com/ai/6207978.html
