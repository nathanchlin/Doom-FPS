# DOOM · FPS · Three.js

一个用 **Three.js + TypeScript + Vite** 搭建的**现代 3D Doom 风第一人称射击小 Demo**。零外部资源文件(几何体 + 过程式材质 + 程序合成音效),即装即跑。

## 快速开始

```bash
pnpm install
pnpm dev        # 打开 http://localhost:5173 (被占用时自动 5174)
```

打开页面 → 点 **"CLICK TO PLAY"** → 鼠标被锁定,开始玩。按 **ESC** 解锁鼠标。

生产构建:

```bash
pnpm build      # 产物在 dist/
pnpm preview
```

类型检查:

```bash
pnpm typecheck
```

环境要求:**Node 18+**(开发用 Node 22 / pnpm 10)。

## 操作

| 按键 | 行为 |
|---|---|
| WASD | 前后左右移动 |
| MOUSE | 视角(PointerLock) |
| LMB(鼠标左键) | 射击 |
| SPACE | 跳跃 |
| SHIFT | 冲刺 |
| R | 补弹(游戏中) / 重开(死亡或胜利) |
| ESC | 退出鼠标锁定 |

## 玩法

- 一张正方形竞技场关卡,散布 6 只红色恶魔(可在 `src/config.ts` 调整)
- 恶魔发现你会追过来,进入攻击距离停下射击
- 中弹会屏幕红闪 + 屏幕抖动,HP 归零游戏结束
- 清完全部恶魔胜利

## 项目结构

```
src/
├── main.ts              # 入口:创建 Game、绑定 UI、HMR 清理
├── config.ts            # 所有可调常量(玩家/武器/敌人/关卡/渲染)
├── Engine.ts            # Scene + Camera + Renderer + 主循环
├── Input.ts             # 键盘 + 鼠标(PointerLock)
├── Level.ts             # 关卡几何体 + 光源 + 墙体 AABB 集合
├── Player.ts            # 第一人称控制器:移动/视角/跳跃/重力/碰撞
├── Weapon.ts            # 开火节流 + Raycast 命中 + 子弹计数
├── WeaponModel.ts       # 屏幕右下角枪模 + 枪口闪光 + 后坐力动画
├── Enemy.ts             # 敌人 FSM:idle → chase → attack → dead
├── Game.ts              # 总装:把系统连起来,管理 playing/dead/won 状态
├── Hud.ts               # DOM HUD 控制器(HP/Ammo/Enemies/闪伤/命中标记)
├── Sfx.ts               # Web Audio 程序合成音效
└── style.css            # HUD + 遮罩层样式
```

## 架构要点

### 帧更新顺序
```
requestAnimationFrame
  └─ Engine.loop
      ├─ Player.update   (视角 + 移动 + 跳重 + 墙碰撞)
      ├─ Weapon.update   (冷却计时)
      ├─ WeaponModel.update (枪模动画)
      ├─ Enemy.update×N  (FSM + 移动 + 射击)
      ├─ HUD 刷新
      └─ renderer.render
```

### 墙体碰撞
`Level.resolveCircleVsWalls(x, z, radius)` 把玩家/敌人当成一个 XZ 平面的圆,对所有墙做"圆 vs AABB"检测,沿最短轴推出穿墙。Y 轴独立处理(重力/跳跃),不参与碰撞。

### 武器命中 = hitscan
左键发射一条从相机原点沿 `Player.getLookDir()` 的射线(含当前后坐力抬头),用 `Three.Raycaster.intersectObjects` 取第一个命中的敌人 hitbox。范围由 `CONFIG.weapon.maxRange` 限制。

### 敌人 AI(有限状态机)
```
idle ──(玩家进入 engageDistance)──► chase
chase ──(距离 < stopDistance)──► attack
attack ──(距离 > stopDistance × 1.3)──► chase
any ──(HP ≤ 0)──► dead
```
`attack` 状态下每 `attackCooldown` 秒按 `attackChance` 概率射中玩家一次(无实际子弹飞行,简化为直接 hitscan)。

### 音频解锁
浏览器自动播放策略要求首次用户交互后才能 `AudioContext.resume()`。我们在 **"CLICK TO PLAY"** 按钮的点击事件里调 `sfx.unlock()`,之后所有 `shoot/hit/damage/death` 都能响。

### HMR 防内存泄漏
`main.ts` 里 `import.meta.hot.dispose(() => game.dispose())` 会卸载 WebGL 上下文、移除 canvas、解绑事件监听。否则每次改代码热重载都会在 DOM 里堆叠一个新 canvas,越玩越卡。

## 视觉风格

**现代 Doom 4 / Eternal 风的低成本版**:
- 暗红/暗紫色调 + 指数雾(`FogExp2`)营造幽闭感
- 关卡中心红色点光源 + 远处蓝色点光源做冷暖对比
- 所有"金属"表面用 `MeshStandardMaterial` 的 metalness/roughness
- 敌人 / 武器 / 装饰的关键部位用 `emissive`(自发光)做 Doom 式橙红 accent
- `ACESFilmicToneMapping` + 柔和阴影

**为什么没有 GLTF 模型**:agent 不能下载资源文件,做纯代码自包含才能"即装即跑"。所有几何体都是 `BoxGeometry` / `CylinderGeometry` / `SphereGeometry` / `PlaneGeometry` 组合。

## 可调参数

几乎所有游戏感觉都在 `src/config.ts` 里:

```ts
CONFIG.player.moveSpeed        // 走路速度
CONFIG.player.sprintSpeed      // 冲刺速度
CONFIG.player.jumpVelocity     // 跳跃初速
CONFIG.weapon.fireRate         // 射速(越小越快)
CONFIG.weapon.damage           // 每发伤害
CONFIG.enemy.count             // 敌人数量
CONFIG.enemy.moveSpeed         // 敌人移动速度
CONFIG.enemy.attackChance      // 敌人命中率(0..1)
CONFIG.world.size              // 场地边长
CONFIG.render.fogDensity       // 雾浓度
```

改完文件保存,Vite HMR 秒刷新。

## License

MIT
