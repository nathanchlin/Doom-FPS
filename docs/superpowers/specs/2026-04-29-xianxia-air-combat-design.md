# XianxiaAirCombat — 3D 修仙空战游戏设计文档

> **日期：** 2026-04-29
> **状态：** 设计确认，待实现
> **基础框架：** Fork Doom-FPS (Three.js + TypeScript + Vite)

---

## 概述

基于 Doom-FPS 框架的 3D 修仙空战游戏。玩家驾驶飞剑在浮空仙宫之间进行 6 自由度飞行战斗，使用高达式武器系统（灵力射线、符箓追踪弹、飞剑近战）对抗妖兽和敌修仙者。关卡制推进，每3关一个 Boss。

### 核心卖点

- 完全 6DOF 物理飞行（惯性、推力、阻力）
- 混合视角（第三人称飞行 + 第一人称战斗）
- 高达式武器系统，修仙题材包装
- 浮空建筑群场景，垂直层次丰富
- 关卡制 + Boss 战 + 武器解锁

---

## 设计决策记录

| 维度 | 选择 | 理由 |
|------|------|------|
| 相机 | 混合视角（第三人称探索 + 第一人称战斗） | 兼具飞行姿态展示和精确瞄准 |
| 飞行控制 | 完全 6DOF 物理模拟 | 最真实的6轴飞行体验 |
| 攻击系统 | 高达式武器（灵力射线/符箓追踪弹/飞剑近战） | 系统成熟可参考，攻击方式丰富 |
| 场景 | 浮空建筑群（仙宫、浮岛、桥梁） | 垂直层次关卡设计，适合6轴飞行 |
| 核心循环 | 关卡制（逐关推进、Boss、解锁） | 经典街机模式，目标明确 |
| 敌人 | 混合（妖兽为主 + Boss 敌修仙者） | 小怪多样性 + Boss 对抗感 |
| 架构 | Fork Doom-FPS + 大幅改造 | 开发最快，框架已验证 |

---

## 项目结构

```
src/
├── main.ts              # 入口：启动游戏、HMR 清理、触控检测
├── config.ts            # 所有可调参数（飞行、武器、敌人、关卡）
├── Game.ts              # 顶层编排：关卡流程、状态机
│
├── core/                # 引擎层（从 Doom-FPS 保留+扩展）
│   ├── Engine.ts        # Three.js 渲染循环
│   ├── Input.ts         # 键鼠+触控输入（扩展虚拟轴和翻滚键）
│   ├── Sfx.ts           # Web Audio 音效合成
│   └── CameraSystem.ts  # 双相机系统（第三人称↔第一人称切换+过渡）
│
├── player/              # 玩家系统（大幅重写）
│   ├── FlightController.ts  # 6DOF 物理飞行
│   ├── PlayerModel.ts       # 第三人称角色模型（飞行姿态动画）
│   └── WeaponSystem.ts      # 高达式武器（灵力射线/符箓追踪弹/飞剑近战）
│
├── enemy/               # 敌人系统（重写为空战AI）
│   ├── Enemy.ts         # 空战 AI 基类（行为树）
│   ├── enemy-types.ts   # 敌人类型定义
│   └── Boss.ts          # Boss 敌人（多阶段）
│
├── world/               # 关卡与场景（全新）
│   ├── Arena.ts         # 浮空建筑群生成
│   ├── Skybox.ts        # 天空盒/大气效果
│   └── Pickup.ts        # 补给品
│
├── ui/                  # HUD（DOM-based 飞行仪表盘）
│   └── Hud.ts           # 高度计、速度表、武器状态、准星、雷达
│
└── shared/              # 工具
    └── collision.ts     # 碰撞数学（扩展3D球体碰撞）
```

### 每帧更新顺序

```
FlightController.update → CameraSystem.update → WeaponSystem.update →
Enemy.update ×N → Boss.update → Arena.update → Hud.refresh → renderer.render
```

### 子系统依赖关系

```
Game
 ├── Engine (渲染循环)
 ├── Input (输入)
 ├── CameraSystem → Engine.camera
 ├── FlightController → Input, CameraSystem, Arena(碰撞)
 ├── PlayerModel → FlightController, CameraSystem
 ├── WeaponSystem → FlightController, Input, Enemy[](目标检测)
 ├── Enemy[] → FlightController(追踪目标), Arena(碰撞规避)
 ├── Boss → 同 Enemy + 多阶段状态
 ├── Arena → Engine.scene
 ├── Hud → FlightController(速度/高度), WeaponSystem(弹药)
 └── Sfx → 各系统触发音效
```

### Doom-FPS 复用清单

**直接保留：** Engine.ts 渲染循环、Input.ts 输入基础、Sfx.ts 音效合成、HUD DOM 框架、shared/collision.ts、构建配置（Vite + TS）

**重写：** Player.ts → FlightController.ts、Weapon.ts → WeaponSystem.ts、Enemy.ts → 空战AI、Level.ts → Arena.ts、Game.ts 关卡流程

**删除：** Maze.ts、Room.ts、Door.ts、Chest.ts、CardPicker.ts、Hazard.ts、weapons.ts（单一武器定义）、multiplayer 相关全部

---

## FlightController — 6DOF 飞行控制器

### 物理模型

```
每帧更新：
1. 收集输入 → 计算 6 个推力分量（前/后/左/右/上/下）+ 3 个旋转推力（偏航/俯仰/翻滚）
2. 推力 × 推力系数 = 加速度（局部坐标系）
3. 加速度转换到世界坐标系
4. 速度 += 加速度 × dt
5. 速度 × (1 - 阻力 × dt) = 衰减后速度
6. 位置 += 速度 × dt
7. 角速度同理：角推力 → 角加速度 → 角速度 → 旋转
8. 碰撞检测：与浮空建筑 AABB 的球体碰撞
```

### 输入映射

| 输入 | 动作 |
|------|------|
| W / S | 前进/后退推力（沿角色朝向） |
| A / D | 左右平移推力 |
| Space | 上升推力 |
| Shift | 下降推力 |
| 鼠标 X | 偏航角推力 |
| 鼠标 Y | 俯仰角推力 |
| Q / E | 翻滚角推力 |

### 关键参数

```typescript
flight: {
  maxThrust: 80,          // 最大推力 (N)
  maxSpeed: 120,          // 最大速度 (m/s)
  drag: 0.98,             // 每帧速度衰减系数
  angularThrust: 3.0,     // 角推力 (rad/s²)
  maxAngularSpeed: 2.5,   // 最大角速度 (rad/s)
  angularDrag: 0.92,      // 角速度衰减
  boostMultiplier: 2.0,   // 加力倍率
  boostDuration: 3.0,     // 加力持续 (秒)
  boostCooldown: 5.0,     // 加力冷却 (秒)
}
```

### 碰撞处理

- 3D 球体 vs AABB（玩家半径 0.8m）
- 碰撞时沿穿透法线推出，弹性系数 0.3

### 高度限制

- 最低高度：建筑群底部下方 50m（自动拉回）
- 最高高度：建筑群顶部上方 200m（逐渐增大阻力）
- 水平：圆形边界，半径 500m，阻力墙

---

## CameraSystem — 双相机系统

### 第三人称追尾（默认）

- 相机在角色后上方（后8m，上3m）
- 弹簧阻尼跟随（spring-damper），转弯有延迟感
- 鼠标可小范围环视，不影响飞行方向
- 翻滚时相机跟随倾斜

### 第一人称（战斗）

- 相机 = 角色眼睛位置
- 鼠标直接控制偏航+俯仰，无延迟
- 准星固定屏幕中心
- 武器模型渲染在右下角

### 切换机制

- 按 V 键切换
- 0.4秒 ease-in-out 平滑插值过渡
- 过渡期间禁用输入

### 第三人称角色模型

- 程序化人形 + 飞剑脚底特效
- 飞行姿态动态调整：前进前倾、转弯侧倾、翻滚整体旋转
- 加力时尾部拖尾粒子
- 第一人称时隐藏

### 雷达小地图

- 右下角圆形，范围 200m
- 红点=敌人，蓝点=补给，绿框=目标

---

## WeaponSystem — 高达式武器系统

### 灵力射线 (Spirit Beam) — 主武器

- 类型：hitscan（Raycaster 瞬间命中）
- 伤害：25/发
- 射速：0.12s/发
- 射程：150m
- 消耗：灵力 3/发（灵力不足时射速降低）
- 视觉：白蓝色射线 + 命中粒子爆发

### 符箓追踪弹 (Talisman Missile) — 重武器

- 类型：追踪弹道（自动追踪锁定目标）
- 伤害：45 + AOE（半径3m）
- 射速：0.5s/发，最多4发同时在飞
- 射程：200m，追踪5秒
- 弹药：独立计数，每关初始8发
- 锁定：准星对准敌人（角度偏差<5°）持续1秒自动锁定（准星变红）
- 视觉：黄色符纸弹体 + 拖尾 + 爆炸火球

### 飞剑近战 (Flying Sword Strike) — 近战

- 类型：冲刺近战（高速冲刺15m，碰到即伤）
- 伤害：80
- 冲刺：0.2秒完成，冲刺距离15m
- 冷却：2秒
- 冲刺期间0.3秒无敌帧
- 消耗：灵力 15/次
- 视觉：剑光冲刺 + 轨迹残影

### 灵力系统

```typescript
spirit: {
  maxSpirit: 100,
  regenRate: 5,        // 每秒恢复
  beamCost: 3,
  dashCost: 15,
}
```

---

## Enemy — 敌人系统

### 空战 AI 行为树（优先级）

```
1. 濒死回避 — HP<20% 远离玩家
2. 碰撞规避 — 前方障碍紧急转向
3. 攻击执行 — 范围内且冷却完毕
4. 追踪接近 — 向玩家占位机动
5. 巡逻 — 无目标随机巡航
```

### 妖兽类型

| 类型 | HP | 速度 | 攻击 | 特点 |
|------|-----|------|------|------|
| 灵鸦 | 30 | 25 m/s | 火球 10dmg | 群体3-5只，编队 |
| 岩蟒 | 120 | 15 m/s | 吐息 25dmg 锥形AOE | 慢硬，绕建筑伏击 |
| 蛟龙 | 300 | 40 m/s | 龙息 35dmg + 撞击 50dmg | 高速俯冲 |

- 缩放：HP +15%/关，伤害 +10%/关

### Boss：敌修仙者（每3关）

- **阶段1 (100%-60%)**：御剑对射，偶尔闪避追踪弹
- **阶段2 (60%-30%)**：AOE法术 + 召唤2只灵鸦，速度+50%
- **阶段3 (30%-0%)**：暴走模式，连续冲刺，灵力护盾，速度+30%

Boss 击杀掉落武器升级/解锁。

---

## Arena — 浮空战场

### 生成算法

1. 泊松圆盘采样放置建筑锚点（保证最小间距）
2. 每个锚点生成浮空建筑（随机尺寸 + 屋檐 + 底部岩石）
3. 部分建筑间生成桥梁（灵力光带）
4. 散布小型浮岛（补给点）
5. 生成 AABB 碰撞体

### 视觉风格

- 白色主体 + 金色线框（区别于 Doom-FPS 的黑色线框）
- 浮岛底部蓝紫色雾气粒子
- 桥梁发光灵力光带
- 程序化云海（半透明平面 + 噪声动画）
- 渐变天空穹顶，每关不同色调

### 关卡配置

前3关手动配置示例，后续关卡（关4-12）按 scaling 参数自动递增建筑数量和场地大小：

```typescript
arena: {
  levelConfigs: [
    { buildings: 8,  bridges: 3,  islands: 5,  spread: 200, skyTint: '#0a0a3e' },  // 关1
    { buildings: 12, bridges: 5,  islands: 8,  spread: 300, skyTint: '#1a0a2e' },  // 关2
    { buildings: 15, bridges: 6,  islands: 10, spread: 400, skyTint: '#2a1a1e' },  // 关3 (Boss)
    // 关4-12 按 arenaScaling 自动生成：
    // buildings += buildingsPerLevel(2), spread += spreadPerLevel(30)
    // skyTint 在4种预设色调间循环
  ],
  skyTintPresets: ['#0a0a3e', '#1a0a2e', '#2a1a1e', '#0a1a2e'],
  buildingMinGap: 20,
  heightRange: [30, 120],
  islandRadius: [1, 3],
}
```

### 大气效果

- 云海层（高度0m，遮挡地面）
- FogExp2 密度 0.008
- 灵气粒子（缓慢上升光点）+ 战斗碎片粒子
- 环境光（淡蓝）+ 月光方向光 + 建筑顶部暖黄点光源

### 补给品

- 灵力球（蓝色）+30 灵力
- 生命丹（绿色）+25 HP
- 符箓箱（黄色）+2 追踪弹
- 出现在浮岛/建筑顶部，每波结束刷新

---

## Hud — 飞行仪表盘

### 布局

```
顶部：关卡名 / 波次 / 敌人数
中心：准星（锁定时变红缩圈）
左下：武器状态（名称 + 弹药/冷却）
右下：圆形雷达（敌人/补给/目标）
底部：血条（红）+ 灵力条（蓝）+ 高度 + 速度 + 加力条
3D空间：浮动伤害数字
```

### 反馈效果

- 受伤：全屏红色渐晕
- 命中：准星白闪
- 击杀：击杀计数，连杀文字
- Boss 阶段转换：全屏金光 + 提示文字

---

## Game — 游戏流程

### 状态机

```
menu → briefing → playing ⇄ paused → level_complete → playing...
                                      → dead → retry
                                               → game_over（通关）
```

### 关卡流程

1. Briefing（关卡信息，1.5秒）
2. 生成浮空战场
3. 玩家出生在中央浮岛上方
4. 3波敌人循环（刷新→消灭→5秒休整）
5. 第3波 = Boss 波（Boss关）
6. 关卡完成 → S/A/B/C 评价 → 解锁奖励 → 下一关

### 解锁系统

| 关卡 | 解锁 |
|------|------|
| 关3 Boss | 符箓追踪弹 |
| 关6 Boss | 追踪弹升级（锁定2目标） |
| 关9 Boss | 灵力射线升级（穿透） |
| 关12 Boss | 飞剑升级（距离×2，伤害+50%） |

共 **12关**，4个 Boss。

### 难度递进

```typescript
progression: {
  totalLevels: 12,
  bossLevels: [3, 6, 9, 12],
  scaling: {
    hpPerLevel: 1.15,
    damagePerLevel: 1.10,
    enemyCountBase: 3,
    enemyCountPerLevel: 0.5,
    speedPerLevel: 1.03,
  },
  arenaScaling: {
    buildingsPerLevel: 2,
    spreadPerLevel: 30,
  }
}
```

---

## Sfx — 音效设计

| 音效 | 合成方式 |
|------|----------|
| 灵力射线 | 高频锯齿波 + 快速衰减 |
| 追踪弹发射 | 低频脉冲 + 上升音调 |
| 追踪弹爆炸 | 白噪声 + 低通滤波衰减 |
| 飞剑冲刺 | 快速上升频率扫频 |
| 妖兽嘶叫 | 方波 + 颤音调制 |
| Boss阶段转换 | 低频轰鸣 + 混响 |
| 加力启动 | 低频+谐波引擎声 |
