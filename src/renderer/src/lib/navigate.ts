// 编程式导航（HashRouter）：直接改写 location.hash。
// 用于在非路由组件（如 feature hooks）中跳转，避免依赖 useNavigate 的 Router 上下文。
export const navigateTo = (path: string): void => {
  const target = `#${path}`
  if (window.location.hash === target) return
  window.location.hash = target
}
