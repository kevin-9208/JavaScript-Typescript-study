# 泛型（Generics）详解

## 1. 为什么需要泛型？

先看一个问题：如果你想写一个函数，接收任意类型的参数并原样返回，用 `any` 会怎样？

```typescript
function identity(arg: any): any {
  return arg;
}

const result = identity(123);
result.toFixed(2); // 能通过编译，但如果传入的是字符串呢？失去了类型保护
```

用 `any` 会丢失类型信息。泛型的作用就是**在不确定具体类型的情况下，仍然保留类型之间的关联关系**。

```typescript
function identity<T>(arg: T): T {
  return arg;
}

const result = identity<number>(123); // result 被推断为 number
const result2 = identity("hello");     // result2 被推断为 string，无需显式指定
```

`T` 就是类型参数（Type Parameter），可以理解为"类型的变量"。

## 2. 泛型函数

```typescript
// 多个类型参数
function pair<K, V>(key: K, value: V): [K, V] {
  return [key, value];
}
const p = pair("age", 25); // [string, number]

// 泛型 + 数组
function firstElement<T>(arr: T[]): T | undefined {
  return arr[0];
}
firstElement([1, 2, 3]);      // number | undefined
firstElement(["a", "b"]);     // string | undefined
```

## 3. 泛型约束（extends）

有时候你不希望 `T` 是任意类型，而是要求它具备某些特征：

```typescript
// 约束 T 必须有 length 属性
function logLength<T extends { length: number }>(arg: T): T {
  console.log(arg.length);
  return arg;
}
logLength("hello");     // OK，string 有 length
logLength([1, 2, 3]);   // OK，数组有 length
logLength(123);         // 报错，number 没有 length
```

结合 `keyof` 做属性访问约束（非常常用，比如封装工具函数）：

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const person = { name: "Tom", age: 20 };
getProperty(person, "name"); // string
getProperty(person, "job");  // 报错，job 不是 person 的 key
```

## 4. 泛型接口 / 类型别名

```typescript
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// 使用时指定具体类型
const userResponse: ApiResponse<{ id: number; name: string }> = {
  code: 200,
  message: "success",
  data: { id: 1, name: "Alice" }
};

// 配合泛型函数使用，非常适合封装请求函数
function request<T>(url: string): Promise<ApiResponse<T>> {
  return fetch(url).then(res => res.json());
}

interface User { id: number; name: string; }
request<User>("/api/user").then(res => {
  console.log(res.data.name); // 类型安全
});
```

## 5. 泛型类

```typescript
class Storage<T> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  getAll(): T[] {
    return this.items;
  }
}

const numberStorage = new Storage<number>();
numberStorage.add(1);
numberStorage.add(2);
// numberStorage.add("a"); // 报错
```

## 6. 默认类型参数

```typescript
interface Container<T = string> {
  value: T;
}

const c1: Container = { value: "hello" };       // 默认 string
const c2: Container<number> = { value: 123 };   // 显式指定
```

## 7. 条件类型 + infer（进阶，理解内置工具类型的关键）

```typescript
// 条件类型：根据条件返回不同的类型
type IsString<T> = T extends string ? "yes" : "no";
type A = IsString<string>; // "yes"
type B = IsString<number>; // "no"

// infer：从复杂类型中"提取"出某个子类型
type ReturnTypeOf<T> = T extends (...args: any[]) => infer R ? R : never;

function foo() { return 123; }
type FooReturn = ReturnTypeOf<typeof foo>; // number
```

这其实就是 TS 内置的 `ReturnType<T>` 的实现原理。

## 8. 动手实现常见工具类型（强烈建议自己敲一遍）

```typescript
// Partial<T>：所有属性变为可选
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Readonly<T>：所有属性变为只读
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Pick<T, K>：从 T 中挑选部分属性
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Omit<T, K>：从 T 中排除部分属性
type MyOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Record<K, V>：构造一个 key 为 K，value 为 V 的对象类型
type MyRecord<K extends string | number | symbol, V> = {
  [P in K]: V;
};
```

**练习建议**：把 TS 内置的 `Exclude`、`Extract`、`NonNullable`、`Required` 也都手写实现一遍，这是理解映射类型 + 条件类型最快的方式。

---

# 工程化配置详解

## 1. tsconfig.json 核心配置项

一个典型的 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",

    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

逐项说明：

| 配置项 | 作用 |
|---|---|
| `target` | 编译后的 JS 版本（ES5/ES2020等），决定语法降级程度 |
| `module` | 输出的模块格式（CommonJS/ESNext等） |
| `moduleResolution` | 模块解析策略，现代项目常用 `bundler` 或 `node16` |
| `lib` | 指定可用的内置类型库，如 DOM API 需要加 `"DOM"` |
| `strict` | 一键开启所有严格检查（推荐始终为 true） |
| `esModuleInterop` | 允许 `import React from 'react'` 这种写法兼容 CommonJS |
| `skipLibCheck` | 跳过对 `.d.ts` 文件的类型检查，加快编译速度 |
| `outDir` / `rootDir` | 输出目录 / 源码目录 |
| `noEmit` | 只做类型检查不生成文件（常见于用 Vite/Babel 转译，TS 只负责查错的场景） |
| `paths` + `baseUrl` | 配置路径别名，如 `@/components/xxx` |

### strict 模式细分（了解每一项含义，方便按需开关）
```json
{
  "strictNullChecks": true,        // null/undefined 必须显式处理
  "noImplicitAny": true,           // 禁止隐式 any
  "strictFunctionTypes": true,     // 函数参数类型更严格的双向协变检查
  "strictPropertyInitialization": true // 类属性必须初始化
}
```

## 2. 与 Vite 集成（目前最主流）

```bash
npm create vite@latest my-app -- --template react-ts
```

Vite 场景下的关键点：
- Vite 用 esbuild 转译 TS，**只做语法转换，不做类型检查**（速度快）
- 所以 `tsconfig.json` 里设置 `"noEmit": true`，类型检查交给 IDE 和单独的 `tsc --noEmit` 命令
- 构建脚本通常是：
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build"
  }
}
```

## 3. 与 Webpack 集成

两种主流方案：
- **ts-loader**：功能完整，会做类型检查，但速度较慢
- **babel-loader + @babel/preset-typescript**：只转译语法不检查类型，速度快，配合单独的 `tsc --noEmit` 做类型检查（类似 Vite 的思路）

```javascript
// webpack.config.js 片段（ts-loader 方案）
module.exports = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  }
};
```

## 4. ESLint + TypeScript

```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

```json
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

新项目推荐直接用 **ESLint Flat Config**（`eslint.config.js`），这是目前 ESLint 官方推荐的新格式，配置方式略有不同，如果你用的是较新版本工具链建议直接学这个。

## 5. 类型声明文件（.d.ts）

场景一：给没有类型定义的第三方 JS 库补充类型
```typescript
// types/some-lib.d.ts
declare module "some-untyped-lib" {
  export function doSomething(x: number): string;
}
```

场景二：全局类型声明（比如给 `window` 挂载自定义属性）
```typescript
// global.d.ts
declare global {
  interface Window {
    myCustomProperty: string;
  }
}
export {}; // 确保这个文件被当作模块处理
```

场景三：安装社区维护的类型包
```bash
npm install -D @types/lodash
```

## 6. 项目引用（Project References）—— 大型 Monorepo 场景

如果项目分成多个包（比如 `packages/core`、`packages/utils`），可以用 TS 的 Project References 来管理依赖和加速编译：

```json
// tsconfig.json（根）
{
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/utils" }
  ]
}
```

每个子包有自己的 `tsconfig.json` 并设置 `"composite": true`。这是进阶内容，先了解概念，等真正遇到 monorepo 项目再深入。

---

## 建议的练习顺序
1. 先手写一遍上面 5 个工具类型（Partial/Readonly/Pick/Omit/Record），不看答案自己推导
2. 用 Vite 建一个 `react-ts` 项目，手动调整 `tsconfig.json` 的每一项，观察报错变化
3. 找一个没有类型的小 npm 包，自己写一份 `.d.ts` 声明文件
