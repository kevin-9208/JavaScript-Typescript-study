# Next.js App Router + TypeScript 详解

## 0. 重要前提：Next.js 15 的 params/searchParams 变成了异步

这是 App Router 类型写法里最容易踩坑、也最容易查到过时资料的地方。**Next.js 13/14 和 15 的写法不一样**，务必先确认你项目的版本：

- Next.js 13/14：`params`、`searchParams` 是同步对象
- Next.js 15+：`params`、`searchParams` 变成了 **Promise**，必须 `await`

下面会分别标注两种写法。

## 1. Page 组件的类型

### Next.js 15（当前写法）
```typescript
// app/blog/[slug]/page.tsx
interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BlogPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { page } = await searchParams;

  return <div>文章：{slug}，页码：{page}</div>;
}
```

### Next.js 14 及更早
```typescript
interface PageProps {
  params: { slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function BlogPage({ params, searchParams }: PageProps) {
  return <div>文章：{params.slug}</div>;
}
```

**动态路由参数与文件夹名的对应关系**：
```
app/blog/[slug]/page.tsx        →  { slug: string }
app/shop/[...tags]/page.tsx     →  { tags: string[] }        （catch-all）
app/shop/[[...tags]]/page.tsx   →  { tags: string[] | undefined } （可选 catch-all）
app/[locale]/[slug]/page.tsx    →  { locale: string; slug: string }
```

## 2. Layout 组件的类型

```typescript
// app/blog/layout.tsx
interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>; // Next 15；14 及以下去掉 Promise
}

export default async function BlogLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  return (
    <div>
      <nav>当前分类：{slug}</nav>
      {children}
    </div>
  );
}
```

如果 layout 里有平行路由（parallel routes，比如 `@modal`），children 之外还会多出对应命名的 slot：

```typescript
interface LayoutProps {
  children: React.ReactNode;
  modal: React.ReactNode; // 对应文件夹 @modal
}

export default function Layout({ children, modal }: LayoutProps) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
```

## 3. Route Handler（app/api 路由）的类型

```typescript
// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>; // Next 15
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // 读取 query string
  const searchParams = request.nextUrl.searchParams;
  const page = searchParams.get("page");

  return NextResponse.json({ id, page });
}

export async function POST(request: NextRequest) {
  const body = await request.json(); // body 类型是 any，需要自己校验/标注

  interface CreateUserBody {
    name: string;
    email: string;
  }
  const data = body as CreateUserBody; // 建议配合 zod 做运行时校验（见下文）

  return NextResponse.json({ success: true, data }, { status: 201 });
}
```

**注意**：`request.json()` 返回的是 `Promise<any>`，TypeScript 在这里帮不上忙——数据是不是真的符合你的接口，编译期完全无法保证。这是纯类型系统的天然局限，**必须靠运行时校验库（如 zod）来补足**：

```typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = CreateUserSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const data = result.data; // 这里 data 的类型是真正被验证过的 { name: string; email: string }
  return NextResponse.json({ success: true, data });
}
```

这个模式（zod 校验 + 类型推断）在 Next.js 项目里非常常见，强烈建议掌握。

## 4. Server Actions 的类型

Server Actions 是普通的异步函数，用 `"use server"` 标记，类型写法和普通 TS 函数基本一致：

```typescript
// app/actions/user.ts
"use server";

import { z } from "zod";

const UpdateUserSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function updateUser(
  formData: FormData
): Promise<ActionResult> {
  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
  };

  const result = UpdateUserSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: "校验失败" };
  }

  // 执行数据库更新...
  return { success: true };
}
```

配合 `useActionState`（React 19 / Next.js 15）在表单中使用：

```typescript
"use client";
import { useActionState } from "react";
import { updateUser } from "@/app/actions/user";

interface FormState {
  success: boolean;
  error?: string;
}

function UserForm() {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prevState, formData) => {
      return await updateUser(formData);
    },
    { success: false } // 初始状态
  );

  return (
    <form action={formAction}>
      <input name="name" />
      <button disabled={isPending}>{isPending ? "提交中..." : "提交"}</button>
      {state.error && <p>{state.error}</p>}
    </form>
  );
}
```

## 5. generateStaticParams 的类型

```typescript
// app/blog/[slug]/page.tsx

// 返回值类型必须是数组，每一项的 key 要和动态路由参数名一致
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const posts = await getPosts(); // 假设返回 Post[]
  return posts.map((post) => ({ slug: post.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  // ...
}
```

## 6. generateMetadata 的类型

```typescript
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      images: [post.coverImage],
    },
  };
}
```

## 7. Loading / Error / Not-Found 组件

```typescript
// app/blog/[slug]/loading.tsx
export default function Loading() {
  return <div>加载中...</div>; // 无 props，不需要类型标注
}

// app/blog/[slug]/error.tsx —— 注意必须是 Client Component
"use client";

interface ErrorProps {
  error: Error & { digest?: string }; // digest 是 Next.js 附加的错误摘要字段
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  return (
    <div>
      <p>出错了：{error.message}</p>
      <button onClick={reset}>重试</button>
    </div>
  );
}
```

## 8. Middleware 的类型

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token");

  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

## 9. 数据请求与类型（Server Component 中）

Server Component 里直接 `await` 请求数据非常常见，配合返回值类型标注：

```typescript
interface Post {
  id: number;
  title: string;
  content: string;
}

async function getPosts(): Promise<Post[]> {
  const res = await fetch("https://api.example.com/posts");
  if (!res.ok) throw new Error("获取文章失败");
  return res.json(); // 注意：res.json() 本身是 any，这里靠函数签名的返回类型做"断言"
}

export default async function BlogList() {
  const posts = await getPosts();
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

同样要提醒：`fetch` 返回的 `.json()` 在类型层面是 `any`，函数签名上写 `Promise<Post[]>` 只是"告诉 TS 相信我"，并不会做运行时校验。**如果数据来自不可信来源（外部 API），建议用 zod 再包一层校验**，否则数据结构变化时 TS 完全发现不了。

## 10. 环境变量的类型

Next.js 的环境变量默认类型是 `string | undefined`，可以通过声明合并扩展类型，获得更好的自动补全和类型安全：

```typescript
// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    NEXT_PUBLIC_API_URL: string;
    NODE_ENV: "development" | "production" | "test";
  }
}
```

这样 `process.env.DATABASE_URL` 就会被推断为 `string` 而不是 `string | undefined`，用起来不用到处加非空判断。**但同样要注意：这只是类型层面的"承诺"，如果实际没配置这个环境变量，运行时依然会是 `undefined`**，建议启动时做一次实际校验（很多项目会用 zod 校验 `process.env` 是否符合预期）。

## 11. 客户端组件中 use 与 Suspense 配合类型（Next 15 新写法）

Next.js 15 提倡把 `params`/`searchParams` 的 Promise 直接传给客户端组件，用 React 19 的 `use` Hook 展开：

```typescript
// Server Component：直接把 Promise 传下去，不在这里 await
interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function Page({ params }: PageProps) {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <BlogContent paramsPromise={params} />
    </Suspense>
  );
}

// Client Component
"use client";
import { use } from "react";

function BlogContent({ paramsPromise }: { paramsPromise: Promise<{ slug: string }> }) {
  const { slug } = use(paramsPromise); // use() 展开 Promise，会触发 Suspense
  return <div>{slug}</div>;
}
```

---

## 常见踩坑总结

| 场景 | 问题 | 解决方式 |
|---|---|---|
| 从旧教程抄的 `params: { slug: string }` | Next 15 报错，因为实际是 Promise | 确认 Next 版本，15+ 用 `Promise<{...}>` 并 `await` |
| `fetch().json()` 类型 | 编译期认为符合接口，运行期数据结构变了却发现不了 | 用 zod 做运行时校验，不要只依赖函数签名断言 |
| `error.tsx` 忘记加 `"use client"` | 报错或行为异常 | error/loading 等特殊文件如果用到 hooks 或事件必须是 Client Component |
| `generateStaticParams` 返回的 key 和文件夹动态参数名不一致 | 类型报错或路由生成失败 | 检查文件夹名 `[xxx]` 和返回对象的 key 是否完全一致 |
| 环境变量类型扩展了但没配置 | 类型显示 `string` 但运行时是 `undefined` | 启动时加运行时校验，别完全信任类型声明 |

## 推荐练习
1. 搭建一个 Next.js 15 项目，写一个动态路由 `[id]`，实现 page + generateMetadata + generateStaticParams 三者类型联动
2. 写一个 Server Action，配合 zod 做表单校验，并用 `useActionState` 在客户端展示错误信息
3. 写一个 Route Handler 实现简单的 CRUD 接口，全部用 zod 校验请求体

---

到这里，我们已经完整覆盖了 TS 基础语法 → 泛型进阶 → 工程化配置 → React 类型写法 → Zustand 状态管理 → Next.js App Router，基本形成了一条从语言核心到主流生态实战的完整路径。

接下来你可以选择：
- **深入某个薄弱点**（比如条件类型/映射类型的更多练习题）
- **横向补充**：Redux Toolkit 对比、React Query（TanStack Query）的类型写法、GraphQL Codegen 自动生成类型
- **换个方向**：如果你的项目偏后端，可以转向 NestJS 的类型写法（装饰器、依赖注入的类型体系很值得学）
