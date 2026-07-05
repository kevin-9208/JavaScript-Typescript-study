# React + TypeScript 类型写法详解

## 1. 函数组件与 Props 类型

### 基础写法
```typescript
interface ButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean; // 可选属性
}

function Button({ text, onClick, disabled = false }: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{text}</button>;
}
```

### 关于 `React.FC`：现在不推荐用
早期很多教程会写：
```typescript
const Button: React.FC<ButtonProps> = ({ text, onClick }) => { ... }
```
但社区（包括 React 官方类型定义作者）现在**普遍不推荐** `React.FC`，原因：
- 它隐式包含 `children: ReactNode`，即使你的组件不需要 children
- 对泛型组件、defaultProps 的支持不够友好

推荐直接用普通函数 + 显式标注参数类型（如上面的写法），这也是当前主流开源项目的写法。

## 2. children 的类型

```typescript
import type { ReactNode } from "react";

interface CardProps {
  title: string;
  children: ReactNode; // 最通用，可以是文本、元素、数组、null 等
}

function Card({ title, children }: CardProps) {
  return (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
```

如果你只允许传入单个 React 元素（更严格）：
```typescript
interface WrapperProps {
  children: React.ReactElement; // 只能是一个元素，不能是字符串/数组
}
```

## 3. 事件类型

React 的事件是"合成事件"（SyntheticEvent），类型和原生 DOM 事件不完全一样：

```typescript
function Input() {
  // 输入框 change 事件
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log(e.target.value);
  };

  // 点击事件
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log(e.currentTarget);
  };

  // 表单提交
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { /* ... */ }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input onChange={handleChange} onKeyDown={handleKeyDown} />
      <button onClick={handleClick}>Submit</button>
    </form>
  );
}
```

**记忆技巧**：`React.[事件类型]Event<[DOM元素类型]>`，具体元素类型不确定时可以让 IDE 自动补全推断，或者直接把鼠标悬浮在 JSX 属性的事件处理器上看提示的类型签名。

## 4. useState

大部分情况类型可以被自动推断：
```typescript
const [count, setCount] = useState(0); // 自动推断为 number
const [name, setName] = useState("");  // 自动推断为 string
```

但如果初始值是 `null` 或者需要联合类型，必须显式标注泛型：
```typescript
interface User {
  id: number;
  name: string;
}

// 不标注的话会被推断为 User | null，后续访问 user.name 会报错要求先做空值判断
const [user, setUser] = useState<User | null>(null);

// 之后使用需要判空
if (user) {
  console.log(user.name); // OK
}

// 联合类型状态
type Status = "idle" | "loading" | "success" | "error";
const [status, setStatus] = useState<Status>("idle");
```

## 5. useRef

useRef 有两种典型用法，类型写法不同：

```typescript
// 用法一：引用 DOM 元素
function InputFocus() {
  const inputRef = useRef<HTMLInputElement>(null); // 必须传 null 作为初始值

  useEffect(() => {
    inputRef.current?.focus(); // 用 ?. 因为可能是 null
  }, []);

  return <input ref={inputRef} />;
}

// 用法二：保存可变值（不触发渲染），初始值非 null
function Timer() {
  const timerRef = useRef<number | undefined>(undefined);

  const start = () => {
    timerRef.current = window.setInterval(() => {}, 1000);
  };
  // timerRef.current 是可读写的，因为初始值不是 null
}
```

**关键区别**：`useRef<T>(null)` 得到的 `.current` 是只读的（React 内部会设置），常用于 DOM 引用；`useRef<T>(initialValue)`（非 null）得到的是可读写的，常用于存储任意可变数据。

## 6. useEffect / useMemo / useCallback

这几个 Hook 通常类型都能自动推断，无需手动标注：

```typescript
useEffect(() => {
  // 返回值必须是函数或 undefined（不能是 async 函数直接传入，因为返回 Promise）
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer);
}, []);

// useMemo：返回值类型自动推断
const total = useMemo<number>(() => {
  return items.reduce((sum, item) => sum + item.price, 0);
}, [items]);

// useCallback：函数类型自动推断，一般不需要手动标注泛型
const handleClick = useCallback((id: number) => {
  console.log(id);
}, []);
```

## 7. 自定义 Hook 的类型

```typescript
// 返回元组时，需要用 as const 或显式标注，否则会被推断成数组联合类型
function useToggle(initial: boolean = false): [boolean, () => void] {
  const [state, setState] = useState(initial);
  const toggle = () => setState(prev => !prev);
  return [state, toggle]; // 因为函数返回值标注了元组类型，这里能正确推断
}

const [isOpen, toggleOpen] = useToggle();
```

如果不标注返回类型，TS 可能会把 `[state, toggle]` 推断成 `(boolean | (() => void))[]`，导致解构后类型不准确。**这是初学者最容易踩的坑之一**。

## 8. 泛型组件

当组件的 props 类型依赖传入的数据类型时，用泛型：

```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string | number;
}

function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map(item => (
        <li key={keyExtractor(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

// 使用时类型自动推断
interface User { id: number; name: string; }
const users: User[] = [{ id: 1, name: "Tom" }];

<List
  items={users}
  renderItem={(user) => <span>{user.name}</span>} // user 被自动推断为 User
  keyExtractor={(user) => user.id}
/>
```

## 9. 组件属性透传（继承原生 HTML 属性）

如果你封装了一个 Button 组件，想让它支持所有原生 `<button>` 的属性（如 `className`、`style`、`type` 等），不需要一个个手写：

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary"; // 额外扩展的自定义属性
}

function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} ${className ?? ""}`} {...rest} />
  );
}

// 使用
<Button variant="primary" onClick={() => {}} disabled type="submit" />
```

常用的原生属性类型：
- `React.HTMLAttributes<HTMLDivElement>`（通用 div 等）
- `React.InputHTMLAttributes<HTMLInputElement>`
- `React.ButtonHTMLAttributes<HTMLButtonElement>`
- `React.AnchorHTMLAttributes<HTMLAnchorElement>`

## 10. forwardRef 的类型写法

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, ...rest }, ref) => {
    return (
      <label>
        {label}
        <input ref={ref} {...rest} />
      </label>
    );
  }
);
Input.displayName = "Input"; // 配合 forwardRef 建议加上，方便调试

// 使用
const inputRef = useRef<HTMLInputElement>(null);
<Input label="姓名" ref={inputRef} />
```

> 注：如果你用的是 React 19，`forwardRef` 的部分场景已经可以直接把 `ref` 作为普通 prop 传递（新的 ref-as-prop 特性），写法会更简洁，具体建议查阅你项目实际使用的 React 版本文档确认。

## 11. Context 的类型写法

```typescript
interface AuthContextValue {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

// 创建时给一个默认值，或用 undefined + 非空断言模式
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = (user: User) => setUser(user);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// 自定义 hook 封装，同时做非空检查（避免每次使用都要判断 undefined）
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内部使用");
  }
  return context;
}
```

## 12. useReducer 的类型写法（结合 discriminated union，非常实用）

```typescript
interface State {
  count: number;
}

// 用联合类型定义所有可能的 action，type 字段作为区分标识
type Action =
  | { type: "increment"; payload: number }
  | { type: "decrement"; payload: number }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "increment":
      return { count: state.count + action.payload }; // TS 知道这里有 payload
    case "decrement":
      return { count: state.count - action.payload };
    case "reset":
      return { count: 0 }; // 这里 TS 知道 action 没有 payload，访问会报错
    default:
      return state;
  }
}

const [state, dispatch] = useReducer(reducer, { count: 0 });
dispatch({ type: "increment", payload: 5 }); // 类型安全，写错字段会报错
```

这种写法叫**可辨识联合类型（Discriminated Union）**，是 TS 中处理"多种状态形态"最优雅的方式，非常推荐在 reducer、状态机场景使用。

---

## 常见踩坑总结

| 场景 | 问题 | 解决方式 |
|---|---|---|
| `useState(null)` | 后续赋值报错 | 显式标注 `useState<T \| null>(null)` |
| `useRef` | DOM 引用报错只读 | DOM 场景用 `useRef<T>(null)`，可变值场景传非 null 初始值 |
| 自定义 Hook 返回元组 | 解构类型丢失 | 显式标注函数返回值为元组类型 |
| Props 传函数无返回值 | 写成 `() => void` 但内部 return 了值 | 无影响，`void` 只约束调用方不能依赖返回值，内部可以随便 return |
| 第三方组件库类型报错 | 版本不匹配或缺少 `@types` | 检查 `@types/react` 版本是否和 `react` 匹配 |

## 推荐练习
1. 用泛型组件写一个 `Select<T>`，支持任意类型的选项数组
2. 用 discriminated union 写一个请求状态管理（`idle` / `loading` / `success` / `error`），并在组件里根据状态渲染不同 UI
3. 封装一个继承原生 `<input>` 属性的 `Input` 组件，并支持 `forwardRef`

