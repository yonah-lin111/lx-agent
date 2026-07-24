import { Navigate, Route, Routes } from "react-router-dom"
import { PAGE_ROUTES } from "@/lib/pageRoutes"
import { DesignPage } from "@/pages/DesignPage"
import { HomePage } from "@/pages/HomePage"
import { SettingsPage } from "@/pages/SettingsPage"

/**
 * 声明业务页面路由。
 */
export const PageRouter = (): React.JSX.Element => (
  <Routes>
    <Route path={PAGE_ROUTES.home} element={<HomePage />} />
    <Route path={PAGE_ROUTES.design} element={<DesignPage />} />
    <Route path={PAGE_ROUTES.settings} element={<SettingsPage />} />
    <Route path="*" element={<Navigate replace to={PAGE_ROUTES.home} />} />
  </Routes>
)
