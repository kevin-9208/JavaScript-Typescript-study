# Zustand + TypeScript 详解

## 1. 基础写法

Zustand 的核心 API 是 `create`，创建 store 时需要通过泛型显式指定 State 的类型（这一点和 useState 不同，**Zustand 几乎不能依赖自动推断**，必须手动标注）：

```typescript
import { create } from "zustand";

interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));

// 组件中使用
function Counter() {
  const count = useCounterStore((state) => state.count);
  const increment = useCounterStore((state) => state.increment);
  return <button onClick={increment}>{count}</button>;
}
```

**为什么必须显式标注 `create<CounterState>`？**
因为 `create` 的回调函数参数 `set`、`get` 的类型依赖于 State 本身，是一种"自引用"的类型关系，TS 没办法从返回的对象反向推断出这个泛型，所以必须显式传入。如果不写泛型，`set` 的类型会退化成 `any`，失去类型保护。

## 2. set / get 的类型细节

```typescript
interface UserState {
  user: { id: number; name: string } | null;
  age: number;
  setUser: (user: UserState["user"]) => void;
  incrementAge: () => void;
}

const useUserStore = create<UserState>((set, get) => ({
  user: null,
  age: 0,
  setUser: (user) => set({ user }), // set 接收部分 state，做浅合并
  incrementAge: () => {
    const currentAge = get().age; // get() 拿到完整的当前 state
    set({ age: currentAge + 1 });
  },
}));
```

- `set` 的类型是 `(partial: Partial<State> | ((state: State) => Partial<State>), replace?: boolean) => void`
- `get` 的类型是 `() => State`

这两个都会根据你传入的泛型 `State` 自动生成正确的类型，不需要额外标注。

## 3. 分离 State 和 Actions（推荐的组织方式）

大型项目建议把"数据"和"方法"分开定义接口，可读性更好，也方便后续做类型复用：

```typescript
interface CartState {
  items: { id: number; name: string; price: number }[];
  total: number;
}

interface CartActions {
  addItem: (item: CartState["items"][number]) => void;
  removeItem: (id: number) => void;
  clear: () => void;
}

// 组合成完整的 Store 类型
type CartStore = CartState & CartActions;

const useCartStore = create<CartStore>((set) => ({
  items: [],
  total: 0,
  addItem: (item) =>
    set((state) => ({
      items: [...state.items, item],
      total: state.total + item.price,
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
      total: state.items.filter((i) => i.id !== id).reduce((s, i) => s + i.price, 0),
    })),
  clear: () => set({ items: [], total: 0 }),
}));
```

## 4. 中间件（middleware）的类型写法

Zustand 的中间件（如 `persist`、`devtools`、`immer`）会改变 `create` 的类型签名，写法上有讲究。

### persist（持久化到 localStorage）
```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SettingsState {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "light",
      toggleTheme: () =>
        set({ theme: get().theme === "light" ? "dark" : "light" }),
    }),
    {
      name: "settings-storage", // localStorage 的 key
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

**注意这里的写法细节**：`create<SettingsState>()(persist(...))` —— 多了一对空括号 `()`。这是 Zustand 为了解决中间件场景下泛型推断问题使用的 **curried（柯里化）写法**，官方称为 "the curried workaround"。只要用了任何中间件，就必须用这种双重调用的写法，否则类型会报错或推断失效。

### devtools（配合 Redux DevTools 调试）
```typescript
import { devtools } from "zustand/middleware";

const useStore = create<CounterState>()(
  devtools(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { name: "counter-store" } // 在 DevTools 面板中显示的名字
  )
);
```

### immer（让 set 支持直接修改嵌套对象）
```typescript
import { immer } from "zustand/middleware/immer";

interface TodoState {
  todos: { id: number; text: string; done: boolean }[];
  toggleTodo: (id: number) => void;
}

const useTodoStore = create<TodoState>()(
  immer((set) => ({
    todos: [],
    toggleTodo: (id) =>
      set((state) => {
        // immer 中间件允许直接"修改"draft，内部会处理不可变更新
        const todo = state.todos.find((t) => t.id === id);
        if (todo) todo.done = !todo.done;
      }),
  }))
);
```

### 多个中间件组合
```typescript
const useStore = create<TodoState>()(
  devtools(
    persist(
      immer((set) => ({
        todos: [],
        toggleTodo: (id) => set((state) => {
          const todo = state.todos.find((t) => t.id === id);
          if (todo) todo.done = !todo.done;
        }),
      })),
      { name: "todo-storage" }
    )
  )
);
```
组合中间件时要注意嵌套顺序，一般 `devtools` 放最外层，具体顺序可以参考官方文档，不同中间件对顺序有一定要求。

## 5. Selector 的类型推断与性能优化写法

```typescript
// 直接用 selector 取值，类型自动推断，无需手动标注
const count = useCounterStore((state) => state.count); // number
const increment = useCounterStore((state) => state.increment); // () => void

// 取多个值时，注意每次渲染都会创建新对象，可能导致不必要的重渲染
// 不推荐（每次返回新对象，配合 shallow 比较才安全）
const { count, increment } = useCounterStore((state) => ({
  count: state.count,
  increment: state.increment,
}));
```

如果要取多个值又想避免重渲染问题，建议搭配 `useShallow`（Zustand v4.4+ 提供）：

```typescript
import { useShallow } from "zustand/react/shallow";

const { count, increment } = useCounterStore(
  useShallow((state) => ({ count: state.count, increment: state.increment }))
);
```

## 6. 切片模式（Slice Pattern）—— 大型 Store 拆分

当 Store 变大后，通常会拆分成多个"切片"分别定义，再组合成一个完整 Store。这是 Zustand 官方推荐的大型项目组织方式：

```typescript
import { create, StateCreator } from "zustand";

// 定义 User 切片
interface UserSlice {
  user: { id: number; name: string } | null;
  setUser: (user: UserSlice["user"]) => void;
}

const createUserSlice: StateCreator
  UserSlice & CartSlice, // 完整 Store 类型（用于让切片间可以互相访问）
  [],
  [],
  UserSlice // 当前切片自身的类型
> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
});

// 定义 Cart 切片
interface CartSlice {
  items: string[];
  addItem: (item: string) => void;
}

const createCartSlice: StateCreator
  UserSlice & CartSlice,
  [],
  [],
  CartSlice
> = (set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
});

// 组合成完整 Store
type AppStore = UserSlice & CartSlice;

const useAppStore = create<AppStore>()((...args) => ({
  ...createUserSlice(...args),
  ...createCartSlice(...args),
}));
```

`StateCreator<T, Mps, Mcs, U>` 这几个泛型参数含义：
- `T`：整个组合后的 Store 类型
- `Mps` / `Mcs`：中间件相关的类型参数（不用中间件时留空数组 `[]` 即可）
- `U`：当前切片自身暴露出去的类型（默认等于 T，拆分时改成切片自己的类型）

这部分稍微有点绕，**初学阶段可以先跳过切片模式**，等 Store 真的变得复杂、单文件难以维护时再回来学习拆分。

## 7. 配合 React Context 做多实例 Store（进阶场景）

如果同一个组件需要在页面上创建多个独立实例（比如一个可复用的表单组件，每个实例数据互不影响），可以用 `createStore` + Context 而不是全局单例的 `create`：

```typescript
import { createStore, useStore } from "zustand";
import { createContext, useContext, useRef, type ReactNode } from "react";

interface FormState {
  value: string;
  setValue: (v: string) => void;
}

const createFormStore = () =>
  createStore<FormState>((set) => ({
    value: "",
    setValue: (value) => set({ value }),
  }));

type FormStoreApi = ReturnType<typeof createFormStore>;
const FormStoreContext = createContext<FormStoreApi | null>(null);

function FormProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<FormStoreApi>();
  if (!storeRef.current) {
    storeRef.current = createFormStore();
  }
  return (
    <FormStoreContext.Provider value={storeRef.current}>
      {children}
    </FormStoreContext.Provider>
  );
}

function useFormStore<T>(selector: (state: FormState) => T): T {
  const store = useContext(FormStoreContext);
  if (!store) throw new Error("必须在 FormProvider 内使用");
  return useStore(store, selector);
}
```

这种模式常用于组件库开发（比如一个可复用的表单/弹窗组件），日常业务开发中用得较少，了解思路即可。

---

## 常见踩坑总结

| 场景 | 问题 | 解决方式 |
|---|---|---|
| 不写泛型直接 `create((set) => ...)` | `set`/`get` 类型退化为 `any`，无类型保护 | 始终写 `create<StateType>(...)` |
| 使用中间件却用单括号 `create<T>(persist(...))` | 类型推断失效或报错 | 改用双括号柯里化写法 `create<T>()(persist(...))` |
| selector 返回新对象导致重渲染 | 每次渲染 selector 返回新引用 | 搭配 `useShallow` 或拆分成多个独立 selector 调用 |
| 切片模式类型报错 | `StateCreator` 泛型参数没写全 | 按 `<全量Store类型, [], [], 当前切片类型>` 顺序补全 |

## 推荐练习
1. 写一个 `useAuthStore`，包含 `user`、`token`、`login`、`logout`，并加上 `persist` 中间件持久化 token
2. 尝试用切片模式，把一个 Todo 应用拆成 `todoSlice`（增删改）和 `filterSlice`（筛选状态）两部分
3. 对比同一个 Store 用 `create` vs `createStore + Context` 两种方式，体会全局单例和多实例的区别

