# TypeScript 系统学习路线

## 第一阶段：JavaScript 基础巩固（如果还不熟悉）
TypeScript 是 JavaScript 的超集，磨刀不误砍柴工：
- ES6+ 语法：let/const、箭头函数、解构、模板字符串、模块化（import/export）
- 异步编程：Promise、async/await
- 原型链、this 指向、闭包
- 常用数组/对象方法（map、filter、reduce 等）

如果 JS 已经很熟练，可以跳过这步直接开始。

## 第二阶段：TypeScript 核心语法（1-2周）
1. **环境搭建**
   - 安装 `typescript`，了解 `tsc` 编译命令
   - `tsconfig.json` 常用配置项（target、module、strict、outDir 等）

2. **基础类型**
   - 原始类型：`string`、`number`、`boolean`、`null`、`undefined`
   - 数组、元组（Tuple）
   - `any`、`unknown`、`void`、`never`
   - 类型推断 vs 类型标注

3. **函数类型**
   - 参数类型、返回值类型
   - 可选参数、默认参数、剩余参数
   - 函数重载

4. **接口与类型别名**
   - `interface` vs `type` 的区别与选用场景
   - 可选属性、只读属性
   - 接口继承

## 第三阶段：进阶类型系统（2-3周）
这是 TypeScript 真正的精华部分，也是难点：

1. **联合类型与交叉类型**
   - `A | B`、`A & B`
   - 类型收窄（type narrowing）、类型守卫（type guard）

2. **枚举（enum）与字面量类型**
   - 数字枚举、字符串枚举
   - 字面量类型联合（如 `"success" | "error"`）

3. **泛型（Generics）**
   - 泛型函数、泛型接口、泛型类
   - 泛型约束（`extends`）
   - 常见泛型工具的实现原理（如简易的 `Array<T>`）

4. **类（Class）相关**
   - 访问修饰符：`public`、`private`、`protected`
   - 抽象类、实现接口
   - 静态成员

5. **高级类型操作**
   - 映射类型（Mapped Types）
   - 条件类型（Conditional Types）
   - `infer` 关键字
   - 内置工具类型：`Partial`、`Pick`、`Omit`、`Record`、`ReturnType` 等（建议自己手写实现一遍加深理解）

## 第四阶段：模块化与工程化（1-2周）
- 声明文件（`.d.ts`）的编写与使用
- `declare module`、第三方库类型声明（`@types/xxx`）
- 命名空间（namespace，了解即可，现代项目较少用）
- 与打包工具集成：Webpack/Vite + TypeScript
- ESLint + TypeScript 规范配置

## 第五阶段：结合框架实战（持续进行）
根据你的方向选择：
- **前端**：React + TypeScript（组件 props 类型、hooks 类型、事件类型）或 Vue3 + TypeScript
- **后端**：Node.js + TypeScript，搭配 Express/NestJS（NestJS 本身就是 TS 优先设计，很适合深入体会装饰器等特性）
- **通用**：尝试给一个 JS 项目逐步迁移到 TS，这是检验掌握程度最好的方式

## 第六阶段：查漏补缺与深入
- 阅读 TypeScript 官方文档的 Handbook（最权威、最系统）
- 研究知名开源库的 `.d.ts` 类型定义，学习真实场景下的类型写法
- 了解 TS 编译器的一些底层机制（结构化类型系统 structural typing）
- 关注 TypeScript 版本更新（新特性演进较快）

---

## 学习建议
- **每阶段都要写代码**：类型系统光看不练很难真正掌握，尤其泛型和条件类型需要大量练习
- **不要死磕 strict 模式初期**：先跑通逻辑，再逐步开启 `strict: true` 相关的所有检查项
- **善用 IDE 提示**：VSCode 的类型悬浮提示是最好的学习反馈
- **多写多犯错**：遇到类型报错就是学习的最好机会，理解报错信息比看教程更有效

预计整体学完核心内容（第一到第四阶段）大概需要 4-6 周，之后就是在实战中不断加深理解，这个过程会持续更久，但收益也最大。
