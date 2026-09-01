// renderer 内设置变更统一广播：设置页保存后按域通知，各消费方订阅对应域后重新拉取。
// 域 = 设置项分组（models / permissions / ui / customCommands），新增设置项时归入对应域并在此扩展。
export type SettingsDomain = "models" | "permissions" | "ui" | "customCommands" | "cli"

type SettingsChangeListener = () => void

const listeners: Record<SettingsDomain, Set<SettingsChangeListener>> = {
  models: new Set(),
  permissions: new Set(),
  ui: new Set(),
  customCommands: new Set(),
  cli: new Set(),
}


// 广播指定域配置变更。
export const notifySettingsChanged = (domain: SettingsDomain): void => {
  listeners[domain].forEach((listener) => listener())
}

// 订阅指定域配置变更，返回退订函数。
export const subscribeSettingsChanged = (
  domain: SettingsDomain,
  listener: SettingsChangeListener,
): (() => void) => {
  listeners[domain].add(listener)
  return () => listeners[domain].delete(listener)
}
